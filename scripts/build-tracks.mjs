// 원본 사진 전체의 EXIF GPS로 날짜별 실제 이동 경로를 만든다.
//
//   pnpm tracks                          # 기본 원본 폴더
//   pnpm tracks -- --src "E:/other"
//
// 출력: src/data/tracks.json  { "2": [[lng, lat], ...], ... }
// - 시각은 파일명이 아니라 EXIF DateTimeOriginal + OffsetTimeOriginal로 계산한다
//   (착륙 직전 사진처럼 한국 시간이 남아 있는 경우가 있다)
// - 날짜 구분은 알마티 현지(+05:00) 기준
// - 이전 점에서 시속 180km 이상으로 튄 점은 GPS 오류로 보고 버린다
// - 1일차(비행)는 제외 — 지도에서 장소를 잇는 비행 경로를 그대로 쓴다
// - 프라이버시 구역: privacy.local.json(git 제외)의 zones 반경 안의 점은 모두 버린다
//   (숙소 위치가 경로 끝점으로 드러나지 않도록 — Strava의 privacy zone과 같은 방식)
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import exifr from 'exifr';

const args = process.argv.slice(2);
const i = args.indexOf('--src');
const SRC = (i >= 0 && args[i + 1]) || process.env.PHOTO_SRC || 'D:/archive/Camera_202609';
const TRIP_START = '2026-09-11';
const LOCAL_OFFSET_H = 5;
const MAX_KMH = 180;
const MIN_STEP_M = 60;

const toRad = (d) => (d * Math.PI) / 180;
const distM = (a, b) => {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(s));
};

/** "2026:09:12 01:12:35" + "+09:00" → UTC ms */
function utcMs(raw, offset) {
  const m = raw?.match?.(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const local = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  const o = (offset ?? `+0${LOCAL_OFFSET_H}:00`).match(/([+-])(\d{2}):(\d{2})/);
  const offMin = o ? (o[1] === '-' ? -1 : 1) * (+o[2] * 60 + +o[3]) : LOCAL_OFFSET_H * 60;
  return local - offMin * 60000;
}

const ZONES = existsSync('privacy.local.json') ? JSON.parse(readFileSync('privacy.local.json', 'utf8')).zones : [];
if (!ZONES.length) console.warn('[tracks] privacy.local.json 없음 — 숙소 주변 궤적이 그대로 포함됩니다');
const inZone = (c) => ZONES.some((z) => distM(z.center, c) < z.radiusM);

const files = readdirSync(SRC).filter((f) => /^2026091[0-8]_.*\.jpe?g$/i.test(f));
const pts = [];
for (const f of files) {
  const e = await exifr
    .parse(join(SRC, f), {
      gps: true,
      reviveValues: false,
      pick: ['DateTimeOriginal', 'OffsetTimeOriginal', 'GPSLatitude', 'GPSLongitude', 'GPSLatitudeRef', 'GPSLongitudeRef'],
    })
    .catch(() => null);
  if (e?.latitude == null) continue;
  const t = utcMs(e.DateTimeOriginal, e.OffsetTimeOriginal);
  if (t == null) continue;
  pts.push({ t, lng: e.longitude, lat: e.latitude });
}
pts.sort((a, b) => a.t - b.t);

const dayOf = (t) => {
  const local = new Date(t + LOCAL_OFFSET_H * 3600000).toISOString().slice(0, 10);
  return Math.round((Date.parse(local) - Date.parse(TRIP_START)) / 86400000) + 1;
};

const tracks = {};
const stats = {};
for (const p of pts) {
  const day = dayOf(p.t);
  if (day < 2 || day > 7) continue;
  if (p.lng < 70 || p.lng > 85) continue; // 카자흐스탄 밖(기내 등)
  const tr = (tracks[day] ??= []);
  const cur = [+p.lng.toFixed(5), +p.lat.toFixed(5)];
  if (inZone(cur)) continue;
  const last = tr.at(-1);
  if (last) {
    const d = distM(last.c, cur);
    const h = (p.t - last.t) / 3600000;
    if (d < MIN_STEP_M) continue;
    if (h > 0 && d / 1000 / h > MAX_KMH) continue;
  }
  tr.push({ c: cur, t: p.t });
}

const out = {};
for (const [day, tr] of Object.entries(tracks)) {
  out[day] = tr.map((p) => p.c);
  let m = 0;
  for (let k = 1; k < tr.length; k++) m += distM(tr[k - 1].c, tr[k].c);
  stats[day] = { points: tr.length, km: Math.round(m / 1000) };
}

mkdirSync('src/data', { recursive: true });
writeFileSync('src/data/tracks.json', JSON.stringify(out) + '\n');
console.log(`[tracks] ${pts.length} geotagged photos → src/data/tracks.json`);
console.table(stats);
