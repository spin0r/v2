import "dotenv/config";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { parseURL, sendJSON, handleHistory } from "./src/server/utils.js";
import { handleVgSearch, handleApsSearch } from "./src/server/routes/search.js";
import { handleVgScrape, handleVgFetch, handleApsFetch, handleDirectFetch, handleThreadExtract, handleReExtract } from "./src/server/routes/fetch.js";
import { handleRssFeed, handleRssXml } from "./src/server/routes/rss.js";
import { handleImxExtract, handleImxUpload, handleImxUploadSingle } from "./src/server/routes/imx.js";
import { handleAiRename, handleConfig, handleHealth, handleStaticRoutes } from "./src/server/routes/misc.js";
import { handleCreate, handleEdit, handleRaw, handleGetSnippet, handleDelete } from "./src/server/routes/plain.js";
import { handleFgardenList, handleFgardenUpload } from "./src/server/routes/fgarden.js";

const PORT = parseInt(process.env.PORT || process.env.WEB_API_PORT || "3001");

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE" });
    return res.end();
  }

  const { pathname, params } = parseURL(req.url!);
  try {
    if (pathname === "/api/search/vg") return await handleVgSearch(params, res);
    if (pathname === "/api/search/aps") return await handleApsSearch(params, res);
    if (pathname === "/api/scrape/vg") return await handleVgScrape(params, res);
    if (pathname === "/api/fetch/vg") return await handleVgFetch(params, res);
    if (pathname === "/api/fetch/aps") return await handleApsFetch(params, res);
    if (pathname === "/api/fetch/url") return await handleDirectFetch(params, res);
    if (pathname === "/api/fetch/thread-post") return await handleThreadExtract(params, res);
    if (pathname === "/api/re-extract" && req.method === "POST") return await handleReExtract(req, res);
    if (pathname === "/api/imx/extract") return await handleImxExtract(req, res);
    if (pathname === "/api/imx/upload") return await handleImxUpload(req, res);
    if (pathname === "/api/imx/upload-single") return await handleImxUploadSingle(req, res);
    if (pathname === "/api/ai-rename" && req.method === "POST") return await handleAiRename(req, res);
    if (pathname === "/plain/api/create" && req.method === "POST") return await handleCreate(req, res);
    if (req.method === "PUT" && pathname.startsWith("/plain/api/edit/")) {
      const [, , , , id, editKey] = pathname.split("/");
      return await handleEdit(req, res, id, editKey);
    }
    if (pathname.startsWith("/plain/raw/")) return handleRaw(res, pathname.split("/")[3]);
    if (pathname.startsWith("/plain/api/snippet/")) { const p = pathname.split("/"); return handleGetSnippet(res, p[4], p[5]); }
    if (req.method === "DELETE" && pathname.startsWith("/plain/api/delete/")) {
      const [, , , , id, editKey] = pathname.split("/");
      return await handleDelete(req, res, id, editKey);
    }
    if (pathname === "/api/fgarden/list") return await handleFgardenList(req, res);
    if (pathname === "/api/fgarden/upload" && req.method === "POST") return await handleFgardenUpload(req, res);
    if (pathname === "/api/rss") return await handleRssFeed(params, res);
    if (pathname === "/api/rss.xml") return await handleRssXml(params, res);
    if (pathname === "/api/history") return handleHistory(params, res);
    if (pathname === "/api/config") return handleConfig(params, res);
    if (pathname === "/api/health" || pathname === "/health") return handleHealth(params, res);
    if (handleStaticRoutes(pathname, req, res)) return;
    sendJSON(res, 404, { error: "Not found" });
  } catch (err) {
    console.error("[API]", (err as Error).message);
    sendJSON(res, 500, { error: (err as Error).message });
  }
});

server.listen(PORT, () => console.log(`[Viper Web API] http://localhost:${PORT}`));
