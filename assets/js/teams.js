import { getTeams, getFixtures } from './storage.js';
import { POOL_NAMES, teamLogoUrl } from './utilities.js';
import { goTo } from './router.js';

let filters = { search: '', pool: '' };

function teamCard(team, fixtures) {
  const remaining = fixtures.filter((f) => f.stage === 'pool' && f.status === 'scheduled' && (f.teamA === team.id || f.teamB === team.id)).length;
  return `
    <div class="col-md-6 col-xl-4">
      <div class="card team-card h-100">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start mb-2">
            <div class="d-flex align-items-center gap-2">
              <img src="${teamLogoUrl(team.id)}" alt="" class="team-logo team-logo-lg" onerror="this.style.display='none'">
              <h5 class="card-title mb-0">${team.name}</h5>
            </div>
            <span class="badge bg-primary">${team.pool}</span>
          </div>
          <div class="team-players mb-3">
            <div><i class="fa-solid fa-user me-2 text-muted"></i>${team.players[0]}</div>
            <div><i class="fa-solid fa-user me-2 text-muted"></i>${team.players[1]}</div>
          </div>
          <div class="row text-center g-2 mb-3">
            <div class="col"><div class="fw-bold">${team.played}</div><div class="small text-muted">Played</div></div>
            <div class="col"><div class="fw-bold text-success">${team.won}</div><div class="small text-muted">Won</div></div>
            <div class="col"><div class="fw-bold text-danger">${team.lost}</div><div class="small text-muted">Lost</div></div>
            <div class="col"><div class="fw-bold text-warning">${team.points}</div><div class="small text-muted">Points</div></div>
            <div class="col"><div class="fw-bold">${remaining}</div><div class="small text-muted">Left</div></div>
          </div>
          <div class="d-flex gap-2">
            <button class="btn btn-sm btn-outline-primary flex-fill btn-view-fixtures" data-team="${team.id}">View Fixtures</button>
            <button class="btn btn-sm btn-outline-success flex-fill btn-view-results" data-team="${team.id}">View Results</button>
          </div>
        </div>
      </div>
    </div>`;
}

export async function renderTeams(outlet) {
  const teams = getTeams();
  const fixtures = getFixtures();

  outlet.innerHTML = `
    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
      <h2 class="page-title mb-0"><i class="fa-solid fa-people-group me-2"></i>Teams</h2>
      <button class="btn btn-outline-primary btn-sm" id="btn-goto-logo"><i class="fa-solid fa-image me-1"></i>Upload Your Team Logo</button>
    </div>
    <div class="card mb-3">
      <div class="card-body row g-2">
        <div class="col-md-6">
          <input type="text" class="form-control" id="team-search" placeholder="Search team or player...">
        </div>
        <div class="col-md-6">
          <select class="form-select" id="team-pool-filter">
            <option value="">All Pools</option>
            ${POOL_NAMES.map((p) => `<option value="${p}">${p}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>
    <div class="row g-3" id="teams-grid"></div>`;

  const grid = outlet.querySelector('#teams-grid');

  function update() {
    const filtered = teams.filter((t) => {
      if (filters.pool && t.pool !== filters.pool) return false;
      if (filters.search) {
        const s = filters.search.toLowerCase();
        if (!t.name.toLowerCase().includes(s) && !t.players.join(' ').toLowerCase().includes(s)) return false;
      }
      return true;
    });
    grid.innerHTML = filtered.map((t) => teamCard(t, fixtures)).join('') || '<p class="text-muted">No teams found</p>';
    grid.querySelectorAll('.btn-view-fixtures, .btn-view-results').forEach((btn) => {
      btn.addEventListener('click', () => {
        sessionStorage.setItem('carrom_team_filter', btn.dataset.team);
        goTo('schedule');
      });
    });
  }

  outlet.querySelector('#btn-goto-logo').addEventListener('click', () => goTo('team-logo'));
  outlet.querySelector('#team-search').addEventListener('input', (e) => { filters.search = e.target.value; update(); });
  outlet.querySelector('#team-pool-filter').addEventListener('change', (e) => { filters.pool = e.target.value; update(); });

  update();
}
