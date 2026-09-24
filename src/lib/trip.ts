import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { getCollection, type CollectionEntry } from 'astro:content';

export type Day = CollectionEntry<'days'>;
export type Stop = Day['data']['stops'][number];
export type PhotoInput = Stop['photos'][number];

export const TRIP = {
  title: 'ALMATY',
  subtitle: 'Seven Days in Kazakhstan',
  subtitleKo: '카자흐스탄에서 보낸 7일',
  country: 'Kazakhstan',
  start: '2026.09.11',
  end: '2026.09.17',
  /**
   * 숙소 대신 공개하는 좌표 — 알마티 시내 중심. 실제 숙소 위치는 공개하지 않는다
   * (실제 좌표는 git 제외 파일 privacy.local.json에만 있고, 그 주변 GPS 궤적은 pnpm tracks가 잘라낸다)
   * day01 hotel stop 좌표와 같게 유지
   */
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

/**
 * 하루 경로.
 * - fromBase: 숙소에서 출발 → 앞에 숙소 좌표
 * - fromBase가 아니면 전날 마지막 장소에서 이어서 출발 (외박한 날 다음 날)
 * - toBase: 숙소로 돌아온 날 → 뒤에 숙소 좌표
 */
export function dayRoute(day: Day, prev?: Day, track?: [number, number][]): [number, number][] {
  // 사진 GPS 궤적(pnpm tracks)이 있으면 그걸 쓰고, 끝의 비행 구간(인천 귀국 등)만 이어 붙인다
  if (track?.length) {
    const tail: [number, number][] = [];
    for (const s of [...day.data.stops].reverse()) {
      if (s.kind !== 'flight') break;
      tail.unshift(s.coords);
    }
    // 숙소 주변은 프라이버시 구역으로 잘려 있으므로, 멀리서 돌아온 날은 시내 중심까지 이어 준다
    const last = track.at(-1)!;
    const farFromBase = Math.hypot((last[0] - TRIP.base[0]) * 81, (last[1] - TRIP.base[1]) * 111) > 5; // km
    const home: [number, number][] = day.data.toBase && farFromBase ? [TRIP.base] : [];
    return [...track, ...home, ...tail];
  }
  const pts = day.data.stops.map((s) => s.coords);
  const start = day.data.fromBase ? [TRIP.base] : prev ? [prev.data.stops.at(-1)!.coords] : [];
  const end = day.data.toBase ? [TRIP.base] : [];
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

/** 화면 표시용(카드/모자이크) — pnpm photos가 만든 -md.webp가 있으면 그걸 쓴다 */
export type ResolvedPhoto = PhotoInput & { exists: boolean; w: number; h: number; display: string };

function displaySrc(src: string) {
  const md = src.replace(/\.jpg$/i, '-md.webp');
  return md !== src && existsSync(join(process.cwd(), 'public', md)) ? md : src;
}

const sizeCache = new Map<string, { w: number; h: number } | null>();

/**
 * 로컬 사진은 존재 여부와 크기를 빌드 시 확인한다.
 * 파일이 없으면 exists=false → 플레이스홀더로 렌더링된다.
 */
export async function resolvePhoto(p: PhotoInput): Promise<ResolvedPhoto> {
  if (/^https?:\/\//.test(p.src)) {
    return { ...p, exists: true, w: p.w ?? 1600, h: p.h ?? 1067, display: p.src };
  }
  // 없는 파일은 캐시하지 않는다 — 개발 서버 실행 중에 pnpm photos로 추가한 사진도 바로 반영되도록
  if (!sizeCache.get(p.src)) {
    const file = join(process.cwd(), 'public', p.src);
    if (existsSync(file)) {
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
  return size
    ? { ...p, exists: true, ...size, display: displaySrc(p.src) }
    : { ...p, exists: false, w: 1600, h: 1067, display: p.src };
}

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export function formatDate(d: Date) {
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return { md: `${mm}.${dd}`, weekday: WEEKDAYS[d.getUTCDay()] };
}

export const pad2 = (n: number) => String(n).padStart(2, '0');
