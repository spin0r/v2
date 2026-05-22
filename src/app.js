import { renderNav } from './components/nav.js';
import { renderModal } from './components/modal.js';
import { renderHero, renderResults, doSearch } from './views/search.js';
import { renderThreadView } from './views/thread.js';
import { renderHistoryView, fetchHistory } from './views/history.js';
import { renderImxView } from './views/imx.js';
import { renderRssView, fetchRssFeed } from './views/rss.js';
import { bindEvents } from './events.js';
import { toast, svgIcon, formatDate, copyText, getCmdText } from './utils.js';
import { apiSearch } from './api.js';

// ====== STATE ======
export let state = {
  view: 'search',  // 'search' | 'history' | 'imx' | 'rss'
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
  threadPage: 0,
  threadExtractingPost: null,
  threadExtractedPosts: {},
  // history
  historyLoading: false,
  historyResults: [],
  historyPage: 1,
  historyTotalPages: 1,
  historyTotal: 0,
  // imx
  imxMode: 'upload',
  imxLoading: false,
  imxResult: null,
  // timers
  searchStartTime: null,
  searchElapsed: 0,
  // concurrent fetch tracking: idx -> { extracted, total, phase }
  fetchingCards: new Map(),
  // completed fetch results: idx -> API result data
  completedCards: new Map(),
  // scraped thread data per card: idx -> { threadId, posts }
  scrapedCards: new Map(),
  // concurrent thread post tracking
  fetchingThreadPosts: new Map(),
  // completed thread post results
  completedThreadPosts: new Map(),
  // rss
  rssLoading: false,
  rssEntries: [],
  rssFeedTitle: '',
  rssFeedUpdated: '',
  rssError: null,
};

let appEl;
let lastView = null;

// ====== COPY ALL CMD BLOCKS ======
export function copyAllCmdBlocks() {
  const allTexts = [];
  for (const [, result] of state.completedCards) {
    const text = getCmdText(result);
    if (text) allTexts.push(text);
  }
  for (const [, result] of state.completedThreadPosts) {
    const text = getCmdText(result);
    if (text) allTexts.push(text);
  }
  if (allTexts.length === 0) {
    toast('No commands to copy', 'error');
    return;
  }
  copyText(allTexts.join('\n\n'));
}

// ====== EXPORT ======
export async function exportSearchData() {
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

// ====== RENDER ======
export function render() {
  if (!appEl) return;
  const skipAnim = lastView === state.view;
  lastView = state.view;

  if (state.view === 'rss') {
    appEl.innerHTML = `
      <div class="glow-orb glow-orb-1"></div>
      <div class="glow-orb glow-orb-2"></div>
      ${renderNav()}
      ${renderRssView(skipAnim)}
    `;
  } else if (state.view === 'imx') {
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
  requestAnimationFrame(() => {
    initScramble(appEl);
    initAnimateLine(appEl);
  });
}

// ====== EFFECTS ======
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

function initScramble(root) {
  root.querySelectorAll('.glitch, [data-effect="scramble"]').forEach(el => {
    const original = el.dataset.originalText || el.textContent;
    el.dataset.originalText = original;
    el.addEventListener('mouseenter', () => _scramble(el, original));
    el.addEventListener('mouseleave', () => { el.textContent = original; });
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

// ====== ENTRY POINT ======
export function renderApp(el) {
  appEl = el;
  render();
}
