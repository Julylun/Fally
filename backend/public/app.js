const API = '/api/v1';

const els = {
  kpiRow: document.getElementById('kpi-row'),
  eventsGrid: document.getElementById('events-grid'),
  emptyState: document.getElementById('empty-state'),
  statusBanner: document.getElementById('status-banner'),
  filterForm: document.getElementById('filter-form'),
  cameraSelect: document.getElementById('filter-camera'),
  labelSelect: document.getElementById('filter-label'),
  fromInput: document.getElementById('filter-from'),
  toInput: document.getElementById('filter-to'),
  resolvedSelect: document.getElementById('filter-resolved'),
  btnRefresh: document.getElementById('btn-refresh'),
  btnClear: document.getElementById('btn-clear-filters'),
  modal: document.getElementById('modal'),
  modalImage: document.getElementById('modal-image'),
  modalJson: document.getElementById('modal-json'),
  modalClose: document.getElementById('modal-close'),
};

let lastCameras = [];
let lastEvents = [];
let activeFilters = {};

function showBanner(message) {
  els.statusBanner.textContent = message;
  els.statusBanner.classList.remove('hidden');
}

function hideBanner() {
  els.statusBanner.classList.add('hidden');
  els.statusBanner.textContent = '';
}

function formatRelative(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diff = Date.now() - d.getTime();
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h ago`;
  return d.toLocaleString();
}

function labelClass(label) {
  return label === 'Fall Detected'
    ? 'bg-rose-900/70 text-rose-100 ring-1 ring-rose-500/40'
    : 'bg-slate-800 text-slate-200 ring-1 ring-slate-600/60';
}

function renderKpis(cameras) {
  const active = cameras.length;
  const falls24 = cameras.reduce((s, c) => s + (c.fallsLast24h || 0), 0);
  const total24 = cameras.reduce((s, c) => s + (c.eventsLast24h || 0), 0);
  const tiles = [
    { title: 'Active cameras', value: active },
    { title: 'Fall events (24h)', value: falls24 },
    { title: 'Total events (24h)', value: total24 },
  ];
  els.kpiRow.innerHTML = tiles
    .map(
      (t) => `
    <div class="rounded-xl border border-slate-800 bg-slate-900/80 p-4 shadow-inner">
      <p class="text-xs uppercase tracking-wide text-slate-400">${t.title}</p>
      <p class="mt-2 text-3xl font-semibold text-white">${t.value}</p>
    </div>`,
    )
    .join('');
}

function populateCameraOptions(cameras) {
  const current = els.cameraSelect.value;
  const opts = ['<option value="">All cameras</option>'];
  for (const c of cameras) {
    const vid = escapeHtml(c.cameraId);
    opts.push(`<option value="${vid}">${vid}</option>`);
  }
  els.cameraSelect.innerHTML = opts.join('');
  if (current && [...els.cameraSelect.options].some((o) => o.value === current)) {
    els.cameraSelect.value = current;
  }
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderEvents(events) {
  els.eventsGrid.innerHTML = '';
  if (!events.length) {
    els.emptyState.classList.remove('hidden');
    return;
  }
  els.emptyState.classList.add('hidden');
  for (const ev of events) {
    const card = document.createElement('article');
    card.className =
      'flex flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 shadow';
    const thumb = `${API}/snapshots/${encodeURIComponent(ev.id)}`;
    const confPct =
      typeof ev.confidence === 'number'
        ? ev.confidence <= 1
          ? `${Math.round(ev.confidence * 100)}%`
          : `${ev.confidence}`
        : ev.confidence;
    card.innerHTML = `
      <div class="relative aspect-video bg-black">
        <img src="${thumb}" alt="Snapshot" class="h-full w-full object-cover" loading="lazy" />
        <span class="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-xs text-white backdrop-blur">
          ${escapeHtml(ev.cameraId || '')}
        </span>
      </div>
      <div class="flex flex-1 flex-col gap-2 p-3">
        <div class="flex flex-wrap items-center gap-2">
          <span class="rounded-full px-2 py-0.5 text-xs font-medium ${labelClass(ev.label)}">${escapeHtml(ev.label || '')}</span>
          <span class="text-xs text-slate-400">${confPct} conf</span>
          ${ev.resolved ? '<span class="text-xs text-emerald-400">Resolved</span>' : ''}
        </div>
        <p class="text-xs text-slate-400">${formatRelative(ev.detectedAt)} · <span class="font-mono text-[11px] text-slate-500">${escapeHtml(ev.id)}</span></p>
        <div class="mt-auto flex gap-2 pt-1">
          <button data-action="view" data-id="${escapeHtml(ev.id)}" class="flex-1 rounded-lg border border-slate-600 px-2 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800">View</button>
          <button data-action="resolve" data-id="${escapeHtml(ev.id)}" class="flex-1 rounded-lg bg-emerald-700 px-2 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40" ${ev.resolved ? 'disabled' : ''}>Resolve</button>
        </div>
      </div>`;
    els.eventsGrid.appendChild(card);
  }
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg =
      typeof data === 'object' && data && data.message
        ? Array.isArray(data.message)
          ? data.message.join(', ')
          : data.message
        : res.statusText;
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return data;
}

function buildEventsQuery() {
  const params = new URLSearchParams();
  params.set('limit', '50');
  params.set('page', '1');
  if (activeFilters.cameraId) params.set('cameraId', activeFilters.cameraId);
  if (activeFilters.label) params.set('label', activeFilters.label);
  if (activeFilters.from) params.set('from', activeFilters.from);
  if (activeFilters.to) params.set('to', activeFilters.to);
  if (activeFilters.resolved === true) params.set('resolved', 'true');
  if (activeFilters.resolved === false) params.set('resolved', 'false');
  return `${API}/events?${params.toString()}`;
}

async function loadDashboard() {
  hideBanner();
  try {
    const [cameras, eventsPayload] = await Promise.all([
      fetchJson(`${API}/cameras`),
      fetchJson(buildEventsQuery()),
    ]);
    lastCameras = Array.isArray(cameras) ? cameras : [];
    lastEvents = eventsPayload?.data || [];
    renderKpis(lastCameras);
    populateCameraOptions(lastCameras);
    renderEvents(lastEvents);
  } catch (e) {
    console.error(e);
    showBanner(
      `Could not load data (${e.message}). Check that the API is running and MongoDB is reachable, then press Refresh.`,
    );
  }
}

function openModal(ev) {
  els.modalImage.src = `${API}/snapshots/${encodeURIComponent(ev.id)}`;
  els.modalJson.textContent = JSON.stringify(ev, null, 2);
  els.modal.classList.remove('hidden');
  els.modal.classList.add('flex');
}

function closeModal() {
  els.modal.classList.add('hidden');
  els.modal.classList.remove('flex');
  els.modalImage.removeAttribute('src');
}

async function resolveEvent(id) {
  try {
    await fetchJson(`${API}/events/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolved: true }),
    });
    await loadDashboard();
  } catch (e) {
    alert(`Resolve failed: ${e.message}`);
  }
}

els.filterForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const fromVal = els.fromInput.value;
  const toVal = els.toInput.value;
  const resolvedMode = els.resolvedSelect.value;
  let resolvedFilter;
  if (resolvedMode === 'true') resolvedFilter = true;
  else if (resolvedMode === 'false') resolvedFilter = false;
  else resolvedFilter = undefined;
  activeFilters = {
    cameraId: els.cameraSelect.value || '',
    label: els.labelSelect.value || '',
    from: fromVal ? new Date(fromVal).toISOString() : '',
    to: toVal ? new Date(toVal).toISOString() : '',
    resolved: resolvedFilter,
  };
  loadDashboard();
});

els.btnClear.addEventListener('click', () => {
  els.filterForm.reset();
  activeFilters = {};
  loadDashboard();
});

els.btnRefresh.addEventListener('click', () => {
  loadDashboard();
});

els.modalClose.addEventListener('click', closeModal);
els.modal.addEventListener('click', (e) => {
  if (e.target === els.modal) closeModal();
});

els.eventsGrid.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.getAttribute('data-id');
  const action = btn.getAttribute('data-action');
  if (!id) return;
  if (action === 'view') {
    const ev = lastEvents.find((x) => x.id === id);
    if (ev) openModal(ev);
  } else if (action === 'resolve') {
    resolveEvent(id);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

loadDashboard();
