// Sticky "My Team" bar: pinned under the top navbar on every page once a visitor has picked
// their team (reuses the same localStorage-backed myTeamId as the Dashboard's match-alert
// picker — see match-alerts.js), so they don't have to dig through Schedule/Standings to see
// their next match, pool position, or last result.
import { getTeams, getFixtures, onDataChange } from './storage.js';
import { getMyTeamId, setMyTeamId, fixtureDateTime } from './match-alerts.js';
import { sortByDateTime, sortStandings } from './utilities.js';

const DISMISS_KEY = 'carrom-my-team-bar-dismissed';
let el = null;
let tickTimer = null;

function timeUntilLabel(target) {
  const diffMs = target - new Date();
  if (diffMs <= 0) return 'starting now';
  const mins = Math.floor(diffMs / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const remMins = mins % 60;
  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h ${remMins}m`;
  return `in ${remMins}m`;
}

function syncHeaderHeight() {
  const stack = document.getElementById('header-stack');
  if (stack) document.documentElement.style.setProperty('--header-h', `${stack.offsetHeight}px`);
}

function render() {
  renderBar();
  syncHeaderHeight();
}

function renderBar() {
  if (!el) return;
  const teams = getTeams();
  const myTeamId = getMyTeamId();

  if (sessionStorage.getItem(DISMISS_KEY)) { el.innerHTML = ''; el.classList.remove('is-active'); return; }

  if (!myTeamId) {
    if (!teams.length) { el.innerHTML = ''; el.classList.remove('is-active'); return; }
    el.classList.add('is-active');
    el.innerHTML = `
      <div class="my-team-bar-content">
        <span class="small text-muted"><i class="fa-solid fa-shield-halved me-1"></i>Which team is yours?</span>
        <select class="form-select form-select-sm" id="my-team-bar-select" style="max-width:260px;">
          <option value="">Choose your team...</option>
          ${teams.map((t) => `<option value="${t.id}">${t.players.join(' & ')} &middot; ${t.name}</option>`).join('')}
        </select>
        <button class="btn btn-sm btn-icon my-team-bar-dismiss" id="my-team-bar-dismiss" title="Hide for this visit"><i class="fa-solid fa-xmark"></i></button>
      </div>`;
    el.querySelector('#my-team-bar-select').addEventListener('change', (e) => setMyTeamId(e.target.value));
    el.querySelector('#my-team-bar-dismiss').addEventListener('click', () => { sessionStorage.setItem(DISMISS_KEY, '1'); render(); });
    return;
  }

  const team = teams.find((t) => t.id === myTeamId);
  if (!team) { el.innerHTML = ''; el.classList.remove('is-active'); return; }
  el.classList.add('is-active');

  const fixtures = getFixtures();
  const teamsById = Object.fromEntries(teams.map((t) => [t.id, t]));
  const myFixtures = fixtures.filter((f) => f.teamA === myTeamId || f.teamB === myTeamId);
  const next = sortByDateTime(myFixtures.filter((f) => f.status === 'scheduled'))[0];
  const lastResult = sortByDateTime(myFixtures.filter((f) => f.status === 'completed')).slice(-1)[0];

  const poolTeams = sortStandings(teams.filter((t) => t.pool === team.pool));
  const rank = poolTeams.findIndex((t) => t.id === myTeamId) + 1;

  let nextHtml = '<span class="text-muted">No upcoming matches</span>';
  if (next) {
    const opponent = teamsById[next.teamA === myTeamId ? next.teamB : next.teamA];
    const dt = fixtureDateTime(next);
    nextHtml = `<i class="fa-regular fa-clock me-1"></i>Next vs <strong>${opponent?.name || '?'}</strong> &middot; ${dt ? timeUntilLabel(dt) : next.time}`;
  }

  let lastHtml = '';
  if (lastResult) {
    const opponent = teamsById[lastResult.teamA === myTeamId ? lastResult.teamB : lastResult.teamA];
    const won = lastResult.winner === myTeamId;
    const draw = lastResult.winner === 'draw';
    lastHtml = `<span class="${draw ? 'text-warning' : won ? 'text-success' : 'text-danger'}">
      <i class="fa-solid ${draw ? 'fa-equals' : won ? 'fa-trophy' : 'fa-circle-xmark'} me-1"></i>${draw ? 'Drew' : won ? 'Won' : 'Lost'} vs ${opponent?.name || '?'} (${lastResult.scoreA}-${lastResult.scoreB})
    </span>`;
  }

  el.innerHTML = `
    <div class="my-team-bar-content">
      <span class="my-team-bar-name"><i class="fa-solid fa-star me-1 text-warning"></i>${team.name}</span>
      <span class="my-team-bar-sep d-none d-md-inline">&middot;</span>
      <span class="d-none d-md-inline">${nextHtml}</span>
      <span class="my-team-bar-sep d-none d-lg-inline">&middot;</span>
      <span class="d-none d-lg-inline">#${rank || '-'} in ${team.pool}</span>
      ${lastHtml ? `<span class="my-team-bar-sep d-none d-lg-inline">&middot;</span><span class="d-none d-lg-inline">${lastHtml}</span>` : ''}
      <button class="btn btn-sm btn-icon my-team-bar-dismiss ms-auto" id="my-team-bar-switch" title="Switch team"><i class="fa-solid fa-rotate"></i></button>
      <button class="btn btn-sm btn-icon my-team-bar-dismiss" id="my-team-bar-dismiss" title="Hide for this visit"><i class="fa-solid fa-xmark"></i></button>
    </div>`;
  el.querySelector('#my-team-bar-switch').addEventListener('click', () => setMyTeamId(''));
  el.querySelector('#my-team-bar-dismiss').addEventListener('click', () => { sessionStorage.setItem(DISMISS_KEY, '1'); render(); });
}

export function initMyTeamBar() {
  el = document.getElementById('my-team-bar');
  if (!el) return;
  render();
  onDataChange(render);
  window.addEventListener('myteamchange', render);
  window.addEventListener('resize', syncHeaderHeight);
  clearInterval(tickTimer);
  tickTimer = setInterval(render, 60000);
}
