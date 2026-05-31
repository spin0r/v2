import axios from "axios";
import type { IncomingMessage, ServerResponse } from "http";
import { sendJSON, readBody, startSSE, sendSSE } from "../utils.js";
import { batchExtractDirectUrls, batchUploadToImx } from "../../core/imx.js";
import { uploadToPaste } from "../../core/uploader.js";

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
  const body = await readBody(req);
  let parsed: { url?: string; stream?: boolean };
  try { parsed = JSON.parse(body); }
  catch { return sendJSON(res, 400, { error: "Invalid JSON" }); }

  const pbUrl = (parsed.url || "").trim();
  if (!pbUrl) return sendJSON(res, 400, { error: "Missing paste URL" });

  const useStream = !!parsed.stream;

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

  const { results, galleryId } = await batchUploadToImx(imageUrls, onUploadProgress);
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

  if (useStream) {
    sendSSE(res, "done", finalResult);
    return res.end();
  }
  sendJSON(res, 200, finalResult);
}
