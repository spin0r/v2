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
  // Avoid exact URL duplicates – replace if same sourceUrl exists
  const idx = history.findIndex(h => h.sourceUrl === entry.sourceUrl);
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
  if (idx >= 0) {
    history[idx] = record;
  } else {
    history.unshift(record);
  }
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

function parseURL(url) {
  const u = new URL(url, "http://localhost");
  return { pathname: u.pathname, params: u.searchParams };
}

// ────────────────────────────────────────────────────────────────────────────
//  EXTRACT + UPLOAD  (mirrors bot's extractAndUpload)
// ────────────────────────────────────────────────────────────────────────────
async function extractAndUpload(links, title, sourceUrl, searchQuery) {
  const extractor = new ImageHostExtractor();
  const total = links.length;
  const urlResults = {};
  const hostCounts = {};
  let completed = 0;

  const chunks = [];
  for (let i = 0; i < links.length; i += CONCURRENCY)
    chunks.push(links.slice(i, i + CONCURRENCY));

  for (const chunk of chunks) {
    const results = await Promise.allSettled(
      chunk.map((link, ci) =>
        extractor.extractDirectUrl(link).then((u) => {
          if (u) {
            for (const host of IMAGE_HOSTS) {
              if (link.includes(host)) {
                hostCounts[host] = (hostCounts[host] || 0) + 1;
                break;
              }
            }
          }
          return { i: completed + ci, u };
        })
      )
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.u)
        urlResults[r.value.i] = r.value.u;
    }
    completed += chunk.length;
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

  if (!directUrls.length) {
    return {
      ok: false,
      error: "Could not extract any URLs",
      title,
      sourceUrl,
      total,
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
//  VG FETCH  (scrape thread + extract + upload)
// ────────────────────────────────────────────────────────────────────────────
async function handleVgFetch(params, res) {
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
  const [pagesData] = await downloader.scrapeThread(found.url);
  const allLinks = pagesData.flatMap(p => p.posts.flatMap(q => q.links));

  const result = await extractAndUpload(allLinks, found.title, found.url, query || null);
  if (result.ok) addToHistory(result);
  sendJSON(res, 200, result);
}

// ────────────────────────────────────────────────────────────────────────────
//  APS FETCH  (get post links + extract + upload)
// ────────────────────────────────────────────────────────────────────────────
async function handleApsFetch(params, res) {
  const id = params.get("id") || "";
  const query = params.get("q") || "";
  if (!id) return sendJSON(res, 400, { error: "Missing id" });

  let found = null;
  for (const results of apsCache.values()) {
    found = results.find(r => r.apsId === id);
    if (found) break;
  }
  if (!found) return sendJSON(res, 404, { error: "ID not found – run search first" });

  const scraper = new AdultPhotoSetsScraper();
  const links = await scraper.getPostLinks(found.url);
  const result = await extractAndUpload(links, found.title, found.url, query || null);
  if (result.ok) addToHistory(result);
  sendJSON(res, 200, result);
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
  try {
    const result = await extractAndUpload(post.links, title, threadData.url, threadData.searchQuery || null);
    if (result.ok) addToHistory(result);
    sendJSON(res, 200, result);
  } catch (err) {
    sendJSON(res, 500, { error: err.message });
  }
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
    if (pathname === "/api/fetch/vg")   return await handleVgFetch(params, res);
    if (pathname === "/api/fetch/aps")  return await handleApsFetch(params, res);
    if (pathname === "/api/fetch/url")  return await handleDirectFetch(params, res);
    if (pathname === "/api/fetch/thread-post") return await handleThreadExtract(params, res);
    if (pathname === "/api/imx/extract") return await handleImxExtract(req, res);
    if (pathname === "/api/imx/upload")  return await handleImxUpload(req, res);
    if (pathname === "/api/history")    return handleHistory(params, res);
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
