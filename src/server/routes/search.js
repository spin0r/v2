"use strict";

const {
  ViperGirlsDownloader,
  AdultPhotoSetsScraper,
} = require("../../core/scraper");
const {
  md5,
  vgCache,
  apsCache,
  sendJSON,
  PAGE_SIZE,
} = require("../utils");

// ── VG SEARCH ──
async function handleVgSearch(params, res) {
  const query = params.get("q") || "";
  const page = Math.max(1, parseInt(params.get("page") || "1"));
  if (!query) return sendJSON(res, 400, { error: "Missing query" });

  const key = query.toLowerCase();
  let results;

  if (vgCache.has(key)) {
    results = vgCache.get(key);
  } else {
    const downloader = new ViperGirlsDownloader();
    const forums = [302, 303, 304];
    const all = [];
    try {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      for (let i = 0; i < forums.length; i++) {
        if (i > 0) await sleep(16000); // 16s flood-control delay between forum searches
        const [res2, searchid, totalPages, perPage] = await downloader.searchForum(query, [forums[i]]);
        if (res2.length) all.push(...res2);
        for (let p = 2; p <= totalPages; p++) {
          try {
            const [more] = await downloader.searchForumPage(searchid, p, perPage);
            if (more.length) all.push(...more);
          } catch { break; }
        }
      }
    } catch (err) {
      console.error("[VG Search Error]", err.message);
    }
    const seen = new Set();
    results = all
      .filter(r => { if (seen.has(r.url)) return false; seen.add(r.url); return true; })
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .map(r => {
        const prefix = r.prefix ? `[${r.prefix}] ` : "";
        const title = prefix + r.title;
        return { ...r, title, sgenId: md5(r.url).slice(0, 6) };
      });
    vgCache.set(key, results);
  }

  const total = results.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const slice = results.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  sendJSON(res, 200, { total, page: safePage, totalPages, results: slice });
}

// ── APS SEARCH ──
async function handleApsSearch(params, res) {
  const query = params.get("q") || "";
  const page = Math.max(1, parseInt(params.get("page") || "1"));
  if (!query) return sendJSON(res, 400, { error: "Missing query" });

  const key = query.toLowerCase();
  let results;

  if (apsCache.has(key)) {
    results = apsCache.get(key);
  } else {
    const scraper = new AdultPhotoSetsScraper();
    const raw = await scraper.searchAll(query);
    results = raw.map(r => ({ ...r, apsId: md5(r.url).slice(0, 6) }));
    apsCache.set(key, results);
  }

  const total = results.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const slice = results.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  sendJSON(res, 200, { total, page: safePage, totalPages, results: slice });
}

module.exports = { handleVgSearch, handleApsSearch };
