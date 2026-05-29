import type { ServerResponse } from "http";
import { ViperGirlsDownloader, AdultPhotoSetsScraper } from "../../core/scraper.js";
import { md5, vgCache, apsCache, sendJSON, PAGE_SIZE } from "../utils.js";

export async function handleVgSearch(params: URLSearchParams, res: ServerResponse): Promise<void> {
  const query = params.get("q") || "";
  const page = Math.max(1, parseInt(params.get("page") || "1"));
  if (!query) return sendJSON(res, 400, { error: "Missing query" });

  const forumsParam = params.get("forums");
  const forums = forumsParam
    ? forumsParam.split(",").map(Number).filter((n) => [302, 303, 304].includes(n))
    : [302, 303, 304];
  if (!forums.length) return sendJSON(res, 400, { error: "No valid forums selected" });

  const key = `${query.toLowerCase()}:${forums.sort().join(",")}`;
  let results: unknown[];

  if (vgCache.has(key)) {
    results = vgCache.get(key)!;
  } else {
    const downloader = new ViperGirlsDownloader();
    const all: unknown[] = [];
    try {
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < forums.length; i++) {
        if (i > 0) await sleep(16000);
        const [res2, searchid, totalPages, perPage] = await downloader.searchForum(query, [forums[i]]);
        if (res2.length) all.push(...res2);
        for (let p = 2; p <= totalPages; p++) {
          try {
            const [more] = await downloader.searchForumPage(searchid!, p, perPage);
            if (more.length) all.push(...more);
          } catch { break; }
        }
      }
    } catch (err) {
      console.error("[VG Search Error]", (err as Error).message);
    }
    const seen = new Set<string>();
    results = (all as { url: string; prefix?: string; title: string; timestamp?: number }[])
      .filter((r) => { if (seen.has(r.url)) return false; seen.add(r.url); return true; })
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .map((r) => ({ ...r, title: (r.prefix ? `[${r.prefix}] ` : "") + r.title, sgenId: md5(r.url).slice(0, 6) }));
    vgCache.set(key, results);
  }

  const total = results.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  sendJSON(res, 200, { total, page: safePage, totalPages, results: results.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE) });
}

export async function handleApsSearch(params: URLSearchParams, res: ServerResponse): Promise<void> {
  const query = params.get("q") || "";
  const page = Math.max(1, parseInt(params.get("page") || "1"));
  if (!query) return sendJSON(res, 400, { error: "Missing query" });

  const key = query.toLowerCase();
  let results: unknown[];

  if (apsCache.has(key)) {
    results = apsCache.get(key)!;
  } else {
    const scraper = new AdultPhotoSetsScraper();
    const raw = await scraper.searchAll(query);
    results = raw.map((r) => ({ ...r, apsId: md5(r.url).slice(0, 6) }));
    apsCache.set(key, results);
  }

  const total = results.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  sendJSON(res, 200, { total, page: safePage, totalPages, results: results.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE) });
}
