"use strict";

const axios = require("axios");
const FormData = require("form-data");

const IMX_API_KEY = process.env.IMX_API_KEY || "";
const IMX_UPLOAD_URL = "https://api.imx.to/v1/upload.php";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

// ------------------------------------------------------------------ //
//  Download a file from URL, following redirects
// ------------------------------------------------------------------ //
async function downloadFile(url) {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    maxRedirects: 5,
    timeout: 60000,
    headers: { "User-Agent": UA },
  });
  return Buffer.from(res.data);
}

// ------------------------------------------------------------------ //
//  Extract direct image URL from an imx.to viewer page
// ------------------------------------------------------------------ //
async function getImxDirectUrl(imxUrl) {
  try {
    // Step 1: Fetch the page
    const { data } = await axios.get(imxUrl, {
      headers: { "User-Agent": UA },
      timeout: 30000,
    });

    // Step 2: Try to find direct image
    // Method 1: img#iimg (main image)
    let match = data.match(
      /<img[^>]+id=["']iimg["'][^>]+src=["']([^"']+)["']/i,
    );
    if (match) return match[1];

    // Method 2: img.centred (alternative)
    match = data.match(
      /<img[^>]+class=["'][^"']*centred[^"']*["'][^>]+src=["']([^"']+)["']/i,
    );
    if (match) return match[1];

    // Step 3: Handle age gate form (if present)
    const continueMatch = data.match(
      /<input[^>]+name=["']imgContinue["'][^>]*>/i,
    );
    if (continueMatch) {
      // Find form action
      const formMatch = data.match(
        /<form[^>]+action=["']([^"']+)["'][^>]*>[\s\S]*?imgContinue[\s\S]*?<\/form>/i,
      );
      let formUrl = imxUrl;
      if (formMatch && formMatch[1]) {
        formUrl = formMatch[1].startsWith("http")
          ? formMatch[1]
          : `https://imx.to${formMatch[1]}`;
      }

      // Collect all form inputs
      const formData = [];
      const inputRegex =
        /<input[^>]+name=["']([^"']+)["'][^>]*(?:value=["']([^"']*)["'])?[^>]*>/gi;
      let inputMatch;
      while ((inputMatch = inputRegex.exec(data)) !== null) {
        const name = inputMatch[1];
        const value = inputMatch[2] || "";
        formData.push(
          `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
        );
      }

      // Submit the form
      const formBody = formData.join("&");
      const formResponse = await axios.post(formUrl, formBody, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": UA,
          Referer: imxUrl,
        },
        timeout: 30000,
      });

      const responseData = formResponse.data;

      match = responseData.match(
        /<img[^>]+id=["']iimg["'][^>]+src=["']([^"']+)["']/i,
      );
      if (match) return match[1];

      match = responseData.match(
        /<img[^>]+class=["'][^"']*centred[^"']*["'][^>]+src=["']([^"']+)["']/i,
      );
      if (match) return match[1];
    }

    // Step 4: Fallback methods
    // Try img#image
    match = data.match(/<img[^>]+id=["']image["'][^>]+src=["']([^"']+)["']/i);
    if (match) return match[1];

    // Try og:image meta tag
    match = data.match(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    );
    if (match) return match[1];

    return null;
  } catch (error) {
    console.error(
      `[IMX] Failed to extract direct URL from ${imxUrl}:`,
      error.message,
    );
    return null;
  }
}

// ------------------------------------------------------------------ //
//  Upload image buffer to imx.to
// ------------------------------------------------------------------ //
async function uploadToImx(imageBuffer, filename, galleryId = null) {
  if (!IMX_API_KEY) {
    throw new Error("IMX_API_KEY not set in environment variables");
  }

  const form = new FormData();
  form.append("image", imageBuffer, {
    filename,
    contentType: "application/octet-stream",
  });

  if (galleryId) {
    form.append("gallery_id", galleryId);
  } else {
    form.append("create_gallery", "true");
  }

  const res = await axios.post(IMX_UPLOAD_URL, form, {
    headers: {
      ...form.getHeaders(),
      "X-API-Key": IMX_API_KEY,
    },
    timeout: 120000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  if (res.data.status === "success") return res.data.data;
  throw new Error(res.data.message || JSON.stringify(res.data));
}

// ------------------------------------------------------------------ //
//  Batch-extract direct URLs from imx.to viewer pages
//  Returns { directUrls, failed }
//  onProgress(done, total, found) is called after each batch
// ------------------------------------------------------------------ //
async function batchExtractDirectUrls(
  imxLinks,
  onProgress = null,
  batchSize = 15,
) {
  const directUrls = [];
  let failed = 0;

  for (let i = 0; i < imxLinks.length; i += batchSize) {
    const batch = imxLinks.slice(i, i + batchSize);
    const batchUrls = await Promise.all(
      batch.map(async (imxUrl) => {
        try {
          return await getImxDirectUrl(imxUrl);
        } catch (error) {
          console.error(`[IMX] Failed to process ${imxUrl}:`, error.message);
          return null;
        }
      }),
    );

    batchUrls.forEach((url) => {
      if (url) directUrls.push(url);
      else failed++;
    });

    if (onProgress) {
      onProgress(
        Math.min(i + batchSize, imxLinks.length),
        imxLinks.length,
        directUrls.length,
      );
    }
  }

  return { directUrls, failed };
}

// ------------------------------------------------------------------ //
//  Batch-upload image URLs to imx.to (downloads then uploads)
//  First image creates a gallery, remaining images join it.
//  Returns { results, galleryId }
//  onProgress(done, total, success, fail, galleryId)
// ------------------------------------------------------------------ //
async function batchUploadToImx(imageUrls, onProgress = null, batchSize = 15) {
  const results = [];
  let galleryId = null;

  // Upload first image separately to create gallery
  if (imageUrls.length > 0) {
    try {
      const firstUrl = imageUrls[0].trim();
      const imageBuffer = await downloadFile(firstUrl);
      const filename = "image_1.jpg";

      const imxResult = await uploadToImx(imageBuffer, filename, null);
      galleryId = imxResult.gallery_id;

      results.push({
        index: 0,
        imx_url: imxResult.image_url,
        thumbnail: imxResult.thumbnail_url,
        gallery_id: imxResult.gallery_id,
      });
    } catch (error) {
      results.push({ index: 0, error: error.message });
    }

    if (onProgress) {
      const s = results.filter((r) => r.imx_url).length;
      const f = results.filter((r) => r.error).length;
      onProgress(1, imageUrls.length, s, f, galleryId);
    }
  }

  // Process remaining images in concurrent batches
  const remainingUrls = imageUrls.slice(1).map((url, index) => ({
    url: url.trim(),
    index: index + 1,
  }));

  for (let i = 0; i < remainingUrls.length; i += batchSize) {
    const batch = remainingUrls.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async ({ url, index }) => {
        try {
          const imageBuffer = await downloadFile(url);
          const filename = `image_${index + 1}.jpg`;
          const imxResult = await uploadToImx(imageBuffer, filename, galleryId);

          return {
            index,
            imx_url: imxResult.image_url,
            thumbnail: imxResult.thumbnail_url,
            gallery_id: imxResult.gallery_id,
          };
        } catch (error) {
          return { index, error: error.message };
        }
      }),
    );

    results.push(...batchResults);

    if (onProgress) {
      const s = results.filter((r) => r.imx_url).length;
      const f = results.filter((r) => r.error).length;
      onProgress(
        Math.min(i + batchSize + 1, imageUrls.length),
        imageUrls.length,
        s,
        f,
        galleryId,
      );
    }
  }

  // Sort results by index to preserve order
  results.sort((a, b) => a.index - b.index);

  return { results, galleryId };
}

module.exports = {
  downloadFile,
  getImxDirectUrl,
  uploadToImx,
  batchExtractDirectUrls,
  batchUploadToImx,
};
