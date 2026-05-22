"use strict";

const { sendJSON, readBody } = require("../utils");
const { batchExtractDirectUrls, batchUploadToImx } = require("../../core/imx");
const { uploadToPaste } = require("../../core/uploader");

// ── IMX EXTRACT (imx.to viewer links → direct URLs → paste) ──
async function handleImxExtract(req, res) {
  const body = await readBody(req);
  let parsed;
  try { parsed = JSON.parse(body); } catch { return sendJSON(res, 400, { error: "Invalid JSON" }); }

  const text = parsed.text || "";
  const imxLinks = text.match(/https?:\/\/imx\.to\/i\/[a-zA-Z0-9]+/g);
  if (!imxLinks || !imxLinks.length) return sendJSON(res, 400, { error: "No valid imx.to links found" });

  console.log(`[IMX Extract] Processing ${imxLinks.length} links`);
  const { directUrls, failed } = await batchExtractDirectUrls(imxLinks);

  if (!directUrls.length) return sendJSON(res, 200, { ok: false, error: "Could not extract any direct URLs", total: imxLinks.length });

  // Upload to paste
  const content = directUrls.join("\n");
  let result = await uploadToPaste(content, 7, "pb");
  if (!result.success) result = await uploadToPaste(content, 7, "shz");

  sendJSON(res, 200, {
    ok: result.success,
    total: imxLinks.length,
    extracted: directUrls.length,
    failed,
    previewUrls: directUrls.slice(0, 5),
    pasteUrl: result.success ? result.url : null,
    pasteError: result.success ? null : result.error,
  });
}

// ── IMX UPLOAD (paste URL → download → upload to IMX → extract → paste) ──
async function handleImxUpload(req, res) {
  const body = await readBody(req);
  let parsed;
  try { parsed = JSON.parse(body); } catch { return sendJSON(res, 400, { error: "Invalid JSON" }); }

  const pbUrl = (parsed.url || "").trim();
  if (!pbUrl) return sendJSON(res, 400, { error: "Missing paste URL" });

  // Fetch paste content
  const axios = require("axios");
  let pasteData;
  try {
    const resp = await axios.get(pbUrl, { timeout: 30000 });
    pasteData = resp.data;
  } catch (e) {
    return sendJSON(res, 400, { error: `Failed to fetch paste: ${e.message}` });
  }

  const imageUrls = String(pasteData).split("\n").map(l => l.trim()).filter(l => l && /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(l));
  if (!imageUrls.length) return sendJSON(res, 400, { error: "No image URLs found in the paste" });

  console.log(`[IMX Upload] Uploading ${imageUrls.length} images`);
  const { results, galleryId } = await batchUploadToImx(imageUrls);
  const successResults = results.filter(r => r.imx_url);

  if (!successResults.length) return sendJSON(res, 200, { ok: false, error: "All uploads failed", total: imageUrls.length });

  // Extract direct URLs from new IMX viewer pages
  const imxViewerLinks = successResults.map(r => r.imx_url);
  const { directUrls } = await batchExtractDirectUrls(imxViewerLinks, null, 25);

  // Upload results to paste
  const content = directUrls.join("\n");
  let pbResult = await uploadToPaste(content, 7, "pb");
  if (!pbResult.success) pbResult = await uploadToPaste(content, 7, "shz");

  const galleryUrl = galleryId ? `https://imx.to/g/${galleryId}` : null;

  sendJSON(res, 200, {
    ok: pbResult.success,
    total: imageUrls.length,
    uploaded: successResults.length,
    extracted: directUrls.length,
    galleryUrl,
    previewUrls: directUrls.slice(0, 5),
    pasteUrl: pbResult.success ? pbResult.url : null,
    pasteError: pbResult.success ? null : pbResult.error,
  });
}

module.exports = { handleImxExtract, handleImxUpload };
