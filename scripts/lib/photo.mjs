// 사진 변환 — pnpm photos와 관리자 업로드가 같이 쓴다.
// sharp는 기본적으로 메타데이터를 쓰지 않으므로 EXIF(GPS 포함)는 모두 제거된다.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

/**
 * 긴 변 2400px JPEG(라이트박스·표지) + 1200px WebP(카드·모자이크). input = 파일 경로 또는 Buffer
 * trim = [왼쪽, 위, 폭, 높이] (%) — 회전을 반영한 원본에서 이 부분만 남긴다 (사람·번호판 제외용, md의 trim)
 */
export async function convertPhoto(input, outDir, name, trim) {
  await sharp(input, { failOn: 'none' }).metadata(); // 읽을 수 없는 파일이면 폴더를 만들기 전에 실패
  mkdirSync(outDir, { recursive: true });
  // failOn: 'none' — 일부 삼성 모션포토 JPEG은 엄격 모드에서 디코딩 오류가 난다
  let source = input;
  if (trim) {
    const buf = await sharp(input, { failOn: 'none' }).rotate().toBuffer({ resolveWithObject: true });
    const { width: W, height: H } = buf.info;
    const [x, y, w, h] = trim;
    const left = Math.round((x / 100) * W);
    const top = Math.round((y / 100) * H);
    source = await sharp(buf.data)
      .extract({ left, top, width: Math.min(W - left, Math.round((w / 100) * W)), height: Math.min(H - top, Math.round((h / 100) * H)) })
      .toBuffer();
  }
  const base = () => sharp(source, { failOn: 'none' }).rotate();
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
