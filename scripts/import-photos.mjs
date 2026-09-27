// 날짜 파일(src/content/trips/<slug>/days/*.md)에 적힌 사진만 원본 폴더에서 찾아 웹용으로 변환한다.
//
//   pnpm photos                              # 모든 여행
//   pnpm photos -- --trip almaty-2026        # 한 여행만
//   pnpm photos -- --trip x --src "E:/other" # 원본 폴더 지정 (기본: trips.local.json의 source)
//   pnpm photos -- --force                   # 이미 변환된 파일도 다시 생성
//
// 출력 (public/photos/<slug>/):
//   dayXX/<원본이름>.jpg      긴 변 2400px — 라이트박스/표지용
//   dayXX/<원본이름>-md.webp  긴 변 1200px — 카드/모자이크용
//   og.jpg                    1200×630 — 링크 미리보기 (trip.yaml heroDay의 표지 = 첫 화면 사진)
// 변환은 scripts/lib/photo.mjs (관리자 화면 업로드와 같은 설정). EXIF(GPS 포함)는 모두 제거된다.
//
// 추가로:
// - 여행 폴더의 photos.json(커밋됨)에 사진별 크기를 기록 → 사진 파일 없이도 빌드 가능 (사진은 R2에서 서빙)
// - md에서 빠진 사진의 변환본은 public/photos/<slug>에서 지운다 (R2에 올라가지 않도록)
import { readFileSync, readdirSync, existsSync, mkdirSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { args, argVal, selectedSlugs, loadTrip, frontmatter } from './lib/trips.mjs';
import { convertPhoto, makeOg, photoSize } from './lib/photo.mjs';

const FORCE = args.includes('--force');
const pad2 = (n) => String(n).padStart(2, '0');

for (const slug of selectedSlugs()) {
  const trip = loadTrip(slug);
  const SRC = argVal('--src') ?? trip.local.source ?? process.env.PHOTO_SRC;
  if (!SRC) {
    console.warn(`[photos:${slug}] 원본 폴더를 모릅니다 — trips.local.json에 "${slug}": { "source": ... }를 적거나 --src를 주세요`);
    process.exitCode = 1;
    continue;
  }
  const OUT_DIR = join('public/photos', slug);

  const wanted = new Map(); // "day02/20260912_121051" -> 원본 파일명
  const re = new RegExp(`/photos/${slug}/(day\\d{2})/([\\w-]+)\\.jpg`, 'g');
  for (const f of trip.dayFiles) {
    const text = readFileSync(join(trip.daysDir, f), 'utf8');
    for (const m of text.matchAll(re)) wanted.set(`${m[1]}/${m[2]}`, `${m[2]}.jpg`);
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
    const full = join(OUT_DIR, day, `${name}.jpg`);
    const md = join(OUT_DIR, day, `${name}-md.webp`);
    const fresh = (p) => existsSync(p) && statSync(p).mtimeMs >= statSync(src).mtimeMs;
    if (!FORCE && fresh(full) && fresh(md)) {
      skipped++;
      continue;
    }
    await convertPhoto(src, join(OUT_DIR, day), name);
    made++;
  }

  // 크기 목록 — 라이트박스(PhotoSwipe)에 필요한 비율
  const sizes = {};
  for (const [key] of wanted) {
    const full = join(OUT_DIR, `${key}.jpg`);
    if (!existsSync(full)) continue;
    sizes[`/photos/${slug}/${key}.jpg`] = await photoSize(full);
  }
  writeFileSync(join(trip.dir, 'photos.json'), JSON.stringify(sizes, null, 1) + '\n');

  // 더 이상 쓰지 않는 변환본 정리
  let removed = 0;
  if (existsSync(OUT_DIR)) {
    for (const day of readdirSync(OUT_DIR).filter((d) => /^day\d{2}$/.test(d))) {
      for (const file of readdirSync(join(OUT_DIR, day))) {
        const name = file.replace(/(-md)?\.(jpg|webp)$/, '');
        if (!wanted.has(`${day}/${name}`)) {
          rmSync(join(OUT_DIR, day, file));
          removed++;
        }
      }
    }
  }

  // 링크 미리보기 이미지 — 첫 화면(heroDay 표지)과 같은 사진
  const heroFile = join(trip.daysDir, `day${pad2(trip.meta.heroDay ?? 1)}.md`);
  const coverName = existsSync(heroFile) ? frontmatter(heroFile).cover?.src?.match(/\/([\w-]+)\.jpg$/)?.[1] : undefined;
  if (coverName && existsSync(join(SRC, `${coverName}.jpg`))) {
    mkdirSync(OUT_DIR, { recursive: true });
    await makeOg(join(SRC, `${coverName}.jpg`), join(OUT_DIR, 'og.jpg'));
  }

  console.log(`[photos:${slug}] ${wanted.size} referenced · ${made} converted · ${skipped} up to date · ${removed} unused removed · og.jpg from ${coverName ?? '(none)'}`);
  if (missing.length) {
    console.warn(`[photos:${slug}] ${missing.length} not found in ${SRC}:\n  ${missing.join('\n  ')}`);
    process.exitCode = 1;
  }
}
