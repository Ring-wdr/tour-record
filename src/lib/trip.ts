import { getCollection, type CollectionEntry } from 'astro:content';
import { tripIssues } from '../schemas/check';

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
  const result = trips.filter((t) => import.meta.env.DEV || !t.data.draft).map((t) => {
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

/** 여행 단위 규칙(src/schemas/check.ts)을 어기면 빌드(개발 서버)가 멈춘다 */
export function checkTrip(trip: Trip) {
  const issues = tripIssues(
    trip.slug,
    trip.data,
    trip.days.map((d) => ({ file: d.id.split('/')[1], data: d.data })),
    (name) => name in geoByName,
  );
  if (!issues.length) return;
  const lines = issues.map((x) => `${x.where === 'trip' ? 'trip.yaml' : `day${pad2(x.where + 1)}.md`}: ${x.message}`);
  const shown = lines.slice(0, 15);
  if (lines.length > shown.length) shown.push(`… 외 ${lines.length - shown.length}개`);
  throw new Error(`[${trip.slug}] 여행 데이터 오류 ${lines.length}개\n  - ${shown.join('\n  - ')}`);
}

/**
 * 하루 경로.
 * - fromBase: 숙소에서 출발 → 앞에 숙소 좌표
 * - fromBase가 아니면 전날 마지막 장소에서 이어서 출발 (외박한 날 다음 날)
 * - toBase: 숙소로 돌아온 날 → 뒤에 숙소 좌표
 */
export function dayRoute(day: Day, prev: Day | undefined, base: LngLat, track?: LngLat[]): LngLat[] {
  // 사진 GPS 궤적(pnpm tracks)이 있으면 그걸 쓰고, 앞뒤의 비행 구간(인천 출발·귀국)만 이어 붙인다
  if (track?.length) {
    const flights = (stops: Stop[]) => {
      const i = stops.findIndex((s) => s.kind !== 'flight');
      return stops.slice(0, i < 0 ? stops.length : i).map((s) => s.coords);
    };
    const head = flights(day.data.stops);
    const tail = flights([...day.data.stops].reverse()).reverse();
    // 숙소 주변은 프라이버시 구역으로 잘려 있으므로, 멀리서 돌아온 날은 시내 중심까지 이어 준다
    const last = track.at(-1)!;
    const kmPerLng = 111 * Math.cos((base[1] * Math.PI) / 180);
    const farFromBase = Math.hypot((last[0] - base[0]) * kmPerLng, (last[1] - base[1]) * 111) > 5; // km
    const home: LngLat[] = day.data.toBase && farFromBase ? [base] : [];
    return [...head, ...track, ...home, ...tail];
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

/** 링크 미리보기 이미지 (pnpm photos가 heroDay 표지로 만든다) */
export const ogImage = (slug: string) => `/photos/${slug}/og.jpg`;

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
