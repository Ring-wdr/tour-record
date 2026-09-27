// public/photos/<slug>/의 변환본을 R2 버킷에 올린다 — pnpm photos:upload와 관리자 저장이 같이 쓴다.
// R2 키 = URL 경로 (photos/<slug>/dayXX/...). 버킷 이름은 wrangler.jsonc의 PHOTOS 바인딩에서 읽는다.
// 이미 올린 파일은 내용 해시를 .r2-uploaded.<버킷>[.dev].local.json(git 제외)에 기록해 두고 건너뛴다.
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

const TYPES = { jpg: 'image/jpeg', webp: 'image/webp' };

export function bucketName(root = '.') {
  // jsonc: 줄 주석만 지우고 파싱 (문자열 안의 "//"는 URL뿐이라 "://"는 건너뛴다)
  const wrangler = JSON.parse(readFileSync(join(root, 'wrangler.jsonc'), 'utf8').replace(/(?<!:)\/\/.*$/gm, ''));
  return wrangler.r2_buckets.find((b) => b.binding === 'PHOTOS').bucket_name;
}

const walk = (d) =>
  existsSync(d) ? readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)])) : [];

/** wrangler 실행 — 출력은 log로 넘기고, 실패하면 마지막 출력과 함께 오류 */
function wrangler(args, root, log) {
  return new Promise((resolve, reject) => {
    const p = spawn('npx', ['wrangler', ...args], { cwd: root, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let tail = '';
    const onData = (b) => {
      const s = b.toString();
      tail = (tail + s).slice(-2000);
      log(s.trimEnd());
    };
    p.stdout.on('data', onData);
    p.stderr.on('data', onData);
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`wrangler exited ${code}\n${tail.trim()}`))));
  });
}

/**
 * @param {{ slugs: string[], local?: boolean, root?: string, log?: (s: string) => void }} o
 * @returns {Promise<{ bucket: string, total: number, uploaded: number }>}
 */
export async function uploadPhotos({ slugs, local = false, root = '.', log = console.log }) {
  const bucket = bucketName(root);
  const state = join(root, `.r2-uploaded.${bucket}${local ? '.dev' : ''}.local.json`);
  const publicDir = join(root, 'public');
  const files = slugs.flatMap((slug) => walk(join(publicDir, 'photos', slug))).filter((f) => /\.(jpg|webp)$/i.test(f));
  const done = existsSync(state) ? JSON.parse(readFileSync(state, 'utf8')) : {};
  const hash = (f) => createHash('md5').update(readFileSync(f)).digest('hex');
  const todo = files
    .map((f) => ({ file: f, key: relative(publicDir, f).split(sep).join('/'), md5: hash(f) }))
    .filter((x) => done[x.key] !== x.md5);

  log(`[r2] ${files.length} files · ${todo.length} to upload → ${bucket}${local ? ' (local)' : ''}`);

  // 확장자별로 한 번씩 wrangler r2 bulk put (content-type이 배치 단위로 적용되므로)
  // 파일마다 wrangler를 따로 띄우면 느리고, Windows에서는 로컬 저장소를 동시에 열다 충돌한다
  mkdirSync(join(root, '.wrangler'), { recursive: true });
  for (const [ext, type] of Object.entries(TYPES)) {
    const batch = todo.filter((x) => x.key.toLowerCase().endsWith('.' + ext));
    if (!batch.length) continue;
    const list = join(root, '.wrangler', `r2-bulk-${ext}.json`);
    writeFileSync(list, JSON.stringify(batch.map(({ key, file }) => ({ key, file }))));
    await wrangler(
      [
        'r2', 'bulk', 'put', bucket,
        '--filename', list,
        '--content-type', type,
        '--cache-control', '"public, max-age=2592000"',
        '--concurrency', local ? '1' : '8',
        local ? '--local' : '--remote',
      ],
      root,
      log,
    );
    for (const x of batch) done[x.key] = x.md5;
    writeFileSync(state, JSON.stringify(done, null, 1));
    log(`[r2] ${ext}: ${batch.length} uploaded`);
  }
  return { bucket, total: files.length, uploaded: todo.length };
}
