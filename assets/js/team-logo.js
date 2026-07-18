import { getTeams, updateTeamLogo } from './storage.js';
import { teamLogoHtml } from './utilities.js';
import { notify } from './notifications.js';

const MAX_DIMENSION = 200;
const JPEG_QUALITY = 0.7;

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > MAX_DIMENSION) {
        height = Math.round((height * MAX_DIMENSION) / width);
        width = MAX_DIMENSION;
      } else if (height > MAX_DIMENSION) {
        width = Math.round((width * MAX_DIMENSION) / height);
        height = MAX_DIMENSION;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
    };
    img.onerror = () => reject(new Error('Could not read image'));
    img.src = URL.createObjectURL(file);
  });
}

export async function renderTeamLogo(outlet) {
  const teams = getTeams();

  outlet.innerHTML = `
    <h2 class="page-title"><i class="fa-solid fa-image me-2"></i>Upload Team Logo</h2>
    <div class="row justify-content-center">
      <div class="col-lg-6">
        <div class="card">
          <div class="card-body">
            <p class="text-muted small">Enter your team and the access code given to you by the tournament organizer, then choose an image to upload as your team's logo. Images are resized automatically.</p>
            <label class="form-label">Team</label>
            <select class="form-select mb-3" id="tl-team">
              ${teams.map((t) => `<option value="${t.id}">${t.name} &middot; ${t.pool}</option>`).join('')}
            </select>
            <label class="form-label">Access Code</label>
            <input type="text" class="form-control mb-3 text-uppercase" id="tl-code" placeholder="6-character code" maxlength="6">
            <label class="form-label">Logo Image</label>
            <input type="file" class="form-control mb-3" id="tl-file" accept="image/*">
            <div class="text-center mb-3" id="tl-preview-wrap"></div>
            <button class="btn btn-primary w-100" id="tl-upload"><i class="fa-solid fa-upload me-1"></i>Upload Logo</button>
          </div>
        </div>
      </div>
    </div>`;

  const teamSelect = outlet.querySelector('#tl-team');
  const previewWrap = outlet.querySelector('#tl-preview-wrap');
  let pendingDataUrl = null;

  function showCurrentLogo() {
    pendingDataUrl = null;
    const team = getTeams().find((t) => t.id === teamSelect.value);
    previewWrap.innerHTML = teamLogoHtml(team, 'team-logo-preview');
  }
  teamSelect.addEventListener('change', showCurrentLogo);
  showCurrentLogo();

  outlet.querySelector('#tl-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { notify.warn('Please choose an image file'); return; }
    if (file.size > 8 * 1024 * 1024) { notify.warn('Image is too large — please choose a smaller file'); return; }
    try {
      pendingDataUrl = await compressImage(file);
      previewWrap.innerHTML = `<img src="${pendingDataUrl}" alt="" class="team-logo-preview">`;
    } catch (err) {
      notify.error('Could not read that image, try another file');
    }
  });

  outlet.querySelector('#tl-upload').addEventListener('click', async () => {
    const teamId = teamSelect.value;
    const code = outlet.querySelector('#tl-code').value.trim().toUpperCase();
    const btn = outlet.querySelector('#tl-upload');
    const team = getTeams().find((t) => t.id === teamId);

    if (!code) { notify.warn('Enter your team access code'); return; }
    if (team.logoCode && code !== team.logoCode) { notify.error('That access code doesn\'t match this team'); return; }
    if (!pendingDataUrl) { notify.warn('Choose an image file'); return; }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i>Uploading...';
    try {
      await updateTeamLogo(teamId, pendingDataUrl);
      notify.success('Logo uploaded!', 'Upload Complete');
    } catch (err) {
      notify.error('Upload failed — please try again.');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-upload me-1"></i>Upload Logo';
    }
  });
}
