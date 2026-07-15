// Toast notification helper (Bootstrap 5 toasts).
let container = null;

function ensureContainer() {
  if (container) return container;
  container = document.createElement('div');
  container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
  container.style.zIndex = '2000';
  document.body.appendChild(container);
  return container;
}

const ICONS = {
  success: 'fa-circle-check text-success',
  danger: 'fa-circle-xmark text-danger',
  warning: 'fa-triangle-exclamation text-warning',
  info: 'fa-circle-info text-primary',
};

export function toast(message, type = 'info', title = '') {
  const c = ensureContainer();
  const el = document.createElement('div');
  el.className = 'toast align-items-center border-0 mb-2';
  el.setAttribute('role', 'alert');
  el.setAttribute('aria-live', 'assertive');
  el.setAttribute('aria-atomic', 'true');
  el.innerHTML = `
    <div class="toast-body-wrapper d-flex align-items-start gap-2 p-3">
      <i class="fa-solid ${ICONS[type] || ICONS.info} mt-1"></i>
      <div class="flex-grow-1">
        ${title ? `<div class="fw-semibold">${title}</div>` : ''}
        <div class="small">${message}</div>
      </div>
      <button type="button" class="btn-close btn-close-white ms-2" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>`;
  c.appendChild(el);
  const bsToast = new bootstrap.Toast(el, { delay: 3500 });
  bsToast.show();
  el.addEventListener('hidden.bs.toast', () => el.remove());
}

export const notify = {
  success: (msg, title = 'Success') => toast(msg, 'success', title),
  error: (msg, title = 'Error') => toast(msg, 'danger', title),
  warn: (msg, title = 'Warning') => toast(msg, 'warning', title),
  info: (msg, title = 'Info') => toast(msg, 'info', title),
};
