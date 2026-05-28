"use strict";

const fs = require("fs");
const path = require("path");
const { sendJSON, readBody } = require("../utils");

// ── AI RENAME (standalone API for filename formatting) ──
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

// ── Config endpoint ──
function handleConfig(params, res) {
  sendJSON(res, 200, {
    openrouterKey: process.env.OPENROUTER_API_KEY || '',
    promptUrl: process.env.PROMPT_URL || '',
  });
}

// ── Health check ──
function handleHealth(params, res) {
  const uptime = process.uptime();
  const d = Math.floor(uptime / 86400);
  const h = Math.floor((uptime % 86400) / 3600);
  const m = Math.floor((uptime % 3600) / 60);
  const s = (uptime % 60).toFixed(3);
  sendJSON(res, 200, { 
    ok: true, 
    status: "healthy", 
    service: "running",
    uptime: `${d} days ${h} hours ${m} min ${s} s`
  });
}

// ── Static file serving (API docs, text tool, dist) ──
function handleStaticRoutes(pathname, req, res) {
  const rootDir = path.join(__dirname, "..", "..", "..");

  // Serve docs landing and all doc pages under /docs/*
  if (pathname === '/docs' || pathname === '/docs/') {
    const f = path.join(rootDir, 'docs', 'home', 'index.html');
    if (fs.existsSync(f)) { res.writeHead(200, { 'Content-Type': 'text/html' }); fs.createReadStream(f).pipe(res); return true; }
  }
  if (pathname.startsWith('/docs/')) {
    // Try exact file first, then directory index
    let filePath = path.join(rootDir, pathname);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      filePath = path.join(rootDir, pathname.replace(/\/$/, ''), 'index.html');
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const mimeTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
      return true;
    }
  }

  // Serve text tool at /text (static files)
  if (pathname === '/text' || pathname === '/text/') {
    const textHtml = path.join(rootDir, 'text', 'index.html');
    if (fs.existsSync(textHtml)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      fs.createReadStream(textHtml).pipe(res);
      return true;
    }
  }
  if (pathname.startsWith('/text/')) {
    const filePath = path.join(rootDir, pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const mimeTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
      return true;
    }
  }

  // Serve static files from dist/ if it's not an API route
  if (!pathname.startsWith("/api")) {
    let filePath = path.join(rootDir, 'dist', pathname === '/' ? 'index.html' : pathname);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(rootDir, 'dist', 'index.html');
    }
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
      fs.createReadStream(filePath).pipe(res);
      return true;
    }
  }

  return false;
}

module.exports = { handleAiRename, handleConfig, handleHealth, handleStaticRoutes };
