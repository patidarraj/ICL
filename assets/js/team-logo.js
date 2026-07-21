import { getTeams, updateTeamLogo, getSettings } from './storage.js';
import { teamLogoHtml, escapeHtml } from './utilities.js';
import { notify } from './notifications.js';

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_RAW_BYTES = 8 * 1024 * 1024;
// Firestore caps a whole DOCUMENT at ~1MB, and a team's existing approved logoBase64
// keeps sitting in that same document alongside a newly-submitted pendingLogoBase64 until
// an admin reviews it — so re-uploading a replacement logo must leave room for both to
// coexist, not just budget the new image on its own (that under-budgeted case previously
// made re-uploads fail for any team that already had a sizeable approved logo).
const TOTAL_DOC_BUDGET = 900 * 1024;
const PER_IMAGE_MAX = 650 * 1024;
const PER_IMAGE_MIN = 150 * 1024;
// Progressively shrink dimension/quality until the encoded logo fits its budget —
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

/** Leaves room for a team's existing approved logo to coexist during the review window. */
function budgetFor(existingLogoBase64) {
  const existingLen = existingLogoBase64 ? encodedByteLength(existingLogoBase64) : 0;
  return Math.min(PER_IMAGE_MAX, Math.max(PER_IMAGE_MIN, TOTAL_DOC_BUDGET - existingLen));
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

function compressImage(file, maxEncodedBytes) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // PNG keeps logo artwork (flat colors, sharp edges, text) crisp on the first,
      // highest-quality attempt; JPEG steps down further only if that's still too big.
      for (const step of COMPRESSION_LADDER) {
        const dataUrl = renderAtSize(img, step.dimension, step.format, step.quality);
        if (encodedByteLength(dataUrl) <= maxEncodedBytes) { resolve(dataUrl); return; }
      }
      reject(new Error('too-large-after-compression'));
    };
    img.onerror = () => reject(new Error('Could not read image'));
    img.src = URL.createObjectURL(file);
  });
}

function galleryTile(team) {
  return `
    <div class="logo-gallery-tile text-center">
      ${teamLogoHtml(team, 'team-logo-gallery')}
      <div class="fw-semibold mt-2">${team.name}</div>
      <div class="small text-muted">${team.players.join(' & ')}</div>
    </div>`;
}

/** Small inline logo for the print view — a real uploaded logo, or a colored initial badge if none yet. */
function printLogo(team) {
  if (team?.logoBase64) return `<img src="${team.logoBase64}" alt="" class="print-logo">`;
  const initial = (team?.name || '?').trim()[0]?.toUpperCase() || '?';
  return `<span class="print-logo print-logo-placeholder">${initial}</span>`;
}

function printLogoTile(team) {
  return `
    <div class="print-logo-tile">
      ${printLogo(team)}
      <div class="print-logo-name">${escapeHtml(team.name)}</div>
      <div class="print-logo-players">${escapeHtml(team.players.join(' & '))}</div>
    </div>`;
}

function printLogoGallery(teams, settings) {
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>${escapeHtml(settings.tournamentName || 'Team Logos')} — Team Logos</title>
    <style>
      body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 24px; }
      h1 { margin-bottom: 4px; }
      p { margin-top: 0; color: #444; }
      .print-logo-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; margin-top: 20px; }
      .print-logo-tile { border: 1px solid #999; border-radius: 8px; padding: 10px; text-align: center; break-inside: avoid; }
      .print-logo { width: 96px; height: 96px; object-fit: contain; border-radius: 8px; border: 1px solid #ccc; padding: 4px; }
      .print-logo-placeholder { display: inline-flex; align-items: center; justify-content: center; background: #ddd; font-weight: bold; font-size: 2.5rem; color: #555; }
      .print-logo-name { font-weight: bold; margin-top: 8px; }
      .print-logo-players { font-size: 12px; color: #555; }
      @media print { body { margin: 8px; } .print-logo-grid { grid-template-columns: repeat(4, 1fr); } }
    </style>
    </head><body>
    <h1>${escapeHtml(settings.tournamentName || 'Tournament')}</h1>
    <p>${escapeHtml(settings.organizer || '')} &middot; Team Logos</p>
    <div class="print-logo-grid">${teams.map(printLogoTile).join('')}</div>
    </body></html>`);
  win.document.close();
  win.focus();
  win.print();
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
            <div class="d-flex justify-content-end mb-3">
              <button class="btn btn-sm btn-outline-secondary" id="tl-print"><i class="fa-solid fa-print me-1"></i>Print Logos</button>
            </div>
            <div class="logo-gallery-grid">
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
                <p class="text-muted small">Team names below are auto-generated placeholders — search by your and your partner's names instead.</p>
                <label class="form-label">Team</label>
                <div class="team-search position-relative mb-3">
                  <input type="text" class="form-control" id="tl-team-search" placeholder="Search by your name, partner's name, or team name..." autocomplete="off">
                  <input type="hidden" id="tl-team-id">
                  <div class="team-search-dropdown" id="tl-team-dropdown"></div>
                </div>
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

  outlet.querySelector('#tl-print').addEventListener('click', () => printLogoGallery(teams, getSettings()));

  const teamSearchInput = outlet.querySelector('#tl-team-search');
  const teamIdInput = outlet.querySelector('#tl-team-id');
  const teamDropdown = outlet.querySelector('#tl-team-dropdown');
  const previewWrap = outlet.querySelector('#tl-preview-wrap');
  let pendingDataUrl = null;

  function teamLabel(t) {
    return `${t.players.join(' & ')} · ${t.name} · ${t.pool}`;
  }

  function showCurrentLogo() {
    pendingDataUrl = null;
    if (!teamIdInput.value) {
      previewWrap.innerHTML = '<p class="text-muted small mb-0">Search and select your team above to see its current logo.</p>';
      return;
    }
    const team = getTeams().find((t) => t.id === teamIdInput.value);
    previewWrap.innerHTML = teamLogoHtml(team, 'team-logo-preview');
    if (team.pendingLogoStatus === 'pending') {
      previewWrap.innerHTML += `<div class="small text-warning mt-2"><i class="fa-solid fa-clock me-1"></i>A logo is awaiting admin approval for this team.</div>`;
    }
  }

  function selectTeam(team) {
    teamIdInput.value = team.id;
    teamSearchInput.value = teamLabel(team);
    teamDropdown.classList.remove('show');
    showCurrentLogo();
  }

  function renderDropdown(query) {
    const q = query.trim().toLowerCase();
    const matches = q
      ? teams.filter((t) => teamLabel(t).toLowerCase().includes(q))
      : teams;
    if (!matches.length) {
      teamDropdown.innerHTML = '<div class="team-search-empty">No matching team</div>';
    } else {
      teamDropdown.innerHTML = matches.map((t) => `<div class="team-search-item" data-id="${t.id}">${teamLabel(t)}</div>`).join('');
      teamDropdown.querySelectorAll('.team-search-item').forEach((item) => {
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          selectTeam(teams.find((t) => t.id === item.dataset.id));
        });
      });
    }
    teamDropdown.classList.add('show');
  }

  teamSearchInput.addEventListener('focus', () => renderDropdown(teamSearchInput.value));
  teamSearchInput.addEventListener('input', () => {
    teamIdInput.value = '';
    renderDropdown(teamSearchInput.value);
    showCurrentLogo();
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.team-search')) teamDropdown.classList.remove('show');
  });

  showCurrentLogo();

  outlet.querySelector('#tl-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) { notify.warn('Please choose a PNG, JPEG, or WEBP image'); return; }
    if (file.size > MAX_RAW_BYTES) { notify.warn('Image is too large — please choose a file under 8MB'); return; }
    try {
      const team = getTeams().find((t) => t.id === teamIdInput.value);
      pendingDataUrl = await compressImage(file, budgetFor(team?.logoBase64));
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
    const teamId = teamIdInput.value;
    const code = outlet.querySelector('#tl-code').value.trim().toUpperCase();
    const btn = outlet.querySelector('#tl-upload');
    const team = getTeams().find((t) => t.id === teamId);

    if (!team) { notify.warn('Search and select your team first'); return; }
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
