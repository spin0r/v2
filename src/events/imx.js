import { state, render } from '../app.js';
import { toast, copyText } from '../utils.js';
import { apiImxExtract, apiImxUpload } from '../api.js';

export function bindImxEvents(appEl) {
  // IMX mode tabs
  appEl.querySelectorAll('[data-imx-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.imxMode = btn.dataset.imxMode;
      state.imxResult = null;
      render();
    });
  });

  // IMX Extract button
  const imxExtractBtn = appEl.querySelector('#imx-extract-btn');
  if (imxExtractBtn) imxExtractBtn.addEventListener('click', async () => {
    const textarea = appEl.querySelector('#imx-extract-input');
    const text = textarea?.value || '';
    if (!text.trim()) return toast('Paste some imx.to links first', 'error');
    state.imxLoading = true;
    state.imxResult = null;
    render();
    try {
      const data = await apiImxExtract(text);
      state.imxResult = data;
    } catch (err) {
      state.imxResult = { ok: false, error: err.message };
    }
    state.imxLoading = false;
    render();
  });

  // IMX Upload button
  const imxUploadBtn = appEl.querySelector('#imx-upload-btn');
  if (imxUploadBtn) imxUploadBtn.addEventListener('click', async () => {
    const input = appEl.querySelector('#imx-upload-input');
    const url = input?.value || '';
    if (!url.trim()) return toast('Enter a paste URL first', 'error');
    state.imxLoading = true;
    state.imxResult = null;
    render();
    try {
      const data = await apiImxUpload(url);
      state.imxResult = data;
    } catch (err) {
      state.imxResult = { ok: false, error: err.message };
    }
    state.imxLoading = false;
    render();
  });

  // IMX result actions
  const imxCopyPaste = appEl.querySelector('#imx-copy-paste');
  if (imxCopyPaste) imxCopyPaste.addEventListener('click', () => copyText(state.imxResult?.pasteUrl || ''));
  const imxOpenPaste = appEl.querySelector('#imx-open-paste');
  if (imxOpenPaste) imxOpenPaste.addEventListener('click', () => window.open(imxOpenPaste.dataset.url, '_blank', 'noopener'));
}
