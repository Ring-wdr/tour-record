// 파일 하나의 스키마로는 확인할 수 없는 여행 단위 규칙.
// 빌드(src/lib/trip.ts의 checkTrip)와 관리자 API(integrations/admin)가 같이 쓴다 — astro:content에 의존하지 않는다.
import { SLUG_RE, type TripData, type DayData } from './trip';

export type TripIssue = {
  /** 'trip' = trip.yaml, 숫자 = days 배열 인덱스 */
  where: 'trip' | number;
  /** 그 파일 안의 필드 경로 (관리자 폼에서 입력칸 표시용) */
  path: (string | number)[];
  message: string;
};

const DAY_MS = 86_400_000;
const pad2 = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * - 폴더 이름은 URL에 쓸 수 있는 slug
 * - days[i].day = i + 1 (1일차부터 빠짐없이), 파일 이름은 dayXX
 * - date = start + (day - 1), end를 넘지 않음
 * - 장소 id는 여행 전체에서 겹치지 않음 (지도 스크립트가 id로 장소를 찾는다)
 * - /photos 사진은 /photos/<slug>/dayXX/ 아래 (pnpm photos·R2 키 규칙)
 * - heroDay가 있는 날이어야 하고, spotlight 국경 파일이 있어야 함
 */
export function tripIssues(
  slug: string,
  t: TripData,
  days: { file?: string; data: DayData }[],
  hasGeo: (name: string) => boolean,
): TripIssue[] {
  const issues: TripIssue[] = [];
  const add = (where: TripIssue['where'], path: TripIssue['path'], message: string) => issues.push({ where, path, message });

  if (!SLUG_RE.test(slug)) add('trip', ['slug'], `폴더 이름 '${slug}'는 소문자·숫자·하이픈만 쓸 수 있습니다`);
  if (!days.length) add('trip', [], '날짜 파일이 없습니다');

  const stopIds = new Map<string, number>();
  days.forEach(({ file, data: d }, i) => {
    const name = `day${pad2(d.day)}`;
    if (file && file !== name) add(i, ['day'], `${file}.md의 day가 ${d.day}입니다 (파일 이름과 다름)`);
    if (d.day !== i + 1) add(i, ['day'], `${i + 1}일차가 빠졌거나 day가 겹칩니다`);
    const expected = new Date(t.start.getTime() + (d.day - 1) * DAY_MS);
    if (d.date.getTime() !== expected.getTime()) add(i, ['date'], `date ${ymd(d.date)} ≠ 시작일 + ${d.day - 1}일 (${ymd(expected)})`);
    if (d.date > t.end) add(i, ['date'], `date ${ymd(d.date)}가 여행 끝(${ymd(t.end)}) 이후입니다`);
    if (d.spotlightCountry && !(t.spotlight && hasGeo(t.spotlight)))
      add(i, ['spotlightCountry'], 'spotlightCountry를 쓰려면 trip.yaml에 spotlight(src/data/geo/<이름>.json)가 필요합니다');

    const dir = `/photos/${slug}/${name}/`;
    const photos: [TripIssue['path'], string | undefined][] = [
      [['cover', 'src'], d.cover?.src],
      ...d.stops.flatMap((s, si) => s.photos.map((p, pi): [TripIssue['path'], string] => [['stops', si, 'photos', pi, 'src'], p.src])),
    ];
    for (const [path, src] of photos) {
      if (src?.startsWith('/photos/') && !src.startsWith(dir)) add(i, path, `사진 ${src}는 ${dir} 아래여야 합니다`);
    }
    d.stops.forEach((s, si) => {
      const prev = stopIds.get(s.id);
      if (prev != null) add(i, ['stops', si, 'id'], `장소 id '${s.id}'가 ${prev}일차와 겹칩니다`);
      stopIds.set(s.id, d.day);
    });
  });
  if (days.length && !days.some((d) => d.data.day === t.heroDay)) add('trip', ['heroDay'], `heroDay ${t.heroDay}일차가 없습니다`);
  if (t.spotlight && !hasGeo(t.spotlight)) add('trip', ['spotlight'], `src/data/geo/${t.spotlight}.json이 없습니다`);
  return issues;
}
