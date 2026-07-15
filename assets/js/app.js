import { initData } from './storage.js';
import { registerRoute, startRouter, goTo } from './router.js';
import { renderDashboard } from './dashboard.js';
import { renderSchedule } from './schedule.js';
import { renderStandings } from './standings.js';
import { renderTeams } from './teams.js';
import { renderBracket } from './bracket.js';
import { renderStats } from './stats.js';
import { renderAdmin } from './admin.js';

await initData();

registerRoute('dashboard', renderDashboard);
registerRoute('schedule', renderSchedule);
registerRoute('standings', renderStandings);
registerRoute('teams', renderTeams);
registerRoute('bracket', renderBracket);
registerRoute('stats', renderStats);
registerRoute('admin', renderAdmin);

document.querySelectorAll('[data-route]').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    goTo(el.dataset.route);
  });
});

document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('show');
});

startRouter();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}
