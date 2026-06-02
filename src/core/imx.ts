import axios from "axios";
import FormData from "form-data";

const IMX_API_KEY = process.env.IMX_API_KEY || "";
const IMX_USERNAME = process.env.IMX_USERNAME || "";
const IMX_PASSWORD = process.env.IMX_PASSWORD || "";
const IMX_UPLOAD_URL = "https://api.imx.to/v1/upload.php";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

let cachedCookies: string | null = null;

async function loginToImx(): Promise<string> {
  if (!IMX_USERNAME || !IMX_PASSWORD) {
    throw new Error("IMX_USERNAME and IMX_PASSWORD must be set in .env");
  }

  const res = await axios.post(
    "https://imx.to/login.php",
    new URLSearchParams({
      usr_email: IMX_USERNAME,
      pwd: IMX_PASSWORD,
      remember: "1",
      doLogin: "Login",
    }),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      maxRedirects: 0,
      validateStatus: (status) => status === 302,
    }
  );

  const setCookies = res.headers["set-cookie"] || [];
  const cookies: Record<string, string> = {};

  for (const cookie of setCookies) {
    const match = cookie.match(/^([^=]+)=([^;]+)/);
    if (match) cookies[match[1]] = match[2];
  }

  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
}

export async function createGalleryWithName(galleryName: string): Promise<string> {
  if (!cachedCookies) {
    cachedCookies = await loginToImx();
  }

  const res = await axios.post(
    "https://imx.to/user/gallery/add",
    new URLSearchParams({
      gallery_name: galleryName,
      submit_new_gallery: "Add",
    }),
    {
      headers: {
        Cookie: cachedCookies,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      maxRedirects: 0,
      validateStatus: (status) => status === 302,
    }
  );

  const location = res.headers.location;
  if (!location || location.includes("login")) {
    cachedCookies = null;
    throw new Error("Gallery creation failed - session expired");
  }

  const match = location.match(/id=([^&]+)/);
  if (!match) throw new Error("Could not extract gallery ID");

  return match[1];
}

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
  if (galleryId) {
    form.append("gallery_id", galleryId);
  } else {
    form.append("create_gallery", "true");
  }
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
  let doneCount = 0;
  let foundCount = 0;
  for (let i = 0; i < imxLinks.length; i += batchSize) {
    const batch = imxLinks.slice(i, i + batchSize);
    const batchUrls = await Promise.all(
      batch.map(async (url) => {
        let res: string | null = null;
        try { 
          res = await getImxDirectUrl(url); 
        } catch (e) { 
          console.error(`[IMX] Failed to process ${url}:`, (e as Error).message); 
        }
        doneCount++;
        if (res) {
          foundCount++;
        }
        if (onProgress) onProgress(doneCount, imxLinks.length, foundCount);
        return res;
      }),
    );
    batchUrls.forEach((url) => { if (url) directUrls.push(url); else failed++; });
  }
  return { directUrls, failed };
}

export async function batchUploadToImx(
  imageUrls: string[],
  onProgress: ((done: number, total: number, success: number, fail: number, galleryId: string | null) => void) | null = null,
  batchSize = 15,
  galleryName: string | null = null,
): Promise<{ results: ImxUploadResult[]; galleryId: string | null }> {
  const results: ImxUploadResult[] = [];
  let galleryId: string | null = null;

  // Create gallery with custom name if provided
  if (galleryName) {
    try {
      galleryId = await createGalleryWithName(galleryName);
    } catch (e) {
      console.error("[IMX] Failed to create gallery with name:", (e as Error).message);
    }
  }

  if (imageUrls.length > 0) {
    try {
      const imageBuffer = await downloadFile(imageUrls[0].trim());
      const imxResult = await uploadToImx(imageBuffer, "image_1.jpg", galleryId);
      if (!galleryId) galleryId = imxResult.gallery_id;
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

  let doneCount = imageUrls.length > 0 ? 1 : 0;
  let successCount = results.filter((r) => r.imx_url).length;
  let failCount = results.filter((r) => r.error).length;

  const remaining = imageUrls.slice(1).map((url, i) => ({ url: url.trim(), index: i + 1 }));
  for (let i = 0; i < remaining.length; i += batchSize) {
    const batch = remaining.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async ({ url, index }) => {
        let res: ImxUploadResult;
        try {
          const imageBuffer = await downloadFile(url);
          const imxResult = await uploadToImx(imageBuffer, `image_${index + 1}.jpg`, galleryId);
          res = { index, imx_url: imxResult.image_url, thumbnail: imxResult.thumbnail_url, gallery_id: imxResult.gallery_id };
          successCount++;
        } catch (e) {
          res = { index, error: (e as Error).message };
          failCount++;
        }
        doneCount++;
        if (onProgress) {
          onProgress(doneCount, imageUrls.length, successCount, failCount, galleryId);
        }
        return res;
      }),
    );
    results.push(...batchResults);
  }

  results.sort((a, b) => a.index - b.index);
  return { results, galleryId };
}
