// 관리자 폼 데이터 → trip.yaml / dayXX.md 텍스트. 기존 파일과 같은 모양으로 쓴다:
// 숫자 배열·짧은 객체(좌표, camera, tone, 사진 한 장)는 한 줄 { } / [ ], 나머지는 블록.
import { Document, isSeq, isScalar, visit, type Node } from 'yaml';

const isScalarish = (n: unknown): boolean => isScalar(n) || (isSeq(n) && n.items.every(isScalar));

function toYaml(data: unknown, header?: string): string {
  const doc = new Document(data);
  visit(doc, {
    Seq(_, node) {
      if (node.items.every(isScalarish)) node.flow = true;
    },
    Map(_, node) {
      if (node.items.length <= 4 && node.items.every((p) => isScalarish(p.value as Node))) node.flow = true;
    },
    Scalar(_, node) {
      // "09:40", "+05:00", "+1 09:20"처럼 숫자로 시작하는 문자열은 따옴표로 (YAML 1.1 파서가 숫자로 읽지 않게)
      // 날짜(2026-09-11)는 그대로 둔다 — 스키마가 z.coerce.date()
      if (typeof node.value === 'string' && /^[\d+]/.test(node.value) && !/^\d{4}-\d{2}-\d{2}$/.test(node.value))
        node.type = 'QUOTE_DOUBLE';
    },
  });
  if (header) doc.commentBefore = header;
  return doc.toString({ lineWidth: 0, flowCollectionPadding: true });
}

type Obj = Record<string, any>;

/** undefined·기본값과 같은 키는 빼서 파일을 짧게 */
function prune(obj: Obj, defaults: Obj): Obj {
  return Object.fromEntries(
    Object.entries(obj).filter(([k, v]) => v !== undefined && JSON.stringify(v) !== JSON.stringify(defaults[k])),
  );
}

const TRIP_HEADER = ` 여행 1개 = 이 폴더 하나. 폴더 이름이 URL slug
   trip.yaml      여행 정보 (이 파일)
   days/dayXX.md  하루 = frontmatter(장소·좌표·카메라·사진) + 본문(일기)
   photos.json    사진 크기 — pnpm photos가 생성
   tracks.json    날짜별 이동 경로 — pnpm tracks가 생성
 관리자 화면(/admin/new)에서 만들어졌다.`;

const TRIP_ORDER = [
  'title', 'subtitle', 'subtitleKo', 'description', 'country', 'start', 'end', 'base', 'heroDay', 'spotlight', 'utcOffset', 'tracks', 'altitudeNote',
];
const DAY_ORDER = [
  'day', 'date', 'title', 'titleEn', 'lede', 'driveKm', 'tone', 'fromBase', 'toBase', 'spotlightCountry', 'cover', 'stops',
];
const STOP_ORDER = ['id', 'name', 'nameEn', 'coords', 'approx', 'time', 'elevation', 'kind', 'camera', 'note', 'photos'];

const ordered = (obj: Obj, order: string[]) =>
  Object.fromEntries([...order.filter((k) => k in obj).map((k) => [k, obj[k]]), ...Object.entries(obj).filter(([k]) => !order.includes(k))]);

const dateStr = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);

export function tripYaml(trip: Obj): string {
  const t = prune({ ...trip, start: dateStr(trip.start), end: dateStr(trip.end) }, { tracks: { skipDays: [] } });
  if (t.tracks) t.tracks = prune(t.tracks, { skipDays: [] });
  if (t.tracks && !Object.keys(t.tracks).length) delete t.tracks;
  return toYaml(ordered(t, TRIP_ORDER), TRIP_HEADER);
}

export function dayMarkdown(day: Obj, body: string): string {
  const d = prune({ ...day, date: dateStr(day.date) }, { fromBase: true, toBase: false, spotlightCountry: false });
  d.stops = day.stops.map((s: Obj) =>
    ordered(
      prune(
        { ...s, photos: s.photos.map((p: Obj) => prune(p, {})) },
        { approx: false, photos: [] },
      ),
      STOP_ORDER,
    ),
  );
  if (d.cover) d.cover = prune(d.cover, {});
  return `---\n${toYaml(ordered(d, DAY_ORDER))}---\n\n${body.trim()}\n`;
}

