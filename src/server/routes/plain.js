"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "..", "..", "..", "data", "plain");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function uid(n = 8) {
  return crypto.randomBytes(n).toString("hex");
}

function load(id) {
  const f = path.join(DATA_DIR, `${id}.json`);
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

function save(id, data) {
  fs.writeFileSync(path.join(DATA_DIR, `${id}.json`), JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

// POST /plain/api/create  { text }
async function handleCreate(req, res) {
  const { text } = await readBody(req);
  if (!text || !text.trim()) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: false, error: "text is required" }));
  }
  if (text.length > 100000) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(
      JSON.stringify({
        ok: false,
        error: "text exceeds 100,000 character limit",
      }),
    );
  }
  const id = uid(6);
  const editKey = uid(12);
  save(id, { id, editKey, text, createdAt: new Date().toISOString() });
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(
    JSON.stringify({
      ok: true,
      id,
      editKey,
      rawUrl: `/plain/raw/${id}`,
      editUrl: `/plain/edit/${id}/${editKey}`,
    }),
  );
}

// PUT /plain/api/edit/:id/:editKey  { text }
async function handleEdit(req, res, id, editKey) {
  const snippet = load(id);
  if (!snippet) {
    res.writeHead(404, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: false, error: "Not found" }));
  }
  if (snippet.editKey !== editKey) {
    res.writeHead(403, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: false, error: "Invalid edit key" }));
  }
  const { text } = await readBody(req);
  if (!text || !text.trim()) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: false, error: "text is required" }));
  }
  save(id, { ...snippet, text, updatedAt: new Date().toISOString() });
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify({ ok: true }));
}

// GET /plain/raw/:id  → text/plain
function handleRaw(res, id) {
  const snippet = load(id);
  if (!snippet) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    return res.end("Not found");
  }
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(snippet.text);
}

// GET /plain/api/snippet/:id/:editKey  → JSON (for edit page to load)
function handleGetSnippet(res, id, editKey) {
  const snippet = load(id);
  if (!snippet || snippet.editKey !== editKey) {
    res.writeHead(404, { "Content-Type": "application/json" });
    return res.end(
      JSON.stringify({ ok: false, error: "Not found or invalid key" }),
    );
  }
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(
    JSON.stringify({
      ok: true,
      text: snippet.text,
      createdAt: snippet.createdAt,
    }),
  );
}

module.exports = { handleCreate, handleEdit, handleRaw, handleGetSnippet };
