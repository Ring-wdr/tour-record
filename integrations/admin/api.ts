// 관리자 API — astro dev 서버의 미들웨어로만 붙는다 (integrations/admin/index.ts). 운영 빌드에는 없다.
//   GET  /api/admin/meta   폼에 필요한 목록 (기존 여행 slug, 국경 파일, 장소 종류)
//   POST /api/admin/trips  새 여행 만들기 → src/content/trips/<slug>/trip.yaml + days/dayXX.md
import type { IncomingMessage, ServerResponse } from 'node:http';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'astro/zod';
import { tripSchema, daySchema, SLUG_RE, STOP_KINDS } from '../../src/schemas/trip';
import { tripIssues, type TripIssue } from '../../src/schemas/check';
import { tripYaml, dayMarkdown } from './serialize';

const DAY_MS = 86_400_000;
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
  const slugs = () => (existsSync(TRIPS) ? readdirSync(TRIPS).filter((d) => existsSync(join(TRIPS, d, 'trip.yaml'))) : []);
  const geoNames = () => (existsSync(GEO) ? readdirSync(GEO).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : []);

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

  function create(body: CreateBody) {
    const { issues, trip, days } = validate(body);
    if (issues.length) return { status: 422, json: { issues } };

    const dir = join(TRIPS, body.slug);
    mkdirSync(join(dir, 'days'), { recursive: true });
    const files = [join(dir, 'trip.yaml')];
    writeFileSync(files[0], tripYaml(trip));
    days!.forEach((d, i) => {
      const f = join(dir, 'days', `day${pad2(i + 1)}.md`);
      writeFileSync(f, dayMarkdown(d, body.days[i].body ?? ''));
      files.push(f);
    });
    // 로컬 전용 설정: 원본 사진 폴더, 실제 숙소 좌표(프라이버시 구역) — git 제외 파일
    if (body.local?.source || body.local?.hotel) {
      const local = existsSync(LOCAL) ? JSON.parse(readFileSync(LOCAL, 'utf8')) : {};
      local[body.slug] = {
        ...(body.local.source && { source: body.local.source }),
        ...(body.local.hotel && { zones: [{ name: 'hotel', center: body.local.hotel, radiusM: 700 }] }),
      };
      writeFileSync(LOCAL, JSON.stringify(local, null, 2) + '\n');
    }
    return { status: 201, json: { slug: body.slug, files: files.map((f) => f.slice(root.length + 1).replaceAll('\\', '/')) } };
  }

  const send = (res: ServerResponse, status: number, json: unknown) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(json));
  };
  const readBody = (req: IncomingMessage) =>
    new Promise<string>((resolve, reject) => {
      let s = '';
      req.setEncoding('utf8');
      req.on('data', (c) => (s += c));
      req.on('end', () => resolve(s));
      req.on('error', reject);
    });

  /** connect 미들웨어 — '/api/admin'에 붙이므로 req.url은 그 뒤 경로 */
  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      // 다른 사이트가 브라우저를 통해 로컬 dev 서버에 쓰지 못하게: 같은 origin + JSON만
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'cross-origin' });
      const url = new URL(req.url ?? '/', 'http://x');

      if (req.method === 'GET' && url.pathname === '/meta') {
        return send(res, 200, { trips: slugs(), geo: geoNames(), kinds: STOP_KINDS });
      }
      if (req.method === 'POST' && url.pathname === '/trips') {
        if (!req.headers['content-type']?.startsWith('application/json')) return send(res, 415, { error: 'JSON only' });
        const body = JSON.parse(await readBody(req)) as CreateBody;
        const r = create(body);
        return send(res, r.status, r.json);
      }
      send(res, 404, { error: 'not found' });
    } catch (e) {
      send(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  };
}
