import { state } from "../appShell.ts";
import { svgIcon } from "../utils.ts";

// ====== MODAL ======
function renderModal(): string {
  if (!state.modalData) return "";
  const d = state.modalData;

  // If still loading
  if (d.loading)
    return `
  <div class="modal-overlay open" id="modal-overlay">
    <div class="modal" style="text-align:center;padding:48px 28px">
      <div class="spinner" style="width:32px;height:32px;margin:0 auto 16px;border-width:3px"></div>
      <div style="color:var(--text-2);font-size:14px">${d.loadingMsg || "Extracting images…"}</div>
    </div>
  </div>`;

  const previewHtml = (d.previewUrls || [])
    .map(
      (u) =>
        `<div class="preview-url glitch" data-effect="scramble" title="${u}">${u}</div>`,
    )
    .join("");

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
  const cmdHtml = cmdParts.length > 0
    ? `<div class="cmd-block" data-copy-cmd="${cmdCopyParts.join("\\n").replace(/"/g, "&quot;")}">${cmdParts.join("")}</div>`
    : "";

  const statsHtml = d.ok
    ? `
    <div class="result-info-grid">
      <div class="info-row"><span class="info-key">Images</span><span class="info-val accent">${d.extracted}/${d.total}</span></div>
      ${(d.failed ?? 0) > 0 ? `<div class="info-row"><span class="info-key">Failed</span><span class="info-val" style="color:#f87171">${d.failed}</span></div>` : ""}
      ${(d.newlyRecovered ?? 0) > 0 ? `<div class="info-row"><span class="info-key">Recovered</span><span class="info-val" style="color:#34d399">+${d.newlyRecovered}</span></div>` : ""}
      <div class="info-row"><span class="info-key">Expires</span><span class="info-val">7 days</span></div>
      ${d.services ? `<div class="info-row"><span class="info-key">Service</span><span class="info-val">${d.services}</span></div>` : ""}
      <div class="info-row"><span class="info-key">Source</span><span class="info-val url-val" title="${d.sourceUrl}">${d.sourceUrl}</span></div>
      ${d.pasteUrl ? `<div class="info-row"><span class="info-key">Link</span><span class="info-val"><a class="paste-link" href="${d.pasteUrl}" target="_blank" rel="noopener">${d.pasteUrl}</a></span></div>` : ""}
    </div>`
    : `<div class="error-msg">${d.error || "Extraction failed"}</div>`;

  return `
  <div class="modal-overlay open" id="modal-overlay">
    <div class="modal modal-wide">
      <div class="modal-header">
        <div class="modal-title-text">${d.title}</div>
        <button class="modal-close" id="modal-close">×</button>
      </div>

      ${statsHtml}

      ${cmdHtml}

      ${previewHtml ? `<div class="preview-block">${previewHtml}</div>` : ""}

      <div class="modal-actions" style="margin-top:16px">
        ${d.pasteUrl ? `<button class="action-btn" id="modal-copy-paste">${svgIcon("copy")} Copy Link</button>` : ""}
        ${d.sendCommand ? `<button class="action-btn" id="modal-copy-send">${svgIcon("copy")} Copy /s</button>` : ""}
        ${d.ok && d.failedLinks && d.failedLinks.length > 0 ? `<button class="action-btn retry-btn" id="modal-reextract-failed" title="Retry ${d.failedLinks.length} failed extractions">↻ Re-extract Failed (${d.failedLinks.length})</button>` : ""}
        ${d.ok ? `<button class="action-btn" id="modal-reextract-all" title="Re-extract all images from scratch" style="color:#a78bfa">↻ Re-extract All</button>` : ""}
        <button class="action-btn primary" id="modal-open" data-url="${d.sourceUrl}">
          ${svgIcon("external")} Open Thread
        </button>
      </div>
    </div>
  </div>`;
}

export { renderModal };
