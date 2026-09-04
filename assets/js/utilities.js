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

function to24Hour(timeStr) {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec((timeStr || '').trim());
  if (!m) return timeStr || '';
  let h = Number(m[1]) % 12;
  if (/PM/i.test(m[3])) h += 12;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/** Sorts fixtures by actual date+time — match IDs/array order don't track this after a reschedule. */
export function sortByDateTime(fixtures) {
  return [...fixtures].sort((a, b) => `${a.date} ${to24Hour(a.time)}`.localeCompare(`${b.date} ${to24Hour(b.time)}`));
}

/**
 * A player's net scoring contribution: coins pocketed (points) minus due coins owed and fouls
 * committed — both dues and fouls count against the team, not toward it, per the rulebook's
 * penalty scenarios (a due/foul adds a coin back to the board rather than scoring one). Floored
 * at 0 so one player's penalties can't drag a teammate's real points negative.
 */
export function netPlayerPoints(p) {
  return Math.max(0, (p.points || 0) - (p.dues || 0) - (p.fouls || 0));
}

/** A team's official match score — the sum of each player's net points (see netPlayerPoints). */
export function teamNetScore(players) {
  return (players || []).reduce((s, p) => s + netPlayerPoints(p), 0);
}

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

/**
 * One-way SHA-256 hash (hex), used so secrets like the referee passcode never sit in
 * plaintext inside a publicly-readable Firestore document — only this hash does, and it
 * can't be reversed back into the original code by anyone reading it off the network/console.
 */
export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
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
  const name = (team?.name || '').replace(/"/g, '&quot;');
  if (team && team.logoBase64) {
    return `<img src="${team.logoBase64}" alt="" class="${sizeClass} team-logo-zoomable" tabindex="0" data-team-name="${name}" data-team-logo="${team.logoBase64}">`;
  }
  const seed = hashSeed(team?.id || 'x');
  const scrambled = (seed * 2654435761) >>> 0; // Knuth multiplicative hash, decorrelates near-sequential ids
  const icon = PLACEHOLDER_ICONS[seed % PLACEHOLDER_ICONS.length];
  const color = PLACEHOLDER_COLORS[scrambled % PLACEHOLDER_COLORS.length];
  return `<span class="${sizeClass} team-logo-placeholder team-logo-zoomable" tabindex="0" data-team-name="${name}" data-team-icon="${icon}" data-team-color="${color}" style="color:${color};border-color:${color}40;"><i class="fa-solid ${icon}"></i></span>`;
}

/**
 * Fixed pool draw: pools are simply PLAYER_PAIRS taken 5-at-a-time in the exact order
 * given — Pool A = pairs 1-5, Pool B = pairs 6-10, and so on. No shuffling, so the pools
 * and schedule are identical and predictable every time the tournament is reset.
 */
export function generateTeams() {
  return PLAYER_PAIRS.map(([p1, p2], i) => ({
    id: `T${pad(i + 1, 2)}`,
    name: `${TEAM_ADJECTIVES[i % TEAM_ADJECTIVES.length]} ${i + 1}`,
    players: [p1, p2],
    pool: POOL_NAMES[Math.floor(i / TEAMS_PER_POOL)],
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
    tournamentName: 'Infytrix Carrom League Season 3',
    organizer: 'Infytrix Carrom Association',
    venue: VENUE,
    status: 'Upcoming',
    startDate: isoDate(tournamentStartDate()),
  };
}

export function recomputeStandingsForTeams(teams, fixtures) {
  const reset = teams.map((t) => ({
    ...t, played: 0, won: 0, lost: 0, drawn: 0, points: 0, scoreFor: 0, scoreAgainst: 0, nrr: 0, h2h: {},
  }));
  const byId = Object.fromEntries(reset.map((t) => [t.id, t]));

  fixtures.filter((f) => f.status === 'completed' && f.stage === 'pool').forEach((f) => {
    const a = byId[f.teamA];
    const b = byId[f.teamB];
    if (!a || !b) return;
    a.played++; b.played++;
    a.scoreFor += f.scoreA; a.scoreAgainst += f.scoreB;
    b.scoreFor += f.scoreB; b.scoreAgainst += f.scoreA;
    // NRR is one-sided, per the rulebook: only the winner (or, in a draw, the team with
    // fewer coins) earns it for that match — the other side is always 0, never negative.
    if (f.nrrLeaderTeamId === a.id) a.nrr += (f.nrrMargin || 0);
    else if (f.nrrLeaderTeamId === b.id) b.nrr += (f.nrrMargin || 0);
    if (f.winner === f.teamA) { a.won++; b.lost++; a.points += 2; a.h2h[b.id] = 'win'; b.h2h[a.id] = 'loss'; }
    else if (f.winner === f.teamB) { b.won++; a.lost++; b.points += 2; b.h2h[a.id] = 'win'; a.h2h[b.id] = 'loss'; }
    else if (f.winner === 'draw') { a.drawn++; b.drawn++; a.points += 1; b.points += 1; a.h2h[b.id] = 'draw'; b.h2h[a.id] = 'draw'; }
  });

  return reset;
}

export function sortStandings(teams) {
  return [...teams].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const nd = (b.nrr || 0) - (a.nrr || 0);
    if (nd === 0) {
      const h2h = a.h2h?.[b.id];
      if (h2h === 'win') return -1;
      if (h2h === 'loss') return 1;
    }
    if (nd !== 0) return nd;
    return b.scoreFor - a.scoreFor;
  });
}

/**
 * Achievement badges — entirely derived from existing teams/fixtures data, no new storage.
 * Recomputed on every render, so they always reflect the latest results with zero extra writes.
 */
export function computeTeamBadges(teams, fixtures) {
  const badges = {};
  const add = (teamId, badge) => { (badges[teamId] = badges[teamId] || []).push(badge); };
  const topTeamId = sortStandings(teams)[0]?.id;

  teams.forEach((team) => {
    const completed = sortByDateTime(fixtures.filter((f) => f.status === 'completed' && (f.teamA === team.id || f.teamB === team.id)));
    if (!completed.length) return;

    if (team.played >= 2 && team.lost === 0) {
      add(team.id, { code: 'unbeaten', icon: 'fa-shield-heart', label: 'Unbeaten', desc: `Unbeaten across ${team.played} matches` });
    }

    let streak = 0;
    let best = 0;
    completed.forEach((f) => {
      const won = f.winner === team.id;
      streak = won ? streak + 1 : 0;
      best = Math.max(best, streak);
    });
    if (best >= 3) {
      add(team.id, { code: 'streak', icon: 'fa-fire', label: `${best}-Win Streak`, desc: `Won ${best} matches in a row` });
    }

    if ((team.scoreFor || 0) >= 100) {
      add(team.id, { code: 'century', icon: 'fa-champagne-glasses', label: 'Century Club', desc: `${team.scoreFor} total points scored` });
    }

    if (team.id !== topTeamId && topTeamId) {
      const beatLeader = completed.some((f) => f.winner === team.id && (f.teamA === topTeamId || f.teamB === topTeamId));
      if (beatLeader) add(team.id, { code: 'giant-killer', icon: 'fa-hand-fist', label: 'Giant Killer', desc: 'Beat the team currently on top of the leaderboard' });
    }
  });

  // Rank-based badges: cleanest play and most Queens taken, awarded to the #1 team(s) only.
  const foulStats = teams.map((team) => {
    const completed = fixtures.filter((f) => f.status === 'completed' && (f.teamA === team.id || f.teamB === team.id));
    if (!completed.length) return null;
    const side = (f) => (f.teamA === team.id ? 'A' : 'B');
    const fouls = completed.reduce((s, f) => s + (f.playerStats?.[side(f)]?.players || []).reduce((s2, p) => s2 + (p.fouls || 0), 0), 0);
    return { teamId: team.id, avgFouls: fouls / completed.length };
  }).filter(Boolean);
  if (foulStats.length) {
    const minAvg = Math.min(...foulStats.map((s) => s.avgFouls));
    foulStats.filter((s) => s.avgFouls === minAvg).forEach((s) => add(s.teamId, { code: 'iron-wall', icon: 'fa-shield-halved', label: 'Iron Wall', desc: `Fewest fouls per match (avg ${minAvg.toFixed(1)})` }));
  }

  const queenStats = teams.map((team) => {
    const count = fixtures.filter((f) => f.status === 'completed' && f.queenTakenBy
      && ((f.teamA === team.id && f.queenTakenBy.startsWith('A')) || (f.teamB === team.id && f.queenTakenBy.startsWith('B')))).length;
    return { teamId: team.id, count };
  }).filter((s) => s.count > 0);
  if (queenStats.length) {
    const maxCount = Math.max(...queenStats.map((s) => s.count));
    queenStats.filter((s) => s.count === maxCount).forEach((s) => add(s.teamId, { code: 'queen-collector', icon: 'fa-crown', label: 'Queen Collector', desc: `Took the Queen ${maxCount} time${maxCount === 1 ? '' : 's'}` }));
  }

  return badges;
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
