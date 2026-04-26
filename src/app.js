
// ====== STATE ======
let state = {
  view: 'search',  // 'search' | 'history' | 'imx'
  tab: 'vg',       // 'vg' | 'aps'
  query: '',
  loading: false,
  results: [],
  page: 1,
  totalPages: 1,
  totalResults: 0,
  modalData: null,
  // history
  historyLoading: false,
  historyResults: [],
  historyPage: 1,
  historyTotalPages: 1,
  historyTotal: 0,
  // imx
  imxMode: 'upload',  // 'upload' | 'extract'
  imxLoading: false,
  imxResult: null,
};

let appEl;

// ====== API ======
const API = '/api';

async function apiSearch(tab, query, page = 1) {
  const endpoint = tab === 'vg' ? '/search/vg' : '/search/aps';
  const res = await fetch(`${API}${endpoint}?q=${encodeURIComponent(query)}&page=${page}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiFetch(tab, id, query = '') {
  const endpoint = tab === 'vg' ? '/fetch/vg' : '/fetch/aps';
  const res = await fetch(`${API}${endpoint}?id=${id}&q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiHistory(page = 1) {
  const res = await fetch(`${API}/history?page=${page}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiImxExtract(text) {
  const res = await fetch(`${API}/imx/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiImxUpload(url) {
  const res = await fetch(`${API}/imx/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}



// ====== TOAST ======
function toast(msg, type = 'success') {
  const container = document.querySelector('.toast-container') || (() => {
    const c = document.createElement('div');
    c.className = 'toast-container';
    document.body.appendChild(c);
    return c;
  })();
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${type === 'success' ? '✓' : '✕'}</span><span>${msg}</span>`;
  container.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ====== RENDER HELPERS ======
function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

function svgIcon(name) {
  const icons = {
    search: `<svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
    arrow_right: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`,
    chevron_left: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`,
    chevron_right: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`,
    copy: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
    external: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
    viper: `<img src="/icon.svg" style="width: 1em; height: 1em; background: white; border-radius: 50%;" alt="Viper">`,
  };
  return icons[name] || '';
}

// ====== NAV ======
function renderNav() {
  const isSearch = state.view === 'search';
  const isHistory = state.view === 'history';
  return `
  <nav>
    <div class="nav-logo">
      <img src="/icon.svg" style="width: 32px; height: 32px; background: white; border-radius: 8px; padding: 4px;" alt="Viper">
      <span>Viper</span>
      <span class="nav-badge">v2</span>
    </div>
    <ul class="nav-links">
      <li><a class="animate-line ${isSearch?'active':''}" id="nav-search" style="cursor:pointer">Search</a></li>
      <li><a class="animate-line ${state.view==='imx'?'active':''}" id="nav-imx" style="cursor:pointer">IMX</a></li>
      <li><a class="animate-line ${isHistory?'active':''}" id="nav-history" style="cursor:pointer">History</a></li>
      <li><a class="animate-line" id="nav-docs" href="https://viper.to" target="_blank" rel="noopener">ViperGirls</a></li>
      <li><a class="animate-line" id="nav-aps" href="https://adultphotosets.best" target="_blank" rel="noopener">APS</a></li>
    </ul>
  </nav>`;
}

// ====== HERO ======
function renderHero(skipAnim) {
  return `
  <section class="hero ${skipAnim ? 'skip-anim' : ''}">
    <div class="hero-eyebrow">Live search</div>
    <h1>Find threads,<br><span>instantly.</span></h1>
    <p class="hero-sub">Search ViperGirls forums and AdultPhotoSets at once. Browse results, copy IDs, open threads — all from one place.</p>

    <div class="tabs">
      <button class="tab-btn ${state.tab==='vg'?'active':''}" data-tab="vg" id="tab-vg">ViperGirls</button>
      <button class="tab-btn ${state.tab==='aps'?'active':''}" data-tab="aps" id="tab-aps">AdultPhotoSets</button>
    </div>

    <div class="search-wrap">
      <div class="search-box">
        ${svgIcon('search')}
        <input
          id="search-input"
          type="text"
          placeholder="${state.tab==='vg' ? 'Search VG threads… e.g. "blake blossom"' : 'Search APS sets… e.g. "eve sweet"'}"
          value="${state.query}"
          autocomplete="off"
          spellcheck="false"
        />
        <button class="search-btn" id="search-btn" ${state.loading?'disabled':''}>
          ${state.loading
            ? '<div class="spinner"></div> Searching…'
            : `${svgIcon('arrow_right')} Search`}
        </button>
      </div>
      <div class="search-hints">
        <span class="hint-label">Try:</span>
        <span class="hint-chip" data-hint="blake blossom">blake blossom</span>
        <span class="hint-chip" data-hint="riley reid">riley reid</span>
        <span class="hint-chip" data-hint="lexi luna">lexi luna</span>
        <span class="hint-chip" data-hint="eve sweet">eve sweet</span>
      </div>
    </div>
  </section>`;
}

// ====== SKELETON ======
function renderSkeleton() {
  return Array.from({length:5}).map(() => `
    <div class="skeleton-card">
      <div class="skel" style="width:28px;height:14px"></div>
      <div style="flex:1;display:flex;flex-direction:column;gap:8px">
        <div class="skel" style="height:14px;width:70%"></div>
        <div class="skel" style="height:10px;width:40%"></div>
      </div>
      <div class="skel" style="width:80px;height:30px;border-radius:8px"></div>
    </div>`).join('');
}

// ====== RESULT CARD ======
function renderCard(r, idx) {
  const dateStr = r.timestamp ? formatDate(r.timestamp) : (r.dateText || '');
  const idLabel = r.sgenId ? `/sgen${r.sgenId}` : (r.apsId ? `/aps${r.apsId}` : '');
  const prefixHtml = r.prefix ? `<span class="result-prefix">${r.prefix}</span>` : '';
  const delay = Math.min(idx * 40, 400);

  return `
  <div class="result-card fade-in" style="animation-delay:${delay}ms" data-idx="${idx}">
    <span class="result-index">${(state.page-1)*20 + idx + 1}</span>
    <div class="result-body">
      <div class="result-title" title="${r.title}">${r.title}</div>
      <div class="result-meta">
        ${prefixHtml}
        ${idLabel ? `<span class="result-id glitch" title="Click to copy" data-id="${idLabel}" style="cursor:pointer">${idLabel}</span>` : ''}
        ${dateStr ? `<span class="result-date">${dateStr}</span>` : ''}
        ${r.category ? `<span class="result-prefix">${r.category}</span>` : ''}
      </div>
    </div>
    <div class="result-actions">
      <button class="action-btn" data-open="${r.url}" title="Open thread">
        ${svgIcon('external')}
      </button>
      <button class="action-btn primary" data-fetch-idx="${idx}" title="Get images">
        Get images
      </button>
    </div>
  </div>`;
}

// ====== RESULTS SECTION ======
function renderResults() {
  if (state.loading) {
    return `<div class="results-list">${renderSkeleton()}</div>`;
  }

  if (!state.results.length && state.query) {
    return `
      <div class="empty-state">
        <div class="icon">🔍</div>
        <h3>No results found</h3>
        <p>Try a different search term or switch tabs.</p>
      </div>`;
  }

  if (!state.results.length) {
    return `
      <div class="empty-state">
        <img src="/icon.svg" style="width: 48px; height: 48px; background: white; border-radius: 50%; padding: 6px; margin-bottom: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.5);" alt="Viper">
        <h3>Start searching</h3>
        <p>Enter a name or keyword above to find threads.</p>
      </div>`;
  }

  return `
    <div class="status-bar fade-in">
      <div class="status-info">
        <span class="status-count">${state.totalResults}</span>
        <span>results for "<strong>${state.query}</strong>"</span>
      </div>
      <div class="status-actions">
        <div class="pagination">
          <button class="icon-btn" id="prev-page" ${state.page<=1?'disabled':''}>${svgIcon('chevron_left')}</button>
          <span class="page-info">${state.page} / ${state.totalPages}</span>
          <button class="icon-btn" id="next-page" ${state.page>=state.totalPages?'disabled':''}>${svgIcon('chevron_right')}</button>
        </div>
      </div>
    </div>
    <div class="results-list">
      ${state.results.map((r,i) => renderCard(r,i)).join('')}
    </div>`;
}

// ====== MODAL ======
function renderModal() {
  if (!state.modalData) return '';
  const d = state.modalData;

  // If still loading
  if (d.loading) return `
  <div class="modal-overlay open" id="modal-overlay">
    <div class="modal" style="text-align:center;padding:48px 28px">
      <div class="spinner" style="width:32px;height:32px;margin:0 auto 16px;border-width:3px"></div>
      <div style="color:var(--text-2);font-size:14px">${d.loadingMsg || 'Extracting images…'}</div>
    </div>
  </div>`;

  const previewHtml = (d.previewUrls || []).map(u =>
    `<div class="preview-url glitch" data-effect="scramble" title="${u}">${u}</div>`
  ).join('');

  const cmdHtml = (d.sendCommand || d.dlCommand) ? `
    <div class="cmd-block" data-copy-cmd="${[d.sendCommand, d.dlCommand].filter(Boolean).join('\\n')}">${
      [d.sendCommand, d.dlCommand].filter(Boolean).map(c =>
        `<div class="cmd-line">${c}</div>`
      ).join('')
    }</div>` : '';

  const statsHtml = d.ok ? `
    <div class="result-info-grid">
      <div class="info-row"><span class="info-key">Images</span><span class="info-val accent">${d.extracted}/${d.total}</span></div>
      <div class="info-row"><span class="info-key">Expires</span><span class="info-val">7 days</span></div>
      ${d.services ? `<div class="info-row"><span class="info-key">Service</span><span class="info-val">${d.services}</span></div>` : ''}
      <div class="info-row"><span class="info-key">Source</span><span class="info-val url-val" title="${d.sourceUrl}">${d.sourceUrl}</span></div>
      ${d.pasteUrl ? `<div class="info-row"><span class="info-key">Link</span><span class="info-val"><a class="paste-link" href="${d.pasteUrl}" target="_blank" rel="noopener">${d.pasteUrl}</a></span></div>` : ''}
    </div>` : `<div class="error-msg">${d.error || 'Extraction failed'}</div>`;

  return `
  <div class="modal-overlay open" id="modal-overlay">
    <div class="modal modal-wide">
      <div class="modal-header">
        <div class="modal-title-text">${d.title}</div>
        <button class="modal-close" id="modal-close">✕</button>
      </div>

      ${statsHtml}

      ${cmdHtml}

      ${previewHtml ? `<div class="preview-block">${previewHtml}</div>` : ''}

      <div class="modal-actions" style="margin-top:16px">
        ${d.pasteUrl ? `<button class="action-btn" id="modal-copy-paste">${svgIcon('copy')} Copy Link</button>` : ''}
        ${d.sendCommand ? `<button class="action-btn" id="modal-copy-send">${svgIcon('copy')} Copy /send</button>` : ''}
        <button class="action-btn primary" id="modal-open" data-url="${d.sourceUrl}">
          ${svgIcon('external')} Open Thread
        </button>
      </div>
    </div>
  </div>`;
}

// ====== HISTORY VIEW ======
function formatTimestamp(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderHistoryCard(h, idx) {
  const delay = Math.min(idx * 40, 400);
  const srcBadge = h.source === 'vg'
    ? '<span class="result-prefix">VG</span>'
    : '<span class="result-prefix">APS</span>';
  return `
  <div class="result-card fade-in" style="animation-delay:${delay}ms" data-history-idx="${idx}">
    <span class="result-index">${(state.historyPage-1)*20 + idx + 1}</span>
    <div class="result-body">
      <div class="result-title" title="${h.title}">${h.title}</div>
      <div class="result-meta">
        ${srcBadge}
        <span class="result-id glitch" data-effect="scramble" title="${h.extracted}/${h.total} images">${h.extracted}/${h.total} images</span>
        ${h.services ? `<span class="result-prefix">${h.services}</span>` : ''}
        <span class="result-date">${formatTimestamp(h.timestamp)}</span>
      </div>
    </div>
    <div class="result-actions">
      ${h.pasteUrl ? `<button class="action-btn" data-open="${h.pasteUrl}" title="Open paste">${svgIcon('external')}</button>` : ''}
      <button class="action-btn primary" data-hview="${idx}">View</button>
    </div>
  </div>`;
}

function renderHistoryView(skipAnim) {
  const header = `
  <section class="hero ${skipAnim ? 'skip-anim' : ''}" style="padding-bottom:40px">
    <div class="hero-eyebrow">Extraction log</div>
    <h1>History</h1>
    <p class="hero-sub">All previously extracted threads, available to everyone.</p>
  </section>`;

  let body;
  if (state.historyLoading) {
    body = `<div class="results-list">${renderSkeleton()}</div>`;
  } else if (!state.historyResults.length) {
    body = `
      <div class="empty-state">
        <div class="icon">📜</div>
        <h3>No history yet</h3>
        <p>Extract some threads and they'll appear here.</p>
      </div>`;
  } else {
    body = `
      <div class="status-bar fade-in">
        <div class="status-info">
          <span class="status-count">${state.historyTotal}</span>
          <span>extractions</span>
        </div>
        <div class="status-actions">
          <div class="pagination">
            <button class="icon-btn" id="hist-prev" ${state.historyPage<=1?'disabled':''}>${svgIcon('chevron_left')}</button>
            <span class="page-info">${state.historyPage} / ${state.historyTotalPages}</span>
            <button class="icon-btn" id="hist-next" ${state.historyPage>=state.historyTotalPages?'disabled':''}>${svgIcon('chevron_right')}</button>
          </div>
        </div>
      </div>
      <div class="results-list">
        ${state.historyResults.map((h, i) => renderHistoryCard(h, i)).join('')}
      </div>`;
  }

  return header + `<main>${body}</main>`;
}

async function fetchHistory(page = 1) {
  state.historyLoading = true;
  state.historyPage = page;
  render();
  try {
    const data = await apiHistory(page);
    state.historyResults = data.results || [];
    state.historyTotal = data.total || 0;
    state.historyTotalPages = data.totalPages || 1;
    state.historyPage = data.page || 1;
  } catch (err) {
    toast(`History failed: ${err.message}`, 'error');
  }
  state.historyLoading = false;
  render();
}

// ====== IMX VIEW ======
function renderImxView(skipAnim) {
  const isExtract = state.imxMode === 'extract';
  const isUpload = state.imxMode === 'upload';

  const header = `
  <section class="hero ${skipAnim ? 'skip-anim' : ''}" style="padding-bottom:40px">
    <div class="hero-eyebrow">IMX Tools</div>
    <h1>IMX<br><span>Toolkit</span></h1>
    <p class="hero-sub">Extract direct URLs from imx.to viewer links, or upload images to IMX from a paste URL.</p>

    <div class="tabs">
      <button class="tab-btn ${isUpload?'active':''}" data-imx-mode="upload" id="imx-tab-upload">Upload</button>
      <button class="tab-btn ${isExtract?'active':''}" data-imx-mode="extract" id="imx-tab-extract">Extract</button>
    </div>
  </section>`;

  let body;
  if (isExtract) {
    body = `
    <div class="imx-form fade-in">
      <label class="imx-label" for="imx-extract-input">Paste imx.to viewer links</label>
      <textarea id="imx-extract-input" class="imx-textarea" rows="8" placeholder="Paste imx.to/i/XXXX links here (one per line or mixed text)…" spellcheck="false"></textarea>
      <button class="search-btn" id="imx-extract-btn" style="margin-top:12px;align-self:flex-end" ${state.imxLoading?'disabled':''}>
        ${state.imxLoading ? '<div class="spinner"></div> Extracting…' : `${svgIcon('arrow_right')} Extract URLs`}
      </button>
    </div>`;
  } else {
    body = `
    <div class="imx-form fade-in">
      <label class="imx-label" for="imx-upload-input">Paste URL (pb.dotrhelvetican.workers.dev)</label>
      <input id="imx-upload-input" class="imx-url-input" type="text" placeholder="https://pb.dotrhelvetican.workers.dev/XXXX" spellcheck="false" />
      <button class="search-btn" id="imx-upload-btn" style="margin-top:12px;align-self:flex-end" ${state.imxLoading?'disabled':''}>
        ${state.imxLoading ? '<div class="spinner"></div> Uploading…' : `${svgIcon('arrow_right')} Upload to IMX`}
      </button>
    </div>`;
  }

  // Result display
  let resultHtml = '';
  if (state.imxResult) {
    const d = state.imxResult;
    if (d.ok) {
      const previewHtml = (d.previewUrls || []).map(u =>
        `<div class="preview-url glitch" data-effect="scramble" title="${u}">${u}</div>`
      ).join('');

      resultHtml = `
      <div class="imx-result fade-in">
        <div class="result-info-grid">
          <div class="info-row"><span class="info-key">Total</span><span class="info-val">${d.total}</span></div>
          ${d.extracted != null ? `<div class="info-row"><span class="info-key">Extracted</span><span class="info-val accent">${d.extracted}</span></div>` : ''}
          ${d.uploaded != null ? `<div class="info-row"><span class="info-key">Uploaded</span><span class="info-val accent">${d.uploaded}</span></div>` : ''}
          ${d.failed != null && d.failed > 0 ? `<div class="info-row"><span class="info-key">Failed</span><span class="info-val" style="color:#f87171">${d.failed}</span></div>` : ''}
          ${d.galleryUrl ? `<div class="info-row"><span class="info-key">Gallery</span><span class="info-val"><a class="paste-link" href="${d.galleryUrl}" target="_blank" rel="noopener">${d.galleryUrl}</a></span></div>` : ''}
          ${d.pasteUrl ? `<div class="info-row"><span class="info-key">Paste</span><span class="info-val"><a class="paste-link" href="${d.pasteUrl}" target="_blank" rel="noopener">${d.pasteUrl}</a></span></div>` : ''}
        </div>
        ${previewHtml ? `<div class="preview-block" style="margin-top:16px">${previewHtml}</div>` : ''}
        <div class="modal-actions" style="margin-top:16px">
          ${d.pasteUrl ? `<button class="action-btn" id="imx-copy-paste">${svgIcon('copy')} Copy Link</button>` : ''}
          <button class="action-btn primary" id="imx-open-paste" data-url="${d.pasteUrl || d.galleryUrl || ''}">
            ${svgIcon('external')} Open
          </button>
        </div>
      </div>`;
    } else {
      resultHtml = `
      <div class="imx-result fade-in">
        <div class="error-msg">${d.error || 'Operation failed'}</div>
      </div>`;
    }
  }

  return header + `<main>${body}${resultHtml}</main>`;
}

let lastView = null;

// ====== FULL RENDER ======
function render() {
  if (!appEl) return;
  const skipAnim = lastView === state.view;
  lastView = state.view;

  if (state.view === 'imx') {
    appEl.innerHTML = `
      <div class="glow-orb glow-orb-1"></div>
      <div class="glow-orb glow-orb-2"></div>
      ${renderNav()}
      ${renderImxView(skipAnim)}
      ${renderModal()}
    `;
  } else if (state.view === 'history') {
    appEl.innerHTML = `
      <div class="glow-orb glow-orb-1"></div>
      <div class="glow-orb glow-orb-2"></div>
      ${renderNav()}
      ${renderHistoryView(skipAnim)}
      ${renderModal()}
    `;
  } else {
    appEl.innerHTML = `
      <div class="glow-orb glow-orb-1"></div>
      <div class="glow-orb glow-orb-2"></div>
      ${renderNav()}
      ${renderHero(skipAnim)}
      <main>${renderResults()}</main>
      ${renderModal()}
    `;
  }
  bindEvents();
  // re-init scramble on new cards
  requestAnimationFrame(() => {
    initScramble(appEl);
    initFadeIn(appEl);
    initAnimateLine(appEl);
  });
}

// ====== SEARCH ======
async function doSearch(query, page = 1) {
  if (!query.trim()) return;
  state.query = query;
  state.page = page;
  state.loading = true;
  state.results = [];
  render();

  try {
    const data = await apiSearch(state.tab, query, page);
    state.results = data.results || [];
    state.totalResults = data.total || state.results.length;
    state.totalPages = Math.max(1, Math.ceil(state.totalResults / 20));
    state.loading = false;
    render();
  } catch (err) {
    state.loading = false;
    state.results = [];
    render();
    toast(`Search failed: ${err.message}`, 'error');
  }
}

// ====== COPY ======
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard!', 'success');
  } catch {
    toast('Copy failed', 'error');
  }
}

// ====== BIND EVENTS ======
function bindEvents() {
  // Nav switching
  const navSearch = appEl.querySelector('#nav-search');
  const navHistory = appEl.querySelector('#nav-history');
  if (navSearch) navSearch.addEventListener('click', () => {
    if (state.view !== 'search') { state.view = 'search'; render(); }
  });
  if (navHistory) navHistory.addEventListener('click', () => {
    if (state.view !== 'history') {
      state.view = 'history';
      fetchHistory(1);
    }
  });

  // IMX nav
  const navImx = appEl.querySelector('#nav-imx');
  if (navImx) navImx.addEventListener('click', () => {
    if (state.view !== 'imx') { state.view = 'imx'; state.imxResult = null; render(); }
  });

  // Tab switch (search tabs only, not IMX sub-tabs)
  appEl.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.tab;
      state.results = [];
      state.query = '';
      state.page = 1;
      render();
    });
  });

  // Search
  const input = appEl.querySelector('#search-input');
  const searchBtn = appEl.querySelector('#search-btn');
  if (input) {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') doSearch(input.value);
    });
    // keep value in sync
    input.addEventListener('input', e => { state.query = e.target.value; });
  }
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      const q = appEl.querySelector('#search-input')?.value || state.query;
      doSearch(q);
    });
  }

  // Hints
  appEl.querySelectorAll('.hint-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const q = chip.dataset.hint;
      doSearch(q);
    });
  });

  // Pagination
  const prev = appEl.querySelector('#prev-page');
  const next = appEl.querySelector('#next-page');
  if (prev) prev.addEventListener('click', () => doSearch(state.query, state.page - 1));
  if (next) next.addEventListener('click', () => doSearch(state.query, state.page + 1));

  // History Pagination
  const histPrev = appEl.querySelector('#hist-prev');
  const histNext = appEl.querySelector('#hist-next');
  if (histPrev) histPrev.addEventListener('click', () => fetchHistory(state.historyPage - 1));
  if (histNext) histNext.addEventListener('click', () => fetchHistory(state.historyPage + 1));

  // History view buttons
  appEl.querySelectorAll('[data-hview]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.hview);
      const h = state.historyResults[idx];
      if (h) {
        state.modalData = { ok: true, ...h };
        render();
      }
    });
  });

  // Result IDs – copy on click
  appEl.querySelectorAll('.result-id').forEach(el => {
    el.addEventListener('click', () => copyText(el.dataset.id));
  });

  // Open URL buttons
  appEl.querySelectorAll('[data-open]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.open(btn.dataset.open, '_blank', 'noopener');
    });
  });

  // Fetch images buttons
  appEl.querySelectorAll('[data-fetch-idx]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.fetchIdx);
      const r = state.results[idx];
      if (!r) return;

      // Show loading modal immediately
      state.modalData = { loading: true, loadingMsg: 'Scraping thread…', title: r.title };
      render();

      try {
        const id = r.sgenId || r.apsId;
        // Update loading message
        state.modalData = { loading: true, loadingMsg: 'Extracting image URLs…', title: r.title };
        render();
        const data = await apiFetch(state.tab, id, state.query);
        // Store full API result
        state.modalData = {
          ...data,
          title: data.title || r.title,
          sourceUrl: data.sourceUrl || r.url,
        };
        render();
      } catch (err) {
        state.modalData = { ok: false, error: err.message, title: r.title, sourceUrl: r.url };
        render();
      }
    });
  });

  // Modal
  const overlay = appEl.querySelector('#modal-overlay');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { state.modalData = null; render(); }
    });
  }
  const modalClose = appEl.querySelector('#modal-close');
  if (modalClose) modalClose.addEventListener('click', () => { state.modalData = null; render(); });

  const modalCopyPaste = appEl.querySelector('#modal-copy-paste');
  if (modalCopyPaste) modalCopyPaste.addEventListener('click', () => copyText(state.modalData?.pasteUrl || ''));

  const modalCopySend = appEl.querySelector('#modal-copy-send');
  if (modalCopySend) modalCopySend.addEventListener('click', () => copyText(state.modalData?.sendCommand || ''));

  const modalOpen = appEl.querySelector('#modal-open');
  if (modalOpen) modalOpen.addEventListener('click', () => window.open(modalOpen.dataset.url, '_blank', 'noopener'));

  // Copy command lines on click
  appEl.querySelectorAll('[data-copy-cmd]').forEach(el => {
    el.style.cursor = 'pointer';
    el.title = 'Click to copy';
    el.addEventListener('click', () => copyText(el.dataset.copyCmd));
  });

  // IMX mode tabs
  appEl.querySelectorAll('[data-imx-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.imxMode = btn.dataset.imxMode;
      state.imxResult = null;
      render();
    });
  });

  // IMX Extract button
  const imxExtractBtn = appEl.querySelector('#imx-extract-btn');
  if (imxExtractBtn) imxExtractBtn.addEventListener('click', async () => {
    const textarea = appEl.querySelector('#imx-extract-input');
    const text = textarea?.value || '';
    if (!text.trim()) return toast('Paste some imx.to links first', 'error');
    state.imxLoading = true;
    state.imxResult = null;
    render();
    try {
      const data = await apiImxExtract(text);
      state.imxResult = data;
    } catch (err) {
      state.imxResult = { ok: false, error: err.message };
    }
    state.imxLoading = false;
    render();
  });

  // IMX Upload button
  const imxUploadBtn = appEl.querySelector('#imx-upload-btn');
  if (imxUploadBtn) imxUploadBtn.addEventListener('click', async () => {
    const input = appEl.querySelector('#imx-upload-input');
    const url = input?.value || '';
    if (!url.trim()) return toast('Enter a paste URL first', 'error');
    state.imxLoading = true;
    state.imxResult = null;
    render();
    try {
      const data = await apiImxUpload(url);
      state.imxResult = data;
    } catch (err) {
      state.imxResult = { ok: false, error: err.message };
    }
    state.imxLoading = false;
    render();
  });

  // IMX result actions
  const imxCopyPaste = appEl.querySelector('#imx-copy-paste');
  if (imxCopyPaste) imxCopyPaste.addEventListener('click', () => copyText(state.imxResult?.pasteUrl || ''));
  const imxOpenPaste = appEl.querySelector('#imx-open-paste');
  if (imxOpenPaste) imxOpenPaste.addEventListener('click', () => window.open(imxOpenPaste.dataset.url, '_blank', 'noopener'));
}

// ====== EXPORT ======
export function renderApp(el) {
  appEl = el;
  render();
}

// make initScramble accessible after import
function initScramble(root) {
  root.querySelectorAll('.glitch, [data-effect="scramble"]').forEach(el => {
    const original = el.dataset.originalText || el.textContent;
    el.dataset.originalText = original;
    el.addEventListener('mouseenter', () => _scramble(el, original));
    el.addEventListener('mouseleave', () => { el.textContent = original; });
  });
}

function initFadeIn(root) {
  root.querySelectorAll('.fade-in').forEach(el => {
    if (el._fadeInit) return;
    el._fadeInit = true;
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.style.opacity='1'; e.target.style.transform='none'; io.unobserve(e.target); }
      });
    }, { threshold: 0.05 });
    io.observe(el);
  });
}

function initAnimateLine(root) {
  root.querySelectorAll('.animate-line').forEach(el => {
    if (el.querySelector('.animate-line__text')) return;
    const span = document.createElement('span');
    span.className = 'animate-line__text';
    while (el.firstChild) span.appendChild(el.firstChild);
    el.appendChild(span);
  });
}

const CHARS = '0123456789!@#$%^&*';
function _scramble(el, original) {
  const len = original.length;
  let raf, start = null;
  const rand = () => CHARS[Math.floor(Math.random() * CHARS.length)];
  const tick = ts => {
    if (!start) start = ts;
    const p = Math.max(0, Math.min(1, (ts - start - 120) / 450));
    el.textContent = Array.from({length: len}, (_,i) => p >= i/(len-1||1) ? original[i] : rand()).join('');
    if (p < 1) raf = requestAnimationFrame(tick);
  };
  if (el._sraf) cancelAnimationFrame(el._sraf);
  el._sraf = requestAnimationFrame(tick);
}
