import axios from "axios";
import * as cheerio from "cheerio";
import type { ServerResponse } from "http";
import { sendJSON } from "../utils.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const FORUM_URL = "https://vipergirls.to/forums/304-Hardcore-Photo-Sets";

interface RssEntry {
  title: string;
  prefix: string;
  link: string;
  threadId: string;
  author: string;
  dateText: string;
  published: string;
  replies: string;
  views: string;
  thumbnails: string[];
}

function parseForumPage(html: string): RssEntry[] {
  const $ = cheerio.load(html);
  const entries: RssEntry[] = [];
  const MONTHS: Record<string, number> = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  };

  $('li.threadbit, li[id^="thread_"]').each((_, el) => {
    const titleTag = $(el).find('a[id^="thread_title_"]').first();
    if (!titleTag.length) return;
    let href = titleTag.attr("href") || "";
    if (href && !href.startsWith("http")) href = "https://vipergirls.to/" + href.replace(/^\//, "");
    href = href.replace(/\?s=[^&]*/, "").replace(/&s=[^&]*/g, "");

    let thumbnails: string[] = [];
    const dataImages = titleTag.attr("data-images");
    if (dataImages) { try { thumbnails = JSON.parse(dataImages.replace(/&quot;/g, '"')); } catch {} }

    const prefixTag = $(el).find('span[id^="thread_prefix_"]').first();
    const prefix = prefixTag.length ? prefixTag.text().trim().replace(/^\[|\]$/g, "") : "";

    const labelSpan = $(el).find("span.label").first();
    let author = "", dateText = "", published = "";
    if (labelSpan.length) {
      const authorTag = labelSpan.find("a.username").first();
      if (authorTag.length) author = authorTag.text().trim();
      const titleAttr = authorTag.attr("title") || "";
      const onDateMatch = titleAttr.match(/on\s+(.+)$/i);
      if (onDateMatch) dateText = onDateMatch[1].trim();
      if (!dateText) {
        const raw = labelSpan.text().replace(/\u00a0/g, " ").trim();
        const afterComma = raw.split(",").slice(1).join(",").trim();
        if (afterComma) dateText = afterComma;
      }
      const now = new Date();
      const todayMatch = dateText.match(/^Today\s+(\d{1,2}):(\d{2})/i);
      const yestMatch = dateText.match(/^Yesterday\s+(\d{1,2}):(\d{2})/i);
      const fullMatch = dateText.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})\s+(\d{1,2}):(\d{2})/i);
      if (todayMatch) {
        const d = new Date(now); d.setHours(+todayMatch[1], +todayMatch[2], 0, 0); published = d.toISOString();
      } else if (yestMatch) {
        const d = new Date(now); d.setDate(d.getDate() - 1); d.setHours(+yestMatch[1], +yestMatch[2], 0, 0); published = d.toISOString();
      } else if (fullMatch) {
        const m = MONTHS[fullMatch[2].toLowerCase()];
        if (m !== undefined) published = new Date(+fullMatch[3], m, +fullMatch[1], +fullMatch[4], +fullMatch[5]).toISOString();
      }
    }

    let replies = "", views = "";
    $(el).find("ul.threadstats li").each((_, li) => {
      const t = $(li).text().trim();
      if (t.startsWith("Replies:")) replies = t.slice(8).trim();
      else if (t.toLowerCase().startsWith("views:")) views = t.split(":")[1].trim();
    });

    const elId = $(el).attr("id") || "";
    const threadIdMatch = elId.match(/thread_(\d+)/);
    entries.push({ title: titleTag.text().trim(), prefix, link: href, threadId: threadIdMatch?.[1] || "", author, dateText, published, replies, views, thumbnails });
  });
  return entries;
}

export async function handleRssFeed(_params: URLSearchParams, res: ServerResponse): Promise<void> {
  try {
    const resp = await axios.get(FORUM_URL, { timeout: 15000, headers: { "User-Agent": UA } });
    const entries = parseForumPage(resp.data);
    sendJSON(res, 200, { ok: true, feedTitle: "Hardcore Photo Sets", feedUpdated: new Date().toISOString(), total: entries.length, entries });
  } catch (err) {
    sendJSON(res, 500, { ok: false, error: (err as Error).message });
  }
}

export async function handleRssXml(_params: URLSearchParams, res: ServerResponse): Promise<void> {
  try {
    const resp = await axios.get(FORUM_URL, { timeout: 15000, headers: { "User-Agent": UA } });
    const entries = parseForumPage(resp.data);
    const now = new Date().toISOString();
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom">\n`;
    xml += `  <id>${FORUM_URL}</id>\n  <title>Hardcore Photo Sets</title>\n  <updated>${now}</updated>\n`;
    xml += `  <link href="${FORUM_URL}" rel="alternate"/>\n  <link href="/api/rss.xml" rel="self"/>\n`;
    for (const e of entries) {
      xml += `  <entry>\n    <id>${esc(e.link)}</id>\n    <title>${esc(e.title)}</title>\n    <link href="${esc(e.link)}"/>\n`;
      if (e.published) xml += `    <published>${e.published}</published>\n`;
      xml += `    <updated>${e.published || now}</updated>\n`;
      if (e.author) xml += `    <author><name>${esc(e.author)}</name></author>\n`;
      if (e.prefix) xml += `    <category term="${esc(e.prefix)}"/>\n`;
      if (e.thumbnails.length) xml += `    <content type="html">${esc(e.thumbnails.map((t) => `<img src="${t}"/>`).join(" "))}</content>\n`;
      xml += `  </entry>\n`;
    }
    xml += `</feed>\n`;
    res.writeHead(200, { "Content-Type": "application/atom+xml; charset=utf-8", "Access-Control-Allow-Origin": "*" });
    res.end(xml);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end(`Error: ${(err as Error).message}`);
  }
}
