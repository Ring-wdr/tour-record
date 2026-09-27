// @ts-check
import { defineConfig } from 'astro/config';
import admin from './integrations/admin/index.ts';

export default defineConfig({
  site: 'https://tour-record.akswnd55.workers.dev',
  output: 'static',
  // 관리자 화면(/admin) — astro dev에서만 존재, 운영 빌드에는 없음
  integrations: [admin()],
  // 여러 페이지(여행·관리자)가 쓰는 큰 의존성은 dev 시작 때 미리 번들 — 나중에 발견되면 "Outdated Optimize Dep"(504)로 페이지가 깨진다
  vite: { optimizeDeps: { include: ['maplibre-gl', 'photoswipe', 'photoswipe/lightbox', 'exifr'] } },
});
