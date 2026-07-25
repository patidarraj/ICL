import { getTeams } from './storage.js';
import { POOL_NAMES, netDifference, sortStandings, teamLogoHtml } from './utilities.js';

export async function renderStandings(outlet) {
  const teams = getTeams();

  outlet.innerHTML = `
    <h2 class="page-title"><i class="fa-solid fa-ranking-star me-2"></i>Standings</h2>
    <div class="row g-3">
      ${POOL_NAMES.map((pool) => {
        const poolTeams = sortStandings(teams.filter((t) => t.pool === pool));
        return `<div class="col-12">
          <div class="card standings-card mb-2">
            <div class="card-header"><i class="fa-solid fa-layer-group me-2"></i>${pool}</div>
            <div class="card-body table-responsive p-0">
              <table class="table table-dark table-hover align-middle mb-0">
                <thead><tr>
                  <th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>Pts</th><th>Net Diff</th>
                </tr></thead>
                <tbody>
                  ${poolTeams.map((t, i) => `<tr>
                    <td>${i + 1}</td>
                    <td><div class="d-flex align-items-center gap-2">${teamLogoHtml(t)}<div>${t.name}<div class="small text-muted">${t.players.join(' & ')}</div></div></div></td>
                    <td>${t.played}</td><td>${t.won}</td><td>${t.drawn || 0}</td><td>${t.lost}</td><td class="fw-bold">${t.points}</td>
                    <td class="${netDifference(t) >= 0 ? 'text-success' : 'text-danger'}">${netDifference(t) >= 0 ? '+' : ''}${netDifference(t)}</td>
                  </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}
