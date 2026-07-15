import { getTeams, getFixtures } from './storage.js';
import { POOL_NAMES } from './utilities.js';
import { renderChart, lineConfig, barConfig, doughnutConfig, radarConfig, destroyAllCharts } from './charts.js';

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

export async function renderStats(outlet) {
  const teams = getTeams();
  const fixtures = getFixtures();

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
    </div>`;

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
