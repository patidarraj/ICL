import {
  getTeams, saveTeams, getFixtures, saveFixtures, getSettings,
  isAdminAuthed, loginAdmin, logoutAdmin, refreshStandings, resetTournament, exportBackup, restoreBackup,
} from './storage.js';
import { uid, downloadFile, escapeHtml, POOL_NAMES, isoDate, VENUE, generateLogoCode } from './utilities.js';
import { notify } from './notifications.js';
import { generateBracket } from './bracket.js';

function loginForm(outlet, onSuccess) {
  outlet.innerHTML = `
    <div class="d-flex justify-content-center">
      <div class="card admin-login-card">
        <div class="card-body">
          <h4 class="text-center mb-3"><i class="fa-solid fa-lock me-2"></i>Admin Login</h4>
          <div class="mb-3">
            <label class="form-label">Password</label>
            <input type="password" class="form-control" id="admin-password" placeholder="Enter admin password">
          </div>
          <button class="btn btn-primary w-100" id="admin-login-btn">Login</button>
          <p class="small text-muted mt-3 mb-0 text-center">Signs in with the admin account you created in Firebase Authentication.</p>
        </div>
      </div>
    </div>`;
  const btn = outlet.querySelector('#admin-login-btn');
  const submit = async () => {
    const pw = outlet.querySelector('#admin-password').value;
    if (!pw) { notify.warn('Enter the admin password'); return; }
    btn.disabled = true;
    try {
      await loginAdmin(pw);
      notify.success('Welcome, admin');
      onSuccess();
    } catch (err) {
      notify.error('Incorrect password or account not set up yet');
    } finally {
      btn.disabled = false;
    }
  };
  btn.addEventListener('click', submit);
  outlet.querySelector('#admin-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
}

function teamRow(team) {
  return `<tr data-id="${team.id}">
    <td>${team.name}</td><td>${team.players.join(' & ')}</td><td>${team.pool}</td>
    <td>${team.won}/${team.played}</td>
    <td><code class="text-warning">${team.logoCode || '—'}</code></td>
    <td class="text-nowrap">
      <button class="btn btn-sm btn-outline-primary btn-edit-team" data-id="${team.id}"><i class="fa-solid fa-pen"></i></button>
      <button class="btn btn-sm btn-outline-danger btn-delete-team" data-id="${team.id}"><i class="fa-solid fa-trash"></i></button>
    </td>
  </tr>`;
}

function matchRow(f, teamsById) {
  return `<tr data-id="${f.id}">
    <td>${f.id}</td><td>${f.pool}</td>
    <td>${teamsById[f.teamA]?.name || f.teamA}</td><td>${teamsById[f.teamB]?.name || f.teamB}</td>
    <td>${f.status === 'completed' ? `${f.scoreA} - ${f.scoreB}` : '-'}</td>
    <td>
      ${f.status === 'scheduled'
        ? `<button class="btn btn-sm btn-success btn-enter-result" data-id="${f.id}"><i class="fa-solid fa-check"></i> Result</button>`
        : `<button class="btn btn-sm btn-outline-warning btn-undo-match" data-id="${f.id}"><i class="fa-solid fa-rotate-left"></i> Undo</button>`}
    </td>
  </tr>`;
}

function adminPanel(outlet) {
  const teams = getTeams();
  const fixtures = getFixtures();
  const teamsById = Object.fromEntries(teams.map((t) => [t.id, t]));
  const settings = getSettings();

  outlet.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h2 class="page-title mb-0"><i class="fa-solid fa-user-shield me-2"></i>Admin Panel</h2>
      <button class="btn btn-outline-danger btn-sm" id="admin-logout"><i class="fa-solid fa-right-from-bracket me-1"></i>Logout</button>
    </div>

    <div class="row g-3 mb-3">
      <div class="col-lg-4">
        <div class="card"><div class="card-body">
          <h6><i class="fa-solid fa-gears me-2"></i>Tournament Controls</h6>
          <div class="d-grid gap-2 mt-2">
            <button class="btn btn-outline-warning btn-sm" id="btn-generate-knockout"><i class="fa-solid fa-sitemap me-1"></i>Generate Knockout</button>
            <button class="btn btn-outline-danger btn-sm" id="btn-reset-tournament"><i class="fa-solid fa-triangle-exclamation me-1"></i>Reset Tournament</button>
          </div>
        </div></div>
      </div>
      <div class="col-lg-4">
        <div class="card"><div class="card-body">
          <h6><i class="fa-solid fa-file-export me-2"></i>Export</h6>
          <div class="d-grid gap-2 mt-2">
            <button class="btn btn-outline-primary btn-sm" id="btn-export-excel"><i class="fa-solid fa-file-excel me-1"></i>Export Excel</button>
            <button class="btn btn-outline-primary btn-sm" id="btn-export-pdf"><i class="fa-solid fa-file-pdf me-1"></i>Export PDF</button>
          </div>
        </div></div>
      </div>
      <div class="col-lg-4">
        <div class="card"><div class="card-body">
          <h6><i class="fa-solid fa-database me-2"></i>Backup / Restore</h6>
          <div class="d-grid gap-2 mt-2">
            <button class="btn btn-outline-success btn-sm" id="btn-backup"><i class="fa-solid fa-download me-1"></i>Backup Tournament</button>
            <label class="btn btn-outline-secondary btn-sm mb-0">
              <i class="fa-solid fa-upload me-1"></i>Restore Tournament
              <input type="file" id="btn-restore" accept=".json" hidden>
            </label>
          </div>
        </div></div>
      </div>
    </div>

    <div class="card mb-3">
      <div class="card-header d-flex justify-content-between align-items-center">
        <span><i class="fa-solid fa-people-group me-2"></i>Teams</span>
        <button class="btn btn-sm btn-success" id="btn-create-team"><i class="fa-solid fa-plus me-1"></i>Create Team</button>
      </div>
      <div class="card-body table-responsive">
        <table class="table table-dark table-hover align-middle mb-0">
          <thead><tr><th>Name</th><th>Players</th><th>Pool</th><th>W/P</th><th>Logo Code</th><th>Actions</th></tr></thead>
          <tbody id="admin-teams-body">${teams.map(teamRow).join('')}</tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-header d-flex justify-content-between align-items-center">
        <span><i class="fa-solid fa-table-list me-2"></i>Matches</span>
        <button class="btn btn-sm btn-success" id="btn-create-match"><i class="fa-solid fa-plus me-1"></i>Create Match</button>
      </div>
      <div class="card-body table-responsive">
        <table class="table table-dark table-hover align-middle mb-0">
          <thead><tr><th>#</th><th>Pool</th><th>Team A</th><th>Team B</th><th>Score</th><th>Action</th></tr></thead>
          <tbody id="admin-matches-body">${fixtures.map((f) => matchRow(f, teamsById)).join('')}</tbody>
        </table>
      </div>
    </div>

    <div class="modal fade" id="genericModal" tabindex="-1">
      <div class="modal-dialog"><div class="modal-content" id="genericModalContent"></div></div>
    </div>`;

  const modalEl = outlet.querySelector('#genericModal');
  const modal = new bootstrap.Modal(modalEl);
  const modalContent = outlet.querySelector('#genericModalContent');

  function openModal(html) {
    modalContent.innerHTML = html;
    modal.show();
  }

  function refreshTeamsBody(list) {
    outlet.querySelector('#admin-teams-body').innerHTML = list.map(teamRow).join('');
    bindTeamActions();
  }

  function refreshMatchesBody(fx, teamList) {
    const t = Object.fromEntries((teamList || getTeams()).map((x) => [x.id, x]));
    outlet.querySelector('#admin-matches-body').innerHTML = fx.map((f) => matchRow(f, t)).join('');
    bindMatchActions();
  }

  function bindTeamActions() {
    outlet.querySelectorAll('.btn-edit-team').forEach((btn) => btn.addEventListener('click', () => {
      const team = getTeams().find((t) => t.id === btn.dataset.id);
      openModal(`
        <div class="modal-header"><h5 class="modal-title">Edit Team</h5><button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>
        <div class="modal-body">
          <label class="form-label">Team Name</label><input class="form-control mb-2" id="m-name" value="${escapeHtml(team.name)}">
          <label class="form-label">Player 1</label><input class="form-control mb-2" id="m-p1" value="${escapeHtml(team.players[0])}">
          <label class="form-label">Player 2</label><input class="form-control mb-2" id="m-p2" value="${escapeHtml(team.players[1])}">
          <label class="form-label">Pool</label>
          <select class="form-select" id="m-pool">${POOL_NAMES.map((p) => `<option ${p === team.pool ? 'selected' : ''}>${p}</option>`).join('')}</select>
        </div>
        <div class="modal-footer"><button class="btn btn-primary" id="m-save">Save</button></div>`);
      modalContent.querySelector('#m-save').addEventListener('click', async () => {
        const list = getTeams().map((t) => (t.id === team.id ? { ...t } : t));
        const t = list.find((x) => x.id === team.id);
        t.name = modalContent.querySelector('#m-name').value.trim() || t.name;
        t.players = [modalContent.querySelector('#m-p1').value.trim(), modalContent.querySelector('#m-p2').value.trim()];
        t.pool = modalContent.querySelector('#m-pool').value;
        await saveTeams(list);
        modal.hide();
        refreshTeamsBody(list);
        notify.success('Team updated');
      });
    }));

    outlet.querySelectorAll('.btn-delete-team').forEach((btn) => btn.addEventListener('click', async () => {
      if (!confirm('Delete this team and all its matches?')) return;
      const list = getTeams().filter((t) => t.id !== btn.dataset.id);
      const fx = getFixtures().filter((f) => f.teamA !== btn.dataset.id && f.teamB !== btn.dataset.id);
      await saveTeams(list);
      await saveFixtures(fx);
      await refreshStandings();
      refreshTeamsBody(getTeams());
      refreshMatchesBody(fx, list);
      notify.success('Team deleted');
    }));
  }

  function bindMatchActions() {
    outlet.querySelectorAll('.btn-enter-result').forEach((btn) => btn.addEventListener('click', () => {
      const f = getFixtures().find((x) => x.id === btn.dataset.id);
      const t = Object.fromEntries(getTeams().map((x) => [x.id, x]));
      openModal(`
        <div class="modal-header"><h5 class="modal-title">Enter Result &middot; ${f.id}</h5><button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>
        <div class="modal-body">
          <div class="d-flex justify-content-between mb-2"><strong>${t[f.teamA]?.name}</strong><strong>${t[f.teamB]?.name}</strong></div>
          <div class="d-flex gap-2">
            <input type="number" min="0" class="form-control" id="m-score-a" placeholder="Score A">
            <input type="number" min="0" class="form-control" id="m-score-b" placeholder="Score B">
          </div>
        </div>
        <div class="modal-footer"><button class="btn btn-success" id="m-save-result">Save Result</button></div>`);
      modalContent.querySelector('#m-save-result').addEventListener('click', async () => {
        const a = Number(modalContent.querySelector('#m-score-a').value);
        const b = Number(modalContent.querySelector('#m-score-b').value);
        if (Number.isNaN(a) || Number.isNaN(b) || a === b) { notify.warn('Enter valid, non-tied scores'); return; }
        const fx = getFixtures().map((x) => (x.id === f.id ? { ...x } : x));
        const match = fx.find((x) => x.id === f.id);
        match.scoreA = a; match.scoreB = b;
        match.winner = a > b ? match.teamA : match.teamB;
        match.status = 'completed';
        await saveFixtures(fx);
        const updatedTeams = await refreshStandings();
        modal.hide();
        refreshMatchesBody(fx, updatedTeams);
        refreshTeamsBody(updatedTeams);
        notify.success('Result saved &middot; standings updated', 'Match Completed');
      });
    }));

    outlet.querySelectorAll('.btn-undo-match').forEach((btn) => btn.addEventListener('click', async () => {
      if (!confirm('Undo this match result?')) return;
      const fx = getFixtures().map((x) => (x.id === btn.dataset.id ? { ...x } : x));
      const match = fx.find((x) => x.id === btn.dataset.id);
      match.scoreA = null; match.scoreB = null; match.winner = null; match.status = 'scheduled';
      await saveFixtures(fx);
      const updatedTeams = await refreshStandings();
      refreshMatchesBody(fx, updatedTeams);
      refreshTeamsBody(updatedTeams);
      notify.info('Match result undone');
    }));
  }

  outlet.querySelector('#btn-create-team').addEventListener('click', () => {
    openModal(`
      <div class="modal-header"><h5 class="modal-title">Create Team</h5><button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>
      <div class="modal-body">
        <label class="form-label">Team Name</label><input class="form-control mb-2" id="m-name" placeholder="Team Name">
        <label class="form-label">Player 1</label><input class="form-control mb-2" id="m-p1" placeholder="Player 1">
        <label class="form-label">Player 2</label><input class="form-control mb-2" id="m-p2" placeholder="Player 2">
        <label class="form-label">Pool</label>
        <select class="form-select" id="m-pool">${POOL_NAMES.map((p) => `<option>${p}</option>`).join('')}</select>
      </div>
      <div class="modal-footer"><button class="btn btn-primary" id="m-save">Create</button></div>`);
    modalContent.querySelector('#m-save').addEventListener('click', async () => {
      const name = modalContent.querySelector('#m-name').value.trim();
      const p1 = modalContent.querySelector('#m-p1').value.trim();
      const p2 = modalContent.querySelector('#m-p2').value.trim();
      const pool = modalContent.querySelector('#m-pool').value;
      if (!name || !p1 || !p2) { notify.warn('All fields are required'); return; }
      const list = [...getTeams(), {
        id: uid('T'), name, players: [p1, p2], pool, played: 0, won: 0, lost: 0, points: 0, scoreFor: 0, scoreAgainst: 0,
        logoCode: generateLogoCode(),
      }];
      await saveTeams(list);
      modal.hide();
      refreshTeamsBody(list);
      notify.success('Team created');
    });
  });

  outlet.querySelector('#btn-create-match').addEventListener('click', () => {
    const list = getTeams();
    openModal(`
      <div class="modal-header"><h5 class="modal-title">Create Match</h5><button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>
      <div class="modal-body">
        <label class="form-label">Pool</label>
        <select class="form-select mb-2" id="m-pool">${POOL_NAMES.map((p) => `<option>${p}</option>`).join('')}</select>
        <label class="form-label">Team A</label>
        <select class="form-select mb-2" id="m-team-a">${list.map((t) => `<option value="${t.id}">${t.name}</option>`).join('')}</select>
        <label class="form-label">Team B</label>
        <select class="form-select mb-2" id="m-team-b">${list.map((t) => `<option value="${t.id}">${t.name}</option>`).join('')}</select>
        <label class="form-label">Date</label><input type="date" class="form-control mb-2" id="m-date" value="${isoDate(new Date())}">
        <label class="form-label">Time</label><input class="form-control" id="m-time" value="10:00 AM">
      </div>
      <div class="modal-footer"><button class="btn btn-primary" id="m-save">Create</button></div>`);
    modalContent.querySelector('#m-save').addEventListener('click', async () => {
      const a = modalContent.querySelector('#m-team-a').value;
      const b = modalContent.querySelector('#m-team-b').value;
      if (a === b) { notify.warn('Select two different teams'); return; }
      const date = modalContent.querySelector('#m-date').value;
      const fx = [...getFixtures(), {
        id: uid('M'), matchNumber: getFixtures().length + 1, stage: 'pool', pool: modalContent.querySelector('#m-pool').value,
        date, day: new Date(date).toLocaleDateString('en-US', { weekday: 'long' }), time: modalContent.querySelector('#m-time').value,
        venue: VENUE, teamA: a, teamB: b, scoreA: null, scoreB: null, status: 'scheduled', winner: null,
      }];
      await saveFixtures(fx);
      modal.hide();
      refreshMatchesBody(fx);
      notify.success('Match created');
    });
  });

  outlet.querySelector('#btn-generate-knockout').addEventListener('click', async () => {
    const b = await generateBracket();
    if (b) notify.success('Knockout bracket generated');
    else notify.error('Not enough qualified teams yet');
  });

  outlet.querySelector('#btn-reset-tournament').addEventListener('click', async () => {
    if (!confirm('This will erase all teams, matches, results and the bracket. Continue?')) return;
    await resetTournament();
    notify.warn('Tournament has been reset');
    adminPanel(outlet);
  });

  outlet.querySelector('#btn-export-excel').addEventListener('click', () => {
    const t = getTeams();
    const rows = t.map((x) => `<tr><td>${x.name}</td><td>${x.players.join(' & ')}</td><td>${x.pool}</td><td>${x.played}</td><td>${x.won}</td><td>${x.lost}</td><td>${x.points}</td></tr>`).join('');
    const html = `<table><tr><th>Team</th><th>Players</th><th>Pool</th><th>Played</th><th>Won</th><th>Lost</th><th>Points</th></tr>${rows}</table>`;
    downloadFile('teams_standings.xls', html, 'application/vnd.ms-excel');
    notify.success('Excel file exported');
  });

  outlet.querySelector('#btn-export-pdf').addEventListener('click', () => {
    const t = [...getTeams()].sort((a, b) => b.points - a.points);
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>Standings</title></head><body>
      <h2>${settings.tournamentName} — Standings</h2>
      <table border="1" cellpadding="6" cellspacing="0" width="100%">
        <tr><th>Team</th><th>Pool</th><th>Played</th><th>Won</th><th>Lost</th><th>Points</th></tr>
        ${t.map((x) => `<tr><td>${x.name}</td><td>${x.pool}</td><td>${x.played}</td><td>${x.won}</td><td>${x.lost}</td><td>${x.points}</td></tr>`).join('')}
      </table></body></html>`);
    win.document.close();
    win.print();
  });

  outlet.querySelector('#btn-backup').addEventListener('click', () => {
    downloadFile(`carrom_backup_${isoDate(new Date())}.json`, exportBackup());
    notify.success('Backup downloaded');
  });

  outlet.querySelector('#btn-restore').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await restoreBackup(reader.result);
        notify.success('Tournament restored');
        adminPanel(outlet);
      } catch (err) {
        notify.error('Invalid backup file');
      }
    };
    reader.readAsText(file);
  });

  outlet.querySelector('#admin-logout').addEventListener('click', async () => {
    await logoutAdmin();
    renderAdmin(outlet);
  });

  bindTeamActions();
  bindMatchActions();
}

export async function renderAdmin(outlet) {
  if (isAdminAuthed()) adminPanel(outlet);
  else loginForm(outlet, () => adminPanel(outlet));
}
