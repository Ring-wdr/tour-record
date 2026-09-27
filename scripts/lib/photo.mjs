// 사진 변환 — pnpm photos와 관리자 업로드가 같이 쓴다.
// sharp는 기본적으로 메타데이터를 쓰지 않으므로 EXIF(GPS 포함)는 모두 제거된다.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

/** 긴 변 2400px JPEG(라이트박스·표지) + 1200px WebP(카드·모자이크). input = 파일 경로 또는 Buffer */
export async function convertPhoto(input, outDir, name) {
  await sharp(input, { failOn: 'none' }).metadata(); // 읽을 수 없는 파일이면 폴더를 만들기 전에 실패
  mkdirSync(outDir, { recursive: true });
  // failOn: 'none' — 일부 삼성 모션포토 JPEG은 엄격 모드에서 디코딩 오류가 난다
  const base = () => sharp(input, { failOn: 'none' }).rotate();
  const full = join(outDir, `${name}.jpg`);
  const info = await base()
    .resize(2400, 2400, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true, progressive: true })
    .toFile(full);
  await base()
    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78 })
    .toFile(join(outDir, `${name}-md.webp`));
  return { w: info.width, h: info.height };
}

/** 링크 미리보기 1200×630 */
export async function makeOg(input, outFile) {
  await sharp(input, { failOn: 'none' })
    .rotate()
    .resize(1200, 630, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: 84, mozjpeg: true })
    .toFile(outFile);
}

/** 변환된 JPEG의 크기 (photos.json용) */
export async function photoSize(file) {
  const m = await sharp(file).metadata();
  return { w: m.width, h: m.height };
}
