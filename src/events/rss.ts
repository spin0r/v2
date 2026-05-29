import { state, render } from "../appShell.ts";
import { toast, copyText } from "../utils.ts";
import { apiDirectFetch, apiThreadPostExtractStream } from "../api.ts";
import { fetchRssFeed } from "../views/rss.ts";

export function bindRssEvents(appEl: HTMLElement): void {
  const rssRetry = appEl.querySelector("#rss-retry");
  if (rssRetry) rssRetry.addEventListener("click", () => fetchRssFeed());
  const rssRefresh = appEl.querySelector("#rss-refresh");
  if (rssRefresh) rssRefresh.addEventListener("click", () => fetchRssFeed());

  appEl.querySelectorAll<HTMLElement>(".rss-copy-title").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.rssCopy || "0");
      const entry = state.rssEntries[idx];
      if (entry) copyText(entry.title);
    });
  });

  // RSS "Get images"
  appEl.querySelectorAll<HTMLElement>("[data-rss-fetch]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.rssFetch || "0");
      const entry = state.rssEntries[idx];
      if (!entry || !entry.link) return;
      const rssKey = `rss-${idx}`;
      if (state.fetchingCards.has(rssKey)) return;

      state.fetchingCards.set(rssKey, { phase: "scraping", extracted: 0, total: 0 });
      render();
      try {
        const data = await apiDirectFetch(entry.link);
        if (data.ok && data.threadData) {
          const posts: Array<{ title: string; count: number }> = [];
          for (const page of data.threadData.pages) {
            for (const p of page.posts) {
              posts.push({ title: p.title || `Post #${posts.length + 1}`, count: p.count || p.links?.length || 0 });
            }
          }

          if (posts.length === 1) {
            state.fetchingCards.set(rssKey, { phase: "extracting", extracted: 0, total: posts[0].count });
            render();
            const result = await apiThreadPostExtractStream(data.threadId!, 0, (progress) => {
              const info = state.fetchingCards.get(rssKey);
              if (!info) return;
              if (progress.type === "phase") {
                info.phase = progress.phase || info.phase;
                if (progress.total) info.total = progress.total;
              } else if (progress.type === "progress") {
                info.extracted = progress.extracted || 0;
                info.total = progress.total || 0;
                const el = document.querySelector(`[data-fetch-progress="${rssKey}"]`);
                if (el) el.textContent = `${progress.extracted}/${progress.total}`;
              }
            });
            state.fetchingCards.delete(rssKey);
            state.completedCards.set(rssKey, { ...result, title: result.title || entry.title, sourceUrl: result.sourceUrl || entry.link });
            render();
            toast(`✓ ${entry.title?.slice(0, 40)} — ${result.extracted || 0}/${result.total || 0}`, "success");
          } else {
            state.fetchingCards.delete(rssKey);
            state.scrapedCards.set(rssKey, { threadId: data.threadId!, posts });
            render();
            toast(`${posts.length} posts found — pick one to extract`, "success");
          }
        } else {
          state.fetchingCards.delete(rssKey);
          toast("Failed to scrape thread", "error");
          render();
        }
      } catch (err) {
        state.fetchingCards.delete(rssKey);
        render();
        toast(`Scrape failed: ${(err as Error).message}`, "error");
      }
    });
  });

  // RSS inline post Extract buttons
  appEl.querySelectorAll<HTMLElement>("[data-rss-extract]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.rssExtract || "0");
      const pi = parseInt(btn.dataset.rssExtractPi || "0");
      const rssKey = `rss-${idx}`;
      const postKey = `${rssKey}-${pi}`;
      const scraped = state.scrapedCards.get(rssKey);
      if (!scraped || state.fetchingCards.has(postKey)) return;

      const post = scraped.posts[pi];
      state.fetchingCards.set(postKey, { phase: "extracting", extracted: 0, total: post?.count || 0 });
      render();
      try {
        const result = await apiThreadPostExtractStream(scraped.threadId, pi, (progress) => {
          const info = state.fetchingCards.get(postKey);
          if (!info) return;
          if (progress.type === "phase") {
            info.phase = progress.phase || info.phase;
            if (progress.total) info.total = progress.total;
          } else if (progress.type === "progress") {
            info.extracted = progress.extracted || 0;
            info.total = progress.total || 0;
            const el = document.querySelector(`[data-fetch-progress="${postKey}"]`);
            if (el) el.textContent = `${progress.extracted}/${progress.total}`;
          }
        });
        state.fetchingCards.delete(postKey);
        const entry = state.rssEntries[idx];
        state.completedCards.set(postKey, { ...result, title: result.title || entry?.title, sourceUrl: result.sourceUrl || entry?.link });
        render();
        toast(`✓ Extracted ${result.extracted || 0}/${result.total || 0}`, "success");
      } catch (err) {
        state.fetchingCards.delete(postKey);
        state.completedCards.set(postKey, { ok: false, error: (err as Error).message });
        render();
        toast(`Extract failed: ${(err as Error).message}`, "error");
      }
    });
  });

  // RSS retry buttons (main card level)
  appEl.querySelectorAll<HTMLElement>("[data-rss-retry]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.rssRetry || "0");
      const rssKey = `rss-${idx}`;
      state.completedCards.delete(rssKey);
      state.scrapedCards.delete(rssKey);
      render();
      const fetchBtn = appEl.querySelector<HTMLElement>(`[data-rss-fetch="${idx}"]`);
      if (fetchBtn) fetchBtn.click();
    });
  });

  // RSS post-level retry buttons
  appEl.querySelectorAll<HTMLElement>("[data-rss-post-retry]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.rssPostRetry || "0");
      const pi = parseInt(btn.dataset.rssPostRetryPi || "0");
      const postKey = `rss-${idx}-${pi}`;
      state.completedCards.delete(postKey);
      render();
      const extractBtn = appEl.querySelector<HTMLElement>(`[data-rss-extract="${idx}"][data-rss-extract-pi="${pi}"]`);
      if (extractBtn) extractBtn.click();
    });
  });
}
