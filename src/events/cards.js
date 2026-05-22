import { state, render } from '../app.js';
import { toast, copyText, getCmdText } from '../utils.js';
import { apiFetchStream, apiScrapeVg, apiThreadPostExtractStream } from '../api.js';

export function bindCardEvents(appEl) {
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

  // Copy cmd buttons on completed cards (search results & inline posts)
  appEl.querySelectorAll('[data-copy-card]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const raw = btn.dataset.copyCard;
      const result = state.completedCards.get(raw) || state.completedCards.get(parseInt(raw));
      const text = getCmdText(result);
      if (text) copyText(text);
      else toast('No commands to copy', 'error');
    });
  });

  // Copy cmd buttons on completed thread posts
  appEl.querySelectorAll('[data-copy-thread-post]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const gidx = parseInt(btn.dataset.copyThreadPost);
      const result = state.completedThreadPosts.get(gidx);
      const text = getCmdText(result);
      if (text) copyText(text);
      else toast('No commands to copy', 'error');
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
}
