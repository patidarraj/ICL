// Best-effort match-start reminders. This is a static, backend-less app (no server to
// push notifications when the tab/browser is fully closed), so this watches the schedule
// from inside the open tab and fires a browser Notification (or an in-app toast fallback)
// ~15 minutes before a chosen team's next match. Good enough for someone keeping the
// tournament page open on their phone/laptop during the event.
import { getFixtures, getTeams } from './storage.js';
import { notify } from './notifications.js';

const MY_TEAM_KEY = 'carrom-my-team-id';
const NOTIFIED_KEY = 'carrom-notified-matches';
const REMINDER_MINUTES = 15;
const CHECK_INTERVAL_MS = 20 * 1000;

export function getMyTeamId() {
  return localStorage.getItem(MY_TEAM_KEY) || '';
}

export function setMyTeamId(teamId) {
  if (teamId) localStorage.setItem(MY_TEAM_KEY, teamId);
  else localStorage.removeItem(MY_TEAM_KEY);
}

function getNotifiedIds() {
  try { return new Set(JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '[]')); } catch { return new Set(); }
}

function markNotified(matchId) {
  const ids = getNotifiedIds();
  ids.add(matchId);
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...ids]));
}

export function notificationsSupported() {
  return 'Notification' in window;
}

export function permissionState() {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

export async function requestPermission() {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.requestPermission();
}

/** Combines a fixture's `date` (YYYY-MM-DD) and `time` ("06:00 PM") into a Date. */
function matchDateTime(fixture) {
  const [, hh, mm, ap] = fixture.time.match(/(\d+):(\d+)\s*(AM|PM)/i) || [];
  if (!hh) return null;
  let hours = parseInt(hh, 10) % 12;
  if (/pm/i.test(ap)) hours += 12;
  const d = new Date(`${fixture.date}T00:00:00`);
  d.setHours(hours, parseInt(mm, 10), 0, 0);
  return d;
}

function fireAlert(fixture, teamsById) {
  const opponent = teamsById[fixture.teamA]?.id === getMyTeamId() ? teamsById[fixture.teamB] : teamsById[fixture.teamA];
  const title = 'Match starting soon!';
  const body = `Your match vs ${opponent?.name || 'your opponent'} starts at ${fixture.time} (${fixture.pool}).`;
  if (notificationsSupported() && Notification.permission === 'granted') {
    try { new Notification(title, { body, tag: fixture.id }); } catch { notify.info(body, title); }
  } else {
    notify.info(body, title);
  }
  markNotified(fixture.id);
}

function checkNow() {
  const myTeamId = getMyTeamId();
  if (!myTeamId) return;
  const teams = getTeams();
  const teamsById = Object.fromEntries(teams.map((t) => [t.id, t]));
  const notified = getNotifiedIds();
  const now = new Date();

  getFixtures()
    .filter((f) => f.status === 'scheduled' && (f.teamA === myTeamId || f.teamB === myTeamId) && !notified.has(f.id))
    .forEach((f) => {
      const start = matchDateTime(f);
      if (!start) return;
      const minutesUntil = (start - now) / 60000;
      if (minutesUntil <= REMINDER_MINUTES && minutesUntil > -5) fireAlert(f, teamsById);
    });
}

let watcherStarted = false;

/** Starts the periodic schedule check. Safe to call multiple times — only starts once. */
export function startMatchAlertWatcher() {
  if (watcherStarted) return;
  watcherStarted = true;
  checkNow();
  setInterval(checkNow, CHECK_INTERVAL_MS);
}
