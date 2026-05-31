import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { IncomingMessage, ServerResponse } from "http";
import axios from "axios";
import { ImageHostExtractor } from "../core/extractor.js";
import { uploadToPaste } from "../core/uploader.js";
import { IMAGE_HOSTS } from "../core/hosts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PAGE_SIZE = 20;
export const CONCURRENCY = 15;

export function md5(s: string): string {
  return crypto.createHash("md5").update(s).digest("hex");
}

export const vgCache = new Map<string, unknown[]>();
export const apsCache = new Map<string, unknown[]>();
export const threadCache = new Map<string, unknown>();

export function sendJSON(res: ServerResponse, code: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(body);
}

export function startSSE(res: ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
  });
}

export function sendSSE(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function parseURL(url: string): { pathname: string; params: URLSearchParams } {
  const u = new URL(url, "http://localhost");
  return { pathname: u.pathname, params: u.searchParams };
}

export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const HISTORY_DIR = path.join(__dirname, "..", "..", "data");
const HISTORY_FILE = path.join(HISTORY_DIR, "history.json");

export function loadHistory(): unknown[] {
  try {
    if (fs.existsSync(HISTORY_FILE))
      return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
  } catch (e) {
    console.error("[History] load error:", (e as Error).message);
  }
  return [];
}

function saveHistory(entries: unknown[]): void {
  try {
    if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(entries, null, 2));
  } catch (e) {
    console.error("[History] save error:", (e as Error).message);
  }
}

export function addToHistory(entry: Record<string, unknown>): Record<string, unknown> {
  const history = loadHistory() as Record<string, unknown>[];
  const record: Record<string, unknown> = {
    id: md5(String(entry.sourceUrl) + Date.now()).slice(0, 8),
    timestamp: Date.now(),
    title: entry.title,
    sourceUrl: entry.sourceUrl,
    source: String(entry.sourceUrl)?.includes("viper") ? "vg" : "aps",
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

export function handleHistory(params: URLSearchParams, res: ServerResponse): void {
  const history = loadHistory();
  const page = Math.max(1, parseInt(params.get("page") || "1"));
  const total = history.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const slice = history.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  sendJSON(res, 200, { total, page: safePage, totalPages, results: slice });
}

/** Split AI result into separate hashtags: "Lily Blossom, Matthew Meier" → "#lily_blossom #matthew_meier " */
export function formatPerformerHashtags(names: string): string {
  const performers = names.split(/,\s*/).map(n => n.trim()).filter(Boolean);
  return performers.map(p => "#" + p.toLowerCase().replace(/\s+/g, "_")).join(" ") + " ";
}

async function getPerformerPrompt(): Promise<string> {
  const promptUrl = process.env.PERFORMER_PROMPT_URL;
  if (!promptUrl) throw new Error("PERFORMER_PROMPT_URL not configured in .env");
  const resp = await axios.get(promptUrl, { timeout: 10000 });
  return resp.data;
}

const performerCache = new Map<string, string | null>();

export async function extractPerformerName(title: string): Promise<string | null> {
  if (!title) return null;

  // Check cache first
  const cached = performerCache.get(title);
  if (cached !== undefined) return cached;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn("[Performer Extract] OPENROUTER_API_KEY not configured, skipping");
    return null;
  }

  let performerPrompt: string;
  try { performerPrompt = await getPerformerPrompt(); }
  catch (e) {
    console.warn(`[Performer Extract] Failed to load prompt: ${(e as Error).message}`);
    return null;
  }

  const FREE_MODELS = [
    "google/gemini-2.5-flash-lite",
    "google/gemini-2.0-flash-001",
    "google/gemma-4-31b-it:free",
    "meta-llama/llama-3.3-70b-instruct:free",
  ];

  for (const model of FREE_MODELS) {
    try {
      const response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model,
          messages: [
            { role: "system", content: performerPrompt },
            { role: "user", content: title },
          ],
          temperature: 0.0,
          max_tokens: 100,
        },
        {
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          timeout: 15000,
        },
      );
      const result = response.data?.choices?.[0]?.message?.content?.trim() || "";
      if (!result || result === "UNKNOWN") {
        performerCache.set(title, null);
        return null;
      }
      console.log(`[Performer Extract] "${title}" → "${result}" (${model})`);
      performerCache.set(title, result);
      return result;
    } catch (e) {
      const code = (e as { response?: { data?: { error?: { code?: number } }; status?: number } }).response?.data?.error?.code || (e as { response?: { status?: number } }).response?.status;
      if (code === 429 || code === 503) continue;
      break;
    }
  }

  console.warn(`[Performer Extract] All models failed for: "${title}"`);
  performerCache.set(title, null);
  return null;
}

export async function extractAndUpload(
  links: string[],
  title: string,
  sourceUrl: string,
  searchQuery: string | null,
  onProgress: ((p: unknown) => void) | null,
): Promise<Record<string, unknown>> {
  const extractor = new ImageHostExtractor();
  const total = links.length;
  const urlResults: Record<number, string> = {};
  const hostCounts: Record<string, number> = {};
  const failedHosts: Record<string, number> = {};
  const failedLinks: { index: number; link: string }[] = [];
  let completed = 0;
  let extracted = 0;

  const chunks: string[][] = [];
  for (let i = 0; i < links.length; i += CONCURRENCY)
    chunks.push(links.slice(i, i + CONCURRENCY));

  for (const chunk of chunks) {
    const results = await Promise.allSettled(
      chunk.map((link, ci) =>
        extractor.extractDirectUrl(link).then((u) => {
          const hostMatch = IMAGE_HOSTS.find((h) => link.includes(h));
          if (u) {
            if (hostMatch) hostCounts[hostMatch] = (hostCounts[hostMatch] || 0) + 1;
          } else {
            failedLinks.push({ index: completed + ci, link });
          }
          return { i: completed + ci, u };
        }).catch(() => {
          failedLinks.push({ index: completed + ci, link: chunk[ci] });
          return { i: completed + ci, u: null };
        }),
      ),
    );
    for (const r of results)
      if (r.status === "fulfilled" && r.value.u) urlResults[r.value.i] = r.value.u;
    completed += chunk.length;
    extracted = Object.keys(urlResults).length;
    if (onProgress) onProgress({ completed, extracted, total });
  }

  const MAX_RETRY_PASSES = 3;
  let currentFailed = failedLinks.filter((f) => !urlResults[f.index]);
  for (let pass = 2; pass <= MAX_RETRY_PASSES + 1 && currentFailed.length > 0; pass++) {
    const beforeCount = Object.keys(urlResults).length;
    const retryExtractor = new ImageHostExtractor();
    (retryExtractor as unknown as { client: { defaults: { timeout: number } } }).client.defaults.timeout = 12000;
    const RETRY_CONCURRENCY = 10;
    const retryChunks: typeof currentFailed[] = [];
    for (let i = 0; i < currentFailed.length; i += RETRY_CONCURRENCY)
      retryChunks.push(currentFailed.slice(i, i + RETRY_CONCURRENCY));
    for (const chunk of retryChunks) {
      const results = await Promise.allSettled(
        chunk.map(({ index, link }) =>
          retryExtractor.extractDirectUrl(link).then((u) => {
            if (u) {
              const hostMatch = IMAGE_HOSTS.find((h) => link.includes(h));
              if (hostMatch) hostCounts[hostMatch] = (hostCounts[hostMatch] || 0) + 1;
            }
            return { i: index, u };
          }).catch(() => ({ i: index, u: null })),
        ),
      );
      for (const r of results)
        if (r.status === "fulfilled" && r.value.u) urlResults[r.value.i] = r.value.u;
      extracted = Object.keys(urlResults).length;
      if (onProgress) onProgress({ completed: total, extracted, total });
    }
    if (Object.keys(urlResults).length - beforeCount === 0) break;
    currentFailed = failedLinks.filter((f) => !urlResults[f.index]);
  }

  const stillFailedEntries = failedLinks.filter((f) => !urlResults[f.index]);
  const stillFailedLinks = stillFailedEntries.map((f) => f.link);
  const indexedFailedLinks = stillFailedEntries.map((f) => ({ index: f.index, link: f.link }));
  for (const link of stillFailedLinks) {
    const hostMatch = IMAGE_HOSTS.find((h) => link.includes(h));
    const hostName = hostMatch ? hostMatch.split(".")[0] : "unknown";
    failedHosts[hostName] = (failedHosts[hostName] || 0) + 1;
  }

  const indexedUrls: Record<string, string> = {};
  for (const [i, u] of Object.entries(urlResults)) indexedUrls[i] = u;

  const directUrls = Object.keys(urlResults).map(Number).sort((a, b) => a - b).map((i) => urlResults[i]);
  const services = Object.entries(hostCounts).sort((a, b) => b[1] - a[1])
    .map(([host, count]) => { const s = host.split(".")[0]; return count > 1 ? `${s}(${count})` : s; }).join(", ");
  const failedCount = total - directUrls.length;

  if (!directUrls.length) {
    const failedDetail = Object.entries(failedHosts).sort((a, b) => b[1] - a[1])
      .map(([h, c]) => `${h}(${c})`).join(", ");
    return {
      ok: false,
      error: total === 0 ? "No image links found in this post" : `Images not found${failedDetail ? ` — failed hosts: ${failedDetail}` : ""}`,
      title, sourceUrl, total, failed: failedCount, failedHosts, failedLinks: stillFailedLinks, services, directUrls: [], pasteUrl: null,
    };
  }

  const content = directUrls.join("\n");
  let result = await uploadToPaste(content, 7);
  if (!result.success) result = await uploadToPaste(content, 7);

  // Extract performer name from title via AI, fall back to searchQuery
  let hashtag = "";
  const performerName = await extractPerformerName(title);
  if (performerName) {
    hashtag = formatPerformerHashtags(performerName);
  } else if (searchQuery) {
    hashtag = "#" + searchQuery.toLowerCase().replace(/\s+/g, "_") + " ";
  }

  return {
    ok: result.success, title, sourceUrl, total,
    extracted: directUrls.length, failed: failedCount,
    failedHosts: failedCount > 0 ? failedHosts : undefined,
    failedLinks: stillFailedLinks.length > 0 ? stillFailedLinks : undefined,
    indexedFailedLinks: indexedFailedLinks.length > 0 ? indexedFailedLinks : undefined,
    indexedUrls: Object.keys(indexedUrls).length > 0 ? indexedUrls : undefined,
    services, directUrls, previewUrls: directUrls.slice(0, 5),
    pasteUrl: result.success ? result.url : null,
    pasteError: result.success ? null : result.error,
    hashtag,
    sendCommand: title ? `/send ${hashtag}${title}` : null,
    dlCommand: result.success ? `/dl ${result.url}` : null,
  };
}
