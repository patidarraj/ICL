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

await initData();

registerRoute('dashboard', renderDashboard);
registerRoute('schedule', renderSchedule);
registerRoute('standings', renderStandings);
registerRoute('teams', renderTeams);
registerRoute('bracket', renderBracket);
registerRoute('stats', renderStats);
registerRoute('admin', renderAdmin);
registerRoute('team-logo', renderTeamLogo);
registerRoute('rules', renderRules);

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
const logoFloatCard = document.createElement('div');
logoFloatCard.className = 'logo-float-card';
document.body.appendChild(logoFloatCard);

function positionLogoFloatCard(target) {
  const rect = target.getBoundingClientRect();
  const cardW = 260, cardH = 340, margin = 12;
  let left = rect.left + rect.width / 2 - cardW / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - cardW - margin));
  let top = rect.bottom + margin;
  if (top + cardH > window.innerHeight - margin) top = rect.top - cardH - margin;
  logoFloatCard.style.left = `${left}px`;
  logoFloatCard.style.top = `${Math.max(margin, top)}px`;
}

function showLogoFloatCard(target) {
  const name = target.dataset.teamName || '';
  if (target.dataset.teamLogo) {
    logoFloatCard.innerHTML = `<img src="${target.dataset.teamLogo}" alt=""><div class="logo-float-name">${name}</div>`;
  } else {
    const icon = target.dataset.teamIcon || 'fa-shield-halved';
    const color = target.dataset.teamColor || '#F97316';
    logoFloatCard.innerHTML = `<div class="logo-float-placeholder" style="color:${color}"><i class="fa-solid ${icon}"></i></div><div class="logo-float-name">${name}</div>`;
  }
  positionLogoFloatCard(target);
  logoFloatCard.classList.add('is-visible');
}

function hideLogoFloatCard() {
  logoFloatCard.classList.remove('is-visible');
}

document.addEventListener('mouseover', (e) => {
  const logo = e.target.closest('.team-logo-zoomable');
  if (logo) showLogoFloatCard(logo);
});
document.addEventListener('mouseout', (e) => {
  const logo = e.target.closest('.team-logo-zoomable');
  if (logo && !logo.contains(e.relatedTarget)) hideLogoFloatCard();
});
document.addEventListener('click', (e) => {
  const logo = e.target.closest('.team-logo-zoomable');
  if (logo) {
    e.stopPropagation();
    showLogoFloatCard(logo);
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
