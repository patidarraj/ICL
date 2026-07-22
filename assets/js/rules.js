// Static rulebook content — sourced from the tournament's official rules document.
const ALLOWED_MOVES = [
  ['Back Shot', true, 'Allowed only until the league (pool) matches are over'],
  ['Rebound Shot (off the walls)', true],
  ['Double Touch while striking hits hand (Striker)', false],
  ['Attempt to strike opponents coins', true],
];

const CASE_PENALTY = 'Case 1: the coin is pocketed — the pocketed coin is added back on the board. Case 2: no coin is pocketed — a coin is added on the board.';

const FOULS = [
  ['Touching any coin on the board with a hand', 'Chance skipped + one coin added'],
  ['Striker not fully covering the red circle', CASE_PENALTY],
  ['Striker not covering both base lines', CASE_PENALTY],
  ['Pocketing the striker', 'One coin removed + chance skipped'],
  ['Hand or body placed outside the imaginary diagonal line while taking a shot', 'One coin added + chance skipped'],
  ['Double-touching the striker', 'One coin added + chance skipped'],
  ['Talking to your team member during the match', 'One coin added + chance skipped'],
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

    ${section('fa-users', '1. Team Format', `
      <ul class="mb-0">
        <li>Each team must consist of <strong>2 players</strong>.</li>
        <li>Opponents must sit <strong>opposite each other</strong>.</li>
      </ul>`)}

    ${section('fa-circle', '2. Carrom Coins', `
      <p class="mb-2">Total coins: <strong>19</strong></p>
      <div class="d-flex gap-3 mb-3 flex-wrap">
        <span class="coin-chip"><span class="coin coin-white"></span>9 White</span>
        <span class="coin-chip"><span class="coin coin-black"></span>9 Black</span>
        <span class="coin-chip"><span class="coin coin-red"></span>1 Red (Queen)</span>
      </div>
      <ul class="mb-0">
        <li>If a coin lands on the black border and enters the pocket, it will <strong>not be considered pocketed</strong> — the umpire will place it back in the center.</li>
        <li>If a coin ends up in an upright position, it will <strong>not be touched</strong> — play continues as usual.</li>
      </ul>`)}

    ${section('fa-coins', '2.1 The Toss', `
      <ul class="mb-0">
        <li>The umpire hides one black coin and one white coin, one in each hand.</li>
        <li>A player must guess which coin is in the umpire's selected hand.</li>
        <li>The <strong>loser of the toss sits first</strong> and decides on their team's seating.</li>
        <li>If the guess is <strong>right</strong>, that player's team breaks and plays with white coins.</li>
      </ul>`)}

    ${section('fa-rotate', '3. Turn Rules', `
      <ul class="mb-0">
        <li>Turns proceed in a <strong>clockwise</strong> direction.</li>
        <li>The game has a <strong>time restriction of 20 minutes</strong>, until the league (pool) matches are over.</li>
        <li>Each individual shot is limited to <strong>30 seconds</strong>.</li>
      </ul>`)}

    ${section('fa-crown', '3.2 The Queen (Red Coin)', `
      <ul class="mb-0">
        <li><strong>Case 1:</strong> if in the same strike both the Queen and your own coin are pocketed, the Queen is considered covered — irrespective of the order.</li>
        <li><strong>Case 2:</strong> if the Queen and an opponent's coin are pocketed together, the Queen is <strong>not</strong> covered — you must pocket your own coin in the same turn to cover it.</li>
        <li>If not covered, the Queen is returned to the center of the board.</li>
      </ul>`)}

    ${section('fa-trophy', 'How the Match Is Won', `
      <p class="mb-0">Each match is a single game. To win, a team must pocket <strong>all of their own coins</strong> and cover the Queen.</p>`)}

    ${section('fa-scale-balanced', 'Draw Match', `
      <p class="mb-0">When the game time is over, the match is called a <strong>draw</strong>, and <strong>1 point</strong> is given to both teams.</p>`)}

    ${section('fa-calculator', 'NRR Rule', `
      <ul class="mb-0">
        <li>The <strong>winning team's NRR</strong> equals the Queen (counted as <strong>5 points</strong>) plus however many coins remain on the board for the losing team.</li>
        <li>In a <strong>draw</strong>, the Queen is not counted in the NRR — instead, the NRR is the difference in coins between the two teams, awarded to the team with <strong>fewer</strong> coins on their board.</li>
      </ul>`)}

    ${section('fa-gears', '4. Allowed Moves', `
      <div class="table-responsive">
        <table class="table table-dark table-hover align-middle mb-0">
          <thead><tr><th>Move</th><th>Allowed?</th></tr></thead>
          <tbody>
            ${ALLOWED_MOVES.map(([move, ok, note]) => `<tr><td>${move}${note ? `<div class="small text-muted">${note}</div>` : ''}</td><td>${ok ? '<span class="badge bg-success">Yes</span>' : '<span class="badge bg-danger">No</span>'}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>`)}

    ${section('fa-triangle-exclamation', '5.1 Fouls & Penalties', `
      <div class="table-responsive">
        <table class="table table-dark table-hover align-middle mb-0">
          <thead><tr><th>Foul</th><th>Penalty</th></tr></thead>
          <tbody>
            ${FOULS.map(([foul, penalty]) => `<tr><td>${foul}</td><td><span class="badge bg-warning text-dark">${penalty}</span></td></tr>`).join('')}
          </tbody>
        </table>
      </div>`)}

    ${section('fa-list-check', '5.2 Due Scenarios — When the Striker Is Pocketed', `
      <ul class="mb-0">
        <li><strong>Striker is pocketed:</strong> it's a foul — one coin is removed and the chance is skipped.</li>
        <li><strong>Striker + own coin(s) pocketed:</strong> the pocketed coin is removed, two coins are added, and the turn is retained.</li>
        <li><strong>Striker + opponent coin(s) pocketed:</strong> chance is skipped and one coin is added.</li>
        <li><strong>Striker + own coin + opponent coin pocketed:</strong> the pocketed coin is removed, one of your coins is added, and the turn is retained.</li>
      </ul>`)}

    ${section('fa-hand', '6. Audience Conduct', `
      <p class="mb-0">The audience is not allowed to communicate with players or umpires. Anyone found doing so will have to leave the playing area.</p>`)}

    ${section('fa-flag-checkered', '7. Match Officials (Exempt from Audience Conduct)', `
      <ul class="mb-0">
        <li>Umpire &amp; Match Referee</li>
        <li>Timer</li>
        <li>Scorer</li>
        <li>Camera Person</li>
      </ul>`)}

    ${section('fa-indian-rupee-sign', '8. Penalty Policy', `
      <p class="mb-0">A <strong>₹1,000 penalty</strong> applies for match absence. This comes from the absent player's own contribution rather than being a compulsory charge on the whole team, and is intended to encourage attendance.</p>`)}

    ${section('fa-note-sticky', 'Final Notes', `
      <ul class="mb-0">
        <li>Respect opponents and follow the rules.</li>
        <li>Keep the board and coins clean.</li>
        <li>Fair play = Fun play!</li>
      </ul>`)}
  `;
}
