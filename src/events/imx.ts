import { state, render } from "../appShell.ts";
import { toast, copyText } from "../utils.ts";
import { apiImxExtract, apiImxUploadStream } from "../api.ts";

export function bindImxEvents(appEl: HTMLElement): void {
  // IMX mode tabs
  appEl.querySelectorAll<HTMLElement>("[data-imx-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.imxMode = (btn.dataset.imxMode as "upload" | "extract") || "upload";
      state.imxResult = null;
      render();
    });
  });

  // IMX Extract button
  const imxExtractBtn = appEl.querySelector("#imx-extract-btn");
  if (imxExtractBtn)
    imxExtractBtn.addEventListener("click", async () => {
      const textarea = appEl.querySelector<HTMLTextAreaElement>("#imx-extract-input");
      const text = textarea?.value || "";
      if (!text.trim()) return toast("Paste some imx.to links first", "error");
      state.imxLoading = true;
      state.imxResult = null;
      render();
      try {
        const data = await apiImxExtract(text);
        state.imxResult = data;
      } catch (err) {
        state.imxResult = { ok: false, error: (err as Error).message };
      }
      state.imxLoading = false;
      render();
    });

  // IMX Upload button
  const imxUploadBtn = appEl.querySelector("#imx-upload-btn");
  if (imxUploadBtn)
    imxUploadBtn.addEventListener("click", async () => {
      const input = appEl.querySelector<HTMLInputElement>("#imx-upload-input");
      const url = input?.value || "";
      if (!url.trim()) return toast("Enter a paste URL first", "error");
      state.imxLoading = true;
      state.imxResult = null;
      state.imxProgress = null;
      render();
      try {
        const data = await apiImxUploadStream(url, (evt) => {
          if (evt.type === "phase") {
            state.imxProgress = { phase: evt.phase || "", done: 0, total: evt.total || 0, success: 0, fail: 0 };
          } else if (evt.type === "progress" && state.imxProgress) {
            state.imxProgress = { ...state.imxProgress, done: evt.done || 0, total: evt.total || 0, success: evt.success || 0, fail: evt.fail || 0 };
          }
          // Update the progress display without full re-render
          const progressEl = document.querySelector("#imx-progress");
          if (progressEl && state.imxProgress) {
            const p = state.imxProgress;
            const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
            progressEl.innerHTML = `
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
              </div>
            `;
          }
        });
        state.imxResult = data;
      } catch (err) {
        state.imxResult = { ok: false, error: (err as Error).message };
      }
      state.imxLoading = false;
      state.imxProgress = null;
      render();
    });

  // IMX result actions
  const imxCopyPaste = appEl.querySelector("#imx-copy-paste");
  if (imxCopyPaste)
    imxCopyPaste.addEventListener("click", () =>
      copyText(state.imxResult?.pasteUrl || ""),
    );
  const imxOpenPaste = appEl.querySelector<HTMLElement>("#imx-open-paste");
  if (imxOpenPaste)
    imxOpenPaste.addEventListener("click", () =>
      window.open(imxOpenPaste.dataset.url, "_blank", "noopener"),
    );
}
