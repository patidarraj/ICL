import { getTeams, updateTeamLogo } from './storage.js';
import { teamLogoHtml } from './utilities.js';
import { notify } from './notifications.js';

const MAX_DIMENSION = 480;
const JPEG_QUALITY = 0.9;

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
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);
      // PNG keeps logo artwork (flat colors, sharp edges, text) crisp; JPEG introduces
      // blur/ringing artifacts on that kind of graphic that made uploaded logos look fuzzy.
      const isPhotographic = /\.(jpe?g)$/i.test(file.name) && !file.type.includes('png');
      resolve(isPhotographic ? canvas.toDataURL('image/jpeg', JPEG_QUALITY) : canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Could not read image'));
    img.src = URL.createObjectURL(file);
  });
}

function galleryTile(team) {
  return `
    <div class="col-6 col-sm-4 col-md-3 col-lg-2 text-center">
      <div class="logo-gallery-tile">
        ${teamLogoHtml(team, 'team-logo-gallery')}
        <div class="fw-semibold mt-2 text-truncate">${team.name}</div>
        <div class="small text-muted text-truncate">${team.players.join(' & ')}</div>
      </div>
    </div>`;
}

export async function renderTeamLogo(outlet) {
  const teams = getTeams();

  outlet.innerHTML = `
    <h2 class="page-title"><i class="fa-solid fa-image me-2"></i>Team Logos</h2>

    <ul class="nav nav-tabs mb-4" role="tablist">
      <li class="nav-item" role="presentation">
        <button class="nav-link active" data-bs-toggle="tab" data-bs-target="#tl-pane-gallery" type="button" role="tab" aria-selected="true">
          <i class="fa-solid fa-images me-1"></i>Logos
        </button>
      </li>
      <li class="nav-item" role="presentation">
        <button class="nav-link" data-bs-toggle="tab" data-bs-target="#tl-pane-upload" type="button" role="tab" aria-selected="false">
          <i class="fa-solid fa-upload me-1"></i>Upload
        </button>
      </li>
    </ul>

    <div class="tab-content">
      <div class="tab-pane fade show active" id="tl-pane-gallery" role="tabpanel">
        <div class="card">
          <div class="card-body">
            <div class="row g-3">
              ${teams.map(galleryTile).join('')}
            </div>
          </div>
        </div>
      </div>

      <div class="tab-pane fade" id="tl-pane-upload" role="tabpanel">
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
