import { getTeams, getFixtures, getBracket, saveBracket } from './storage.js';
import { POOL_NAMES, sortStandings, teamLogoUrl } from './utilities.js';
import { isAdminAuthed } from './storage.js';
import { notify } from './notifications.js';

const ALL_POOL_MATCHES = 50;

export function poolMatchesComplete(fixtures) {
  return fixtures.filter((f) => f.stage === 'pool' && f.status === 'completed').length >= ALL_POOL_MATCHES;
}

export function getQualifiers(teams) {
  const winners = [];
  const runnerUpsByPool = [];
  POOL_NAMES.forEach((pool) => {
    const ranked = sortStandings(teams.filter((t) => t.pool === pool));
    if (ranked[0]) winners.push(ranked[0]);
    if (ranked[1]) runnerUpsByPool.push(ranked[1]);
  });
  const wildcards = sortStandings(runnerUpsByPool).slice(0, 3);
  const seeded = sortStandings(winners).concat(wildcards);
  return seeded.slice(0, 8);
}

export async function generateBracket() {
  const teams = getTeams();
  const qualifiers = getQualifiers(teams);
  if (qualifiers.length < 8) return null;
  const seedPairs = [[0, 7], [3, 4], [2, 5], [1, 6]];
  const qf = seedPairs.map((pair, i) => ({
    id: `QF${i + 1}`, round: 'qf',
    teamA: qualifiers[pair[0]].id, teamB: qualifiers[pair[1]].id,
    scoreA: null, scoreB: null, winner: null, status: 'scheduled',
  }));
  const sf = [
    { id: 'SF1', round: 'sf', teamA: null, teamB: null, scoreA: null, scoreB: null, winner: null, status: 'pending' },
    { id: 'SF2', round: 'sf', teamA: null, teamB: null, scoreA: null, scoreB: null, winner: null, status: 'pending' },
  ];
  const thirdPlace = { id: 'TP', round: 'third', teamA: null, teamB: null, scoreA: null, scoreB: null, winner: null, status: 'pending' };
  const final = { id: 'F', round: 'final', teamA: null, teamB: null, scoreA: null, scoreB: null, winner: null, status: 'pending' };
  const bracket = { qf, sf, thirdPlace, final, champion: null };
  await saveBracket(bracket);
  return bracket;
}

export async function recordKnockoutResult(bracket, matchId, scoreA, scoreB) {
  const all = [...bracket.qf, ...bracket.sf, bracket.thirdPlace, bracket.final];
  const match = all.find((m) => m.id === matchId);
  if (!match || !match.teamA || !match.teamB) return bracket;
  match.scoreA = scoreA; match.scoreB = scoreB;
  match.winner = scoreA > scoreB ? match.teamA : match.teamB;
  match.status = 'completed';
  const loser = match.winner === match.teamA ? match.teamB : match.teamA;

  if (match.round === 'qf') {
    const idx = bracket.qf.findIndex((m) => m.id === matchId);
    const sfIndex = Math.floor(idx / 2);
    const slot = idx % 2 === 0 ? 'teamA' : 'teamB';
    bracket.sf[sfIndex][slot] = match.winner;
    if (bracket.sf[sfIndex].teamA && bracket.sf[sfIndex].teamB) bracket.sf[sfIndex].status = 'scheduled';
  } else if (match.round === 'sf') {
    const idx = bracket.sf.findIndex((m) => m.id === matchId);
    const slot = idx === 0 ? 'teamA' : 'teamB';
    bracket.final[slot] = match.winner;
    const tpSlot = idx === 0 ? 'teamA' : 'teamB';
    bracket.thirdPlace[tpSlot] = loser;
    if (bracket.final.teamA && bracket.final.teamB) bracket.final.status = 'scheduled';
    if (bracket.thirdPlace.teamA && bracket.thirdPlace.teamB) bracket.thirdPlace.status = 'scheduled';
  } else if (match.round === 'final') {
    bracket.champion = match.winner;
  }
  await saveBracket(bracket);
  return bracket;
}

function teamName(id, teamsById) {
  return id ? (teamsById[id]?.name || id) : 'TBD';
}

function matchCard(match, teamsById, canEdit, onScore) {
  const done = match.status === 'completed';
  return `
    <div class="bracket-match card ${done ? 'bracket-match-done' : ''}" data-match="${match.id}">
      <div class="bracket-match-header">${match.id}</div>
      <div class="bracket-team ${match.winner === match.teamA ? 'winner' : ''}">
        <span class="d-flex align-items-center gap-1">${match.teamA ? `<img src="${teamLogoUrl(match.teamA)}" alt="" class="team-logo" style="width:20px;height:20px;" onerror="this.style.display='none'">` : ''}${teamName(match.teamA, teamsById)}</span>
        ${done ? `<span class="score">${match.scoreA}</span>` : ''}
      </div>
      <div class="bracket-team ${match.winner === match.teamB ? 'winner' : ''}">
        <span class="d-flex align-items-center gap-1">${match.teamB ? `<img src="${teamLogoUrl(match.teamB)}" alt="" class="team-logo" style="width:20px;height:20px;" onerror="this.style.display='none'">` : ''}${teamName(match.teamB, teamsById)}</span>
        ${done ? `<span class="score">${match.scoreB}</span>` : ''}
      </div>
      ${canEdit && !done && match.teamA && match.teamB ? `
        <div class="bracket-score-entry d-flex gap-1 mt-2">
          <input type="number" min="0" class="form-control form-control-sm score-a" placeholder="A">
          <input type="number" min="0" class="form-control form-control-sm score-b" placeholder="B">
          <button class="btn btn-sm btn-primary btn-submit-score">Save</button>
        </div>` : ''}
    </div>`;
}

export async function renderBracket(outlet) {
  const teams = getTeams();
  const teamsById = Object.fromEntries(teams.map((t) => [t.id, t]));
  const fixtures = getFixtures();
  let bracket = getBracket();
  const canEdit = isAdminAuthed();

  if (!poolMatchesComplete(fixtures) && !bracket) {
    outlet.innerHTML = `
      <h2 class="page-title"><i class="fa-solid fa-sitemap me-2"></i>Knockout Bracket</h2>
      <div class="card"><div class="card-body text-center text-muted py-5">
        <i class="fa-solid fa-lock fa-2x mb-3"></i>
        <p>The knockout bracket will be generated once all pool matches are complete.<br>Completed: ${fixtures.filter((f) => f.stage === 'pool' && f.status === 'completed').length} / ${ALL_POOL_MATCHES}</p>
      </div></div>`;
    return;
  }

  if (!bracket) bracket = await generateBracket();

  function render() {
    outlet.innerHTML = `
      <h2 class="page-title"><i class="fa-solid fa-sitemap me-2"></i>Knockout Bracket</h2>
      <div class="bracket-scroll">
        <div class="bracket-round">
          <h6 class="bracket-round-title">Quarter Finals</h6>
          ${bracket.qf.map((m) => matchCard(m, teamsById, canEdit)).join('')}
        </div>
        <div class="bracket-round">
          <h6 class="bracket-round-title">Semi Finals</h6>
          ${bracket.sf.map((m) => matchCard(m, teamsById, canEdit)).join('')}
        </div>
        <div class="bracket-round">
          <h6 class="bracket-round-title">Final</h6>
          ${matchCard(bracket.final, teamsById, canEdit)}
          <h6 class="bracket-round-title mt-4">3rd Place</h6>
          ${matchCard(bracket.thirdPlace, teamsById, canEdit)}
        </div>
        <div class="bracket-round d-flex align-items-center justify-content-center">
          ${bracket.champion ? `
            <div class="champion-card text-center">
              <i class="fa-solid fa-trophy fa-3x text-warning mb-2 champion-icon"></i>
              <h4>Champion</h4>
              <h3 class="text-warning">${teamName(bracket.champion, teamsById)}</h3>
            </div>` : `<div class="text-muted text-center">Champion pending</div>`}
        </div>
      </div>`;

    outlet.querySelectorAll('.btn-submit-score').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const card = btn.closest('.bracket-match');
        const a = Number(card.querySelector('.score-a').value);
        const b = Number(card.querySelector('.score-b').value);
        if (Number.isNaN(a) || Number.isNaN(b) || a === b) {
          notify.warn('Enter valid, non-tied scores');
          return;
        }
        bracket = await recordKnockoutResult(bracket, card.dataset.match, a, b);
        if (bracket.champion) notify.success(`${teamName(bracket.champion, teamsById)} is the Champion!`, 'Tournament Complete');
        else notify.success('Result recorded, bracket updated');
        render();
      });
    });
  }

  render();
}
