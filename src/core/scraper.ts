import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import { ImageHostExtractor, IMAGE_HOSTS } from './extractor';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function getPage(
  url: string,
  session: AxiosInstance,
): Promise<string | null> {
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

export interface PostData {
  title: string | null;
  links: string[];
  count: number;
  postId?: string;
}

export interface PageData {
  page_num: number;
  posts: PostData[];
}

export interface SearchResult {
  title: string;
  prefix: string;
  url: string;
  author: string;
  replies: string;
  views: string;
  dateText: string;
  timestamp: number;
}

export interface ApsResult {
  title: string;
  url: string;
  category: string;
  thumb?: string;
}

export class ViperGirlsDownloader {
  private session: AxiosInstance;
  extractor: ImageHostExtractor;

  constructor() {
    this.session = axios.create({
      headers: { 'User-Agent': UA },
      maxRedirects: 5,
    });
    this.extractor = new ImageHostExtractor();
  }

  extractPostsWithTitles(html: string): PostData[] {
    const $ = cheerio.load(html);
    const posts: PostData[] = [];
    $('li.postbitlegacy').each((_, el) => {
      const id = $(el).attr('id') || '';
      if (id.includes('post_thanks_box')) return;
      // Extract numeric post ID from element id like "post_167829348"
      const postId = id.startsWith('post_')
        ? id.replace('post_', '')
        : undefined;
      let title: string | null = null;
      for (const [tag, cls] of [
        ['h2', 'title'],
        ['div', 'title'],
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
      const content = $(el).find('blockquote.postcontent');
      if (!content.length) return;

      // Try to extract more complete title from post body
      let bodyTitle: string | null = null;
      const boldTags = content.find('b');
      for (let i = 0; i < boldTags.length; i++) {
        const boldEl = $(boldTags[i]);
        let boldText = boldEl.text().trim();

        // If the bold tag contains <br>, only take text before the first <br>
        const firstBr = boldEl.find('br').first();
        if (firstBr.length > 0) {
          // Get text nodes before the first <br>
          let textBeforeBr = '';
          boldEl.contents().each((_, node) => {
            if (node === firstBr[0]) return false; // Stop at first <br>
            if (node.type === 'text') {
              textBeforeBr += $(node).text();
            }
          });
          boldText = textBeforeBr.trim();
        }

        // Look for pattern: "Title MM/DD/YY - size info" (dash before date is optional)
        if (/^.+?\s+\d{2}\/\d{2}\/\d{2,4}\s*-\s*.+$/i.test(boldText)) {
          bodyTitle = boldText;
          break;
        }
      }

      // If we found a complete title in body, use it
      if (bodyTitle) {
        title = bodyTitle;
      }

      const links: string[] = [];
      content.find('a[href]').each((_, a) => {
        const href = $(a).attr('href') || '';
        if (IMAGE_HOSTS.some((h) => href.includes(h))) links.push(href);
      });
      if (links.length)
        posts.push({ title, links, count: links.length, postId });
    });
    return posts;
  }

  getTotalPages(html: string): number {
    const $ = cheerio.load(html);
    for (const tag of ['a', 'span']) {
      const el = $(`${tag}.popupctrl`).first();
      if (el.length) {
        const m = el.text().match(/Page \d+ of (\d+)/);
        if (m) return parseInt(m[1]);
      }
    }
    return 1;
  }

  async scrapeThread(
    threadUrl: string,
    titleFilter: string | null = null,
    progressCallback: ((current: number, total: number) => void) | null = null,
  ): Promise<[PageData[], number]> {
    const baseUrl = threadUrl.replace(/\/page\d+/, '');
    const html = await getPage(baseUrl, this.session);
    if (!html) return [[], 1];
    const totalPages = this.getTotalPages(html);

    const fetchPage = async (n: number): Promise<[number, PostData[]]> => {
      if (progressCallback) progressCallback(n, totalPages);
      if (n === 1) return [n, this.extractPostsWithTitles(html)];
      const pageHtml = await getPage(`${baseUrl}/page${n}`, this.session);
      return [n, pageHtml ? this.extractPostsWithTitles(pageHtml) : []];
    };

    const pageNums = Array.from({ length: totalPages }, (_, i) => i + 1);
    const chunks: number[][] = [];
    for (let i = 0; i < pageNums.length; i += 5)
      chunks.push(pageNums.slice(i, i + 5));

    const pageResults: Record<number, PostData[]> = {};
    for (const chunk of chunks) {
      const results = await Promise.all(chunk.map((n) => fetchPage(n)));
      for (const [n, posts] of results) pageResults[n] = posts;
    }

    const structured: PageData[] = [];
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

  async searchForum(
    query: string,
    forumIds: number | number[] = [302, 303, 304],
  ): Promise<[SearchResult[], string | null, number, number]> {
    const forums = Array.isArray(forumIds) ? forumIds : [forumIds];
    const params: Record<string, unknown> = {
      do: 'process',
      q: query,
      showposts: '0',
      s: '',
      securitytoken: 'guest',
      contenttype: 'vBForum_Post',
      'forumchoice[]': forums.map(String),
      childforums: '1',
      exactname: '1',
    };
    try {
      const res = await this.session.get('https://viper.to/search.php', {
        params,
        timeout: 30000,
        maxRedirects: 5,
      });
      const finalUrl: string = res.request?.res?.responseUrl || '';
      const searchidMatch = finalUrl.match(/searchid=(\d+)/);
      const searchid = searchidMatch ? searchidMatch[1] : null;
      const [results, totalPages, perPage] = this._parseSearchResults(res.data);
      return [results, searchid, totalPages, perPage];
    } catch (e) {
      console.warn('[VG] search failed:', (e as Error).message);
      return [[], null, 1, 50];
    }
  }

  async searchForumPage(
    searchid: string,
    page = 1,
    perPage = 50,
  ): Promise<[SearchResult[], number, number]> {
    try {
      const res = await this.session.get('https://viper.to/search.php', {
        params: { searchid, pp: perPage, page },
        timeout: 30000,
      });
      return this._parseSearchResults(res.data);
    } catch (e) {
      console.warn(`[VG] search page ${page} failed:`, (e as Error).message);
      return [[], 1, perPage];
    }
  }

  _parseSearchResults(html: string): [SearchResult[], number, number] {
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];
    const MONTHS: Record<string, number> = {
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

    const parseDate = (text: string): number => {
      const absMatch = text.match(
        /(\d{1,2})(?:st|nd|rd|th)\s+(\w+)\s+(\d{4})\s+(\d{2}):(\d{2})/i,
      );
      if (absMatch) {
        const [, day, monthName, year, hour, minute] = absMatch;
        const month = MONTHS[monthName.toLowerCase()];
        if (month !== undefined)
          return new Date(+year, month, +day, +hour, +minute).getTime() / 1000;
      }
      const normText = text.replace(/[\s\u00a0]+/g, ' ');
      const relMatch = normText.match(
        /\b(today|yesterday)\b\s*(?:at\s*)?,?\s*(\d{1,2}):(\d{2})(?:\s*(am|pm))?/i,
      );
      if (relMatch) {
        const [, dayWord, hour, minute, ampm] = relMatch;
        const date = new Date();
        if (dayWord.toLowerCase() === 'yesterday')
          date.setDate(date.getDate() - 1);
        let h = parseInt(hour);
        if (ampm) {
          if (ampm.toLowerCase() === 'pm' && h < 12) h += 12;
          if (ampm.toLowerCase() === 'am' && h === 12) h = 0;
        }
        date.setHours(h, parseInt(minute), 0, 0);
        return Math.floor(date.getTime() / 1000);
      }
      return 0;
    };

    $('li.threadbit, li[id^="thread_"]').each((_, el) => {
      const titleTag = $(el).find('a[id^="thread_title_"]').first();
      if (!titleTag.length) return;
      let href = titleTag.attr('href') || '';
      if (href && !href.startsWith('http'))
        href = 'https://viper.to/' + href.replace(/^\//, '');
      href = href.replace(/\?.*$/, '');
      const prefixTag = $(el).find('span[id^="thread_prefix_"]').first();
      const prefix = prefixTag.length
        ? prefixTag
            .text()
            .trim()
            .replace(/^\[|\]$/g, '')
        : '';
      const authorTag = $(el).find('.author a.username, span.label a').first();
      let replies = '',
        views = '';
      $(el)
        .find('ul.threadstats li')
        .each((_, li) => {
          const t = $(li).text().trim();
          if (t.startsWith('Replies:')) replies = t.slice(8).trim();
          else if (t.toLowerCase().startsWith('views:'))
            views = t.split(':')[1].trim();
        });
      const labelSpan = $(el).find('span.label').first();
      const labelText = labelSpan.length ? labelSpan.text().trim() : '';
      const titleAttr = labelSpan.find('a').attr('title') || '';
      const timestamp = parseDate(titleAttr || labelText);

      results.push({
        title: titleTag.text().trim(),
        prefix,
        url: href,
        author: authorTag.length ? authorTag.text().trim() : '',
        replies,
        views,
        dateText: labelText,
        timestamp,
      });
    });

    results.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    let totalPages = 1,
      perPage = 50;
    const ctrl = $('a.popupctrl').first();
    if (ctrl.length) {
      const m = ctrl.text().match(/Page \d+ of (\d+)/);
      if (m) totalPages = parseInt(m[1]);
    }
    const stats = $('#postpagestats, #threadpagestats, .pagestats').first();
    if (stats.length) {
      const m = stats.text().match(/([\d,]+)\s+to\s+([\d,]+)\s+of\s+([\d,]+)/);
      if (m) {
        const [s, e, tot] = m
          .slice(1)
          .map((x) => parseInt(x.replace(/,/g, '')));
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

export class AdultPhotoSetsScraper {
  private BASE_URL = 'https://adultphotosets.best';
  private RESULTS_PER_PAGE = 10;
  private session: AxiosInstance;

  constructor() {
    this.session = axios.create({
      headers: { 'User-Agent': UA, Referer: 'https://adultphotosets.best/' },
      timeout: 20000,
    });
  }

  private async _post(url: string, data: string): Promise<string | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await this.session.post(url, data, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        return res.data;
      } catch {
        if (attempt < 2) await sleep(1000);
      }
    }
    return null;
  }

  private async _get(url: string): Promise<string | null> {
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

  async searchAll(query: string): Promise<ApsResult[]> {
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
    let tagResults: ApsResult[] = [];
    try {
      tagResults = await this.getTagResults(query);
    } catch {}
    const seenUrls = new Set<string>();
    const merged: ApsResult[] = [];
    for (const r of [...allSearch, ...tagResults]) {
      if (!seenUrls.has(r.url)) {
        seenUrls.add(r.url);
        merged.push(r);
      }
    }
    return merged;
  }

  async search(query: string, page = 1): Promise<[ApsResult[], number]> {
    const allowedCats = [
      '24',
      '33',
      '34',
      '17',
      '15',
      '32',
      '10',
      '12',
      '16',
      '13',
      '14',
    ];
    const params = new URLSearchParams([
      ['do', 'search'],
      ['subaction', 'search'],
      ['search_start', String(page - 1)],
      ['full_search', '1'],
      ['result_from', String((page - 1) * this.RESULTS_PER_PAGE + 1)],
      ['story', query],
      ['sortby', 'date'],
      ['resorder', 'desc'],
      ['searchdate', '0'],
      ['beforeafter', 'after'],
      ...allowedCats.map((c): [string, string] => ['catlist[]', c]),
    ]);
    const html = await this._post(
      `${this.BASE_URL}/index.php?do=search`,
      params.toString(),
    );
    if (!html) return [[], 1];
    return this._parseSearch(html);
  }

  private _parseSearch(html: string): [ApsResult[], number] {
    const $ = cheerio.load(html);
    const results: ApsResult[] = [];
    $('article.story').each((_, el) => {
      const link = $(el).find('h2.title a').first();
      if (!link.length) return;
      const url = link.attr('href') || '';
      const catDiv = $(el).find('div.category');
      const thumb = $(el).find('img').first();
      let thumbUrl = thumb.attr('data-src') || thumb.attr('src') || '';
      if (thumbUrl && !thumbUrl.startsWith('http'))
        thumbUrl = this.BASE_URL + thumbUrl;
      results.push({
        title: link.text().trim(),
        url,
        category: catDiv.text().trim(),
        thumb: thumbUrl,
      });
    });
    let totalPages = 1;
    const nav = $('div.navigation div.pages');
    if (nav.length) {
      const nums = [
        ...(nav.html() || '').matchAll(/list_submit\((\d+)\)/g),
      ].map((m) => parseInt(m[1]));
      if (nums.length) totalPages = Math.max(...nums);
    }
    return [results, totalPages];
  }

  async getTagResults(query: string): Promise<ApsResult[]> {
    const tagSlug = encodeURIComponent(
      query.replace(/\b\w/g, (c) => c.toUpperCase()),
    );
    return this._fetchTagPages(`${this.BASE_URL}/tags/${tagSlug}/`);
  }

  async getTagResultsFromUrl(tagUrl: string): Promise<ApsResult[]> {
    return this._fetchTagPages(tagUrl.replace(/\/$/, ''));
  }

  private async _fetchTagPages(baseUrl: string): Promise<ApsResult[]> {
    const fetchPage = async (n: number): Promise<[ApsResult[], number]> => {
      const url = n === 1 ? baseUrl : `${baseUrl}/page/${n}/`;
      const html = await this._get(url);
      if (!html) return [[], 0];
      const $ = cheerio.load(html);
      const results: ApsResult[] = [];
      $('article.story').each((_, el) => {
        const link = $(el).find('h2.title a').first();
        if (!link.length) return;
        const catDiv = $(el).find('div.category');
        results.push({
          title: link.text().trim(),
          url: link.attr('href') || '',
          category: catDiv.text().trim(),
        });
      });
      let total = 1;
      const nav = $('div.navigation div.pages');
      if (nav.length) {
        const nums = [...(nav.html() || '').matchAll(/\/page\/(\d+)\//g)].map(
          (m) => parseInt(m[1]),
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

  async getPostLinks(postUrl: string): Promise<string[]> {
    const html = await this._get(postUrl);
    if (!html) return [];
    const $ = cheerio.load(html);
    const content = $('div.full_story, article, div#dle-content').first();
    if (!content.length) return [];
    const links: string[] = [];
    content.find('a[href]').each((_, a) => {
      const href = $(a).attr('href') || '';
      if (IMAGE_HOSTS.some((h) => href.includes(h))) links.push(href);
    });
    return links;
  }
}
