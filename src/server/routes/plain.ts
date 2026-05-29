import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import type { IncomingMessage, ServerResponse } from "http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "..", "..", "data", "plain");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

interface Snippet { id: string; editKey: string; text: string; createdAt: string; updatedAt?: string; }

function uid(n = 8): string { return crypto.randomBytes(n).toString("hex"); }
function load(id: string): Snippet | null {
  const f = path.join(DATA_DIR, `${id}.json`);
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, "utf8"));
}
function save(id: string, data: Snippet): void {
  fs.writeFileSync(path.join(DATA_DIR, `${id}.json`), JSON.stringify(data));
}
function readBody(req: IncomingMessage): Promise<{ text?: string }> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => { try { resolve(JSON.parse(body)); } catch { reject(new Error("Invalid JSON")); } });
  });
}
function json(res: ServerResponse, code: number, data: unknown): void {
  res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(data));
}

export async function handleCreate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { text } = await readBody(req);
  if (!text?.trim()) return json(res, 400, { ok: false, error: "text is required" });
  if (text.length > 100000) return json(res, 400, { ok: false, error: "text exceeds 100,000 character limit" });
  const id = uid(6), editKey = uid(12);
  save(id, { id, editKey, text, createdAt: new Date().toISOString() });
  json(res, 200, { ok: true, id, editKey, rawUrl: `/plain/raw/${id}`, editUrl: `/plain/edit/${id}/${editKey}` });
}

export async function handleEdit(req: IncomingMessage, res: ServerResponse, id: string, editKey: string): Promise<void> {
  const snippet = load(id);
  if (!snippet) return json(res, 404, { ok: false, error: "Not found" });
  if (snippet.editKey !== editKey) return json(res, 403, { ok: false, error: "Invalid edit key" });
  const { text } = await readBody(req);
  if (!text?.trim()) return json(res, 400, { ok: false, error: "text is required" });
  save(id, { ...snippet, text, updatedAt: new Date().toISOString() });
  json(res, 200, { ok: true });
}

export function handleRaw(res: ServerResponse, id: string): void {
  const snippet = load(id);
  if (!snippet) { res.writeHead(404, { "Content-Type": "text/plain" }); return void res.end("Not found"); }
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": "*" });
  res.end(snippet.text);
}

export function handleGetSnippet(res: ServerResponse, id: string, editKey: string): void {
  const snippet = load(id);
  if (!snippet || snippet.editKey !== editKey) { res.writeHead(404, { "Content-Type": "application/json" }); return void res.end(JSON.stringify({ ok: false, error: "Not found or invalid key" })); }
  res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify({ ok: true, text: snippet.text, createdAt: snippet.createdAt }));
}
