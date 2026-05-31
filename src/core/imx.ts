import axios from "axios";
import FormData from "form-data";

const IMX_API_KEY = process.env.IMX_API_KEY || "";
const IMX_UPLOAD_URL = "https://api.imx.to/v1/upload.php";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

export interface ImxUploadData {
  image_url: string;
  thumbnail_url: string;
  gallery_id: string;
}

export interface ImxUploadResult {
  index: number;
  imx_url?: string;
  thumbnail?: string;
  gallery_id?: string;
  error?: string;
}

function detectContentType(filename: string): string {
  const ext = filename.replace(/\?.*$/, "").split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", bmp: "image/bmp" };
  return map[ext] || "image/jpeg";
}

export async function downloadFile(url: string): Promise<Buffer> {
  const headers: Record<string, string> = { "User-Agent": UA };
  // Set Referer for CDN sources that require it
  try {
    const u = new URL(url);
    headers["Referer"] = `${u.protocol}//${u.hostname}/`;
  } catch { /* ignore */ }
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    maxRedirects: 5,
    timeout: 60000,
    headers,
  });
  return Buffer.from(res.data);
}

export async function getImxDirectUrl(imxUrl: string): Promise<string | null> {
  try {
    const { data } = await axios.get(imxUrl, {
      headers: { "User-Agent": UA },
      timeout: 30000,
    });

    let match = data.match(/<img[^>]+id=["']iimg["'][^>]+src=["']([^"']+)["']/i);
    if (match) return match[1];

    match = data.match(/<img[^>]+class=["'][^"']*centred[^"']*["'][^>]+src=["']([^"']+)["']/i);
    if (match) return match[1];

    if (/<input[^>]+name=["']imgContinue["'][^>]*>/i.test(data)) {
      const formMatch = data.match(
        /<form[^>]+action=["']([^"']+)["'][^>]*>[\s\S]*?imgContinue[\s\S]*?<\/form>/i,
      );
      let formUrl = imxUrl;
      if (formMatch?.[1]) {
        formUrl = formMatch[1].startsWith("http")
          ? formMatch[1]
          : `https://imx.to${formMatch[1]}`;
      }
      const formData: string[] = [];
      const inputRegex = /<input[^>]+name=["']([^"']+)["'][^>]*(?:value=["']([^"']*)["'])?[^>]*>/gi;
      let inputMatch;
      while ((inputMatch = inputRegex.exec(data)) !== null) {
        formData.push(`${encodeURIComponent(inputMatch[1])}=${encodeURIComponent(inputMatch[2] || "")}`);
      }
      const formResponse = await axios.post(formUrl, formData.join("&"), {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": UA,
          Referer: imxUrl,
        },
        timeout: 30000,
      });
      const rd = formResponse.data;
      match = rd.match(/<img[^>]+id=["']iimg["'][^>]+src=["']([^"']+)["']/i);
      if (match) return match[1];
      match = rd.match(/<img[^>]+class=["'][^"']*centred[^"']*["'][^>]+src=["']([^"']+)["']/i);
      if (match) return match[1];
    }

    match = data.match(/<img[^>]+id=["']image["'][^>]+src=["']([^"']+)["']/i);
    if (match) return match[1];
    match = data.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (match) return match[1];
    return null;
  } catch (error) {
    console.error(`[IMX] Failed to extract direct URL from ${imxUrl}:`, (error as Error).message);
    return null;
  }
}

export async function uploadToImx(
  imageBuffer: Buffer,
  filename: string,
  galleryId: string | null = null,
): Promise<ImxUploadData> {
  if (!IMX_API_KEY) throw new Error("IMX_API_KEY not set in environment variables");
  const form = new FormData();
  form.append("image", imageBuffer, { filename, contentType: detectContentType(filename) });
  if (galleryId) form.append("gallery_id", galleryId);
  else form.append("create_gallery", "true");
  const res = await axios.post(IMX_UPLOAD_URL, form, {
    headers: { ...form.getHeaders(), "X-API-Key": IMX_API_KEY },
    timeout: 120000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });
  if (res.data.status === "success") return res.data.data;
  throw new Error(res.data.message || JSON.stringify(res.data));
}

export async function batchExtractDirectUrls(
  imxLinks: string[],
  onProgress: ((done: number, total: number, found: number) => void) | null = null,
  batchSize = 15,
): Promise<{ directUrls: string[]; failed: number }> {
  const directUrls: string[] = [];
  let failed = 0;
  for (let i = 0; i < imxLinks.length; i += batchSize) {
    const batch = imxLinks.slice(i, i + batchSize);
    const batchUrls = await Promise.all(
      batch.map(async (url) => {
        try { return await getImxDirectUrl(url); }
        catch (e) { console.error(`[IMX] Failed to process ${url}:`, (e as Error).message); return null; }
      }),
    );
    batchUrls.forEach((url) => { if (url) directUrls.push(url); else failed++; });
    if (onProgress) onProgress(Math.min(i + batchSize, imxLinks.length), imxLinks.length, directUrls.length);
  }
  return { directUrls, failed };
}

export async function batchUploadToImx(
  imageUrls: string[],
  onProgress: ((done: number, total: number, success: number, fail: number, galleryId: string | null) => void) | null = null,
  batchSize = 15,
): Promise<{ results: ImxUploadResult[]; galleryId: string | null }> {
  const results: ImxUploadResult[] = [];
  let galleryId: string | null = null;

  if (imageUrls.length > 0) {
    try {
      const imageBuffer = await downloadFile(imageUrls[0].trim());
      const imxResult = await uploadToImx(imageBuffer, "image_1.jpg", null);
      galleryId = imxResult.gallery_id;
      results.push({ index: 0, imx_url: imxResult.image_url, thumbnail: imxResult.thumbnail_url, gallery_id: imxResult.gallery_id });
    } catch (e) {
      results.push({ index: 0, error: (e as Error).message });
    }
    if (onProgress) {
      const s = results.filter((r) => r.imx_url).length;
      const f = results.filter((r) => r.error).length;
      onProgress(1, imageUrls.length, s, f, galleryId);
    }
  }

  const remaining = imageUrls.slice(1).map((url, i) => ({ url: url.trim(), index: i + 1 }));
  for (let i = 0; i < remaining.length; i += batchSize) {
    const batch = remaining.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async ({ url, index }) => {
        try {
          const imageBuffer = await downloadFile(url);
          const imxResult = await uploadToImx(imageBuffer, `image_${index + 1}.jpg`, galleryId);
          return { index, imx_url: imxResult.image_url, thumbnail: imxResult.thumbnail_url, gallery_id: imxResult.gallery_id };
        } catch (e) {
          return { index, error: (e as Error).message };
        }
      }),
    );
    results.push(...batchResults);
    if (onProgress) {
      const s = results.filter((r) => r.imx_url).length;
      const f = results.filter((r) => r.error).length;
      onProgress(Math.min(i + batchSize + 1, imageUrls.length), imageUrls.length, s, f, galleryId);
    }
  }

  results.sort((a, b) => a.index - b.index);
  return { results, galleryId };
}
