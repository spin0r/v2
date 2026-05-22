"use strict";

require("dotenv").config();
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  ViperGirlsDownloader,
  AdultPhotoSetsScraper,
} = require("./src/core/scraper");
const { ImageHostExtractor } = require("./src/core/extractor");
const { uploadToPaste } = require("./src/core/uploader");
const { IMAGE_HOSTS } = require("./src/core/hosts");
const { batchExtractDirectUrls, batchUploadToImx } = require("./src/core/imx");

const PORT = parseInt(process.env.WEB_API_PORT || "3001");
const PAGE_SIZE = 20;
const CONCURRENCY = 15;

function md5(s) {
  return crypto.createHash("md5").update(s).digest("hex");
}

// In-memory session cache
const vgCache = new Map();  // key -> results[]
const apsCache = new Map();
const threadCache = new Map(); // key -> threadData

// ────────────────────────────────────────────────────────────────────────────
//  PERSISTENT HISTORY  (JSON file backed)
// ────────────────────────────────────────────────────────────────────────────
const HISTORY_DIR = path.join(__dirname, "data");
const HISTORY_FILE = path.join(HISTORY_DIR, "history.json");

function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
    }
  } catch (e) {
    console.error("[History] load error:", e.message);
  }
  return [];
}

function saveHistory(entries) {
  try {
    if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(entries, null, 2));
  } catch (e) {
    console.error("[History] save error:", e.message);
  }
}

function addToHistory(entry) {
  const history = loadHistory();
  const record = {
    id: md5(entry.sourceUrl + Date.now()).slice(0, 8),
    timestamp: Date.now(),
    title: entry.title,
    sourceUrl: entry.sourceUrl,
    source: entry.sourceUrl?.includes("viper") ? "vg" : "aps",
    extracted: entry.extracted,
    total: entry.total,
    services: entry.services,
    pasteUrl: entry.pasteUrl,
    sendCommand: entry.sendCommand,
    dlCommand: entry.dlCommand,
    previewUrls: entry.previewUrls || [],
  };
  history.unshift(record);
  saveHistory(history);
  return record;
}

function handleHistory(params, res) {
  const history = loadHistory();
  const page = Math.max(1, parseInt(params.get("page") || "1"));
  const total = history.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const slice = history.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  sendJSON(res, 200, { total, page: safePage, totalPages, results: slice });
}

function sendJSON(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(body);
}

function startSSE(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
  });
}

function sendSSE(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function parseURL(url) {
  const u = new URL(url, "http://localhost");
  return { pathname: u.pathname, params: u.searchParams };
}

// ────────────────────────────────────────────────────────────────────────────
//  EXTRACT + UPLOAD  (mirrors bot's extractAndUpload)
// ────────────────────────────────────────────────────────────────────────────
async function extractAndUpload(links, title, sourceUrl, searchQuery, onProgress) {
  const extractor = new ImageHostExtractor();
  const total = links.length;
  const urlResults = {};
  const hostCounts = {};
  const failedHosts = {};
  const failedLinks = [];  // Track which original links failed
  let completed = 0;
  let extracted = 0;

  // ── PASS 1: Normal extraction ──
  const chunks = [];
  for (let i = 0; i < links.length; i += CONCURRENCY)
    chunks.push(links.slice(i, i + CONCURRENCY));

  for (const chunk of chunks) {
    const results = await Promise.allSettled(
      chunk.map((link, ci) =>
        extractor.extractDirectUrl(link).then((u) => {
          const hostMatch = IMAGE_HOSTS.find(h => link.includes(h));
          const hostName = hostMatch ? hostMatch.split(".")[0] : "unknown";
          if (u) {
            if (hostMatch) {
              hostCounts[hostMatch] = (hostCounts[hostMatch] || 0) + 1;
            }
          } else {
            failedLinks.push({ index: completed + ci, link });
          }
          return { i: completed + ci, u };
        }).catch(() => {
          failedLinks.push({ index: completed + ci, link: chunk[ci] });
          return { i: completed + ci, u: null };
        })
      )
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.u)
        urlResults[r.value.i] = r.value.u;
    }
    completed += chunk.length;
    extracted = Object.keys(urlResults).length;
    if (onProgress) onProgress({ completed, extracted, total });
  }

  // ── PASS 2: Retry failed ones with fresh extractor, lower concurrency, longer timeout ──
  if (failedLinks.length > 0 && failedLinks.length <= total) {
    console.log(`[Extract] Pass 2: Retrying ${failedLinks.length}/${total} failed extractions`);
    const retryExtractor = new ImageHostExtractor();
    // Override timeout to 20s for retry pass
    retryExtractor.client.defaults.timeout = 20000;
    const RETRY_CONCURRENCY = 5;
    const retryChunks = [];
    for (let i = 0; i < failedLinks.length; i += RETRY_CONCURRENCY)
      retryChunks.push(failedLinks.slice(i, i + RETRY_CONCURRENCY));

    for (const chunk of retryChunks) {
      const results = await Promise.allSettled(
        chunk.map(({ index, link }) =>
          retryExtractor.extractDirectUrl(link).then((u) => {
            if (u) {
              const hostMatch = IMAGE_HOSTS.find(h => link.includes(h));
              if (hostMatch) {
                hostCounts[hostMatch] = (hostCounts[hostMatch] || 0) + 1;
              }
            }
            return { i: index, u };
          }).catch(() => ({ i: index, u: null }))
        )
      );
      for (const r of results) {
        if (r.status === "fulfilled" && r.value.u)
          urlResults[r.value.i] = r.value.u;
      }
      extracted = Object.keys(urlResults).length;
      if (onProgress) onProgress({ completed: total, extracted, total });
    }
  }

  // Rebuild failedLinks list after retry pass
  const stillFailedLinks = failedLinks
    .filter(f => !urlResults[f.index])
    .map(f => f.link);

  // Track host failures only for still-failed links
  for (const link of stillFailedLinks) {
    const hostMatch = IMAGE_HOSTS.find(h => link.includes(h));
    const hostName = hostMatch ? hostMatch.split(".")[0] : "unknown";
    failedHosts[hostName] = (failedHosts[hostName] || 0) + 1;
  }

  const directUrls = Object.keys(urlResults)
    .map(Number)
    .sort((a, b) => a - b)
    .map((i) => urlResults[i]);

  const services = Object.entries(hostCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([host, count]) => {
      const shortName = host.split(".")[0];
      return count > 1 ? `${shortName}(${count})` : shortName;
    })
    .join(", ");

  const failedCount = total - directUrls.length;

  if (!directUrls.length) {
    // Build a descriptive error
    const failedDetail = Object.entries(failedHosts)
      .sort((a, b) => b[1] - a[1])
      .map(([h, c]) => `${h}(${c})`)
      .join(", ");
    let errorMsg = "Images not found";
    if (failedDetail) {
      errorMsg = `Images not found — failed hosts: ${failedDetail}`;
    }
    if (total === 0) {
      errorMsg = "No image links found in this post";
    }
    return {
      ok: false,
      error: errorMsg,
      title,
      sourceUrl,
      total,
      failed: failedCount,
      failedHosts,
      failedLinks: stillFailedLinks,
      services,
      directUrls: [],
      pasteUrl: null,
    };
  }

  // Upload to paste
  const content = directUrls.join("\n");
  let result = await uploadToPaste(content, 7, "pb");
  if (!result.success) result = await uploadToPaste(content, 7, "shz");

  // Generate hashtag
  let hashtag = "";
  if (searchQuery) {
    hashtag = "#" + searchQuery.toLowerCase().replace(/\s+/g, "_") + " ";
  }

  return {
    ok: result.success,
    title,
    sourceUrl,
    total,
    extracted: directUrls.length,
    failed: failedCount,
    failedHosts: failedCount > 0 ? failedHosts : undefined,
    failedLinks: stillFailedLinks.length > 0 ? stillFailedLinks : undefined,
    services,
    directUrls,
    previewUrls: directUrls.slice(0, 5),
    pasteUrl: result.success ? result.url : null,
    pasteError: result.success ? null : result.error,
    hashtag,
    sendCommand: title ? `/send ${hashtag}${title}` : null,
    dlCommand: result.success ? `/dl ${result.url}` : null,
  };
}

// ────────────────────────────────────────────────────────────────────────────
//  VG SEARCH
// ────────────────────────────────────────────────────────────────────────────
async function handleVgSearch(params, res) {
  const query = params.get("q") || "";
  const page = Math.max(1, parseInt(params.get("page") || "1"));
  if (!query) return sendJSON(res, 400, { error: "Missing query" });

  const key = query.toLowerCase();
  let results;

  if (vgCache.has(key)) {
    results = vgCache.get(key);
  } else {
    const downloader = new ViperGirlsDownloader();
    const forums = [302, 303, 304];
    const all = [];
    try {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      for (let i = 0; i < forums.length; i++) {
        if (i > 0) await sleep(16000); // 16s flood-control delay between forum searches
        const [res2, searchid, totalPages, perPage] = await downloader.searchForum(query, [forums[i]]);
        if (res2.length) all.push(...res2);
        for (let p = 2; p <= totalPages; p++) {
          try {
            const [more] = await downloader.searchForumPage(searchid, p, perPage);
            if (more.length) all.push(...more);
          } catch { break; }
        }
      }
    } catch (err) {
      console.error("[VG Search Error]", err.message);
    }
    const seen = new Set();
    results = all
      .filter(r => { if (seen.has(r.url)) return false; seen.add(r.url); return true; })
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .map(r => {
        const prefix = r.prefix ? `[${r.prefix}] ` : "";
        const title = prefix + r.title;
        return { ...r, title, sgenId: md5(r.url).slice(0, 6) };
      });
    vgCache.set(key, results);
  }

  const total = results.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const slice = results.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  sendJSON(res, 200, { total, page: safePage, totalPages, results: slice });
}

// ────────────────────────────────────────────────────────────────────────────
//  APS SEARCH
// ────────────────────────────────────────────────────────────────────────────
async function handleApsSearch(params, res) {
  const query = params.get("q") || "";
  const page = Math.max(1, parseInt(params.get("page") || "1"));
  if (!query) return sendJSON(res, 400, { error: "Missing query" });

  const key = query.toLowerCase();
  let results;

  if (apsCache.has(key)) {
    results = apsCache.get(key);
  } else {
    const scraper = new AdultPhotoSetsScraper();
    const raw = await scraper.searchAll(query);
    results = raw.map(r => ({ ...r, apsId: md5(r.url).slice(0, 6) }));
    apsCache.set(key, results);
  }

  const total = results.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const slice = results.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  sendJSON(res, 200, { total, page: safePage, totalPages, results: slice });
}

// ────────────────────────────────────────────────────────────────────────────
//  VG SCRAPE (scrape thread → return post list, no extraction)
// ────────────────────────────────────────────────────────────────────────────
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

// ────────────────────────────────────────────────────────────────────────────
//  VG FETCH  (scrape thread + extract + upload)
// ────────────────────────────────────────────────────────────────────────────
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

// ────────────────────────────────────────────────────────────────────────────
//  APS FETCH  (get post links + extract + upload)
// ────────────────────────────────────────────────────────────────────────────
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

// ────────────────────────────────────────────────────────────────────────────
//  DIRECT URL FETCH INFO (paste a thread URL → scrape + return structure)
// ────────────────────────────────────────────────────────────────────────────

// Derive a search query from a thread URL slug.
// e.g. "10182278-Blake-Blossom-Galleries" → "Blake Blossom"
function slugToQuery(url) {
  const STOP_WORDS = new Set(['galleries', 'gallery', 'thread', 'threads', 'collection',
    'sets', 'set', 'pics', 'images', 'photos', 'pack', 'mega', 'vol', 'part']);
  const slugMatch = url.match(/\/threads\/([^/\?]+)/i) ||
                    url.match(/\/([^/]+)\/?$/);
  if (!slugMatch) return null;
  const slug = slugMatch[1];
  const parts = slug.split('-').filter(p => p && !/^\d+$/.test(p));  // drop pure numbers
  const words = parts.filter(p => !STOP_WORDS.has(p.toLowerCase()));
  return words.length ? words.join(' ') : null;
}

async function handleDirectFetch(params, res) {
  const url = params.get("url") || "";
  if (!url) return sendJSON(res, 400, { error: "Missing url" });

  try {
    if (url.includes("vipergirls.to")) {
      const downloader = new ViperGirlsDownloader();
      const [pagesData, totalPages] = await downloader.scrapeThread(url);
      const title = pagesData[0]?.posts[0]?.title || url;
      const threadId = md5(url).slice(0, 8);
      const searchQuery = slugToQuery(url);

      const threadData = { url, title, searchQuery, pages: pagesData, totalPages, type: 'vg' };
      threadCache.set(threadId, threadData);

      return sendJSON(res, 200, { ok: true, threadId, threadData });
    }

    if (url.includes("adultphotosets")) {
      const scraper = new AdultPhotoSetsScraper();
      const links = await scraper.getPostLinks(url);
      const titleMatch = url.match(/\/([^/]+)\/?$/);
      const title = titleMatch ? titleMatch[1].replace(/-/g, ' ') : url;
      const threadId = md5(url).slice(0, 8);
      const searchQuery = slugToQuery(url);

      const threadData = { url, title, searchQuery, pages: [{ page_num: 1, posts: [{ title: 'Main Post', links, count: links.length }] }], totalPages: 1, type: 'aps' };
      threadCache.set(threadId, threadData);

      return sendJSON(res, 200, { ok: true, threadId, threadData });
    }

    sendJSON(res, 400, { error: "URL must be from vipergirls.to or adultphotosets" });
  } catch (err) {
    console.error("[Direct Fetch Error]", err.message);
    sendJSON(res, 500, { error: err.message });
  }
}

// ────────────────────────────────────────────────────────────────────────────
//  THREAD EXTRACT (extract specific post from cached thread)
// ────────────────────────────────────────────────────────────────────────────
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

// ────────────────────────────────────────────────────────────────────────────
//  RE-EXTRACT (retry only failed links, merge with previous successful URLs)
// ────────────────────────────────────────────────────────────────────────────
async function handleReExtract(req, res) {
  const body = await readBody(req);
  let parsed;
  try { parsed = JSON.parse(body); } catch { return sendJSON(res, 400, { error: "Invalid JSON" }); }

  const { failedLinks, previousUrls, title, sourceUrl, searchQuery } = parsed;
  if (!failedLinks || !failedLinks.length) {
    return sendJSON(res, 400, { error: "No failed links to retry" });
  }

  const prevUrls = previousUrls || [];
  console.log(`[Re-Extract] Retrying ${failedLinks.length} failed links (${prevUrls.length} previous OK)`);

  const extractor = new ImageHostExtractor();
  // Use longer timeout and lower concurrency for retries
  extractor.client.defaults.timeout = 25000;
  const RETRY_CONCURRENCY = 3;
  const newUrls = [];
  const stillFailed = [];
  const hostCounts = {};
  const failedHostsMap = {};

  const chunks = [];
  for (let i = 0; i < failedLinks.length; i += RETRY_CONCURRENCY)
    chunks.push(failedLinks.slice(i, i + RETRY_CONCURRENCY));

  for (const chunk of chunks) {
    const results = await Promise.allSettled(
      chunk.map(link =>
        extractor.extractDirectUrl(link).then(u => {
          const hostMatch = IMAGE_HOSTS.find(h => link.includes(h));
          const hostName = hostMatch ? hostMatch.split(".")[0] : "unknown";
          if (u) {
            if (hostMatch) hostCounts[hostMatch] = (hostCounts[hostMatch] || 0) + 1;
          } else {
            failedHostsMap[hostName] = (failedHostsMap[hostName] || 0) + 1;
            stillFailed.push(link);
          }
          return { link, u };
        }).catch(() => {
          const hostMatch = IMAGE_HOSTS.find(h => link.includes(h));
          const hostName = hostMatch ? hostMatch.split(".")[0] : "unknown";
          failedHostsMap[hostName] = (failedHostsMap[hostName] || 0) + 1;
          stillFailed.push(link);
          return { link, u: null };
        })
      )
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.u) newUrls.push(r.value.u);
    }
  }

  // Merge previous URLs with newly extracted ones
  const allUrls = [...prevUrls, ...newUrls];
  const totalOriginal = prevUrls.length + failedLinks.length;

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
      failedHosts: failedHostsMap,
      directUrls: [],
      pasteUrl: null,
    });
  }

  // Upload merged results to paste
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
    newlyRecovered: newUrls.length,
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

// ────────────────────────────────────────────────────────────────────────────
//  IMX EXTRACT  (imx.to viewer links → direct URLs → paste)
// ────────────────────────────────────────────────────────────────────────────
async function handleImxExtract(req, res) {
  // Read POST body
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

// ────────────────────────────────────────────────────────────────────────────
//  IMX UPLOAD  (paste URL → download → upload to IMX → extract → paste)
// ────────────────────────────────────────────────────────────────────────────
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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// ────────────────────────────────────────────────────────────────────────────
//  AI RENAME  (standalone API for filename formatting)
// ────────────────────────────────────────────────────────────────────────────
async function getAiPrompt() {
  const promptUrl = process.env.PROMPT_URL;
  if (!promptUrl) throw new Error('PROMPT_URL not configured in .env');
  const axios = require('axios');
  const resp = await axios.get(promptUrl, { timeout: 10000 });
  console.log('[AI Rename] System prompt fetched fresh');
  return resp.data;
}

async function handleAiRename(req, res) {
  const body = await readBody(req);
  let parsed;
  try { parsed = JSON.parse(body); } catch { return sendJSON(res, 400, { error: 'Invalid JSON' }); }

  const text = (parsed.text || '').trim();
  if (!text) return sendJSON(res, 400, { error: 'Missing "text" field' });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return sendJSON(res, 500, { error: 'OPENROUTER_API_KEY not configured' });

  let systemPrompt;
  try {
    systemPrompt = await getAiPrompt();
  } catch (e) {
    return sendJSON(res, 500, { error: `Failed to load AI prompt: ${e.message}` });
  }

  const FREE_MODELS = [
    'google/gemini-2.5-flash-lite',      // $0.0000001/tok — basically free
    'google/gemini-2.0-flash-001',        // $0.0000001/tok
    'google/gemma-4-31b-it:free',         // free fallback
    'meta-llama/llama-3.3-70b-instruct:free',
  ];

  const axios = require('axios');
  let lastErr = '';

  for (const model of FREE_MODELS) {
    try {
      console.log(`[AI Rename] Trying ${model}...`);
      const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text }
        ],
        temperature: 0.1,
        max_tokens: 2048,
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        timeout: 30000,
      });

      const result = response.data?.choices?.[0]?.message?.content?.trim() || '';
      if (!result) continue; // try next model if empty

      console.log(`[AI Rename] [${model}] "${text.substring(0, 50)}..." → "${result.substring(0, 50)}..."`);
      return sendJSON(res, 200, { ok: true, result, model });
    } catch (e) {
      const errData = e.response?.data;
      const code = errData?.error?.code || e.response?.status;
      lastErr = errData?.error?.message || e.message;
      console.warn(`[AI Rename] ${model} failed (${code}): ${lastErr}`);
      if (code === 429 || code === 503) continue; // rate-limited or unavailable, try next
      break; // other errors (auth, invalid request) won't be fixed by switching model
    }
  }

  console.error('[AI Rename] All models failed. Last error:', lastErr);
  sendJSON(res, 500, { error: `AI error: ${lastErr}` });
}

// ────────────────────────────────────────────────────────────────────────────
//  RSS FEED  (scrapes Viper forum page directly for real thread URLs)
// ────────────────────────────────────────────────────────────────────────────
const cheerio = require("cheerio");

function parseForumPage(html) {
  const $ = cheerio.load(html);
  const entries = [];

  $('li.threadbit, li[id^="thread_"]').each((_, el) => {
    const titleTag = $(el).find('a[id^="thread_title_"]').first();
    if (!titleTag.length) return;

    // Thread URL (real link like threads/16244690-Lilibet-Saunders-...)
    let href = titleTag.attr("href") || "";
    if (href && !href.startsWith("http")) href = "https://viper.to/" + href.replace(/^\//, "");
    // Strip session tokens
    href = href.replace(/\?s=[^&]*/, "").replace(/&s=[^&]*/g, "");

    const title = titleTag.text().trim();

    // Thumbnail previews from data-images attribute
    let thumbnails = [];
    const dataImages = titleTag.attr("data-images");
    if (dataImages) {
      try {
        thumbnails = JSON.parse(dataImages.replace(/&quot;/g, '"'));
      } catch {}
    }

    // Prefix/studio tag
    const prefixTag = $(el).find('span[id^="thread_prefix_"]').first();
    const prefix = prefixTag.length
      ? prefixTag.text().trim().replace(/^\[|\]$/g, "")
      : "";

    // Author and date from "Started by" label
    const labelSpan = $(el).find("span.label").first();
    let author = "";
    let dateText = "";
    let published = "";
    if (labelSpan.length) {
      const authorTag = labelSpan.find("a.username").first();
      if (authorTag.length) author = authorTag.text().trim();

      // Try title attr for full date: "Started by Rex on Today 05:10"
      const titleAttr = authorTag.attr("title") || "";
      const onDateMatch = titleAttr.match(/on\s+(.+)$/i);
      if (onDateMatch) dateText = onDateMatch[1].trim();

      // Fallback: parse from label text
      if (!dateText) {
        const raw = labelSpan.text().replace(/\u00a0/g, " ").trim();
        const afterComma = raw.split(",").slice(1).join(",").trim();
        if (afterComma) dateText = afterComma;
      }

      // Convert "Today HH:MM" / "Yesterday HH:MM" / "22nd May 2026 05:10" to ISO
      const now = new Date();
      const todayMatch = dateText.match(/^Today\s+(\d{1,2}):(\d{2})/i);
      const yestMatch = dateText.match(/^Yesterday\s+(\d{1,2}):(\d{2})/i);
      const fullMatch = dateText.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})\s+(\d{1,2}):(\d{2})/i);

      if (todayMatch) {
        const d = new Date(now); d.setHours(parseInt(todayMatch[1]), parseInt(todayMatch[2]), 0, 0);
        published = d.toISOString();
      } else if (yestMatch) {
        const d = new Date(now); d.setDate(d.getDate() - 1);
        d.setHours(parseInt(yestMatch[1]), parseInt(yestMatch[2]), 0, 0);
        published = d.toISOString();
      } else if (fullMatch) {
        const months = { january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,september:8,october:9,november:10,december:11 };
        const m = months[fullMatch[2].toLowerCase()];
        if (m !== undefined) {
          const d = new Date(parseInt(fullMatch[3]), m, parseInt(fullMatch[1]), parseInt(fullMatch[4]), parseInt(fullMatch[5]));
          published = d.toISOString();
        }
      }
    }

    // Thread stats (replies/views)
    let replies = "", views = "";
    $(el).find("ul.threadstats li").each((_, li) => {
      const t = $(li).text().trim();
      if (t.startsWith("Replies:")) replies = t.slice(8).trim();
      else if (t.toLowerCase().startsWith("views:")) views = t.split(":")[1].trim();
    });

    // Thread ID from element id
    const elId = $(el).attr("id") || "";
    const threadIdMatch = elId.match(/thread_(\d+)/);
    const threadId = threadIdMatch ? threadIdMatch[1] : "";

    entries.push({
      title,
      prefix,
      link: href,
      threadId,
      author,
      dateText,
      published,
      replies,
      views,
      thumbnails,
    });
  });

  return entries;
}

async function handleRssFeed(params, res) {
  const forumUrl = 'https://viper.to/forums/304-Hardcore-Photo-Sets';
  try {
    const axios = require('axios');
    const resp = await axios.get(forumUrl, {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });

    const entries = parseForumPage(resp.data);
    const feedUpdated = new Date().toISOString();

    sendJSON(res, 200, {
      ok: true,
      feedTitle: 'Hardcore Photo Sets',
      feedUpdated,
      total: entries.length,
      entries,
    });
  } catch (err) {
    console.error('[RSS Feed Error]', err.message);
    sendJSON(res, 500, { ok: false, error: err.message });
  }
}

// Serve proper Atom XML feed at /api/rss.xml
async function handleRssXml(params, res) {
  const forumUrl = 'https://viper.to/forums/304-Hardcore-Photo-Sets';
  try {
    const axios = require('axios');
    const resp = await axios.get(forumUrl, {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });

    const entries = parseForumPage(resp.data);
    const now = new Date().toISOString();

    const escXml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<feed xmlns="http://www.w3.org/2005/Atom">\n`;
    xml += `  <id>https://viper.to/forums/304-Hardcore-Photo-Sets</id>\n`;
    xml += `  <title>Hardcore Photo Sets</title>\n`;
    xml += `  <updated>${now}</updated>\n`;
    xml += `  <link href="https://viper.to/forums/304-Hardcore-Photo-Sets" rel="alternate"/>\n`;
    xml += `  <link href="/api/rss.xml" rel="self"/>\n`;

    for (const e of entries) {
      xml += `  <entry>\n`;
      xml += `    <id>${escXml(e.link)}</id>\n`;
      xml += `    <title>${escXml(e.title)}</title>\n`;
      xml += `    <link href="${escXml(e.link)}"/>\n`;
      if (e.published) xml += `    <published>${e.published}</published>\n`;
      xml += `    <updated>${e.published || now}</updated>\n`;
      if (e.author) xml += `    <author><name>${escXml(e.author)}</name></author>\n`;
      if (e.prefix) xml += `    <category term="${escXml(e.prefix)}"/>\n`;
      if (e.thumbnails.length) {
        xml += `    <content type="html">${escXml(e.thumbnails.map(t => `<img src="${t}"/>`).join(' '))}</content>\n`;
      }
      xml += `  </entry>\n`;
    }

    xml += `</feed>\n`;

    res.writeHead(200, {
      'Content-Type': 'application/atom+xml; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(xml);
  } catch (err) {
    console.error('[RSS XML Error]', err.message);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(`Error: ${err.message}`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
//  HTTP SERVER
// ────────────────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST",
    });
    return res.end();
  }

  const { pathname, params } = parseURL(req.url);
  try {
    if (pathname === "/api/search/vg")  return await handleVgSearch(params, res);
    if (pathname === "/api/search/aps") return await handleApsSearch(params, res);
    if (pathname === "/api/scrape/vg")  return await handleVgScrape(params, res);
    if (pathname === "/api/fetch/vg")   return await handleVgFetch(params, res);
    if (pathname === "/api/fetch/aps")  return await handleApsFetch(params, res);
    if (pathname === "/api/fetch/url")  return await handleDirectFetch(params, res);
    if (pathname === "/api/fetch/thread-post") return await handleThreadExtract(params, res);
    if (pathname === "/api/re-extract" && req.method === "POST") return await handleReExtract(req, res);
    if (pathname === "/api/imx/extract") return await handleImxExtract(req, res);
    if (pathname === "/api/imx/upload")  return await handleImxUpload(req, res);
    if (pathname === "/api/ai-rename" && req.method === "POST") return await handleAiRename(req, res);
    if (pathname === "/api/history")    return handleHistory(params, res);
    if (pathname === "/api/rss")        return await handleRssFeed(params, res);
    if (pathname === "/api/rss.xml")    return await handleRssXml(params, res);
    if (pathname === "/api/config") {
      return sendJSON(res, 200, {
        openrouterKey: process.env.OPENROUTER_API_KEY || '',
        promptUrl: process.env.PROMPT_URL || '',
      });
    }
    if (pathname === "/api/health" || pathname === "/health") {
      const uptime = process.uptime();
      const d = Math.floor(uptime / 86400);
      const h = Math.floor((uptime % 86400) / 3600);
      const m = Math.floor((uptime % 3600) / 60);
      const s = (uptime % 60).toFixed(3);
      return sendJSON(res, 200, { 
        ok: true, 
        status: "healthy", 
        service: "running",
        uptime: `${d} days ${h} hours ${m} min ${s} s`
      });
    }

    // Serve API docs page at /api
    if (pathname === '/api' || pathname === '/api/') {
      const docsHtml = path.join(__dirname, 'api-docs.html');
      if (fs.existsSync(docsHtml)) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        fs.createReadStream(docsHtml).pipe(res);
        return;
      }
    }

    // Serve text tool at /text (static files)
    if (pathname === '/text' || pathname === '/text/') {
      const textHtml = path.join(__dirname, 'text', 'index.html');
      if (fs.existsSync(textHtml)) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        fs.createReadStream(textHtml).pipe(res);
        return;
      }
    }
    if (pathname.startsWith('/text/')) {
      const filePath = path.join(__dirname, pathname);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath);
        const mimeTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
        return;
      }
    }

    // Serve static files from dist/ if it's not an API route
    if (!pathname.startsWith("/api")) {
      const fs = require('fs');
      const path = require('path');
      
      // Default to index.html for root or missing paths (SPA routing)
      let filePath = path.join(__dirname, 'dist', pathname === '/' ? 'index.html' : pathname);
      
      // If file doesn't exist, fallback to index.html
      if (!fs.existsSync(filePath)) {
        filePath = path.join(__dirname, 'dist', 'index.html');
      }

      // Check if it's actually a file before reading
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath);
        const mimeTypes = {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.json': 'application/json',
          '.png': 'image/png',
          '.jpg': 'image/jpg',
          '.svg': 'image/svg+xml'
        };
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        
        res.writeHead(200, { 'Content-Type': contentType });
        const readStream = fs.createReadStream(filePath);
        readStream.pipe(res);
        return;
      }
    }

    sendJSON(res, 404, { error: "Not found" });
  } catch (err) {
    console.error("[API]", err.message);
    sendJSON(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`[Viper Web API] http://localhost:${PORT}`);
});
