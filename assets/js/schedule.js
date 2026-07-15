import { getTeams, getFixtures } from './storage.js';
import { formatDate, POOL_NAMES, toCSV, downloadFile } from './utilities.js';
import { notify } from './notifications.js';

let viewMode = 'list';

function statusBadge(f) {
  return f.status === 'completed'
    ? '<span class="badge bg-success">Completed</span>'
    : '<span class="badge bg-secondary">Scheduled</span>';
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

function listTable(fixtures, teamsById) {
  return `<div class="table-responsive">
    <table class="table table-dark table-hover align-middle" id="schedule-table">
      <thead><tr>
        <th>Date</th><th>Day</th><th>Pool</th><th>#</th><th>Team A</th><th></th><th>Team B</th><th>Time</th><th>Venue</th><th>Status</th><th>Winner</th>
      </tr></thead>
      <tbody>
        ${fixtures.map((f) => `<tr>
          <td>${formatDate(f.date)}</td><td>${f.day}</td><td>${f.pool}</td><td>${f.matchNumber}</td>
          <td>${teamsById[f.teamA]?.name || f.teamA}</td><td>vs</td><td>${teamsById[f.teamB]?.name || f.teamB}</td>
          <td>${f.time}</td><td>${f.venue}</td><td>${statusBadge(f)}</td>
          <td>${f.winner ? (teamsById[f.winner]?.name || '') : '-'}</td>
        </tr>`).join('') || '<tr><td colspan="11" class="text-center text-muted">No matches found</td></tr>'}
      </tbody>
    </table>
  </div>`;
}

function calendarView(fixtures, teamsById) {
  const byDate = {};
  fixtures.forEach((f) => { (byDate[f.date] = byDate[f.date] || []).push(f); });
  const dates = Object.keys(byDate).sort();
  return `<div class="calendar-grid">${dates.map((d) => `
    <div class="calendar-day-card card mb-3">
      <div class="card-header">${formatDate(d)}</div>
      <div class="card-body">
        ${byDate[d].map((f) => `<div class="calendar-match mb-2 pb-2 border-bottom border-secondary-subtle">
          <div class="d-flex justify-content-between">
            <strong>${f.pool}</strong> ${statusBadge(f)}
          </div>
          <div>${teamsById[f.teamA]?.name} <span class="text-muted">vs</span> ${teamsById[f.teamB]?.name}</div>
          <div class="small text-muted">${f.time} &middot; ${f.venue}</div>
        </div>`).join('')}
      </div>
    </div>`).join('')}</div>`;
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
        <button class="btn btn-outline-primary ${viewMode === 'list' ? 'active' : ''}" id="view-list">List View</button>
        <button class="btn btn-outline-primary ${viewMode === 'calendar' ? 'active' : ''}" id="view-calendar">Calendar View</button>
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
  outlet.querySelector('#btn-print').addEventListener('click', () => window.print());
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
