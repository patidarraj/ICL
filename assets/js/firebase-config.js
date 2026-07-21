// Paste the config object from Firebase Console > Project Settings > General > Your apps > SDK setup.
// See README.md "Deploying with shared live data (Firebase)" for the full setup walkthrough.
export const firebaseConfig = {
  apiKey: 'AIzaSyBOONTNQtcG7ORGPJVhOM13f6IIJORiu4E',
  authDomain: 'carrom-league-7bbcf.firebaseapp.com',
  projectId: 'carrom-league-7bbcf',
  storageBucket: 'carrom-league-7bbcf.firebasestorage.app',
  messagingSenderId: '453327578563',
  appId: '1:453327578563:web:28fc608dcff43f3c30c976',
};

// Email/password of the single admin account you create in Firebase Authentication.
// The UI only ever asks for the password; this email is used behind the scenes.
export const ADMIN_EMAIL = 'raj.patidar@infytrix.com';

// Shared passcode handed to match referees to unlock the Individual Scoring tab.
// This is a light social gate (like team logo access codes), not real security —
// the liveScores collection itself stays writable client-side.
export const REFEREE_PASSCODE = 'ICL-REF-2025';
