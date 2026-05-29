import { state, render } from "../appShell.ts";
import {
  svgIcon,
  formatRssDate,
} from "../utils.ts";
import type { RssEntry, FetchResult } from "../api.ts";
import { renderSkeleton } from "./search.ts";

// ====== RSS VIEW ======
function renderRssCard(entry: RssEntry, idx: number): string {
  const delay = Math.min(idx * 30, 500);
  const prefixBadge = entry.prefix ? `<span class="rss-studio-badge">${entry.prefix}</span>` : "";
  const dateStr = entry.dateText || "";

  const rssKey = `rss-${idx}`;
  const isFetching = state.fetchingCards.has(rssKey);
  const fetchInfo = isFetching ? state.fetchingCards.get(rssKey) : null;
  const isCompleted = state.completedCards.has(rssKey);
  const completedData: FetchResult | undefined = isCompleted ? state.completedCards.get(rssKey) : undefined;
  const isScraped = state.scrapedCards.has(rssKey);
  const scrapedData = isScraped ? state.scrapedCards.get(rssKey) : null;

  let actionsHtml: string;
  if (isFetching) {
    const phase = fetchInfo?.phase || "scraping";
    const progressText = phase === "extracting" ? `${fetchInfo?.extracted ?? 0}/${fetchInfo?.total ?? "?"}` : "Scraping…";
    actionsHtml = `
      <div class="result-actions">
        <div class="inline-progress">
          <div class="spinner" style="width:14px;height:14px;border-width:2px"></div>
          <span class="progress-label">${phase === "extracting" ? "Extracting" : "Scraping…"}</span>
          ${phase === "extracting" ? `<span class="progress-counter" data-fetch-progress="${rssKey}">${progressText}</span>` : ""}
        </div>
      </div>`;
  } else if (isCompleted && completedData) {
    const ok = completedData.ok;
    const errMsg = !ok ? completedData.error || "Extraction failed" : "";
    const isImgNotFound = errMsg.toLowerCase().includes("images not found") || errMsg.toLowerCase().includes("no image links");
    const hasFailedLinks = ok && completedData.failedLinks && completedData.failedLinks.length > 0;
    actionsHtml = `
      <div class="result-actions">
        <button class="action-btn" data-open="${entry.link}" title="Open thread">${svgIcon("external")}</button>
        ${!ok ? `<button class="action-btn retry-btn" data-rss-retry="${idx}" title="Retry extraction">↻ Retry</button>` : ""}
        ${ok && (completedData.sendCommand || completedData.dlCommand) ? `<button class="action-btn copy-cmd-btn" data-copy-card="${rssKey}" title="Copy commands">${svgIcon("copy")}</button>` : ""}
        <button class="action-btn ${ok ? (hasFailedLinks ? "done-warn" : "done") : "done-error"}" data-view-completed="${rssKey}" title="${ok ? (hasFailedLinks ? `${completedData.failed} images failed` : "View result") : errMsg}">
          ${ok ? "✓" : isImgNotFound ? "× Not found" : "× Error"} ${ok ? `${completedData.extracted}/${completedData.total}` : ""}${hasFailedLinks ? ` <span style="color:#f87171;font-size:10px">(${completedData.failed} failed)</span>` : ""}
        </button>
      </div>`;
  } else if (isScraped && scrapedData) {
    const postsHtml = scrapedData.posts
      .map((p, pi) => {
        const postKey = `${rssKey}-${pi}`;
        const postFetchInfo = state.fetchingCards.get(postKey);
        const postCompleted = state.completedCards.get(postKey);
        let postBtn: string;
        if (postFetchInfo) {
          const phase = postFetchInfo.phase || "extracting";
          const txt = phase === "extracting" ? `${postFetchInfo.extracted ?? 0}/${postFetchInfo.total ?? "?"}` : "Scraping…";
          postBtn = `<div class="inline-progress" style="padding:3px 8px">
          <div class="spinner" style="width:10px;height:10px;border-width:1.5px"></div>
          <span class="progress-counter" data-fetch-progress="${postKey}" style="font-size:11px">${txt}</span>
        </div>`;
        } else if (postCompleted) {
          const ok = postCompleted.ok;
          const pErrMsg = !ok ? postCompleted.error || "Failed" : "";
          postBtn = `<div style="display:flex;gap:4px;align-items:center">
          ${!ok ? `<button class="action-btn retry-btn" data-rss-post-retry="${idx}" data-rss-post-retry-pi="${pi}" style="font-size:11px;padding:3px 8px" title="Retry">↻</button>` : ""}
          ${ok && (postCompleted.sendCommand || postCompleted.dlCommand) ? `<button class="action-btn copy-cmd-btn" data-copy-card="${postKey}" style="font-size:11px;padding:3px 8px" title="Copy commands">${svgIcon("copy")}</button>` : ""}
          <button class="action-btn ${ok ? "done" : "done-error"}" data-view-completed="${postKey}" style="font-size:11px;padding:3px 10px" title="${ok ? "" : pErrMsg}">
            ${ok ? "✓" : "×"} ${ok ? `${postCompleted.extracted}/${postCompleted.total}` : "Fail"}
          </button>
        </div>`;
        } else {
          postBtn = `<button class="action-btn primary inline-extract-btn" data-rss-extract="${idx}" data-rss-extract-pi="${pi}" style="font-size:11px;padding:3px 10px">Extract</button>`;
        }
        return `<div class="post-pick-row">
        <span class="post-pick-title" title="${p.title}">${p.title}</span>
        <span class="post-pick-count">${p.count} img</span>
        ${postBtn}
      </div>`;
      })
      .join("");

    return `
    <div class="result-card rss-card fade-in card-scraped" style="animation-delay:${delay}ms" data-rss-idx="${idx}">
      <span class="result-index">${idx + 1}</span>
      <div class="result-body">
        <div class="result-title" title="${entry.title}">${entry.title}</div>
        <div class="result-meta">
          ${prefixBadge}
          ${dateStr ? `<span class="result-date">${dateStr}</span>` : ""}
        </div>
        <div class="post-pick-list">
          <div class="post-pick-header">Select post to extract</div>
          ${postsHtml}
        </div>
      </div>
      <div class="result-actions">
        <button class="action-btn" data-open="${entry.link}" title="Open thread">${svgIcon("external")}</button>
      </div>
    </div>`;
  } else {
    actionsHtml = `
      <div class="result-actions">
        <button class="action-btn" data-open="${entry.link}" title="Open thread on Viper">${svgIcon("external")}</button>
        ${entry.link ? `<button class="action-btn primary" data-rss-fetch="${idx}" title="Get images">Get images</button>` : ""}
      </div>`;
  }

  return `
  <div class="result-card rss-card fade-in ${isFetching ? "card-fetching" : ""} ${isCompleted ? (completedData?.ok ? "card-done" : "card-error") : ""}" style="animation-delay:${delay}ms" data-rss-idx="${idx}">
    <span class="result-index">${idx + 1}</span>
    <div class="result-body">
      <div class="result-title" title="${entry.title}">${entry.title}</div>
      <div class="result-meta">
        ${prefixBadge}
        ${dateStr ? `<span class="result-date">${dateStr}</span>` : ""}
      </div>
    </div>
    ${actionsHtml}
  </div>`;
}

function renderRssView(skipAnim: boolean): string {
  const header = `
  <section class="hero ${skipAnim ? "skip-anim" : ""}" style="padding-bottom:40px">
    <div class="hero-eyebrow">Live feed</div>
    <h1>Latest<br><span>Releases</span></h1>
    <p class="hero-sub">Real-time RSS feed from Viper forums — newest photo set threads, auto-refreshed.</p>
    ${state.rssFeedUpdated ? `<div class="rss-updated-badge">Updated ${formatRssDate(state.rssFeedUpdated)}</div>` : ""}
  </section>`;

  let body: string;
  if (state.rssLoading) {
    body = `<div class="results-list">${renderSkeleton()}</div>`;
  } else if (state.rssError) {
    body = `
      <div class="empty-state">
        <div class="icon">⚠️</div>
        <h3>Feed Error</h3>
        <p>${state.rssError}</p>
        <button class="action-btn primary" id="rss-retry" style="margin-top:16px">↻ Retry</button>
      </div>`;
  } else if (!state.rssEntries.length) {
    body = `
      <div class="empty-state">
        <div class="icon">📡</div>
        <h3>No entries</h3>
        <p>The feed returned no entries. Try refreshing.</p>
        <button class="action-btn primary" id="rss-retry" style="margin-top:16px">↻ Refresh</button>
      </div>`;
  } else {
    body = `
      <div class="status-bar fade-in">
        <div class="status-info">
          <span class="status-count">${state.rssEntries.length}</span>
          <span>entries from "<strong>${state.rssFeedTitle}</strong>"</span>
        </div>
        <div class="status-actions">
          <button class="export-btn" id="rss-refresh" title="Refresh feed">
            ↻ Refresh
          </button>
        </div>
      </div>
      <div class="results-list">
        ${state.rssEntries.map((e, i) => renderRssCard(e, i)).join("")}
      </div>`;
  }

  return header + `<main>${body}</main>`;
}

async function fetchRssFeed(): Promise<void> {
  state.rssLoading = true;
  state.rssError = null;
  render();
  try {
    const res = await fetch(`/api/rss`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.ok) {
      state.rssEntries = data.entries || [];
      state.rssFeedTitle = data.feedTitle || "RSS Feed";
      state.rssFeedUpdated = data.feedUpdated || "";
    } else {
      throw new Error(data.error || "Failed to load feed");
    }
  } catch (err) {
    state.rssError = (err as Error).message;
    state.rssEntries = [];
  }
  state.rssLoading = false;
  render();
}

export { renderRssCard, renderRssView, fetchRssFeed };
