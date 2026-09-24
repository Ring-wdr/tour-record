// MapLibre 6의 웹워커는 번들 옆 파일(import.meta.url 기준)로 로드되는데,
// Vite가 번들링하면 그 파일이 빠진다. 워커와 공유 청크를 public/으로 복사해
// setWorkerUrl('/vendor/maplibre/maplibre-gl-worker.mjs')로 직접 지정한다.
import { cpSync, mkdirSync } from 'node:fs';

const src = 'node_modules/maplibre-gl/dist';
const dest = 'public/vendor/maplibre';
mkdirSync(dest, { recursive: true });
for (const f of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  cpSync(`${src}/${f}`, `${dest}/${f}`);
}
console.log('[maplibre] worker copied to', dest);
