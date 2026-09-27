// 관리자 API — astro dev 서버의 미들웨어로만 붙는다 (integrations/admin/index.ts). 운영 빌드에는 없다.
//   GET  /api/admin/meta                          폼에 필요한 목록 (기존 여행 slug, 국경 파일, 장소 종류)
//   POST /api/admin/trips?dryRun=1                검증만 (사진 올리기 전에 먼저 부른다)
//   PUT  /api/admin/photos/<slug>/<dayXX>/<name>  사진 한 장(본문 = 이미지) → public/photos/<slug>/dayXX/<name>.jpg + -md.webp
//   POST /api/admin/trips                         새 여행 만들기:
//        검증 → 사진이 다 올라왔는지 확인 → photos.json·og.jpg → R2 업로드 → trip.yaml + days/dayXX.md
//        R2 업로드가 실패하면 콘텐츠 파일은 쓰지 않는다 (변환된 사진은 남아 다시 누르면 이어서 올린다)
import type { IncomingMessage, ServerResponse } from 'node:http';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'astro/zod';
import { tripSchema, daySchema, SLUG_RE, STOP_KINDS } from '../../src/schemas/trip';
import { tripIssues, type TripIssue } from '../../src/schemas/check';
import { convertPhoto, makeOg, photoSize } from '../../scripts/lib/photo.mjs';
import { uploadPhotos } from '../../scripts/lib/r2.mjs';
import { tripYaml, dayMarkdown } from './serialize';

const DAY_MS = 86_400_000;
const MAX_PHOTO_BYTES = 80 * 1024 * 1024;
const pad2 = (n: number) => String(n).padStart(2, '0');

type Issue = { path: string; message: string };
type ZodIssueLike = { code: string; path: PropertyKey[]; message: string; origin?: string; minimum?: unknown; expected?: string };

/** 폼에서 자주 나는 오류는 짧은 말로, 나머지는 zod 한국어 메시지 (스키마에 직접 적은 메시지는 그대로) */
function friendly(i: ZodIssueLike) {
  if (i.code === 'too_small' && i.origin === 'string' && i.minimum === 1) return '필수 입력입니다';
  if (i.code === 'too_small' && i.origin === 'array') return `${i.minimum}개 이상 필요합니다`;
  if (i.code === 'invalid_type') return i.expected === 'number' ? '숫자를 입력하세요' : '필수 입력입니다';
  return i.message;
}
type CreateBody = {
  slug: string;
  trip: Record<string, unknown>;
  days: { data: Record<string, unknown>; body: string }[];
  /** trips.local.json에 들어갈 로컬 전용 설정 — 사이트에는 안 나간다 */
  local?: { source?: string; hotel?: [number, number] };
};

export function createAdminApi(root: string) {
  // dev 서버에서만 불린다 — 빌드의 콘텐츠 오류 메시지는 건드리지 않는다
  z.config(z.locales.ko());
  const TRIPS = join(root, 'src/content/trips');
  const GEO = join(root, 'src/data/geo');
  const LOCAL = join(root, 'trips.local.json');
  const PHOTOS = join(root, 'public/photos');
  const slugs = () => (existsSync(TRIPS) ? readdirSync(TRIPS).filter((d) => existsSync(join(TRIPS, d, 'trip.yaml'))) : []);
  const geoNames = () => (existsSync(GEO) ? readdirSync(GEO).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : []);
  /** /photos/<slug>/dayXX/<name>.jpg → public 아래 실제 파일 */
  const localPhoto = (src: string) => join(root, 'public', src);

  function validate(body: CreateBody): { issues: Issue[]; trip?: any; days?: any[] } {
    const issues: Issue[] = [];
    const zodIssues = (prefix: string, error: { issues: ZodIssueLike[] }) =>
      error.issues.forEach((i) => issues.push({ path: [prefix, ...i.path.map(String)].filter(Boolean).join('.'), message: friendly(i) }));

    if (!SLUG_RE.test(body.slug ?? '')) issues.push({ path: 'slug', message: '소문자·숫자·하이픈만 쓸 수 있습니다 (예: osaka-2025)' });
    else if (existsSync(join(TRIPS, body.slug))) issues.push({ path: 'slug', message: `'${body.slug}' 여행이 이미 있습니다` });

    const trip = tripSchema.safeParse(body.trip);
    if (!trip.success) zodIssues('trip', trip.error);
    // day·date는 순서와 시작일로 정한다 — 폼에서 받지 않는다
    const start = trip.success ? trip.data.start.getTime() : Date.parse(String(body.trip?.start));
    const days = (body.days ?? []).map((d, i) => {
      const r = daySchema.safeParse({ ...d.data, day: i + 1, date: new Date(start + i * DAY_MS).toISOString().slice(0, 10) });
      if (!r.success) zodIssues(`days.${i}`, r.error);
      return r.success ? r.data : undefined;
    });
    if (!body.days?.length) issues.push({ path: 'trip.end', message: '여행 기간이 비었습니다' });

    if (issues.length || !trip.success) return { issues };
    const cross = tripIssues(
      body.slug,
      trip.data,
      days.map((data) => ({ data: data! })),
      (n) => geoNames().includes(n),
    );
    const at = (x: TripIssue) => (x.where === 'trip' ? (x.path[0] === 'slug' ? 'slug' : ['trip', ...x.path].join('.')) : ['days', x.where, ...x.path].join('.'));
    cross.forEach((x) => issues.push({ path: at(x), message: x.message }));
    return { issues, trip: trip.data, days };
  }

  /** 여행에 쓰인 /photos 사진 [폼 경로, src] */
  function photoRefs(days: any[]): [string, string][] {
    return days.flatMap((d, i) => [
      ...(d.cover ? [[`days.${i}.cover`, d.cover.src] as [string, string]] : []),
      ...d.stops.flatMap((s: any, j: number) =>
        s.photos.map((p: any, k: number) => [`days.${i}.stops.${j}.photos.${k}`, p.src] as [string, string]),
      ),
    ]).filter(([, src]) => src.startsWith('/photos/'));
  }

  async function create(body: CreateBody, log: (s: string) => void) {
    const { issues, trip, days } = validate(body);
    if (issues.length) return { status: 422, json: { issues } };
    const slug = body.slug;

    // 1) 사진이 모두 변환돼 있는지 (PUT /photos로 먼저 올라와 있어야 한다)
    const refs = photoRefs(days!);
    const missing = refs.filter(([, src]) => !existsSync(localPhoto(src)));
    if (missing.length)
      return { status: 422, json: { issues: missing.map(([path]) => ({ path, message: '사진 파일이 올라오지 않았습니다 — 다시 선택하세요' })) } };

    // 2) 이번 여행에 안 쓰는 변환본 정리 (이전 시도에서 올렸다 뺀 사진이 R2로 가지 않게)
    const used = new Set(refs.map(([, src]) => src.replace(/\.jpg$/, '')));
    const tripPhotos = join(PHOTOS, slug);
    for (const day of existsSync(tripPhotos) ? readdirSync(tripPhotos).filter((d) => /^day\d{2}$/.test(d)) : []) {
      for (const f of readdirSync(join(tripPhotos, day))) {
        if (!used.has(`/photos/${slug}/${day}/${f.replace(/(-md)?\.(jpg|webp)$/, '')}`)) rmSync(join(tripPhotos, day, f));
      }
    }

    // 3) 사진 크기(photos.json)와 링크 미리보기(og.jpg — heroDay 표지)
    const sizes: Record<string, { w: number; h: number }> = {};
    for (const [, src] of refs) sizes[src] ??= await photoSize(localPhoto(src));
    const heroCover = days![trip.heroDay - 1]?.cover?.src;
    if (heroCover?.startsWith('/photos/')) {
      mkdirSync(tripPhotos, { recursive: true });
      await makeOg(localPhoto(heroCover), join(tripPhotos, 'og.jpg'));
    }

    // 4) R2 업로드 — 실패하면 여기서 멈추고 콘텐츠 파일은 쓰지 않는다
    let r2 = { bucket: '', total: 0, uploaded: 0 };
    if (existsSync(tripPhotos)) {
      try {
        r2 = await uploadPhotos({ slugs: [slug], root, log });
      } catch (e) {
        return { status: 502, json: { error: `R2 업로드 실패 — 콘텐츠 파일은 만들지 않았다. 다시 누르면 이어서 올린다.\n${e instanceof Error ? e.message : e}` } };
      }
    }

    // 5) 콘텐츠 파일
    const dir = join(TRIPS, slug);
    mkdirSync(join(dir, 'days'), { recursive: true });
    const files = [join(dir, 'trip.yaml')];
    writeFileSync(files[0], tripYaml(trip));
    days!.forEach((d, i) => {
      const f = join(dir, 'days', `day${pad2(i + 1)}.md`);
      writeFileSync(f, dayMarkdown(d, body.days[i].body ?? ''));
      files.push(f);
    });
    if (refs.length) {
      const f = join(dir, 'photos.json');
      writeFileSync(f, JSON.stringify(sizes, null, 1) + '\n');
      files.push(f);
    }
    // 로컬 전용 설정: 원본 사진 폴더, 실제 숙소 좌표(프라이버시 구역) — git 제외 파일
    if (body.local?.source || body.local?.hotel) {
      const local = existsSync(LOCAL) ? JSON.parse(readFileSync(LOCAL, 'utf8')) : {};
      local[slug] = {
        ...(body.local.source && { source: body.local.source }),
        ...(body.local.hotel && { zones: [{ name: 'hotel', center: body.local.hotel, radiusM: 700 }] }),
      };
      writeFileSync(LOCAL, JSON.stringify(local, null, 2) + '\n');
    }
    const rel = (f: string) => f.slice(root.length + 1).replaceAll('\\', '/');
    return { status: 201, json: { slug, files: files.map(rel), photos: refs.length, r2 } };
  }

  /** PUT /photos/<slug>/<dayXX>/<name> — 새 여행의 사진만 받는다 (기존 여행 사진은 덮어쓰지 않게) */
  async function putPhoto(path: string, req: IncomingMessage) {
    const m = path.match(/^\/photos\/([^/]+)\/(day\d{2})\/([\w-]+)$/);
    if (!m || !SLUG_RE.test(m[1])) return { status: 400, json: { error: '경로는 /photos/<slug>/dayXX/<이름>' } };
    const [, slug, day, name] = m;
    if (slugs().includes(slug)) return { status: 409, json: { error: `'${slug}' 여행이 이미 있습니다` } };
    const buf = await readBuffer(req, MAX_PHOTO_BYTES);
    if (!buf) return { status: 413, json: { error: `사진이 ${MAX_PHOTO_BYTES / 1024 / 1024}MB보다 큽니다` } };
    try {
      const size = await convertPhoto(buf, join(PHOTOS, slug, day), name);
      return { status: 200, json: { src: `/photos/${slug}/${day}/${name}.jpg`, ...size } };
    } catch (e) {
      return { status: 415, json: { error: `이미지를 읽을 수 없습니다 (JPEG·PNG·WebP만 — HEIC는 안 됨): ${e instanceof Error ? e.message : e}` } };
    }
  }

  const send = (res: ServerResponse, status: number, json: unknown) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(json));
  };
  const readBuffer = (req: IncomingMessage, limit = Infinity) =>
    new Promise<Buffer | null>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      req.on('data', (c: Buffer) => {
        size += c.length;
        if (size <= limit) chunks.push(c);
      });
      req.on('end', () => resolve(size > limit ? null : Buffer.concat(chunks)));
      req.on('error', reject);
    });

  /** connect 미들웨어 — '/api/admin'에 붙이므로 req.url은 그 뒤 경로 */
  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      // 다른 사이트가 브라우저를 통해 로컬 dev 서버에 쓰지 못하게: 같은 origin + 정해진 Content-Type만
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'cross-origin' });
      const url = new URL(req.url ?? '/', 'http://x');
      const type = req.headers['content-type'] ?? '';

      if (req.method === 'GET' && url.pathname === '/meta') {
        return send(res, 200, { trips: slugs(), geo: geoNames(), kinds: STOP_KINDS });
      }
      // 만든 여행 요약 — 저장 직후 dev 서버가 페이지를 새로고침해도 완료 화면을 다시 그릴 수 있게
      const summary = url.pathname.match(/^\/trips\/([a-z0-9-]+)$/);
      if (req.method === 'GET' && summary) {
        const dir = join(TRIPS, summary[1]);
        if (!existsSync(join(dir, 'trip.yaml'))) return send(res, 404, { error: 'not found' });
        const days = readdirSync(join(dir, 'days')).map((f) => `days/${f}`);
        const files = ['trip.yaml', ...days, ...(existsSync(join(dir, 'photos.json')) ? ['photos.json'] : [])];
        const photos = existsSync(join(dir, 'photos.json')) ? Object.keys(JSON.parse(readFileSync(join(dir, 'photos.json'), 'utf8'))).length : 0;
        return send(res, 200, { slug: summary[1], files: files.map((f) => `src/content/trips/${summary[1]}/${f}`), photos });
      }
      if (req.method === 'PUT' && url.pathname.startsWith('/photos/')) {
        if (!type.startsWith('image/')) return send(res, 415, { error: 'image/* only' });
        const r = await putPhoto(url.pathname, req);
        return send(res, r.status, r.json);
      }
      if (req.method === 'POST' && url.pathname === '/trips') {
        if (!type.startsWith('application/json')) return send(res, 415, { error: 'JSON only' });
        const body = JSON.parse((await readBuffer(req))!.toString('utf8')) as CreateBody;
        if (url.searchParams.has('dryRun')) {
          const { issues } = validate(body);
          return send(res, issues.length ? 422 : 200, { issues });
        }
        const r = await create(body, (s) => s && console.log(`[admin] ${s}`));
        return send(res, r.status, r.json);
      }
      send(res, 404, { error: 'not found' });
    } catch (e) {
      send(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  };
}
