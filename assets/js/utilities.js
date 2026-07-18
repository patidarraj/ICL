// Shared utility & data-generation helpers used across the app.
import { firebaseConfig } from './firebase-config.js';

export const FIRST_NAMES = [
  'Arjun','Rohan','Vikram','Karan','Aditya','Suresh','Ramesh','Nikhil','Sanjay','Manoj',
  'Rahul','Deepak','Ashok','Anil','Vijay','Sandeep','Amit','Rajesh','Vinod','Prakash',
  'Gaurav','Naveen','Harish','Mahesh','Yogesh','Dinesh','Kunal','Tarun','Vivek','Ankit',
  'Siddharth','Pranav','Abhishek','Rakesh','Sunil','Manish','Ravi','Kiran','Sameer','Yash',
  'Aakash','Ishaan','Rohit','Varun','Nitin','Alok','Sachin','Gopal','Shyam','Mohan'
];

export const TEAM_ADJECTIVES = [
  'Thunder','Blaze','Titans','Strikers','Warriors','Falcons','Panthers','Eagles','Sharks','Wolves',
  'Cobras','Vipers','Knights','Rangers','Raptors','Spartans','Gladiators','Phoenix','Storm','Legends',
  'Rebels','Hunters','Vikings','Dragons','Bulls'
];

export const POOL_NAMES = ['Pool A', 'Pool B', 'Pool C', 'Pool D', 'Pool E'];
export const TEAMS_PER_POOL = 5;
export const TOTAL_TEAMS = 25;
export const MATCHES_PER_DAY = 2;
export const VENUE = 'Carrom Championship Arena';
export const MATCH_TIMES = ['10:00 AM', '4:00 PM'];

export function pad(n, len = 2) {
  return String(n).padStart(len, '0');
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function formatDate(d) {
  const date = new Date(d);
  return date.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

export function isoDate(d) {
  const date = new Date(d);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dayName(d) {
  return new Date(d).toLocaleDateString('en-US', { weekday: 'long' });
}

export function isWeekday(d) {
  const day = new Date(d).getDay();
  return day >= 1 && day <= 5;
}

export function addDays(d, n) {
  const date = new Date(d);
  date.setDate(date.getDate() + n);
  return date;
}

export function nextWeekday(d) {
  let date = new Date(d);
  while (!isWeekday(date)) date = addDays(date, 1);
  return date;
}

export function tournamentStartDate() {
  const now = new Date();
  let year = now.getFullYear();
  let start = new Date(year, 6, 27); // July 27
  if (start < now && (now - start) / 86400000 > 200) start = new Date(year + 1, 6, 27);
  return nextWeekday(start);
}

/** Round-robin schedule generator for a single pool (circle method). Returns array of [teamIndexA, teamIndexB]. */
export function roundRobinPairs(teamIds) {
  const ids = [...teamIds];
  if (ids.length % 2 !== 0) ids.push(null);
  const n = ids.length;
  const rounds = n - 1;
  const half = n / 2;
  const pairs = [];
  let arr = [...ids];
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < half; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a !== null && b !== null) pairs.push([a, b]);
    }
    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop());
    arr = [fixed, ...rest];
  }
  return pairs;
}

const LOGO_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I/L

export function generateLogoCode(len = 6) {
  let code = '';
  for (let i = 0; i < len; i++) code += LOGO_CODE_CHARS[Math.floor(Math.random() * LOGO_CODE_CHARS.length)];
  return code;
}

/** Deterministic public URL for a team's uploaded logo (no Firestore field needed). */
export function teamLogoUrl(teamId) {
  const bucket = firebaseConfig.storageBucket;
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o/team-logos%2F${encodeURIComponent(teamId)}?alt=media`;
}

export function generateTeams() {
  const teams = [];
  let nameIdx = 0;
  for (let i = 1; i <= TOTAL_TEAMS; i++) {
    const poolIndex = Math.floor((i - 1) / TEAMS_PER_POOL);
    const p1 = FIRST_NAMES[nameIdx % FIRST_NAMES.length]; nameIdx++;
    const p2 = FIRST_NAMES[nameIdx % FIRST_NAMES.length]; nameIdx++;
    teams.push({
      id: `T${pad(i, 2)}`,
      name: `${TEAM_ADJECTIVES[(i - 1) % TEAM_ADJECTIVES.length]} ${i}`,
      players: [p1, p2],
      pool: POOL_NAMES[poolIndex],
      played: 0,
      won: 0,
      lost: 0,
      points: 0,
      scoreFor: 0,
      scoreAgainst: 0,
      logoCode: generateLogoCode(),
    });
  }
  return teams;
}

export function generateFixtures(teams) {
  const fixtures = [];
  let matchNum = 1;
  const poolMatchLists = [];

  POOL_NAMES.forEach((poolName) => {
    const poolTeams = teams.filter((t) => t.pool === poolName).map((t) => t.id);
    const pairs = roundRobinPairs(poolTeams);
    poolMatchLists.push(pairs.map((pair) => ({ pool: poolName, pair })));
  });

  // Interleave pools so schedule feels balanced across days, 2 matches/day.
  const allPoolMatches = [];
  let maxLen = Math.max(...poolMatchLists.map((l) => l.length));
  for (let round = 0; round < maxLen; round++) {
    poolMatchLists.forEach((list) => {
      if (list[round]) allPoolMatches.push(list[round]);
    });
  }

  let currentDate = tournamentStartDate();
  let slotInDay = 0;

  allPoolMatches.forEach((m) => {
    if (slotInDay >= MATCHES_PER_DAY) {
      currentDate = nextWeekday(addDays(currentDate, 1));
      slotInDay = 0;
    }
    fixtures.push({
      id: `M${pad(matchNum, 3)}`,
      matchNumber: matchNum,
      stage: 'pool',
      pool: m.pool,
      date: isoDate(currentDate),
      day: dayName(currentDate),
      time: MATCH_TIMES[slotInDay],
      venue: VENUE,
      teamA: m.pair[0],
      teamB: m.pair[1],
      scoreA: null,
      scoreB: null,
      status: 'scheduled', // scheduled | completed
      winner: null,
    });
    matchNum++;
    slotInDay++;
  });

  return fixtures;
}

export function generateSettings() {
  return {
    tournamentName: 'Carrom Doubles Championship 2026',
    organizer: 'City Carrom Association',
    venue: VENUE,
    status: 'Upcoming',
    startDate: isoDate(tournamentStartDate()),
    adminPasswordHash: hashString('admin123'),
  };
}

export function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return String(hash);
}

export function recomputeStandingsForTeams(teams, fixtures) {
  const reset = teams.map((t) => ({
    ...t, played: 0, won: 0, lost: 0, points: 0, scoreFor: 0, scoreAgainst: 0,
  }));
  const byId = Object.fromEntries(reset.map((t) => [t.id, t]));

  fixtures.filter((f) => f.status === 'completed' && f.stage === 'pool').forEach((f) => {
    const a = byId[f.teamA];
    const b = byId[f.teamB];
    if (!a || !b) return;
    a.played++; b.played++;
    a.scoreFor += f.scoreA; a.scoreAgainst += f.scoreB;
    b.scoreFor += f.scoreB; b.scoreAgainst += f.scoreA;
    if (f.winner === f.teamA) { a.won++; b.lost++; a.points += 2; }
    else if (f.winner === f.teamB) { b.won++; a.lost++; b.points += 2; }
  });

  return reset;
}

export function netDifference(team) {
  return team.scoreFor - team.scoreAgainst;
}

export function sortStandings(teams) {
  return [...teams].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const nd = netDifference(b) - netDifference(a);
    if (nd !== 0) return nd;
    return b.scoreFor - a.scoreFor;
  });
}

export function debounce(fn, wait = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function downloadFile(filename, content, mime = 'application/json') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function toCSV(rows, headers) {
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(',')];
  rows.forEach((r) => lines.push(headers.map((h) => escape(r[h])).join(',')));
  return lines.join('\n');
}
