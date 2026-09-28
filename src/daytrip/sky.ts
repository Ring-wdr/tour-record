// 하루의 빛 — 시각(분)에 따라 바뀌는 색과 해의 위치.
// 서버(타임라인 색·지도 선 색)와 브라우저(스크롤 시계·배경 하늘)가 같이 쓰므로 import 없는 순수 함수만 둔다.

export const DAY_MIN = 1440;

type RGB = [number, number, number];

/**
 * 하루의 색 — 사진 속 하늘이 아니라 "그 시각의 빛"을 뜻하는 팔레트.
 * accent: 글자·선 (어두운 바탕 위에서 읽히는 밝기), bg: 배경 하늘 (거의 검정에 가까운 틴트)
 * 여행마다 바꾸지 않는다 — 모든 당일 여행이 같은 시계를 쓴다.
 */
const SKY: { m: number; accent: string; bg: string }[] = [
  { m: 0, accent: '#8f95d6', bg: '#0a0a12' }, // 자정
  { m: 330, accent: '#b89bd8', bg: '#100d19' }, // 05:30 새벽
  { m: 420, accent: '#f0a3a8', bg: '#1a1017' }, // 07:00 해 뜰 무렵
  { m: 500, accent: '#9fd0ea', bg: '#0b1a2a' }, // 08:20 맑은 아침 — 푸른 하늘
  { m: 600, accent: '#9fe0d4', bg: '#0b1f22' }, // 10:00 늦은 오전 — 물빛
  { m: 690, accent: '#c9e39d', bg: '#131c10' }, // 11:30 한낮 가까이 — 연둣빛
  // 오후는 한 시간 반마다 색이 분명히 달라지게 — 금빛(가장 밝다) → 짙은 금빛 → 호박·주황 → 붉은 주황 → 장밋빛 → 보랏빛
  { m: 765, accent: '#f3de84', bg: '#232009' }, // 12:45 한낮 — 맑은 금빛
  { m: 855, accent: '#f8c262', bg: '#2a1b07' }, // 14:15 이른 오후 — 짙은 금빛
  { m: 945, accent: '#f7a052', bg: '#2d1407' }, // 15:45 늦은 오후 — 호박·주황
  { m: 1035, accent: '#f27a4e', bg: '#2e0f0b' }, // 17:15 해 질 녘 — 붉은 주황
  { m: 1110, accent: '#e4668c', bg: '#270b1a' }, // 18:30 노을 — 장밋빛
  { m: 1170, accent: '#b27fd8', bg: '#180c24' }, // 19:30 저녁 — 보랏빛
  { m: 1245, accent: '#9a8fe0', bg: '#0e0c1a' }, // 20:45 푸른 밤
  { m: DAY_MIN, accent: '#8f95d6', bg: '#0a0a12' },
];

const rgb = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const hex = (c: RGB) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const mix = (a: string, b: string, k: number) => {
  const [x, y] = [rgb(a), rgb(b)];
  return hex(x.map((v, i) => v + (y[i] - v) * k) as RGB);
};

/** 자정을 넘긴 시각(+1 09:20 = 1980분)도 그날 안의 분으로 */
export const wrap = (min: number) => ((min % DAY_MIN) + DAY_MIN) % DAY_MIN;

/** 그 시각의 빛 */
export function skyAt(min: number) {
  const m = wrap(min);
  const i = Math.max(1, SKY.findIndex((k) => k.m > m));
  const [a, b] = [SKY[i - 1], SKY[i]];
  const k = (m - a.m) / (b.m - a.m);
  return { accent: mix(a.accent, b.accent, k), bg: mix(a.bg, b.bg, k) };
}

/** 562 → "09:22" */
export function clock(min: number) {
  const m = Math.floor(wrap(min));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * 배경 하늘의 해 위치 (화면 %) — 05시에 왼쪽 아래에서 떠서 13시에 가장 높고 21시에 오른쪽 아래로 진다.
 * 사진 촬영 방향과는 상관없는 장식이다.
 */
export function sunAt(min: number) {
  const p = Math.min(1, Math.max(0, (wrap(min) - 300) / 960));
  return { x: 8 + 84 * p, y: 82 - 64 * Math.sin(Math.PI * p) };
}
