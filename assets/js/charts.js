// Chart.js wrapper helpers with the app's dark theme baked in.
// Chart.js itself (205KB) is only needed on the Statistics page, so it's loaded on demand
// here rather than as a blocking <script> tag on every page — see ensureChartLib() below.
const activeCharts = new Map();

const PALETTE = ['#3B82F6', '#22C55E', '#EF4444', '#FACC15', '#A855F7', '#06B6D4', '#F97316', '#EC4899'];

let chartLibPromise = null;
function ensureChartLib() {
  if (window.Chart) return Promise.resolve();
  if (chartLibPromise) return chartLibPromise;
  chartLibPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js';
    script.onload = () => {
      Chart.defaults.color = '#94A3B8';
      Chart.defaults.borderColor = 'rgba(148,163,184,0.15)';
      Chart.defaults.font.family = "'Inter', 'Segoe UI', sans-serif";
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return chartLibPromise;
}

function destroy(id) {
  if (activeCharts.has(id)) {
    activeCharts.get(id).destroy();
    activeCharts.delete(id);
  }
}

export async function renderChart(canvasId, config) {
  await ensureChartLib();
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  destroy(canvasId);
  const chart = new Chart(canvas.getContext('2d'), config);
  activeCharts.set(canvasId, chart);
  return chart;
}

export function destroyAllCharts() {
  activeCharts.forEach((c) => c.destroy());
  activeCharts.clear();
}

export function lineConfig(labels, dataset, label) {
  return {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label, data: dataset, borderColor: PALETTE[0], backgroundColor: 'rgba(59,130,246,0.15)',
        tension: 0.35, fill: true, pointRadius: 3,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  };
}

export function barConfig(labels, dataset, label, colors = PALETTE) {
  return {
    type: 'bar',
    data: { labels, datasets: [{ label, data: dataset, backgroundColor: colors, borderRadius: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  };
}

export function doughnutConfig(labels, dataset, colors = PALETTE) {
  return {
    type: 'doughnut',
    data: { labels, datasets: [{ data: dataset, backgroundColor: colors, borderWidth: 0 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 14 } } },
      cutout: '65%',
    },
  };
}

export function radarConfig(labels, dataset, label) {
  return {
    type: 'radar',
    data: {
      labels,
      datasets: [{
        label, data: dataset, backgroundColor: 'rgba(34,197,94,0.2)', borderColor: PALETTE[1], pointBackgroundColor: PALETTE[1],
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { r: { angleLines: { color: 'rgba(148,163,184,0.15)' }, grid: { color: 'rgba(148,163,184,0.15)' }, pointLabels: { color: '#CBD5E1' }, ticks: { display: false } } },
      plugins: { legend: { display: false } },
    },
  };
}

export { PALETTE };
