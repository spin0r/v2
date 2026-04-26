"use strict";

const axios = require("axios");
const cheerio = require("cheerio");
const { ImageHostExtractor, IMAGE_HOSTS } = require("./extractor");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getPage(url, session) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await session.get(url, { timeout: 30000 });
      return res.data;
    } catch {
      if (attempt < 2) await sleep(2000);
    }
  }
  return null;
}

class ViperGirlsDownloader {
  constructor() {
    this.session = axios.create({
      headers: { "User-Agent": UA },
      maxRedirects: 5,
    });
    this.extractor = new ImageHostExtractor();
  }

  extractPostsWithTitles(html) {
    const $ = cheerio.load(html);
    const posts = [];
    $("li.postbitlegacy").each((_, el) => {
      const id = $(el).attr("id") || "";
      if (id.includes("post_thanks_box")) return;
      let title = null;
      for (const [tag, cls] of [
        ["h2", "title"],
        ["div", "title"],
      ]) {
        const found = $(el).find(`${tag}.${cls}`).first();
        if (found.length) {
          title = found.text().trim();
          break;
        }
      }
      if (!title) {
        const found = $(el).find('[class*="title"]').first();
        if (found.length) title = found.text().trim();
      }
      const content = $(el).find("blockquote.postcontent");
      if (!content.length) return;
      const links = [];
      content.find("a[href]").each((_, a) => {
        const href = $(a).attr("href") || "";
        if (IMAGE_HOSTS.some((h) => href.includes(h))) links.push(href);
      });
      if (links.length) posts.push({ title, links, count: links.length });
    });
    return posts;
  }

  getTotalPages(html) {
    const $ = cheerio.load(html);
    for (const tag of ["a", "span"]) {
      const el = $(`${tag}.popupctrl`).first();
      if (el.length) {
        const m = el.text().match(/Page \d+ of (\d+)/);
        if (m) return parseInt(m[1]);
      }
    }
    return 1;
  }

  async scrapeThread(threadUrl, titleFilter = null, progressCallback = null) {
    const baseUrl = threadUrl.replace(/\/page\d+/, "");
    const html = await getPage(baseUrl, this.session);
    if (!html) return [[], 1];
    const totalPages = this.getTotalPages(html);

    const fetchPage = async (n) => {
      if (progressCallback) progressCallback(n, totalPages);
      if (n === 1) return [n, this.extractPostsWithTitles(html)];
      const pageHtml = await getPage(`${baseUrl}/page${n}`, this.session);
      return [n, pageHtml ? this.extractPostsWithTitles(pageHtml) : []];
    };

    // Fetch all pages concurrently (max 5 at a time)
    const pageNums = Array.from({ length: totalPages }, (_, i) => i + 1);
    const chunks = [];
    for (let i = 0; i < pageNums.length; i += 5)
      chunks.push(pageNums.slice(i, i + 5));

    const pageResults = {};
    for (const chunk of chunks) {
      const results = await Promise.all(chunk.map((n) => fetchPage(n)));
      for (const [n, posts] of results) pageResults[n] = posts;
    }

    const structured = [];
    for (const n of Object.keys(pageResults)
      .map(Number)
      .sort((a, b) => a - b)) {
      let posts = pageResults[n];
      if (titleFilter)
        posts = posts.filter(
          (p) =>
            p.title &&
            p.title.toLowerCase().includes(titleFilter.toLowerCase()),
        );
      if (posts.length) structured.push({ page_num: n, posts });
    }
    return [structured, totalPages];
  }

  async searchForum(query, forumIds = [302, 303, 304]) {
    // Support both single forumId (number) and multiple forumIds (array)
    const forums = Array.isArray(forumIds) ? forumIds : [forumIds];

    const params = {
      do: "process",
      q: query,
      showposts: "0",
      s: "",
      securitytoken: "guest",
      contenttype: "vBForum_Post",
      "forumchoice[]": forums.map(String),
      childforums: "1",
      exactname: "1",
    };

    try {
      const res = await this.session.get("https://viper.to/search.php", {
        params,
        timeout: 30000,
        maxRedirects: 5,
      });
      const m =
        res.request?.res?.responseUrl?.match(/searchid=(\d+)/) ||
        res.config?.url?.match(/searchid=(\d+)/);
      // axios follows redirects, grab final URL from response
      const finalUrl = res.request?.res?.responseUrl || "";
      const searchidMatch = finalUrl.match(/searchid=(\d+)/);
      const searchid = searchidMatch ? searchidMatch[1] : null;
      const [results, totalPages, perPage] = this._parseSearchResults(res.data);
      return [results, searchid, totalPages, perPage];
    } catch (e) {
      console.warn("[VG] search failed:", e.message);
      return [[], null, 1, 50];
    }
  }

  async searchForumPage(searchid, page = 1, perPage = 50) {
    try {
      const res = await this.session.get("https://viper.to/search.php", {
        params: { searchid, pp: perPage, page },
        timeout: 30000,
      });
      const [results, totalPages, pp] = this._parseSearchResults(res.data);
      return [results, totalPages, pp];
    } catch (e) {
      console.warn(`[VG] search page ${page} failed:`, e.message);
      return [[], 1, perPage];
    }
  }

  _parseSearchResults(html) {
    const $ = cheerio.load(html);
    const results = [];
    $('li.threadbit, li[id^="thread_"]').each((_, el) => {
      const titleTag = $(el).find('a[id^="thread_title_"]').first();
      if (!titleTag.length) return;
      let href = titleTag.attr("href") || "";
      if (href && !href.startsWith("http"))
        href = "https://viper.to/" + href.replace(/^\//, "");
      
      // Normalize URL by stripping session tokens and highlights
      // Thread urls look like: "https://viper.to/threads/16140685-Eve-Sweet?s=4bb1e..."
      href = href.replace(/\?.*$/, "");
      const prefixTag = $(el).find('span[id^="thread_prefix_"]').first();
      const prefix = prefixTag.length
        ? prefixTag
            .text()
            .trim()
            .replace(/^\[|\]$/g, "")
        : "";
      const authorTag = $(el).find(".author a.username, span.label a").first();
      let replies = "",
        views = "";
      $(el)
        .find("ul.threadstats li")
        .each((_, li) => {
          const t = $(li).text().trim();
          if (t.startsWith("Replies:")) replies = t.slice(8).trim();
          else if (t.toLowerCase().startsWith("views:"))
            views = t.split(":")[1].trim();
        });

      // Extract date/time information from "Started by" label
      let dateText = "";
      let timestamp = 0;

      // Look for the "Started by" span with date info
      const labelSpan = $(el).find("span.label").first();
      if (labelSpan.length) {
        const labelText = labelSpan.text().trim();
        dateText = labelText;

        // Check for title attribute with date (e.g., "Started by Califa on 28th December 2025 09:03")
        const titleAttr = labelSpan.find("a").attr("title");
        if (titleAttr) {
          const titleMatch = titleAttr.match(
            /on\s+(\d{1,2})(?:st|nd|rd|th)\s+(\w+)\s+(\d{4})\s+(\d{2}):(\d{2})/i,
          );
          if (titleMatch) {
            const [, day, monthName, year, hour, minute] = titleMatch;
            const months = {
              january: 0,
              february: 1,
              march: 2,
              april: 3,
              may: 4,
              june: 5,
              july: 6,
              august: 7,
              september: 8,
              october: 9,
              november: 10,
              december: 11,
            };
            const month = months[monthName.toLowerCase()];
            if (month !== undefined) {
              const date = new Date(
                parseInt(year),
                month,
                parseInt(day),
                parseInt(hour),
                parseInt(minute),
              );
              timestamp = date.getTime() / 1000;
            }
          }
        }

        // Fallback: parse from label text (e.g., "28th December 2025 09:03")
        if (!timestamp) {
          const textMatch = labelText.match(
            /(\d{1,2})(?:st|nd|rd|th)\s+(\w+)\s+(\d{4})\s+(\d{2}):(\d{2})/i,
          );
          if (textMatch) {
            const [, day, monthName, year, hour, minute] = textMatch;
            const months = {
              january: 0,
              february: 1,
              march: 2,
              april: 3,
              may: 4,
              june: 5,
              july: 6,
              august: 7,
              september: 8,
              october: 9,
              november: 10,
              december: 11,
            };
            const month = months[monthName.toLowerCase()];
            if (month !== undefined) {
              const date = new Date(
                parseInt(year),
                month,
                parseInt(day),
                parseInt(hour),
                parseInt(minute),
              );
              timestamp = date.getTime() / 1000;
            }
          }
        }
      }

      results.push({
        title: titleTag.text().trim(),
        prefix,
        url: href,
        author: authorTag.length ? authorTag.text().trim() : "",
        replies,
        views,
        dateText,
        timestamp,
      });
    });

    // Sort results by timestamp (newest first)
    results.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    let totalPages = 1,
      perPage = 50;
    const ctrl = $("a.popupctrl").first();
    if (ctrl.length) {
      const m = ctrl.text().match(/Page \d+ of (\d+)/);
      if (m) totalPages = parseInt(m[1]);
    }
    const stats = $("#postpagestats, #threadpagestats, .pagestats").first();
    if (stats.length) {
      const m = stats.text().match(/([\d,]+)\s+to\s+([\d,]+)\s+of\s+([\d,]+)/);
      if (m) {
        const [s, e, tot] = m
          .slice(1)
          .map((x) => parseInt(x.replace(/,/g, "")));
        const pp = e - s + 1;
        if (pp > 0) {
          perPage = pp;
          totalPages = Math.ceil(tot / pp);
        }
      }
    }
    return [results, totalPages, perPage];
  }
}

class AdultPhotoSetsScraper {
  constructor() {
    this.BASE_URL = "https://adultphotosets.best";
    this.RESULTS_PER_PAGE = 10;
    this.session = axios.create({
      headers: {
        "User-Agent": UA,
        Referer: "https://adultphotosets.best/",
      },
      timeout: 20000,
    });
  }

  async _post(url, data) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await this.session.post(url, data, {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
        return res.data;
      } catch {
        if (attempt < 2) await sleep(1000);
      }
    }
    return null;
  }

  async _get(url) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await this.session.get(url);
        return res.data;
      } catch {
        if (attempt < 2) await sleep(1000);
      }
    }
    return null;
  }

  async searchAll(query) {
    const [results, totalPages] = await this.search(query, 1);
    const allSearch = [...results];
    for (let page = 2; page <= totalPages; page++) {
      try {
        const [more] = await this.search(query, page);
        if (more.length) allSearch.push(...more);
      } catch {
        break;
      }
    }

    let tagResults = [];
    try {
      tagResults = await this.getTagResults(query);
    } catch {}

    const seenUrls = new Set();
    const merged = [];
    for (const r of allSearch) {
      if (!seenUrls.has(r.url)) {
        seenUrls.add(r.url);
        merged.push(r);
      }
    }
    for (const r of tagResults) {
      if (!seenUrls.has(r.url)) {
        seenUrls.add(r.url);
        merged.push(r);
      }
    }
    return merged;
  }

  async search(query, page = 1) {
    const allowedCats = [
      "24",
      "33",
      "34",
      "17",
      "15",
      "32",
      "10",
      "12",
      "16",
      "13",
      "14",
    ];
    const params = new URLSearchParams([
      ["do", "search"],
      ["subaction", "search"],
      ["search_start", String(page - 1)],
      ["full_search", "1"],
      ["result_from", String((page - 1) * this.RESULTS_PER_PAGE + 1)],
      ["story", query],
      ["sortby", "date"],
      ["resorder", "desc"],
      ["searchdate", "0"],
      ["beforeafter", "after"],
      ...allowedCats.map((c) => ["catlist[]", c]),
    ]);
    const html = await this._post(
      `${this.BASE_URL}/index.php?do=search`,
      params.toString(),
    );
    if (!html) return [[], 1];
    return this._parseSearch(html);
  }

  _parseSearch(html) {
    const $ = cheerio.load(html);
    const results = [];
    $("article.story").each((_, el) => {
      const h2 = $(el).find("h2.title");
      const link = h2.find("a").first();
      if (!link.length) return;
      const url = link.attr("href") || "";
      const title = link.text().trim();
      const catDiv = $(el).find("div.category");
      const category = catDiv.length ? catDiv.text().trim() : "";
      const thumb = $(el).find("img").first();
      let thumbUrl = thumb.attr("data-src") || thumb.attr("src") || "";
      if (thumbUrl && !thumbUrl.startsWith("http"))
        thumbUrl = this.BASE_URL + thumbUrl;
      results.push({ title, url, category, thumb: thumbUrl });
    });

    let totalPages = 1;
    const nav = $("div.navigation");
    if (nav.length) {
      const pagesDiv = nav.find("div.pages");
      if (pagesDiv.length) {
        const nums = [...pagesDiv.html().matchAll(/list_submit\((\d+)\)/g)].map(
          (m) => parseInt(m[1]),
        );
        if (nums.length) totalPages = Math.max(...nums);
      }
    }
    return [results, totalPages];
  }

  async getTagResults(query) {
    const tagSlug = encodeURIComponent(
      query.replace(/\b\w/g, (c) => c.toUpperCase()),
    );
    const base = `${this.BASE_URL}/tags/${tagSlug}/`;

    const fetchPage = async (n) => {
      const url = n === 1 ? base : `${base}page/${n}/`;
      const html = await this._get(url);
      if (!html) return [[], 0];
      const $ = cheerio.load(html);
      const results = [];
      $("article.story").each((_, el) => {
        const h2 = $(el).find("h2.title");
        const link = h2.find("a").first();
        if (!link.length) return;
        const catDiv = $(el).find("div.category");
        results.push({
          title: link.text().trim(),
          url: link.attr("href") || "",
          category: catDiv.length ? catDiv.text().trim() : "",
        });
      });
      let total = 1;
      const nav = $("div.navigation div.pages");
      if (nav.length) {
        const nums = [...nav.html().matchAll(/\/page\/(\d+)\//g)].map((m) =>
          parseInt(m[1]),
        );
        if (nums.length) total = Math.max(...nums);
      }
      return [results, total];
    };

    const [first, totalPages] = await fetchPage(1);
    const all = [...first];
    for (let page = 2; page <= totalPages; page++) {
      const [more] = await fetchPage(page);
      if (more.length) all.push(...more);
    }
    return all;
  }

  async getTagResultsFromUrl(tagUrl) {
    /**Fetch all results from a tag URL directly without extracting tag name.*/
    // Normalize URL - remove trailing slash
    const baseUrl = tagUrl.replace(/\/$/, "");

    const fetchPage = async (n) => {
      const url = n === 1 ? baseUrl : `${baseUrl}/page/${n}/`;
      const html = await this._get(url);
      if (!html) return [[], 0];
      const $ = cheerio.load(html);
      const results = [];
      $("article.story").each((_, el) => {
        const h2 = $(el).find("h2.title");
        const link = h2.find("a").first();
        if (!link.length) return;
        const catDiv = $(el).find("div.category");
        results.push({
          title: link.text().trim(),
          url: link.attr("href") || "",
          category: catDiv.length ? catDiv.text().trim() : "",
        });
      });
      let total = 1;
      const nav = $("div.navigation div.pages");
      if (nav.length) {
        const nums = [...nav.html().matchAll(/\/page\/(\d+)\//g)].map((m) =>
          parseInt(m[1]),
        );
        if (nums.length) total = Math.max(...nums);
      }
      return [results, total];
    };

    const [first, totalPages] = await fetchPage(1);
    const all = [...first];
    for (let page = 2; page <= totalPages; page++) {
      const [more] = await fetchPage(page);
      if (more.length) all.push(...more);
    }
    return all;
  }

  async getPostLinks(postUrl) {
    const html = await this._get(postUrl);
    if (!html) return [];
    const $ = cheerio.load(html);
    const content = $("div.full_story, article, div#dle-content").first();
    if (!content.length) return [];
    const links = [];
    content.find("a[href]").each((_, a) => {
      const href = $(a).attr("href") || "";
      if (IMAGE_HOSTS.some((h) => href.includes(h))) links.push(href);
    });
    return links;
  }
}

module.exports = { ViperGirlsDownloader, AdultPhotoSetsScraper };
