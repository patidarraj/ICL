// Firestore-backed persistence layer. Every visitor reads the same live document;
// only an authenticated admin can write (enforced by Firestore security rules).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot,
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
import {
  getStorage, ref, uploadBytes,
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-storage.js';
import { firebaseConfig, ADMIN_EMAIL } from './firebase-config.js';
import { generateTeams, generateFixtures, generateSettings, recomputeStandingsForTeams, sortStandings } from './utilities.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const fileStorage = getStorage(app);
const stateRef = doc(db, 'tournaments', 'main');

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
    cache = snap.data();
    notifyChange();
  }
});

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  notifyChange();
});

/** Creates the shared tournament document once, if it doesn't exist yet. Safe to call on every load. */
export async function initData() {
  const snap = await getDoc(stateRef);
  if (!snap.exists()) {
    const teams = generateTeams();
    const fixtures = generateFixtures(teams);
    const settings = generateSettings();
    const initial = { teams, fixtures, settings, bracket: null };
    await setDoc(stateRef, initial);
    cache = initial;
  } else {
    cache = snap.data();
  }
}

export function getTeams() { return cache.teams || []; }
export function saveTeams(teams) { return updateDoc(stateRef, { teams }); }

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
  await setDoc(stateRef, { teams, fixtures, settings, bracket: null });
}

export function exportBackup() {
  return JSON.stringify({ ...cache, exportedAt: new Date().toISOString() }, null, 2);
}

export async function restoreBackup(json) {
  const data = JSON.parse(json);
  if (!data.teams || !data.fixtures || !data.settings) throw new Error('Invalid backup file');
  await setDoc(stateRef, {
    teams: data.teams, fixtures: data.fixtures, settings: data.settings, bracket: data.bracket || null,
  });
}

/**
 * Uploads a team's logo image to Firebase Storage. Storage security rules verify `code`
 * against that team's `logoCode` in Firestore, so anyone with the right code can upload —
 * admins bypass the code check entirely since they're authenticated.
 */
export async function uploadTeamLogo(teamId, file, code) {
  const storageRef = ref(fileStorage, `team-logos/${teamId}`);
  await uploadBytes(storageRef, file, {
    contentType: file.type,
    cacheControl: 'public, max-age=300',
    customMetadata: { code: code || '' },
  });
}
