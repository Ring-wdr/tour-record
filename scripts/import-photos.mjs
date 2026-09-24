// 날짜 파일(src/content/days/*.md)에 적힌 사진만 원본 폴더에서 찾아 웹용으로 변환한다.
//
//   pnpm photos                         # 기본 원본 폴더 사용
//   pnpm photos -- --src "E:/other"     # 원본 폴더 지정
//   pnpm photos -- --force              # 이미 변환된 파일도 다시 생성
//
// 출력 (public/photos/dayXX/):
//   <원본이름>.jpg      긴 변 2400px — 라이트박스/표지용
//   <원본이름>-md.webp  긴 변 1200px — 카드/모자이크용
//   og.jpg              1200×630 — 링크 미리보기 (2일차 표지 = 첫 화면 호수 사진)
// sharp는 기본적으로 메타데이터를 쓰지 않으므로 EXIF(GPS 포함)는 모두 제거된다.
//
// 추가로:
// - src/data/photos.json(커밋됨)에 사진별 크기를 기록 → 사진 파일 없이도 빌드 가능 (사진은 R2에서 서빙)
// - md에서 빠진 사진의 변환본은 public/photos에서 지운다 (R2에 올라가지 않도록)
import { readFileSync, readdirSync, existsSync, mkdirSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const args = process.argv.slice(2);
const argVal = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const SRC = argVal('--src') ?? process.env.PHOTO_SRC ?? 'D:/archive/Camera_202609';
const FORCE = args.includes('--force');
const DAYS_DIR = 'src/content/days';
const OUT_DIR = 'public/photos';

const wanted = new Map(); // "day02/20260912_121051" -> 원본 파일명
for (const f of readdirSync(DAYS_DIR).filter((f) => f.endsWith('.md'))) {
  const text = readFileSync(join(DAYS_DIR, f), 'utf8');
  for (const m of text.matchAll(/\/photos\/(day\d{2})\/([\w-]+)\.jpg/g)) {
    wanted.set(`${m[1]}/${m[2]}`, `${m[2]}.jpg`);
  }
}

let made = 0;
let skipped = 0;
const missing = [];
for (const [key, file] of wanted) {
  const src = join(SRC, file);
  if (!existsSync(src)) {
    missing.push(file);
    continue;
  }
  const [day, name] = key.split('/');
  mkdirSync(join(OUT_DIR, day), { recursive: true });
  const full = join(OUT_DIR, day, `${name}.jpg`);
  const md = join(OUT_DIR, day, `${name}-md.webp`);
  const fresh = (p) => existsSync(p) && statSync(p).mtimeMs >= statSync(src).mtimeMs;
  if (!FORCE && fresh(full) && fresh(md)) {
    skipped++;
    continue;
  }
  // failOn: 'none' — 일부 삼성 모션포토 JPEG은 엄격 모드에서 디코딩 오류가 난다
  const base = () => sharp(src, { failOn: 'none' }).rotate();
  await base()
    .resize(2400, 2400, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true, progressive: true })
    .toFile(full);
  await base().resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toFile(md);
  made++;
}

// 크기 목록 — 라이트박스(PhotoSwipe)에 필요한 비율
const sizes = {};
for (const [key] of wanted) {
  const full = join(OUT_DIR, `${key}.jpg`);
  if (!existsSync(full)) continue;
  const m = await sharp(full).metadata();
  sizes[`/photos/${key}.jpg`] = { w: m.width, h: m.height };
}
mkdirSync('src/data', { recursive: true });
writeFileSync('src/data/photos.json', JSON.stringify(sizes, null, 1) + '\n');

// 더 이상 쓰지 않는 변환본 정리
let removed = 0;
for (const day of readdirSync(OUT_DIR).filter((d) => /^day\d{2}$/.test(d))) {
  for (const file of readdirSync(join(OUT_DIR, day))) {
    const name = file.replace(/(-md)?\.(jpg|webp)$/, '');
    if (!wanted.has(`${day}/${name}`)) {
      rmSync(join(OUT_DIR, day, file));
      removed++;
    }
  }
}

// 링크 미리보기 이미지 — 첫 화면(2일차 표지)과 같은 사진
const day02 = readFileSync(join(DAYS_DIR, 'day02.md'), 'utf8');
const coverName = day02.match(/cover:\s*\n\s*src: \/photos\/day02\/([\w-]+)\.jpg/)?.[1];
if (coverName && existsSync(join(SRC, `${coverName}.jpg`))) {
  await sharp(join(SRC, `${coverName}.jpg`), { failOn: 'none' })
    .rotate()
    .resize(1200, 630, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: 84, mozjpeg: true })
    .toFile(join(OUT_DIR, 'og.jpg'));
}
console.log(`[photos] ${removed} unused removed · og.jpg from ${coverName ?? '(none)'}`);

console.log(`[photos] ${wanted.size} referenced · ${made} converted · ${skipped} up to date`);
if (missing.length) {
  console.warn(`[photos] ${missing.length} not found in ${SRC}:\n  ${missing.join('\n  ')}`);
  process.exitCode = 1;
}
