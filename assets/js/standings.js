import { getTeams } from './storage.js';
import { POOL_NAMES, sortStandings, teamLogoHtml } from './utilities.js';

const MEDAL = ['fa-trophy', 'fa-medal', 'fa-medal'];

function podiumSpot(team, rank) {
  if (!team) return '<div class="podium-spot podium-empty"></div>';
  return `
    <div class="podium-spot podium-rank-${rank}">
      <div class="podium-crown"><i class="fa-solid fa-crown"></i></div>
      <div class="podium-avatar">${teamLogoHtml(team, 'podium-logo')}</div>
      <div class="podium-name">${team.name}</div>
      <div class="podium-players">${team.players.join(' & ')}</div>
      <div class="podium-pedestal">
        <div class="podium-medal"><i class="fa-solid ${MEDAL[rank - 1]}"></i></div>
        <div class="podium-points">${team.points} <span>pts</span></div>
        <div class="podium-rank-number">#${rank}</div>
      </div>
    </div>`;
}

// Qualification is per pool, not a global top-N cut — a global cutoff can end up marking a
// pool's #3 team "Qualified" (if their points happen to rank high overall) while a different
// pool's actual #1 misses out, which isn't how the knockout round actually works. Only the
// #1-ranked team within each individual pool qualifies.
function poolWinnerIds(teams) {
  return new Set(POOL_NAMES.map((pool) => sortStandings(teams.filter((t) => t.pool === pool))[0]?.id).filter(Boolean));
}

function leaderboardRow(t, i, qualifiedIds) {
  const qualifies = qualifiedIds.has(t.id);
  return `<tr class="${qualifies ? 'row-qualified' : ''}">
    <td class="text-muted">#${String(i + 1).padStart(3, '0')}</td>
    <td><div class="d-flex align-items-center gap-2">${teamLogoHtml(t)}<div>${t.name}<div class="small text-muted">${t.players.join(' & ')}</div></div></div></td>
    <td>${t.pool}</td>
    <td>${t.played}</td><td>${t.won}</td><td>${t.drawn || 0}</td><td>${t.lost}</td>
    <td class="fw-bold">${t.points}</td>
    <td>${t.nrr || 0}</td>
    <td>${qualifies ? '<span class="badge bg-success">Qualified</span>' : ''}</td>
  </tr>`;
}

function leaderboardPane(teams) {
  const ranked = sortStandings(teams);
  const [first, second, third] = ranked;
  const qualifiedIds = poolWinnerIds(teams);
  return `
    <div class="leaderboard-glow">
      <div class="leaderboard-podium">
        ${podiumSpot(second, 2)}
        ${podiumSpot(first, 1)}
        ${podiumSpot(third, 3)}
      </div>
      <div class="card leaderboard-table-card">
        <div class="card-header"><i class="fa-solid fa-list-ol me-2"></i>Full Leaderboard</div>
        <div class="card-body table-responsive p-0">
          <p class="text-muted small px-3 pt-3 mb-0"><span class="badge bg-success me-1">&nbsp;</span>The #1 team in each pool qualifies for the knockout round.</p>
          <table class="table table-dark table-hover align-middle mb-0">
            <thead><tr>
              <th>#</th><th>Team</th><th>Pool</th><th>P</th><th>W</th><th>D</th><th>L</th><th>Pts</th><th>NRR</th><th></th>
            </tr></thead>
            <tbody>${ranked.map((t, i) => leaderboardRow(t, i, qualifiedIds)).join('')}</tbody>
          </table>
        </div>
      </div>
    </div>`;
}

function standingsPane(teams) {
  return `
    <div class="row g-3">
      ${POOL_NAMES.map((pool) => {
        const poolTeams = sortStandings(teams.filter((t) => t.pool === pool));
        return `<div class="col-12">
          <div class="card standings-card mb-2">
            <div class="card-header"><i class="fa-solid fa-layer-group me-2"></i>${pool}</div>
            <div class="card-body table-responsive p-0">
              <table class="table table-dark table-hover align-middle mb-0">
                <thead><tr>
                  <th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>Pts</th><th>NRR</th>
                </tr></thead>
                <tbody>
                  ${poolTeams.map((t, i) => `<tr>
                    <td>${i + 1}</td>
                    <td><div class="d-flex align-items-center gap-2">${teamLogoHtml(t)}<div>${t.name}<div class="small text-muted">${t.players.join(' & ')}</div></div></div></td>
                    <td>${t.played}</td><td>${t.won}</td><td>${t.drawn || 0}</td><td>${t.lost}</td><td class="fw-bold">${t.points}</td>
                    <td>${t.nrr || 0}</td>
                  </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

export async function renderStandings(outlet) {
  const teams = getTeams();

  outlet.innerHTML = `
    <h2 class="page-title"><i class="fa-solid fa-ranking-star me-2"></i>Standings</h2>

    <ul class="nav nav-tabs mb-4" role="tablist">
      <li class="nav-item" role="presentation">
        <button class="nav-link active" data-bs-toggle="tab" data-bs-target="#st-pane-leaderboard" type="button" role="tab" aria-selected="true">
          <i class="fa-solid fa-trophy me-1"></i>Leaderboard
        </button>
      </li>
      <li class="nav-item" role="presentation">
        <button class="nav-link" data-bs-toggle="tab" data-bs-target="#st-pane-standings" type="button" role="tab" aria-selected="false">
          <i class="fa-solid fa-layer-group me-1"></i>Standings
        </button>
      </li>
    </ul>

    <div class="tab-content">
      <div class="tab-pane fade show active" id="st-pane-leaderboard" role="tabpanel">
        ${leaderboardPane(teams)}
      </div>
      <div class="tab-pane fade" id="st-pane-standings" role="tabpanel">
        ${standingsPane(teams)}
      </div>
    </div>`;
}
