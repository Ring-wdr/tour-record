// public/photos의 변환본(pnpm photos 결과)을 R2 버킷에 올린다.
//
//   pnpm photos:upload            # Cloudflare R2(원격)에 업로드
//   pnpm photos:upload -- --local # wrangler dev용 로컬 R2에 업로드
//
// 이미 올린 파일은 내용 해시를 .r2-uploaded.local.json(git 제외)에 기록해 두고 건너뛴다.
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

const BUCKET = 'almaty-2026-photos';
const DIR = 'public/photos';
const LOCAL = process.argv.includes('--local');
const STATE = LOCAL ? '.r2-uploaded.dev.local.json' : '.r2-uploaded.local.json';
const TYPES = { jpg: 'image/jpeg', webp: 'image/webp' };

const walk = (d) =>
  readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

const files = walk(DIR).filter((f) => /\.(jpg|webp)$/i.test(f));
const done = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const hash = (f) => createHash('md5').update(readFileSync(f)).digest('hex');

const todo = files
  .map((f) => ({ file: f, key: relative('public', f).split(sep).join('/'), md5: hash(f) }))
  .filter((x) => done[x.key] !== x.md5);

console.log(`[r2] ${files.length} files · ${todo.length} to upload → ${BUCKET}${LOCAL ? ' (local)' : ''}`);

// 확장자별로 한 번씩 wrangler r2 bulk put (content-type이 배치 단위로 적용되므로)
// 파일마다 wrangler를 따로 띄우면 느리고, Windows에서는 로컬 저장소를 동시에 열다 충돌한다
const run = (args) =>
  new Promise((resolve, reject) => {
    const p = spawn('npx', ['wrangler', ...args], { shell: true, stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`wrangler exited ${code}`))));
  });

mkdirSync('.wrangler', { recursive: true });
for (const [ext, type] of Object.entries(TYPES)) {
  const batch = todo.filter((x) => x.key.toLowerCase().endsWith('.' + ext));
  if (!batch.length) continue;
  const list = join('.wrangler', `r2-bulk-${ext}.json`);
  writeFileSync(list, JSON.stringify(batch.map(({ key, file }) => ({ key, file }))));
  await run([
    'r2', 'bulk', 'put', BUCKET,
    '--filename', list,
    '--content-type', type,
    '--cache-control', '"public, max-age=2592000"',
    '--concurrency', LOCAL ? '1' : '8',
    LOCAL ? '--local' : '--remote',
  ]);
  for (const x of batch) done[x.key] = x.md5;
  writeFileSync(STATE, JSON.stringify(done, null, 1));
  console.log(`[r2] ${ext}: ${batch.length} uploaded`);
}
