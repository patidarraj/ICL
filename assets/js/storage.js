// Firestore-backed persistence layer. Every visitor reads the same live data;
// only an authenticated admin can write most fields (enforced by security rules).
// Teams live in their own subcollection (one doc per team) so that a team's logo
// field can be updated by anyone with that team's access code, without opening up
// the rest of the team's data (scores, points) to non-admin writes.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js';
import {
  getFirestore, doc, collection, getDoc, getDocs, setDoc, updateDoc, writeBatch, onSnapshot,
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
import { firebaseConfig, ADMIN_EMAIL } from './firebase-config.js';
import { generateTeams, generateFixtures, generateSettings, recomputeStandingsForTeams, sortStandings } from './utilities.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const stateRef = doc(db, 'tournaments', 'main');
const teamsColRef = collection(db, 'teams');

let cache = { teams: [], fixtures: [], settings: {}, bracket: null };
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

/** Creates the shared tournament data once, if it doesn't exist yet. Safe to call on every load. */
export async function initData() {
  const [stateSnap, teamsSnap] = await Promise.all([getDoc(stateRef), getDocs(teamsColRef)]);
  if (!stateSnap.exists() || teamsSnap.empty) {
    const teams = generateTeams();
    const fixtures = generateFixtures(teams);
    const settings = generateSettings();
    await setDoc(stateRef, { fixtures, settings, bracket: null });
    await seedTeams(teams);
    cache = { teams, fixtures, settings, bracket: null };
  } else {
    cache = { teams: teamsSnap.docs.map((d) => ({ id: d.id, ...d.data() })), ...stateSnap.data() };
  }
}

export function getTeams() { return cache.teams || []; }

/** Upserts every team in the array and deletes any team docs no longer present. */
export async function saveTeams(teams) {
  const currentIds = new Set(getTeams().map((t) => t.id));
  const newIds = new Set(teams.map((t) => t.id));
  const batch = writeBatch(db);
  teams.forEach((t) => batch.set(doc(teamsColRef, t.id), t));
  currentIds.forEach((id) => { if (!newIds.has(id)) batch.delete(doc(teamsColRef, id)); });
  await batch.commit();
}

/** Narrow, rules-friendly update touching only a team's logo — usable by non-admins. */
export function updateTeamLogo(teamId, logoBase64) {
  return updateDoc(doc(teamsColRef, teamId), { logoBase64 });
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
