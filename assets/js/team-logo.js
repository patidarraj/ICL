import { getTeams, uploadTeamLogo } from './storage.js';
import { teamLogoUrl } from './utilities.js';
import { notify } from './notifications.js';

export async function renderTeamLogo(outlet) {
  const teams = getTeams();

  outlet.innerHTML = `
    <h2 class="page-title"><i class="fa-solid fa-image me-2"></i>Upload Team Logo</h2>
    <div class="row justify-content-center">
      <div class="col-lg-6">
        <div class="card">
          <div class="card-body">
            <p class="text-muted small">Enter your team and the access code given to you by the tournament organizer, then choose an image to upload as your team's logo.</p>
            <label class="form-label">Team</label>
            <select class="form-select mb-3" id="tl-team">
              ${teams.map((t) => `<option value="${t.id}">${t.name} &middot; ${t.pool}</option>`).join('')}
            </select>
            <label class="form-label">Access Code</label>
            <input type="text" class="form-control mb-3 text-uppercase" id="tl-code" placeholder="6-character code" maxlength="6">
            <label class="form-label">Logo Image</label>
            <input type="file" class="form-control mb-3" id="tl-file" accept="image/*">
            <div class="text-center mb-3">
              <img id="tl-preview" src="" alt="Current logo preview" class="team-logo-preview d-none">
            </div>
            <button class="btn btn-primary w-100" id="tl-upload"><i class="fa-solid fa-upload me-1"></i>Upload Logo</button>
          </div>
        </div>
      </div>
    </div>`;

  const teamSelect = outlet.querySelector('#tl-team');
  const preview = outlet.querySelector('#tl-preview');

  function showCurrentLogo() {
    const teamId = teamSelect.value;
    preview.src = `${teamLogoUrl(teamId)}&t=${Date.now()}`;
    preview.classList.remove('d-none');
    preview.onerror = () => preview.classList.add('d-none');
  }
  teamSelect.addEventListener('change', showCurrentLogo);
  showCurrentLogo();

  outlet.querySelector('#tl-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    preview.src = URL.createObjectURL(file);
    preview.classList.remove('d-none');
  });

  outlet.querySelector('#tl-upload').addEventListener('click', async () => {
    const teamId = teamSelect.value;
    const code = outlet.querySelector('#tl-code').value.trim().toUpperCase();
    const file = outlet.querySelector('#tl-file').files[0];
    const btn = outlet.querySelector('#tl-upload');

    if (!code) { notify.warn('Enter your team access code'); return; }
    if (!file) { notify.warn('Choose an image file'); return; }
    if (!file.type.startsWith('image/')) { notify.warn('Please choose an image file'); return; }
    if (file.size > 3 * 1024 * 1024) { notify.warn('Image must be under 3MB'); return; }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i>Uploading...';
    try {
      await uploadTeamLogo(teamId, file, code);
      notify.success('Logo uploaded! It may take a minute to appear everywhere.', 'Upload Complete');
      showCurrentLogo();
    } catch (err) {
      notify.error('Upload failed — check your team and access code are correct.');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-upload me-1"></i>Upload Logo';
    }
  });
}
