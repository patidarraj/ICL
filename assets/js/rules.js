// Static rulebook content — sourced from the tournament's official rules document.
const FOULS = [
  ['Pocketing the striker', '1 warning'],
  ["Pocketing opponent's coin", '1 warning'],
  ['Time taken > 30 sec', '1 warning'],
  ['Touching coins with hand', '1 warning'],
  ['Talking, guiding, or making eye contact with partner', '1 warning'],
  ['Playing out of turn', '1 warning'],
];

const ALLOWED_MOVES = [
  ['Back Shot (striker comes back after hitting coin)', true],
  ['Thumb Shot (striking with thumb)', true],
  ["Left-hand Strike (if you're lefty)", true],
  ['Rebound Shot (using side walls)', true],
  ['Double Touch', false],
];

function section(icon, title, bodyHtml) {
  return `
    <div class="card mb-3">
      <div class="card-header"><i class="fa-solid ${icon} me-2"></i>${title}</div>
      <div class="card-body">${bodyHtml}</div>
    </div>`;
}

export async function renderRules(outlet) {
  outlet.innerHTML = `
    <h2 class="page-title"><i class="fa-solid fa-book me-2"></i>Rulebook</h2>

    <div class="rules-hero mb-4">
      <i class="fa-solid fa-bullseye fa-2x mb-2"></i>
      <h4 class="mb-1">Objective of the Game</h4>
      <p class="mb-0">Pot (pocket) all your assigned carrom coins (white or black), and finally the red coin (Queen), to win the game!</p>
    </div>

    ${section('fa-users', 'Team Format', `
      <ul class="mb-0">
        <li>Each team will have 2 players.</li>
        <li>Opponents sit diagonally opposite each other.</li>
      </ul>`)}

    ${section('fa-circle', 'Carrom Coins', `
      <p class="mb-0">There are 19 coins:</p>
      <div class="d-flex gap-3 mt-2 flex-wrap">
        <span class="coin-chip"><span class="coin coin-white"></span>9 White</span>
        <span class="coin-chip"><span class="coin coin-black"></span>9 Black</span>
        <span class="coin-chip"><span class="coin coin-red"></span>1 Red (Queen)</span>
      </div>`)}

    ${section('fa-rotate', 'Turn Rules', `
      <ul class="mb-0">
        <li>Each player gets 30 seconds for their turn.</li>
        <li>Turns go clockwise.</li>
        <li>You strike using the striker to pocket your own color coins.</li>
      </ul>`)}

    ${section('fa-medal', 'Who Gets Which Color?', `
      <p class="mb-0">The player/team who pockets the first coin gets to play with that color for the entire match.</p>`)}

    ${section('fa-crown', 'The Queen (Red Coin)', `
      <ul class="mb-0">
        <li><strong>Must be covered:</strong> after potting the red coin, you must pot your color coin in the same turn to cover it.</li>
        <li>If not covered, the red coin comes back to the center.</li>
      </ul>`)}

    ${section('fa-triangle-exclamation', 'Fouls (Things You Should NOT Do)', `
      <div class="table-responsive">
        <table class="table table-dark table-hover align-middle mb-2">
          <thead><tr><th>Foul</th><th>Result</th></tr></thead>
          <tbody>
            ${FOULS.map(([foul, result]) => `<tr><td>${foul}</td><td><span class="badge bg-warning text-dark">${result}</span></td></tr>`).join('')}
          </tbody>
        </table>
      </div>
      <p class="small text-muted mb-0">After 2 warnings, 1 demerit point will be given for every foul thereafter.</p>`)}

    ${section('fa-hand', 'Things to Avoid', `
      <ul class="mb-0">
        <li>No talking to your partner during play.</li>
        <li>No eye contact or signaling with your partner.</li>
        <li>No coaching your partner mid-turn.</li>
        <li>No touching coins with your hands.</li>
      </ul>`)}

    ${section('fa-gears', 'Allowed Moves', `
      <div class="table-responsive">
        <table class="table table-dark table-hover align-middle mb-0">
          <thead><tr><th>Move</th><th>Allowed?</th></tr></thead>
          <tbody>
            ${ALLOWED_MOVES.map(([move, ok]) => `<tr><td>${move}</td><td>${ok ? '<span class="badge bg-success">Yes</span>' : '<span class="badge bg-danger">No</span>'}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>`)}

    ${section('fa-calculator', 'How the Match Is Won', `
      <p class="mb-2">Each match is just <strong>one game</strong> — there's no best-of-3, whoever wins this single game wins the match.</p>
      <ul class="mb-0">
        <li>If a team pockets the Queen and covers it (see above), they win the match right away — even if the other team still has coins left on the table.</li>
        <li>If nobody pockets the Queen and the game ends another way (for example, time runs out), whichever team has <strong>fewer of their own coins left</strong> on the table wins the match.</li>
      </ul>`)}

    ${section('fa-hourglass-half', 'Time Limit', `
      <p class="mb-0">Max 30 seconds per shot. After that, a foul warning is issued.</p>`)}

    ${section('fa-flag-checkered', 'Referee', `
      <p class="mb-0">All matches are monitored by a referee.</p>`)}

    ${section('fa-note-sticky', 'Final Notes', `
      <ul class="mb-0">
        <li>Respect opponents and follow the rules.</li>
        <li>Keep the board and coins clean.</li>
        <li>Fair play = Fun play!</li>
      </ul>`)}
  `;
}
