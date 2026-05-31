import { state } from "../appShell.ts";
import { svgIcon } from "../utils.ts";

// ====== IMX VIEW ======
function renderImxView(skipAnim: boolean): string {
  const isExtract = state.imxMode === "extract";
  const isUpload = state.imxMode === "upload";

  const header = `
  <section class="hero ${skipAnim ? "skip-anim" : ""}" style="padding-bottom:40px">
    <div class="hero-eyebrow">IMX Tools</div>
    <h1>IMX<br><span>Toolkit</span></h1>
    <p class="hero-sub">Extract direct URLs from imx.to viewer links, or upload images to IMX from a paste URL.</p>

    <div class="tabs">
      <button class="tab-btn ${isUpload ? "active" : ""}" data-imx-mode="upload" id="imx-tab-upload">Upload</button>
      <button class="tab-btn ${isExtract ? "active" : ""}" data-imx-mode="extract" id="imx-tab-extract">Extract</button>
    </div>
  </section>`;

  let body: string;
  if (isExtract) {
    body = `
    <div class="imx-form fade-in">
      <label class="imx-label" for="imx-extract-input">Paste imx.to viewer links</label>
      <textarea id="imx-extract-input" class="imx-textarea" rows="8" placeholder="Paste imx.to/i/XXXX links here (one per line or mixed text)…" spellcheck="false"></textarea>
      <button class="search-btn" id="imx-extract-btn" style="margin-top:12px;align-self:flex-end" ${state.imxLoading ? "disabled" : ""}>
        ${state.imxLoading ? '<div class="spinner"></div> Extracting…' : `${svgIcon("arrow_right")} Extract URLs`}
      </button>
    </div>`;
  } else {
    body = `
    <div class="imx-form fade-in">
      <label class="imx-label" for="imx-upload-input">Paste URL (pb.dotrhelvetican.workers.dev)</label>
      <input id="imx-upload-input" class="imx-url-input" type="text" placeholder="https://pb.dotrhelvetican.workers.dev/XXXX" spellcheck="false" />
      <button class="search-btn" id="imx-upload-btn" style="margin-top:12px;align-self:flex-end" ${state.imxLoading ? "disabled" : ""}>
        ${state.imxLoading ? '<div class="spinner"></div> Uploading…' : `${svgIcon("arrow_right")} Upload to IMX`}
      </button>
      ${state.imxLoading ? `<div id="imx-progress" class="imx-progress">${state.imxProgress ? (() => {
        const p = state.imxProgress;
        const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
        return `
          <div class="imx-progress-header">
            <div class="imx-progress-phase-row">
              <div class="spinner" style="width:12px;height:12px;border-width:1.5px"></div>
              <div class="imx-progress-phase">${p.phase}</div>
            </div>
            <div class="imx-progress-pct">${pct}%</div>
          </div>
          <div class="imx-progress-bar-track"><div class="imx-progress-bar-fill" style="width:${pct}%"></div></div>
          <div class="imx-progress-stats">
            <span class="imx-progress-stat total">${p.done}/${p.total}</span>
            <span class="imx-progress-stat success">${p.success} ok</span>
            <span class="imx-progress-stat fail ${p.fail === 0 ? 'zero' : ''}">${p.fail} failed</span>
          </div>`;
      })() : `
          <div class="imx-progress-phase-row">
            <div class="spinner" style="width:12px;height:12px;border-width:1.5px"></div>
            <div class="imx-progress-phase">Fetching paste…</div>
          </div>`}</div>` : ""}
    </div>`;
  }

  let resultHtml = "";
  if (state.imxResult) {
    const d = state.imxResult;
    if (d.ok) {
      const previewHtml = (d.previewUrls || [])
        .map((u) => `<div class="preview-url glitch" data-effect="scramble" title="${u}">${u}</div>`)
        .join("");

      resultHtml = `
      <div class="imx-result fade-in">
        <div class="result-info-grid">
          <div class="info-row"><span class="info-key">Total</span><span class="info-val">${d.total}</span></div>
          ${d.extracted != null ? `<div class="info-row"><span class="info-key">Extracted</span><span class="info-val accent">${d.extracted}</span></div>` : ""}
          ${d.uploaded != null ? `<div class="info-row"><span class="info-key">Uploaded</span><span class="info-val accent">${d.uploaded}</span></div>` : ""}
          ${d.failed != null && d.failed > 0 ? `<div class="info-row"><span class="info-key">Failed</span><span class="info-val" style="color:#f87171">${d.failed}</span></div>` : ""}
          ${d.galleryUrl ? `<div class="info-row"><span class="info-key">Gallery</span><span class="info-val"><a class="paste-link" href="${d.galleryUrl}" target="_blank" rel="noopener">${d.galleryUrl}</a></span></div>` : ""}
          ${d.pasteUrl ? `<div class="info-row"><span class="info-key">Paste</span><span class="info-val"><a class="paste-link" href="${d.pasteUrl}" target="_blank" rel="noopener">${d.pasteUrl}</a></span></div>` : ""}
        </div>
        ${previewHtml ? `<div class="preview-block" style="margin-top:16px">${previewHtml}</div>` : ""}
        <div class="modal-actions" style="margin-top:16px">
          ${d.pasteUrl ? `<button class="action-btn" id="imx-copy-paste">${svgIcon("copy")} Copy Link</button>` : ""}
          <button class="action-btn primary" id="imx-open-paste" data-url="${d.pasteUrl || d.galleryUrl || ""}">
            ${svgIcon("external")} Open
          </button>
        </div>
      </div>`;
    } else {
      resultHtml = `
      <div class="imx-result fade-in">
        <div class="error-msg">${d.error || "Operation failed"}</div>
      </div>`;
    }
  }

  return header + `<main>${body}${resultHtml}</main>`;
}

export { renderImxView };
