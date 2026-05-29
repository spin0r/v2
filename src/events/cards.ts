import { state, render } from "../appShell.ts";
import { toast, copyText, getCmdText } from "../utils.ts";
import {
  apiFetchStream,
  apiScrapeVg,
  apiThreadPostExtractStream,
} from "../api.ts";

export function bindCardEvents(appEl: HTMLElement): void {
  // History view buttons
  appEl.querySelectorAll<HTMLElement>("[data-hview]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.hview || "0");
      const h = state.historyResults[idx];
      if (h) {
        state.modalData = { ok: true, ...h };
        render();
      }
    });
  });

  // Result IDs – copy on click
  appEl.querySelectorAll<HTMLElement>(".result-id").forEach((el) => {
    el.addEventListener("click", () => copyText(el.dataset.id || ""));
  });

  // Open URL buttons
  appEl.querySelectorAll<HTMLElement>("[data-open]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      window.open(btn.dataset.open, "_blank", "noopener");
    });
  });

  // Fetch images buttons — non-blocking, concurrent, with SSE progress
  appEl.querySelectorAll<HTMLElement>("[data-fetch-idx]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.fetchIdx || "0");
      const r = state.results[idx];
      if (!r) return;
      if (state.fetchingCards.has(idx)) return;

      // VG tab: scrape thread first → show post picker inline
      if (state.tab === "vg" && r.sgenId) {
        state.fetchingCards.set(idx, { phase: "scraping", extracted: 0, total: 0 });
        render();
        try {
          const data = await apiScrapeVg(r.sgenId, state.query);
          if (data.ok && data.threadData) {
            const posts: Array<{ title: string; count: number }> = [];
            for (const page of data.threadData.pages) {
              for (const p of page.posts) {
                posts.push({
                  title: p.title || `Post #${posts.length + 1}`,
                  count: p.count || p.links?.length || 0,
                });
              }
            }

            if (posts.length === 1) {
              state.fetchingCards.set(idx, { phase: "extracting", extracted: 0, total: posts[0].count });
              const card = document.querySelector(`[data-idx="${idx}"]`);
              if (card) {
                const label = card.querySelector(".progress-label");
                if (label) label.textContent = "Extracting";
                const prog = card.querySelector(".inline-progress");
                if (prog && !prog.querySelector(".progress-counter")) {
                  const span = document.createElement("span");
                  span.className = "progress-counter";
                  span.dataset.fetchProgress = String(idx);
                  span.textContent = `0/${posts[0].count}`;
                  prog.appendChild(span);
                }
              }
              const result = await apiThreadPostExtractStream(
                data.threadId!,
                0,
                (progress) => {
                  const info = state.fetchingCards.get(idx);
                  if (!info) return;
                  if (progress.type === "phase") {
                    info.phase = progress.phase || info.phase;
                    if (progress.total) info.total = progress.total;
                    const card = document.querySelector(`[data-idx="${idx}"]`);
                    if (card) {
                      const label = card.querySelector(".progress-label");
                      if (label) label.textContent = info.phase === "extracting" ? "Extracting" : "Scraping…";
                      const prog = card.querySelector(".inline-progress");
                      if (prog && info.phase === "extracting" && !prog.querySelector(".progress-counter")) {
                        const span = document.createElement("span");
                        span.className = "progress-counter";
                        span.dataset.fetchProgress = String(idx);
                        span.textContent = `0/${info.total || "?"}`;
                        prog.appendChild(span);
                      }
                    }
                  } else if (progress.type === "progress") {
                    info.extracted = progress.extracted || 0;
                    info.total = progress.total || 0;
                    const el = document.querySelector(`[data-fetch-progress="${idx}"]`);
                    if (el) el.textContent = `${progress.extracted}/${progress.total}`;
                  }
                },
              );
              state.fetchingCards.delete(idx);
              const completed = { ...result, title: result.title || r.title, sourceUrl: result.sourceUrl || r.url };
              state.completedCards.set(idx, completed);
              render();
              toast(`✓ ${r.title?.slice(0, 40)} — ${result.extracted || 0}/${result.total || 0}`, "success");
            } else {
              state.fetchingCards.delete(idx);
              state.scrapedCards.set(idx, { threadId: data.threadId!, posts });
              render();
              toast(`${posts.length} posts found — pick one to extract`, "success");
            }
          } else {
            state.fetchingCards.delete(idx);
            toast("Failed to scrape thread", "error");
            render();
          }
        } catch (err) {
          state.fetchingCards.delete(idx);
          render();
          toast(`Scrape failed: ${(err as Error).message}`, "error");
        }
        return;
      }

      // APS tab (or fallback): extract directly with SSE progress
      state.fetchingCards.set(idx, { phase: "scraping", extracted: 0, total: 0 });
      render();

      try {
        const id = r.sgenId || r.apsId || "";
        const data = await apiFetchStream(state.tab, id, state.query, (progress) => {
          const info = state.fetchingCards.get(idx);
          if (!info) return;
          if (progress.type === "phase") {
            info.phase = progress.phase || info.phase;
            if (progress.total) info.total = progress.total;
            const card = document.querySelector(`[data-idx="${idx}"]`);
            if (card) {
              const label = card.querySelector(".progress-label");
              if (label) label.textContent = info.phase === "extracting" ? "Extracting" : "Scraping…";
              const prog = card.querySelector(".inline-progress");
              if (prog && info.phase === "extracting" && !prog.querySelector(".progress-counter")) {
                const span = document.createElement("span");
                span.className = "progress-counter";
                span.dataset.fetchProgress = String(idx);
                span.textContent = `0/${info.total || "?"}`;
                prog.appendChild(span);
              }
            }
          } else if (progress.type === "progress") {
            info.extracted = progress.extracted || 0;
            info.total = progress.total || 0;
            const el = document.querySelector(`[data-fetch-progress="${idx}"]`);
            if (el) el.textContent = `${progress.extracted}/${progress.total}`;
          }
        });
        state.fetchingCards.delete(idx);
        const result = { ...data, title: data.title || r.title, sourceUrl: data.sourceUrl || r.url };
        state.completedCards.set(idx, result);
        render();
        toast(`✓ ${r.title?.slice(0, 40)} — ${data.extracted || 0}/${data.total || 0}`, "success");
      } catch (err) {
        state.fetchingCards.delete(idx);
        state.completedCards.set(idx, { ok: false, error: (err as Error).message, title: r.title, sourceUrl: r.url });
        render();
        toast(`✗ ${r.title?.slice(0, 40)} — failed`, "error");
      }
    });
  });

  // Inline post extract buttons (from scraped VG cards)
  appEl.querySelectorAll<HTMLElement>(".inline-extract-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const cardIdx = parseInt(btn.dataset.cardIdx || "0");
      const postIdx = parseInt(btn.dataset.postIdx || "0");
      const scraped = state.scrapedCards.get(cardIdx);
      if (!scraped) return;
      const key = `${cardIdx}-${postIdx}`;
      if (state.fetchingCards.has(key)) return;

      state.fetchingCards.set(key, { phase: "extracting", extracted: 0, total: 0 });
      render();

      try {
        const data = await apiThreadPostExtractStream(scraped.threadId, postIdx, (progress) => {
          const info = state.fetchingCards.get(key);
          if (!info) return;
          if (progress.type === "phase") {
            info.phase = progress.phase || info.phase;
            if (progress.total) info.total = progress.total;
            const counter = document.querySelector(`[data-fetch-progress="${key}"]`);
            if (counter) counter.textContent = `0/${info.total || "?"}`;
          } else if (progress.type === "progress") {
            info.extracted = progress.extracted || 0;
            info.total = progress.total || 0;
            const el = document.querySelector(`[data-fetch-progress="${key}"]`);
            if (el) el.textContent = `${progress.extracted}/${progress.total}`;
          }
        });
        state.fetchingCards.delete(key);
        const r = state.results[cardIdx];
        const result = { ...data, title: data.title || scraped.posts[postIdx]?.title, sourceUrl: data.sourceUrl || r?.url };
        state.completedCards.set(key, result);
        render();
        toast(`✓ ${result.title?.slice(0, 40)} — ${data.extracted || 0}/${data.total || 0}`, "success");
      } catch (err) {
        state.fetchingCards.delete(key);
        state.completedCards.set(key, { ok: false, error: (err as Error).message, title: scraped.posts[postIdx]?.title });
        render();
        toast(`✗ Extract failed: ${(err as Error).message}`, "error");
      }
    });
  });

  // View completed card results
  appEl.querySelectorAll<HTMLElement>("[data-view-completed]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const raw = btn.dataset.viewCompleted || "";
      const result = state.completedCards.get(raw) || state.completedCards.get(parseInt(raw));
      if (result) {
        state.modalData = result;
        render();
      }
    });
  });

  // Copy cmd buttons on completed cards
  appEl.querySelectorAll<HTMLElement>("[data-copy-card]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const raw = btn.dataset.copyCard || "";
      const result = state.completedCards.get(raw) || state.completedCards.get(parseInt(raw));
      const text = getCmdText(result);
      if (text) copyText(text);
      else toast("No commands to copy", "error");
    });
  });

  // Copy cmd buttons on completed thread posts
  appEl.querySelectorAll<HTMLElement>("[data-copy-thread-post]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const gidx = parseInt(btn.dataset.copyThreadPost || "0");
      const result = state.completedThreadPosts.get(gidx);
      const text = getCmdText(result);
      if (text) copyText(text);
      else toast("No commands to copy", "error");
    });
  });

  // Retry buttons for failed search result cards
  appEl.querySelectorAll<HTMLElement>("[data-retry-idx]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.retryIdx || "0");
      const r = state.results[idx];
      if (!r) return;
      state.completedCards.delete(idx);
      state.scrapedCards.delete(idx);
      render();
      requestAnimationFrame(() => {
        const newBtn = appEl.querySelector<HTMLElement>(`[data-fetch-idx="${idx}"]`);
        if (newBtn) newBtn.click();
      });
    });
  });

  // Retry buttons for inline post extractions
  appEl.querySelectorAll<HTMLElement>("[data-retry-card-idx]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const cardIdx = parseInt(btn.dataset.retryCardIdx || "0");
      const postIdx = parseInt(btn.dataset.retryPostIdx || "0");
      const key = `${cardIdx}-${postIdx}`;
      state.completedCards.delete(key);
      render();
      requestAnimationFrame(() => {
        const newBtn = appEl.querySelector<HTMLElement>(`[data-card-idx="${cardIdx}"][data-post-idx="${postIdx}"]`);
        if (newBtn) newBtn.click();
      });
    });
  });

  // Retry buttons for thread view posts
  appEl.querySelectorAll<HTMLElement>("[data-retry-thread-gidx]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const gidx = parseInt(btn.dataset.retryThreadGidx || "0");
      state.completedThreadPosts.delete(gidx);
      render();
      requestAnimationFrame(() => {
        const newBtn = appEl.querySelector<HTMLElement>(`[data-gidx="${gidx}"]`);
        if (newBtn) newBtn.click();
      });
    });
  });
}
