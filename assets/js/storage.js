// Firestore-backed persistence layer. Every visitor reads the same live data;
// only an authenticated admin can write most fields (enforced by security rules).
// Teams live in their own subcollection (one doc per team) so that a team's logo
// field can be updated by anyone with that team's access code, without opening up
// the rest of the team's data (scores, points) to non-admin writes.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js';
import {
  getFirestore, doc, collection, getDoc, getDocs, setDoc, updateDoc, writeBatch, onSnapshot, deleteField, deleteDoc,
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
import { firebaseConfig, ADMIN_EMAIL, REFEREE_PASSCODE } from './firebase-config.js';
import { generateTeams, generateFixtures, generateSettings, recomputeStandingsForTeams, sortStandings } from './utilities.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const stateRef = doc(db, 'tournaments', 'main');
const teamsColRef = collection(db, 'teams');
const liveScoresColRef = collection(db, 'liveScores');
const REFEREE_SESSION_KEY = 'icl_referee_authed';

let cache = { teams: [], fixtures: [], settings: {}, bracket: null, liveScores: {} };
let currentUser = null;
const changeListeners = new Set();

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
  }
});

onSnapshot(teamsColRef, (snap) => {
  cache = { ...cache, teams: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
  notifyChange();
});

onSnapshot(liveScoresColRef, (snap) => {
  const liveScores = {};
  snap.docs.forEach((d) => { liveScores[d.id] = d.data(); });
  cache = { ...cache, liveScores };
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

export function getSettings() { return cache.settings || {}; }
export function saveSettings(settings) { return updateDoc(stateRef, { settings }); }

export function getBracket() { return cache.bracket || null; }
export function saveBracket(bracket) { return updateDoc(stateRef, { bracket }); }

export function isAdminAuthed() { return currentUser !== null; }

export async function loginAdmin(password) {
  await signInWithEmailAndPassword(auth, ADMIN_EMAIL, password);
}

export async function logoutAdmin() {
  await signOut(auth);
}

/** Recompute + persist standings after any fixture result change. */
export async function refreshStandings() {
  const teams = getTeams();
  const fixtures = getFixtures();
  const updated = sortStandings(recomputeStandingsForTeams(teams, fixtures));
  await saveTeams(updated);
  return updated;
}

// --- Referee access (light social gate, same tier as team logo access codes) ---
export function isRefereeAuthed() { return sessionStorage.getItem(REFEREE_SESSION_KEY) === '1'; }

export function loginReferee(passcode) {
  if (passcode !== REFEREE_PASSCODE) return false;
  sessionStorage.setItem(REFEREE_SESSION_KEY, '1');
  return true;
}

export function logoutReferee() { sessionStorage.removeItem(REFEREE_SESSION_KEY); }

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
