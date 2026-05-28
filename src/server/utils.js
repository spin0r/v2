"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { ImageHostExtractor } = require("../core/extractor");
const { uploadToPaste } = require("../core/uploader");
const { IMAGE_HOSTS } = require("../core/hosts");

const PAGE_SIZE = 20;
const CONCURRENCY = 15;

function md5(s) {
  return crypto.createHash("md5").update(s).digest("hex");
}

// In-memory session caches
const vgCache = new Map();
const apsCache = new Map();
const threadCache = new Map();

// ── JSON / SSE helpers ──
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
    Connection: "keep-alive",
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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// ── Persistent History ──
const HISTORY_DIR = path.join(__dirname, "..", "..", "data");
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
    if (!fs.existsSync(HISTORY_DIR))
      fs.mkdirSync(HISTORY_DIR, { recursive: true });
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

// ── Extract + Upload pipeline ──
async function extractAndUpload(
  links,
  title,
  sourceUrl,
  searchQuery,
  onProgress,
) {
  const extractor = new ImageHostExtractor();
  const total = links.length;
  const urlResults = {};
  const hostCounts = {};
  const failedHosts = {};
  const failedLinks = [];
  let completed = 0;
  let extracted = 0;

  // PASS 1: Normal extraction
  const chunks = [];
  for (let i = 0; i < links.length; i += CONCURRENCY)
    chunks.push(links.slice(i, i + CONCURRENCY));

  for (const chunk of chunks) {
    const results = await Promise.allSettled(
      chunk.map((link, ci) =>
        extractor
          .extractDirectUrl(link)
          .then((u) => {
            const hostMatch = IMAGE_HOSTS.find((h) => link.includes(h));
            const hostName = hostMatch ? hostMatch.split(".")[0] : "unknown";
            if (u) {
              if (hostMatch) {
                hostCounts[hostMatch] = (hostCounts[hostMatch] || 0) + 1;
              }
            } else {
              failedLinks.push({ index: completed + ci, link });
            }
            return { i: completed + ci, u };
          })
          .catch(() => {
            failedLinks.push({ index: completed + ci, link: chunk[ci] });
            return { i: completed + ci, u: null };
          }),
      ),
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.u)
        urlResults[r.value.i] = r.value.u;
    }
    completed += chunk.length;
    extracted = Object.keys(urlResults).length;
    if (onProgress) onProgress({ completed, extracted, total });
  }

  // AUTO-RETRY: Loop retry passes until no more progress (max 3 extra passes)
  const MAX_RETRY_PASSES = 3;
  let currentFailed = failedLinks.filter((f) => !urlResults[f.index]);
  for (
    let pass = 2;
    pass <= MAX_RETRY_PASSES + 1 && currentFailed.length > 0;
    pass++
  ) {
    const beforeCount = Object.keys(urlResults).length;
    console.log(
      `[Extract] Pass ${pass}: Retrying ${currentFailed.length}/${total} failed extractions`,
    );
    const retryExtractor = new ImageHostExtractor();
    retryExtractor.client.defaults.timeout = 12000;
    const RETRY_CONCURRENCY = 10;
    const retryChunks = [];
    for (let i = 0; i < currentFailed.length; i += RETRY_CONCURRENCY)
      retryChunks.push(currentFailed.slice(i, i + RETRY_CONCURRENCY));

    for (const chunk of retryChunks) {
      const results = await Promise.allSettled(
        chunk.map(({ index, link }) =>
          retryExtractor
            .extractDirectUrl(link)
            .then((u) => {
              if (u) {
                const hostMatch = IMAGE_HOSTS.find((h) => link.includes(h));
                if (hostMatch) {
                  hostCounts[hostMatch] = (hostCounts[hostMatch] || 0) + 1;
                }
              }
              return { i: index, u };
            })
            .catch(() => ({ i: index, u: null })),
        ),
      );
      for (const r of results) {
        if (r.status === "fulfilled" && r.value.u)
          urlResults[r.value.i] = r.value.u;
      }
      extracted = Object.keys(urlResults).length;
      if (onProgress) onProgress({ completed: total, extracted, total });
    }

    // Check if we made progress this pass
    const afterCount = Object.keys(urlResults).length;
    const recovered = afterCount - beforeCount;
    console.log(`[Extract] Pass ${pass}: Recovered ${recovered} images`);
    if (recovered === 0) break; // no progress, stop retrying

    // Rebuild failed list for next pass
    currentFailed = failedLinks.filter((f) => !urlResults[f.index]);
  }

  // Rebuild failedLinks list after retry (preserve indices for re-extraction)
  const stillFailedEntries = failedLinks.filter((f) => !urlResults[f.index]);
  const stillFailedLinks = stillFailedEntries.map((f) => f.link);
  const indexedFailedLinks = stillFailedEntries.map((f) => ({
    index: f.index,
    link: f.link,
  }));

  for (const link of stillFailedLinks) {
    const hostMatch = IMAGE_HOSTS.find((h) => link.includes(h));
    const hostName = hostMatch ? hostMatch.split(".")[0] : "unknown";
    failedHosts[hostName] = (failedHosts[hostName] || 0) + 1;
  }

  // Build indexed map of successful URLs for position-aware re-extraction
  const indexedUrls = {};
  for (const [i, u] of Object.entries(urlResults)) {
    indexedUrls[i] = u;
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
    indexedFailedLinks:
      indexedFailedLinks.length > 0 ? indexedFailedLinks : undefined,
    indexedUrls: Object.keys(indexedUrls).length > 0 ? indexedUrls : undefined,
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

module.exports = {
  PAGE_SIZE,
  CONCURRENCY,
  md5,
  vgCache,
  apsCache,
  threadCache,
  sendJSON,
  startSSE,
  sendSSE,
  parseURL,
  readBody,
  loadHistory,
  addToHistory,
  handleHistory: function handleHistory(params, res) {
    const history = loadHistory();
    const page = Math.max(1, parseInt(params.get("page") || "1"));
    const total = history.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const slice = history.slice(
      (safePage - 1) * PAGE_SIZE,
      safePage * PAGE_SIZE,
    );
    sendJSON(res, 200, { total, page: safePage, totalPages, results: slice });
  },
  extractAndUpload,
};
