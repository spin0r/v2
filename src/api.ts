// ====== API ======
const API = "/api";

export interface SearchResult {
  title?: string;
  sgenId?: string;
  apsId?: string;
  url?: string;
  prefix?: string;
  category?: string;
  timestamp?: number;
  dateText?: string;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  totalPages?: number;
  page?: number;
}

export interface FetchResult {
  ok: boolean;
  extracted?: number;
  total?: number;
  failed?: number;
  error?: string;
  title?: string;
  sourceUrl?: string;
  pasteUrl?: string;
  sendCommand?: string;
  dlCommand?: string;
  previewUrls?: string[];
  services?: string;
  failedLinks?: string[];
  directUrls?: string[];
  hashtag?: string;
  newlyRecovered?: number;
  indexedFailedLinks?: string[];
  indexedUrls?: string[];
  threadData?: ThreadData;
  threadId?: string;
  loading?: boolean;
  loadingMsg?: string;
}

export interface ThreadPage {
  posts: Array<{
    title?: string;
    count?: number;
    links?: string[];
    postId?: string;
  }>;
}

export interface ThreadData {
  title: string;
  url?: string;
  totalPages: number;
  pages: ThreadPage[];
}

export interface ProgressEvent {
  type: "phase" | "progress";
  phase?: string;
  extracted?: number;
  total?: number;
}

export interface HistoryEntry {
  title: string;
  extracted: number;
  total: number;
  source: string;
  timestamp: string;
  pasteUrl?: string;
  sourceUrl?: string;
  sendCommand?: string;
  dlCommand?: string;
  services?: string;
  ok?: boolean;
  error?: string;
  failedLinks?: string[];
  directUrls?: string[];
  hashtag?: string;
  indexedFailedLinks?: string[];
  indexedUrls?: string[];
  previewUrls?: string[];
  failed?: number;
  newlyRecovered?: number;
}

export interface HistoryResponse {
  results: HistoryEntry[];
  total: number;
  totalPages: number;
  page: number;
}

export interface ImxResult {
  ok: boolean;
  total?: number;
  extracted?: number;
  uploaded?: number;
  failed?: number;
  error?: string;
  pasteUrl?: string;
  galleryUrl?: string;
  previewUrls?: string[];
}

export interface RssEntry {
  title: string;
  link?: string;
  prefix?: string;
  dateText?: string;
  author?: string;
  thumbCount?: number;
}

export interface RssResponse {
  ok: boolean;
  entries: RssEntry[];
  feedTitle?: string;
  feedUpdated?: string;
  error?: string;
}

export async function apiSearch(
  tab: string,
  query: string,
  page = 1,
  forums?: number[],
): Promise<SearchResponse> {
  const endpoint = tab === "vg" ? "/search/vg" : "/search/aps";
  let url = `${API}${endpoint}?q=${encodeURIComponent(query)}&page=${page}`;
  if (forums && forums.length) url += `&forums=${forums.join(",")}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function apiFetch(
  tab: string,
  id: string,
  query = "",
): Promise<FetchResult> {
  const endpoint = tab === "vg" ? "/fetch/vg" : "/fetch/aps";
  const res = await fetch(
    `${API}${endpoint}?id=${id}&q=${encodeURIComponent(query)}`,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Streaming version of apiFetch using SSE
export function apiFetchStream(
  tab: string,
  id: string,
  query = "",
  onProgress?: (event: ProgressEvent) => void,
): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    const endpoint = tab === "vg" ? "/fetch/vg" : "/fetch/aps";
    const url = `${API}${endpoint}?id=${id}&q=${encodeURIComponent(query)}&stream=1`;
    const es = new EventSource(url);
    es.addEventListener("phase", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data);
        if (onProgress) onProgress({ type: "phase", ...d });
      } catch {
        /* ignore parse errors */
      }
    });
    es.addEventListener("progress", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data);
        if (onProgress) onProgress({ type: "progress", ...d });
      } catch {
        /* ignore parse errors */
      }
    });
    es.addEventListener("done", (e: MessageEvent) => {
      es.close();
      try {
        resolve(JSON.parse(e.data));
      } catch {
        reject(new Error("Invalid response"));
      }
    });
    es.addEventListener("error", ((e: MessageEvent) => {
      es.close();
      // Try to parse error data if available
      if (e.data) {
        try {
          const d = JSON.parse(e.data);
          reject(new Error(d.error || "Stream error"));
          return;
        } catch {
          /* ignore parse errors */
        }
      }
      reject(new Error("Connection lost"));
    }) as EventListener);
    es.onerror = () => {
      es.close();
      reject(new Error("Connection lost"));
    };
  });
}

export async function apiScrapeVg(
  id: string,
  query = "",
): Promise<FetchResult> {
  const res = await fetch(
    `${API}/scrape/vg?id=${id}&q=${encodeURIComponent(query)}`,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function apiHistory(page = 1): Promise<HistoryResponse> {
  const res = await fetch(`${API}/history?page=${page}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function apiDirectFetch(url: string): Promise<FetchResult> {
  const res = await fetch(`${API}/fetch/url?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function apiThreadPostExtract(
  threadId: string,
  postIndex: number,
): Promise<FetchResult> {
  const res = await fetch(
    `${API}/fetch/thread-post?threadId=${encodeURIComponent(threadId)}&postIndex=${postIndex}`,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Streaming version of apiThreadPostExtract using SSE
export function apiThreadPostExtractStream(
  threadId: string,
  postIndex: number,
  onProgress?: (event: ProgressEvent) => void,
): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    const url = `${API}/fetch/thread-post?threadId=${encodeURIComponent(threadId)}&postIndex=${postIndex}&stream=1`;
    const es = new EventSource(url);
    es.addEventListener("phase", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data);
        if (onProgress) onProgress({ type: "phase", ...d });
      } catch {
        /* ignore parse errors */
      }
    });
    es.addEventListener("progress", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data);
        if (onProgress) onProgress({ type: "progress", ...d });
      } catch {
        /* ignore parse errors */
      }
    });
    es.addEventListener("done", (e: MessageEvent) => {
      es.close();
      try {
        resolve(JSON.parse(e.data));
      } catch {
        reject(new Error("Invalid response"));
      }
    });
    es.addEventListener("error", ((e: MessageEvent) => {
      es.close();
      if (e.data) {
        try {
          const d = JSON.parse(e.data);
          reject(new Error(d.error || "Stream error"));
          return;
        } catch {
          /* ignore parse errors */
        }
      }
      reject(new Error("Connection lost"));
    }) as EventListener);
    es.onerror = () => {
      es.close();
      reject(new Error("Connection lost"));
    };
  });
}

export async function apiImxExtract(text: string): Promise<ImxResult> {
  const res = await fetch(`${API}/imx/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function apiImxUpload(url: string): Promise<ImxResult> {
  const res = await fetch(`${API}/imx/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Streaming version of apiImxUpload using SSE
export function apiImxUploadStream(
  url: string,
  onProgress?: (event: { type: string; phase?: string; done?: number; total?: number; success?: number; fail?: number; galleryId?: string | null }) => void,
): Promise<ImxResult> {
  return new Promise((resolve, reject) => {
    // We need to POST to get SSE, so we use fetch + ReadableStream
    fetch(`${API}/imx/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, stream: true }),
    })
      .then((res) => {
        if (!res.ok) return reject(new Error(`HTTP ${res.status}`));
        if (!res.body) return reject(new Error("No response body"));
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        function processLine(line: string) {
          if (line.startsWith("event: ")) {
            // Store event type for next data line
            (processLine as any).__evt = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const evt = (processLine as any).__evt || "";
            try {
              const d = JSON.parse(line.slice(6));
              if (evt === "done") resolve(d);
              else if (evt === "error") reject(new Error(d.error || "Stream error"));
              else if (evt === "phase" && onProgress) onProgress({ type: "phase", phase: d.phase, total: d.total });
              else if (evt === "progress" && onProgress) onProgress({ type: "progress", done: d.done, total: d.total, success: d.success, fail: d.fail, galleryId: d.galleryId });
            } catch { /* ignore parse errors */ }
          }
        }

        function pump(): Promise<void> {
          return reader.read().then(({ done, value }) => {
            if (done) return;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const l of lines) processLine(l.trim());
            return pump();
          });
        }
        pump().catch(reject);
      })
      .catch(reject);
  });
}

export async function apiReExtract(
  failedLinks: string[],
  previousUrls: string[],
  title: string,
  sourceUrl: string,
  searchQuery: string,
  indexedFailedLinks?: string[],
  indexedUrls?: string[],
): Promise<FetchResult> {
  const res = await fetch(`${API}/re-extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      failedLinks,
      previousUrls,
      title,
      sourceUrl,
      searchQuery,
      indexedFailedLinks,
      indexedUrls,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
