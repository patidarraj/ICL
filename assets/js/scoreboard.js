import {
  getTeams, getFixtures, getLiveScores, getLiveScore, saveLiveScore,
  isRefereeAuthed, loginReferee, logoutReferee,
} from './storage.js';
import { notify } from './notifications.js';

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

function overviewCard(f, teamsById, live) {
  const teamA = teamsById[f.teamA];
  const teamB = teamsById[f.teamB];
  if (!live) {
    return `
      <div class="card mb-3"><div class="card-body">
        <div class="d-flex justify-content-between align-items-center">
          <span>${teamA?.name || f.teamA} <span class="text-muted small">vs</span> ${teamB?.name || f.teamB}</span>
          <span class="badge bg-secondary">Not started</span>
        </div>
      </div></div>`;
  }
  const totalA = live.teams.A.players.reduce((s, p) => s + p.points, 0);
  const totalB = live.teams.B.players.reduce((s, p) => s + p.points, 0);
  return `
    <div class="card mb-3 ${live.status === 'pending_review' ? 'border-warning' : 'border-success'}">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span>${live.teams.A.name} <strong>${totalA}</strong> &nbsp;–&nbsp; <strong>${totalB}</strong> ${live.teams.B.name}</span>
          <span class="badge ${live.status === 'pending_review' ? 'bg-warning text-dark' : 'bg-success'}">
            ${live.status === 'pending_review' ? 'Awaiting Admin Confirmation' : 'Live'}
          </span>
        </div>
      </div>
    </div>`;
}

function renderOverview(outlet) {
  const fixtures = getFixtures().filter((f) => f.status === 'scheduled');
  const teamsById = Object.fromEntries(getTeams().map((t) => [t.id, t]));
  const liveScores = getLiveScores();
  const pane = outlet.querySelector('#sb-pane-overview');
  if (!fixtures.length) {
    pane.innerHTML = '<p class="text-muted">No upcoming matches.</p>';
    return;
  }
  pane.innerHTML = fixtures.map((f) => overviewCard(f, teamsById, liveScores[f.id])).join('');
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

function scoreboardHtml(f, live) {
  return `
    <div class="card-x">
      <label class="form-label small text-muted mb-1">Toss Won by</label>
      <select class="form-select" id="sb-toss" style="max-width:320px;">
        <option value="">Select team...</option>
        <option value="A" ${live.toss === 'A' ? 'selected' : ''}>${live.teams.A.name}</option>
        <option value="B" ${live.toss === 'B' ? 'selected' : ''}>${live.teams.B.name}</option>
      </select>
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

  pane.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const teamKey = btn.dataset.team;
    const idx = Number(btn.dataset.idx);
    const p = live.teams[teamKey]?.players?.[idx];
    const action = btn.dataset.action;

    if (action === 'points-plus') p.points += 1;
    else if (action === 'points-minus') p.points = Math.max(0, p.points - 1);
    else if (action === 'dues-plus') p.dues += 1;
    else if (action === 'dues-minus') p.dues = Math.max(0, p.dues - 1);
    else if (action === 'fouls-plus') p.fouls += 1;
    else if (action === 'fouls-minus') p.fouls = Math.max(0, p.fouls - 1);
    else if (action === 'streak-plus') p.streak += 1;
    else if (action === 'streak-minus') p.streak = Math.max(0, p.streak - 1);
    else if (action === 'queen-take') { if (live.queenTakenBy === null) live.queenTakenBy = playerKey(teamKey, idx); }
    else return;

    persist();
    renderScoringPane(outlet, f, live);
  });

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
  const pane = outlet.querySelector('#sb-pane-scoring');
  pane.innerHTML = scoreboardHtml(f, live);
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
    </div>`;
  pane.querySelector('#sb-match-select').addEventListener('change', (e) => {
    if (!e.target.value) return;
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
    <h2 class="page-title"><i class="fa-solid fa-flag-checkered me-2"></i>Scoreboard</h2>

    <ul class="nav nav-tabs mb-4" role="tablist">
      <li class="nav-item" role="presentation">
        <button class="nav-link active" data-bs-toggle="tab" data-bs-target="#sb-tab-overview" type="button" role="tab" aria-selected="true">
          <i class="fa-solid fa-eye me-1"></i>Overview
        </button>
      </li>
      <li class="nav-item" role="presentation">
        <button class="nav-link" data-bs-toggle="tab" data-bs-target="#sb-tab-scoring" type="button" role="tab" aria-selected="false">
          <i class="fa-solid fa-list-ol me-1"></i>Individual Scoring
        </button>
      </li>
    </ul>

    <div class="tab-content">
      <div class="tab-pane fade show active" id="sb-tab-overview" role="tabpanel">
        <div id="sb-pane-overview"></div>
      </div>
      <div class="tab-pane fade" id="sb-tab-scoring" role="tabpanel">
        ${isRefereeAuthed() ? '<div class="d-flex justify-content-end mb-2"><button class="btn btn-sm btn-outline-danger" id="sb-ref-logout"><i class="fa-solid fa-right-from-bracket me-1"></i>Lock</button></div>' : ''}
        <div id="sb-pane-scoring"></div>
      </div>
    </div>`;

  renderOverview(outlet);

  if (isRefereeAuthed()) {
    renderMatchPicker(outlet);
    outlet.querySelector('#sb-ref-logout')?.addEventListener('click', () => {
      logoutReferee();
      renderScoreboard(outlet);
    });
  } else {
    refereeLoginForm(outlet, () => renderScoreboard(outlet));
  }
}
