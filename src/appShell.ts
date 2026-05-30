import { renderNav } from "./components/nav.ts";
import { renderModal } from "./components/modal.ts";
import { renderHero, renderResults } from "./views/search.ts";
import { renderHistoryView } from "./views/history.ts";
import { renderImxView } from "./views/imx.ts";
import { renderRssView } from "./views/rss.ts";
import { bindEvents } from "./events.ts";
import { toast, svgIcon, formatDate, copyText, getCmdText } from "./utils.ts";
import { apiSearch } from "./api.ts";
import type { FetchResult, SearchResult } from "./api.ts";
import { initScramble, initAnimateLine } from "./effects.ts";

// ====== STATE ======
export interface AppState {
  view: "search" | "history" | "imx" | "rss";
  tab: "vg" | "aps";
  vgForums: Set<number>;
  query: string;
  loading: boolean;
  results: SearchResult[];
  page: number;
  totalPages: number;
  totalResults: number;
  modalData: FetchResult | null;
  directFetchLoading: boolean;
  directFetchResult: FetchResult | null;
  threadData: import("./api.ts").ThreadData | null;
  threadId?: string;
  threadPage: number;
  threadExtractingPost: number | null;
  threadExtractedPosts: Record<string, unknown>;
  historyLoading: boolean;
  historyResults: import("./api.ts").HistoryEntry[];
  historyPage: number;
  historyTotalPages: number;
  historyTotal: number;
  imxMode: "upload" | "extract";
  imxLoading: boolean;
  imxResult: import("./api.ts").ImxResult | null;
  searchStartTime: number | null;
  searchElapsed: number | string;
  fetchingCards: Map<string | number, { extracted: number; total: number; phase: string }>;
  completedCards: Map<string | number, FetchResult>;
  scrapedCards: Map<string | number, { threadId: string; posts: Array<{ title: string; count: number }> }>;
  fetchingThreadPosts: Map<number, { extracted: number; total: number; phase: string }>;
  completedThreadPosts: Map<number, FetchResult>;
  rssLoading: boolean;
  rssEntries: import("./api.ts").RssEntry[];
  rssFeedTitle: string;
  rssFeedUpdated: string;
  rssError: string | null;
}

export const state: AppState = {
  view: "search",
  tab: "vg",
  vgForums: (() => {
    try {
      const saved = localStorage.getItem("vgForums");
      if (saved) return new Set(JSON.parse(saved) as number[]);
    } catch {
      /* ignore */
    }
    return new Set([302, 303, 304]);
  })(),
  query: "",
  loading: false,
  results: [],
  page: 1,
  totalPages: 1,
  totalResults: 0,
  modalData: null,
  directFetchLoading: false,
  directFetchResult: null,
  threadData: null,
  threadPage: 0,
  threadExtractingPost: null,
  threadExtractedPosts: {},
  historyLoading: false,
  historyResults: [],
  historyPage: 1,
  historyTotalPages: 1,
  historyTotal: 0,
  imxMode: "upload",
  imxLoading: false,
  imxResult: null,
  searchStartTime: null,
  searchElapsed: 0,
  fetchingCards: new Map(),
  completedCards: new Map(),
  scrapedCards: new Map(),
  fetchingThreadPosts: new Map(),
  completedThreadPosts: new Map(),
  rssLoading: false,
  rssEntries: [],
  rssFeedTitle: "",
  rssFeedUpdated: "",
  rssError: null,
};

let appEl: HTMLElement | null = null;
let lastView: string | null = null;

// ====== COPY ALL CMD BLOCKS ======
export function copyAllCmdBlocks(): void {
  const allTexts: string[] = [];
  for (const [, result] of state.completedCards) {
    const text = getCmdText(result);
    if (text) allTexts.push(text);
  }
  for (const [, result] of state.completedThreadPosts) {
    const text = getCmdText(result);
    if (text) allTexts.push(text);
  }
  if (allTexts.length === 0) {
    toast("No commands to copy", "error");
    return;
  }
  copyText(allTexts.map((t) => t.trimEnd()).join("\n"));
}

// ====== EXPORT ======
export async function exportSearchData(): Promise<void> {
  // Thread view export
  if (state.threadData) {
    const d = state.threadData;
    const threadBaseUrl = (d.url || "").replace(/\/$/, "");
    const allPosts = d.pages.flatMap((page, pi) =>
      page.posts.map((p, i) => ({
        index: d.pages.slice(0, pi).reduce((s, pp) => s + pp.posts.length, 0) + i + 1,
        title: p.title || `Post #${i + 1}`,
        count: p.count || p.links?.length || 0,
        postId: p.postId,
        directLink: p.postId && threadBaseUrl
          ? `${threadBaseUrl}?p=${p.postId}&viewfull=1#post${p.postId}`
          : threadBaseUrl || undefined,
      }))
    );
    const exportData = {
      title: d.title,
      url: d.url,
      totalPages: d.totalPages,
      totalPosts: allPosts.length,
      exportedAt: new Date().toISOString(),
      posts: allPosts,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `viper-thread-${d.title.replace(/[^a-z0-9]/gi, "_").slice(0, 40)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast(`Exported ${allPosts.length} posts from thread`, "success");
    return;
  }

  if (!state.results.length) {
    toast("No results to export", "error");
    return;
  }

  const btn = appEl?.querySelector("#export-btn") as HTMLButtonElement | null;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML =
      '<div class="spinner" style="width:12px;height:12px;border-width:1.5px"></div> Exporting…';
  }

  const allResults: Array<{
    title: string;
    id: string;
    url: string;
    prefix: string;
    category: string;
    date: string;
  }> = [];
  const query = state.query;
  const tab = state.tab;
  const totalPages = state.totalPages;
  const forums = tab === "vg" ? [...state.vgForums] : undefined;

  try {
    for (let p = 1; p <= totalPages; p++) {
      toast(`Fetching page ${p}/${totalPages}…`, "success");
      const data = await apiSearch(tab, query, p, forums);
      const pageResults = (data.results || []).map((r) => ({
        title: r.title || "",
        id: r.sgenId || r.apsId || "",
        url: r.url || "",
        prefix: r.prefix || "",
        category: r.category || "",
        date: r.timestamp ? formatDate(r.timestamp) : r.dateText || "",
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
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `viper-search-${query.replace(/[^a-z0-9]/gi, "_")}-all.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast(
      `Exported ${allResults.length} results (${totalPages} pages)`,
      "success",
    );
  } catch (err) {
    toast(`Export failed: ${(err as Error).message}`, "error");
  }

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = `${svgIcon("download")} Export`;
  }
}

// ====== RENDER ======
export function render(): void {
  if (!appEl) return;
  const skipAnim = lastView === state.view;
  lastView = state.view;

  if (state.view === "rss") {
    appEl.innerHTML = `
      <div class="glow-orb glow-orb-1"></div>
      <div class="glow-orb glow-orb-2"></div>
      ${renderNav()}
      ${renderRssView(skipAnim)}
      ${renderModal()}
    `;
  } else if (state.view === "imx") {
    appEl.innerHTML = `
      <div class="glow-orb glow-orb-1"></div>
      <div class="glow-orb glow-orb-2"></div>
      ${renderNav()}
      ${renderImxView(skipAnim)}
      ${renderModal()}
    `;
  } else if (state.view === "history") {
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
    if (appEl) {
      initScramble(appEl);
      initAnimateLine(appEl);
    }
  });
}

// ====== ENTRY POINT ======
export function renderApp(el: HTMLElement): void {
  appEl = el;
  render();
}
