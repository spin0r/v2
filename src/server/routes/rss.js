"use strict";

const cheerio = require("cheerio");
const { sendJSON } = require("../utils");

function parseForumPage(html) {
  const $ = cheerio.load(html);
  const entries = [];

  $('li.threadbit, li[id^="thread_"]').each((_, el) => {
    const titleTag = $(el).find('a[id^="thread_title_"]').first();
    if (!titleTag.length) return;

    // Thread URL (real link like threads/16244690-Lilibet-Saunders-...)
    let href = titleTag.attr("href") || "";
    if (href && !href.startsWith("http")) href = "https://viper.to/" + href.replace(/^\//, "");
    // Strip session tokens
    href = href.replace(/\?s=[^&]*/, "").replace(/&s=[^&]*/g, "");

    const title = titleTag.text().trim();

    // Thumbnail previews from data-images attribute
    let thumbnails = [];
    const dataImages = titleTag.attr("data-images");
    if (dataImages) {
      try {
        thumbnails = JSON.parse(dataImages.replace(/&quot;/g, '"'));
      } catch {}
    }

    // Prefix/studio tag
    const prefixTag = $(el).find('span[id^="thread_prefix_"]').first();
    const prefix = prefixTag.length
      ? prefixTag.text().trim().replace(/^\[|\]$/g, "")
      : "";

    // Author and date from "Started by" label
    const labelSpan = $(el).find("span.label").first();
    let author = "";
    let dateText = "";
    let published = "";
    if (labelSpan.length) {
      const authorTag = labelSpan.find("a.username").first();
      if (authorTag.length) author = authorTag.text().trim();

      // Try title attr for full date: "Started by Rex on Today 05:10"
      const titleAttr = authorTag.attr("title") || "";
      const onDateMatch = titleAttr.match(/on\s+(.+)$/i);
      if (onDateMatch) dateText = onDateMatch[1].trim();

      // Fallback: parse from label text
      if (!dateText) {
        const raw = labelSpan.text().replace(/\u00a0/g, " ").trim();
        const afterComma = raw.split(",").slice(1).join(",").trim();
        if (afterComma) dateText = afterComma;
      }

      // Convert "Today HH:MM" / "Yesterday HH:MM" / "22nd May 2026 05:10" to ISO
      const now = new Date();
      const todayMatch = dateText.match(/^Today\s+(\d{1,2}):(\d{2})/i);
      const yestMatch = dateText.match(/^Yesterday\s+(\d{1,2}):(\d{2})/i);
      const fullMatch = dateText.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})\s+(\d{1,2}):(\d{2})/i);

      if (todayMatch) {
        const d = new Date(now); d.setHours(parseInt(todayMatch[1]), parseInt(todayMatch[2]), 0, 0);
        published = d.toISOString();
      } else if (yestMatch) {
        const d = new Date(now); d.setDate(d.getDate() - 1);
        d.setHours(parseInt(yestMatch[1]), parseInt(yestMatch[2]), 0, 0);
        published = d.toISOString();
      } else if (fullMatch) {
        const months = { january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,september:8,october:9,november:10,december:11 };
        const m = months[fullMatch[2].toLowerCase()];
        if (m !== undefined) {
          const d = new Date(parseInt(fullMatch[3]), m, parseInt(fullMatch[1]), parseInt(fullMatch[4]), parseInt(fullMatch[5]));
          published = d.toISOString();
        }
      }
    }

    // Thread stats (replies/views)
    let replies = "", views = "";
    $(el).find("ul.threadstats li").each((_, li) => {
      const t = $(li).text().trim();
      if (t.startsWith("Replies:")) replies = t.slice(8).trim();
      else if (t.toLowerCase().startsWith("views:")) views = t.split(":")[1].trim();
    });

    // Thread ID from element id
    const elId = $(el).attr("id") || "";
    const threadIdMatch = elId.match(/thread_(\d+)/);
    const threadId = threadIdMatch ? threadIdMatch[1] : "";

    entries.push({
      title,
      prefix,
      link: href,
      threadId,
      author,
      dateText,
      published,
      replies,
      views,
      thumbnails,
    });
  });

  return entries;
}

async function handleRssFeed(params, res) {
  const forumUrl = 'https://viper.to/forums/304-Hardcore-Photo-Sets';
  try {
    const axios = require('axios');
    const resp = await axios.get(forumUrl, {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });

    const entries = parseForumPage(resp.data);
    const feedUpdated = new Date().toISOString();

    sendJSON(res, 200, {
      ok: true,
      feedTitle: 'Hardcore Photo Sets',
      feedUpdated,
      total: entries.length,
      entries,
    });
  } catch (err) {
    console.error('[RSS Feed Error]', err.message);
    sendJSON(res, 500, { ok: false, error: err.message });
  }
}

// Serve proper Atom XML feed at /api/rss.xml
async function handleRssXml(params, res) {
  const forumUrl = 'https://viper.to/forums/304-Hardcore-Photo-Sets';
  try {
    const axios = require('axios');
    const resp = await axios.get(forumUrl, {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });

    const entries = parseForumPage(resp.data);
    const now = new Date().toISOString();

    const escXml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<feed xmlns="http://www.w3.org/2005/Atom">\n`;
    xml += `  <id>https://viper.to/forums/304-Hardcore-Photo-Sets</id>\n`;
    xml += `  <title>Hardcore Photo Sets</title>\n`;
    xml += `  <updated>${now}</updated>\n`;
    xml += `  <link href="https://viper.to/forums/304-Hardcore-Photo-Sets" rel="alternate"/>\n`;
    xml += `  <link href="/api/rss.xml" rel="self"/>\n`;

    for (const e of entries) {
      xml += `  <entry>\n`;
      xml += `    <id>${escXml(e.link)}</id>\n`;
      xml += `    <title>${escXml(e.title)}</title>\n`;
      xml += `    <link href="${escXml(e.link)}"/>\n`;
      if (e.published) xml += `    <published>${e.published}</published>\n`;
      xml += `    <updated>${e.published || now}</updated>\n`;
      if (e.author) xml += `    <author><name>${escXml(e.author)}</name></author>\n`;
      if (e.prefix) xml += `    <category term="${escXml(e.prefix)}"/>\n`;
      if (e.thumbnails.length) {
        xml += `    <content type="html">${escXml(e.thumbnails.map(t => `<img src="${t}"/>`).join(' '))}</content>\n`;
      }
      xml += `  </entry>\n`;
    }

    xml += `</feed>\n`;

    res.writeHead(200, {
      'Content-Type': 'application/atom+xml; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(xml);
  } catch (err) {
    console.error('[RSS XML Error]', err.message);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(`Error: ${err.message}`);
  }
}

module.exports = { handleRssFeed, handleRssXml };
