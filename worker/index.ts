// 정적 사이트(dist)는 Workers Static Assets가 서빙한다(무료·무제한 — Worker를 실행하지 않는다).
// 사진은 R2 버킷(tour-record-photos)에 붙인 커스텀 도메인 photos.tour-record.page에서 CDN 캐시로 나간다.
// 이 Worker는 이미 공유된 옛 사진 주소(<사이트>/photos/...)만 받아 사진 도메인으로 301 보낸다
// (wrangler.jsonc run_worker_first). 새 페이지는 처음부터 사진 도메인 주소를 쓴다.

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const PHOTO_ORIGIN = 'https://photos.tour-record.page'; // src/lib/site.ts PHOTO_ORIGIN과 같게

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/photos/')) return env.ASSETS.fetch(request);
    return new Response(null, {
      status: 301,
      headers: { Location: PHOTO_ORIGIN + url.pathname, 'Cache-Control': 'public, max-age=86400' },
    });
  },
};
