// 원본 사진 전체의 EXIF GPS로 날짜별 실제 이동 경로를 만든다.
//
//   pnpm tracks                              # 모든 여행
//   pnpm tracks -- --trip almaty-2026        # 한 여행만
//   pnpm tracks -- --trip x --src "E:/other" # 원본 폴더 지정 (기본: trips.local.json의 source)
//
// 출력: src/content/trips/<slug>/tracks.json  { "2": [[lng, lat], ...], ... }
// - 시각은 파일명이 아니라 EXIF DateTimeOriginal + OffsetTimeOriginal로 계산한다
//   (착륙 직전 사진처럼 한국 시간이 남아 있는 경우가 있다)
// - 날짜 구분은 trip.yaml utcOffset(현지 시간) 기준, 1일차 = trip.yaml start
// - 이전 점에서 시속 180km 이상으로 튄 점은 GPS 오류로 보고 버린다
// - trip.yaml tracks.skipDays(비행만 있는 날 등)는 제외 — 지도에서 장소를 잇는 선을 그대로 쓴다
// - trip.yaml tracks.bbox 밖의 점(기내·경유지)은 버린다
// - 프라이버시 구역: trips.local.json(git 제외)의 zones 반경 안의 점은 모두 버린다
//   (숙소 위치가 경로 끝점으로 드러나지 않도록 — Strava의 privacy zone과 같은 방식)
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import exifr from 'exifr';
import { argVal, selectedSlugs, loadTrip } from './lib/trips.mjs';

const MAX_KMH = 180;
const MIN_STEP_M = 60;
const DAY_MS = 86400000;

const toRad = (d) => (d * Math.PI) / 180;
const distM = (a, b) => {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(s));
};

/** "+05:00" → 300 (분) */
const offsetMin = (o) => {
  const m = o?.match(/([+-])(\d{2}):(\d{2})/);
  return m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]) : null;
};

/** "2026:09:12 01:12:35" + "+09:00" → UTC ms. 오프셋이 없으면 여행지 현지 시각으로 본다 */
function utcMs(raw, offset, localOffMin) {
  const m = raw?.match?.(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const local = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return local - (offsetMin(offset) ?? localOffMin) * 60000;
}

for (const slug of selectedSlugs()) {
  const trip = loadTrip(slug);
  const SRC = argVal('--src') ?? trip.local.source ?? process.env.PHOTO_SRC;
  if (!SRC) {
    console.warn(`[tracks:${slug}] 원본 폴더를 모릅니다 — trips.local.json에 "${slug}": { "source": ... }를 적거나 --src를 주세요`);
    process.exitCode = 1;
    continue;
  }
  const { start, end, utcOffset, tracks: opt = {} } = trip.meta;
  const localOff = offsetMin(utcOffset);
  if (localOff == null) throw new Error(`[tracks:${slug}] trip.yaml에 utcOffset(+HH:MM)이 필요합니다`);
  const skipDays = new Set(opt.skipDays ?? []);
  const [[west, south], [east, north]] = opt.bbox ?? [[-180, -90], [180, 90]];
  const lastDay = Math.round((Date.parse(end) - Date.parse(start)) / DAY_MS) + 1;

  const ZONES = trip.local.zones ?? [];
  if (!ZONES.length) console.warn(`[tracks:${slug}] trips.local.json에 zones 없음 — 숙소 주변 궤적이 그대로 포함됩니다`);
  const inZone = (c) => ZONES.some((z) => distM(z.center, c) < z.radiusM);

  // 파일명 날짜(휴대폰 시간대)로 먼저 거른다 — 시간대 차이를 감안해 앞뒤 하루씩 여유
  const ymd = (ms) => new Date(ms).toISOString().slice(0, 10).replaceAll('-', '');
  const [from, to] = [ymd(Date.parse(start) - DAY_MS), ymd(Date.parse(end) + DAY_MS)];
  const files = readdirSync(SRC).filter((f) => {
    const m = f.match(/^(\d{8})_.*\.jpe?g$/i);
    return m && m[1] >= from && m[1] <= to;
  });

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
    const t = utcMs(e.DateTimeOriginal, e.OffsetTimeOriginal, localOff);
    if (t == null) continue;
    pts.push({ t, lng: e.longitude, lat: e.latitude });
  }
  pts.sort((a, b) => a.t - b.t);

  const dayOf = (t) => {
    const local = new Date(t + localOff * 60000).toISOString().slice(0, 10);
    return Math.round((Date.parse(local) - Date.parse(start)) / DAY_MS) + 1;
  };

  const tracks = {};
  for (const p of pts) {
    const day = dayOf(p.t);
    if (day < 1 || day > lastDay || skipDays.has(day)) continue;
    if (p.lng < west || p.lng > east || p.lat < south || p.lat > north) continue;
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
  const stats = {};
  for (const [day, tr] of Object.entries(tracks)) {
    out[day] = tr.map((p) => p.c);
    let m = 0;
    for (let k = 1; k < tr.length; k++) m += distM(tr[k - 1].c, tr[k].c);
    stats[day] = { points: tr.length, km: Math.round(m / 1000) };
  }

  writeFileSync(join(trip.dir, 'tracks.json'), JSON.stringify(out) + '\n');
  console.log(`[tracks:${slug}] ${pts.length} geotagged photos → ${trip.dir}/tracks.json`);
  console.table(stats);
}
