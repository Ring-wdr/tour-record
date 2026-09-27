// 옛 주소(almaty-2026.akswnd55.workers.dev)로 공유된 링크를 새 사이트로 보낸다.
// 배포: pnpm cf:deploy:legacy (wrangler.legacy.jsonc)
//   /                   → /trips/almaty-2026/   (#day-3 같은 fragment는 브라우저가 유지)
//   /photos/og.jpg      → /photos/almaty-2026/og.jpg
//   /photos/dayXX/...   → /photos/almaty-2026/dayXX/...
//   그 밖의 경로          → /trips/almaty-2026/
const TARGET = 'https://tour-record.akswnd55.workers.dev';
const SLUG = 'almaty-2026';

export default {
  fetch(request: Request): Response {
    const { pathname } = new URL(request.url);
    const path = pathname.startsWith('/photos/') ? pathname.replace('/photos/', `/photos/${SLUG}/`) : `/trips/${SLUG}/`;
    return Response.redirect(TARGET + path, 301);
  },
};
