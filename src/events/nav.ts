import { state, render, copyAllCmdBlocks, exportSearchData } from "../appShell.ts";
import { toast } from "../utils.ts";
import { doSearch } from "../views/search.ts";
import { fetchHistory } from "../views/history.ts";
import { fetchRssFeed } from "../views/rss.ts";

export function bindNavEvents(appEl: HTMLElement): void {
  // Nav switching
  const navSearch = appEl.querySelector("#nav-search");
  const navHistory = appEl.querySelector("#nav-history");
  if (navSearch)
    navSearch.addEventListener("click", () => {
      if (state.view !== "search") {
        state.view = "search";
        render();
      }
    });
  if (navHistory)
    navHistory.addEventListener("click", () => {
      if (state.view !== "history") {
        state.view = "history";
        fetchHistory(1);
      }
    });

  // RSS nav
  const navRss = appEl.querySelector("#nav-rss");
  if (navRss)
    navRss.addEventListener("click", () => {
      if (state.view !== "rss") {
        state.view = "rss";
        if (!state.rssEntries.length && !state.rssLoading) fetchRssFeed();
        else render();
      }
    });

  // Tab switch (search tabs only)
  appEl.querySelectorAll<HTMLElement>(".tab-btn[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.tab = (btn.dataset.tab as "vg" | "aps") || "vg";
      state.results = [];
      state.query = "";
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
  appEl.querySelectorAll<HTMLElement>(".forum-toggle[data-forum-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = parseInt(btn.dataset.forumId || "0");
      if (state.vgForums.has(id)) {
        if (state.vgForums.size <= 1) {
          toast("At least one forum must be selected", "error");
          return;
        }
        state.vgForums.delete(id);
      } else {
        state.vgForums.add(id);
      }
      render();
      try {
        localStorage.setItem("vgForums", JSON.stringify([...state.vgForums]));
      } catch {
        /* ignore */
      }
    });
  });

  // Post-search result filter toggles
  appEl.querySelectorAll<HTMLElement>(".filter-toggle[data-filter-forum]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const fid = parseInt(btn.dataset.filterForum || "0");
      if (!fid) return;
      if (state.visibleCategories.has(fid)) {
        // Don't allow hiding all forums
        if (state.visibleCategories.size <= 1) {
          toast("At least one forum must be visible", "error");
          return;
        }
        state.visibleCategories.delete(fid);
      } else {
        state.visibleCategories.add(fid);
      }
      doSearch(state.query, 1, false);
    });
  });

  // Search
  const input = appEl.querySelector<HTMLInputElement>("#search-input");
  const searchBtn = appEl.querySelector("#search-btn");
  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doSearch(input.value);
    });
    // keep value in sync
    input.addEventListener("input", () => {
      state.query = input.value;
    });
  }
  if (searchBtn) {
    searchBtn.addEventListener("click", () => {
      const q = appEl.querySelector<HTMLInputElement>("#search-input")?.value || state.query;
      doSearch(q);
    });
  }

  // Hints
  appEl.querySelectorAll<HTMLElement>(".hint-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const q = chip.dataset.hint || "";
      doSearch(q);
    });
  });

  // Pagination
  const first = appEl.querySelector("#first-page");
  const prev = appEl.querySelector("#prev-page");
  const next = appEl.querySelector("#next-page");
  const last = appEl.querySelector("#last-page");
  const pageInput = appEl.querySelector<HTMLInputElement>("#page-input");

  if (first) first.addEventListener("click", () => doSearch(state.query, 1, false));
  if (prev) prev.addEventListener("click", () => doSearch(state.query, state.page - 1, false));
  if (next) next.addEventListener("click", () => doSearch(state.query, state.page + 1, false));
  if (last) last.addEventListener("click", () => doSearch(state.query, state.totalPages, false));
  
  if (pageInput) {
    pageInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        let p = parseInt(pageInput.value) || 1;
        p = Math.max(1, Math.min(p, state.totalPages));
        doSearch(state.query, p, false);
      }
    });
    // Prevent focus from being lost if they click it
    pageInput.addEventListener("click", (e) => e.stopPropagation());
  }

  // Export button
  const exportBtn = appEl.querySelector("#export-btn");
  if (exportBtn) exportBtn.addEventListener("click", () => exportSearchData());

  // Copy All button
  const copyAllBtn = appEl.querySelector("#copy-all-btn");
  if (copyAllBtn)
    copyAllBtn.addEventListener("click", () => copyAllCmdBlocks());

  // History Pagination
  const histPrev = appEl.querySelector("#hist-prev");
  const histNext = appEl.querySelector("#hist-next");
  if (histPrev)
    histPrev.addEventListener("click", () =>
      fetchHistory(state.historyPage - 1),
    );
  if (histNext)
    histNext.addEventListener("click", () =>
      fetchHistory(state.historyPage + 1),
    );
}
