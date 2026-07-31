import {
  getGalleryPhotos, submitGalleryPhoto, uploadGalleryVideo, submitGalleryVideo,
  getGalleryUsageBytes, GALLERY_SAFE_BUDGET_BYTES, GALLERY_WARN_BUDGET_BYTES,
} from './storage.js';
import { escapeHtml } from './utilities.js';
import { notify } from './notifications.js';

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'];
const MAX_RAW_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_RAW_VIDEO_BYTES = 300 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 90;
const PER_PHOTO_BUDGET = 650 * 1024;
const COMPRESSION_LADDER = [
  { dimension: 1280, format: 'jpeg', quality: 0.82 },
  { dimension: 900, format: 'jpeg', quality: 0.75 },
  { dimension: 640, format: 'jpeg', quality: 0.65 },
  { dimension: 420, format: 'jpeg', quality: 0.55 },
];
const VIDEO_MAX_WIDTH = 854; // 480p-ish, keeps output small while staying watchable
const VIDEO_BITRATE = 1_500_000;

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

// Re-encodes the video at a lower resolution/bitrate by playing it into a canvas and
// recording that with MediaRecorder — no server/ffmpeg needed, runs entirely client-side.
// Takes roughly as long as the clip's own duration to run (it plays it back once).
function compressVideo(file) {
  return new Promise((resolve, reject) => {
    if (typeof MediaRecorder === 'undefined') { reject(new Error('unsupported')); return; }
    const videoEl = document.createElement('video');
    videoEl.muted = false;
    videoEl.playsInline = true;
    videoEl.src = URL.createObjectURL(file);

    videoEl.addEventListener('loadedmetadata', () => {
      if (videoEl.duration > MAX_VIDEO_SECONDS) {
        reject(new Error('too-long'));
        return;
      }
      const scale = Math.min(1, VIDEO_MAX_WIDTH / videoEl.videoWidth);
      const w = Math.round(videoEl.videoWidth * scale);
      const h = Math.round(videoEl.videoHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      const canvasStream = canvas.captureStream(30);

      try {
        const sourceStream = videoEl.captureStream ? videoEl.captureStream() : videoEl.mozCaptureStream();
        sourceStream.getAudioTracks().forEach((t) => canvasStream.addTrack(t));
      } catch { /* audio capture unsupported — ship video-only rather than fail the whole upload */ }

      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : (MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : '');
      if (!mime) { reject(new Error('unsupported')); return; }

      const recorder = new MediaRecorder(canvasStream, { mimeType: mime, videoBitsPerSecond: VIDEO_BITRATE });
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
      recorder.onerror = () => reject(new Error('Could not process that video'));

      let raf;
      function draw() {
        if (videoEl.paused || videoEl.ended) return;
        ctx.drawImage(videoEl, 0, 0, w, h);
        raf = requestAnimationFrame(draw);
      }
      videoEl.addEventListener('ended', () => { cancelAnimationFrame(raf); recorder.stop(); });
      recorder.start();
      videoEl.play().then(draw).catch(() => reject(new Error('Could not play that video for compression')));
    });
    videoEl.addEventListener('error', () => reject(new Error('Could not read video')));
  });
}

function formatMB(bytes) { return `${Math.round(bytes / (1024 * 1024))} MB`; }

function mediaTile(p) {
  if (p.type === 'video') {
    return `
      <div class="gallery-tile">
        <video src="${p.videoUrl}" controls preload="metadata" class="gallery-tile-video"></video>
        ${p.caption || p.submittedBy ? `<div class="gallery-tile-caption">
          ${p.caption ? `<div>${escapeHtml(p.caption)}</div>` : ''}
          ${p.submittedBy ? `<div class="small text-muted">by ${escapeHtml(p.submittedBy)}</div>` : ''}
        </div>` : ''}
      </div>`;
  }
  return `
    <div class="gallery-tile">
      <img src="${p.photoBase64}" alt="${escapeHtml(p.caption || 'Tournament photo')}" loading="lazy"
        class="gallery-photo-zoomable" tabindex="0"
        data-photo-src="${p.photoBase64}" data-photo-caption="${escapeHtml(p.caption || '')}" data-photo-by="${escapeHtml(p.submittedBy || '')}">
      ${p.caption || p.submittedBy ? `<div class="gallery-tile-caption">
        ${p.caption ? `<div>${escapeHtml(p.caption)}</div>` : ''}
        ${p.submittedBy ? `<div class="small text-muted">by ${escapeHtml(p.submittedBy)}</div>` : ''}
      </div>` : ''}
    </div>`;
}

async function uploadOnePhoto(file, submittedBy, caption) {
  const photoBase64 = await compressImage(file, PER_PHOTO_BUDGET);
  if (getGalleryUsageBytes() + encodedByteLength(photoBase64) > GALLERY_SAFE_BUDGET_BYTES) {
    throw new Error('storage-full');
  }
  await submitGalleryPhoto({ photoBase64, submittedBy, caption });
}

async function uploadOneVideo(file, submittedBy, caption) {
  const blob = await compressVideo(file);
  const { videoUrl, storagePath } = await uploadGalleryVideo(blob);
  await submitGalleryVideo({ videoUrl, storagePath, submittedBy, caption });
}

export async function renderGallery(outlet) {
  const photos = getGalleryPhotos();
  const approved = photos.filter((p) => p.status === 'approved').sort((a, b) => b.createdAt - a.createdAt);
  const usage = getGalleryUsageBytes();
  const atLimit = usage >= GALLERY_SAFE_BUDGET_BYTES;
  const nearLimit = usage >= GALLERY_WARN_BUDGET_BYTES;

  outlet.innerHTML = `
    <h2 class="page-title"><i class="fa-solid fa-images me-2"></i>Photo &amp; Video Gallery</h2>

    <ul class="nav nav-tabs mb-4" role="tablist">
      <li class="nav-item" role="presentation">
        <button class="nav-link active" data-bs-toggle="tab" data-bs-target="#gal-pane-gallery" type="button" role="tab" aria-selected="true">
          <i class="fa-solid fa-images me-1"></i>Photos &amp; Videos
        </button>
      </li>
      <li class="nav-item" role="presentation">
        <button class="nav-link" data-bs-toggle="tab" data-bs-target="#gal-pane-upload" type="button" role="tab" aria-selected="false">
          <i class="fa-solid fa-upload me-1"></i>Upload
        </button>
      </li>
    </ul>

    <div class="tab-content">
      <div class="tab-pane fade show active" id="gal-pane-gallery" role="tabpanel">
        <div class="gallery-grid">
          ${approved.map(mediaTile).join('') || '<p class="text-muted text-center py-4">No photos or videos yet — be the first to share one!</p>'}
        </div>
      </div>

      <div class="tab-pane fade" id="gal-pane-upload" role="tabpanel">
        <div class="row justify-content-center">
          <div class="col-lg-6">
            <div class="card">
              <div class="card-header"><i class="fa-solid fa-upload me-2"></i>Share Photos or Videos</div>
              <div class="card-body">
                ${atLimit
                  ? `<div class="alert alert-danger mb-0"><i class="fa-solid fa-triangle-exclamation me-2"></i>The gallery has reached its free storage limit for now — new photo uploads are paused until an admin clears some space. Thanks for understanding!</div>`
                  : `
                  ${nearLimit ? `<div class="alert alert-warning small mb-3"><i class="fa-solid fa-circle-info me-2"></i>The gallery is getting close to its free storage limit — photo uploads may be paused soon if it fills up.</div>` : ''}
                  <p class="text-muted small">You can select multiple photos and videos at once. Everything is reviewed by an admin before it appears here publicly. Videos are compressed in your browser before uploading, so longer clips may take a bit.</p>
                  <input type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime" class="form-control mb-2" id="gal-file" multiple>
                  <input type="text" class="form-control mb-2" id="gal-name" placeholder="Your name (optional)">
                  <input type="text" class="form-control mb-2" id="gal-caption" placeholder="Caption (optional, applied to all selected files)">
                  <button class="btn btn-primary w-100" id="gal-submit"><i class="fa-solid fa-paper-plane me-1"></i>Submit for Review</button>
                  <div class="small text-muted mt-2" id="gal-progress"></div>`}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  if (atLimit) return;

  outlet.querySelector('#gal-submit').addEventListener('click', async () => {
    const fileInput = outlet.querySelector('#gal-file');
    const files = [...fileInput.files];
    if (!files.length) { notify.warn('Choose at least one photo or video'); return; }

    for (const file of files) {
      const isImage = IMAGE_TYPES.includes(file.type);
      const isVideo = VIDEO_TYPES.includes(file.type);
      if (!isImage && !isVideo) { notify.warn(`${file.name}: unsupported file type`); return; }
      if (isImage && file.size > MAX_RAW_IMAGE_BYTES) { notify.warn(`${file.name}: image is too large — please choose a file under 8MB`); return; }
      if (isVideo && file.size > MAX_RAW_VIDEO_BYTES) { notify.warn(`${file.name}: video is too large — please choose a file under 300MB`); return; }
    }

    const btn = outlet.querySelector('#gal-submit');
    const progressEl = outlet.querySelector('#gal-progress');
    btn.disabled = true;
    const submittedBy = outlet.querySelector('#gal-name').value.trim();
    const caption = outlet.querySelector('#gal-caption').value.trim();

    let succeeded = 0;
    let failed = 0;
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      progressEl.textContent = `Uploading ${i + 1} of ${files.length}: ${file.name}...`;
      try {
        if (IMAGE_TYPES.includes(file.type)) {
          await uploadOnePhoto(file, submittedBy, caption);
        } else {
          await uploadOneVideo(file, submittedBy, caption);
        }
        succeeded += 1;
      } catch (err) {
        failed += 1;
        if (err.message === 'storage-full') {
          notify.error('The gallery just hit its free storage limit — remaining photos were not saved.');
          break;
        } else if (err.message === 'too-long') {
          notify.error(`${file.name}: videos longer than ${MAX_VIDEO_SECONDS}s aren't supported yet — please trim it first`);
        } else if (err.message === 'unsupported') {
          notify.error(`${file.name}: your browser can't compress video — try Chrome or Edge`);
        } else {
          notify.error(`${file.name}: could not upload`);
        }
      }
    }

    progressEl.textContent = '';
    if (succeeded) notify.success(`${succeeded} file(s) submitted for review${failed ? `, ${failed} failed` : ''}`);
    else if (!failed) notify.warn('Nothing was uploaded');
    renderGallery(outlet);
  });
}

export { formatMB };
