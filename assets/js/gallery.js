import {
  getGalleryPhotos, submitGalleryPhoto, getGalleryUsageBytes, GALLERY_SAFE_BUDGET_BYTES, GALLERY_WARN_BUDGET_BYTES,
} from './storage.js';
import { escapeHtml } from './utilities.js';
import { notify } from './notifications.js';

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_RAW_BYTES = 8 * 1024 * 1024;
const PER_PHOTO_BUDGET = 650 * 1024;
const COMPRESSION_LADDER = [
  { dimension: 1280, format: 'jpeg', quality: 0.82 },
  { dimension: 900, format: 'jpeg', quality: 0.75 },
  { dimension: 640, format: 'jpeg', quality: 0.65 },
  { dimension: 420, format: 'jpeg', quality: 0.55 },
];

function encodedByteLength(dataUrl) { return Math.round(dataUrl.length * 0.75); }

function renderAtSize(img, dimension, quality) {
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
  return canvas.toDataURL('image/jpeg', quality);
}

function compressImage(file, maxEncodedBytes) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      for (const step of COMPRESSION_LADDER) {
        const dataUrl = renderAtSize(img, step.dimension, step.quality);
        if (encodedByteLength(dataUrl) <= maxEncodedBytes) { resolve(dataUrl); return; }
      }
      reject(new Error('too-large-after-compression'));
    };
    img.onerror = () => reject(new Error('Could not read image'));
    img.src = URL.createObjectURL(file);
  });
}

function formatMB(bytes) { return `${Math.round(bytes / (1024 * 1024))} MB`; }

function photoTile(p) {
  return `
    <div class="gallery-tile">
      <img src="${p.photoBase64}" alt="${escapeHtml(p.caption || 'Tournament photo')}" loading="lazy">
      ${p.caption || p.submittedBy ? `<div class="gallery-tile-caption">
        ${p.caption ? `<div>${escapeHtml(p.caption)}</div>` : ''}
        ${p.submittedBy ? `<div class="small text-muted">by ${escapeHtml(p.submittedBy)}</div>` : ''}
      </div>` : ''}
    </div>`;
}

export async function renderGallery(outlet) {
  const photos = getGalleryPhotos();
  const approved = photos.filter((p) => p.status === 'approved').sort((a, b) => b.createdAt - a.createdAt);
  const usage = getGalleryUsageBytes();
  const atLimit = usage >= GALLERY_SAFE_BUDGET_BYTES;
  const nearLimit = usage >= GALLERY_WARN_BUDGET_BYTES;

  outlet.innerHTML = `
    <h2 class="page-title"><i class="fa-solid fa-images me-2"></i>Photo Gallery</h2>

    <div class="card mb-4">
      <div class="card-header"><i class="fa-solid fa-upload me-2"></i>Share a Photo</div>
      <div class="card-body">
        ${atLimit
          ? `<div class="alert alert-danger mb-0"><i class="fa-solid fa-triangle-exclamation me-2"></i>The gallery has reached its free storage limit for now — new uploads are paused until an admin clears some space. Thanks for understanding!</div>`
          : `
          ${nearLimit ? `<div class="alert alert-warning small mb-3"><i class="fa-solid fa-circle-info me-2"></i>The gallery is getting close to its free storage limit — uploads may be paused soon if it fills up.</div>` : ''}
          <p class="text-muted small">Your photo will be reviewed by an admin before it appears here publicly.</p>
          <input type="file" accept="image/png,image/jpeg,image/webp" class="form-control mb-2" id="gal-file">
          <input type="text" class="form-control mb-2" id="gal-name" placeholder="Your name (optional)">
          <input type="text" class="form-control mb-2" id="gal-caption" placeholder="Caption (optional)">
          <button class="btn btn-primary" id="gal-submit"><i class="fa-solid fa-paper-plane me-1"></i>Submit for Review</button>`}
      </div>
    </div>

    <div class="gallery-grid">
      ${approved.map(photoTile).join('') || '<p class="text-muted text-center py-4">No photos yet — be the first to share one!</p>'}
    </div>`;

  if (atLimit) return;

  outlet.querySelector('#gal-submit').addEventListener('click', async () => {
    const fileInput = outlet.querySelector('#gal-file');
    const file = fileInput.files[0];
    if (!file) { notify.warn('Choose a photo first'); return; }
    if (!ALLOWED_TYPES.includes(file.type)) { notify.warn('Please choose a PNG, JPEG, or WEBP image'); return; }
    if (file.size > MAX_RAW_BYTES) { notify.warn('Image is too large — please choose a file under 8MB'); return; }

    const btn = outlet.querySelector('#gal-submit');
    btn.disabled = true;
    try {
      const photoBase64 = await compressImage(file, PER_PHOTO_BUDGET);
      if (getGalleryUsageBytes() + encodedByteLength(photoBase64) > GALLERY_SAFE_BUDGET_BYTES) {
        notify.error('The gallery just hit its free storage limit — this upload was not saved. Please try again once an admin clears some space.');
        btn.disabled = false;
        return;
      }
      await submitGalleryPhoto({
        photoBase64,
        submittedBy: outlet.querySelector('#gal-name').value.trim(),
        caption: outlet.querySelector('#gal-caption').value.trim(),
      });
      notify.success('Thanks! Your photo is pending admin approval.');
      renderGallery(outlet);
    } catch (err) {
      notify.error('Could not process that image — please try a different photo');
      btn.disabled = false;
    }
  });
}

export { formatMB };
