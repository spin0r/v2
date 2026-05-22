import { state, render } from '../app.js';
import { svgIcon, formatDate, toast, celebrate, startTimerLoop, isThreadUrl, copyText, getCmdText } from '../utils.js';
import { apiSearch, apiDirectFetch } from '../api.js';

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
    const hasFailedLinks = ok && completedData?.failedLinks && completedData.failedLinks.length > 0;
    actionsHtml = `
      <div class="result-actions">
        <button class="action-btn" data-open="${r.url}" title="Open thread">
          ${svgIcon('external')}
        </button>
        ${!ok ? `<button class="action-btn retry-btn" data-retry-idx="${idx}" title="Retry extraction">↻ Retry</button>` : ''}
        ${ok && (completedData.sendCommand || completedData.dlCommand) ? `<button class="action-btn copy-cmd-btn" data-copy-card="${idx}" title="Copy commands">${svgIcon('copy')}</button>` : ''}
        <button class="action-btn ${ok ? (hasFailedLinks ? 'done-warn' : 'done') : 'done-error'}" data-view-completed="${idx}" title="${ok ? (hasFailedLinks ? `${completedData.failed} images failed — click to re-extract` : 'View result') : errMsg}">
          ${ok ? '✓' : (isImgNotFound ? '× Not found' : '× Error')} ${ok ? `${completedData.extracted}/${completedData.total}` : ''}${hasFailedLinks ? ` <span style="color:#f87171;font-size:10px">(${completedData.failed} failed)</span>` : ''}
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
          ${ok && (postCompleted.sendCommand || postCompleted.dlCommand) ? `<button class="action-btn copy-cmd-btn" data-copy-card="${idx}-${pi}" style="font-size:11px;padding:3px 8px" title="Copy commands">${svgIcon('copy')}</button>` : ''}
          <button class="action-btn ${ok ? 'done' : 'done-error'}" data-view-completed="${idx}-${pi}" style="font-size:11px;padding:3px 10px" title="${ok ? '' : pErrMsg}">
            ${ok ? '✓' : (pIsImgNotFound ? '×' : '×')} ${ok ? `${postCompleted.extracted}/${postCompleted.total}` : 'Fail'}
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

  // Check if there are any completed extractions with commands to copy
  const hasCompletedCmds = [...state.completedCards.values()].some(c => c.ok && (c.sendCommand || c.dlCommand)) ||
    [...state.completedThreadPosts.values()].some(c => c.ok && (c.sendCommand || c.dlCommand));

  return `
    <div class="status-bar fade-in">
      <div class="status-info">
        <span class="status-count">${state.totalResults}</span>
        <span>results for "<strong>${state.query}</strong>"</span>
      </div>
      <div class="status-actions">
        ${hasCompletedCmds ? `<button class="export-btn" id="copy-all-btn" title="Copy all extracted commands">
          ${svgIcon('copy_all')} Copy All
        </button>` : ''}
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
      const tHasFailedLinks = ok && completedPostData?.failedLinks && completedPostData.failedLinks.length > 0;
      actionsHtml = `<div class="result-actions">
        ${!ok ? `<button class="action-btn retry-btn" data-retry-thread-gidx="${gidx}" title="Retry extraction">↻ Retry</button>` : ''}
        ${ok && (completedPostData.sendCommand || completedPostData.dlCommand) ? `<button class="action-btn copy-cmd-btn" data-copy-thread-post="${gidx}" title="Copy commands">${svgIcon('copy')}</button>` : ''}
        <button class="action-btn ${ok ? (tHasFailedLinks ? 'done-warn' : 'done') : 'done-error'}" data-view-completed-post="${gidx}" title="${ok ? (tHasFailedLinks ? `${completedPostData.failed} failed — click to re-extract` : 'View result') : tErrMsg}">
          ${ok ? '✓' : (tIsImgNotFound ? '× Not found' : '× Error')} ${ok ? `${completedPostData.extracted}/${completedPostData.total}` : ''}${tHasFailedLinks ? ` <span style="color:#f87171;font-size:10px">(${completedPostData.failed} failed)</span>` : ''}
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
        ${[...state.completedThreadPosts.values()].some(c => c.ok && (c.sendCommand || c.dlCommand)) ? `<button class="export-btn" id="copy-all-btn" title="Copy all extracted commands">
          ${svgIcon('copy_all')} Copy All
        </button>` : ''}
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
      ${d.newlyRecovered > 0 ? `<div class="info-row"><span class="info-key">Recovered</span><span class="info-val" style="color:#34d399">+${d.newlyRecovered}</span></div>` : ''}
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
        <button class="modal-close" id="modal-close">×</button>
      </div>

      ${statsHtml}

      ${cmdHtml}

      ${previewHtml ? `<div class="preview-block">${previewHtml}</div>` : ''}

      <div class="modal-actions" style="margin-top:16px">
        ${d.pasteUrl ? `<button class="action-btn" id="modal-copy-paste">${svgIcon('copy')} Copy Link</button>` : ''}
        ${d.sendCommand ? `<button class="action-btn" id="modal-copy-send">${svgIcon('copy')} Copy /send</button>` : ''}
        ${d.ok && d.failedLinks && d.failedLinks.length > 0 ? `<button class="action-btn retry-btn" id="modal-reextract-failed" title="Retry ${d.failedLinks.length} failed extractions">↻ Re-extract Failed (${d.failedLinks.length})</button>` : ''}
        ${d.ok ? `<button class="action-btn" id="modal-reextract-all" title="Re-extract all images from scratch" style="color:#a78bfa">↻ Re-extract All</button>` : ''}
        <button class="action-btn primary" id="modal-open" data-url="${d.sourceUrl}">
          ${svgIcon('external')} Open Thread
        </button>
      </div>
    </div>
  </div>`;
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
  startTimerLoop(state);

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
    if (page === 1) celebrate();
  } catch (err) {
    state.loading = false;
    state.searchStartTime = null;
    state.searchElapsed = 0;
    state.results = [];
    render();
    toast(`Search failed: ${err.message}`, 'error');
  }
}


export { renderHero, renderSkeleton, renderCard, renderResults, doSearch };
