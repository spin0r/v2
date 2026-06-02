import axios from "axios";
import type { IncomingMessage, ServerResponse } from "http";
import { sendJSON, readBody, startSSE, sendSSE } from "../utils.js";
import { batchExtractDirectUrls, batchUploadToImx, createGalleryWithName, uploadToImx, getImxDirectUrl, downloadFile } from "../../core/imx.js";
import { uploadToPaste } from "../../core/uploader.js";
import { sendTelegramLog, formatImxLog } from "../../core/telegram.js";

export async function handleImxExtract(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readBody(req);
  let parsed: { text?: string };
  try { parsed = JSON.parse(body); }
  catch { return sendJSON(res, 400, { error: "Invalid JSON" }); }

  const imxLinks = (parsed.text || "").match(/https?:\/\/imx\.to\/i\/[a-zA-Z0-9]+/g);
  if (!imxLinks?.length) return sendJSON(res, 400, { error: "No valid imx.to links found" });

  const { directUrls, failed } = await batchExtractDirectUrls(imxLinks);
  if (!directUrls.length) return sendJSON(res, 200, { ok: false, error: "Could not extract any direct URLs", total: imxLinks.length });

  let result = await uploadToPaste(directUrls.join("\n"), 7);
  if (!result.success) result = await uploadToPaste(directUrls.join("\n"), 7);

  sendJSON(res, 200, { ok: result.success, total: imxLinks.length, extracted: directUrls.length, failed, previewUrls: directUrls.slice(0, 5), pasteUrl: result.success ? result.url : null, pasteError: result.success ? null : result.error });
}

export async function handleImxUpload(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let pbUrl: string;
  let useStream: boolean;
  let galleryName: string | null;

  if (req.method === 'GET') {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    pbUrl = (url.searchParams.get('url') || '').trim();
    useStream = url.searchParams.get('stream') === 'true';
    galleryName = (url.searchParams.get('galleryName') || '').trim() || null;
  } else {
    const body = await readBody(req);
    let parsed: { url?: string; stream?: boolean; galleryName?: string };
    try { parsed = JSON.parse(body); }
    catch { return sendJSON(res, 400, { error: "Invalid JSON" }); }
    pbUrl = (parsed.url || "").trim();
    useStream = !!parsed.stream;
    galleryName = (parsed.galleryName || "").trim() || null;
  }

  if (!pbUrl) return sendJSON(res, 400, { error: "Missing paste URL" });

  let pasteData: string;
  try {
    const resp = await axios.get(pbUrl, { timeout: 30000 });
    pasteData = resp.data;
  } catch (e) {
    if (useStream) {
      startSSE(res);
      sendSSE(res, "error", { error: `Failed to fetch paste: ${(e as Error).message}` });
      return res.end();
    }
    return sendJSON(res, 400, { error: `Failed to fetch paste: ${(e as Error).message}` });
  }

  const imageUrls = String(pasteData).split("\n").map((l) => l.trim()).filter((l) => l && /\.(jpg|jpeg|png|gif|webp|bmp)(\?|$)/i.test(l));
  if (!imageUrls.length) {
    if (useStream) {
      startSSE(res);
      sendSSE(res, "error", { error: "No image URLs found in the paste" });
      return res.end();
    }
    return sendJSON(res, 400, { error: "No image URLs found in the paste" });
  }

  if (useStream) {
    startSSE(res);
    sendSSE(res, "phase", { phase: "Uploading to IMX", total: imageUrls.length });
  }

  const onUploadProgress = useStream
    ? (done: number, total: number, success: number, fail: number, galleryId: string | null) => {
        sendSSE(res, "progress", { done, total, success, fail, galleryId });
      }
    : null;

  const { results, galleryId } = await batchUploadToImx(imageUrls, onUploadProgress, 15, galleryName);
  const successResults = results.filter((r) => r.imx_url);

  if (!successResults.length) {
    const result = { ok: false, error: "All uploads failed", total: imageUrls.length };
    if (useStream) {
      sendSSE(res, "done", result);
      return res.end();
    }
    return sendJSON(res, 200, result);
  }

  if (useStream) sendSSE(res, "phase", { phase: "Extracting direct URLs" });

  const { directUrls } = await batchExtractDirectUrls(successResults.map((r) => r.imx_url!), null, 25);

  if (useStream) sendSSE(res, "phase", { phase: "Creating paste" });

  let pbResult = await uploadToPaste(directUrls.join("\n"), 7);
  if (!pbResult.success) pbResult = await uploadToPaste(directUrls.join("\n"), 7);

  const finalResult = {
    ok: pbResult.success,
    total: imageUrls.length,
    uploaded: successResults.length,
    failed: results.filter((r) => r.error).length,
    extracted: directUrls.length,
    galleryUrl: galleryId ? `https://imx.to/g/${galleryId}` : null,
    previewUrls: directUrls.slice(0, 5),
    pasteUrl: pbResult.success ? pbResult.url : null,
    pasteError: pbResult.success ? null : pbResult.error,
  };

  // Send Telegram log (fire-and-forget)
  sendTelegramLog(formatImxLog({
    total: finalResult.total,
    uploaded: finalResult.uploaded,
    failed: finalResult.failed,
    extracted: finalResult.extracted,
    galleryUrl: finalResult.galleryUrl,
    pasteUrl: finalResult.pasteUrl,
    galleryName,
  })).catch(() => {});

  if (useStream) {
    sendSSE(res, "done", finalResult);
    return res.end();
  }
  sendJSON(res, 200, finalResult);
}

export async function handleImxUploadSingle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readBody(req);
  let parsed: { file?: string; url?: string; filename?: string; galleryName?: string };
  try { parsed = JSON.parse(body); }
  catch { return sendJSON(res, 400, { error: "Invalid JSON" }); }

  const { file, url, filename, galleryName } = parsed;
  if (!file && !url) return sendJSON(res, 400, { error: "Missing file data or URL" });

  try {
    let imageBuffer: Buffer;
    let finalFilename = filename || "upload.jpg";

    if (file) {
      const b64Data = file.replace(/^data:image\/\w+;base64,/, "");
      imageBuffer = Buffer.from(b64Data, "base64");
    } else {
      imageBuffer = await downloadFile(url!);
      const extMatch = url!.match(/\.([a-zA-Z0-9]+)(?:[\?#]|$)/);
      if (extMatch) finalFilename = `upload.${extMatch[1]}`;
    }

    let galleryId = null;
    if (galleryName) {
      try {
        galleryId = await createGalleryWithName(galleryName);
      } catch (e) {
        console.error("[IMX] Failed to create gallery:", (e as Error).message);
      }
    }
    const imxResult = await uploadToImx(imageBuffer, finalFilename, galleryId);
    
    // We get imx_url but maybe it's not direct link
    // let's try to get direct url if possible
    let directUrl = imxResult.image_url;
    try {
      const extracted = await getImxDirectUrl(imxResult.image_url);
      if (extracted) directUrl = extracted;
    } catch { /* ignore */ }

    const finalResult = {
      ok: true,
      total: 1,
      uploaded: 1,
      failed: 0,
      extracted: 1,
      galleryUrl: imxResult.gallery_id ? `https://imx.to/g/${imxResult.gallery_id}` : null,
      previewUrls: [directUrl],
      directUrls: [directUrl],
      pasteUrl: null,
      pasteError: null
    };

    sendTelegramLog(formatImxLog({
      total: 1,
      uploaded: 1,
      failed: 0,
      extracted: 1,
      galleryUrl: finalResult.galleryUrl,
      pasteUrl: null,
      galleryName,
    })).catch(() => {});

    sendJSON(res, 200, finalResult);
  } catch (e) {
    sendJSON(res, 500, { ok: false, error: (e as Error).message });
  }
}
