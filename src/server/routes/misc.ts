import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { IncomingMessage, ServerResponse } from "http";
import { sendJSON, readBody } from "../utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function getAiPrompt(): Promise<string> {
  const promptUrl = process.env.PROMPT_URL;
  if (!promptUrl) throw new Error("PROMPT_URL not configured in .env");
  const resp = await axios.get(promptUrl, { timeout: 10000 });
  return resp.data;
}

export async function handleAiRename(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readBody(req);
  let parsed: { text?: string };
  try { parsed = JSON.parse(body); }
  catch { return sendJSON(res, 400, { error: "Invalid JSON" }); }

  const text = (parsed.text || "").trim();
  if (!text) return sendJSON(res, 400, { error: 'Missing "text" field' });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return sendJSON(res, 500, { error: "OPENROUTER_API_KEY not configured" });

  let systemPrompt: string;
  try { systemPrompt = await getAiPrompt(); }
  catch (e) { return sendJSON(res, 500, { error: `Failed to load AI prompt: ${(e as Error).message}` }); }

  const FREE_MODELS = [
    "google/gemini-2.5-flash-lite",
    "google/gemini-2.0-flash-001",
    "google/gemma-4-31b-it:free",
    "meta-llama/llama-3.3-70b-instruct:free",
  ];

  let lastErr = "";
  for (const model of FREE_MODELS) {
    try {
      const response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        { model, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: text }], temperature: 0.1, max_tokens: 2048 },
        { headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, timeout: 30000 },
      );
      const result = response.data?.choices?.[0]?.message?.content?.trim() || "";
      if (!result) continue;
      return sendJSON(res, 200, { ok: true, result, model });
    } catch (e) {
      const code = (e as { response?: { data?: { error?: { code?: number } }; status?: number } }).response?.data?.error?.code || (e as { response?: { status?: number } }).response?.status;
      lastErr = (e as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || (e as Error).message;
      if (code === 429 || code === 503) continue;
      break;
    }
  }
  sendJSON(res, 500, { error: `AI error: ${lastErr}` });
}

export function handleConfig(_params: URLSearchParams, res: ServerResponse): void {
  sendJSON(res, 200, { openrouterKey: process.env.OPENROUTER_API_KEY || "", promptUrl: process.env.PROMPT_URL || "" });
}

export function handleHealth(_params: URLSearchParams, res: ServerResponse): void {
  const uptime = process.uptime();
  const d = Math.floor(uptime / 86400), h = Math.floor((uptime % 86400) / 3600), m = Math.floor((uptime % 3600) / 60), s = (uptime % 60).toFixed(3);
  sendJSON(res, 200, { ok: true, status: "healthy", service: "running", uptime: `${d} days ${h} hours ${m} min ${s} s` });
}

export function handleStaticRoutes(pathname: string, _req: IncomingMessage, res: ServerResponse): boolean {
  const rootDir = path.join(__dirname, "..", "..", "..");

  if (/\.(svg|png|ico|webp|jpg|js)$/.test(pathname)) {
    // Try rootDir/public/<pathname> first, then rootDir/<pathname>
    const f = fs.existsSync(path.join(rootDir, "public", pathname))
      ? path.join(rootDir, "public", pathname)
      : path.join(rootDir, pathname);
    if (fs.existsSync(f)) {
      const ext = path.extname(f);
      const mime: Record<string, string> = { ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".webp": "image/webp", ".jpg": "image/jpeg", ".js": "text/javascript" };
      res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream" });
      fs.createReadStream(f).pipe(res);
      return true;
    }
  }

  const staticMap: [string | RegExp, string][] = [
    ["/plain", fs.existsSync(path.join(rootDir, "dist", "plain.html")) ? path.join(rootDir, "dist", "plain.html") : path.join(rootDir, "plain", "index.html")],
    ["/plain/", fs.existsSync(path.join(rootDir, "dist", "plain.html")) ? path.join(rootDir, "dist", "plain.html") : path.join(rootDir, "plain", "index.html")],
    ["/docs", path.join(rootDir, "docs", "home", "index.html")],
    ["/docs/", path.join(rootDir, "docs", "home", "index.html")],
    ["/imx", fs.existsSync(path.join(rootDir, "dist", "imx.html")) ? path.join(rootDir, "dist", "imx.html") : path.join(rootDir, "imx.html")],
    ["/imx/", fs.existsSync(path.join(rootDir, "dist", "imx.html")) ? path.join(rootDir, "dist", "imx.html") : path.join(rootDir, "imx.html")],
    ["/fgarden", fs.existsSync(path.join(rootDir, "dist", "fgarden.html")) ? path.join(rootDir, "dist", "fgarden.html") : path.join(rootDir, "fgarden.html")],
    ["/fgarden/", fs.existsSync(path.join(rootDir, "dist", "fgarden.html")) ? path.join(rootDir, "dist", "fgarden.html") : path.join(rootDir, "fgarden.html")],
    ["/text", fs.existsSync(path.join(rootDir, "dist", "text.html")) ? path.join(rootDir, "dist", "text.html") : path.join(rootDir, "text.html")],
    ["/text/", fs.existsSync(path.join(rootDir, "dist", "text.html")) ? path.join(rootDir, "dist", "text.html") : path.join(rootDir, "text.html")],
  ];
  for (const [pat, file] of staticMap) {
    if (pathname === pat && fs.existsSync(file)) {
      res.writeHead(200, { "Content-Type": "text/html" });
      fs.createReadStream(file).pipe(res);
      return true;
    }
  }

  if (pathname.startsWith("/plain/edit/")) {
    let f = path.join(rootDir, "dist", "plain.html");
    if (!fs.existsSync(f)) f = path.join(rootDir, "plain", "edit.html");
    if (fs.existsSync(f)) { res.writeHead(200, { "Content-Type": "text/html" }); fs.createReadStream(f).pipe(res); return true; }
  }

  const mimeTypes: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg" };

  for (const prefix of ["/docs/"]) {
    if (pathname.startsWith(prefix) || pathname === prefix.replace("/", "")) {
      let filePath = path.join(rootDir, pathname);
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile())
        filePath = path.join(rootDir, pathname.replace(/\/$/, ""), "index.html");
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        res.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
        fs.createReadStream(filePath).pipe(res);
        return true;
      }
    }
  }

  if (!pathname.startsWith("/api")) {
    let filePath = path.join(rootDir, "dist", pathname === "/" ? "index.html" : pathname);
    if (!fs.existsSync(filePath)) filePath = path.join(rootDir, "dist", "index.html");
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      res.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
      fs.createReadStream(filePath).pipe(res);
      return true;
    }
  }
  return false;
}
