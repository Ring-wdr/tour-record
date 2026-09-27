import { getCollection, type CollectionEntry } from 'astro:content';
import { SLUG_RE } from '../schemas/trip';

export type Day = CollectionEntry<'days'>;
export type Stop = Day['data']['stops'][number];
export type PhotoInput = Stop['photos'][number];
export type Tone = Day['data']['tone'];
type LngLat = [number, number];
type Geo = { bbox: [LngLat, LngLat]; ring: LngLat[] };

export type Trip = {
  slug: string;
  data: CollectionEntry<'trips'>['data'];
  /** day 순 */
  days: Day[];
  /** 날짜별 사진 GPS 궤적 (pnpm tracks) — 없으면 장소를 이은 직선 */
  tracks: Record<string, LngLat[]>;
  /** spotlight 국경 (src/data/geo/<이름>.json) */
  geo?: Geo;
};

// 여행 폴더의 생성 파일들 — 경로의 폴더 이름이 slug
const TRACKS = import.meta.glob<Record<string, LngLat[]>>('../content/trips/*/tracks.json', { eager: true, import: 'default' });
const SIZES = import.meta.glob<Record<string, { w: number; h: number }>>('../content/trips/*/photos.json', {
  eager: true,
  import: 'default',
});
const GEO = import.meta.glob<Geo>('../data/geo/*.json', { eager: true, import: 'default' });

const slugOf = (path: string) => path.split('/').at(-2)!;
const byFile = <T>(files: Record<string, T>) => Object.fromEntries(Object.entries(files).map(([p, v]) => [slugOf(p), v]));
const tracksBySlug = byFile(TRACKS);
const geoByName = Object.fromEntries(Object.entries(GEO).map(([p, v]) => [p.split('/').at(-1)!.replace('.json', ''), v]));
/** 사진 URL은 여행마다 다르므로 전체를 한 표로 합쳐 둔다 */
const photoSizes = Object.assign({}, ...Object.values(SIZES)) as Record<string, { w: number; h: number }>;

/** 모든 여행 — 최근 여행부터 */
export async function getTrips(): Promise<Trip[]> {
  const [trips, days] = await Promise.all([getCollection('trips'), getCollection('days')]);
  const result = trips.map((t) => {
    const trip: Trip = {
      slug: t.id,
      data: t.data,
      days: days.filter((d) => d.id.startsWith(`${t.id}/`)).sort((a, b) => a.data.day - b.data.day),
      tracks: tracksBySlug[t.id] ?? {},
      geo: t.data.spotlight ? geoByName[t.data.spotlight] : undefined,
    };
    checkTrip(trip);
    return trip;
  });
  const orphans = days.filter((d) => !trips.some((t) => d.id.startsWith(`${t.id}/`)));
  if (orphans.length) throw new Error(`trip.yaml이 없는 여행 폴더의 날짜 파일: ${orphans.map((d) => d.id).join(', ')}`);
  return result.sort((a, b) => b.data.start.getTime() - a.data.start.getTime());
}

const DAY_MS = 86_400_000;

/**
 * 파일 하나의 스키마로는 확인할 수 없는 여행 단위 규칙. 어기면 빌드(개발 서버)가 멈춘다.
 * - 폴더 이름은 URL에 쓸 수 있는 slug
 * - 날짜 파일 dayXX.md의 XX = frontmatter day, 1일차부터 빠짐없이
 * - date = start + (day - 1), end를 넘지 않음
 * - 장소 id는 여행 전체에서 겹치지 않음
 * - heroDay가 있는 날이어야 하고, spotlightCountry를 쓰면 trip.yaml의 spotlight 국경 파일이 있어야 함
 */
export function checkTrip(trip: Trip) {
  const { slug, data: t, days } = trip;
  const errors: string[] = [];
  if (!SLUG_RE.test(slug)) errors.push(`폴더 이름 '${slug}'는 소문자·숫자·하이픈만 쓸 수 있습니다`);
  if (!days.length) errors.push('days/ 폴더에 날짜 파일이 없습니다');

  const stopIds = new Map<string, number>();
  days.forEach((d, i) => {
    const { day, date, stops, spotlightCountry } = d.data;
    const file = d.id.split('/')[1];
    if (file !== `day${pad2(day)}`) errors.push(`${file}.md: day가 ${day}입니다 (파일 이름과 다름)`);
    if (day !== i + 1) errors.push(`${file}.md: ${i + 1}일차가 빠졌거나 day가 겹칩니다`);
    const expected = new Date(t.start.getTime() + (day - 1) * DAY_MS);
    if (date.getTime() !== expected.getTime())
      errors.push(`${file}.md: date ${ymd(date, '-')} ≠ 시작일 + ${day - 1}일 (${ymd(expected, '-')})`);
    if (date > t.end) errors.push(`${file}.md: date ${ymd(date, '-')}가 여행 끝(${ymd(t.end, '-')}) 이후입니다`);
    if (spotlightCountry && !trip.geo)
      errors.push(`${file}.md: spotlightCountry를 쓰려면 trip.yaml에 spotlight(src/data/geo/<이름>.json)가 필요합니다`);
    for (const s of stops) {
      const prev = stopIds.get(s.id);
      if (prev != null) errors.push(`${file}.md: 장소 id '${s.id}'가 ${prev}일차와 겹칩니다`);
      stopIds.set(s.id, day);
    }
  });
  if (days.length && !days.some((d) => d.data.day === t.heroDay)) errors.push(`trip.yaml: heroDay ${t.heroDay}일차가 없습니다`);
  if (t.spotlight && !trip.geo) errors.push(`trip.yaml: src/data/geo/${t.spotlight}.json이 없습니다`);

  if (errors.length) throw new Error(`[${slug}] 여행 데이터 오류\n  - ${errors.join('\n  - ')}`);
}

/**
 * 하루 경로.
 * - fromBase: 숙소에서 출발 → 앞에 숙소 좌표
 * - fromBase가 아니면 전날 마지막 장소에서 이어서 출발 (외박한 날 다음 날)
 * - toBase: 숙소로 돌아온 날 → 뒤에 숙소 좌표
 */
export function dayRoute(day: Day, prev: Day | undefined, base: LngLat, track?: LngLat[]): LngLat[] {
  // 사진 GPS 궤적(pnpm tracks)이 있으면 그걸 쓰고, 끝의 비행 구간(인천 귀국 등)만 이어 붙인다
  if (track?.length) {
    const tail: LngLat[] = [];
    for (const s of [...day.data.stops].reverse()) {
      if (s.kind !== 'flight') break;
      tail.unshift(s.coords);
    }
    // 숙소 주변은 프라이버시 구역으로 잘려 있으므로, 멀리서 돌아온 날은 시내 중심까지 이어 준다
    const last = track.at(-1)!;
    const kmPerLng = 111 * Math.cos((base[1] * Math.PI) / 180);
    const farFromBase = Math.hypot((last[0] - base[0]) * kmPerLng, (last[1] - base[1]) * 111) > 5; // km
    const home: LngLat[] = day.data.toBase && farFromBase ? [base] : [];
    return [...track, ...home, ...tail];
  }
  const pts = day.data.stops.map((s) => s.coords);
  const start = day.data.fromBase ? [base] : prev ? [prev.data.stops.at(-1)!.coords] : [];
  const end = day.data.toBase ? [base] : [];
  return [...start, ...pts, ...end];
}

export function tripStats(days: Day[]) {
  const stops = days.flatMap((d) => d.data.stops);
  const elevations = stops.map((s) => s.elevation ?? 0);
  return {
    days: days.length,
    km: days.reduce((sum, d) => sum + d.data.driveKm, 0),
    places: stops.filter((s) => !['stay', 'arrival', 'departure', 'flight'].includes(s.kind)).length,
    maxElevation: Math.max(...elevations),
    photos: stops.reduce((n, s) => n + s.photos.length, 0),
  };
}

/** 화면 표시용(display)은 카드·모자이크에 쓰는 1200px WebP, src는 라이트박스용 2400px JPEG */
export type ResolvedPhoto = PhotoInput & { exists: boolean; w: number; h: number; display: string };

/**
 * 사진 크기는 pnpm photos가 만든 여행 폴더의 photos.json에서 읽는다.
 * 사진 파일은 R2에서 서빙되므로 빌드할 때 파일이 없어도 된다.
 * 목록에 없는 사진은 exists=false → 플레이스홀더로 렌더링된다.
 */
export function resolvePhoto(p: PhotoInput): ResolvedPhoto {
  if (/^https?:\/\//.test(p.src)) {
    return { ...p, exists: true, w: p.w ?? 1600, h: p.h ?? 1067, display: p.src };
  }
  const size = photoSizes[p.src];
  return size
    ? { ...p, exists: true, ...size, display: p.src.replace(/\.jpg$/i, '-md.webp') }
    : { ...p, exists: false, w: 1600, h: 1067, display: p.src };
}

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export function formatDate(d: Date) {
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return { md: `${mm}.${dd}`, weekday: WEEKDAYS[d.getUTCDay()] };
}

/** 2026-09-11 → "2026.09.11" */
export const ymd = (d: Date, sep = '.') =>
  [d.getUTCFullYear(), pad2(d.getUTCMonth() + 1), pad2(d.getUTCDate())].join(sep);

/** [76.945, 43.238] → "43.2380° N · 76.9450° E" */
export const formatLngLat = ([lng, lat]: LngLat) =>
  `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lng).toFixed(4)}° ${lng >= 0 ? 'E' : 'W'}`;

export const pad2 = (n: number) => String(n).padStart(2, '0');
