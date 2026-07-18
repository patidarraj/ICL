import { getTeams } from './storage.js';
import { POOL_NAMES, netDifference, sortStandings, teamLogoHtml } from './utilities.js';

function qualificationTag(team, allInPool, poolRank, wildcardIds) {
  if (poolRank === 1) return '<span class="badge bg-success">Qualified</span>';
  if (wildcardIds.has(team.id)) return '<span class="badge bg-warning text-dark">Wildcard</span>';
  if (team.played === allInPool[0]?.played && team.played > 0) return '<span class="badge bg-secondary">Eliminated</span>';
  return '<span class="badge bg-secondary">In Contention</span>';
}

function bestRunnerUps(teams) {
  const runnerUps = POOL_NAMES.map((pool) => {
    const poolTeams = sortStandings(teams.filter((t) => t.pool === pool));
    return poolTeams[1];
  }).filter(Boolean);
  return new Set(sortStandings(runnerUps).slice(0, 3).map((t) => t.id));
}

export async function renderStandings(outlet) {
  const teams = getTeams();
  const wildcardIds = bestRunnerUps(teams);

  outlet.innerHTML = `
    <h2 class="page-title"><i class="fa-solid fa-ranking-star me-2"></i>Standings</h2>
    <div class="alert alert-info small"><i class="fa-solid fa-circle-info me-2"></i>Pool winners qualify directly. The best 3 runner-ups (by points, then net difference) advance as wildcards to complete the 8-team knockout stage.</div>
    <div class="row g-3">
      ${POOL_NAMES.map((pool) => {
        const poolTeams = sortStandings(teams.filter((t) => t.pool === pool));
        return `<div class="col-12">
          <div class="card standings-card mb-2">
            <div class="card-header"><i class="fa-solid fa-layer-group me-2"></i>${pool}</div>
            <div class="card-body table-responsive p-0">
              <table class="table table-dark table-hover align-middle mb-0">
                <thead><tr>
                  <th>#</th><th>Team</th><th>P</th><th>W</th><th>L</th><th>Pts</th><th>Net Diff</th><th>Status</th>
                </tr></thead>
                <tbody>
                  ${poolTeams.map((t, i) => `<tr class="${i === 0 ? 'row-qualified' : wildcardIds.has(t.id) ? 'row-wildcard' : ''}">
                    <td>${i + 1}</td>
                    <td><div class="d-flex align-items-center gap-2">${teamLogoHtml(t)}<div>${t.name}<div class="small text-muted">${t.players.join(' & ')}</div></div></div></td>
                    <td>${t.played}</td><td>${t.won}</td><td>${t.lost}</td><td class="fw-bold">${t.points}</td>
                    <td class="${netDifference(t) >= 0 ? 'text-success' : 'text-danger'}">${netDifference(t) >= 0 ? '+' : ''}${netDifference(t)}</td>
                    <td>${qualificationTag(t, poolTeams, i + 1, wildcardIds)}</td>
                  </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}
