// 당일 여행 페이지의 브라우저 동작
// 1) 떠오르기  2) 스크롤 시계: 화면 가운데 선이 지나는 자리의 시각 → 시계 막대·해·배경 하늘  3) 지도 한 장(늦게 불러오기)
import { DAY_MIN, clock, skyAt, sunAt } from '../sky';
import type { MapData } from './route-map';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
document.documentElement.classList.add('dt-js');

/* ------------------------------------------------------------------ */
/* 1. 떠오르기                                                          */
/* ------------------------------------------------------------------ */

const revealIO = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('is-in');
      revealIO.unobserve(e.target);
    }
  },
  { threshold: 0.08 },
);
document.querySelectorAll('.dt-reveal').forEach((el) => revealIO.observe(el));

/* ------------------------------------------------------------------ */
/* 2. 스크롤 시계                                                        */
/* ------------------------------------------------------------------ */

const sky = document.querySelector<HTMLElement>('.dt-sky');
const bar = document.querySelector<HTMLElement>('.dt-clock');
const nowTime = bar?.querySelector<HTMLElement>('.now-time');
const nowPlace = bar?.querySelector<HTMLElement>('.now-place');
const timeline = document.querySelector<HTMLElement>('.dt-timeline');
const items = [...document.querySelectorAll<HTMLElement>('.dt-m[data-min]')];
const ticks = new Map([...(bar?.querySelectorAll<HTMLAnchorElement>('a[data-key]') ?? [])].map((a) => [a.dataset.key!, a]));
const range = { from: Number(bar?.dataset.from ?? 0), to: Number(bar?.dataset.to ?? DAY_MIN) };

/** 문서 위치(y) ↔ 시각(분). 장소 머리, 사진(촬영 시각), 장소 끝(그 장소의 마지막 시각)마다 하나씩 */
type Anchor = { y: number; min: number; item: number };
let anchors: Anchor[] = [];
/** 장소마다 글·사진이 끝나는 y — 그 아래 여백은 다음 장소로 가는 중 */
let ends: number[] = [];
let tail = { from: 0, to: 1 }; // 타임라인이 끝난 뒤 — 해가 지고 밤이 된다 (하늘만, 시계는 멈춤)

function measure() {
  const list: Anchor[] = [];
  ends = [];
  items.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    list.push({ y: r.top + scrollY, min: Number(el.dataset.min), item: i });
    // 글 옆의 작은 사진(표지판 등)은 자리가 시각 순서와 상관없으므로 기준점에서 뺀다
    el.querySelectorAll<HTMLElement>('.dt-shot[data-min]:not(.is-small)').forEach((s) => {
      list.push({ y: s.getBoundingClientRect().top + scrollY, min: Number(s.dataset.min), item: i });
    });
    // 장소가 끝나는 자리(아래 여백 직전) = 그 장소의 마지막 시각. 여백은 다음 장소로 가는 시간 (Moment.astro의 정시 눈금과 같은 비율)
    const end = r.bottom + scrollY - parseFloat(getComputedStyle(el).paddingBottom || '0');
    ends[i] = end;
    list.push({ y: end, min: Number(el.dataset.last ?? el.dataset.min), item: i });
  });
  list.sort((a, b) => a.y - b.y || a.min - b.min);
  anchors = [];
  for (const a of list) {
    const prev = anchors.at(-1);
    if (prev && a.y - prev.y < 2) continue; // 한 줄에 나란한 사진은 첫 장의 시각
    anchors.push({ ...a, min: Math.max(a.min, prev?.min ?? -Infinity) });
  }
  const end = timeline ? timeline.getBoundingClientRect().bottom + scrollY : 0;
  tail = { from: end, to: Math.max(end + 1, document.documentElement.scrollHeight - innerHeight * 0.5) };
}

function at(y: number) {
  if (!anchors.length) return { min: range.from, item: -1, after: 0 };
  if (y <= anchors[0].y) return { min: anchors[0].min, item: -1, after: 0 };
  for (let i = 0; i < anchors.length - 1; i++) {
    const [a, b] = [anchors[i], anchors[i + 1]];
    if (y < b.y) return { min: a.min + ((b.min - a.min) * (y - a.y)) / (b.y - a.y), item: a.item, after: 0 };
  }
  const last = anchors.at(-1)!;
  const after = Math.min(1, Math.max(0, (y - tail.from) / (tail.to - tail.from)));
  return { min: last.min, item: last.item, after };
}

/** 시계 막대의 장소 이름 — 이동 중이면 "A → B"(A는 흐리게, 칸이 모자라면 먼저 줄어든다 — DayClock.astro) */
function placeLabel(name: string, next?: string) {
  if (!nowPlace) return;
  const span = (cls: string, text: string) => Object.assign(document.createElement('span'), { className: cls, textContent: text });
  nowPlace.replaceChildren(...(next ? [span('from', name), span('to', `→ ${next}`)] : [span('to', name)]));
}

let shown = { minute: -1, item: -2, moving: false };
function update() {
  raf = 0;
  const y = scrollY + innerHeight * 0.5;
  const { min, item, after } = at(y);
  const minute = Math.floor(min);
  const moving = item >= 0 && item < items.length - 1 && y > ends[item];

  if (bar && minute !== shown.minute) {
    // 해 점은 transform으로만 움직인다 (레이아웃 이동 없음 — DayClock.astro)
    const x = Math.min(1, Math.max(0, (min - range.from) / (range.to - range.from)));
    bar.style.setProperty('--xf', x.toFixed(4));
    bar.style.setProperty('--c', skyAt(min).accent);
    const day = Math.floor(minute / DAY_MIN);
    if (nowTime) nowTime.textContent = `${day > 0 ? `+${day} ` : ''}${clock(minute)}`;
  }
  if (item !== shown.item || moving !== shown.moving) {
    const el = items[Math.max(0, item)];
    // 장소와 장소 사이의 여백 = 이동 중 → "A → B"
    if (el) placeLabel(el.dataset.name ?? '', moving ? items[item + 1].dataset.name : undefined);
    for (const [key, a] of ticks) {
      if (item >= 0 && key === el?.id) a.setAttribute('aria-current', 'location');
      else a.removeAttribute('aria-current');
    }
  }
  // 하늘은 타임라인 뒤에서도 계속 저문다 (마지막 시각 + 최대 2시간 반)
  const skyMin = min + after * 150;
  if (sky) {
    const s = skyAt(skyMin);
    const sun = sunAt(skyMin);
    sky.style.setProperty('--sky-bg', s.bg);
    sky.style.setProperty('--sky-c', s.accent);
    sky.style.setProperty('--sun-x', `${sun.x.toFixed(1)}%`);
    sky.style.setProperty('--sun-y', `${sun.y.toFixed(1)}%`);
  }
  shown = { minute, item, moving };
}

let raf = 0;
const schedule = () => {
  if (!raf) raf = requestAnimationFrame(update);
};
const remeasure = () => {
  measure();
  schedule();
};
if (items.length) {
  measure();
  update();
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', remeasure);
  // 글꼴·레이아웃이 자리 잡은 뒤 다시 잰다 (사진은 비율이 정해져 있어 밀리지 않는다)
  document.fonts?.ready.then(remeasure);
  addEventListener('load', remeasure);
  if (timeline) new ResizeObserver(remeasure).observe(timeline);
}

/* ------------------------------------------------------------------ */
/* 3. 지도 한 장                                                        */
/* ------------------------------------------------------------------ */

const mapEl = document.getElementById('dt-map');
const mapBox = mapEl?.closest<HTMLElement>('.map-box');
const dataEl = document.getElementById('daytrip-map');
const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-map-stop]')];
const overviewBtn = document.querySelector<HTMLButtonElement>('[data-map-overview]');

type Api = ReturnType<typeof import('./route-map').mountRouteMap>;
let loading: Promise<Api | undefined> | undefined;

function failed() {
  mapBox?.classList.add('dt-map-failed');
  mapBox?.classList.remove('dt-map-ready');
}

function loadMap() {
  if (!mapEl || !dataEl) return Promise.resolve(undefined);
  loading ??= import('./route-map')
    .then(({ mountRouteMap }) => {
      const data: MapData = JSON.parse(dataEl.textContent!);
      const api = mountRouteMap(mapEl, data, reduceMotion);
      api.onLoad(() => {
        mapBox?.classList.remove('dt-map-failed');
        mapBox?.classList.add('dt-map-ready');
      });
      // 스타일을 못 받는 등 오래 뜨지 않으면 SVG 경로를 그대로 둔다 (늦게라도 뜨면 그때 바꾼다)
      setTimeout(() => mapBox?.classList.contains('dt-map-ready') || failed(), 20000);
      return api;
    })
    .catch(() => {
      // WebGL이 없거나 스크립트를 못 받았을 때 — 같은 경로의 SVG가 남는다
      failed();
      return undefined;
    });
  return loading;
}

if (mapBox) {
  // 가까워지면 미리 불러오고, 화면에 들어오면 경로를 그린다
  new IntersectionObserver(
    ([e], io) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      loadMap();
    },
    { rootMargin: '800px 0px' },
  ).observe(mapBox);
  new IntersectionObserver(
    ([e], io) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      loadMap().then((api) => api?.reveal());
    },
    { threshold: 0.3 },
  ).observe(mapBox);
}

function press(btn?: HTMLButtonElement) {
  buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
}
/** 범례를 눌렀는데 지도가 화면 밖이면(좁은 화면에서 범례가 지도 아래에 있을 때 등) 지도를 보이는 곳으로 */
function showMap() {
  if (!mapBox) return;
  const r = mapBox.getBoundingClientRect();
  const seen = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
  if (seen >= Math.min(r.height, innerHeight) * 0.6) return;
  mapBox.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
}
buttons.forEach((btn) =>
  btn.addEventListener('click', () => {
    const on = btn.getAttribute('aria-pressed') !== 'true';
    press(on ? btn : undefined);
    showMap();
    loadMap().then((api) => (on ? api?.focus(btn.dataset.mapStop!) : api?.overview()));
  }),
);
overviewBtn?.addEventListener('click', () => {
  press(undefined);
  showMap();
  loadMap().then((api) => api?.overview());
});
// 확대 칸을 누르면 그 구간을 본 지도에서 크게
document.querySelector('[data-map-detail] .detail-hit')?.addEventListener('click', () => {
  press(undefined);
  loadMap().then((api) => api?.focusDetail());
});
