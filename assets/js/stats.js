import { getTeams, getFixtures, getPredictions } from './storage.js';
import { POOL_NAMES } from './utilities.js';
import { renderChart, lineConfig, barConfig, doughnutConfig, radarConfig, destroyAllCharts } from './charts.js';

function predictionLeaderboard(fixtures, predictions, teamsById) {
  const decided = new Set(fixtures.filter((f) => f.status === 'completed' && f.winner && f.winner !== 'draw').map((f) => f.id));
  const winnerByMatch = Object.fromEntries(fixtures.filter((f) => decided.has(f.id)).map((f) => [f.id, f.winner]));
  const byTeam = {};
  predictions.filter((p) => decided.has(p.matchId)).forEach((p) => {
    if (!byTeam[p.voterTeamId]) byTeam[p.voterTeamId] = { made: 0, correct: 0 };
    byTeam[p.voterTeamId].made += 1;
    if (p.votedForTeamId === winnerByMatch[p.matchId]) byTeam[p.voterTeamId].correct += 1;
  });
  return Object.entries(byTeam)
    .map(([teamId, { made, correct }]) => ({ teamId, name: teamsById[teamId]?.name || teamId, made, correct, accuracy: made ? Math.round((correct / made) * 100) : 0 }))
    .sort((a, b) => b.correct - a.correct || b.accuracy - a.accuracy);
}

function progressOverDays(fixtures) {
  const completed = fixtures.filter((f) => f.status === 'completed').sort((a, b) => a.date.localeCompare(b.date));
  const byDate = {};
  completed.forEach((f) => { byDate[f.date] = (byDate[f.date] || 0) + 1; });
  const dates = Object.keys(byDate).sort();
  let running = 0;
  const cumulative = dates.map((d) => (running += byDate[d]));
  return { labels: dates, cumulative };
}

function matchesPerDay(fixtures) {
  const byDate = {};
  fixtures.forEach((f) => { byDate[f.date] = (byDate[f.date] || 0) + 1; });
  const dates = Object.keys(byDate).sort();
  return { labels: dates.map((d) => d.slice(5)), values: dates.map((d) => byDate[d]) };
}

function playerLeaderboard(fixtures, teamsById) {
  const byName = {};
  const bump = (name, teamName, field, amount) => {
    const key = `${name}::${teamName}`;
    if (!byName[key]) byName[key] = { name, teamName, points: 0, fouls: 0, queens: 0 };
    byName[key][field] += amount;
  };

  fixtures.filter((f) => f.playerStats).forEach((f) => {
    ['A', 'B'].forEach((side) => {
      const teamId = side === 'A' ? f.teamA : f.teamB;
      const teamName = teamsById[teamId]?.name || teamId;
      (f.playerStats[side]?.players || []).forEach((p, idx) => {
        bump(p.name, teamName, 'points', p.points || 0);
        bump(p.name, teamName, 'fouls', p.fouls || 0);
        if (f.queenTakenBy === `${side}-${idx}`) bump(p.name, teamName, 'queens', 1);
      });
    });
  });

  const players = Object.values(byName);
  return {
    topScorers: [...players].sort((a, b) => b.points - a.points).slice(0, 5),
    topQueens: [...players].filter((p) => p.queens > 0).sort((a, b) => b.queens - a.queens).slice(0, 5),
    cleanest: [...players].filter((p) => p.points > 0).sort((a, b) => a.fouls - b.fouls || b.points - a.points).slice(0, 5),
    allPlayers: [...players].sort((a, b) => b.points - a.points),
  };
}

function allPlayersRow(p, i) {
  return `<tr data-name="${p.name.toLowerCase()}" data-team="${p.teamName.toLowerCase()}">
    <td>${i + 1}</td><td>${p.name}</td><td>${p.teamName}</td>
    <td class="text-end">${p.points}</td><td class="text-end">${p.queens}</td><td class="text-end">${p.fouls}</td>
  </tr>`;
}

export async function renderStats(outlet) {
  const teams = getTeams();
  const fixtures = getFixtures();
  const teamsById = Object.fromEntries(teams.map((t) => [t.id, t]));
  const leaderboard = playerLeaderboard(fixtures, teamsById);
  const predictors = predictionLeaderboard(fixtures, getPredictions(), teamsById);

  const poolWins = POOL_NAMES.map((pool) => teams.filter((t) => t.pool === pool).reduce((s, t) => s + t.won, 0));
  const winPct = teams.map((t) => (t.played ? Math.round((t.won / t.played) * 100) : 0));
  const topTeams = [...teams].sort((a, b) => b.won - a.won || b.points - a.points).slice(0, 5);
  const completed = fixtures.filter((f) => f.status === 'completed').length;
  const remaining = fixtures.length - completed;
  const progress = progressOverDays(fixtures);
  const perDay = matchesPerDay(fixtures);
  const best = topTeams[0];

  outlet.innerHTML = `
    <h2 class="page-title"><i class="fa-solid fa-chart-column me-2"></i>Statistics</h2>
    <ul class="nav nav-tabs mb-3" role="tablist">
      <li class="nav-item" role="presentation">
        <button class="nav-link active" data-bs-toggle="tab" data-bs-target="#stats-tab-overview" type="button" role="tab" aria-selected="true">
          <i class="fa-solid fa-chart-column me-1"></i>Overview
        </button>
      </li>
      <li class="nav-item" role="presentation">
        <button class="nav-link" data-bs-toggle="tab" data-bs-target="#stats-tab-players" type="button" role="tab" aria-selected="false">
          <i class="fa-solid fa-users me-1"></i>All Players
        </button>
      </li>
      <li class="nav-item" role="presentation">
        <button class="nav-link" data-bs-toggle="tab" data-bs-target="#stats-tab-predictors" type="button" role="tab" aria-selected="false">
          <i class="fa-solid fa-crystal-ball me-1"></i>Predictors
        </button>
      </li>
    </ul>
    <div class="tab-content">
      <div class="tab-pane fade show active" id="stats-tab-overview" role="tabpanel">
        <div class="row g-3 mb-3">
          <div class="col-lg-4">
            <div class="card h-100"><div class="card-header">Completed vs Remaining</div>
              <div class="card-body"><div class="chart-box"><canvas id="chart-completion"></canvas></div></div></div>
          </div>
          <div class="col-lg-4">
            <div class="card h-100"><div class="card-header">Pool Performance (Wins)</div>
              <div class="card-body"><div class="chart-box"><canvas id="chart-pool-wins"></canvas></div></div></div>
          </div>
          <div class="col-lg-4">
            <div class="card h-100"><div class="card-header">Best Performing Team</div>
              <div class="card-body text-center d-flex flex-column justify-content-center h-100">
                ${best ? `<i class="fa-solid fa-medal fa-2x text-warning mb-2"></i>
                  <h5>${best.name}</h5>
                  <p class="text-muted mb-0">${best.won} wins &middot; ${best.points} pts &middot; ${best.pool}</p>` : '<p class="text-muted">No data yet</p>'}
              </div>
            </div>
          </div>
        </div>
        <div class="row g-3 mb-3">
          <div class="col-lg-6">
            <div class="card"><div class="card-header">Tournament Progress</div>
              <div class="card-body"><div class="chart-box"><canvas id="chart-progress"></canvas></div></div></div>
          </div>
          <div class="col-lg-6">
            <div class="card"><div class="card-header">Matches Per Day</div>
              <div class="card-body"><div class="chart-box"><canvas id="chart-per-day"></canvas></div></div></div>
          </div>
        </div>
        <div class="row g-3 mb-3">
          <div class="col-lg-6">
            <div class="card"><div class="card-header">Win Percentage (Top 8)</div>
              <div class="card-body"><div class="chart-box"><canvas id="chart-winpct"></canvas></div></div></div>
          </div>
          <div class="col-lg-6">
            <div class="card"><div class="card-header">Pool Comparison (Avg Points)</div>
              <div class="card-body"><div class="chart-box"><canvas id="chart-pool-compare"></canvas></div></div></div>
          </div>
        </div>
        <div class="card">
          <div class="card-header">Most Wins</div>
          <div class="card-body table-responsive">
            <table class="table table-dark table-hover mb-0">
              <thead><tr><th>#</th><th>Team</th><th>Pool</th><th>Won</th><th>Points</th></tr></thead>
              <tbody>${topTeams.map((t, i) => `<tr><td>${i + 1}</td><td>${t.name}</td><td>${t.pool}</td><td>${t.won}</td><td>${t.points}</td></tr>`).join('') || '<tr><td colspan="5" class="text-muted">No data yet</td></tr>'}</tbody>
            </table>
          </div>
        </div>
        <div class="row g-3 mt-1">
          <div class="col-lg-4">
            <div class="card h-100"><div class="card-header"><i class="fa-solid fa-circle-dot me-2"></i>Top Scorers</div>
              <div class="card-body">
                ${leaderboard.topScorers.length ? `<table class="table table-dark table-sm mb-0">
                  <tbody>${leaderboard.topScorers.map((p, i) => `<tr><td>${i + 1}</td><td>${p.name}<div class="small text-muted">${p.teamName}</div></td><td class="text-end fw-bold">${p.points}</td></tr>`).join('')}</tbody>
                </table>` : '<p class="text-muted small mb-0">No completed matches yet</p>'}
              </div>
            </div>
          </div>
          <div class="col-lg-4">
            <div class="card h-100"><div class="card-header"><i class="fa-solid fa-crown me-2"></i>Most Queens Taken</div>
              <div class="card-body">
                ${leaderboard.topQueens.length ? `<table class="table table-dark table-sm mb-0">
                  <tbody>${leaderboard.topQueens.map((p, i) => `<tr><td>${i + 1}</td><td>${p.name}<div class="small text-muted">${p.teamName}</div></td><td class="text-end fw-bold">${p.queens}</td></tr>`).join('')}</tbody>
                </table>` : '<p class="text-muted small mb-0">No Queens taken yet</p>'}
              </div>
            </div>
          </div>
          <div class="col-lg-4">
            <div class="card h-100"><div class="card-header"><i class="fa-solid fa-shield-halved me-2"></i>Cleanest Play (Fewest Fouls)</div>
              <div class="card-body">
                ${leaderboard.cleanest.length ? `<table class="table table-dark table-sm mb-0">
                  <tbody>${leaderboard.cleanest.map((p, i) => `<tr><td>${i + 1}</td><td>${p.name}<div class="small text-muted">${p.teamName}</div></td><td class="text-end fw-bold">${p.fouls}</td></tr>`).join('')}</tbody>
                </table>` : '<p class="text-muted small mb-0">No data yet</p>'}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="tab-pane fade" id="stats-tab-players" role="tabpanel">
        <div class="card">
          <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
            <span><i class="fa-solid fa-users me-2"></i>All Players <span class="text-muted small">(${leaderboard.allPlayers.length})</span></span>
            <input type="text" class="form-control form-control-sm" id="stats-player-search" placeholder="Search player or team..." style="max-width:260px;">
          </div>
          <div class="card-body table-responsive">
            <table class="table table-dark table-hover table-sm mb-0">
              <thead><tr><th>#</th><th>Player</th><th>Team</th><th class="text-end">Points</th><th class="text-end">Queens</th><th class="text-end">Fouls</th></tr></thead>
              <tbody id="stats-all-players-body">${leaderboard.allPlayers.length ? leaderboard.allPlayers.map(allPlayersRow).join('') : '<tr><td colspan="6" class="text-muted">No completed matches yet</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="tab-pane fade" id="stats-tab-predictors" role="tabpanel">
        <div class="card">
          <div class="card-header"><i class="fa-solid fa-crystal-ball me-2"></i>Prediction Leaderboard <span class="text-muted small">&middot; teams ranked by matches called correctly</span></div>
          <div class="card-body table-responsive">
            <table class="table table-dark table-hover table-sm mb-0">
              <thead><tr><th>#</th><th>Team</th><th class="text-end">Predictions Made</th><th class="text-end">Correct</th><th class="text-end">Accuracy</th></tr></thead>
              <tbody>${predictors.length ? predictors.map((p, i) => `<tr><td>${i + 1}</td><td>${p.name}</td><td class="text-end">${p.made}</td><td class="text-end">${p.correct}</td><td class="text-end fw-bold">${p.accuracy}%</td></tr>`).join('') : '<tr><td colspan="5" class="text-muted">No predictions on completed matches yet</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`;

  outlet.querySelector('#stats-player-search')?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    outlet.querySelectorAll('#stats-all-players-body tr[data-name]').forEach((row) => {
      row.style.display = (row.dataset.name.includes(q) || row.dataset.team.includes(q)) ? '' : 'none';
    });
  });

  destroyAllCharts();
  renderChart('chart-completion', doughnutConfig(['Completed', 'Remaining'], [completed, remaining], ['#22C55E', '#334155']));
  renderChart('chart-pool-wins', barConfig(POOL_NAMES, poolWins, 'Wins'));
  renderChart('chart-progress', lineConfig(progress.labels.map((d) => d.slice(5)), progress.cumulative, 'Completed Matches'));
  renderChart('chart-per-day', barConfig(perDay.labels, perDay.values, 'Matches'));
  const top8 = [...teams].sort((a, b) => b.points - a.points).slice(0, 8);
  renderChart('chart-winpct', barConfig(top8.map((t) => t.name.split(' ')[0]), top8.map((t) => (t.played ? Math.round((t.won / t.played) * 100) : 0)), 'Win %'));
  const poolAvg = POOL_NAMES.map((pool) => {
    const pt = teams.filter((t) => t.pool === pool);
    return pt.length ? Math.round(pt.reduce((s, t) => s + t.points, 0) / pt.length) : 0;
  });
  renderChart('chart-pool-compare', radarConfig(POOL_NAMES, poolAvg, 'Avg Points'));

  return () => destroyAllCharts();
}
