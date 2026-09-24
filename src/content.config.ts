import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const photo = z.object({
  /** public/ 기준 경로(`/photos/day02/lake-01.jpg`) 또는 R2 전체 URL */
  src: z.string(),
  alt: z.string(),
  caption: z.string().optional(),
  /** 원격(R2) 사진은 라이트박스용 크기를 직접 적는다. 로컬 사진은 빌드 시 자동 측정 */
  w: z.number().optional(),
  h: z.number().optional(),
});

const stop = z.object({
  id: z.string(),
  name: z.string(),
  /** 영문/현지 표기 — 매거진 스타일 부제로 사용 */
  nameEn: z.string(),
  /** [경도, 위도] — GeoJSON 순서 */
  coords: z.tuple([z.number(), z.number()]),
  /** 좌표가 대략치이면 true. 실제 위치 확인 후 false로 */
  approx: z.boolean().default(false),
  time: z.string().optional(),
  elevation: z.number().optional(),
  kind: z.enum(['arrival', 'stay', 'nature', 'food', 'culture', 'market', 'departure', 'city', 'flight']),
  /** 지도 카메라 — 산악 지형은 pitch를 높여 3D 지형이 보이게 */
  camera: z
    .object({
      zoom: z.number().default(12),
      pitch: z.number().default(0),
      bearing: z.number().default(0),
    })
    .default({ zoom: 12, pitch: 0, bearing: 0 }),
  note: z.string(),
  photos: z.array(photo).default([]),
});

const days = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/days' }),
  schema: z.object({
    day: z.number(),
    date: z.coerce.date(),
    title: z.string(),
    titleEn: z.string(),
    lede: z.string(),
    /** 하루 이동 거리(km, 대략치) */
    driveKm: z.number(),
    /** 숙소에서 출발하는 날이면 true — 경로선 앞에 숙소 좌표를 붙인다 */
    fromBase: z.boolean().default(true),
    /** 숙소로 돌아와 하루를 마친 날이면 true — 경로선 끝에 숙소 좌표를 붙인다 */
    toBase: z.boolean().default(false),
    /** 하루 개요를 경로 대신 카자흐스탄 전체로 비추고, 국경 밖은 어둡게 가린다 */
    spotlightCountry: z.boolean().default(false),
    cover: photo.optional(),
    stops: z.array(stop),
  }),
});

export const collections = { days };
