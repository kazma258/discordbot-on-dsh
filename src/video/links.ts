/** Detect a supported video URL in Discord message text. */

export type VideoSite = 'youtube' | 'bilibili' | 'direct';

export interface VideoLink {
  readonly site: VideoSite;
  /** URL passed to the analysis engine. */
  readonly url: string;
  readonly id?: string;
}

const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const BILIBILI_ID = /\/video\/(BV[0-9A-Za-z]{10}|av\d+)/i;
const DIRECT_VIDEO = /\.(mp4|webm|mov|mkv|m4v|avi|mpeg|mpg)$/i;
const TRAILING = /[.,;:!?)\]}>'"]+$/;

function trimTrailing(value: string): string {
  return value.replace(TRAILING, '');
}

function parseYouTube(url: URL): VideoLink | null {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!['youtu.be', 'youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
    return null;
  }

  let id: string | null = null;
  if (host === 'youtu.be') {
    id = url.pathname.split('/').filter(Boolean)[0] ?? null;
  } else if (url.pathname === '/watch') {
    id = url.searchParams.get('v');
  } else {
    const match = /^\/(?:shorts|live|embed|v)\/([^/]+)/.exec(url.pathname);
    id = match?.[1] ?? null;
  }

  if (id === null || !YOUTUBE_ID.test(id)) return null;
  return { site: 'youtube', id, url: `https://www.youtube.com/watch?v=${id}` };
}

function parseBilibili(url: URL): VideoLink | null {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!['bilibili.com', 'm.bilibili.com', 'b23.tv'].includes(host)) return null;

  const match = BILIBILI_ID.exec(url.pathname);
  const id = match?.[1];
  if (id === undefined) return { site: 'bilibili', url: url.toString() };

  const page = url.searchParams.get('p');
  return {
    site: 'bilibili',
    id,
    url: `https://www.bilibili.com/video/${id}${page ? `?p=${encodeURIComponent(page)}` : ''}`
  };
}

function parseLink(rawUrl: string): VideoLink | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const known = parseYouTube(url) ?? parseBilibili(url);
  if (known !== null) return known;
  if (DIRECT_VIDEO.test(url.pathname)) return { site: 'direct', url: rawUrl };
  return null;
}

/** Return the first supported video URL, or null when the message has none. */
export function extractVideoLink(text: string): VideoLink | null {
  for (const match of text.matchAll(URL_PATTERN)) {
    const link = parseLink(trimTrailing(match[0]));
    if (link !== null) return link;
  }
  return null;
}
