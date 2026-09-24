// 날짜 파일(src/content/days/*.md)에 적힌 사진만 원본 폴더에서 찾아 웹용으로 변환한다.
//
//   pnpm photos                         # 기본 원본 폴더 사용
//   pnpm photos -- --src "E:/other"     # 원본 폴더 지정
//   pnpm photos -- --force              # 이미 변환된 파일도 다시 생성
//
// 출력 (public/photos/dayXX/):
//   <원본이름>.jpg      긴 변 2400px — 라이트박스/표지용
//   <원본이름>-md.webp  긴 변 1200px — 카드/모자이크용
// sharp는 기본적으로 메타데이터를 쓰지 않으므로 EXIF(GPS 포함)는 모두 제거된다.
import { readFileSync, readdirSync, existsSync, mkdirSync, statSync } from 'node:fs';
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

console.log(`[photos] ${wanted.size} referenced · ${made} converted · ${skipped} up to date`);
if (missing.length) {
  console.warn(`[photos] ${missing.length} not found in ${SRC}:\n  ${missing.join('\n  ')}`);
  process.exitCode = 1;
}
