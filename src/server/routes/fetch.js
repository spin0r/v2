"use strict";

const {
  ViperGirlsDownloader,
  AdultPhotoSetsScraper,
} = require("../../core/scraper");
const { IMAGE_HOSTS } = require("../../core/hosts");
const { ImageHostExtractor } = require("../../core/extractor");
const { uploadToPaste } = require("../../core/uploader");
const {
  md5,
  vgCache,
  apsCache,
  threadCache,
  sendJSON,
  startSSE,
  sendSSE,
  readBody,
  addToHistory,
  extractAndUpload,
  PAGE_SIZE,
} = require("../utils");

// Derive a search query from a thread URL slug
function slugToQuery(url) {
  const STOP_WORDS = new Set(['galleries', 'gallery', 'thread', 'threads', 'collection',
    'sets', 'set', 'pics', 'images', 'photos', 'pack', 'mega', 'vol', 'part']);
  const slugMatch = url.match(/\/threads\/([^/\?]+)/i) ||
                    url.match(/\/([^/]+)\/?$/);
  if (!slugMatch) return null;
  const slug = slugMatch[1];
  const parts = slug.split('-').filter(p => p && !/^\d+$/.test(p));
  const words = parts.filter(p => !STOP_WORDS.has(p.toLowerCase()));
  return words.length ? words.join(' ') : null;
}

// ── VG SCRAPE (scrape thread → return post list, no extraction) ──
async function handleVgScrape(params, res) {
  const id = params.get("id") || "";
  const query = params.get("q") || "";
  if (!id) return sendJSON(res, 400, { error: "Missing id" });

  let found = null;
  for (const results of vgCache.values()) {
    found = results.find(r => r.sgenId === id);
    if (found) break;
  }
  if (!found) return sendJSON(res, 404, { error: "ID not found – run search first" });

  const downloader = new ViperGirlsDownloader();
  const [pagesData, totalPages] = await downloader.scrapeThread(found.url);
  const title = found.title || pagesData[0]?.posts[0]?.title || found.url;
  const threadId = md5(found.url).slice(0, 8);

  const threadData = { url: found.url, title, searchQuery: query || null, pages: pagesData, totalPages, type: 'vg' };
  threadCache.set(threadId, threadData);

  sendJSON(res, 200, { ok: true, threadId, threadData });
}

// ── VG FETCH (scrape thread + extract + upload) ──
async function handleVgFetch(params, res) {
  const id = params.get("id") || "";
  const query = params.get("q") || "";
  const stream = params.get("stream") === "1";
  if (!id) return sendJSON(res, 400, { error: "Missing id" });

  let found = null;
  for (const results of vgCache.values()) {
    found = results.find(r => r.sgenId === id);
    if (found) break;
  }
  if (!found) return sendJSON(res, 404, { error: "ID not found – run search first" });

  if (stream) {
    startSSE(res);
    sendSSE(res, 'phase', { phase: 'scraping' });
  }

  const downloader = new ViperGirlsDownloader();
  const [pagesData] = await downloader.scrapeThread(found.url);
  const allLinks = pagesData.flatMap(p => p.posts.flatMap(q => q.links));

  if (stream) {
    sendSSE(res, 'phase', { phase: 'extracting', total: allLinks.length });
  }

  const onProgress = stream ? (p) => sendSSE(res, 'progress', p) : null;
  const result = await extractAndUpload(allLinks, found.title, found.url, query || null, onProgress);
  if (result.ok) addToHistory(result);

  if (stream) {
    sendSSE(res, 'done', result);
    res.end();
  } else {
    sendJSON(res, 200, result);
  }
}

// ── APS FETCH (get post links + extract + upload) ──
async function handleApsFetch(params, res) {
  const id = params.get("id") || "";
  const query = params.get("q") || "";
  const stream = params.get("stream") === "1";
  if (!id) return sendJSON(res, 400, { error: "Missing id" });

  let found = null;
  for (const results of apsCache.values()) {
    found = results.find(r => r.apsId === id);
    if (found) break;
  }
  if (!found) return sendJSON(res, 404, { error: "ID not found – run search first" });

  if (stream) {
    startSSE(res);
    sendSSE(res, 'phase', { phase: 'scraping' });
  }

  const scraper = new AdultPhotoSetsScraper();
  const links = await scraper.getPostLinks(found.url);

  if (stream) {
    sendSSE(res, 'phase', { phase: 'extracting', total: links.length });
  }

  const onProgress = stream ? (p) => sendSSE(res, 'progress', p) : null;
  const result = await extractAndUpload(links, found.title, found.url, query || null, onProgress);
  if (result.ok) addToHistory(result);

  if (stream) {
    sendSSE(res, 'done', result);
    res.end();
  } else {
    sendJSON(res, 200, result);
  }
}

// ── DIRECT URL FETCH (paste a thread URL → scrape + return structure) ──
async function handleDirectFetch(params, res) {
  const url = params.get("url") || "";
  if (!url) return sendJSON(res, 400, { error: "Missing url" });

  try {
    if (url.includes("vipergirls.to") || url.includes("viper.to")) {
      const downloader = new ViperGirlsDownloader();
      const [pagesData, totalPages] = await downloader.scrapeThread(url);
      const title = pagesData[0]?.posts[0]?.title || url;
      const threadId = md5(url).slice(0, 8);

      const threadData = { url, title, searchQuery: null, pages: pagesData, totalPages, type: 'vg' };
      threadCache.set(threadId, threadData);

      return sendJSON(res, 200, { ok: true, threadId, threadData });
    }

    if (url.includes("adultphotosets")) {
      const scraper = new AdultPhotoSetsScraper();
      const links = await scraper.getPostLinks(url);
      const titleMatch = url.match(/\/([^/]+)\/?$/);
      const title = titleMatch ? titleMatch[1].replace(/-/g, ' ') : url;
      const threadId = md5(url).slice(0, 8);

      const threadData = { url, title, searchQuery: null, pages: [{ page_num: 1, posts: [{ title: 'Main Post', links, count: links.length }] }], totalPages: 1, type: 'aps' };
      threadCache.set(threadId, threadData);

      return sendJSON(res, 200, { ok: true, threadId, threadData });
    }

    sendJSON(res, 400, { error: "URL must be from vipergirls.to / viper.to or adultphotosets" });
  } catch (err) {
    console.error("[Direct Fetch Error]", err.message);
    sendJSON(res, 500, { error: err.message });
  }
}

// ── THREAD EXTRACT (extract specific post from cached thread) ──
async function handleThreadExtract(params, res) {
  const threadId = params.get("threadId");
  const gidx = parseInt(params.get("postIndex") || "0");
  const stream = params.get("stream") === "1";
  if (!threadId) return sendJSON(res, 400, { error: "Missing threadId" });

  if (!threadCache.has(threadId)) {
    return sendJSON(res, 404, { error: "Thread not found or expired. Please search again." });
  }

  const threadData = threadCache.get(threadId);
  let post = null;
  let cur = 0;
  for (const page of threadData.pages) {
    for (const p of page.posts) {
      if (cur === gidx) {
        post = p;
        break;
      }
      cur++;
    }
    if (post) break;
  }

  if (!post) return sendJSON(res, 404, { error: "Post not found in thread." });

  const title = post.title || `Post #${gidx + 1}`;

  if (stream) {
    startSSE(res);
    sendSSE(res, 'phase', { phase: 'extracting', total: post.links.length });
  }

  try {
    const onProgress = stream ? (p) => sendSSE(res, 'progress', p) : null;
    const result = await extractAndUpload(post.links, title, threadData.url, threadData.searchQuery || null, onProgress);
    if (result.ok) addToHistory(result);

    if (stream) {
      sendSSE(res, 'done', result);
      res.end();
    } else {
      sendJSON(res, 200, result);
    }
  } catch (err) {
    if (stream) {
      sendSSE(res, 'error', { error: err.message });
      res.end();
    } else {
      sendJSON(res, 500, { error: err.message });
    }
  }
}

// ── RE-EXTRACT (retry only failed links, merge with previous successful URLs preserving positions) ──
async function handleReExtract(req, res) {
  const body = await readBody(req);
  let parsed;
  try { parsed = JSON.parse(body); } catch { return sendJSON(res, 400, { error: "Invalid JSON" }); }

  const { failedLinks, previousUrls, indexedFailedLinks, indexedUrls, title, sourceUrl, searchQuery } = parsed;
  if (!failedLinks || !failedLinks.length) {
    return sendJSON(res, 400, { error: "No failed links to retry" });
  }

  // Use indexed data if available for position-aware merging
  const hasIndexedData = indexedFailedLinks && indexedFailedLinks.length > 0 && indexedUrls;
  const prevUrls = previousUrls || [];
  console.log(`[Re-Extract] Retrying ${failedLinks.length} failed links (${prevUrls.length} previous OK, indexed=${!!hasIndexedData})`);

  const extractor = new ImageHostExtractor();
  extractor.client.defaults.timeout = 25000;
  const RETRY_CONCURRENCY = 3;
  const stillFailed = [];
  const stillFailedIndexed = [];
  const hostCounts = {};
  const failedHostsMap = {};

  // Build the URL map from existing successful extractions (keyed by original index)
  const urlMap = {};
  if (hasIndexedData) {
    for (const [idx, url] of Object.entries(indexedUrls)) {
      urlMap[idx] = url;
    }
  }

  // Process failed links — use indexed entries if available
  const linksToRetry = hasIndexedData ? indexedFailedLinks : failedLinks.map((link, i) => ({ index: prevUrls.length + i, link }));

  const chunks = [];
  for (let i = 0; i < linksToRetry.length; i += RETRY_CONCURRENCY)
    chunks.push(linksToRetry.slice(i, i + RETRY_CONCURRENCY));

  for (const chunk of chunks) {
    const results = await Promise.allSettled(
      chunk.map(entry => {
        const link = typeof entry === 'string' ? entry : entry.link;
        const index = typeof entry === 'string' ? null : entry.index;
        return extractor.extractDirectUrl(link).then(u => {
          const hostMatch = IMAGE_HOSTS.find(h => link.includes(h));
          const hostName = hostMatch ? hostMatch.split(".")[0] : "unknown";
          if (u) {
            if (hostMatch) hostCounts[hostMatch] = (hostCounts[hostMatch] || 0) + 1;
          } else {
            failedHostsMap[hostName] = (failedHostsMap[hostName] || 0) + 1;
            stillFailed.push(link);
            if (index != null) stillFailedIndexed.push({ index, link });
          }
          return { link, u, index };
        }).catch(() => {
          const hostMatch = IMAGE_HOSTS.find(h => link.includes(h));
          const hostName = hostMatch ? hostMatch.split(".")[0] : "unknown";
          failedHostsMap[hostName] = (failedHostsMap[hostName] || 0) + 1;
          stillFailed.push(link);
          if (index != null) stillFailedIndexed.push({ index, link });
          return { link, u: null, index };
        });
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.u) {
        if (r.value.index != null) {
          urlMap[r.value.index] = r.value.u;
        }
      }
    }
  }

  // Build final URL list preserving original positions
  let allUrls;
  let newlyRecovered;
  if (hasIndexedData) {
    allUrls = Object.keys(urlMap)
      .map(Number)
      .sort((a, b) => a - b)
      .map(i => urlMap[i]);
    newlyRecovered = allUrls.length - Object.keys(indexedUrls).length;
  } else {
    // Fallback for old-style calls without indexed data — append at end
    const recoveredUrls = Object.keys(urlMap).map(k => urlMap[k]);
    allUrls = [...prevUrls, ...recoveredUrls];
    newlyRecovered = recoveredUrls.length;
  }

  const totalOriginal = hasIndexedData
    ? Object.keys(indexedUrls).length + (indexedFailedLinks ? indexedFailedLinks.length : failedLinks.length)
    : prevUrls.length + failedLinks.length;

  if (!allUrls.length) {
    return sendJSON(res, 200, {
      ok: false,
      error: "All re-extraction attempts failed",
      title: title || "",
      sourceUrl: sourceUrl || "",
      total: totalOriginal,
      extracted: 0,
      failed: totalOriginal,
      failedLinks: stillFailed,
      indexedFailedLinks: stillFailedIndexed.length > 0 ? stillFailedIndexed : undefined,
      failedHosts: failedHostsMap,
      directUrls: [],
      indexedUrls: undefined,
      pasteUrl: null,
    });
  }

  const content = allUrls.join("\n");
  let result = await uploadToPaste(content, 7, "pb");
  if (!result.success) result = await uploadToPaste(content, 7, "shz");

  const services = Object.entries(hostCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([host, count]) => {
      const shortName = host.split(".")[0];
      return count > 1 ? `${shortName}(${count})` : shortName;
    })
    .join(", ");

  let hashtag = "";
  if (searchQuery) {
    hashtag = "#" + searchQuery.toLowerCase().replace(/\s+/g, "_") + " ";
  }

  const finalResult = {
    ok: result.success,
    title: title || "",
    sourceUrl: sourceUrl || "",
    total: totalOriginal,
    extracted: allUrls.length,
    failed: stillFailed.length,
    failedHosts: stillFailed.length > 0 ? failedHostsMap : undefined,
    failedLinks: stillFailed.length > 0 ? stillFailed : undefined,
    indexedFailedLinks: stillFailedIndexed.length > 0 ? stillFailedIndexed : undefined,
    indexedUrls: Object.keys(urlMap).length > 0 ? urlMap : undefined,
    newlyRecovered,
    services,
    directUrls: allUrls,
    previewUrls: allUrls.slice(0, 5),
    pasteUrl: result.success ? result.url : null,
    pasteError: result.success ? null : result.error,
    hashtag,
    sendCommand: title ? `/send ${hashtag}${title}` : null,
    dlCommand: result.success ? `/dl ${result.url}` : null,
  };

  if (finalResult.ok) addToHistory(finalResult);
  sendJSON(res, 200, finalResult);
}

module.exports = {
  handleVgScrape,
  handleVgFetch,
  handleApsFetch,
  handleDirectFetch,
  handleThreadExtract,
  handleReExtract,
};
