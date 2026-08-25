// Firestore-backed persistence layer. Every visitor reads the same live data;
// only an authenticated admin can write most fields (enforced by security rules).
// Teams live in their own subcollection (one doc per team) so that a team's logo
// field can be updated by anyone with that team's access code, without opening up
// the rest of the team's data (scores, points) to non-admin writes.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js';
import {
  getFirestore, doc, collection, getDoc, getDocs, setDoc, updateDoc, writeBatch, onSnapshot, deleteField, deleteDoc, addDoc,
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
import { firebaseConfig, ADMIN_EMAIL, REFEREE_PASSCODE } from './firebase-config.js';
import { generateTeams, generateFixtures, generateSettings, recomputeStandingsForTeams, sortStandings, sha256Hex, generateLogoCode } from './utilities.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const stateRef = doc(db, 'tournaments', 'main');
const teamsColRef = collection(db, 'teams');
const liveScoresColRef = collection(db, 'liveScores');
const galleryColRef = collection(db, 'gallery');
const predictionsColRef = collection(db, 'predictions');
const REFEREE_SESSION_KEY = 'icl_referee_authed';

let cache = { teams: [], fixtures: [], settings: {}, bracket: null, liveScores: {}, gallery: [], predictions: [] };
let currentUser = null;
const changeListeners = new Set();

// Cache-then-reconcile: the very first paint on any visit (including repeat visits) can use
// yesterday's snapshot from localStorage instead of waiting on a live Firestore round-trip —
// the onSnapshot listeners below still reconcile with fresh data moments later. liveScores is
// deliberately excluded (changes too fast to be worth caching stale).
const LOCAL_CACHE_KEY = 'icl_data_cache_v1';

function loadLocalCache() {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    cache = { ...cache, ...saved };
  } catch (e) { /* corrupt or unavailable cache — ignore, live data will fill in */ }
}

function persistLocalCache() {
  try {
    const { teams, fixtures, settings, bracket, gallery } = cache;
    const payload = JSON.stringify({ teams, fixtures, settings, bracket, gallery });
    if (payload.length > 4_500_000) return; // stay safely under typical 5MB localStorage quota
    localStorage.setItem(LOCAL_CACHE_KEY, payload);
  } catch (e) { /* quota exceeded or unavailable — skip, this is a pure optimization */ }
}

loadLocalCache();

function notifyChange() {
  changeListeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
}

/** Subscribe to any remote data change (from this admin or any other viewer). Returns an unsubscribe fn. */
export function onDataChange(fn) {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

onSnapshot(stateRef, (snap) => {
  if (snap.exists()) {
    const { fixtures, settings, bracket } = snap.data();
    cache = { ...cache, fixtures, settings, bracket };
    notifyChange();
    persistLocalCache();
  }
});

onSnapshot(teamsColRef, (snap) => {
  cache = { ...cache, teams: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
  notifyChange();
  persistLocalCache();
});

onSnapshot(liveScoresColRef, (snap) => {
  const liveScores = {};
  snap.docs.forEach((d) => { liveScores[d.id] = d.data(); });
  cache = { ...cache, liveScores };
  notifyChange();
});

onSnapshot(galleryColRef, (snap) => {
  cache = { ...cache, gallery: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
  notifyChange();
  persistLocalCache();
});

onSnapshot(predictionsColRef, (snap) => {
  cache = { ...cache, predictions: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
  notifyChange();
});

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  notifyChange();
});

async function seedTeams(teams) {
  const batch = writeBatch(db);
  teams.forEach((t) => batch.set(doc(teamsColRef, t.id), t));
  await batch.commit();
}

async function clearTeams() {
  const snap = await getDocs(teamsColRef);
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

/**
 * Creates the shared tournament data once, if it doesn't exist yet. Safe to call on every load.
 * Only ever CREATES brand-new documents (never overwrites an existing tournaments/main), since
 * anonymous visitors are only allowed to create docs, not update pre-existing ones — that keeps
 * this safe to run for every visitor, not just the signed-in admin.
 */
export async function initData() {
  try {
    const [stateSnap, teamsSnap] = await Promise.all([getDoc(stateRef), getDocs(teamsColRef)]);

    if (teamsSnap.empty) {
      const teams = generateTeams();
      await seedTeams(teams);
      if (!stateSnap.exists()) {
        const fixtures = generateFixtures(teams);
        const settings = generateSettings();
        await setDoc(stateRef, { fixtures, settings, bracket: null });
        cache = { teams, fixtures, settings, bracket: null };
        return;
      }
      cache = { teams, ...stateSnap.data() };
      return;
    }

    cache = { teams: teamsSnap.docs.map((d) => ({ id: d.id, ...d.data() })), ...(stateSnap.exists() ? stateSnap.data() : {}) };
  } catch (err) {
    console.error('initData failed, app will load with whatever cached data is available', err);
  }
}

export function getTeams() { return cache.teams || []; }

/**
 * Partial, single-team update — only touches the fields passed in. Unlike saveTeams()
 * (which rewrites every team's whole document from the local cache), this can never
 * clobber another team's data with a stale read, and is safe even if this team's own
 * local cache is momentarily behind the server.
 */
export function updateTeam(teamId, fields) {
  return updateDoc(doc(teamsColRef, teamId), fields);
}

/** Admin-only: clears a team's live logo without touching anything else on the doc. */
export function removeTeamLogo(teamId) {
  return updateDoc(doc(teamsColRef, teamId), { logoBase64: deleteField() });
}

/** Upserts every team in the array and deletes any team docs no longer present. */
export async function saveTeams(teams) {
  const currentIds = new Set(getTeams().map((t) => t.id));
  const newIds = new Set(teams.map((t) => t.id));
  const batch = writeBatch(db);
  teams.forEach((t) => batch.set(doc(teamsColRef, t.id), t));
  currentIds.forEach((id) => { if (!newIds.has(id)) batch.delete(doc(teamsColRef, id)); });
  await batch.commit();
}

/**
 * Narrow, rules-friendly update touching only a team's *pending* logo — usable by
 * non-admins. The live/public `logoBase64` field is only ever set by an admin
 * approval, so an uploaded image never goes public without review.
 */
export function updateTeamLogo(teamId, logoBase64) {
  return updateDoc(doc(teamsColRef, teamId), { pendingLogoBase64: logoBase64, pendingLogoStatus: 'pending' });
}

/** Admin-only: promotes a team's pending logo to the live, publicly-shown logo. */
export function approveTeamLogo(teamId) {
  const team = getTeams().find((t) => t.id === teamId);
  return updateDoc(doc(teamsColRef, teamId), {
    logoBase64: team.pendingLogoBase64,
    pendingLogoBase64: deleteField(),
    pendingLogoStatus: deleteField(),
  });
}

/** Admin-only: discards a team's pending logo without changing the live logo. */
export function rejectTeamLogo(teamId) {
  return updateDoc(doc(teamsColRef, teamId), {
    pendingLogoBase64: deleteField(),
    pendingLogoStatus: deleteField(),
  });
}

export function getFixtures() { return cache.fixtures || []; }
export function saveFixtures(fixtures) { return updateDoc(stateRef, { fixtures }); }

/**
 * Each match's playerStats.A/B.players[].name is a snapshot copied from team.players at the
 * moment that match's live scoring session was first opened (see scoreboard.js) — it is not a
 * live reference. Fixing a typo in the team roster afterwards does NOT retroactively fix
 * already-played matches, which is exactly how "Shasank" and "Shashank" end up as two separate
 * entries in the Statistics player leaderboard (it groups by name). This walks every one of a
 * team's matches and renames any of `oldNames` to `correctName`, so historical stats merge back
 * into one player.
 */
export function distinctPlayerNamesForTeam(teamId) {
  const counts = {};
  getFixtures().forEach((f) => {
    if (f.teamA !== teamId && f.teamB !== teamId) return;
    const side = f.teamA === teamId ? 'A' : 'B';
    (f.playerStats?.[side]?.players || []).forEach((p) => { counts[p.name] = (counts[p.name] || 0) + 1; });
  });
  return Object.entries(counts).map(([name, matches]) => ({ name, matches })).sort((a, b) => b.matches - a.matches);
}
export async function mergePlayerNameInFixtures(teamId, oldNames, correctName) {
  const fixtures = getFixtures().map((f) => {
    if (f.teamA !== teamId && f.teamB !== teamId) return f;
    const side = f.teamA === teamId ? 'A' : 'B';
    if (!f.playerStats?.[side]?.players) return f;
    const players = f.playerStats[side].players.map((p) => (oldNames.includes(p.name) ? { ...p, name: correctName } : p));
    return { ...f, playerStats: { ...f.playerStats, [side]: { ...f.playerStats[side], players } } };
  });
  await saveFixtures(fixtures);
}

// Predictions: one doc per (match, voting team), doc id `${matchId}_${voterTeamId}` so a
// second vote from the same team on the same match simply overwrites the first — that upsert
// behavior is what actually enforces "one vote per team per match", not app-side logic.
export function getPredictions() { return cache.predictions || []; }
export function getMatchPredictions(matchId) { return getPredictions().filter((p) => p.matchId === matchId); }
export function getMyPrediction(matchId, voterTeamId) {
  return getPredictions().find((p) => p.matchId === matchId && p.voterTeamId === voterTeamId) || null;
}
export function submitPrediction(matchId, voterTeamId, votedForTeamId) {
  return setDoc(doc(predictionsColRef, `${matchId}_${voterTeamId}`), {
    matchId, voterTeamId, votedForTeamId, at: new Date().toISOString(),
  });
}

export function getSettings() { return cache.settings || {}; }
export function saveSettings(settings) { return updateDoc(stateRef, { settings }); }

export function getSwapLog() { return getSettings().swapLog || []; }
export function logTeamSwap(entry) {
  const settings = getSettings();
  return saveSettings({ ...settings, swapLog: [...(settings.swapLog || []), entry] });
}

export function getBracket() { return cache.bracket || null; }
export function saveBracket(bracket) { return updateDoc(stateRef, { bracket }); }

export function isAdminAuthed() { return currentUser !== null; }
export function getAdminEmail() { return currentUser?.email || null; }

// Photos are stored as base64 directly on their own Firestore doc — same trick as team
// logos — rather than Firebase Storage, since Storage now requires the paid Blaze plan
// even at zero usage. Firestore's Spark (free) plan caps total stored data at 1 GiB;
// GALLERY_SAFE_BUDGET_BYTES leaves headroom under that for the rest of the app's data
// and stops new uploads before the project could ever hit the real Firestore ceiling.
export const GALLERY_SAFE_BUDGET_BYTES = 900 * 1024 * 1024;
export const GALLERY_WARN_BUDGET_BYTES = 750 * 1024 * 1024;

export function getGalleryPhotos() { return cache.gallery || []; }

function estimatedByteLength(dataUrl) { return Math.round((dataUrl || '').length * 0.75); }

/** Sum of every stored photo's encoded size (pending + approved both occupy real Firestore storage). */
export function getGalleryUsageBytes() {
  return getGalleryPhotos().reduce((sum, p) => sum + estimatedByteLength(p.photoBase64), 0);
}

export function submitGalleryPhoto({ photoBase64, submittedBy, caption }) {
  return addDoc(galleryColRef, {
    photoBase64, submittedBy: submittedBy || '', caption: caption || '', status: 'pending', createdAt: Date.now(),
  });
}

export function approveGalleryPhoto(photoId) {
  return updateDoc(doc(galleryColRef, photoId), { status: 'approved' });
}

export function rejectGalleryPhoto(photoId) {
  return deleteDoc(doc(galleryColRef, photoId));
}

export async function loginAdmin(password) {
  await signInWithEmailAndPassword(auth, ADMIN_EMAIL, password);
}

export async function logoutAdmin() {
  await signOut(auth);
}

/**
 * Recompute + persist standings after any fixture result change. Writes only the
 * standings fields (played/won/lost/drawn/points/scoreFor/scoreAgainst/h2h) via a
 * batch of partial updates — NOT saveTeams()'s full-document overwrite. Every team
 * doc also carries its full logo image (100s of KB each); rewriting all 25 of those
 * together on every single match confirmation was pushing the batch over Firestore's
 * write-size limit and silently failing the whole commit once every team had a logo.
 */
export async function refreshStandings() {
  const teams = getTeams();
  const fixtures = getFixtures();
  const updated = sortStandings(recomputeStandingsForTeams(teams, fixtures));
  const batch = writeBatch(db);
  updated.forEach((t) => {
    batch.update(doc(teamsColRef, t.id), {
      played: t.played, won: t.won, lost: t.lost, drawn: t.drawn,
      points: t.points, scoreFor: t.scoreFor, scoreAgainst: t.scoreAgainst, nrr: t.nrr, h2h: t.h2h,
    });
  });
  await batch.commit();
  return updated;
}

// --- Referee access (light social gate, same tier as team logo access codes) ---
// Only a SHA-256 hash of the passcode is ever stored in `settings` — that document has
// `allow read: if true` in Firestore rules (every visitor's client loads it), so storing
// the plaintext there would hand the code to anyone opening the browser's Network/Console
// tab, without even needing to try logging in. The hash can't be reversed back into the
// original code just by reading it.
export function isRefereeAuthed() { return sessionStorage.getItem(REFEREE_SESSION_KEY) === '1'; }

let defaultPasscodeHash = null;
async function getRefereePasscodeHash() {
  if (getSettings().refereePasscodeHash) return getSettings().refereePasscodeHash;
  if (!defaultPasscodeHash) defaultPasscodeHash = await sha256Hex(REFEREE_PASSCODE);
  return defaultPasscodeHash;
}

export async function loginReferee(passcode) {
  const hash = await sha256Hex(passcode);
  if (hash !== await getRefereePasscodeHash()) return false;
  sessionStorage.setItem(REFEREE_SESSION_KEY, '1');
  return true;
}

export function logoutReferee() { sessionStorage.removeItem(REFEREE_SESSION_KEY); }

/** Admin-only: generates a new passcode, stores only its hash, and returns the plaintext
 *  once so the admin can copy it down — it can never be read back after this. */
export async function regenerateRefereePasscode() {
  const passcode = generateLogoCode(8);
  const refereePasscodeHash = await sha256Hex(passcode);
  // saveSettings() replaces the whole `settings` map in one write, so dropping the old
  // plaintext `refereePasscode` key just means leaving it out of this new object entirely
  // (a nested deleteField() sentinel isn't valid inside a wholesale map replacement).
  const { refereePasscode, ...rest } = getSettings();
  await saveSettings({ ...rest, refereePasscodeHash });
  return passcode;
}

// --- Live scoring (per-match scratch scorecard, referee-writable, admin confirms into fixtures) ---
export function getLiveScores() { return cache.liveScores || {}; }
export function getLiveScore(matchId) { return cache.liveScores?.[matchId] || null; }

/** Referees write freely here; nothing here is official until an admin confirms it into the fixture. */
export function saveLiveScore(matchId, data) {
  return setDoc(doc(liveScoresColRef, matchId), data, { merge: true });
}

/** Admin-only: clears the scratch scorecard once its result has been confirmed into the fixture. */
export function deleteLiveScore(matchId) {
  return deleteDoc(doc(liveScoresColRef, matchId));
}

export async function resetTournament() {
  const teams = generateTeams();
  const fixtures = generateFixtures(teams);
  const settings = generateSettings();
  await clearTeams();
  await seedTeams(teams);
  await setDoc(stateRef, { fixtures, settings, bracket: null });
}

export function exportBackup() {
  return JSON.stringify({ ...cache, exportedAt: new Date().toISOString() }, null, 2);
}

export async function restoreBackup(json) {
  const data = JSON.parse(json);
  if (!data.teams || !data.fixtures || !data.settings) throw new Error('Invalid backup file');
  await clearTeams();
  await seedTeams(data.teams);
  await setDoc(stateRef, {
    fixtures: data.fixtures, settings: data.settings, bracket: data.bracket || null,
  });
}
