
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
  // direct URL fetch
  directFetchLoading: false,
  directFetchResult: null,
  // thread viewer
  threadData: null,
  threadPage: 0, // 0-indexed page in threadData.pages
  threadExtractingPost: null, // gidx of the post being extracted
  threadExtractedPosts: {}, // gidx -> result object
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
  // timers
  searchStartTime: null,
  searchElapsed: 0,
  // concurrent fetch tracking: idx -> { extracted, total, phase }
  fetchingCards: new Map(),
  // completed fetch results: idx -> API result data
  completedCards: new Map(),
  // scraped thread data per card: idx -> { threadId, posts: [{title, count, gidx}] }
  scrapedCards: new Map(),
  // concurrent thread post tracking: gidx -> { extracted, total, phase }
  fetchingThreadPosts: new Map(),
  // completed thread post results: gidx -> API result data
  completedThreadPosts: new Map(),
};

let appEl;
let timerInterval = null;

// ====== TIMER HELPERS ======
function startTimerLoop() {
  if (timerInterval) return;
  timerInterval = setInterval(() => {
    let needsUpdate = false;
    // Search timer
    if (state.searchStartTime) {
      state.searchElapsed = ((Date.now() - state.searchStartTime) / 1000).toFixed(1);
      const el = document.querySelector('#search-timer');
      if (el) el.textContent = `${state.searchElapsed}s`;
      needsUpdate = true;
    }
    if (!needsUpdate) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }, 100);
}

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

// Streaming version of apiFetch using SSE
function apiFetchStream(tab, id, query = '', onProgress) {
  return new Promise((resolve, reject) => {
    const endpoint = tab === 'vg' ? '/fetch/vg' : '/fetch/aps';
    const url = `${API}${endpoint}?id=${id}&q=${encodeURIComponent(query)}&stream=1`;
    const es = new EventSource(url);
    es.addEventListener('phase', (e) => {
      try { const d = JSON.parse(e.data); if (onProgress) onProgress({ type: 'phase', ...d }); } catch {}
    });
    es.addEventListener('progress', (e) => {
      try { const d = JSON.parse(e.data); if (onProgress) onProgress({ type: 'progress', ...d }); } catch {}
    });
    es.addEventListener('done', (e) => {
      es.close();
      try { resolve(JSON.parse(e.data)); } catch { reject(new Error('Invalid response')); }
    });
    es.addEventListener('error', (e) => {
      es.close();
      // Try to parse error data if available
      if (e.data) {
        try { const d = JSON.parse(e.data); reject(new Error(d.error || 'Stream error')); return; } catch {}
      }
      reject(new Error('Connection lost'));
    });
    es.onerror = () => {
      es.close();
      reject(new Error('Connection lost'));
    };
  });
}

async function apiScrapeVg(id, query = '') {
  const res = await fetch(`${API}/scrape/vg?id=${id}&q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiHistory(page = 1) {
  const res = await fetch(`${API}/history?page=${page}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiDirectFetch(url) {
  const res = await fetch(`${API}/fetch/url?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiThreadPostExtract(threadId, postIndex) {
  const res = await fetch(`${API}/fetch/thread-post?threadId=${encodeURIComponent(threadId)}&postIndex=${postIndex}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Streaming version of apiThreadPostExtract using SSE
function apiThreadPostExtractStream(threadId, postIndex, onProgress) {
  return new Promise((resolve, reject) => {
    const url = `${API}/fetch/thread-post?threadId=${encodeURIComponent(threadId)}&postIndex=${postIndex}&stream=1`;
    const es = new EventSource(url);
    es.addEventListener('phase', (e) => {
      try { const d = JSON.parse(e.data); if (onProgress) onProgress({ type: 'phase', ...d }); } catch {}
    });
    es.addEventListener('progress', (e) => {
      try { const d = JSON.parse(e.data); if (onProgress) onProgress({ type: 'progress', ...d }); } catch {}
    });
    es.addEventListener('done', (e) => {
      es.close();
      try { resolve(JSON.parse(e.data)); } catch { reject(new Error('Invalid response')); }
    });
    es.addEventListener('error', (e) => {
      es.close();
      if (e.data) {
        try { const d = JSON.parse(e.data); reject(new Error(d.error || 'Stream error')); return; } catch {}
      }
      reject(new Error('Connection lost'));
    });
    es.onerror = () => {
      es.close();
      reject(new Error('Connection lost'));
    };
  });
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
    download: `<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    viper: `<img src="/web.svg" style="width: 1em; height: 1em;" alt="Viper">`,
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
      <img src="/web.svg" class="nav-logo-icon" alt="V" />
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
            ? `<div class="spinner"></div> Searching… <span id="search-timer" class="timer-badge">${state.searchElapsed || '0.0'}s</span>`
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
  const isFetching = state.fetchingCards.has(idx);
  const fetchInfo = isFetching ? state.fetchingCards.get(idx) : null;
  const isCompleted = state.completedCards.has(idx);
  const completedData = isCompleted ? state.completedCards.get(idx) : null;
  const isScraped = state.scrapedCards.has(idx);
  const scrapedData = isScraped ? state.scrapedCards.get(idx) : null;

  let actionsHtml;
  if (isFetching) {
    const phase = fetchInfo?.phase || 'scraping';
    const progressText = phase === 'extracting'
      ? `${fetchInfo?.extracted ?? 0}/${fetchInfo?.total ?? '?'}` 
      : 'Scraping…';
    actionsHtml = `
      <div class="result-actions">
        <div class="inline-progress">
          <div class="spinner" style="width:14px;height:14px;border-width:2px"></div>
          <span class="progress-label">${phase === 'extracting' ? 'Extracting' : 'Scraping…'}</span>
          ${phase === 'extracting' ? `<span class="progress-counter" data-fetch-progress="${idx}">${progressText}</span>` : ''}
        </div>
      </div>`;
  } else if (isCompleted) {
    const ok = completedData?.ok;
    const errMsg = !ok ? (completedData?.error || 'Extraction failed') : '';
    const isImgNotFound = errMsg.toLowerCase().includes('images not found') || errMsg.toLowerCase().includes('no image links');
    actionsHtml = `
      <div class="result-actions">
        <button class="action-btn" data-open="${r.url}" title="Open thread">
          ${svgIcon('external')}
        </button>
        ${!ok ? `<button class="action-btn retry-btn" data-retry-idx="${idx}" title="Retry extraction">↻ Retry</button>` : ''}
        <button class="action-btn ${ok ? 'done' : 'done-error'}" data-view-completed="${idx}" title="${ok ? 'View result' : errMsg}">
          ${ok ? '✓' : (isImgNotFound ? '🖼 Not found' : '✗ Error')} ${ok ? `${completedData.extracted}/${completedData.total}` : ''}
        </button>
      </div>`;
  } else if (isScraped) {
    // Show inline post picker
    const postsHtml = scrapedData.posts.map((p, pi) => {
      const postFetchInfo = state.fetchingCards.get(`${idx}-${pi}`);
      const postCompleted = state.completedCards.get(`${idx}-${pi}`);
      let postBtn;
      if (postFetchInfo) {
        const phase = postFetchInfo.phase || 'extracting';
        const txt = phase === 'extracting' ? `${postFetchInfo.extracted ?? 0}/${postFetchInfo.total ?? '?'}` : 'Scraping…';
        postBtn = `<div class="inline-progress" style="padding:3px 8px">
          <div class="spinner" style="width:10px;height:10px;border-width:1.5px"></div>
          <span class="progress-counter" data-fetch-progress="${idx}-${pi}" style="font-size:11px">${txt}</span>
        </div>`;
      } else if (postCompleted) {
        const ok = postCompleted.ok;
        const pErrMsg = !ok ? (postCompleted.error || 'Failed') : '';
        const pIsImgNotFound = pErrMsg.toLowerCase().includes('images not found') || pErrMsg.toLowerCase().includes('no image links');
        postBtn = `<div style="display:flex;gap:4px;align-items:center">
          ${!ok ? `<button class="action-btn retry-btn" data-retry-card-idx="${idx}" data-retry-post-idx="${pi}" style="font-size:11px;padding:3px 8px" title="Retry">↻</button>` : ''}
          <button class="action-btn ${ok ? 'done' : 'done-error'}" data-view-completed="${idx}-${pi}" style="font-size:11px;padding:3px 10px" title="${ok ? '' : pErrMsg}">
            ${ok ? '✓' : (pIsImgNotFound ? '🖼' : '✗')} ${ok ? `${postCompleted.extracted}/${postCompleted.total}` : 'Fail'}
          </button>
        </div>`;
      } else {
        postBtn = `<button class="action-btn primary inline-extract-btn" data-card-idx="${idx}" data-post-idx="${pi}" style="font-size:11px;padding:3px 10px">Extract</button>`;
      }
      return `<div class="post-pick-row">
        <span class="post-pick-title" title="${p.title}">${p.title}</span>
        <span class="post-pick-count">${p.count} img</span>
        ${postBtn}
      </div>`;
    }).join('');
    actionsHtml = '';
    // We'll append the post picker after the card body
    return `
    <div class="result-card fade-in card-scraped" style="animation-delay:${delay}ms" data-idx="${idx}">
      <span class="result-index">${(state.page-1)*20 + idx + 1}</span>
      <div class="result-body">
        <div class="result-title" title="${r.title}">${r.title}</div>
        <div class="result-meta">
          ${prefixHtml}
          ${idLabel ? `<span class="result-id glitch" title="Click to copy" data-id="${idLabel}" style="cursor:pointer">${idLabel}</span>` : ''}
          ${dateStr ? `<span class="result-date">${dateStr}</span>` : ''}
          ${r.category ? `<span class="result-prefix">${r.category}</span>` : ''}
        </div>
        <div class="post-pick-list">
          <div class="post-pick-header">Select post to extract</div>
          ${postsHtml}
        </div>
      </div>
      <div class="result-actions">
        <button class="action-btn" data-open="${r.url}" title="Open thread">
          ${svgIcon('external')}
        </button>
      </div>
    </div>`;
  } else {
    actionsHtml = `
      <div class="result-actions">
        <button class="action-btn" data-open="${r.url}" title="Open thread">
          ${svgIcon('external')}
        </button>
        <button class="action-btn primary" data-fetch-idx="${idx}" title="Get images">
          Get images
        </button>
      </div>`;
  }

  return `
  <div class="result-card fade-in ${isFetching ? 'card-fetching' : ''} ${isCompleted ? (completedData?.ok ? 'card-done' : 'card-error') : ''}" style="animation-delay:${delay}ms" data-idx="${idx}">
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
    ${actionsHtml}
  </div>`;
}

// ====== RESULTS SECTION ======
function renderResults() {
  if (state.threadData) {
    return renderThreadView();
  }

  if (state.directFetchLoading) {
    return `
      <div class="results-list">
        <div class="status-bar fade-in">
          <div class="status-info" style="gap:12px">
            <div class="spinner"></div>
            <span>Fetching thread details…</span>
          </div>
        </div>
        ${renderSkeleton()}
      </div>`;
  }

  if (state.directFetchResult) {
    const d = state.directFetchResult;
    if (d.ok) {
      const previewHtml = (d.previewUrls || []).map(u =>
        `<div class="preview-url glitch" data-effect="scramble" title="${u}">${u}</div>`
      ).join('');

      return `
        <div class="imx-result fade-in">
          <div class="result-info-grid">
            <div class="info-row"><span class="info-key">Title</span><span class="info-val">${d.title || ''}</span></div>
            <div class="info-row"><span class="info-key">Images</span><span class="info-val accent">${d.extracted}/${d.total}</span></div>
            ${d.services ? `<div class="info-row"><span class="info-key">Service</span><span class="info-val">${d.services}</span></div>` : ''}
            <div class="info-row"><span class="info-key">Source</span><span class="info-val url-val" title="${d.sourceUrl}">${d.sourceUrl}</span></div>
            ${d.pasteUrl ? `<div class="info-row"><span class="info-key">Link</span><span class="info-val"><a class="paste-link" href="${d.pasteUrl}" target="_blank" rel="noopener">${d.pasteUrl}</a></span></div>` : ''}
          </div>
          ${d.sendCommand || d.dlCommand ? `<div class="cmd-block" data-copy-cmd="${[d.sendCommand, d.dlCommand].filter(Boolean).join('\\n')}">${[d.sendCommand, d.dlCommand].filter(Boolean).map(c => `<div class="cmd-line">${c}</div>`).join('')}</div>` : ''}
          ${previewHtml ? `<div class="preview-block" style="margin-top:16px">${previewHtml}</div>` : ''}
          <div class="modal-actions" style="margin-top:16px">
            ${d.pasteUrl ? `<button class="action-btn" id="df-copy-paste">${svgIcon('copy')} Copy Link</button>` : ''}
            ${d.sendCommand ? `<button class="action-btn" id="df-copy-send">${svgIcon('copy')} Copy /send</button>` : ''}
            <button class="action-btn primary" id="df-open" data-url="${d.sourceUrl}">${svgIcon('external')} Open Thread</button>
          </div>
        </div>`;
    } else {
      return `
        <div class="imx-result fade-in">
          <div class="error-msg">${d.error || 'Extraction failed'}</div>
        </div>`;
    }
  }

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
        <img src="/web.svg" style="width: 48px; height: 48px; margin-bottom: 16px;" alt="Viper">
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
        <button class="export-btn" id="export-btn" title="Export search results as JSON">
          ${svgIcon('download')} Export
        </button>
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

// ====== THREAD VIEW ======
function renderThreadView() {
  const d = state.threadData;
  const pageData = d.pages[state.threadPage];
  if (!pageData) return '<div class="error-msg">Invalid page</div>';

  const globalStart = d.pages.slice(0, state.threadPage).reduce((s, p) => s + p.posts.length, 0);
  const totalPosts = d.pages.reduce((s, p) => s + p.posts.length, 0);

  const postsHtml = pageData.posts.map((post, i) => {
    const gidx = globalStart + i;
    const isFetchingPost = state.fetchingThreadPosts.has(gidx);
    const fetchInfo = isFetchingPost ? state.fetchingThreadPosts.get(gidx) : null;
    const isCompletedPost = state.completedThreadPosts.has(gidx);
    const completedPostData = isCompletedPost ? state.completedThreadPosts.get(gidx) : null;
    const delay = Math.min(i * 40, 400);
    // Page-relative display number
    const displayNum = gidx + 1;

    let actionsHtml;
    if (isFetchingPost) {
      const phase = fetchInfo?.phase || 'extracting';
      const progressText = `${fetchInfo?.extracted ?? 0}/${fetchInfo?.total ?? '?'}`;
      actionsHtml = `<div class="result-actions">
        <div class="inline-progress">
          <div class="spinner" style="width:14px;height:14px;border-width:2px"></div>
          <span class="progress-label">Extracting</span>
          <span class="progress-counter" data-thread-progress="${gidx}">${progressText}</span>
        </div>
      </div>`;
    } else if (isCompletedPost) {
      const ok = completedPostData?.ok;
      const tErrMsg = !ok ? (completedPostData?.error || 'Extraction failed') : '';
      const tIsImgNotFound = tErrMsg.toLowerCase().includes('images not found') || tErrMsg.toLowerCase().includes('no image links');
      actionsHtml = `<div class="result-actions">
        ${!ok ? `<button class="action-btn retry-btn" data-retry-thread-gidx="${gidx}" title="Retry extraction">↻ Retry</button>` : ''}
        <button class="action-btn ${ok ? 'done' : 'done-error'}" data-view-completed-post="${gidx}" title="${ok ? 'View result' : tErrMsg}">
          ${ok ? '✓' : (tIsImgNotFound ? '🖼 Not found' : '✗ Error')} ${ok ? `${completedPostData.extracted}/${completedPostData.total}` : ''}
        </button>
      </div>`;
    } else {
      actionsHtml = `<div class="result-actions">
           <button class="action-btn primary extract-post-btn" data-gidx="${gidx}" title="Get images">Get images</button>
         </div>`;
    }

    return `
      <div class="result-card fade-in ${isFetchingPost ? 'card-fetching' : ''} ${isCompletedPost ? (completedPostData?.ok ? 'card-done' : 'card-error') : ''}" style="animation-delay:${delay}ms">
        <span class="result-index">${displayNum}</span>
        <div class="result-body">
          <div class="result-title">${post.title || `Post #${displayNum}`}</div>
          <div class="result-meta">
            <span class="result-prefix">VG</span>
            <span class="result-id">${post.count} images</span>
          </div>
        </div>
        ${actionsHtml}
      </div>`;
  }).join('');

  return `
    <div class="status-bar fade-in">
      <div class="status-info">
        <span class="status-count">${totalPosts}</span>
        <span>posts in thread &ldquo;<strong>${d.title}</strong>&rdquo;</span>
      </div>
      <div class="status-actions">
        <div class="pagination">
          <button class="icon-btn" id="thread-prev-page" ${state.threadPage <= 0 ? 'disabled' : ''}>${svgIcon('chevron_left')}</button>
          <span class="page-info">Page ${state.threadPage + 1} / ${d.totalPages}</span>
          <button class="icon-btn" id="thread-next-page" ${state.threadPage >= d.pages.length - 1 ? 'disabled' : ''}>${svgIcon('chevron_right')}</button>
        </div>
      </div>
    </div>
    <div class="results-list">
      ${postsHtml}
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

  const isImgNotFoundModal = (d.error || '').toLowerCase().includes('images not found') || (d.error || '').toLowerCase().includes('no image links');
  const statsHtml = d.ok ? `
    <div class="result-info-grid">
      <div class="info-row"><span class="info-key">Images</span><span class="info-val accent">${d.extracted}/${d.total}</span></div>
      ${d.failed > 0 ? `<div class="info-row"><span class="info-key">Failed</span><span class="info-val" style="color:#f87171">${d.failed}</span></div>` : ''}
      <div class="info-row"><span class="info-key">Expires</span><span class="info-val">7 days</span></div>
      ${d.services ? `<div class="info-row"><span class="info-key">Service</span><span class="info-val">${d.services}</span></div>` : ''}
      <div class="info-row"><span class="info-key">Source</span><span class="info-val url-val" title="${d.sourceUrl}">${d.sourceUrl}</span></div>
      ${d.pasteUrl ? `<div class="info-row"><span class="info-key">Link</span><span class="info-val"><a class="paste-link" href="${d.pasteUrl}" target="_blank" rel="noopener">${d.pasteUrl}</a></span></div>` : ''}
    </div>` : `<div class="error-msg">${isImgNotFoundModal ? '🖼️ ' : ''}${d.error || 'Extraction failed'}</div>`;

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
    initAnimateLine(appEl);
  });
}

// ====== URL DETECTION ======
function isThreadUrl(text) {
  return /https?:\/\/(www\.)?vipergirls\.to\/threads\//i.test(text) ||
         /https?:\/\/(www\.)?adultphotosets/i.test(text);
}

// ====== SEARCH ======
async function doSearch(query, page = 1) {
  if (!query.trim()) return;

  // If user pasted a thread URL, go directly to extraction (inline)
  if (isThreadUrl(query.trim())) {
    state.query = query;
    state.results = [];
    state.directFetchLoading = true;
    state.directFetchResult = null;
    state.threadData = null;
    state.threadExtractedPosts = {};
    state.fetchingCards.clear();
    state.completedCards.clear();
    state.scrapedCards.clear();
    state.fetchingThreadPosts.clear();
    state.completedThreadPosts.clear();
    render();
    try {
      const data = await apiDirectFetch(query.trim());
      if (data.ok && data.threadData) {
        state.threadData = data.threadData;
        state.threadId = data.threadId;
        state.threadPage = 0;
      } else {
        state.directFetchResult = { ok: false, error: 'Failed to fetch thread' };
      }
    } catch (err) {
      state.directFetchResult = { ok: false, error: err.message };
    }
    state.directFetchLoading = false;
    render();
    return;
  }

  state.query = query;
  state.page = page;
  state.loading = true;
  state.results = [];
  state.fetchingCards.clear();
  state.completedCards.clear();
  state.scrapedCards.clear();
  state.fetchingThreadPosts.clear();
  state.completedThreadPosts.clear();
  state.searchStartTime = Date.now();
  state.searchElapsed = '0.0';
  render();
  startTimerLoop();

  try {
    const data = await apiSearch(state.tab, query, page);
    state.results = data.results || [];
    state.totalResults = data.total || state.results.length;
    state.totalPages = Math.max(1, Math.ceil(state.totalResults / 20));
    state.loading = false;
    const elapsed = ((Date.now() - state.searchStartTime) / 1000).toFixed(1);
    state.searchStartTime = null;
    state.searchElapsed = 0;
    render();
    toast(`Found ${state.totalResults} results in ${elapsed}s`, 'success');
  } catch (err) {
    state.loading = false;
    state.searchStartTime = null;
    state.searchElapsed = 0;
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

// ====== EXPORT ======
async function exportSearchData() {
  if (!state.results.length) {
    toast('No results to export', 'error');
    return;
  }

  const btn = appEl.querySelector('#export-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner" style="width:12px;height:12px;border-width:1.5px"></div> Exporting…'; }

  const allResults = [];
  const query = state.query;
  const tab = state.tab;
  const totalPages = state.totalPages;

  try {
    for (let p = 1; p <= totalPages; p++) {
      toast(`Fetching page ${p}/${totalPages}…`, 'success');
      const data = await apiSearch(tab, query, p);
      const pageResults = (data.results || []).map(r => ({
        title: r.title || '',
        id: r.sgenId || r.apsId || '',
        url: r.url || '',
        prefix: r.prefix || '',
        category: r.category || '',
        date: r.timestamp ? formatDate(r.timestamp) : (r.dateText || ''),
      }));
      allResults.push(...pageResults);
    }

    const exportData = {
      query,
      tab,
      totalResults: state.totalResults,
      totalPages,
      exportedAt: new Date().toISOString(),
      results: allResults,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `viper-search-${query.replace(/[^a-z0-9]/gi, '_')}-all.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast(`Exported ${allResults.length} results (${totalPages} pages)`, 'success');
  } catch (err) {
    toast(`Export failed: ${err.message}`, 'error');
  }

  if (btn) { btn.disabled = false; btn.innerHTML = `${svgIcon('download')} Export`; }
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
      state.fetchingCards.clear();
      state.completedCards.clear();
      state.scrapedCards.clear();
      state.fetchingThreadPosts.clear();
      state.completedThreadPosts.clear();
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

  // Export button
  const exportBtn = appEl.querySelector('#export-btn');
  if (exportBtn) exportBtn.addEventListener('click', () => exportSearchData());

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

  // Fetch images buttons — non-blocking, concurrent, with SSE progress
  appEl.querySelectorAll('[data-fetch-idx]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.fetchIdx);
      const r = state.results[idx];
      if (!r) return;
      // Already fetching this one? ignore
      if (state.fetchingCards.has(idx)) return;

      // VG tab: scrape thread first → show post picker inline
      if (state.tab === 'vg' && r.sgenId) {
        state.fetchingCards.set(idx, { phase: 'scraping', extracted: 0, total: 0 });
        render();
        try {
          const data = await apiScrapeVg(r.sgenId, state.query);
          if (data.ok && data.threadData) {
            // Flatten all posts across pages
            const posts = [];
            for (const page of data.threadData.pages) {
              for (const p of page.posts) {
                posts.push({ title: p.title || `Post #${posts.length + 1}`, count: p.count || p.links?.length || 0 });
              }
            }

            if (posts.length === 1) {
              // Only 1 post — extract directly, no picker needed
              state.fetchingCards.set(idx, { phase: 'extracting', extracted: 0, total: posts[0].count });
              // Targeted DOM update: switch label from Scraping to Extracting + add counter
              const card = document.querySelector(`[data-idx="${idx}"]`);
              if (card) {
                const label = card.querySelector('.progress-label');
                if (label) label.textContent = 'Extracting';
                const prog = card.querySelector('.inline-progress');
                if (prog && !prog.querySelector('.progress-counter')) {
                  const span = document.createElement('span');
                  span.className = 'progress-counter';
                  span.dataset.fetchProgress = String(idx);
                  span.textContent = `0/${posts[0].count}`;
                  prog.appendChild(span);
                }
              }
              const result = await apiThreadPostExtractStream(data.threadId, 0, (progress) => {
                const info = state.fetchingCards.get(idx);
                if (!info) return;
                if (progress.type === 'phase') {
                  info.phase = progress.phase;
                  if (progress.total) info.total = progress.total;
                  // Targeted DOM update instead of full render
                  const card = document.querySelector(`[data-idx="${idx}"]`);
                  if (card) {
                    const label = card.querySelector('.progress-label');
                    if (label) label.textContent = info.phase === 'extracting' ? 'Extracting' : 'Scraping…';
                    // Show counter if transitioning to extracting
                    const prog = card.querySelector('.inline-progress');
                    if (prog && info.phase === 'extracting' && !prog.querySelector('.progress-counter')) {
                      const span = document.createElement('span');
                      span.className = 'progress-counter';
                      span.dataset.fetchProgress = String(idx);
                      span.textContent = `0/${info.total || '?'}`;
                      prog.appendChild(span);
                    }
                  }
                } else if (progress.type === 'progress') {
                  info.extracted = progress.extracted;
                  info.total = progress.total;
                  const el = document.querySelector(`[data-fetch-progress="${idx}"]`);
                  if (el) el.textContent = `${progress.extracted}/${progress.total}`;
                }
              });
              state.fetchingCards.delete(idx);
              const completed = {
                ...result,
                title: result.title || r.title,
                sourceUrl: result.sourceUrl || r.url,
              };
              state.completedCards.set(idx, completed);
              render();
              toast(`✓ ${r.title?.slice(0, 40)} — ${result.extracted || 0}/${result.total || 0}`, 'success');
            } else {
              // Multiple posts — show picker
              state.fetchingCards.delete(idx);
              state.scrapedCards.set(idx, { threadId: data.threadId, posts });
              render();
              toast(`${posts.length} posts found — pick one to extract`, 'success');
            }
          } else {
            state.fetchingCards.delete(idx);
            toast('Failed to scrape thread', 'error');
            render();
          }
        } catch (err) {
          state.fetchingCards.delete(idx);
          render();
          toast(`Scrape failed: ${err.message}`, 'error');
        }
        return;
      }

      // APS tab (or fallback): extract directly with SSE progress
      state.fetchingCards.set(idx, { phase: 'scraping', extracted: 0, total: 0 });
      render();

      try {
        const id = r.sgenId || r.apsId;
        const data = await apiFetchStream(state.tab, id, state.query, (progress) => {
          const info = state.fetchingCards.get(idx);
          if (!info) return;
          if (progress.type === 'phase') {
            info.phase = progress.phase;
            if (progress.total) info.total = progress.total;
            // Targeted DOM update instead of full render
            const card = document.querySelector(`[data-idx="${idx}"]`);
            if (card) {
              const label = card.querySelector('.progress-label');
              if (label) label.textContent = info.phase === 'extracting' ? 'Extracting' : 'Scraping…';
              const prog = card.querySelector('.inline-progress');
              if (prog && info.phase === 'extracting' && !prog.querySelector('.progress-counter')) {
                const span = document.createElement('span');
                span.className = 'progress-counter';
                span.dataset.fetchProgress = String(idx);
                span.textContent = `0/${info.total || '?'}`;
                prog.appendChild(span);
              }
            }
          } else if (progress.type === 'progress') {
            info.extracted = progress.extracted;
            info.total = progress.total;
            const el = document.querySelector(`[data-fetch-progress="${idx}"]`);
            if (el) el.textContent = `${progress.extracted}/${progress.total}`;
          }
        });
        state.fetchingCards.delete(idx);
        const result = {
          ...data,
          title: data.title || r.title,
          sourceUrl: data.sourceUrl || r.url,
        };
        state.completedCards.set(idx, result);
        render();
        toast(`✓ ${r.title?.slice(0, 40)} — ${data.extracted || 0}/${data.total || 0}`, 'success');
      } catch (err) {
        state.fetchingCards.delete(idx);
        state.completedCards.set(idx, { ok: false, error: err.message, title: r.title, sourceUrl: r.url });
        render();
        toast(`✗ ${r.title?.slice(0, 40)} — failed`, 'error');
      }
    });
  });

  // Inline post extract buttons (from scraped VG cards)
  appEl.querySelectorAll('.inline-extract-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const cardIdx = parseInt(btn.dataset.cardIdx);
      const postIdx = parseInt(btn.dataset.postIdx);
      const scraped = state.scrapedCards.get(cardIdx);
      if (!scraped) return;
      const key = `${cardIdx}-${postIdx}`;
      if (state.fetchingCards.has(key)) return;

      state.fetchingCards.set(key, { phase: 'extracting', extracted: 0, total: 0 });
      render();

      try {
        const data = await apiThreadPostExtractStream(scraped.threadId, postIdx, (progress) => {
          const info = state.fetchingCards.get(key);
          if (!info) return;
          if (progress.type === 'phase') {
            info.phase = progress.phase;
            if (progress.total) info.total = progress.total;
            // Targeted DOM update instead of full render
            const counter = document.querySelector(`[data-fetch-progress="${key}"]`);
            if (counter) counter.textContent = `0/${info.total || '?'}`;
          } else if (progress.type === 'progress') {
            info.extracted = progress.extracted;
            info.total = progress.total;
            const el = document.querySelector(`[data-fetch-progress="${key}"]`);
            if (el) el.textContent = `${progress.extracted}/${progress.total}`;
          }
        });
        state.fetchingCards.delete(key);
        const r = state.results[cardIdx];
        const result = {
          ...data,
          title: data.title || scraped.posts[postIdx]?.title,
          sourceUrl: data.sourceUrl || r?.url,
        };
        state.completedCards.set(key, result);
        render();
        toast(`✓ ${result.title?.slice(0, 40)} — ${data.extracted || 0}/${data.total || 0}`, 'success');
      } catch (err) {
        state.fetchingCards.delete(key);
        state.completedCards.set(key, { ok: false, error: err.message, title: scraped.posts[postIdx]?.title });
        render();
        toast(`✗ Extract failed: ${err.message}`, 'error');
      }
    });
  });

  // View completed card results (supports both simple idx and composite idx-postIdx keys)
  appEl.querySelectorAll('[data-view-completed]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const raw = btn.dataset.viewCompleted;
      // Try composite key first (string like "2-0"), then integer
      const result = state.completedCards.get(raw) || state.completedCards.get(parseInt(raw));
      if (result) {
        state.modalData = result;
        render();
      }
    });
  });

  // Retry buttons for failed search result cards
  appEl.querySelectorAll('[data-retry-idx]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.retryIdx);
      const r = state.results[idx];
      if (!r) return;
      // Clear completed error state
      state.completedCards.delete(idx);
      state.scrapedCards.delete(idx);
      // Re-trigger the "Get images" click flow by simulating it
      render();
      // After render, find and click the new Get images button
      requestAnimationFrame(() => {
        const newBtn = appEl.querySelector(`[data-fetch-idx="${idx}"]`);
        if (newBtn) newBtn.click();
      });
    });
  });

  // Retry buttons for inline post extractions
  appEl.querySelectorAll('[data-retry-card-idx]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cardIdx = parseInt(btn.dataset.retryCardIdx);
      const postIdx = parseInt(btn.dataset.retryPostIdx);
      const key = `${cardIdx}-${postIdx}`;
      // Clear completed error state
      state.completedCards.delete(key);
      render();
      // After render, find and click the new Extract button
      requestAnimationFrame(() => {
        const newBtn = appEl.querySelector(`[data-card-idx="${cardIdx}"][data-post-idx="${postIdx}"]`);
        if (newBtn) newBtn.click();
      });
    });
  });

  // Retry buttons for thread view posts
  appEl.querySelectorAll('[data-retry-thread-gidx]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const gidx = parseInt(btn.dataset.retryThreadGidx);
      // Clear completed error state
      state.completedThreadPosts.delete(gidx);
      render();
      // After render, find and click the new Get images button
      requestAnimationFrame(() => {
        const newBtn = appEl.querySelector(`[data-gidx="${gidx}"]`);
        if (newBtn) newBtn.click();
      });
    });
  });

  // Modal
  const overlay = appEl.querySelector('#modal-overlay');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        state.modalData = null;
        render();
      }
    });
  }

  // Direct fetch actions
  const dfOpenBtn = appEl.querySelector('#df-open');
  if (dfOpenBtn) dfOpenBtn.addEventListener('click', () => window.open(dfOpenBtn.dataset.url, '_blank', 'noopener'));

  const cmdBlock = appEl.querySelector('.cmd-block');
  if (cmdBlock) cmdBlock.addEventListener('click', () => copyText(cmdBlock.dataset.copyCmd.replace(/\\n/g, '\n')));

  const dfCopyPaste = appEl.querySelector('#df-copy-paste');
  if (dfCopyPaste && state.directFetchResult?.pasteUrl) {
    dfCopyPaste.addEventListener('click', () => copyText(state.directFetchResult.pasteUrl));
  }

  const dfCopySend = appEl.querySelector('#df-copy-send');
  if (dfCopySend && state.directFetchResult?.sendCommand) {
    dfCopySend.addEventListener('click', () => copyText(state.directFetchResult.sendCommand));
  }

  // Thread view pagination
  const threadPrevBtn = appEl.querySelector('#thread-prev-page');
  const threadNextBtn = appEl.querySelector('#thread-next-page');
  if (threadPrevBtn) {
    threadPrevBtn.addEventListener('click', () => {
      if (state.threadPage > 0) {
        state.threadPage--;
        render();
      }
    });
  }
  if (threadNextBtn) {
    threadNextBtn.addEventListener('click', () => {
      if (state.threadData && state.threadPage < state.threadData.pages.length - 1) {
        state.threadPage++;
        render();
      }
    });
  }

  // Thread view extract buttons — non-blocking, concurrent
  appEl.querySelectorAll('.extract-post-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const gidx = parseInt(btn.dataset.gidx);
      // Already fetching? ignore
      if (state.fetchingThreadPosts.has(gidx)) return;

      // Find post title for modal header
      const d = state.threadData;
      let postTitle = `Post #${gidx + 1}`;
      let cur = 0;
      outer: for (const page of d.pages) {
        for (const p of page.posts) {
          if (cur === gidx) { postTitle = p.title || postTitle; break outer; }
          cur++;
        }
      }

      // Mark as fetching inline (no blocking modal)
      state.fetchingThreadPosts.set(gidx, { phase: 'extracting', extracted: 0, total: 0 });
      render();

      try {
        const data = await apiThreadPostExtractStream(state.threadId, gidx, (progress) => {
          const info = state.fetchingThreadPosts.get(gidx);
          if (!info) return;
          if (progress.type === 'phase') {
            info.phase = progress.phase;
            if (progress.total) info.total = progress.total;
            render();
          } else if (progress.type === 'progress') {
            info.extracted = progress.extracted;
            info.total = progress.total;
            const el = document.querySelector(`[data-thread-progress="${gidx}"]`);
            if (el) el.textContent = `${progress.extracted}/${progress.total}`;
          }
        });
        state.fetchingThreadPosts.delete(gidx);
        // Store result on the card (don't auto-open modal)
        const result = {
          ...data,
          title: data.title || postTitle,
          sourceUrl: data.sourceUrl || d.url,
        };
        state.completedThreadPosts.set(gidx, result);
        render();
        toast(`✓ ${postTitle?.slice(0, 40)} — ${data.extracted || 0}/${data.total || 0}`, 'success');
      } catch (err) {
        state.fetchingThreadPosts.delete(gidx);
        state.completedThreadPosts.set(gidx, { ok: false, error: err.message, title: postTitle, sourceUrl: d.url });
        render();
        toast(`✗ ${postTitle?.slice(0, 40)} — failed`, 'error');
      }
    });
  });

  // View completed thread post results
  appEl.querySelectorAll('[data-view-completed-post]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const gidx = parseInt(btn.dataset.viewCompletedPost);
      const result = state.completedThreadPosts.get(gidx);
      if (result) {
        state.modalData = result;
        render();
      }
    });
  });

  const modalClose = appEl.querySelector('#modal-close');
  if (modalClose) modalClose.addEventListener('click', () => { state.modalData = null; render(); });

  const modalCopyPaste = appEl.querySelector('#modal-copy-paste');
  if (modalCopyPaste) modalCopyPaste.addEventListener('click', () => copyText(state.modalData?.pasteUrl || ''));

  const modalCopySend = appEl.querySelector('#modal-copy-send');
  if (modalCopySend) modalCopySend.addEventListener('click', () => copyText(state.modalData?.sendCommand || ''));

  const modalOpen = appEl.querySelector('#modal-open');
  if (modalOpen) modalOpen.addEventListener('click', () => window.open(modalOpen.dataset.url, '_blank', 'noopener'));

  // Copy command lines on click — unescape \n stored in data attribute into real newlines
  appEl.querySelectorAll('[data-copy-cmd]').forEach(el => {
    el.style.cursor = 'pointer';
    el.title = 'Click to copy';
    el.addEventListener('click', () => copyText(el.dataset.copyCmd.replace(/\\n/g, '\n')));
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
