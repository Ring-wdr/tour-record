// 당일 여행 페이지의 데이터 모델 — trip(폴더 하나)을 "하루의 시간축"으로 바꾼다. 서버(빌드)에서만 쓴다.
import { dayRoute, resolvePhoto, type ResolvedPhoto, type Stop, type Trip } from '../lib/trip';
import { DAY_MIN, clock, skyAt } from './sky';

type LngLat = [number, number];

/** 사진 한 장 + 촬영 시각(파일명) + 비율 */
export type Shot = ResolvedPhoto & {
  /** 여행 시간축의 분 (1일차 자정 = 0). 파일명에서 못 읽으면 undefined */
  min?: number;
  /** "09:50" */
  time?: string;
  /** 페이지에 보이는 비율 w / h — crop이 있으면 잘라 낸 부분의 비율 */
  ratio: number;
};

/** 장소 하나 = 시간축의 한 순간 */
export type Moment = {
  /** 문서 안 앵커 id */
  key: string;
  /** 1부터, 지도 번호와 같다. 끝줄(bookend)은 0 — 번호 없음 */
  n: number;
  /**
   * 하루의 맨 앞·맨 뒤에 있는 사진 없는 도착·출발(주차장에서 집으로 등) — 번호 붙은 장소가 아니라 타임라인을 여닫는 한 줄.
   * 장소 수·지도 번호·범례에서 빠지고, 시간축(시계·하루의 호·빛 띠)에는 남는다
   */
  bookend: boolean;
  day: number;
  stop: Stop;
  /** 여행 시간축의 분 — stop.time, 없으면 첫 사진 시각, 그것도 없으면 앞뒤 사이 */
  min: number;
  /** "09:18" — 데이터에 시각이 없던 장소는 빈 문자열 */
  time: string;
  /** 그 시각의 빛 (sky.ts) */
  color: string;
  /** 다음 장소까지 걸린 분 (장소 시각 → 다음 장소 시각) */
  gap?: number;
  /** 이 장소의 마지막 시각 — 장소 시각과 사진 시각 중 늦은 것 (다음 장소 시각을 넘지 않게). 여백(이동)은 여기서 시작 */
  last: number;
  /** 여백 = 이 장소의 마지막 시각 → 다음 장소 시각 (분). 타임라인 여백의 높이와 "+ 40m" 표시, 스크롤 시계가 같은 구간을 쓴다 */
  move?: number;
  /** 다음 장소로 가는 길에 사진이 없는 긴 구간(지도 점선)이 있다 (routeLines가 채운다) */
  jump?: boolean;
  shots: Shot[];
};

const DAY_MS = 86_400_000;

/** "09:18" → 558, "+1 09:20" → 1980 */
export function parseClock(s?: string) {
  const m = s?.match(/^(?:\+(\d) )?(\d{2}):(\d{2})$/);
  return m ? (m[1] ? +m[1] * DAY_MIN : 0) + +m[2] * 60 + +m[3] : undefined;
}

/**
 * 촬영 시각 — 사진 파일명 YYYYMMDD_HHMMSS(휴대폰 카메라 규칙)에서 읽는다. date = 그날(dayXX.md의 date)
 * 파일명은 휴대폰 시간대 기준이므로 시차가 없는 국내 당일 여행을 전제로 한다 (src/daytrip/CLAUDE.md).
 */
export function photoMinutes(src: string, date: Date) {
  const m = src.match(/\/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})[^/]*$/);
  if (!m) return undefined;
  const dayOffset = Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - date.getTime()) / DAY_MS);
  return dayOffset * DAY_MIN + +m[4] * 60 + +m[5];
}

/** 562 → "9h 22m" */
export function span(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

export const KIND_LABEL: Record<Stop['kind'], string> = {
  arrival: 'Arrival',
  stay: 'Stay',
  nature: 'Nature',
  food: 'Food',
  culture: 'Culture',
  market: 'Market',
  departure: 'Departure',
  city: 'City',
  flight: 'Flight',
};

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 여행 전체를 시간순 순간들로 */
export function moments(trip: Trip): Moment[] {
  const list: Moment[] = [];
  for (const d of trip.days) {
    const base = (d.data.day - 1) * DAY_MIN;
    for (const s of d.data.stops) {
      const shots: Shot[] = s.photos.map((p) => {
        const r = resolvePhoto(p);
        const pm = photoMinutes(p.src, d.data.date);
        const ratio = r.crop ? (r.crop[2] * r.w) / (r.crop[3] * r.h) : r.w / r.h;
        return { ...r, ratio, min: pm == null ? undefined : base + pm, time: pm == null ? undefined : clock(pm) };
      });
      const own = parseClock(s.time);
      const min = own != null ? base + own : shots.find((x) => x.min != null)?.min;
      list.push({
        key: `stop-${s.id}`,
        n: 0,
        bookend: false,
        day: d.data.day,
        stop: s,
        min: min ?? NaN,
        time: min == null ? '' : clock(min),
        color: '',
        last: NaN,
        shots,
      });
    }
  }
  // 시각을 모르는 장소는 앞뒤 사이에 고르게 (한쪽만 알면 한 시간 간격, 아무것도 모르면 09:00부터)
  const known = list.map((m, i) => (Number.isNaN(m.min) ? -1 : i)).filter((i) => i >= 0);
  list.forEach((m, i) => {
    if (!Number.isNaN(m.min)) return;
    const p = known.findLast((k) => k < i);
    const q = known.find((k) => k > i);
    if (p != null && q != null) m.min = list[p].min + ((list[q].min - list[p].min) * (i - p)) / (q - p);
    else if (p != null) m.min = list[p].min + 60 * (i - p);
    else if (q != null) m.min = list[q].min - 60 * (q - i);
    else m.min = 540 + 60 * i;
  });
  // 끝줄: 맨 앞의 사진 없는 도착, 맨 뒤의 사진 없는 출발 (장소가 둘 이상일 때만)
  const edge = (m: Moment, i: number) =>
    list.length > 2 &&
    m.shots.length === 0 &&
    ((i === 0 && m.stop.kind === 'arrival') || (i === list.length - 1 && m.stop.kind === 'departure'));
  let n = 0;
  list.forEach((m, i) => {
    m.bookend = edge(m, i);
    m.n = m.bookend ? 0 : ++n;
    m.color = skyAt(m.min).accent;
    const next = list[i + 1];
    if (next) m.gap = Math.max(0, next.min - m.min);
    const seen = Math.max(m.min, ...m.shots.map((x) => x.min ?? -Infinity));
    m.last = next ? Math.min(seen, next.min) : seen;
    if (next) m.move = Math.max(0, next.min - m.last);
  });
  return list;
}

/** 번호 붙은 장소만 — 장소 수의 한 가지 정의 (여는 면 Stops = 지도 번호 = 범례 = 일기 메모 = 목록 "N stops") */
export const numbered = (list: Moment[]) => list.filter((m) => !m.bookend);

/**
 * "CAFE 고석정" → [CAFE][ 고석정] — 라틴 글자 덩어리는 Fraunces로 따로 짠다
 * (Noto Serif KR의 굵은 라틴 대문자는 무겁다). 숫자만 있는 덩어리("1호")는 그대로
 */
export function scriptRuns(text: string) {
  const out: { t: string; latin: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(/[A-Za-z][\w'’&.-]*(?:\s+[A-Za-z0-9][\w'’&.-]*)*/g)) {
    if (m.index > last) out.push({ t: text.slice(last, m.index), latin: false });
    out.push({ t: m[0], latin: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: text.slice(last), latin: false });
  return out;
}

/** 첫 화면 표지 — heroDay의 cover, 촬영 시각과 그때 있던 장소 */
export function coverOf(trip: Trip, list: Moment[]) {
  const d = trip.days.find((x) => x.data.day === trip.data.heroDay) ?? trip.days[0];
  const photo = d?.data.cover;
  if (!photo) return undefined;
  const pm = photoMinutes(photo.src, d.data.date);
  const min = pm == null ? undefined : (d.data.day - 1) * DAY_MIN + pm;
  const sameDay = list.filter((m) => m.day === d.data.day);
  const at = min == null ? undefined : sameDay.findLast((m) => m.min <= min) ?? sameDay[0];
  return { day: d, photo: resolvePhoto(photo), min, time: min == null ? undefined : clock(min), at };
}

/** 한눈에 보는 숫자 */
export function facts(trip: Trip, list: Moment[], coverSrc?: string) {
  const first = list[0];
  const last = list.at(-1)!;
  const photos = new Set(list.flatMap((m) => m.shots.map((s) => s.src)));
  if (coverSrc) photos.add(coverSrc);
  return {
    start: first.time,
    end: last.time,
    span: span(last.min - first.min),
    stops: numbered(list).length,
    km: trip.days.reduce((n, d) => n + d.data.driveKm, 0),
    photos: photos.size,
  };
}

/* ------------------------------------------------------------------ */
/* 지도 — 경로 선을 시각의 빛으로 칠한다                                  */
/* ------------------------------------------------------------------ */

const toRad = (d: number) => (d * Math.PI) / 180;
function distM(a: LngLat, b: LngLat) {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(s));
}

/**
 * 경로의 한 토막 — 사진이 이어진 구간은 실선(시각의 빛), 사진이 없는 긴 구간은 점선(다른 구간을 가로지르면 휜 선 — arcFor).
 * 장소가 좁은 곳에 모여 사진 점을 곧게 이은 선이 서로 엇갈리는 구간은 사진 점 대신 장소끼리 이은 가는 선(link)
 */
export type RoutePart = {
  coords: LngLat[];
  /** 하루 경로 전체에서의 진행률 범위 — 경로를 그려 나가는 애니메이션이 이어지게 */
  from: number;
  to: number;
  dashed: boolean;
  /** 장소 순서만 이은 가는 선 (tangled — 아래 routeLines) */
  link?: boolean;
  /** 이 토막 안의 진행률(0~1)별 색 */
  stops: [number, string][];
  /** 점선 색 — 가운데 지점의 빛 */
  color: string;
};

/** 점선으로 끊기지 않고 이어진 구간과 거기 머문 장소들 */
export type Leg = { day: number; ns: number[]; bounds: [LngLat, LngLat]; from: string; to: string };

/** 하루 경로 + 선의 진행률(0~1)별 색 — 각 장소에 가장 가까운 경로 점에 그 시각의 색을 둔다 */
export type RouteLine = { day: number; coords: LngLat[]; stops: [number, string][]; parts: RoutePart[]; legs: Leg[] };

/** 이보다 긴 한 구간(사진과 사진 사이)은 "사진 없는 구간" — 경로 점 간격 중앙값의 5배와 비교해 더 긴 쪽 */
const JUMP_MIN_M = 700;

function jumpsOf(coords: LngLat[]) {
  const lens = coords.slice(1).map((c, k) => distM(coords[k], c));
  if (lens.length < 3) return new Set<number>();
  const median = [...lens].sort((a, b) => a - b)[Math.floor(lens.length / 2)];
  const limit = Math.max(JUMP_MIN_M, median * 5);
  return new Set(lens.flatMap((l, k) => (l > limit ? [k] : [])));
}

/** 전체 색 띠에서 [a, b] 부분만 떼어 0~1로 */
function subStops(stops: [number, string][], a: number, b: number): [number, string][] {
  const w = b - a || 1;
  const inner = stops.filter(([x]) => x > a && x < b).map(([x, c]): [number, string] => [(x - a) / w, c]);
  return [[0, colorAt(stops, a)], ...inner, [1, colorAt(stops, b)]];
}

function bboxOf(pts: LngLat[]): [LngLat, LngLat] {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [
    [Math.min(...xs), Math.min(...ys)],
    [Math.max(...xs), Math.max(...ys)],
  ];
}
/** 범위의 긴 변 (m) */
const extentM = ([[w, s], [e, n]]: [LngLat, LngLat]) => Math.max(distM([w, s], [e, s]), distM([w, s], [w, n]));

/** 두 선분 ab, cd가 끝점이 아닌 곳에서 엇갈리는지 (방향 부호는 경도·위도 그대로 써도 같다) */
function crosses(a: LngLat, b: LngLat, c: LngLat, d: LngLat) {
  const o = (p: LngLat, q: LngLat, r: LngLat) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

/**
 * 사진 없는 구간(점선) — 곧게 그으면 다른 구간(한 동네에 모인 오후 등)을 가로지를 때는 휜 선으로.
 * 휘는 정도(현 길이에 대한 비율, 양수 = 진행 방향 왼쪽) 후보 중 다른 선과 덜 엇갈리고 장소에서 넉넉히 떨어진 것, 같으면 덜 휜 것.
 * 어차피 지나간 길을 모르는 구간이라 휘어도 거짓이 아니다 — 옮겨 간 것만 보이면 된다
 */
function arcFor(a: LngLat, b: LngLat, others: [LngLat, LngLat][], stops: LngLat[]): LngLat[] {
  const chord = distM(a, b);
  if (chord < 1) return [a, b];
  // 미터 평면 (좁은 범위라 등장방형으로 충분)
  const kx = 111320 * Math.cos(toRad((a[1] + b[1]) / 2));
  const ky = 110574;
  const [ax, ay, bx, by] = [a[0] * kx, a[1] * ky, b[0] * kx, b[1] * ky];
  const [nx, ny] = [-(by - ay) / chord, (bx - ax) / chord];
  // 양 끝에 붙은 장소(점선이 거기서 시작·끝난다)는 비킬 대상이 아니다
  const avoid = stops.filter((s) => distM(s, a) > chord * 0.15 && distM(s, b) > chord * 0.15);
  const curve = (h: number): LngLat[] => {
    if (!h) return [a, b];
    // 2차 베지어 — 조절점을 가운데에서 법선 방향으로 2h만큼 (곡선 가운데는 h만큼 비킨다)
    const cx = (ax + bx) / 2 + nx * 2 * h * chord;
    const cy = (ay + by) / 2 + ny * 2 * h * chord;
    return Array.from({ length: 25 }, (_, i) => {
      const t = i / 24;
      const u = 1 - t;
      return [(u * u * ax + 2 * u * t * cx + t * t * bx) / kx, (u * u * ay + 2 * u * t * cy + t * t * by) / ky];
    });
  };
  // 점수: 엇갈림 하나 100 > 장소에 너무 붙음(현 길이의 7% 안) 10 > 휜 정도
  let best: { pts: LngLat[]; score: number } | undefined;
  for (let i = 0; i <= 18; i++) {
    const h = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.05; // 0, -0.05, 0.05, -0.1, … ±0.45
    const pts = curve(h);
    const hits = pts.slice(1).reduce((n, p, k) => n + others.filter(([c, d]) => crosses(pts[k], p, c, d)).length, 0);
    const clear = Math.min(Infinity, ...avoid.map((s) => Math.min(...pts.map((p) => distM(p, s)))));
    const score = hits * 100 + (clear < chord * 0.07 ? 10 : 0) + Math.abs(h);
    if (!best || score < best.score) best = { pts, score };
  }
  return best!.pts;
}

/** 엇갈림으로 치는 선분 길이 — 그 구간 범위(긴 변)의 1/5. 이보다 짧은 엇갈림은 GPS 떨림·작은 고리라 그 구간을 보는 크기에서는 안 보인다 */
const TANGLE_SEG = 0.2;

/**
 * 사진 점을 곧게 이은 선이 긴 선분끼리 서로 엇갈리는지 — 사진이 드문데 장소가 좁은 곳에 모인 구간(한 동네 안의 오후 등)에서
 * 곧은 선들이 길을 가로질러 X자·V자로 얽힌다. 그런 구간은 사진 점 궤적이 길을 알려 주지 못하므로 장소 순서만 잇는다
 */
function tangled(pts: LngLat[]) {
  if (pts.length < 4) return false;
  const min = extentM(bboxOf(pts)) * TANGLE_SEG;
  const long = pts.slice(1).map((p, i) => distM(pts[i], p) >= min);
  for (let i = 0; i < pts.length - 1; i++) {
    if (!long[i]) continue;
    for (let j = i + 2; j < pts.length - 1; j++) {
      if (long[j] && crosses(pts[i], pts[i + 1], pts[j], pts[j + 1])) return true;
    }
  }
  return false;
}

export function routeLines(trip: Trip, list: Moment[]): RouteLine[] {
  return trip.days
    .map((d, i) => {
      const coords = dayRoute(d, trip.days[i - 1], trip.data.base, trip.tracks[d.data.day]);
      if (coords.length < 2) return undefined;
      const cum = [0];
      for (let k = 1; k < coords.length; k++) cum.push(cum[k - 1] + distM(coords[k - 1], coords[k]));
      const total = cum.at(-1) || 1;
      const own = list.filter((m) => m.day === d.data.day);
      const stops: [number, string][] = [];
      const at = new Map<Moment, number>();
      let from = 0;
      for (const m of own) {
        // 앞 장소보다 뒤쪽에서만 찾는다 — 같은 곳을 두 번 지나도 순서가 꼬이지 않게
        let best = from;
        for (let k = from; k < coords.length; k++) {
          if (distM(coords[k], m.stop.coords) < distM(coords[best], m.stop.coords)) best = k;
        }
        from = best;
        at.set(m, best);
        const f = cum[best] / total;
        const prev = stops.at(-1)?.[0] ?? -1;
        if (f > prev + 1e-4) stops.push([f, m.color]);
      }
      if (!stops.length) return undefined;
      if (stops[0][0] > 0) stops.unshift([0, stops[0][1]]);
      if (stops.at(-1)![0] < 1) stops.push([1, stops.at(-1)![1]]);

      // 사진 궤적이 있는 날만 — 궤적 없이 장소를 이은 날은 모든 선이 "곧게 이은 선"이라 나누지 않는다
      const tracked = (trip.tracks[d.data.day]?.length ?? 0) > 1;
      const jumps = tracked ? jumpsOf(coords) : new Set<number>();
      // 토막: [k0, k1] 경로 점 인덱스 (양 끝 포함)
      const spans: { k0: number; k1: number; dashed: boolean }[] = [];
      for (let k = 0; k < coords.length - 1; k++) {
        const dashed = jumps.has(k);
        const lastSpan = spans.at(-1);
        if (lastSpan && !lastSpan.dashed && !dashed) lastSpan.k1 = k + 1;
        else spans.push({ k0: k, k1: k + 1, dashed });
      }
      // 이어진 구간(실선 토막)마다 거기 머문 장소 — 두 토막의 경계 점에 걸린 장소는 앞 토막
      const solid = spans.filter((x) => !x.dashed);
      const members = new Map(
        solid.map((x) => [x, own.filter((m) => solid.find((y) => at.get(m)! >= y.k0 && at.get(m)! <= y.k1) === x)]),
      );

      const parts: RoutePart[] = spans.map((x) => {
        const { k0, k1, dashed } = x;
        const [a, b] = [cum[k0] / total, cum[k1] / total];
        const base = { from: a, to: b, dashed, color: colorAt(stops, (a + b) / 2) };
        const ms = members.get(x) ?? [];
        const track = coords.slice(k0, k1 + 1);
        // (궤적 없이 장소를 이은 날은 이미 장소 순서 선이라 그대로)
        if (dashed || !tracked || ms.length < 2 || !tangled(track)) return { ...base, coords: track, stops: subStops(stops, a, b) };
        // 엇갈린 구간 — 토막 양 끝(앞뒤 토막과 이어지는 점)과 장소들을 순서대로 곧게. 색은 장소마다 그 시각의 빛
        const pts: { p: LngLat; c: string }[] = [];
        for (const v of [
          { p: coords[k0], c: colorAt(stops, a) },
          ...ms.map((m) => ({ p: m.stop.coords, c: m.color })),
          { p: coords[k1], c: colorAt(stops, b) },
        ]) {
          if (!pts.length || distM(pts.at(-1)!.p, v.p) > 1) pts.push(v);
        }
        const len = [0];
        for (let k = 1; k < pts.length; k++) len.push(len[k - 1] + distM(pts[k - 1].p, pts[k].p));
        const L = len.at(-1) || 1;
        return { ...base, coords: pts.map((v) => v.p), link: true, stops: pts.map((v, k): [number, string] => [len[k] / L, v.c]) };
      });
      // 점선 토막은 다른 토막을 가로지르지 않게 휠 수 있다 (arcFor)
      parts.forEach((part, i) => {
        if (!part.dashed) return;
        const others = parts.flatMap((q, j) => (j === i ? [] : q.coords.slice(1).map((c, k): [LngLat, LngLat] => [q.coords[k], c])));
        part.coords = arcFor(part.coords[0], part.coords.at(-1)!, others, own.map((m) => m.stop.coords));
      });

      // 다음 장소로 가는 길에 점선 구간이 있는지 (타임라인 여백도 점선으로)
      own.forEach((m, j) => {
        const next = own[j + 1];
        if (next) m.jump = [...jumps].some((k) => at.get(m)! <= k && k < at.get(next)!);
      });

      const legs: Leg[] = solid
        .map((x) => ({ x, ms: members.get(x)!, part: parts[spans.indexOf(x)] }))
        .filter(({ ms }) => ms.length > 0)
        .map(({ ms, part }) => ({
          day: d.data.day,
          ns: numbered(ms).map((m) => m.n),
          // 그려지는 선(엇갈린 구간은 장소끼리 이은 선) + 장소
          bounds: bboxOf([...part.coords, ...ms.map((m) => m.stop.coords)]),
          from: ms[0].time,
          to: ms.at(-1)!.time,
        }));
      return { day: d.data.day, coords, stops, parts, legs };
    })
    .filter((l): l is RouteLine => !!l);
}

/**
 * 전체 경로에 비해 아주 촘촘한 구간 하나 — 지도 모서리에 확대 칸으로 따로 보인다.
 * 이어진 구간이 둘 이상이고, 장소가 3곳 이상 모였고, 그 범위가 전체의 1/3 이하일 때만. 없으면 undefined
 */
export function detailLeg(lines: RouteLine[], list: Moment[]) {
  const legs = lines.flatMap((l) => l.legs);
  if (legs.length < 2) return undefined;
  const whole = extentM(bboxOf([...lines.flatMap((l) => l.coords), ...list.map((m) => m.stop.coords)]));
  return legs
    .filter((l) => l.ns.length >= 3 && extentM(l.bounds) * 3 <= whole)
    .sort((a, b) => extentM(a.bounds) - extentM(b.bounds))[0];
}

/** 진행률 f에서의 색 (정적 SVG 경로용 — 지도에서는 MapLibre가 같은 보간을 한다) */
export function colorAt(stops: [number, string][], f: number) {
  const i = stops.findIndex(([x]) => x >= f);
  if (i <= 0) return stops[Math.max(0, i)][1];
  const [[a, ca], [b, cb]] = [stops[i - 1], stops[i]];
  const k = (f - a) / (b - a || 1);
  const c = (h: string) => [1, 3, 5].map((j) => parseInt(h.slice(j, j + 2), 16));
  const [x, y] = [c(ca), c(cb)];
  return `#${x.map((v, j) => Math.round(v + (y[j] - v) * k).toString(16).padStart(2, '0')).join('')}`;
}

/** <time datetime> — 여행 시간축의 분을 현지 시각 ISO로 ("2026-09-26T09:18+09:00") */
export function isoAt(trip: Trip, min: number) {
  const d = new Date(trip.data.start.getTime() + Math.floor(min / DAY_MIN) * DAY_MS);
  return `${d.toISOString().slice(0, 10)}T${clock(min)}${trip.data.utcOffset}`;
}

/** 하루의 호 (첫 화면 그림) — 05시~21시를 반원으로, 그날의 시간을 색 호로 */
export function sunArc(list: Moment[], w = 320, h = 150) {
  const cx = w / 2;
  const base = h - 22;
  const r = Math.min(cx - 36, base - 12);
  const at = (min: number) => {
    const p = Math.min(1, Math.max(0, ((min % DAY_MIN) - 300) / 960));
    const th = Math.PI * (1 - p);
    return [cx + r * Math.cos(th), base - r * Math.sin(th)] as const;
  };
  const [a, b] = [list[0].min, list.at(-1)!.min];
  const segs: { d: string; c: string }[] = [];
  const step = Math.max(4, (b - a) / 60);
  for (let m = a; m < b; m += step) {
    const n = Math.min(b, m + step);
    const [x1, y1] = at(m);
    const [x2, y2] = at(n);
    segs.push({ d: `M${x1.toFixed(1)},${y1.toFixed(1)}L${x2.toFixed(1)},${y2.toFixed(1)}`, c: skyAt((m + n) / 2).accent });
  }
  const hours = [6, 12, 18].map((hh) => ({ label: pad2(hh), x: at(hh * 60)[0] }));
  return {
    w,
    h,
    base,
    full: `M${cx - r},${base} A${r},${r} 0 0 1 ${cx + r},${base}`,
    segs,
    dots: list.map((m) => ({ n: m.n, c: m.color, xy: at(m.min) })),
    hours,
    start: { t: list[0].time, xy: at(a) },
    end: { t: list.at(-1)!.time, xy: at(b) },
  };
}

/** "2026.09.26 SAT" 같은 표기를 위한 요일 */
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];
export function dateParts(d: Date) {
  return {
    ymd: `${d.getUTCFullYear()}.${pad2(d.getUTCMonth() + 1)}.${pad2(d.getUTCDate())}`,
    md: `${pad2(d.getUTCMonth() + 1)}.${pad2(d.getUTCDate())}`,
    weekday: WEEKDAYS[d.getUTCDay()],
    weekdayKo: `${WEEKDAYS_KO[d.getUTCDay()]}요일`,
  };
}
