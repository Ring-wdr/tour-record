// 관리자 화면 — `astro dev`에서만 존재한다.
// - 페이지(/admin, /admin/new)는 dev일 때만 injectRoute → 운영 빌드(dist)에는 라우트 자체가 없다
// - API(/api/admin/*)는 Vite dev 서버 미들웨어 → 빌드·배포되는 코드가 아니다
// - 빌드 후 dist에 admin 흔적이 있으면 빌드를 실패시킨다 (이중 안전장치)
import type { AstroIntegration } from 'astro';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createAdminApi } from './api';

export default function admin(): AstroIntegration {
  let root = '';
  return {
    name: 'tour-record-admin',
    hooks: {
      'astro:config:setup': ({ command, config, injectRoute }) => {
        root = fileURLToPath(config.root).replace(/[\\/]$/, '');
        if (command !== 'dev') return;
        injectRoute({ pattern: '/admin', entrypoint: './src/admin/pages/index.astro' });
        injectRoute({ pattern: '/admin/new', entrypoint: './src/admin/pages/new.astro' });
      },
      'astro:server:setup': ({ server, logger }) => {
        server.middlewares.use('/api/admin', createAdminApi(root));
        logger.info('관리자 화면: /admin (개발 서버 전용)');
      },
      'astro:build:done': ({ dir }) => {
        const out = fileURLToPath(dir);
        for (const p of ['admin', 'api']) {
          if (existsSync(`${out}/${p}`)) throw new Error(`운영 빌드에 /${p}가 들어갔습니다 — 관리자 화면은 dev 전용이어야 합니다`);
        }
      },
    },
  };
}
