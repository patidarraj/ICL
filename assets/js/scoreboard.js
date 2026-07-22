import {
  getTeams, getFixtures, getLiveScores, getLiveScore, saveLiveScore,
  isRefereeAuthed, loginReferee, logoutReferee,
} from './storage.js';
import { notify } from './notifications.js';

// Every Firestore write (including a referee's own +/- taps) triggers the router's
// global refreshCurrent(), which fully re-renders this page. Without persisting which
// tab/match was open, each tap would bounce the referee back to a blank Overview tab.
const uiState = { activeTab: 'overview', selectedMatchId: null };

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
  const shotEl = outlet.querySelector('#sb-shot-val');
  if (shotEl) {
    shotEl.textContent = t.shotRemaining;
    shotEl.className = 'timer-val' + (t.shotRemaining <= 5 ? ' danger' : t.shotRemaining <= 10 ? ' warn' : '');
  }
  const matchEl = outlet.querySelector('#sb-match-val');
  if (matchEl) {
    matchEl.textContent = fmtClock(t.matchRemaining);
    matchEl.className = 'timer-val' + (t.matchRemaining <= 60 ? ' danger' : t.matchRemaining <= 300 ? ' warn' : '');
  }
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

function renderOverview(outlet) {
  const pane = outlet.querySelector('#sb-pane-overview');
  const html = getFeaturedMatchesHtml();

  pane.innerHTML = html || '<p class="text-muted text-center py-5"><i class="fa-solid fa-satellite-dish me-2"></i>No match is being scored right now.</p>';
}

function playerBlock(teamKey, idx, p, live) {
  const key = playerKey(teamKey, idx);
  const queenLocked = live.queenTakenBy !== null;
  const isQueenHolder = live.queenTakenBy === key;
  return `
    <div class="player-block">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <span class="player-name">${p.name}</span>
        <button class="btn btn-sm ${isQueenHolder ? 'btn-danger' : 'btn-outline-light'}" data-action="queen-take" data-team="${teamKey}" data-idx="${idx}" ${queenLocked ? 'disabled' : ''}>
          <i class="fa-solid fa-crown"></i> ${isQueenHolder ? 'Queen' : ''}
        </button>
      </div>
      <div class="stat-row">
        <span class="stat-label">Points Scored</span>
        <div class="d-flex align-items-center gap-2">
          <button class="btn btn-sm btn-outline-light btn-round" data-action="points-minus" data-team="${teamKey}" data-idx="${idx}">−</button>
          <span class="stat-val">${p.points}</span>
          <button class="btn btn-sm btn-success btn-round" data-action="points-plus" data-team="${teamKey}" data-idx="${idx}">+</button>
        </div>
      </div>
      <div class="stat-row">
        <span class="stat-label">Dues Scored</span>
        <div class="d-flex align-items-center gap-2">
          <button class="btn btn-sm btn-outline-light btn-round" data-action="dues-minus" data-team="${teamKey}" data-idx="${idx}">−</button>
          <span class="stat-val">${p.dues}</span>
          <button class="btn btn-sm btn-primary btn-round" data-action="dues-plus" data-team="${teamKey}" data-idx="${idx}">+</button>
        </div>
      </div>
      <div class="stat-row">
        <span class="stat-label">Fouls Scored</span>
        <div class="d-flex align-items-center gap-2">
          <button class="btn btn-sm btn-outline-light btn-round" data-action="fouls-minus" data-team="${teamKey}" data-idx="${idx}">−</button>
          <span class="stat-val">${p.fouls}</span>
          <button class="btn btn-sm btn-warning btn-round" data-action="fouls-plus" data-team="${teamKey}" data-idx="${idx}">+</button>
        </div>
      </div>
      <div class="stat-row">
        <span class="stat-label">Consecutive Shots</span>
        <div class="d-flex align-items-center gap-2">
          <button class="btn btn-sm btn-outline-light btn-round" data-action="streak-minus" data-team="${teamKey}" data-idx="${idx}">−</button>
          <span class="stat-val">${p.streak}</span>
          <button class="btn btn-sm btn-info btn-round" data-action="streak-plus" data-team="${teamKey}" data-idx="${idx}">+</button>
        </div>
      </div>
    </div>`;
}

function teamCard(teamKey, live) {
  const team = live.teams[teamKey];
  const total = team.players.reduce((s, p) => s + p.points, 0);
  return `
    <div class="card-x">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <span class="team-name">${team.name}</span>
        <span class="coin-total">${total}</span>
      </div>
      ${team.players.map((p, idx) => playerBlock(teamKey, idx, p, live)).join('')}
    </div>`;
}

function timersHtml(matchId) {
  const t = getTimer(matchId);
  return `
    <div class="card-x timer-card">
      <div class="timer-block">
        <div class="timer-label"><i class="fa-solid fa-stopwatch me-1"></i>Shot Clock (30s)</div>
        <div class="timer-val" id="sb-shot-val">${t.shotRemaining}</div>
        <div class="timer-controls">
          <button class="btn btn-sm btn-success" id="sb-shot-start"><i class="fa-solid fa-play"></i></button>
          <button class="btn btn-sm btn-outline-light" id="sb-shot-reset"><i class="fa-solid fa-rotate-right"></i></button>
        </div>
      </div>
      <div class="timer-block">
        <div class="timer-label"><i class="fa-solid fa-hourglass-half me-1"></i>Match Timer (20:00)</div>
        <div class="timer-val" id="sb-match-val">${fmtClock(t.matchRemaining)}</div>
        <div class="timer-controls">
          <button class="btn btn-sm btn-success" id="sb-match-start"><i class="fa-solid fa-play"></i></button>
          <button class="btn btn-sm btn-warning" id="sb-match-pause"><i class="fa-solid fa-pause"></i></button>
          <button class="btn btn-sm btn-outline-light" id="sb-match-reset"><i class="fa-solid fa-rotate-right"></i></button>
        </div>
      </div>
    </div>`;
}

function scoreboardHtml(f, live) {
  return `
    ${timersHtml(f.id)}
    <div class="card-x">
      <div class="row g-3 align-items-end">
        <div class="col-sm-8">
          <label class="form-label small text-muted mb-1">Toss Won by</label>
          <select class="form-select" id="sb-toss">
            <option value="">Select team...</option>
            <option value="A" ${live.toss === 'A' ? 'selected' : ''}>${live.teams.A.name}</option>
            <option value="B" ${live.toss === 'B' ? 'selected' : ''}>${live.teams.B.name}</option>
          </select>
        </div>
        <div class="col-sm-4 text-sm-end">
          <button class="btn btn-sm btn-outline-danger w-100" id="sb-queen-reset" ${live.queenTakenBy === null ? 'disabled' : ''}>
            <i class="fa-solid fa-rotate-left me-1"></i>Reset Queen
          </button>
        </div>
      </div>
    </div>

    <div class="row g-3">
      <div class="col-md-6">${teamCard('A', live)}</div>
      <div class="col-md-6">${teamCard('B', live)}</div>
    </div>

    ${live.result ? `
    <div class="card-x">
      <strong><i class="fa-solid fa-trophy me-2"></i>${live.result.winner === 'draw' ? 'Match Drawn' : `${live.teams[live.result.winner].name} Won`}</strong>
      <div class="small text-muted mt-1">NRR — ${live.teams.A.name}: ${live.result.nrrLeader === 'A' ? live.result.margin : 0} &middot; ${live.teams.B.name}: ${live.result.nrrLeader === 'B' ? live.result.margin : 0}</div>
      <div class="small mt-1"><span class="badge bg-warning text-dark">Submitted — awaiting admin confirmation</span></div>
    </div>` : `
    <div class="text-end">
      <button class="btn btn-primary" id="sb-open-submit"><i class="fa-solid fa-check me-2"></i>Submit Result</button>
    </div>`}

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

  pane.querySelector('#sb-toss').addEventListener('change', (e) => { live.toss = e.target.value; persist(); });

  pane.querySelector('#sb-queen-reset').addEventListener('click', () => {
    live.queenTakenBy = null;
    persist();
    renderScoringPane(outlet, f, live);
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
    else if (action === 'queen-take') { if (live.queenTakenBy === null) live.queenTakenBy = playerKey(teamKey, idx); }
    else return;

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
  const overviewActive = uiState.activeTab === 'overview';
  outlet.innerHTML = `
    <h2 class="page-title"><i class="fa-solid fa-flag-checkered me-2"></i>Scoreboard</h2>

    <ul class="nav nav-tabs mb-4" role="tablist">
      <li class="nav-item" role="presentation">
        <button class="nav-link ${overviewActive ? 'active' : ''}" data-bs-toggle="tab" data-bs-target="#sb-tab-overview" data-tab="overview" type="button" role="tab" aria-selected="${overviewActive}">
          <i class="fa-solid fa-eye me-1"></i>Overview
        </button>
      </li>
      <li class="nav-item" role="presentation">
        <button class="nav-link ${overviewActive ? '' : 'active'}" data-bs-toggle="tab" data-bs-target="#sb-tab-scoring" data-tab="scoring" type="button" role="tab" aria-selected="${!overviewActive}">
          <i class="fa-solid fa-list-ol me-1"></i>Individual Scoring
        </button>
      </li>
    </ul>

    <div class="tab-content">
      <div class="tab-pane fade ${overviewActive ? 'show active' : ''}" id="sb-tab-overview" role="tabpanel">
        <div id="sb-pane-overview"></div>
      </div>
      <div class="tab-pane fade ${overviewActive ? '' : 'show active'}" id="sb-tab-scoring" role="tabpanel">
        ${isRefereeAuthed() ? '<div class="d-flex justify-content-end mb-2"><button class="btn btn-sm btn-outline-danger" id="sb-ref-logout"><i class="fa-solid fa-right-from-bracket me-1"></i>Lock</button></div>' : ''}
        <div id="sb-pane-scoring"></div>
      </div>
    </div>`;

  outlet.querySelectorAll('[data-bs-toggle="tab"]').forEach((btn) => {
    btn.addEventListener('shown.bs.tab', () => { uiState.activeTab = btn.dataset.tab; });
  });

  renderOverview(outlet);

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
