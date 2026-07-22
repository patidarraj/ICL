// Minimal hash-based SPA router.
import { onDataChange } from './storage.js';

const routes = {};
let currentCleanup = null;
let currentPath = 'dashboard';

export function registerRoute(path, renderFn) {
  routes[path] = renderFn;
}

// A live Firestore change (e.g. saving an edited team name) can trigger refreshCurrent()
// while a Bootstrap modal is still open. Rebuilding the outlet's HTML then orphans that
// modal's body-level backdrop and the modal-open/scroll-lock state it applied to <body>,
// leaving an invisible fullscreen overlay that blocks every click on the page. Clearing
// that state before every rebuild keeps a mid-edit data refresh from ever "stuck"-ing the UI.
function cleanupStrayModals(outlet) {
  outlet.querySelectorAll('.modal.show').forEach((el) => {
    const instance = window.bootstrap?.Modal?.getInstance(el);
    if (instance) instance.dispose();
  });
  document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
  document.body.classList.remove('modal-open');
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('padding-right');
}

function activeNav(path) {
  document.querySelectorAll('.nav-link[data-route]').forEach((el) => {
    el.classList.toggle('active', el.dataset.route === path);
    el.setAttribute('aria-current', el.dataset.route === path ? 'page' : 'false');
  });
  document.querySelectorAll('.bottom-nav-link[data-route]').forEach((el) => {
    el.classList.toggle('active', el.dataset.route === path);
  });
}

export async function navigate(path) {
  const outlet = document.getElementById('app-outlet');
  if (!routes[path]) path = 'dashboard';
  currentPath = path;
  if (typeof currentCleanup === 'function') {
    try { currentCleanup(); } catch (e) { /* noop */ }
    currentCleanup = null;
  }
  outlet.classList.add('route-fade-out');
  await new Promise((r) => setTimeout(r, 120));
  cleanupStrayModals(outlet);
  outlet.innerHTML = '';
  const result = await routes[path](outlet);
  if (typeof result === 'function') currentCleanup = result;
  activeNav(path);
  outlet.classList.remove('route-fade-out');
  outlet.focus();
  const sidebar = document.getElementById('sidebar');
  if (sidebar && sidebar.classList.contains('show') && window.innerWidth < 992) {
    sidebar.classList.remove('show');
  }
}

/** Silently re-renders the current page in place, e.g. when live data changes remotely. No fade, no scroll reset. */
async function refreshCurrent() {
  const outlet = document.getElementById('app-outlet');
  if (!outlet || !routes[currentPath]) return;
  if (typeof currentCleanup === 'function') {
    try { currentCleanup(); } catch (e) { /* noop */ }
    currentCleanup = null;
  }
  const scrollY = outlet.scrollTop;
  cleanupStrayModals(outlet);
  const result = await routes[currentPath](outlet);
  if (typeof result === 'function') currentCleanup = result;
  outlet.scrollTop = scrollY;
}

export function startRouter() {
  window.addEventListener('hashchange', () => {
    const path = location.hash.replace('#/', '') || 'dashboard';
    navigate(path);
  });
  onDataChange(() => { refreshCurrent(); });
  const initial = location.hash.replace('#/', '') || 'dashboard';
  navigate(initial);
}

export function goTo(path) {
  location.hash = `#/${path}`;
}
