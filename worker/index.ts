// 정적 사이트(dist)는 Workers Static Assets가 서빙하고,
// /photos/* 요청만 이 Worker가 받아 R2 버킷(PHOTOS)에서 꺼내 준다.
// URL은 그대로라 사이트 코드는 사진이 어디 있는지 몰라도 된다.

interface R2ObjectBody {
  body: ReadableStream;
  httpEtag: string;
  httpMetadata?: { contentType?: string; cacheControl?: string };
}
interface R2Bucket {
  get(key: string, options?: { onlyIf?: Headers }): Promise<R2ObjectBody | { httpEtag: string } | null>;
}
interface Env {
  PHOTOS: R2Bucket;
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const TYPES: Record<string, string> = { jpg: 'image/jpeg', webp: 'image/webp' };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/photos/')) return env.ASSETS.fetch(request);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }

    const key = decodeURIComponent(url.pathname.slice(1)); // "photos/day02/xxx.jpg"
    const obj = await env.PHOTOS.get(key, { onlyIf: request.headers });
    if (!obj) {
      const page = await env.ASSETS.fetch(new Request(new URL('/404.html', url)));
      return new Response(page.body, { status: 404, headers: page.headers });
    }

    const ext = key.split('.').pop()!.toLowerCase();
    const headers = new Headers({
      'Content-Type': ('httpMetadata' in obj && obj.httpMetadata?.contentType) || TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'public, max-age=2592000',
      ETag: obj.httpEtag,
    });
    // If-None-Match가 맞으면 R2가 본문 없이 돌려준다 → 304
    if (!('body' in obj)) return new Response(null, { status: 304, headers });
    return new Response(request.method === 'HEAD' ? null : obj.body, { headers });
  },
};
