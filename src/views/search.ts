import { state, render } from "../appShell.ts";
import {
  svgIcon,
  formatDate,
  toast,
  celebrate,
  startTimerLoop,
  isThreadUrl,
} from "../utils.ts";
import { apiSearch, apiDirectFetch } from "../api.ts";
import type { SearchResult, FetchResult } from "../api.ts";
import { renderThreadView } from "./thread.ts";

// Forum ID → display name map
const FORUM_NAMES: Record<number, string> = {
  238: "Hardcore Photo Sets (Archive)",
  268: "Scene Photos",
  302: "Softcore Photo Sets",
  303: "Artistic Photo Sets",
  304: "Hardcore Photo Sets",
};

// ====== HERO ======
function renderHero(skipAnim: boolean): string {
  return `
  <section class="hero ${skipAnim ? "skip-anim" : ""}">
    <div class="hero-eyebrow">Live search</div>
    <h1>Find threads,<br><span>instantly.</span></h1>
    <p class="hero-sub">Search ViperGirls forums and AdultPhotoSets at once. Browse results, copy IDs, open threads — all from one place.</p>

    <div class="tabs">
      <button class="tab-btn ${state.tab === "vg" ? "active" : ""}" data-tab="vg" id="tab-vg">ViperGirls</button>
      <button class="tab-btn ${state.tab === "aps" ? "active" : ""}" data-tab="aps" id="tab-aps">AdultPhotoSets</button>
    </div>

    ${
      state.tab === "vg"
        ? `
    <div class="forum-toggles">
      <span class="forum-toggles-label">Forums:</span>
      ${[
        { id: 238, name: "238-Hardcore-Photo-Sets-(Archive)" },
        { id: 268, name: "268-Scene-Photos" },
        { id: 302, name: "302-Softcore-Photo-Sets" },
        { id: 303, name: "303-Artistic-Photo-Sets" },
        { id: 304, name: "304-Hardcore-Photo-Sets" },
      ]
        .map(
          (f) => `
        <button class="forum-toggle ${state.vgForums.has(f.id) ? "active" : ""}" data-forum-id="${f.id}" id="forum-toggle-${f.id}">
          ${f.name}
        </button>
      `,
        )
        .join("")}
    </div>`
        : ""
    }

    <div class="search-wrap">
      <div class="search-box">
        ${svgIcon("search")}
        <input
          id="search-input"
          type="text"
          placeholder="${state.tab === "vg" ? 'Search VG threads… e.g. "blake blossom"' : 'Search APS sets… e.g. "eve sweet"'}"
          value="${state.query}"
          autocomplete="off"
          spellcheck="false"
        />
        <button class="search-btn" id="search-btn" ${state.isNewSearchLoading ? "disabled" : ""}>
          ${
            state.isNewSearchLoading
              ? `<div class="spinner"></div> Searching… <span id="search-timer" class="timer-badge">${state.searchElapsed || "0.0"}s</span>`
              : `${svgIcon("arrow_right")} Search`
          }
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
function renderSkeleton(): string {
  return Array.from({ length: 5 })
    .map(
      () => `
    <div class="skeleton-card">
      <div class="skel" style="width:28px;height:14px"></div>
      <div style="flex:1;display:flex;flex-direction:column;gap:8px">
        <div class="skel" style="height:14px;width:70%"></div>
        <div class="skel" style="height:10px;width:40%"></div>
      </div>
      <div class="skel" style="width:80px;height:30px;border-radius:8px"></div>
    </div>`,
    )
    .join("");
}

// ====== RESULT CARD ======
function renderCard(r: SearchResult, idx: number): string {
  const dateStr = r.timestamp ? formatDate(r.timestamp) : r.dateText || "";
  const idLabel = r.sgenId ? `/sgen${r.sgenId}` : r.apsId ? `/aps${r.apsId}` : "";
  const prefixHtml = r.prefix ? `<span class="result-prefix">${r.prefix}</span>` : "";
  const forumNameHtml = r.forumId && FORUM_NAMES[r.forumId] ? `<span class="result-forum-badge">${r.forumId} - ${FORUM_NAMES[r.forumId]}</span>` : "";
  const delay = Math.min(idx * 40, 400);
  const isFetching = state.fetchingCards.has(idx);
  const fetchInfo = isFetching ? state.fetchingCards.get(idx) : null;
  const isCompleted = state.completedCards.has(idx);
  const completedData: FetchResult | undefined = isCompleted ? state.completedCards.get(idx) : undefined;
  const isScraped = state.scrapedCards.has(idx);
  const scrapedData = isScraped ? state.scrapedCards.get(idx) : null;

  let actionsHtml: string;
  if (isFetching) {
    const phase = fetchInfo?.phase || "scraping";
    const progressText = phase === "extracting" ? `${fetchInfo?.extracted ?? 0}/${fetchInfo?.total ?? "?"}` : "Scraping…";
    actionsHtml = `
      <div class="result-actions">
        <div class="inline-progress">
          <div class="spinner" style="width:14px;height:14px;border-width:2px"></div>
          <span class="progress-label">${phase === "extracting" ? "Extracting" : "Scraping…"}</span>
          ${phase === "extracting" ? `<span class="progress-counter" data-fetch-progress="${idx}">${progressText}</span>` : ""}
        </div>
      </div>`;
  } else if (isCompleted && completedData) {
    const ok = completedData.ok;
    const errMsg = !ok ? completedData.error || "Extraction failed" : "";
    const isImgNotFound = errMsg.toLowerCase().includes("images not found") || errMsg.toLowerCase().includes("no image links");
    const hasFailedLinks = ok && completedData.failedLinks && completedData.failedLinks.length > 0;
    actionsHtml = `
      <div class="result-actions">
        <button class="action-btn" data-open="${r.url}" title="Open thread">${svgIcon("external")}</button>
        ${!ok ? `<button class="action-btn retry-btn" data-retry-idx="${idx}" title="Retry extraction">↻ Retry</button>` : ""}
        ${ok && (completedData.sendCommand || completedData.dlCommand) ? `<button class="action-btn copy-cmd-btn" data-copy-card="${idx}" title="Copy commands">${svgIcon("copy")}</button>` : ""}
        <button class="action-btn ${ok ? (hasFailedLinks ? "done-warn" : "done") : "done-error"}" data-view-completed="${idx}" title="${ok ? (hasFailedLinks ? `${completedData.failed} images failed — click to re-extract` : "View result") : errMsg}">
          ${ok ? "✓" : isImgNotFound ? "× Not found" : "× Error"} ${ok ? `${completedData.extracted}/${completedData.total}` : ""}${hasFailedLinks ? ` <span style="color:#f87171;font-size:10px">(${completedData.failed} failed)</span>` : ""}
        </button>
      </div>`;
  } else if (isScraped && scrapedData) {
    const postsHtml = scrapedData.posts
      .map((p, pi) => {
        const postFetchInfo = state.fetchingCards.get(`${idx}-${pi}`);
        const postCompleted = state.completedCards.get(`${idx}-${pi}`);
        let postBtn: string;
        if (postFetchInfo) {
          const phase = postFetchInfo.phase || "extracting";
          const txt = phase === "extracting" ? `${postFetchInfo.extracted ?? 0}/${postFetchInfo.total ?? "?"}` : "Scraping…";
          postBtn = `<div class="inline-progress" style="padding:3px 8px">
          <div class="spinner" style="width:10px;height:10px;border-width:1.5px"></div>
          <span class="progress-counter" data-fetch-progress="${idx}-${pi}" style="font-size:11px">${txt}</span>
        </div>`;
        } else if (postCompleted) {
          const ok = postCompleted.ok;
          const pErrMsg = !ok ? postCompleted.error || "Failed" : "";
          const pIsImgNotFound = pErrMsg.toLowerCase().includes("images not found") || pErrMsg.toLowerCase().includes("no image links");
          postBtn = `<div style="display:flex;gap:4px;align-items:center">
          ${!ok ? `<button class="action-btn retry-btn" data-retry-card-idx="${idx}" data-retry-post-idx="${pi}" style="font-size:11px;padding:3px 8px" title="Retry">↻</button>` : ""}
          ${ok && (postCompleted.sendCommand || postCompleted.dlCommand) ? `<button class="action-btn copy-cmd-btn" data-copy-card="${idx}-${pi}" style="font-size:11px;padding:3px 8px" title="Copy commands">${svgIcon("copy")}</button>` : ""}
          <button class="action-btn ${ok ? "done" : "done-error"}" data-view-completed="${idx}-${pi}" style="font-size:11px;padding:3px 10px" title="${ok ? "" : pErrMsg}">
            ${ok ? "✓" : pIsImgNotFound ? "×" : "×"} ${ok ? `${postCompleted.extracted}/${postCompleted.total}` : "Fail"}
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
      })
      .join("");
    actionsHtml = "";
    return `
    <div class="result-card fade-in card-scraped" style="animation-delay:${delay}ms" data-idx="${idx}">
      <span class="result-index">${(state.page - 1) * 20 + idx + 1}</span>
      <div class="result-body">
        <div class="result-title" title="${r.title}">${r.title}</div>
        <div class="result-meta">
          ${forumNameHtml}
          ${prefixHtml}
          ${idLabel ? `<span class="result-id glitch" title="Click to copy" data-id="${idLabel}" style="cursor:pointer">${idLabel}</span>` : ""}
          ${dateStr ? `<span class="result-date">${dateStr}</span>` : ""}
          ${r.category ? `<span class="result-prefix">${r.category}</span>` : ""}
        </div>
        <div class="post-pick-list">
          <div class="post-pick-header">Select post to extract</div>
          ${postsHtml}
        </div>
      </div>
      <div class="result-actions">
        <button class="action-btn" data-open="${r.url}" title="Open thread">${svgIcon("external")}</button>
      </div>
    </div>`;
  } else {
    actionsHtml = `
      <div class="result-actions">
        <button class="action-btn" data-open="${r.url}" title="Open thread">${svgIcon("external")}</button>
        <button class="action-btn primary" data-fetch-idx="${idx}" title="Get images">Get images</button>
      </div>`;
  }

  return `
  <div class="result-card fade-in ${isFetching ? "card-fetching" : ""} ${isCompleted ? (completedData?.ok ? "card-done" : "card-error") : ""}" style="animation-delay:${delay}ms" data-idx="${idx}">
    <span class="result-index">${(state.page - 1) * 20 + idx + 1}</span>
    <div class="result-body">
      <div class="result-title" title="${r.title}">${r.title}</div>
      <div class="result-meta">
        ${forumNameHtml}
        ${prefixHtml}
        ${idLabel ? `<span class="result-id glitch" title="Click to copy" data-id="${idLabel}" style="cursor:pointer">${idLabel}</span>` : ""}
        ${dateStr ? `<span class="result-date">${dateStr}</span>` : ""}
        ${r.category ? `<span class="result-prefix">${r.category}</span>` : ""}
      </div>
    </div>
    ${actionsHtml}
  </div>`;
}

// ====== RESULTS SECTION ======
function renderResults(skipAnim = false): string {
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
      const previewHtml = (d.previewUrls || [])
        .map((u) => `<div class="preview-url glitch" data-effect="scramble" title="${u}">${u}</div>`)
        .join("");

      return `
        <div class="imx-result fade-in">
          <div class="result-info-grid">
            <div class="info-row"><span class="info-key">Title</span><span class="info-val">${d.title || ""}</span></div>
            <div class="info-row"><span class="info-key">Images</span><span class="info-val accent">${d.extracted}/${d.total}</span></div>
            ${d.services ? `<div class="info-row"><span class="info-key">Service</span><span class="info-val">${d.services}</span></div>` : ""}
            <div class="info-row"><span class="info-key">Source</span><span class="info-val url-val" title="${d.sourceUrl}">${d.sourceUrl}</span></div>
            ${d.pasteUrl ? `<div class="info-row"><span class="info-key">Link</span><span class="info-val"><a class="paste-link" href="${d.pasteUrl}" target="_blank" rel="noopener">${d.pasteUrl}</a></span></div>` : ""}
          </div>
          ${(() => {
              const cmdParts: string[] = [];
              const cmdCopyParts: string[] = [];
              if (d.sendCommand) {
                cmdParts.push(`<div class="cmd-line">${d.sendCommand}</div>`);
                let copyCmd = d.sendCommand;
                if (d.sourceUrl) {
                  cmdParts.push(`<div class="cmd-line cmd-source-line"><a href="${d.sourceUrl}" target="_blank" rel="noopener" class="cmd-source-link">Source</a></div>`);
                  copyCmd += `\\n\\n<a href="${d.sourceUrl}">Source</a>`;
                }
                cmdCopyParts.push(copyCmd);
              }
              if (d.dlCommand) {
                cmdParts.push(`<div class="cmd-line">${d.dlCommand}</div>`);
                cmdCopyParts.push(d.dlCommand);
              }
              return cmdParts.length > 0
                ? `<div class="cmd-block" data-copy-cmd="${cmdCopyParts.join("\\n").replace(/"/g, "&quot;")}">${cmdParts.join("")}</div>`
                : "";
            })()}
          ${previewHtml ? `<div class="preview-block" style="margin-top:16px">${previewHtml}</div>` : ""}
          <div class="modal-actions" style="margin-top:16px">
            ${d.pasteUrl ? `<button class="action-btn" id="df-copy-paste">${svgIcon("copy")} Copy Link</button>` : ""}
            ${d.sendCommand ? `<button class="action-btn" id="df-copy-send">${svgIcon("copy")} Copy /s</button>` : ""}
            <button class="action-btn primary" id="df-open" data-url="${d.sourceUrl}">${svgIcon("external")} Open Thread</button>
          </div>
        </div>`;
    } else {
      return `
        <div class="imx-result fade-in">
          <div class="error-msg">${d.error || "Extraction failed"}</div>
        </div>`;
    }
  }

  const hasCompletedCmds =
    [...state.completedCards.values()].some((c) => c.ok && (c.sendCommand || c.dlCommand)) ||
    [...state.completedThreadPosts.values()].some((c) => c.ok && (c.sendCommand || c.dlCommand));

  // Determine if we're in VG mode with multiple forums to show toggles
  const isVg = state.tab === "vg";
  const searchedForums = isVg ? [...state.vgForums] : [];
  const showForumToggles = isVg && searchedForums.length > 1;

  // Forum filter toggles
  const filterTogglesHtml = showForumToggles && state.query
    ? `<div class="post-search-filters ${skipAnim ? "" : "fade-in"}">
        <span class="filter-label">${svgIcon("filter")} Forums:</span>
        <div class="filter-toggle-group">
          ${searchedForums
            .map(
              (fid) => {
                const count = state.forumCounts[fid] || 0;
                return `<button class="filter-toggle ${state.visibleCategories.has(fid) ? "active" : ""}" data-filter-forum="${fid}" title="${state.visibleCategories.has(fid) ? "Hide" : "Show"} ${FORUM_NAMES[fid] || fid} results">
              <span class="filter-toggle-dot"></span>
              ${fid} - ${FORUM_NAMES[fid] || "Forum"}
              ${count ? `<span class="filter-toggle-count">${count}</span>` : ""}
            </button>`;
              },
            )
            .join("")}
        </div>
      </div>`
    : "";

  let listHtml = "";
  if (state.loading) {
    listHtml = `<div class="results-list">${renderSkeleton()}</div>`;
  } else if (!state.results.length && state.query) {
    listHtml = `
      <div class="empty-state">
        <div class="icon">🔍</div>
        <h3>No results found</h3>
        <p>Try a different search term or switch tabs.</p>
      </div>`;
  } else if (state.results.length) {
    listHtml = `<div class="results-list">
      ${state.results.map((r, i) => renderCard(r, i)).join("")}
    </div>`;
  }

  if (!state.query && !state.loading) return "";

  if (state.isNewSearchLoading) {
    return listHtml;
  }

  return `
    <div class="status-bar ${skipAnim ? "" : "fade-in"}">
      <div class="status-info">
        <span class="status-count">${showForumToggles ? `${state.totalResults} / ${state.totalUnfiltered}` : state.totalResults}</span>
        <span>results for "<strong>${state.query}</strong>"</span>
      </div>
      <div class="status-actions">
        ${
          hasCompletedCmds
            ? `<button class="export-btn" id="copy-all-btn" title="Copy all extracted commands">
          ${svgIcon("copy_all")} Copy All
        </button>`
            : ""
        }
        <button class="export-btn" id="export-btn" title="Export search results as JSON">
          ${svgIcon("download")} Export
        </button>
        <div class="pagination">
          <button class="icon-btn" id="first-page" ${state.page <= 1 ? "disabled" : ""} title="First page">${svgIcon("chevrons_left")}</button>
          <button class="icon-btn" id="prev-page" ${state.page <= 1 ? "disabled" : ""} title="Previous page">${svgIcon("chevron_left")}</button>
          <div class="page-jump">
            <input type="number" id="page-input" class="page-input" value="${state.page}" min="1" max="${state.totalPages}" title="Jump to page">
            <span class="page-total">/ ${state.totalPages}</span>
          </div>
          <button class="icon-btn" id="next-page" ${state.page >= state.totalPages ? "disabled" : ""} title="Next page">${svgIcon("chevron_right")}</button>
          <button class="icon-btn" id="last-page" ${state.page >= state.totalPages ? "disabled" : ""} title="Last page">${svgIcon("chevrons_right")}</button>
        </div>
      </div>
    </div>
    ${filterTogglesHtml}
    ${listHtml}`;
}

// ====== SEARCH ======
async function doSearch(query: string, page = 1, isNewSearch = true): Promise<void> {
  if (!query.trim()) return;

  if (isNewSearch) {
    if (state.tab === "vg") {
      state.visibleCategories = new Set([...state.vgForums]);
    } else {
      state.visibleCategories.clear();
    }
  }

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
        state.directFetchResult = { ok: false, error: "Failed to fetch thread" };
      }
    } catch (err) {
      state.directFetchResult = { ok: false, error: (err as Error).message };
    }
    state.directFetchLoading = false;
    render();
    return;
  }

  state.query = query;
  state.page = page;
  state.loading = true;
  state.isNewSearchLoading = isNewSearch;
  state.results = [];
  state.fetchingCards.clear();
  state.completedCards.clear();
  state.scrapedCards.clear();
  state.fetchingThreadPosts.clear();
  state.completedThreadPosts.clear();
  state.searchStartTime = Date.now();
  state.searchElapsed = "0.0";
  render();
  startTimerLoop(state);

  try {
    const forums = state.tab === "vg" ? [...state.vgForums] : undefined;
    const filterForums = state.tab === "vg" ? [...state.visibleCategories] : undefined;
    
    // Ensure a minimum 300ms loading time for smooth skeleton fade animations
    // instead of an instantaneous harsh blink when loading from cache.
    const [data] = await Promise.all([
      apiSearch(state.tab, query, page, forums, filterForums),
      new Promise((resolve) => setTimeout(resolve, 300)),
    ]);
    state.results = data.results || [];
    state.totalResults = data.total || state.results.length;
    state.totalUnfiltered = data.totalUnfiltered || state.totalResults;
    state.forumCounts = data.forumCounts || {};
    state.totalPages = Math.max(1, Math.ceil(state.totalResults / 20));
    
    state.loading = false;
    state.isNewSearchLoading = false;
    const elapsed = ((Date.now() - state.searchStartTime!) / 1000).toFixed(1);
    state.searchStartTime = null;
    state.searchElapsed = 0;
    render();
    if (isNewSearch) {
      toast(`Found ${state.totalResults} results in ${elapsed}s`, "success");
      if (page === 1) celebrate();
    }
  } catch (err) {
    state.loading = false;
    state.isNewSearchLoading = false;
    state.searchStartTime = null;
    state.searchElapsed = 0;
    state.results = [];
    render();
    toast(`Search failed: ${(err as Error).message}`, "error");
  }
}

export { renderHero, renderSkeleton, renderCard, renderResults, doSearch };
