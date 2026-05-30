import { state } from "../appShell.ts";
import { svgIcon } from "../utils.ts";
import type { FetchResult } from "../api.ts";

// ====== THREAD VIEW ======
function renderThreadView(): string {
  const d = state.threadData;
  if (!d) return '<div class="error-msg">No thread data</div>';
  const pageData = d.pages[state.threadPage];
  if (!pageData) return '<div class="error-msg">Invalid page</div>';

  const globalStart = d.pages
    .slice(0, state.threadPage)
    .reduce((s, p) => s + p.posts.length, 0);
  const totalPosts = d.pages.reduce((s, p) => s + p.posts.length, 0);

  const postsHtml = pageData.posts
    .map((post, i) => {
      const gidx = globalStart + i;
      const isFetchingPost = state.fetchingThreadPosts.has(gidx);
      const fetchInfo = isFetchingPost ? state.fetchingThreadPosts.get(gidx) : null;
      const isCompletedPost = state.completedThreadPosts.has(gidx);
      const completedPostData: FetchResult | undefined = isCompletedPost ? state.completedThreadPosts.get(gidx) : undefined;
      const delay = Math.min(i * 40, 400);
      const displayNum = gidx + 1;

      // Build direct post URL from postId if available
      const threadBaseUrl = d.url || "";
      const postUrl = post.postId && threadBaseUrl
        ? `${threadBaseUrl.replace(/\/$/, "")}?p=${post.postId}&viewfull=1#post${post.postId}`
        : threadBaseUrl;

      let actionsHtml: string;
      if (isFetchingPost) {
        const progressText = `${fetchInfo?.extracted ?? 0}/${fetchInfo?.total ?? "?"}`;
        actionsHtml = `<div class="result-actions">
        <div class="inline-progress">
          <div class="spinner" style="width:14px;height:14px;border-width:2px"></div>
          <span class="progress-label">Extracting</span>
          <span class="progress-counter" data-thread-progress="${gidx}">${progressText}</span>
        </div>
      </div>`;
      } else if (isCompletedPost && completedPostData) {
        const ok = completedPostData.ok;
        const tErrMsg = !ok ? completedPostData.error || "Extraction failed" : "";
        const tIsImgNotFound = tErrMsg.toLowerCase().includes("images not found") || tErrMsg.toLowerCase().includes("no image links");
        const tHasFailedLinks = ok && completedPostData.failedLinks && completedPostData.failedLinks.length > 0;
        actionsHtml = `<div class="result-actions">
        ${postUrl ? `<button class="action-btn" data-open="${postUrl}" title="Open post in new tab">${svgIcon("external")}</button>` : ""}
        ${!ok ? `<button class="action-btn retry-btn" data-retry-thread-gidx="${gidx}" title="Retry extraction">↻ Retry</button>` : ""}
        ${ok && (completedPostData.sendCommand || completedPostData.dlCommand) ? `<button class="action-btn copy-cmd-btn" data-copy-thread-post="${gidx}" title="Copy commands">${svgIcon("copy")}</button>` : ""}
        <button class="action-btn ${ok ? (tHasFailedLinks ? "done-warn" : "done") : "done-error"}" data-view-completed-post="${gidx}" title="${ok ? (tHasFailedLinks ? `${completedPostData.failed} failed — click to re-extract` : "View result") : tErrMsg}">
          ${ok ? "✓" : tIsImgNotFound ? "× Not found" : "× Error"} ${ok ? `${completedPostData.extracted}/${completedPostData.total}` : ""}${tHasFailedLinks ? ` <span style="color:#f87171;font-size:10px">(${completedPostData.failed} failed)</span>` : ""}
        </button>
      </div>`;
      } else {
        actionsHtml = `<div class="result-actions">
           ${postUrl ? `<button class="action-btn" data-open="${postUrl}" title="Open post in new tab">${svgIcon("external")}</button>` : ""}
           <button class="action-btn primary extract-post-btn" data-gidx="${gidx}" title="Get images">Get images</button>
         </div>`;
      }

      return `
      <div class="result-card fade-in ${isFetchingPost ? "card-fetching" : ""} ${isCompletedPost ? (completedPostData?.ok ? "card-done" : "card-error") : ""}" style="animation-delay:${delay}ms">
        <span class="result-index">${displayNum}</span>
        <div class="result-body">
          <div class="result-title">${post.title || `Post #${displayNum}`}</div>
          <div class="result-meta">
            <span class="result-prefix">VG</span>
            <span class="result-id">${post.count} images</span>
          </div>
        </div>
        ${actionsHtml}
      </div>`;
    })
    .join("");

  return `
    <div class="status-bar fade-in">
      <div class="status-info">
        <span class="status-count">${totalPosts}</span>
        <span>posts in thread &ldquo;<strong>${d.title}</strong>&rdquo;</span>
      </div>
      <div class="status-actions">
        ${
          [...state.completedThreadPosts.values()].some(
            (c) => c.ok && (c.sendCommand || c.dlCommand),
          )
            ? `<button class="export-btn" id="copy-all-btn" title="Copy all extracted commands">
          ${svgIcon("copy_all")} Copy All
        </button>`
            : ""
        }
        ${d.url ? `<button class="export-btn" id="export-btn" title="Export thread results as JSON">${svgIcon("download")} Export</button>` : ""}
        <div class="pagination">
          <button class="icon-btn" id="thread-prev-page" ${state.threadPage <= 0 ? "disabled" : ""}>${svgIcon("chevron_left")}</button>
          <span class="page-info">Page ${state.threadPage + 1} / ${d.totalPages}</span>
          <button class="icon-btn" id="thread-next-page" ${state.threadPage >= d.pages.length - 1 ? "disabled" : ""}>${svgIcon("chevron_right")}</button>
        </div>
      </div>
    </div>
    <div class="results-list">
      ${postsHtml}
    </div>`;
}

export { renderThreadView };
