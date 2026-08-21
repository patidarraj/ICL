import { initData } from './storage.js';
import { registerRoute, startRouter, goTo } from './router.js';
import { renderDashboard } from './dashboard.js';
import { renderSchedule } from './schedule.js';
import { renderStandings } from './standings.js';
import { renderTeams } from './teams.js';
import { renderBracket } from './bracket.js';
import { renderStats } from './stats.js';
import { renderAdmin } from './admin.js';
import { renderTeamLogo } from './team-logo.js';
import { renderRules } from './rules.js';
import { renderScoreboard } from './scoreboard.js';
import { renderGallery } from './gallery.js';
import { startMatchAlertWatcher } from './match-alerts.js';
import { initMyTeamBar } from './my-team-bar.js';

// initData() is deliberately NOT awaited here — it does a getDocs() over the whole teams
// collection (every team's full base64 logo, ~10MB combined) plus the tournament state doc,
// and used to block the entire app behind that one round trip before anything rendered.
// The onSnapshot listeners in storage.js populate the same data independently and already
// trigger a re-render via onDataChange, so the router can start immediately and the page
// fills in as data streams in, instead of showing a blank screen until it all arrives.
initData();
startMatchAlertWatcher();
initMyTeamBar();

registerRoute('dashboard', renderDashboard);
registerRoute('schedule', renderSchedule);
registerRoute('standings', renderStandings);
registerRoute('teams', renderTeams);
registerRoute('bracket', renderBracket);
registerRoute('stats', renderStats);
registerRoute('admin', renderAdmin);
registerRoute('team-logo', renderTeamLogo);
registerRoute('rules', renderRules);
registerRoute('scoreboard', renderScoreboard);
registerRoute('gallery', renderGallery);

document.querySelectorAll('[data-route]').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    goTo(el.dataset.route);
  });
});

document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('show');
});

// Floating card showing a large, readable version of a team's logo + name,
// triggered on hover (desktop) or tap (touch devices, where :hover never fires).
// Centered and sized against the viewport (not anchored to the logo) so it reads
// clearly regardless of how small the logo thumbnail is.
const logoFloatBackdrop = document.createElement('div');
logoFloatBackdrop.className = 'logo-float-backdrop';
document.body.appendChild(logoFloatBackdrop);

const logoFloatCard = document.createElement('div');
logoFloatCard.className = 'logo-float-card';
document.body.appendChild(logoFloatCard);

function showLogoFloatCard(target) {
  if (target.dataset.photoSrc) {
    const caption = target.dataset.photoCaption || '';
    const by = target.dataset.photoBy || '';
    logoFloatCard.classList.add('logo-float-card-photo');
    logoFloatCard.innerHTML = `<img src="${target.dataset.photoSrc}" alt="">
      ${caption || by ? `<div class="logo-float-name">${caption}${caption && by ? '<br>' : ''}${by ? `<span class="small text-muted">by ${by}</span>` : ''}</div>` : ''}`;
  } else {
    logoFloatCard.classList.remove('logo-float-card-photo');
    const name = target.dataset.teamName || '';
    if (target.dataset.teamLogo) {
      logoFloatCard.innerHTML = `<img src="${target.dataset.teamLogo}" alt=""><div class="logo-float-name">${name}</div>`;
    } else {
      const icon = target.dataset.teamIcon || 'fa-shield-halved';
      const color = target.dataset.teamColor || '#F97316';
      logoFloatCard.innerHTML = `<div class="logo-float-placeholder" style="color:${color}"><i class="fa-solid ${icon}"></i></div><div class="logo-float-name">${name}</div>`;
    }
  }
  logoFloatCard.classList.add('is-visible');
  logoFloatBackdrop.classList.add('is-visible');
}

function hideLogoFloatCard() {
  logoFloatCard.classList.remove('is-visible');
  logoFloatBackdrop.classList.remove('is-visible');
}

const ZOOMABLE_SELECTOR = '.team-logo-zoomable, .gallery-photo-zoomable';
// Team logos zoom on hover (small thumbnails, quick preview); gallery photos are much
// bigger tiles already, so they only zoom on click/tap — hovering would be distracting.
const HOVER_ZOOMABLE_SELECTOR = '.team-logo-zoomable';

document.addEventListener('mouseover', (e) => {
  const el = e.target.closest(HOVER_ZOOMABLE_SELECTOR);
  if (el) showLogoFloatCard(el);
});
document.addEventListener('mouseout', (e) => {
  const el = e.target.closest(HOVER_ZOOMABLE_SELECTOR);
  if (el && !el.contains(e.relatedTarget)) hideLogoFloatCard();
});
document.addEventListener('click', (e) => {
  const el = e.target.closest(ZOOMABLE_SELECTOR);
  if (el) {
    e.stopPropagation();
    showLogoFloatCard(el);
  } else {
    hideLogoFloatCard();
  }
});
window.addEventListener('scroll', hideLogoFloatCard, true);

startRouter();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}
