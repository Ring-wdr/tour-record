// 여행 콘텐츠 스키마 — content collection(빌드)과 관리자 화면(폼 검증)이 같이 쓴다.
// 파일 하나 안에서 확인할 수 있는 규칙은 여기, 여러 파일을 봐야 하는 규칙(날짜 순서 등)은 src/lib/trip.ts의 checkTrip.
import { z } from 'astro/zod';

/** URL에 쓰는 여행 폴더 이름: 소문자·숫자·하이픈 (almaty-2026) */
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** [경도, 위도] — GeoJSON 순서 */
export const lngLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

const hex = z.string().regex(/^#[0-9a-f]{6}$/i, '#rrggbb 형식이어야 합니다');

export const photoSchema = z.object({
  /** `/photos/...jpg`(pnpm photos가 만든 파일, R2에서 서빙) 또는 외부 전체 URL */
  src: z
    .string()
    .regex(/^(\/photos\/.+\.jpg|https?:\/\/.+)$/i, '/photos/….jpg 또는 http(s) URL이어야 합니다'),
  alt: z.string().min(1),
  caption: z.string().optional(),
  /** 외부 URL 사진은 라이트박스용 크기를 직접 적는다. /photos 사진은 photos.json에서 읽는다 */
  w: z.number().int().positive().optional(),
  h: z.number().int().positive().optional(),
});

export const STOP_KINDS = ['arrival', 'stay', 'nature', 'food', 'culture', 'market', 'departure', 'city', 'flight'] as const;

export const stopSchema = z.object({
  /** 여행 전체에서 겹치지 않아야 한다 (지도 스크립트가 id로 장소를 찾는다) */
  id: z.string().regex(/^[a-z0-9-]+$/, '소문자·숫자·하이픈만 쓸 수 있습니다'),
  name: z.string().min(1),
  /** 영문/현지 표기 — 매거진 스타일 부제로 사용 */
  nameEn: z.string().min(1),
  coords: lngLat,
  /** 좌표가 대략치이면 true. 실제 위치 확인 후 false로 */
  approx: z.boolean().default(false),
  /** 현지 시각 "HH:MM". 다음 날로 넘어간 도착은 "+1 09:20" */
  time: z
    .string()
    .regex(/^(\+\d )?([01]\d|2[0-3]):[0-5]\d$/, '"HH:MM" 또는 "+1 HH:MM" 형식이어야 합니다')
    .optional(),
  elevation: z.number().min(-500).max(9000).optional(),
  kind: z.enum(STOP_KINDS),
  /** 지도 카메라 — 산악 지형은 pitch를 높여 3D 지형이 보이게 */
  camera: z
    .object({
      zoom: z.number().min(0).max(22).default(12),
      pitch: z.number().min(0).max(75).default(0),
      bearing: z.number().min(-360).max(360).default(0),
    })
    .default({ zoom: 12, pitch: 0, bearing: 0 }),
  note: z.string(),
  photos: z.array(photoSchema).default([]),
});

export const daySchema = z
  .object({
    day: z.number().int().min(1),
    date: z.coerce.date(),
    title: z.string().min(1),
    titleEn: z.string().min(1),
    lede: z.string(),
    /** 날짜 색 — accent: 지도 경로·강조색, from/to: 사진 플레이스홀더 그라디언트 */
    tone: z.object({ accent: hex, from: hex, to: hex }),
    /** 하루 이동 거리(km, 대략치) */
    driveKm: z.number().min(0),
    /** 숙소에서 출발하는 날이면 true — 경로선 앞에 숙소 좌표를 붙인다 */
    fromBase: z.boolean().default(true),
    /** 숙소로 돌아와 하루를 마친 날이면 true — 경로선 끝에 숙소 좌표를 붙인다 */
    toBase: z.boolean().default(false),
    /** 하루 개요를 경로 대신 여행 나라 전체로 비추고, 국경 밖은 어둡게 가린다 (trip.yaml의 spotlight 필요) */
    spotlightCountry: z.boolean().default(false),
    cover: photoSchema.optional(),
    stops: z.array(stopSchema).min(1),
  })
  .superRefine((d, ctx) => {
    const seen = new Set<string>();
    d.stops.forEach((s, i) => {
      if (seen.has(s.id)) ctx.addIssue({ code: 'custom', path: ['stops', i, 'id'], message: `장소 id '${s.id}'가 겹칩니다` });
      seen.add(s.id);
    });
  });

export const tripSchema = z
  .object({
    /** 첫 화면 큰 제목 (영문 대문자 권장) */
    title: z.string().min(1),
    subtitle: z.string().min(1),
    subtitleKo: z.string().min(1),
    /** 메타 설명 / 링크 미리보기 문구 */
    description: z.string().min(1),
    country: z.string().min(1),
    start: z.coerce.date(),
    end: z.coerce.date(),
    /** 사이트에 표시하는 숙소 좌표 — 실제 숙소가 아닌 시내 중심 등 (프라이버시) */
    base: lngLat,
    /** 첫 화면 표지로 쓸 날 (그날의 cover 사진) */
    heroDay: z.number().int().min(1).default(1),
    /** spotlightCountry인 날에 쓸 국경 파일 이름 — src/data/geo/<이름>.json */
    spotlight: z.string().optional(),
    /** 고도 그래프 섹션의 설명 문구 */
    altitudeNote: z.string().optional(),
  })
  .refine((t) => t.start <= t.end, { message: 'start가 end보다 늦습니다', path: ['end'] });

export type TripData = z.infer<typeof tripSchema>;
export type DayData = z.infer<typeof daySchema>;
export type StopData = z.infer<typeof stopSchema>;
export type PhotoData = z.infer<typeof photoSchema>;
