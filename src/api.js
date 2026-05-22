// ====== API ======
const API = '/api';

export async function apiSearch(tab, query, page = 1) {
  const endpoint = tab === 'vg' ? '/search/vg' : '/search/aps';
  const res = await fetch(`${API}${endpoint}?q=${encodeURIComponent(query)}&page=${page}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function apiFetch(tab, id, query = '') {
  const endpoint = tab === 'vg' ? '/fetch/vg' : '/fetch/aps';
  const res = await fetch(`${API}${endpoint}?id=${id}&q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Streaming version of apiFetch using SSE
export function apiFetchStream(tab, id, query = '', onProgress) {
  return new Promise((resolve, reject) => {
    const endpoint = tab === 'vg' ? '/fetch/vg' : '/fetch/aps';
    const url = `${API}${endpoint}?id=${id}&q=${encodeURIComponent(query)}&stream=1`;
    const es = new EventSource(url);
    es.addEventListener('phase', (e) => {
      try { const d = JSON.parse(e.data); if (onProgress) onProgress({ type: 'phase', ...d }); } catch {}
    });
    es.addEventListener('progress', (e) => {
      try { const d = JSON.parse(e.data); if (onProgress) onProgress({ type: 'progress', ...d }); } catch {}
    });
    es.addEventListener('done', (e) => {
      es.close();
      try { resolve(JSON.parse(e.data)); } catch { reject(new Error('Invalid response')); }
    });
    es.addEventListener('error', (e) => {
      es.close();
      // Try to parse error data if available
      if (e.data) {
        try { const d = JSON.parse(e.data); reject(new Error(d.error || 'Stream error')); return; } catch {}
      }
      reject(new Error('Connection lost'));
    });
    es.onerror = () => {
      es.close();
      reject(new Error('Connection lost'));
    };
  });
}

export async function apiScrapeVg(id, query = '') {
  const res = await fetch(`${API}/scrape/vg?id=${id}&q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function apiHistory(page = 1) {
  const res = await fetch(`${API}/history?page=${page}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function apiDirectFetch(url) {
  const res = await fetch(`${API}/fetch/url?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function apiThreadPostExtract(threadId, postIndex) {
  const res = await fetch(`${API}/fetch/thread-post?threadId=${encodeURIComponent(threadId)}&postIndex=${postIndex}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Streaming version of apiThreadPostExtract using SSE
export function apiThreadPostExtractStream(threadId, postIndex, onProgress) {
  return new Promise((resolve, reject) => {
    const url = `${API}/fetch/thread-post?threadId=${encodeURIComponent(threadId)}&postIndex=${postIndex}&stream=1`;
    const es = new EventSource(url);
    es.addEventListener('phase', (e) => {
      try { const d = JSON.parse(e.data); if (onProgress) onProgress({ type: 'phase', ...d }); } catch {}
    });
    es.addEventListener('progress', (e) => {
      try { const d = JSON.parse(e.data); if (onProgress) onProgress({ type: 'progress', ...d }); } catch {}
    });
    es.addEventListener('done', (e) => {
      es.close();
      try { resolve(JSON.parse(e.data)); } catch { reject(new Error('Invalid response')); }
    });
    es.addEventListener('error', (e) => {
      es.close();
      if (e.data) {
        try { const d = JSON.parse(e.data); reject(new Error(d.error || 'Stream error')); return; } catch {}
      }
      reject(new Error('Connection lost'));
    });
    es.onerror = () => {
      es.close();
      reject(new Error('Connection lost'));
    };
  });
}

export async function apiImxExtract(text) {
  const res = await fetch(`${API}/imx/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function apiImxUpload(url) {
  const res = await fetch(`${API}/imx/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function apiReExtract(failedLinks, previousUrls, title, sourceUrl, searchQuery) {
  const res = await fetch(`${API}/re-extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ failedLinks, previousUrls, title, sourceUrl, searchQuery }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
