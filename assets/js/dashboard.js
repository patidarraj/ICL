import { getTeams, getFixtures, getSettings } from './storage.js';
import { formatDate, POOL_NAMES } from './utilities.js';
import { goTo } from './router.js';

function progressCard(fixtures) {
  const total = fixtures.length;
  const completed = fixtures.filter((f) => f.status === 'completed').length;
  const pct = total ? Math.round((completed / total) * 100) : 0;
  return { total, completed, remaining: total - completed, pct };
}

function summaryCards(teams, fixtures) {
  const { total, completed, remaining, pct } = progressCard(fixtures);
  const cards = [
    { label: 'Total Players', value: teams.length * 2, icon: 'fa-user-group', color: 'primary' },
    { label: 'Total Teams', value: teams.length, icon: 'fa-people-group', color: 'success' },
    { label: 'Pools', value: POOL_NAMES.length, icon: 'fa-layer-group', color: 'warning' },
    { label: 'Total Matches', value: total, icon: 'fa-table-list', color: 'primary' },
    { label: 'Completed Matches', value: completed, icon: 'fa-check-double', color: 'success' },
    { label: 'Remaining Matches', value: remaining, icon: 'fa-hourglass-half', color: 'danger' },
  ];
  return `<div class="row g-3 mb-4">${cards.map((c) => `
    <div class="col-6 col-md-4 col-xl-2">
      <div class="stat-card card h-100">
        <div class="card-body text-center">
          <i class="fa-solid ${c.icon} stat-icon text-${c.color}"></i>
          <div class="stat-value">${c.value}</div>
          <div class="stat-label">${c.label}</div>
        </div>
      </div>
    </div>`).join('')}</div>
    <div class="card mb-4">
      <div class="card-body">
        <div class="d-flex justify-content-between mb-2">
          <span class="fw-semibold">Tournament Progress</span><span>${pct}%</span>
        </div>
        <div class="progress" style="height:14px;">
          <div class="progress-bar progress-bar-striped progress-bar-animated bg-primary" style="width:${pct}%"></div>
        </div>
      </div>
    </div>`;
}

function matchRow(f, teamsById) {
  const a = teamsById[f.teamA]?.name || f.teamA;
  const b = teamsById[f.teamB]?.name || f.teamB;
  const badge = f.status === 'completed'
    ? `<span class="badge bg-success">Completed</span>`
    : `<span class="badge bg-secondary">Scheduled</span>`;
  return `<tr>
    <td>${f.id}</td><td>${f.pool}</td><td>${a}</td><td>vs</td><td>${b}</td>
    <td>${f.time}</td><td>${badge}</td>
  </tr>`;
}

function nextMatchCard(fixtures, teamsById) {
  const next = fixtures.find((f) => f.status === 'scheduled');
  if (!next) return `<div class="card"><div class="card-body text-center text-muted">All matches completed</div></div>`;
  return `
    <div class="card next-match-card">
      <div class="card-body text-center">
        <div class="text-uppercase small text-muted mb-2">Next Match &middot; ${next.pool}</div>
        <div class="d-flex align-items-center justify-content-center gap-3 flex-wrap">
          <div class="fw-bold fs-5">${teamsById[next.teamA]?.name}</div>
          <span class="badge bg-primary">VS</span>
          <div class="fw-bold fs-5">${teamsById[next.teamB]?.name}</div>
        </div>
        <div class="text-muted mt-2"><i class="fa-regular fa-clock me-1"></i>${formatDate(next.date)} &middot; ${next.time}</div>
      </div>
    </div>`;
}

function countdownToFinal(settings) {
  const finalDate = new Date(settings.startDate);
  finalDate.setDate(finalDate.getDate() + 40);
  const now = new Date();
  const diffDays = Math.max(0, Math.ceil((finalDate - now) / 86400000));
  return `<div class="card"><div class="card-body text-center">
    <div class="text-uppercase small text-muted">Estimated Countdown to Final</div>
    <div class="display-6 fw-bold text-warning">${diffDays} days</div>
  </div></div>`;
}

export async function renderDashboard(outlet) {
  const teams = getTeams();
  const fixtures = getFixtures();
  const settings = getSettings();
  const teamsById = Object.fromEntries(teams.map((t) => [t.id, t]));
  const todayIso = new Date().toISOString().slice(0, 10);
  const todayMatches = fixtures.filter((f) => f.date === todayIso);
  const upcoming = fixtures.filter((f) => f.status === 'scheduled').slice(0, 5);
  const latestResults = [...fixtures].filter((f) => f.status === 'completed').slice(-5).reverse();

  outlet.innerHTML = `
    <div class="hero-section mb-4">
      <div class="hero-content">
        <h1>${settings.tournamentName}</h1>
        <p class="mb-1"><i class="fa-solid fa-user-tie me-2"></i>${settings.organizer}</p>
        <p class="mb-1"><i class="fa-solid fa-location-dot me-2"></i>${settings.venue}</p>
        <p class="mb-0"><i class="fa-regular fa-calendar me-2"></i>${formatDate(settings.startDate)} &nbsp;
          <span class="badge bg-warning text-dark ms-2">${settings.status}</span>
        </p>
      </div>
    </div>
    ${summaryCards(teams, fixtures)}
    <div class="row g-3 mb-4">
      <div class="col-lg-8">
        <div class="card h-100">
          <div class="card-header d-flex justify-content-between align-items-center">
            <span><i class="fa-solid fa-calendar-day me-2"></i>Today's Matches</span>
            <button class="btn btn-sm btn-outline-primary" id="dash-view-schedule">View Schedule</button>
          </div>
          <div class="card-body table-responsive">
            ${todayMatches.length ? `<table class="table table-dark table-hover align-middle mb-0">
              <thead><tr><th>#</th><th>Pool</th><th>Team A</th><th></th><th>Team B</th><th>Time</th><th>Status</th></tr></thead>
              <tbody>${todayMatches.map((f) => matchRow(f, teamsById)).join('')}</tbody>
            </table>` : `<p class="text-muted mb-0">No matches scheduled today.</p>`}
          </div>
        </div>
      </div>
      <div class="col-lg-4 d-flex flex-column gap-3">
        ${nextMatchCard(fixtures, teamsById)}
        ${countdownToFinal(settings)}
      </div>
    </div>
    <div class="row g-3">
      <div class="col-lg-6">
        <div class="card h-100">
          <div class="card-header"><i class="fa-solid fa-list-check me-2"></i>Upcoming Matches</div>
          <div class="card-body table-responsive">
            <table class="table table-dark table-hover align-middle mb-0">
              <thead><tr><th>#</th><th>Pool</th><th>Team A</th><th></th><th>Team B</th><th>Date</th></tr></thead>
              <tbody>${upcoming.map((f) => `<tr><td>${f.id}</td><td>${f.pool}</td><td>${teamsById[f.teamA]?.name}</td><td>vs</td><td>${teamsById[f.teamB]?.name}</td><td>${formatDate(f.date)}</td></tr>`).join('') || '<tr><td colspan="6" class="text-muted">None</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="col-lg-6">
        <div class="card h-100">
          <div class="card-header"><i class="fa-solid fa-trophy me-2"></i>Latest Results</div>
          <div class="card-body table-responsive">
            <table class="table table-dark table-hover align-middle mb-0">
              <thead><tr><th>#</th><th>Team A</th><th>Score</th><th>Team B</th><th>Winner</th></tr></thead>
              <tbody>${latestResults.map((f) => `<tr><td>${f.id}</td><td>${teamsById[f.teamA]?.name}</td><td>${f.scoreA} - ${f.scoreB}</td><td>${teamsById[f.teamB]?.name}</td><td class="text-success fw-semibold">${teamsById[f.winner]?.name || '-'}</td></tr>`).join('') || '<tr><td colspan="5" class="text-muted">No results yet</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`;

  outlet.querySelector('#dash-view-schedule')?.addEventListener('click', () => goTo('schedule'));
}
