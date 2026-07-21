import { getTeams, getFixtures, getBracket, saveBracket } from './storage.js';
import { POOL_NAMES, sortStandings, teamLogoHtml } from './utilities.js';
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

function bracketStage(num, title, badge, body) {
  return `
    <div class="bracket-stage">
      <div class="bracket-stage-num">${num}</div>
      <div>
        <div class="bracket-stage-title">${title} ${badge ? `<span class="badge bg-secondary ms-1">${badge}</span>` : ''}</div>
        <div class="bracket-stage-body">${body}</div>
      </div>
    </div>`;
}

function bracketPathExplainer() {
  return `
    <div class="card">
      <div class="card-header"><i class="fa-solid fa-route me-2"></i>How 25 Teams Become 1 Champion</div>
      <div class="card-body">
        <p class="text-muted small mb-3">New to the format? Follow the lines left to right — 5 pools feed 8 seeded qualifiers, then it's a standard knockout bracket down to a single champion.</p>
        <div class="path-bracket-scroll mb-4">
          <div class="path-bracket">
            <div class="path-col">
              <div class="path-col-title">5 Pools</div>
              <div class="path-col-body">
                ${['1', '2', '3', '4', '5'].map((p) => `<div class="path-box path-box-pool">Pool ${p}<br><small>5 teams, round robin</small></div>`).join('')}
              </div>
            </div>
            <div class="path-col">
              <div class="path-col-title">8 Qualifiers</div>
              <div class="path-col-body">
                <div class="path-pair">
                  <div class="path-box path-box-seed">Seed 1</div>
                  <div class="path-box path-box-seed">Seed 8</div>
                </div>
                <div class="path-pair">
                  <div class="path-box path-box-seed">Seed 4</div>
                  <div class="path-box path-box-seed">Seed 5</div>
                </div>
                <div class="path-pair">
                  <div class="path-box path-box-seed">Seed 3</div>
                  <div class="path-box path-box-seed">Seed 6</div>
                </div>
                <div class="path-pair">
                  <div class="path-box path-box-seed">Seed 2</div>
                  <div class="path-box path-box-seed">Seed 7</div>
                </div>
              </div>
            </div>
            <div class="path-col">
              <div class="path-col-title">Quarterfinals</div>
              <div class="path-col-body">
                <div class="path-pair">
                  <div class="path-box path-box-qf">QF1 Winner</div>
                  <div class="path-box path-box-qf">QF2 Winner</div>
                </div>
                <div class="path-pair">
                  <div class="path-box path-box-qf">QF3 Winner</div>
                  <div class="path-box path-box-qf">QF4 Winner</div>
                </div>
              </div>
            </div>
            <div class="path-col">
              <div class="path-col-title">Semifinals</div>
              <div class="path-col-body">
                <div class="path-pair">
                  <div class="path-box path-box-sf">SF1 Winner</div>
                  <div class="path-box path-box-sf">SF2 Winner</div>
                </div>
              </div>
            </div>
            <div class="path-col">
              <div class="path-col-title">Final</div>
              <div class="path-col-body path-col-body-center">
                <div class="path-box path-box-champ"><i class="fa-solid fa-trophy me-2"></i>Champion</div>
              </div>
            </div>
          </div>
        </div>
        ${bracketStage(1, 'Pool Stage', '50 matches', `All 25 teams are split into <strong>5 pools (A&ndash;E) of 5 teams</strong>. Inside a pool, every team plays every other team once &mdash; <strong>4 matches each</strong>, 10 matches per pool, 50 in total.`)}
        ${bracketStage(2, 'Qualification', '8 advance', `The <strong>winner of each pool</strong> (5 teams) advances automatically. The remaining 3 spots go to <strong>wildcards</strong> &mdash; the best 3 runners-up across all pools, ranked by points. That's <strong>5 + 3 = 8 qualifiers</strong>, seeded 1&ndash;8.`)}
        ${bracketStage(3, 'Quarterfinals', '4 matches', `Seeded so the strongest teams face the weakest first: <strong>1 vs 8, 4 vs 5, 3 vs 6, 2 vs 7</strong>.`)}
        ${bracketStage(4, 'Semifinals', '', `<strong>QF1 winner vs QF2 winner</strong> &rarr; SF1. <strong>QF3 winner vs QF4 winner</strong> &rarr; SF2.`)}
        ${bracketStage(5, 'Third-Place Match &amp; Final', '', `The two <strong>semifinal losers</strong> play off for third place. The two <strong>semifinal winners</strong> meet in the <strong>Final</strong> &mdash; its winner is Champion.`)}
      </div>
    </div>`;
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
        <span class="d-flex align-items-center gap-1">${match.teamA ? teamLogoHtml(teamsById[match.teamA], 'team-logo-sm') : ''}${teamName(match.teamA, teamsById)}</span>
        ${done ? `<span class="score">${match.scoreA}</span>` : ''}
      </div>
      <div class="bracket-team ${match.winner === match.teamB ? 'winner' : ''}">
        <span class="d-flex align-items-center gap-1">${match.teamB ? teamLogoHtml(teamsById[match.teamB], 'team-logo-sm') : ''}${teamName(match.teamB, teamsById)}</span>
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
  const locked = !poolMatchesComplete(fixtures) && !bracket;

  outlet.innerHTML = `
    <h2 class="page-title"><i class="fa-solid fa-sitemap me-2"></i>Knockout Bracket</h2>
    <ul class="nav nav-tabs mb-4" role="tablist">
      <li class="nav-item" role="presentation">
        <button class="nav-link active" data-bs-toggle="tab" data-bs-target="#bk-pane-bracket" type="button" role="tab" aria-selected="true">
          <i class="fa-solid fa-sitemap me-1"></i>Bracket
        </button>
      </li>
      <li class="nav-item" role="presentation">
        <button class="nav-link" data-bs-toggle="tab" data-bs-target="#bk-pane-path" type="button" role="tab" aria-selected="false">
          <i class="fa-solid fa-route me-1"></i>Tournament Path
        </button>
      </li>
    </ul>
    <div class="tab-content">
      <div class="tab-pane fade show active" id="bk-pane-bracket" role="tabpanel"></div>
      <div class="tab-pane fade" id="bk-pane-path" role="tabpanel">${bracketPathExplainer()}</div>
    </div>`;

  const bracketPane = outlet.querySelector('#bk-pane-bracket');

  if (locked) {
    const completedPoolMatches = fixtures.filter((f) => f.stage === 'pool' && f.status === 'completed').length;
    const pct = Math.round((completedPoolMatches / ALL_POOL_MATCHES) * 100);
    bracketPane.innerHTML = `
      <div class="card"><div class="card-body text-center py-4">
        <i class="fa-solid fa-lock fa-2x mb-3 text-muted"></i>
        <p class="mb-2">The knockout bracket unlocks automatically once all pool matches are complete.</p>
        <div class="progress mx-auto mb-2" style="height:14px; max-width:420px;">
          <div class="progress-bar bg-primary" style="width:${pct}%"></div>
        </div>
        <p class="text-muted small mb-0">${completedPoolMatches} / ${ALL_POOL_MATCHES} pool matches completed</p>
      </div></div>`;
    return;
  }

  if (!bracket) bracket = await generateBracket();

  function render() {
    bracketPane.innerHTML = `
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

    bracketPane.querySelectorAll('.btn-submit-score').forEach((btn) => {
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
