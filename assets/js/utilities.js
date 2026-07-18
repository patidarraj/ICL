// Shared utility & data-generation helpers used across the app.

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
export const MATCH_TIMES = ['06:00 PM', '06:30 PM'];

/**
 * Fixed real player roster, one pair per team. Indices 0, 1, 8, 10 (Aditya, Esha,
 * Shubham/Tejas Hiwarde, Ankit/Megan) are treated as priority teams by generateTeams() —
 * their pool draw guarantees they finish their round-robin matches a round earlier
 * than everyone else, without skipping the tournament's opening rounds.
 */
export const PLAYER_PAIRS = [
  ['Aditya', 'Sayli'],
  ['Esha', 'Ruchi'],
  ['Hemali', 'Nitish'],
  ['Ashish', 'Shreyas'],
  ['Animesh', 'Sudarshan'],
  ['Om W', 'Riya'],
  ['Pratham', 'Monika'],
  ['Suresh', 'Jayshree'],
  ['Shubham', 'Tejas Hiwarde'],
  ['Vinay', 'Soniya'],
  ['Ankit', 'Megan'],
  ['Pramithashree', 'Sahil'],
  ['Awadhesh', 'Disha'],
  ['Darshan', 'Suryamani'],
  ['Prasad', 'Siddhi'],
  ['Mayur', 'Tejas Wani'],
  ['Nilesh', 'Hetvi'],
  ['Satyam', 'Aman'],
  ['Alisha', 'Harshita'],
  ['Mahi', 'Swapnil'],
  ['Yash', 'Mehek'],
  ['Shasank', 'Raj'],
  ['Nitin', 'Harsh'],
  ['Harshal', 'Vaibhav'],
  ['Manish', 'Kishan'],
];

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

const PLACEHOLDER_ICONS = [
  'fa-shield-halved', 'fa-chess-rook', 'fa-bolt', 'fa-fire', 'fa-star',
  'fa-crown', 'fa-dragon', 'fa-paw', 'fa-feather-pointed', 'fa-gem',
];
const PLACEHOLDER_COLORS = [
  '#3B82F6', '#22C55E', '#EF4444', '#FACC15', '#A855F7',
  '#06B6D4', '#F97316', '#EC4899', '#10B981', '#6366F1',
];

function hashSeed(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return hash;
}

/**
 * Renders a team's logo (a small base64 data URL stored on the team) once uploaded.
 * Until then, shows a distinct icon/color placeholder derived from the team id, so a
 * gallery of all teams looks varied rather than 25 identical grey badges — as soon as
 * a team uploads a real logo, this swaps to it automatically everywhere it's rendered.
 */
export function teamLogoHtml(team, sizeClass = 'team-logo') {
  if (team && team.logoBase64) {
    return `<img src="${team.logoBase64}" alt="" class="${sizeClass}">`;
  }
  const seed = hashSeed(team?.id || 'x');
  const scrambled = (seed * 2654435761) >>> 0; // Knuth multiplicative hash, decorrelates near-sequential ids
  const icon = PLACEHOLDER_ICONS[seed % PLACEHOLDER_ICONS.length];
  const color = PLACEHOLDER_COLORS[scrambled % PLACEHOLDER_COLORS.length];
  return `<span class="${sizeClass} team-logo-placeholder" style="color:${color};border-color:${color}40;"><i class="fa-solid ${icon}"></i></span>`;
}

const PRIORITY_PAIR_INDEXES = new Set([0, 1, 8, 10]); // Aditya, Esha, Shubham/Tejas Hiwarde, Ankit/Megan

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Random pool draw. Priority teams (see PLAYER_PAIRS) are each dropped into a different,
 * randomly-chosen pool, then placed at that pool's "index 2" slot before the round-robin
 * schedule is generated — in our circle-method implementation that slot always draws the
 * final round's bye, so the team's 4 real matches land in rounds 1-4 and it finishes one
 * round earlier than the rest of its pool. Everyone else is shuffled in randomly around them,
 * and since every pool still plays its round 1 in the tournament's opening days, no team is
 * left waiting idle at the start just because a priority team is finishing early.
 */
export function generateTeams() {
  const draft = PLAYER_PAIRS.map(([p1, p2], idx) => ({
    players: [p1, p2],
    priority: PRIORITY_PAIR_INDEXES.has(idx),
  }));

  const priorityTeams = draft.filter((t) => t.priority);
  const otherTeams = shuffle(draft.filter((t) => !t.priority));
  const priorityPools = shuffle([...POOL_NAMES]).slice(0, priorityTeams.length);

  const pools = Object.fromEntries(POOL_NAMES.map((p) => [p, []]));
  priorityTeams.forEach((team, i) => { pools[priorityPools[i]].push(team); });
  otherTeams.forEach((team) => {
    const pool = POOL_NAMES.find((p) => pools[p].length < TEAMS_PER_POOL);
    pools[pool].push(team);
  });

  const orderedDraft = [];
  POOL_NAMES.forEach((poolName) => {
    const poolTeams = pools[poolName];
    const priorityPos = poolTeams.findIndex((t) => t.priority);
    if (priorityPos !== -1 && priorityPos !== 2) {
      [poolTeams[2], poolTeams[priorityPos]] = [poolTeams[priorityPos], poolTeams[2]];
    }
    poolTeams.forEach((t) => orderedDraft.push({ ...t, pool: poolName }));
  });

  return orderedDraft.map((t, i) => ({
    id: `T${pad(i + 1, 2)}`,
    name: `${TEAM_ADJECTIVES[i % TEAM_ADJECTIVES.length]} ${i + 1}`,
    players: t.players,
    pool: t.pool,
    played: 0,
    won: 0,
    lost: 0,
    points: 0,
    scoreFor: 0,
    scoreAgainst: 0,
    logoCode: generateLogoCode(),
  }));
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
