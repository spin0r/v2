"use strict";

require("dotenv").config();
const http = require("http");

// ── Shared utilities ──
const { parseURL, sendJSON, handleHistory } = require("./src/server/utils");

// ── Route handlers ──
const { handleVgSearch, handleApsSearch } = require("./src/server/routes/search");
const { handleVgScrape, handleVgFetch, handleApsFetch, handleDirectFetch, handleThreadExtract, handleReExtract } = require("./src/server/routes/fetch");
const { handleRssFeed, handleRssXml } = require("./src/server/routes/rss");
const { handleImxExtract, handleImxUpload } = require("./src/server/routes/imx");
const { handleAiRename, handleConfig, handleHealth, handleStaticRoutes } = require("./src/server/routes/misc");

const PORT = parseInt(process.env.WEB_API_PORT || "3001");

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
    // Search
    if (pathname === "/api/search/vg")  return await handleVgSearch(params, res);
    if (pathname === "/api/search/aps") return await handleApsSearch(params, res);

    // Fetch / Extract
    if (pathname === "/api/scrape/vg")  return await handleVgScrape(params, res);
    if (pathname === "/api/fetch/vg")   return await handleVgFetch(params, res);
    if (pathname === "/api/fetch/aps")  return await handleApsFetch(params, res);
    if (pathname === "/api/fetch/url")  return await handleDirectFetch(params, res);
    if (pathname === "/api/fetch/thread-post") return await handleThreadExtract(params, res);
    if (pathname === "/api/re-extract" && req.method === "POST") return await handleReExtract(req, res);

    // IMX
    if (pathname === "/api/imx/extract") return await handleImxExtract(req, res);
    if (pathname === "/api/imx/upload")  return await handleImxUpload(req, res);

    // AI Rename
    if (pathname === "/api/ai-rename" && req.method === "POST") return await handleAiRename(req, res);

    // RSS
    if (pathname === "/api/rss")        return await handleRssFeed(params, res);
    if (pathname === "/api/rss.xml")    return await handleRssXml(params, res);

    // Misc
    if (pathname === "/api/history")    return handleHistory(params, res);
    if (pathname === "/api/config")     return handleConfig(params, res);
    if (pathname === "/api/health" || pathname === "/health") return handleHealth(params, res);

    // Static files (API docs, text tool, dist/)
    if (handleStaticRoutes(pathname, req, res)) return;

    sendJSON(res, 404, { error: "Not found" });
  } catch (err) {
    console.error("[API]", err.message);
    sendJSON(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`[Viper Web API] http://localhost:${PORT}`);
});
