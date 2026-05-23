import { state, render, copyAllCmdBlocks, exportSearchData } from '../app.js';
import { toast } from '../utils.js';
import { doSearch } from '../views/search.js';
import { fetchHistory } from '../views/history.js';
import { fetchRssFeed } from '../views/rss.js';

export function bindNavEvents(appEl) {
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

  // RSS nav
  const navRss = appEl.querySelector('#nav-rss');
  if (navRss) navRss.addEventListener('click', () => {
    if (state.view !== 'rss') {
      state.view = 'rss';
      if (!state.rssEntries.length && !state.rssLoading) fetchRssFeed();
      else render();
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

  // Forum toggles (VG)
  appEl.querySelectorAll('.forum-toggle[data-forum-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.forumId);
      if (state.vgForums.has(id)) {
        if (state.vgForums.size <= 1) {
          toast('At least one forum must be selected', 'error');
          return;
        }
        state.vgForums.delete(id);
      } else {
        state.vgForums.add(id);
      }
      render();
      try { localStorage.setItem('vgForums', JSON.stringify([...state.vgForums])); } catch {}
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

  // Copy All button
  const copyAllBtn = appEl.querySelector('#copy-all-btn');
  if (copyAllBtn) copyAllBtn.addEventListener('click', () => copyAllCmdBlocks());

  // History Pagination
  const histPrev = appEl.querySelector('#hist-prev');
  const histNext = appEl.querySelector('#hist-next');
  if (histPrev) histPrev.addEventListener('click', () => fetchHistory(state.historyPage - 1));
  if (histNext) histNext.addEventListener('click', () => fetchHistory(state.historyPage + 1));
}
