/**
 * Viper Local Extractor - Background Service Worker
 * Executes fetches from the client's residential IP network.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function cleanThumb(src) {
  return src.replace(/(\.|_)(md|th|tn|thumbnail|preview)(\.|_)/gi, "$1$3");
}

function extractOgImage(html) {
  const ogMatch = html.match(
    /<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+)["']/i
  ) || html.match(
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image["']/i
  );
  return ogMatch ? ogMatch[1] : null;
}

async function extractViprIm(url) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Referer: "https://vipr.im/",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();

    // 1. Check img.pic
    let match =
      html.match(/<img[^>]+class=["'][^"']*pic[^"']*["'][^>]+src=["']([^"']+)["']/i) ||
      html.match(/<img[^>]+src=["']([^"']+)["'][^>]+class=["'][^"']*pic/i);
    if (match && match[1]) return match[1];

    // 2. Scan all img tags for vipr.im image files
    const imgMatches = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)];
    for (const m of imgMatches) {
      const src = m[1];
      if (src && src.includes("vipr.im") && /\.(jpg|jpeg|png|gif|webp)$/i.test(src)) {
        return src;
      }
    }

    // 3. Fallback to OpenGraph
    return extractOgImage(html);
  } catch (err) {
    console.error("[Viper Extension] Error extracting vipr.im:", err);
    return null;
  }
}

async function extractPostimg(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const html = await res.text();
    const match =
      html.match(/<img[^>]+(?:id|class)=["'][^"']*main-image[^"']*["'][^>]+src=["']([^"']+)["']/i) ||
      html.match(/<img[^>]+src=["']([^"']+)["'][^>]+(?:id|class)=["'][^"']*main-image/i);
    if (match && match[1]) return match[1];
    return extractOgImage(html);
  } catch {
    return null;
  }
}

async function extractImgbox(url) {
  try {
    if (/\.(jpg|jpeg|png|gif|webp)$/i.test(url)) return url;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const html = await res.text();
    const match =
      html.match(/<img[^>]+id=["']img["'][^>]+src=["']([^"']+)["']/i) ||
      html.match(/<img[^>]+src=["']([^"']+)["'][^>]+id=["']img["']/i);
    if (match && match[1]) return match[1];
    return extractOgImage(html);
  } catch {
    return null;
  }
}

async function extractPixhost(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const html = await res.text();

    const imgMatch =
      html.match(/<img[^>]+(?:id=["'](?:image|show_image)["']|class=["'][^"']*image-center)[^>]+src=["']([^"']+)["']/i) ||
      html.match(/<img[^>]+src=["']([^"']+)["'][^>]+(?:id=["'](?:image|show_image)["']|class=["'][^"']*image-center)/i);

    if (imgMatch && imgMatch[1]) {
      let src = imgMatch[1];
      if (src.includes("/thumbs/")) {
        src = src.replace("//t", "//img").replace("/thumbs/", "/images/");
      }
      return src;
    }

    if (html.includes("pswp_items")) {
      const urls = [...html.matchAll(/https?:\/\/[^\s"']+\.(?:jpg|jpeg|png|webp)/gi)].map((m) => m[0]);
      const nonThumb = urls.filter((u) => !/\/thumbs\/|\/show\//.test(u));
      const urlFilename = url.split("/").pop()?.replace(/\.\w+$/, "") || "";
      if (urlFilename) {
        const found = nonThumb.find((u) => u.includes(urlFilename));
        if (found) return found;
      }
      if (nonThumb.length === 1) return nonThumb[0];
    }

    return extractOgImage(html);
  } catch {
    return null;
  }
}

async function extractGeneric(url) {
  try {
    if (/\.(jpg|jpeg|png|gif|webp)$/i.test(url)) return url;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const html = await res.text();
    return extractOgImage(html);
  } catch {
    return null;
  }
}

async function extractDirectUrl(url) {
  if (!url) return null;
  const lower = url.toLowerCase();
  if (lower.includes("vipr.im")) return extractViprIm(url);
  if (lower.includes("postimg.cc") || lower.includes("postimg.org")) return extractPostimg(url);
  if (lower.includes("imgbox.com")) return extractImgbox(url);
  if (lower.includes("pixhost.cc")) return extractPixhost(url);
  return extractGeneric(url);
}

// Concurrency pool helper
async function pool(items, concurrency, fn) {
  const results = [];
  const executing = new Set();
  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item));
    results.push(p);
    executing.add(p);
    const clean = () => executing.delete(p);
    p.then(clean).catch(clean);
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

// Listen for messages from content.js or popup.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "resolve_urls") {
    (async () => {
      try {
        const links = message.links || [];
        const indexedFailedLinks = message.indexedFailedLinks || [];
        const resolvedLinks = {};
        const resolvedIndexed = [];

        if (indexedFailedLinks && indexedFailedLinks.length > 0) {
          await pool(indexedFailedLinks, 4, async (item) => {
            const direct = await extractDirectUrl(item.link);
            if (direct) {
              resolvedIndexed.push({
                index: item.index,
                link: item.link,
                directUrl: direct,
              });
              resolvedLinks[item.link] = direct;
            }
          });
        } else {
          await pool(links, 4, async (link, idx) => {
            const direct = await extractDirectUrl(link);
            if (direct) {
              resolvedIndexed.push({
                index: idx,
                link,
                directUrl: direct,
              });
              resolvedLinks[link] = direct;
            }
          });
        }

        sendResponse({
          success: true,
          resolvedLinks,
          resolvedIndexed,
          recoveredCount: resolvedIndexed.length,
        });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // Keep message port open for async response
  }

  if (message.action === "extract_single") {
    (async () => {
      try {
        const direct = await extractDirectUrl(message.url);
        sendResponse({ success: true, directUrl: direct });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
});
