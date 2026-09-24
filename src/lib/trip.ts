import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { getCollection, type CollectionEntry } from 'astro:content';

export type Day = CollectionEntry<'days'>;
export type Stop = Day['data']['stops'][number];
export type PhotoInput = Stop['photos'][number];

export const TRIP = {
  title: 'ALMATY',
  subtitle: 'Seven Days Under the Tian Shan',
  subtitleKo: '톈산 아래에서 보낸 7일',
  country: 'Kazakhstan',
  start: '2026.09.11',
  end: '2026.09.17',
  /** 숙소 좌표 — day01 hotel stop과 동일하게 유지 */
  base: [76.945, 43.238] as [number, number],
};

/** 날짜별 색 — 표지 플레이스홀더와 지도 경로 강조색에 쓴다 */
export const DAY_TONES: Record<number, { accent: string; from: string; to: string }> = {
  1: { accent: '#f2a65a', from: '#3b2a4d', to: '#d9825b' }, // 도착한 저녁의 노을
  2: { accent: '#3fd0c9', from: '#0c3b4a', to: '#2fa7a0' }, // 빙하호의 청록
  3: { accent: '#9cc3ff', from: '#1c2a44', to: '#8fb3d9' }, // 설산의 푸른빛
  4: { accent: '#f4d35e', from: '#2f4a3a', to: '#e8c46a' }, // 성당의 파스텔
  5: { accent: '#ff6b4a', from: '#4a1c14', to: '#d0573a' }, // 붉은 협곡
  6: { accent: '#e9c46a', from: '#4a3418', to: '#d9b26a' }, // 모래언덕
  7: { accent: '#8bd17c', from: '#2b3a1f', to: '#b98a4a' }, // 시장과 작별
};

export async function getDays(): Promise<Day[]> {
  const days = await getCollection('days');
  return days.sort((a, b) => a.data.day - b.data.day);
}

/** 하루 경로 — 숙소에서 출발하는 날은 숙소 좌표를 앞에 붙인다 */
export function dayRoute(day: Day): [number, number][] {
  const pts = day.data.stops.map((s) => s.coords);
  return day.data.fromBase ? [TRIP.base, ...pts] : pts;
}

export function tripStats(days: Day[]) {
  const stops = days.flatMap((d) => d.data.stops);
  const elevations = stops.map((s) => s.elevation ?? 0);
  return {
    days: days.length,
    km: days.reduce((sum, d) => sum + d.data.driveKm, 0),
    places: stops.filter((s) => !['stay', 'arrival', 'departure'].includes(s.kind)).length,
    maxElevation: Math.max(...elevations),
    photos: stops.reduce((n, s) => n + s.photos.length, 0),
  };
}

export type ResolvedPhoto = PhotoInput & { exists: boolean; w: number; h: number };

const sizeCache = new Map<string, { w: number; h: number } | null>();

/**
 * 로컬 사진은 존재 여부와 크기를 빌드 시 확인한다.
 * 파일이 없으면 exists=false → 플레이스홀더로 렌더링된다.
 */
export async function resolvePhoto(p: PhotoInput): Promise<ResolvedPhoto> {
  if (/^https?:\/\//.test(p.src)) {
    return { ...p, exists: true, w: p.w ?? 1600, h: p.h ?? 1067 };
  }
  if (!sizeCache.has(p.src)) {
    const file = join(process.cwd(), 'public', p.src);
    if (!existsSync(file)) {
      sizeCache.set(p.src, null);
    } else {
      const meta = await sharp(file).rotate().metadata();
      // EXIF 회전을 반영한 크기
      const rotated = (meta.orientation ?? 1) >= 5;
      sizeCache.set(p.src, {
        w: (rotated ? meta.height : meta.width) ?? 1600,
        h: (rotated ? meta.width : meta.height) ?? 1067,
      });
    }
  }
  const size = sizeCache.get(p.src);
  return size ? { ...p, exists: true, ...size } : { ...p, exists: false, w: 1600, h: 1067 };
}

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export function formatDate(d: Date) {
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return { md: `${mm}.${dd}`, weekday: WEEKDAYS[d.getUTCDay()] };
}

export const pad2 = (n: number) => String(n).padStart(2, '0');
