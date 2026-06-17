import type { IncomingMessage, ServerResponse } from 'http';
import {
  ViperGirlsDownloader,
  AdultPhotoSetsScraper,
} from '../../core/scraper.js';
import { ImageHostExtractor } from '../../core/extractor.js';
import { IMAGE_HOSTS } from '../../core/hosts.js';
import { uploadToPaste } from '../../core/uploader.js';
import {
  md5,
  vgCache,
  apsCache,
  threadCache,
  sendJSON,
  startSSE,
  sendSSE,
  readBody,
  addToHistory,
  extractAndUpload,
  extractPerformerName,
  formatPerformerHashtags,
  PAGE_SIZE,
} from '../utils.js';

function mergeTitle(
  searchTitle: string | null | undefined,
  postTitle: string | null | undefined,
): string {
  if (!searchTitle && !postTitle) return '';
  if (!searchTitle) return postTitle || '';
  if (!postTitle) return searchTitle;

  // Extract studio prefix from search title
  // Match both formats: "DevilsFilm Title..." or "[TeamSkeet] Title..."
  const prefixMatch = searchTitle.match(
    /^(?:\[([^\]]+)\]|([A-Za-z0-9]+))\s+(.+)$/,
  );
  if (!prefixMatch) return postTitle;

  const prefix = prefixMatch[1] || prefixMatch[2]; // [1] for brackets, [2] for plain
  const restOfSearchTitle = prefixMatch[3];

  // Check if post title already has the prefix (with or without brackets)
  if (
    postTitle.toLowerCase().startsWith(prefix.toLowerCase()) ||
    postTitle.toLowerCase().startsWith(`[${prefix.toLowerCase()}]`)
  ) {
    return postTitle;
  }

  // Check if post title looks more complete (has date pattern MM/DD/YY)
  if (/\d{2}\/\d{2}\/\d{2,4}/.test(postTitle)) {
    return `${prefix} ${postTitle}`;
  }

  return postTitle;
}

export async function handleVgScrape(
  params: URLSearchParams,
  res: ServerResponse,
): Promise<void> {
  const id = params.get('id') || '';
  const query = params.get('q') || '';
  if (!id) return sendJSON(res, 400, { error: 'Missing id' });

  let found: Record<string, unknown> | null = null;
  for (const results of vgCache.values()) {
    found =
      (results as Record<string, unknown>[]).find((r) => r.sgenId === id) ??
      null;
    if (found) break;
  }
  if (!found)
    return sendJSON(res, 404, { error: 'ID not found – run search first' });

  const downloader = new ViperGirlsDownloader();
  const [pagesData, totalPages] = await downloader.scrapeThread(
    found.url as string,
  );
  const postTitle = pagesData[0]?.posts[0]?.title;
  const title =
    mergeTitle(found.title as string, postTitle) || (found.url as string);
  const threadId = md5(found.url as string).slice(0, 8);
  const threadData = {
    url: found.url,
    title,
    searchQuery: query || null,
    pages: pagesData,
    totalPages,
    type: 'vg',
  };
  threadCache.set(threadId, threadData);
  sendJSON(res, 200, { ok: true, threadId, threadData });
}

export async function handleVgFetch(
  params: URLSearchParams,
  res: ServerResponse,
): Promise<void> {
  const id = params.get('id') || '';
  const query = params.get('q') || '';
  const stream = params.get('stream') === '1';
  if (!id) return sendJSON(res, 400, { error: 'Missing id' });

  let found: Record<string, unknown> | null = null;
  for (const results of vgCache.values()) {
    found =
      (results as Record<string, unknown>[]).find((r) => r.sgenId === id) ??
      null;
    if (found) break;
  }
  if (!found)
    return sendJSON(res, 404, { error: 'ID not found – run search first' });

  if (stream) {
    startSSE(res);
    sendSSE(res, 'phase', { phase: 'scraping' });
  }

  const downloader = new ViperGirlsDownloader();
  const [pagesData] = await downloader.scrapeThread(found.url as string);
  const allLinks = pagesData.flatMap((p) => p.posts.flatMap((q) => q.links));
  const postTitle = pagesData[0]?.posts[0]?.title;

  // Debug logging
  console.log('[DEBUG] found.title:', found.title);
  console.log('[DEBUG] postTitle:', postTitle);

  const mergedTitle =
    mergeTitle(found.title as string, postTitle) || (found.url as string);

  console.log('[DEBUG] mergedTitle:', mergedTitle);

  if (stream)
    sendSSE(res, 'phase', { phase: 'extracting', total: allLinks.length });

  const onProgress = stream
    ? (p: unknown) => sendSSE(res, 'progress', p)
    : null;
  const result = await extractAndUpload(
    allLinks,
    mergedTitle,
    found.url as string,
    query || null,
    onProgress,
  );
  if (result.ok) addToHistory(result);

  if (stream) {
    sendSSE(res, 'done', result);
    res.end();
  } else sendJSON(res, 200, result);
}

export async function handleApsFetch(
  params: URLSearchParams,
  res: ServerResponse,
): Promise<void> {
  const id = params.get('id') || '';
  const query = params.get('q') || '';
  const stream = params.get('stream') === '1';
  if (!id) return sendJSON(res, 400, { error: 'Missing id' });

  let found: Record<string, unknown> | null = null;
  for (const results of apsCache.values()) {
    found =
      (results as Record<string, unknown>[]).find((r) => r.apsId === id) ??
      null;
    if (found) break;
  }
  if (!found)
    return sendJSON(res, 404, { error: 'ID not found – run search first' });

  if (stream) {
    startSSE(res);
    sendSSE(res, 'phase', { phase: 'scraping' });
  }

  const scraper = new AdultPhotoSetsScraper();
  const links = await scraper.getPostLinks(found.url as string);

  if (stream)
    sendSSE(res, 'phase', { phase: 'extracting', total: links.length });

  const onProgress = stream
    ? (p: unknown) => sendSSE(res, 'progress', p)
    : null;
  const result = await extractAndUpload(
    links,
    found.title as string,
    found.url as string,
    query || null,
    onProgress,
  );
  if (result.ok) addToHistory(result);

  if (stream) {
    sendSSE(res, 'done', result);
    res.end();
  } else sendJSON(res, 200, result);
}

export async function handleDirectFetch(
  params: URLSearchParams,
  res: ServerResponse,
): Promise<void> {
  const url = params.get('url') || '';
  if (!url) return sendJSON(res, 400, { error: 'Missing url' });

  try {
    if (url.includes('vipergirls.to') || url.includes('viper.to')) {
      const downloader = new ViperGirlsDownloader();
      const [pagesData, totalPages] = await downloader.scrapeThread(url);
      const title = pagesData[0]?.posts[0]?.title || url;
      const threadId = md5(url).slice(0, 8);
      const threadData = {
        url,
        title,
        searchQuery: null,
        pages: pagesData,
        totalPages,
        type: 'vg',
      };
      threadCache.set(threadId, threadData);
      return sendJSON(res, 200, { ok: true, threadId, threadData });
    }
    if (url.includes('adultphotosets')) {
      const scraper = new AdultPhotoSetsScraper();
      const links = await scraper.getPostLinks(url);
      const titleMatch = url.match(/\/([^/]+)\/?$/);
      const title = titleMatch ? titleMatch[1].replace(/-/g, ' ') : url;
      const threadId = md5(url).slice(0, 8);
      const threadData = {
        url,
        title,
        searchQuery: null,
        pages: [
          {
            page_num: 1,
            posts: [{ title: 'Main Post', links, count: links.length }],
          },
        ],
        totalPages: 1,
        type: 'aps',
      };
      threadCache.set(threadId, threadData);
      return sendJSON(res, 200, { ok: true, threadId, threadData });
    }
    sendJSON(res, 400, {
      error: 'URL must be from vipergirls.to / viper.to or adultphotosets',
    });
  } catch (err) {
    sendJSON(res, 500, { error: (err as Error).message });
  }
}

export async function handleThreadExtract(
  params: URLSearchParams,
  res: ServerResponse,
): Promise<void> {
  const threadId = params.get('threadId') || '';
  const gidx = parseInt(params.get('postIndex') || '0');
  const stream = params.get('stream') === '1';
  if (!threadId) return sendJSON(res, 400, { error: 'Missing threadId' });
  if (!threadCache.has(threadId))
    return sendJSON(res, 404, {
      error: 'Thread not found or expired. Please search again.',
    });

  const threadData = threadCache.get(threadId) as {
    pages: { posts: { title?: string; links: string[]; postId?: string }[] }[];
    url: string;
    title?: string;
    searchQuery: string | null;
  };
  let post: { title?: string; links: string[]; postId?: string } | null = null;
  let cur = 0;
  outer: for (const page of threadData.pages) {
    for (const p of page.posts) {
      if (cur === gidx) {
        post = p;
        break outer;
      }
      cur++;
    }
  }
  if (!post) return sendJSON(res, 404, { error: 'Post not found in thread.' });

  const title = mergeTitle(threadData.title, post.title) || post.title || `Post #${gidx + 1}`;
  const sourceUrl = post.postId && threadData.url
    ? `${threadData.url.replace(/\/$/, '')}?p=${post.postId}&viewfull=1#post${post.postId}`
    : threadData.url;
  if (stream) {
    startSSE(res);
    sendSSE(res, 'phase', { phase: 'extracting', total: post.links.length });
  }

  try {
    const onProgress = stream
      ? (p: unknown) => sendSSE(res, 'progress', p)
      : null;
    const result = await extractAndUpload(
      post.links,
      title,
      sourceUrl,
      threadData.searchQuery,
      onProgress,
    );
    if (result.ok) addToHistory(result);
    if (stream) {
      sendSSE(res, 'done', result);
      res.end();
    } else sendJSON(res, 200, result);
  } catch (err) {
    if (stream) {
      sendSSE(res, 'error', { error: (err as Error).message });
      res.end();
    } else sendJSON(res, 500, { error: (err as Error).message });
  }
}

export async function handleReExtract(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readBody(req);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body);
  } catch {
    return sendJSON(res, 400, { error: 'Invalid JSON' });
  }

  const {
    failedLinks,
    previousUrls,
    indexedFailedLinks,
    indexedUrls,
    title,
    sourceUrl,
    searchQuery,
  } = parsed as {
    failedLinks: string[];
    previousUrls?: string[];
    indexedFailedLinks?: { index: number; link: string }[];
    indexedUrls?: Record<string, string>;
    title?: string;
    sourceUrl?: string;
    searchQuery?: string;
  };
  if (!failedLinks?.length)
    return sendJSON(res, 400, { error: 'No failed links to retry' });

  const hasIndexedData =
    indexedFailedLinks && indexedFailedLinks.length > 0 && indexedUrls;
  const prevUrls = previousUrls || [];
  const extractor = new ImageHostExtractor();
  (
    extractor as unknown as { client: { defaults: { timeout: number } } }
  ).client.defaults.timeout = 25000;
  const RETRY_CONCURRENCY = 3;
  const stillFailed: string[] = [];
  const stillFailedIndexed: { index: number; link: string }[] = [];
  const hostCounts: Record<string, number> = {};
  const failedHostsMap: Record<string, number> = {};
  const urlMap: Record<string, string> = {};

  if (hasIndexedData)
    for (const [idx, url] of Object.entries(indexedUrls!)) urlMap[idx] = url;

  const linksToRetry = hasIndexedData
    ? indexedFailedLinks!
    : failedLinks.map((link, i) => ({ index: prevUrls.length + i, link }));

  const chunks: (typeof linksToRetry)[] = [];
  for (let i = 0; i < linksToRetry.length; i += RETRY_CONCURRENCY)
    chunks.push(linksToRetry.slice(i, i + RETRY_CONCURRENCY));

  for (const chunk of chunks) {
    const results = await Promise.allSettled(
      chunk.map((entry) => {
        const link = entry.link;
        const index = entry.index;
        return extractor
          .extractDirectUrl(link)
          .then((u) => {
            const hostMatch = IMAGE_HOSTS.find((h) => link.includes(h));
            const hostName = hostMatch ? hostMatch.split('.')[0] : 'unknown';
            if (u) {
              if (hostMatch)
                hostCounts[hostMatch] = (hostCounts[hostMatch] || 0) + 1;
            } else {
              failedHostsMap[hostName] = (failedHostsMap[hostName] || 0) + 1;
              stillFailed.push(link);
              stillFailedIndexed.push({ index, link });
            }
            return { link, u, index };
          })
          .catch(() => {
            const hostMatch = IMAGE_HOSTS.find((h) => link.includes(h));
            const hostName = hostMatch ? hostMatch.split('.')[0] : 'unknown';
            failedHostsMap[hostName] = (failedHostsMap[hostName] || 0) + 1;
            stillFailed.push(link);
            stillFailedIndexed.push({ index, link });
            return { link, u: null, index };
          });
      }),
    );
    for (const r of results)
      if (r.status === 'fulfilled' && r.value.u)
        urlMap[r.value.index] = r.value.u;
  }

  let allUrls: string[];
  let newlyRecovered: number;
  if (hasIndexedData) {
    allUrls = Object.keys(urlMap)
      .map(Number)
      .sort((a, b) => a - b)
      .map((i) => urlMap[i]);
    newlyRecovered = allUrls.length - Object.keys(indexedUrls!).length;
  } else {
    const recoveredUrls = Object.values(urlMap);
    allUrls = [...prevUrls, ...recoveredUrls];
    newlyRecovered = recoveredUrls.length;
  }

  const totalOriginal = hasIndexedData
    ? Object.keys(indexedUrls!).length +
      (indexedFailedLinks?.length ?? failedLinks.length)
    : prevUrls.length + failedLinks.length;

  if (!allUrls.length) {
    return sendJSON(res, 200, {
      ok: false,
      error: 'All re-extraction attempts failed',
      title: title || '',
      sourceUrl: sourceUrl || '',
      total: totalOriginal,
      extracted: 0,
      failed: totalOriginal,
      failedLinks: stillFailed,
      indexedFailedLinks:
        stillFailedIndexed.length > 0 ? stillFailedIndexed : undefined,
      failedHosts: failedHostsMap,
      directUrls: [],
      indexedUrls: undefined,
      pasteUrl: null,
    });
  }

  const content = allUrls.join('\n');
  let result = await uploadToPaste(content, 7);
  if (!result.success) result = await uploadToPaste(content, 7);

  const services = Object.entries(hostCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([host, count]) => {
      const s = host.split('.')[0];
      return count > 1 ? `${s}(${count})` : s;
    })
    .join(', ');

  // Extract performer name from title via AI, fall back to searchQuery
  let hashtag = '';
  const performerName = await extractPerformerName(title || '');
  if (performerName) {
    hashtag = formatPerformerHashtags(performerName);
  } else if (searchQuery) {
    hashtag = '#' + searchQuery.toLowerCase().replace(/\s+/g, '_') + ' ';
  }

  const finalResult: Record<string, unknown> = {
    ok: result.success,
    title: title || '',
    sourceUrl: sourceUrl || '',
    total: totalOriginal,
    extracted: allUrls.length,
    failed: stillFailed.length,
    failedHosts: stillFailed.length > 0 ? failedHostsMap : undefined,
    failedLinks: stillFailed.length > 0 ? stillFailed : undefined,
    indexedFailedLinks:
      stillFailedIndexed.length > 0 ? stillFailedIndexed : undefined,
    indexedUrls: Object.keys(urlMap).length > 0 ? urlMap : undefined,
    newlyRecovered,
    services,
    directUrls: allUrls,
    previewUrls: allUrls.slice(0, 5),
    pasteUrl: result.success ? result.url : null,
    pasteError: result.success ? null : result.error,
    hashtag,
    sendCommand: title ? `/s ${hashtag}${title}` : null,
    dlCommand: result.success ? `/d ${result.url}` : null,
  };
  if (finalResult.ok) addToHistory(finalResult);
  sendJSON(res, 200, finalResult);
}
