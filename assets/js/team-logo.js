import { getTeams, updateTeamLogo } from './storage.js';
import { teamLogoHtml } from './utilities.js';
import { notify } from './notifications.js';

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_RAW_BYTES = 8 * 1024 * 1024;
// Firestore caps a document at 1MB total; leave headroom for the team's other fields
// (players, scores, etc.) so a huge logo can't push the whole document over the limit.
const MAX_ENCODED_BYTES = 700 * 1024;
// Progressively shrink dimension/quality until the encoded logo fits Firestore's budget —
// most uploads succeed on the first (highest-quality) attempt.
const COMPRESSION_LADDER = [
  { dimension: 480, format: 'png' },
  { dimension: 480, format: 'jpeg', quality: 0.85 },
  { dimension: 320, format: 'jpeg', quality: 0.75 },
  { dimension: 200, format: 'jpeg', quality: 0.6 },
];

function encodedByteLength(dataUrl) {
  return Math.round(dataUrl.length * 0.75);
}

function renderAtSize(img, dimension, format, quality) {
  let { width, height } = img;
  if (width > height && width > dimension) {
    height = Math.round((height * dimension) / width);
    width = dimension;
  } else if (height > dimension) {
    width = Math.round((width * dimension) / height);
    height = dimension;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);
  return format === 'png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', quality);
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // PNG keeps logo artwork (flat colors, sharp edges, text) crisp on the first,
      // highest-quality attempt; JPEG steps down further only if that's still too big.
      for (const step of COMPRESSION_LADDER) {
        const dataUrl = renderAtSize(img, step.dimension, step.format, step.quality);
        if (encodedByteLength(dataUrl) <= MAX_ENCODED_BYTES) { resolve(dataUrl); return; }
      }
      reject(new Error('too-large-after-compression'));
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
                <p class="text-muted small">Team names below are auto-generated placeholders — look up your team by your and your partner's names in the list instead.</p>
                <label class="form-label">Team</label>
                <select class="form-select mb-3" id="tl-team">
                  ${teams.map((t) => `<option value="${t.id}">${t.players.join(' & ')} &middot; ${t.name} &middot; ${t.pool}</option>`).join('')}
                </select>
                <label class="form-label">Access Code</label>
                <input type="text" class="form-control mb-3 text-uppercase" id="tl-code" placeholder="6-character code" maxlength="6">
                <label class="form-label">Logo Image</label>
                <input type="file" class="form-control mb-3" id="tl-file" accept="image/png,image/jpeg,image/webp">
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
    if (team.pendingLogoStatus === 'pending') {
      previewWrap.innerHTML += `<div class="small text-warning mt-2"><i class="fa-solid fa-clock me-1"></i>A logo is awaiting admin approval for this team.</div>`;
    }
  }
  teamSelect.addEventListener('change', showCurrentLogo);
  showCurrentLogo();

  outlet.querySelector('#tl-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) { notify.warn('Please choose a PNG, JPEG, or WEBP image'); return; }
    if (file.size > MAX_RAW_BYTES) { notify.warn('Image is too large — please choose a file under 8MB'); return; }
    try {
      pendingDataUrl = await compressImage(file);
      previewWrap.innerHTML = `<img src="${pendingDataUrl}" alt="" class="team-logo-preview">`;
    } catch (err) {
      if (err.message === 'too-large-after-compression') {
        notify.error('This image is too complex/detailed to fit our size limit — please try a simpler graphic or a lower-resolution image.');
      } else {
        notify.error('Could not read that image, try another file');
      }
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
      notify.success('Your logo has been submitted and is awaiting admin approval.', 'Submitted for Review');
      showCurrentLogo();
    } catch (err) {
      notify.error('Upload failed — please try again.');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-upload me-1"></i>Upload Logo';
    }
  });
}
