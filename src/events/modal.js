import { state, render } from '../app.js';
import { toast, copyText, getCmdText } from '../utils.js';
import { apiReExtract, apiThreadPostExtractStream } from '../api.js';

export function bindModalEvents(appEl) {
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

  // Re-extract Failed button — retries only the failed image links
  const reextractFailedBtn = appEl.querySelector('#modal-reextract-failed');
  if (reextractFailedBtn) reextractFailedBtn.addEventListener('click', async () => {
    const d = state.modalData;
    if (!d || !d.failedLinks || !d.failedLinks.length) return;
    reextractFailedBtn.disabled = true;
    reextractFailedBtn.innerHTML = '<div class="spinner" style="width:12px;height:12px;border-width:1.5px"></div> Retrying…';
    try {
      const result = await apiReExtract(
        d.failedLinks,
        d.directUrls || [],
        d.title,
        d.sourceUrl,
        d.hashtag ? d.hashtag.replace('#', '').replace(/_/g, ' ').trim() : ''
      );
      // Update modal with new result
      state.modalData = { ...result, title: result.title || d.title, sourceUrl: result.sourceUrl || d.sourceUrl };
      // Also update the completed card if it exists in any state map
      for (const [key, val] of state.completedCards.entries()) {
        if (val === d || (val.title === d.title && val.sourceUrl === d.sourceUrl)) {
          state.completedCards.set(key, state.modalData);
          break;
        }
      }
      for (const [key, val] of state.completedThreadPosts.entries()) {
        if (val === d || (val.title === d.title && val.sourceUrl === d.sourceUrl)) {
          state.completedThreadPosts.set(key, state.modalData);
          break;
        }
      }
      render();
      if (result.newlyRecovered > 0) {
        toast(`✓ Recovered ${result.newlyRecovered} images! Now ${result.extracted}/${result.total}`, 'success');
      } else {
        toast(`No additional images recovered (${result.extracted}/${result.total})`, 'error');
      }
    } catch (err) {
      toast(`Re-extract failed: ${err.message}`, 'error');
      reextractFailedBtn.disabled = false;
      reextractFailedBtn.innerHTML = '↻ Re-extract Failed';
    }
  });

  // Re-extract All button — find the original card and re-trigger full extraction
  const reextractAllBtn = appEl.querySelector('#modal-reextract-all');
  if (reextractAllBtn) reextractAllBtn.addEventListener('click', () => {
    const d = state.modalData;
    if (!d) return;
    state.modalData = null;

    // Find which completed card/post this belongs to and retry it
    for (const [key, val] of state.completedCards.entries()) {
      if (val === d || (val.title === d.title && val.sourceUrl === d.sourceUrl)) {
        state.completedCards.delete(key);
        // If key is a string like "2-0", it's a post extraction
        if (typeof key === 'string' && key.includes('-')) {
          const [cardIdx, postIdx] = key.split('-').map(Number);
          render();
          requestAnimationFrame(() => {
            const newBtn = appEl.querySelector(`[data-card-idx="${cardIdx}"][data-post-idx="${postIdx}"]`);
            if (newBtn) newBtn.click();
          });
        } else {
          // Simple card index
          state.scrapedCards.delete(key);
          render();
          requestAnimationFrame(() => {
            const newBtn = appEl.querySelector(`[data-fetch-idx="${key}"]`);
            if (newBtn) newBtn.click();
          });
        }
        return;
      }
    }
    // Check thread posts
    for (const [key, val] of state.completedThreadPosts.entries()) {
      if (val === d || (val.title === d.title && val.sourceUrl === d.sourceUrl)) {
        state.completedThreadPosts.delete(key);
        render();
        requestAnimationFrame(() => {
          const newBtn = appEl.querySelector(`[data-gidx="${key}"]`);
          if (newBtn) newBtn.click();
        });
        return;
      }
    }
    // Fallback: just close modal
    render();
    toast('Could not find the original extraction to retry', 'error');
  });

  // Copy command lines on click — unescape \n stored in data attribute into real newlines
  appEl.querySelectorAll('[data-copy-cmd]').forEach(el => {
    el.style.cursor = 'pointer';
    el.title = 'Click to copy';
    el.addEventListener('click', () => copyText(el.dataset.copyCmd.replace(/\\n/g, '\n')));
  });
}
