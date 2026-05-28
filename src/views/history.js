import { state, render } from "../app.js";
import { svgIcon, toast, copyText, getCmdText } from "../utils.js";
import { apiHistory } from "../api.js";
import { renderSkeleton } from "./search.js";

// ====== HISTORY VIEW ======
function formatTimestamp(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderHistoryCard(h, idx) {
  const delay = Math.min(idx * 40, 400);
  const srcBadge =
    h.source === "vg"
      ? '<span class="result-prefix">VG</span>'
      : '<span class="result-prefix">APS</span>';
  return `
  <div class="result-card fade-in" style="animation-delay:${delay}ms" data-history-idx="${idx}">
    <span class="result-index">${(state.historyPage - 1) * 20 + idx + 1}</span>
    <div class="result-body">
      <div class="result-title" title="${h.title}">${h.title}</div>
      <div class="result-meta">
        ${srcBadge}
        <span class="result-id glitch" data-effect="scramble" title="${h.extracted}/${h.total} images">${h.extracted}/${h.total} images</span>
        ${h.services ? `<span class="result-prefix">${h.services}</span>` : ""}
        <span class="result-date">${formatTimestamp(h.timestamp)}</span>
      </div>
    </div>
    <div class="result-actions">
      ${h.pasteUrl ? `<button class="action-btn" data-open="${h.pasteUrl}" title="Open paste">${svgIcon("external")}</button>` : ""}
      <button class="action-btn primary" data-hview="${idx}">View</button>
    </div>
  </div>`;
}

function renderHistoryView(skipAnim) {
  const header = `
  <section class="hero ${skipAnim ? "skip-anim" : ""}" style="padding-bottom:40px">
    <div class="hero-eyebrow">Extraction log</div>
    <h1>History</h1>
    <p class="hero-sub">All previously extracted threads, available to everyone.</p>
  </section>`;

  let body;
  if (state.historyLoading) {
    body = `<div class="results-list">${renderSkeleton()}</div>`;
  } else if (!state.historyResults.length) {
    body = `
      <div class="empty-state">
        <div class="icon">📜</div>
        <h3>No history yet</h3>
        <p>Extract some threads and they'll appear here.</p>
      </div>`;
  } else {
    body = `
      <div class="status-bar fade-in">
        <div class="status-info">
          <span class="status-count">${state.historyTotal}</span>
          <span>extractions</span>
        </div>
        <div class="status-actions">
          <div class="pagination">
            <button class="icon-btn" id="hist-prev" ${state.historyPage <= 1 ? "disabled" : ""}>${svgIcon("chevron_left")}</button>
            <span class="page-info">${state.historyPage} / ${state.historyTotalPages}</span>
            <button class="icon-btn" id="hist-next" ${state.historyPage >= state.historyTotalPages ? "disabled" : ""}>${svgIcon("chevron_right")}</button>
          </div>
        </div>
      </div>
      <div class="results-list">
        ${state.historyResults.map((h, i) => renderHistoryCard(h, i)).join("")}
      </div>`;
  }

  return header + `<main>${body}</main>`;
}

async function fetchHistory(page = 1) {
  state.historyLoading = true;
  state.historyPage = page;
  render();
  try {
    const data = await apiHistory(page);
    state.historyResults = data.results || [];
    state.historyTotal = data.total || 0;
    state.historyTotalPages = data.totalPages || 1;
    state.historyPage = data.page || 1;
  } catch (err) {
    toast(`History failed: ${err.message}`, "error");
  }
  state.historyLoading = false;
  render();
}

export { renderHistoryView, fetchHistory };
