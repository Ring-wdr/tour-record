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
  async fetch(request: Request, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/photos/')) return env.ASSETS.fetch(request);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }

    const notFound = async () => {
      const page = await env.ASSETS.fetch(new Request(new URL('/404.html', url)));
      return new Response(page.body, { status: 404, headers: page.headers });
    };
    let key: string;
    try {
      key = decodeURIComponent(url.pathname.slice(1)); // "photos/day02/xxx.jpg"
    } catch {
      return notFound(); // 잘못된 %-인코딩 (예: /photos/%E0%A4%A) — 500 대신 404
    }
    // 엣지 캐시(데이터센터별) — 같은 사진을 R2에서 매번 읽지 않는다. 커스텀 도메인에서만 동작(workers.dev에서는 아무 일도 안 함).
    // match는 If-None-Match도 처리해 304를 돌려준다
    const cache = (caches as unknown as { default: Cache }).default;
    if (request.method === 'GET') {
      const hit = await cache.match(request);
      if (hit) return hit;
    }

    const obj = await env.PHOTOS.get(key, { onlyIf: request.headers });
    if (!obj) return notFound();

    const ext = key.split('.').pop()!.toLowerCase();
    const headers = new Headers({
      'Content-Type': ('httpMetadata' in obj && obj.httpMetadata?.contentType) || TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'public, max-age=2592000',
      ETag: obj.httpEtag,
      // Worker 응답에는 _headers가 적용되지 않는다
      'X-Content-Type-Options': 'nosniff',
    });
    // If-None-Match가 맞으면 R2가 본문 없이 돌려준다 → 304
    if (!('body' in obj)) return new Response(null, { status: 304, headers });
    const res = new Response(request.method === 'HEAD' ? null : obj.body, { headers });
    if (request.method === 'GET') ctx.waitUntil(cache.put(request.url, res.clone()));
    return res;
  },
};
