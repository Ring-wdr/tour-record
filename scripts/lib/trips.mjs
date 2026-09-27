// 파이프라인 스크립트(photos, tracks, photos:upload)가 공유하는 여행 폴더 읽기.
//
// 여행 1개 = src/content/trips/<slug>/ (trip.yaml + days/dayXX.md)
// 로컬 전용 설정은 trips.local.json(git 제외):
//   { "<slug>": { "source": "D:/archive/Camera_202609", "zones": [{ "name", "center": [lng, lat], "radiusM" }] } }
//   source = 원본 사진 폴더, zones = 경로에서 잘라낼 프라이버시 구역(숙소 등)
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

export const TRIPS_DIR = 'src/content/trips';
const LOCAL = existsSync('trips.local.json') ? JSON.parse(readFileSync('trips.local.json', 'utf8')) : {};

export const args = process.argv.slice(2);
export const argVal = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

export const allSlugs = () => readdirSync(TRIPS_DIR).filter((d) => existsSync(join(TRIPS_DIR, d, 'trip.yaml')));

/** --trip <slug>가 있으면 그 여행만, 없으면 전체 */
export function selectedSlugs() {
  const one = argVal('--trip');
  if (!one) return allSlugs();
  if (!allSlugs().includes(one)) throw new Error(`여행 '${one}'이 없습니다 (${TRIPS_DIR}/${one}/trip.yaml)`);
  return [one];
}

/** YAML 날짜(2026-09-11)는 파서 설정에 따라 문자열/Date로 온다 → "YYYY-MM-DD" */
const isoDate = (v) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);

/** md 파일의 frontmatter */
export function frontmatter(file) {
  const m = readFileSync(file, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? parse(m[1]) : {};
}

export function loadTrip(slug) {
  const dir = join(TRIPS_DIR, slug);
  const meta = parse(readFileSync(join(dir, 'trip.yaml'), 'utf8'));
  const daysDir = join(dir, 'days');
  const dayFiles = existsSync(daysDir) ? readdirSync(daysDir).filter((f) => /^day\d{2}\.md$/.test(f)).sort() : [];
  return {
    slug,
    dir,
    daysDir,
    dayFiles,
    meta: { ...meta, start: isoDate(meta.start), end: isoDate(meta.end) },
    local: LOCAL[slug] ?? {},
  };
}
