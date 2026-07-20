import { getTeams, getFixtures, getSettings } from './storage.js';
import { formatDate, POOL_NAMES, toCSV, downloadFile, teamLogoHtml, isoDate, escapeHtml } from './utilities.js';
import { notify } from './notifications.js';

let viewMode = 'list';

function statusBadge(f) {
  if (f.status === 'completed') return '<span class="badge bg-success">Completed</span>';
  if (f.isLive) return `<span class="badge bg-danger"><i class="fa-solid fa-circle fa-2xs me-1"></i>LIVE ${f.liveScoreA ?? 0}-${f.liveScoreB ?? 0}</span>`;
  return '<span class="badge bg-secondary">Scheduled</span>';
}

function filterFixtures(fixtures, teamsById, filters) {
  return fixtures.filter((f) => {
    if (filters.pool && f.pool !== filters.pool) return false;
    if (filters.team && f.teamA !== filters.team && f.teamB !== filters.team) return false;
    if (filters.date && f.date !== filters.date) return false;
    if (filters.status && f.status !== filters.status) return false;
    if (filters.search) {
      const s = filters.search.toLowerCase();
      const a = (teamsById[f.teamA]?.name || '').toLowerCase();
      const b = (teamsById[f.teamB]?.name || '').toLowerCase();
      if (!a.includes(s) && !b.includes(s) && !f.id.toLowerCase().includes(s)) return false;
    }
    return true;
  });
}

const POOL_ACCENTS = ['#3B82F6', '#22C55E', '#F97316', '#A855F7', '#EC4899'];

function poolAccent(pool) {
  const idx = POOL_NAMES.indexOf(pool);
  return POOL_ACCENTS[idx >= 0 ? idx % POOL_ACCENTS.length : 0];
}

function matchListRow(f, teamsById) {
  const teamA = teamsById[f.teamA];
  const teamB = teamsById[f.teamB];
  const done = f.status === 'completed';
  const aWon = done && f.winner === f.teamA;
  const bWon = done && f.winner === f.teamB;
  return `
    <div class="schedule-list-row ${done ? 'schedule-list-row-done' : ''}" style="--pool-accent:${poolAccent(f.pool)};">
      <div class="schedule-list-date">
        <div class="fw-semibold">${formatDate(f.date)}</div>
        <div class="small text-muted"><i class="fa-regular fa-clock me-1"></i>${f.time}</div>
      </div>
      <div class="schedule-list-meta">
        <span class="badge" style="background:${poolAccent(f.pool)};">${f.pool}</span>
        <span class="small text-muted">#${f.matchNumber}</span>
      </div>
      <div class="schedule-list-teams">
        <div class="schedule-team ${aWon ? 'winner' : ''}">
          ${teamLogoHtml(teamA, 'team-logo')}
          <span>${teamA?.name || f.teamA}</span>
          ${done ? `<span class="score">${f.scoreA}</span>` : ''}
        </div>
        <span class="schedule-vs">VS</span>
        <div class="schedule-team ${bWon ? 'winner' : ''}">
          ${teamLogoHtml(teamB, 'team-logo')}
          <span>${teamB?.name || f.teamB}</span>
          ${done ? `<span class="score">${f.scoreB}</span>` : ''}
        </div>
      </div>
      <div class="schedule-list-status">
        ${statusBadge(f)}
        <div class="small text-muted text-truncate"><i class="fa-solid fa-location-dot me-1"></i>${f.venue}</div>
      </div>
    </div>`;
}

function listTable(fixtures, teamsById) {
  if (!fixtures.length) return '<p class="text-muted mb-0 text-center py-4">No matches found</p>';
  return `<div class="schedule-list" id="schedule-table">${fixtures.map((f) => matchListRow(f, teamsById)).join('')}</div>`;
}

function matchTimelineCard(f, teamsById) {
  const teamA = teamsById[f.teamA];
  const teamB = teamsById[f.teamB];
  const done = f.status === 'completed';
  const aWon = done && f.winner === f.teamA;
  const bWon = done && f.winner === f.teamB;
  return `
    <div class="schedule-match-card ${done ? 'schedule-match-done' : ''}">
      <div class="schedule-match-meta">
        <span class="badge bg-primary">${f.pool}</span>
        <span class="small text-muted">#${f.matchNumber}</span>
        <span class="small text-muted"><i class="fa-regular fa-clock me-1"></i>${f.time}</span>
        ${statusBadge(f)}
      </div>
      <div class="schedule-match-teams">
        <div class="schedule-team ${aWon ? 'winner' : ''}">
          ${teamLogoHtml(teamA, 'team-logo')}
          <span>${teamA?.name || f.teamA}</span>
          ${done ? `<span class="score">${f.scoreA}</span>` : ''}
        </div>
        <span class="schedule-vs">VS</span>
        <div class="schedule-team ${bWon ? 'winner' : ''}">
          ${teamLogoHtml(teamB, 'team-logo')}
          <span>${teamB?.name || f.teamB}</span>
          ${done ? `<span class="score">${f.scoreB}</span>` : ''}
        </div>
      </div>
    </div>`;
}

function calendarView(fixtures, teamsById) {
  const byDate = {};
  fixtures.forEach((f) => { (byDate[f.date] = byDate[f.date] || []).push(f); });
  const dates = Object.keys(byDate).sort();
  const todayIso = isoDate(new Date());

  if (!dates.length) return '<p class="text-muted mb-0">No matches found</p>';

  return `<div class="schedule-timeline">${dates.map((d) => {
    const isToday = d === todayIso;
    return `
    <div class="schedule-day-card ${isToday ? 'schedule-day-today' : ''}">
      <div class="schedule-day-header">
        <span>${formatDate(d)}</span>
        ${isToday ? '<span class="badge bg-warning text-dark ms-2">Today</span>' : ''}
      </div>
      <div class="schedule-day-matches">
        ${byDate[d].map((f) => matchTimelineCard(f, teamsById)).join('')}
      </div>
    </div>`;
  }).join('')}</div>`;
}

/** Small inline logo for the print view — a real uploaded logo, or a colored initial badge if none yet. */
function printLogo(team) {
  if (team?.logoBase64) return `<img src="${team.logoBase64}" alt="" class="print-logo">`;
  const initial = (team?.name || '?').trim()[0]?.toUpperCase() || '?';
  return `<span class="print-logo print-logo-placeholder">${initial}</span>`;
}

function printMatchRow(f, teamsById) {
  const teamA = teamsById[f.teamA];
  const teamB = teamsById[f.teamB];
  return `
    <tr>
      <td>${f.id}</td>
      <td>${f.pool}</td>
      <td class="print-team-cell">${printLogo(teamA)} ${escapeHtml(teamA?.name || f.teamA)}</td>
      <td class="text-center">vs</td>
      <td class="print-team-cell">${printLogo(teamB)} ${escapeHtml(teamB?.name || f.teamB)}</td>
      <td>${f.time}</td>
      <td>${f.status === 'completed' ? `${f.scoreA} - ${f.scoreB}` : '—'}</td>
    </tr>`;
}

function printSchedule(fixtures, teamsById, settings) {
  const byDate = {};
  fixtures.forEach((f) => { (byDate[f.date] = byDate[f.date] || []).push(f); });
  const dates = Object.keys(byDate).sort();

  const body = dates.length
    ? dates.map((d) => `
        <h3>${formatDate(d)}</h3>
        <table>
          <thead><tr><th>#</th><th>Pool</th><th>Team A</th><th></th><th>Team B</th><th>Time</th><th>Score</th></tr></thead>
          <tbody>${byDate[d].map((f) => printMatchRow(f, teamsById)).join('')}</tbody>
        </table>`).join('')
    : '<p>No matches match the current filters.</p>';

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>${escapeHtml(settings.tournamentName || 'Schedule')} — Schedule</title>
    <style>
      body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 24px; }
      h1 { margin-bottom: 4px; }
      h3 { margin-top: 28px; border-bottom: 2px solid #333; padding-bottom: 4px; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; font-size: 14px; }
      th { background: #eee; }
      .print-team-cell { display: table-cell; vertical-align: middle; }
      .print-logo { width: 24px; height: 24px; object-fit: contain; vertical-align: middle; margin-right: 6px; border-radius: 4px; border: 1px solid #ccc; }
      .print-logo-placeholder { display: inline-flex; align-items: center; justify-content: center; background: #ddd; font-weight: bold; }
      @media print { body { margin: 8px; } }
    </style>
    </head><body>
    <h1>${escapeHtml(settings.tournamentName || 'Tournament')}</h1>
    <p>${escapeHtml(settings.organizer || '')} &middot; ${escapeHtml(settings.venue || '')}</p>
    ${body}
    </body></html>`);
  win.document.close();
  win.focus();
  win.print();
}

export async function renderSchedule(outlet) {
  const teams = getTeams();
  const teamsById = Object.fromEntries(teams.map((t) => [t.id, t]));
  const fixtures = getFixtures();
  const filters = { pool: '', team: '', date: '', status: '', search: '' };

  outlet.innerHTML = `
    <h2 class="page-title"><i class="fa-solid fa-calendar-days me-2"></i>Match Schedule</h2>
    <div class="card mb-3">
      <div class="card-body">
        <div class="row g-2 align-items-end">
          <div class="col-md-2">
            <label class="form-label small">Pool</label>
            <select class="form-select form-select-sm" id="f-pool">
              <option value="">All Pools</option>
              ${POOL_NAMES.map((p) => `<option value="${p}">${p}</option>`).join('')}
            </select>
          </div>
          <div class="col-md-2">
            <label class="form-label small">Team</label>
            <select class="form-select form-select-sm" id="f-team">
              <option value="">All Teams</option>
              ${teams.map((t) => `<option value="${t.id}">${t.name}</option>`).join('')}
            </select>
          </div>
          <div class="col-md-2">
            <label class="form-label small">Date</label>
            <input type="date" class="form-control form-control-sm" id="f-date">
          </div>
          <div class="col-md-2">
            <label class="form-label small">Status</label>
            <select class="form-select form-select-sm" id="f-status">
              <option value="">All</option>
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <div class="col-md-2">
            <label class="form-label small">Search</label>
            <input type="text" class="form-control form-control-sm" id="f-search" placeholder="Team or match #">
          </div>
          <div class="col-md-2 d-flex gap-2">
            <button class="btn btn-sm btn-outline-secondary flex-fill" id="btn-print"><i class="fa-solid fa-print"></i></button>
            <button class="btn btn-sm btn-outline-primary flex-fill" id="btn-export"><i class="fa-solid fa-file-export"></i></button>
          </div>
        </div>
      </div>
    </div>
    <div class="d-flex justify-content-end mb-2">
      <div class="btn-group btn-group-sm" role="group">
        <button class="btn btn-outline-primary ${viewMode === 'list' ? 'active' : ''}" id="view-list"><i class="fa-solid fa-table-list me-1"></i>List View</button>
        <button class="btn btn-outline-primary ${viewMode === 'calendar' ? 'active' : ''}" id="view-calendar"><i class="fa-solid fa-timeline me-1"></i>Timeline View</button>
      </div>
    </div>
    <div class="card"><div class="card-body" id="schedule-container"></div></div>`;

  const container = outlet.querySelector('#schedule-container');

  function update() {
    const filtered = filterFixtures(fixtures, teamsById, filters);
    container.innerHTML = viewMode === 'list' ? listTable(filtered, teamsById) : calendarView(filtered, teamsById);
  }

  ['pool', 'team', 'date', 'status', 'search'].forEach((key) => {
    outlet.querySelector(`#f-${key}`).addEventListener('input', (e) => {
      filters[key] = e.target.value;
      update();
    });
  });

  outlet.querySelector('#view-list').addEventListener('click', () => { viewMode = 'list'; renderSchedule(outlet); });
  outlet.querySelector('#view-calendar').addEventListener('click', () => { viewMode = 'calendar'; renderSchedule(outlet); });
  outlet.querySelector('#btn-print').addEventListener('click', () => {
    const filtered = filterFixtures(fixtures, teamsById, filters);
    printSchedule(filtered, teamsById, getSettings());
  });
  outlet.querySelector('#btn-export').addEventListener('click', () => {
    const filtered = filterFixtures(fixtures, teamsById, filters);
    const rows = filtered.map((f) => ({
      Date: f.date, Day: f.day, Pool: f.pool, Match: f.matchNumber,
      TeamA: teamsById[f.teamA]?.name, TeamB: teamsById[f.teamB]?.name,
      Time: f.time, Venue: f.venue, Status: f.status,
      Winner: f.winner ? teamsById[f.winner]?.name : '',
    }));
    const csv = toCSV(rows, ['Date', 'Day', 'Pool', 'Match', 'TeamA', 'TeamB', 'Time', 'Venue', 'Status', 'Winner']);
    downloadFile('schedule.csv', csv, 'text/csv');
    notify.success('Schedule exported as CSV');
  });

  update();
}
