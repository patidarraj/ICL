import {
  getTeams, getFixtures, getLiveScores, getLiveScore, saveLiveScore,
  isRefereeAuthed, loginReferee, logoutReferee,
} from './storage.js';
import { notify } from './notifications.js';

// Every Firestore write (including a referee's own +/- taps) triggers the router's
// global refreshCurrent(), which fully re-renders this page. Without persisting which
// tab/match was open, each tap would bounce the referee back to a blank Overview tab.
const uiState = { selectedMatchId: null, stripOpen: false };

// Referee-side pacing aids (30s shot clock, 20-min match timer) — local to this browser
// session only, not synced to Firestore, keyed by match so they survive the page's
// frequent re-renders (see note above) without resetting on every scoring tap.
const SHOT_CLOCK_SECONDS = 30;
const MATCH_MINUTES = 20;
const scoreTimers = {};

function getTimer(matchId) {
  if (!scoreTimers[matchId]) {
    scoreTimers[matchId] = {
      shotRemaining: SHOT_CLOCK_SECONDS, shotInterval: null,
      matchRemaining: MATCH_MINUTES * 60, matchInterval: null,
    };
  }
  return scoreTimers[matchId];
}

function fmtClock(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Re-queries the timer DOM fresh each call, since a Firestore-triggered re-render replaces these nodes underneath a running interval. */
function renderTimerDom(outlet, matchId) {
  const t = getTimer(matchId);
  const shotHot = t.shotRemaining <= 5;
  const matchHot = t.matchRemaining <= 60;

  const shotEl = outlet.querySelector('#sb-shot-val');
  if (shotEl) shotEl.textContent = t.shotRemaining;
  const shotGlance = outlet.querySelector('#sb-shot-glance');
  if (shotGlance) { shotGlance.textContent = `${t.shotRemaining}s`; shotGlance.classList.toggle('hot', shotHot); }

  const matchEl = outlet.querySelector('#sb-match-val');
  if (matchEl) matchEl.textContent = fmtClock(t.matchRemaining);
  const matchGlance = outlet.querySelector('#sb-match-glance');
  if (matchGlance) { matchGlance.textContent = fmtClock(t.matchRemaining); matchGlance.classList.toggle('hot', matchHot); }
}

function resetShotClock(matchId, outlet) {
  const t = getTimer(matchId);
  clearInterval(t.shotInterval);
  t.shotInterval = null;
  t.shotRemaining = SHOT_CLOCK_SECONDS;
  renderTimerDom(outlet, matchId);
}

function bindTimerActions(outlet, matchId) {
  const t = getTimer(matchId);
  const pane = outlet.querySelector('#sb-pane-scoring');

  pane.querySelector('#sb-shot-start').addEventListener('click', () => {
    clearInterval(t.shotInterval);
    t.shotInterval = setInterval(() => {
      t.shotRemaining -= 1;
      if (t.shotRemaining <= 0) { t.shotRemaining = 0; clearInterval(t.shotInterval); t.shotInterval = null; }
      renderTimerDom(outlet, matchId);
    }, 1000);
  });
  pane.querySelector('#sb-shot-reset').addEventListener('click', () => resetShotClock(matchId, outlet));

  pane.querySelector('#sb-match-start').addEventListener('click', () => {
    if (t.matchInterval) return;
    t.matchInterval = setInterval(() => {
      t.matchRemaining -= 1;
      if (t.matchRemaining <= 0) { t.matchRemaining = 0; clearInterval(t.matchInterval); t.matchInterval = null; }
      renderTimerDom(outlet, matchId);
    }, 1000);
  });
  pane.querySelector('#sb-match-pause').addEventListener('click', () => {
    clearInterval(t.matchInterval);
    t.matchInterval = null;
  });
  pane.querySelector('#sb-match-reset').addEventListener('click', () => {
    clearInterval(t.matchInterval);
    t.matchInterval = null;
    t.matchRemaining = MATCH_MINUTES * 60;
    renderTimerDom(outlet, matchId);
  });
}

function blankPlayer(name) {
  return { name, points: 0, dues: 0, fouls: 0, streak: 0 };
}

function blankLiveScore(f, teamsById) {
  const teamA = teamsById[f.teamA];
  const teamB = teamsById[f.teamB];
  return {
    matchId: f.id,
    toss: '',
    queenTakenBy: null,
    teams: {
      A: { name: teamA?.name || f.teamA, players: (teamA?.players || ['Player 1', 'Player 2']).map(blankPlayer) },
      B: { name: teamB?.name || f.teamB, players: (teamB?.players || ['Player 1', 'Player 2']).map(blankPlayer) },
    },
    status: 'live',
    result: null,
  };
}

function playerKey(teamKey, idx) { return `${teamKey}-${idx}`; }

function phonePlayerChip(p, key, live) {
  const isQueenHolder = live.queenTakenBy === key;
  return `
    <div class="phone-player-chip ${isQueenHolder ? 'has-queen' : ''}">
      <span class="phone-player-name">${p.name} ${isQueenHolder ? '<i class="fa-solid fa-crown text-warning ms-1"></i>' : ''}</span>
      <div class="phone-player-stats">
        <span title="Points Scored"><i class="fa-solid fa-circle-dot"></i>${p.points}</span>
        <span title="Dues Scored"><i class="fa-solid fa-plus"></i>${p.dues}</span>
        <span title="Fouls Scored"><i class="fa-solid fa-triangle-exclamation"></i>${p.fouls}</span>
        <span title="Consecutive Shots"><i class="fa-solid fa-fire"></i>${p.streak}</span>
      </div>
    </div>`;
}

function featuredMatchCard(f, live) {
  const totalA = live.teams.A.players.reduce((s, p) => s + p.points, 0);
  const totalB = live.teams.B.players.reduce((s, p) => s + p.points, 0);
  const isPending = live.status === 'pending_review';
  const queenTeam = live.queenTakenBy ? live.teams[live.queenTakenBy.split('-')[0]].name : null;
  return `
    <div class="phone-card">
      <div class="phone-card-topbar">
        <span>${isPending ? 'Awaiting Confirmation' : 'Game in Progress'}</span>
        <i class="fa-solid fa-house"></i>
      </div>
      <div class="phone-scorerow">
        <div class="phone-team">
          <span class="phone-team-name">${live.teams.A.name}</span>
          <span class="phone-score-circle">${totalA}</span>
        </div>
        <div class="phone-center">
          <div class="phone-center-badge ${isPending ? 'is-pending' : 'is-live'}">
            ${isPending ? '<i class="fa-solid fa-hourglass-half"></i>' : '<span class="live-dot"></span>'}
          </div>
          <div class="phone-center-label">${isPending ? 'Pending' : 'Live'}</div>
        </div>
        <div class="phone-team">
          <span class="phone-score-circle">${totalB}</span>
          <span class="phone-team-name">${live.teams.B.name}</span>
        </div>
      </div>

      <div class="phone-board">
        <span><i class="fa-solid fa-crown me-1 text-warning"></i>Queen: ${queenTeam ? `${queenTeam}` : 'Not taken'}</span>
        ${live.toss ? `<span><i class="fa-solid fa-coins me-1"></i>Toss: ${live.teams[live.toss].name}</span>` : ''}
      </div>

      <div class="row g-2 mt-2">
        <div class="col-md-6">
          ${live.teams.A.players.map((p, idx) => phonePlayerChip(p, playerKey('A', idx), live)).join('')}
        </div>
        <div class="col-md-6">
          ${live.teams.B.players.map((p, idx) => phonePlayerChip(p, playerKey('B', idx), live)).join('')}
        </div>
      </div>
    </div>`;
}

/** Shared by the Scoreboard Overview tab and the Dashboard — HTML for whichever match(es) currently have an active/pending scorecard. Empty string if none. */
export function getFeaturedMatchesHtml() {
  const fixtures = getFixtures().filter((f) => f.status === 'scheduled');
  const liveScores = getLiveScores();
  const featured = fixtures.filter((f) => liveScores[f.id]);
  return featured.map((f) => featuredMatchCard(f, liveScores[f.id])).join('');
}

function compactStatRow(field, iconClass, teamKey, idx, val) {
  return `
    <div class="stat-row">
      <span class="stat-label" title="${field}"><i class="fa-solid ${iconClass}"></i></span>
      <div class="stat-ctrl">
        <button class="pill-btn" data-action="${field}-minus" data-team="${teamKey}" data-idx="${idx}">−</button>
        <span class="stat-val">${val}</span>
        <button class="pill-btn plus-${field}" data-action="${field}-plus" data-team="${teamKey}" data-idx="${idx}">+</button>
      </div>
    </div>`;
}

function compactPlayerCard(teamKey, idx, p, live) {
  const key = playerKey(teamKey, idx);
  const isQueenHolder = live.queenTakenBy === key;
  const queenLocked = live.queenTakenBy !== null && !isQueenHolder;
  return `
    <div class="p-card team-${teamKey.toLowerCase()}">
      <div class="p-head">
        <span class="p-name">${p.name}</span>
        <button class="queen-btn ${isQueenHolder ? 'active' : ''}" data-action="queen-take" data-team="${teamKey}" data-idx="${idx}" ${queenLocked ? 'disabled' : ''} title="Queen Acquired">
          <i class="fa-solid fa-crown"></i>
        </button>
      </div>
      ${compactStatRow('points', 'fa-circle-dot', teamKey, idx, p.points)}
      ${compactStatRow('dues', 'fa-plus', teamKey, idx, p.dues)}
      ${compactStatRow('fouls', 'fa-triangle-exclamation', teamKey, idx, p.fouls)}
      ${compactStatRow('streak', 'fa-fire', teamKey, idx, p.streak)}
    </div>`;
}

function stripHtml(matchId, live) {
  const t = getTimer(matchId);
  return `
    <div class="strip ${uiState.stripOpen ? 'open' : ''}" id="sb-strip">
      <div class="strip-head" id="sb-strip-head">
        <div class="strip-glance">
          <span class="glance-item"><i class="fa-solid fa-stopwatch"></i><span class="glance-val" id="sb-shot-glance">${t.shotRemaining}s</span></span>
          <span class="glance-item"><i class="fa-solid fa-hourglass-half"></i><span class="glance-val" id="sb-match-glance">${fmtClock(t.matchRemaining)}</span></span>
          <span class="glance-item text-muted">Toss <strong id="sb-toss-glance">${live.toss ? live.teams[live.toss].name : '—'}</strong></span>
        </div>
        <i class="fa-solid fa-chevron-down chev"></i>
      </div>
      <div class="strip-body">
        <div class="strip-body-inner">
          <div class="strip-row">
            <span class="label">Shot clock (30s) <span class="timer-val-inline" id="sb-shot-val">${t.shotRemaining}</span></span>
            <div class="btn-group-mini">
              <button class="mini-btn go" id="sb-shot-start"><i class="fa-solid fa-play"></i></button>
              <button class="mini-btn" id="sb-shot-reset"><i class="fa-solid fa-rotate-right"></i></button>
            </div>
          </div>
          <div class="strip-row">
            <span class="label">Match timer (20:00) <span class="timer-val-inline" id="sb-match-val">${fmtClock(t.matchRemaining)}</span></span>
            <div class="btn-group-mini">
              <button class="mini-btn go" id="sb-match-start"><i class="fa-solid fa-play"></i></button>
              <button class="mini-btn pause" id="sb-match-pause"><i class="fa-solid fa-pause"></i></button>
              <button class="mini-btn" id="sb-match-reset"><i class="fa-solid fa-rotate-right"></i></button>
            </div>
          </div>
          <div class="strip-row">
            <span class="label">Toss won by</span>
            <select class="toss-select" id="sb-toss">
              <option value="">Select…</option>
              <option value="A" ${live.toss === 'A' ? 'selected' : ''}>${live.teams.A.name}</option>
              <option value="B" ${live.toss === 'B' ? 'selected' : ''}>${live.teams.B.name}</option>
            </select>
          </div>
        </div>
      </div>
    </div>`;
}

function scoreboardHtml(f, live) {
  const totalA = live.teams.A.players.reduce((s, p) => s + p.points, 0);
  const totalB = live.teams.B.players.reduce((s, p) => s + p.points, 0);
  return `
    ${stripHtml(f.id, live)}

    <div class="legend">
      <span class="legend-points"><i class="fa-solid fa-circle-dot"></i>Points</span>
      <span class="legend-dues"><i class="fa-solid fa-plus"></i>Dues</span>
      <span class="legend-fouls"><i class="fa-solid fa-triangle-exclamation"></i>Fouls</span>
      <span class="legend-streak"><i class="fa-solid fa-fire"></i>Streak</span>
      <span class="legend-queen"><i class="fa-solid fa-crown"></i>Queen</span>
    </div>

    <div class="grid">
      ${live.teams.A.players.map((p, idx) => compactPlayerCard('A', idx, p, live)).join('')}
      ${live.teams.B.players.map((p, idx) => compactPlayerCard('B', idx, p, live)).join('')}
    </div>

    ${live.result ? `
    <div class="card-x mt-2">
      <strong><i class="fa-solid fa-trophy me-2"></i>${live.result.winner === 'draw' ? 'Match Drawn' : `${live.teams[live.result.winner].name} Won`}</strong>
      <div class="small text-muted mt-1">NRR — ${live.teams.A.name}: ${live.result.nrrLeader === 'A' ? live.result.margin : 0} &middot; ${live.teams.B.name}: ${live.result.nrrLeader === 'B' ? live.result.margin : 0}</div>
      <div class="small mt-1"><span class="badge bg-warning text-dark">Submitted — awaiting admin confirmation</span></div>
    </div>` : `
    <div class="totals-bar mt-2">
      <div class="totals-side"><div class="totals-name">${live.teams.A.name}</div><div class="totals-score team-a-score">${totalA}</div></div>
      <div class="totals-mid">vs</div>
      <div class="totals-side"><div class="totals-name">${live.teams.B.name}</div><div class="totals-score team-b-score">${totalB}</div></div>
    </div>
    <button class="btn btn-primary w-100 mt-2" id="sb-open-submit"><i class="fa-solid fa-check me-2"></i>Submit Result</button>`}

    <div class="modal-backdrop-x" id="sb-submit-modal">
      <div class="modal-box">
        <h5 class="mb-3"><i class="fa-solid fa-trophy me-2"></i>Submit Match Result</h5>
        <div class="winner-options">
          <button class="btn btn-outline-light" data-winner="A" id="sb-winnerA">${live.teams.A.name} Won</button>
          <button class="btn btn-outline-light" data-winner="draw" id="sb-winnerDraw">Draw</button>
          <button class="btn btn-outline-light" data-winner="B" id="sb-winnerB">${live.teams.B.name} Won</button>
        </div>
        <div id="sb-nrr-leader-section" style="display:none;">
          <label class="form-label small text-muted mb-1 d-block text-center">Leading in NRR</label>
          <div class="winner-options">
            <button class="btn btn-outline-light" data-nrr-leader="A" id="sb-nrrLeaderA">${live.teams.A.name}</button>
            <button class="btn btn-outline-light" data-nrr-leader="B" id="sb-nrrLeaderB">${live.teams.B.name}</button>
          </div>
        </div>
        <div id="sb-margin-section" style="display:none;">
          <label class="form-label small text-muted mb-1 d-block text-center" id="sb-margin-label">NRR Margin</label>
          <div class="margin-row">
            <button class="btn btn-outline-light btn-round" id="sb-marginMinus">−</button>
            <span class="margin-val" id="sb-marginVal">0</span>
            <button class="btn btn-info btn-round" id="sb-marginPlus">+</button>
          </div>
        </div>
        <div class="d-flex gap-2 mt-2">
          <button class="btn btn-secondary flex-fill" id="sb-close-submit">Cancel</button>
          <button class="btn btn-success flex-fill" id="sb-confirm-submit">Confirm</button>
        </div>
      </div>
    </div>`;
}

function bindScoringActions(outlet, f, live) {
  const pane = outlet.querySelector('#sb-pane-scoring');
  const persist = () => saveLiveScore(f.id, live);

  pane.querySelector('#sb-toss').addEventListener('change', (e) => {
    live.toss = e.target.value;
    persist();
    pane.querySelector('#sb-toss-glance').textContent = live.toss ? live.teams[live.toss].name : '—';
  });

  pane.querySelector('#sb-strip-head').addEventListener('click', () => {
    uiState.stripOpen = !uiState.stripOpen;
    pane.querySelector('#sb-strip').classList.toggle('open', uiState.stripOpen);
  });

  pane.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const teamKey = btn.dataset.team;
    const idx = Number(btn.dataset.idx);
    const p = live.teams[teamKey]?.players?.[idx];
    const action = btn.dataset.action;

    if (action === 'points-plus') { p.points += 1; resetShotClock(f.id, outlet); }
    else if (action === 'points-minus') p.points = Math.max(0, p.points - 1);
    else if (action === 'dues-plus') p.dues += 1;
    else if (action === 'dues-minus') p.dues = Math.max(0, p.dues - 1);
    else if (action === 'fouls-plus') { p.fouls += 1; resetShotClock(f.id, outlet); }
    else if (action === 'fouls-minus') p.fouls = Math.max(0, p.fouls - 1);
    else if (action === 'streak-plus') p.streak += 1;
    else if (action === 'streak-minus') p.streak = Math.max(0, p.streak - 1);
    else if (action === 'queen-take') {
      const key = playerKey(teamKey, idx);
      if (live.queenTakenBy === key) live.queenTakenBy = null;
      else if (live.queenTakenBy === null) live.queenTakenBy = key;
    } else return;

    persist();
    renderScoringPane(outlet, f, live);
  });

  bindTimerActions(outlet, f.id);

  // --- Submit modal ---
  const modal = pane.querySelector('#sb-submit-modal');
  let pendingWinner = null;
  let pendingNrrLeader = null;
  let pendingMargin = 0;

  function renderModal() {
    ['A', 'draw', 'B'].forEach((w) => {
      const id = w === 'draw' ? 'sb-winnerDraw' : `sb-winner${w}`;
      pane.querySelector(`#${id}`).className = 'btn ' + (pendingWinner === w ? 'btn-primary' : 'btn-outline-light');
    });
    const leaderSection = pane.querySelector('#sb-nrr-leader-section');
    const marginSection = pane.querySelector('#sb-margin-section');
    const marginLabel = pane.querySelector('#sb-margin-label');
    if (pendingWinner === 'A' || pendingWinner === 'B') {
      pendingNrrLeader = pendingWinner;
      leaderSection.style.display = 'none';
      marginSection.style.display = 'block';
      marginLabel.textContent = `${live.teams[pendingWinner].name} NRR Margin`;
    } else if (pendingWinner === 'draw') {
      leaderSection.style.display = 'block';
      marginSection.style.display = pendingNrrLeader ? 'block' : 'none';
      marginLabel.textContent = pendingNrrLeader ? `${live.teams[pendingNrrLeader].name} NRR Margin` : '';
    } else {
      leaderSection.style.display = 'none';
      marginSection.style.display = 'none';
    }
    ['A', 'B'].forEach((t) => {
      pane.querySelector(`#sb-nrrLeader${t}`).className = 'btn ' + (pendingNrrLeader === t ? 'btn-info' : 'btn-outline-light');
    });
    pane.querySelector('#sb-marginVal').textContent = pendingMargin;
  }

  const openBtn = pane.querySelector('#sb-open-submit');
  if (openBtn) openBtn.addEventListener('click', () => { pendingWinner = null; pendingNrrLeader = null; pendingMargin = 0; renderModal(); modal.classList.add('show'); });
  pane.querySelector('#sb-close-submit').addEventListener('click', () => modal.classList.remove('show'));
  ['sb-winnerA', 'sb-winnerDraw', 'sb-winnerB'].forEach((id) => {
    pane.querySelector(`#${id}`).addEventListener('click', (e) => {
      const newWinner = e.currentTarget.dataset.winner;
      if (newWinner === 'draw' && pendingWinner !== 'draw') pendingNrrLeader = null;
      pendingWinner = newWinner;
      renderModal();
    });
  });
  ['sb-nrrLeaderA', 'sb-nrrLeaderB'].forEach((id) => {
    pane.querySelector(`#${id}`).addEventListener('click', (e) => { pendingNrrLeader = e.currentTarget.dataset.nrrLeader; renderModal(); });
  });
  pane.querySelector('#sb-marginPlus').addEventListener('click', () => { pendingMargin += 1; renderModal(); });
  pane.querySelector('#sb-marginMinus').addEventListener('click', () => { pendingMargin = Math.max(0, pendingMargin - 1); renderModal(); });
  pane.querySelector('#sb-confirm-submit').addEventListener('click', async () => {
    if (!pendingWinner || !pendingNrrLeader) { notify.warn('Select a winner (and NRR leader) first'); return; }
    live.result = { winner: pendingWinner, nrrLeader: pendingNrrLeader, margin: pendingMargin };
    live.status = 'pending_review';
    await persist();
    modal.classList.remove('show');
    notify.success('Result submitted — waiting for admin confirmation');
    renderScoringPane(outlet, f, live);
  });
}

async function renderScoringPane(outlet, f, live) {
  const board = outlet.querySelector('#sb-scoreboard-body');
  board.innerHTML = scoreboardHtml(f, live);
  bindScoringActions(outlet, f, live);
}

function renderMatchPicker(outlet) {
  const pane = outlet.querySelector('#sb-pane-scoring');
  const fixtures = getFixtures().filter((f) => f.status === 'scheduled');
  const teamsById = Object.fromEntries(getTeams().map((t) => [t.id, t]));
  if (!fixtures.length) {
    pane.innerHTML = '<p class="text-muted">No upcoming matches to score.</p>';
    return;
  }
  pane.innerHTML = `
    <div class="card-x">
      <label class="form-label small text-muted mb-1">Select Match</label>
      <select class="form-select" id="sb-match-select">
        <option value="">Choose a match...</option>
        ${fixtures.map((f) => `<option value="${f.id}">${teamsById[f.teamA]?.name || f.teamA} vs ${teamsById[f.teamB]?.name || f.teamB} — ${f.date}</option>`).join('')}
      </select>
    </div>
    <div id="sb-scoreboard-body"></div>`;
  if (uiState.selectedMatchId) {
    const opt = pane.querySelector(`#sb-match-select option[value="${uiState.selectedMatchId}"]`);
    if (opt) {
      pane.querySelector('#sb-match-select').value = uiState.selectedMatchId;
      const f = fixtures.find((x) => x.id === uiState.selectedMatchId);
      const live = getLiveScore(f.id) || blankLiveScore(f, teamsById);
      renderScoringPane(outlet, f, live);
    } else {
      uiState.selectedMatchId = null;
    }
  }

  pane.querySelector('#sb-match-select').addEventListener('change', (e) => {
    if (!e.target.value) { uiState.selectedMatchId = null; return; }
    uiState.selectedMatchId = e.target.value;
    const f = fixtures.find((x) => x.id === e.target.value);
    const live = getLiveScore(f.id) || blankLiveScore(f, teamsById);
    renderScoringPane(outlet, f, live);
  });
}

function refereeLoginForm(outlet, onSuccess) {
  const pane = outlet.querySelector('#sb-pane-scoring');
  pane.innerHTML = `
    <div class="row justify-content-center">
      <div class="col-md-5">
        <div class="card"><div class="card-body">
          <h6 class="mb-3"><i class="fa-solid fa-lock me-2"></i>Referee Access</h6>
          <input type="password" class="form-control mb-3" id="sb-ref-passcode" placeholder="Enter referee passcode">
          <button class="btn btn-primary w-100" id="sb-ref-login">Unlock</button>
        </div></div>
      </div>
    </div>`;
  const submit = () => {
    const pw = pane.querySelector('#sb-ref-passcode').value;
    if (loginReferee(pw)) { notify.success('Referee access granted'); onSuccess(); }
    else notify.error('Incorrect passcode');
  };
  pane.querySelector('#sb-ref-login').addEventListener('click', submit);
  pane.querySelector('#sb-ref-passcode').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
}

export async function renderScoreboard(outlet) {
  outlet.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h2 class="page-title mb-0"><i class="fa-solid fa-flag-checkered me-2"></i>Individual Scoring</h2>
      ${isRefereeAuthed() ? '<button class="btn btn-sm btn-outline-danger" id="sb-ref-logout"><i class="fa-solid fa-right-from-bracket me-1"></i>Lock</button>' : ''}
    </div>
    <div id="sb-pane-scoring"></div>`;

  if (isRefereeAuthed()) {
    renderMatchPicker(outlet);
    outlet.querySelector('#sb-ref-logout')?.addEventListener('click', () => {
      logoutReferee();
      uiState.selectedMatchId = null;
      renderScoreboard(outlet);
    });
  } else {
    refereeLoginForm(outlet, () => renderScoreboard(outlet));
  }
}
