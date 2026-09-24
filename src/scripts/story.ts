import { Map as MapLibre, Marker, LngLatBounds, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// scripts/copy-maplibre-worker.mjs가 복사해 둔 워커
setWorkerUrl('/vendor/maplibre/maplibre-gl-worker.mjs');

type LngLat = [number, number];
type Camera = { zoom: number; pitch: number; bearing: number };
type TripData = {
  base: LngLat;
  days: {
    day: number;
    accent: string;
    route: LngLat[];
    stops: { id: string; name: string; coords: LngLat; camera: Camera }[];
  }[];
};

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const data: TripData = JSON.parse(document.getElementById('trip-data')!.textContent!);
const stopById = new Map(data.days.flatMap((d) => d.stops.map((s) => [s.id, { ...s, day: d.day }] as const)));
const dayByNum = new Map(data.days.map((d) => [d.day, d]));

/* ------------------------------------------------------------------ */
/* 1. 공통 스크롤 효과: reveal, 진행 바, 숫자 카운트업                   */
/* ------------------------------------------------------------------ */

const revealIO = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('is-in');
      e.target.querySelectorAll<HTMLElement>('[data-count]').forEach(countUp);
      revealIO.unobserve(e.target);
    }
  },
  { threshold: 0.2 },
);
document.querySelectorAll('.reveal, [data-inview]').forEach((el) => revealIO.observe(el));

function countUp(el: HTMLElement) {
  const target = Number(el.dataset.count);
  if (reduceMotion) return;
  const t0 = performance.now();
  const dur = 1600;
  const tick = (t: number) => {
    const k = Math.min(1, (t - t0) / dur);
    const eased = 1 - Math.pow(1 - k, 4);
    el.textContent = Math.round(target * eased).toLocaleString('en-US');
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const progress = document.querySelector<HTMLElement>('.progress span');
addEventListener(
  'scroll',
  () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    progress?.style.setProperty('--p', String(scrollY / max));
  },
  { passive: true },
);

/* ------------------------------------------------------------------ */
/* 2. 스토리 영역 진입 여부 → 지도/레일 표시                             */
/* ------------------------------------------------------------------ */

const story = document.getElementById('story')!;
new IntersectionObserver(([e]) => document.body.classList.toggle('in-story', e.isIntersecting), {
  rootMargin: '-50% 0px -50% 0px',
}).observe(story);

// 일기 페이지로 바로 이동해도 레일이 맞도록 챕터 단위로도 날짜를 갱신
const chapterIO = new IntersectionObserver(
  (entries) => entries.forEach((e) => e.isIntersecting && setRail(Number((e.target as HTMLElement).dataset.day))),
  { rootMargin: '-50% 0px -50% 0px' },
);
document.querySelectorAll('.chapter').forEach((c) => chapterIO.observe(c));

const railLinks = [...document.querySelectorAll<HTMLAnchorElement>('[data-rail-day]')];
function setRail(day: number) {
  railLinks.forEach((a) => a.classList.toggle('is-active', Number(a.dataset.railDay) === day));
  const accent = dayByNum.get(day)?.accent;
  if (accent) document.documentElement.style.setProperty('--accent', accent);
}

/* ------------------------------------------------------------------ */
/* 3. 지도                                                              */
/* ------------------------------------------------------------------ */

const map = new MapLibre({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/dark',
  center: data.base,
  zoom: 7,
  pitch: 0,
  interactive: false, // 스크롤이 지도를 조작하지 않도록
  attributionControl: { compact: true },
  maxPitch: 75,
});

const routeFC = {
  type: 'FeatureCollection' as const,
  features: data.days.map((d) => ({
    type: 'Feature' as const,
    properties: { day: d.day, accent: d.accent },
    geometry: { type: 'LineString' as const, coordinates: d.route },
  })),
};

let mapReady = false;
let pending: (() => void) | null = null;

map.on('load', () => {
  // 3D 지형 + 음영 — AWS 공개 고도 타일(terrarium)
  // 음영과 3D 지형은 소스를 분리해야 렌더링 품질이 좋다
  for (const id of ['dem', 'dem-hs']) {
    map.addSource(id, {
      type: 'raster-dem',
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: 13,
    });
  }
  const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
  map.addLayer(
    {
      id: 'hillshade',
      type: 'hillshade',
      source: 'dem-hs',
      paint: {
        'hillshade-exaggeration': 0.55,
        'hillshade-shadow-color': '#000000',
        'hillshade-highlight-color': '#5a5550',
        'hillshade-accent-color': '#1a1a1a',
      },
    },
    firstSymbol,
  );
  map.setTerrain({ source: 'dem', exaggeration: 1.4 });
  map.setSky({
    'sky-color': '#0b0b0d',
    'horizon-color': '#2a2522',
    'fog-color': '#0b0b0d',
    'sky-horizon-blend': 0.6,
    'horizon-fog-blend': 0.7,
    'fog-ground-blend': 0.4,
  });

  map.addSource('routes', { type: 'geojson', data: routeFC });
  map.addSource('active-route', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
    lineMetrics: true,
  });
  map.addLayer({
    id: 'routes-all',
    type: 'line',
    source: 'routes',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#ffffff', 'line-opacity': 0.18, 'line-width': 1.5, 'line-dasharray': [2, 3] },
  });
  map.addLayer({
    id: 'route-active',
    type: 'line',
    source: 'active-route',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': 3.5 },
  });

  mapReady = true;
  pending?.();
  pending = null;
});

// 장소 마커 (HTML)
const markers = new Map<string, HTMLElement>();
for (const d of data.days) {
  for (const s of d.stops) {
    if (markers.has(`${s.coords}`)) continue; // 공항처럼 같은 좌표는 한 번만
    const el = document.createElement('div');
    el.className = 'mk';
    el.style.setProperty('--c', d.accent);
    el.innerHTML = `<span class="mk-dot"></span><span class="mk-label"></span>`;
    el.querySelector('.mk-label')!.textContent = s.name;
    new Marker({ element: el, anchor: 'center', opacityWhenCovered: '0.85' }).setLngLat(s.coords).addTo(map);
    markers.set(s.id, el);
    markers.set(`${s.coords}`, el);
  }
}

/** 경로를 그려나가는 애니메이션 */
let drawRaf = 0;
let drawnDay = 0;
function drawRoute(day: number) {
  if (drawnDay === day) return;
  drawnDay = day;
  const d = dayByNum.get(day)!;
  (map.getSource('active-route') as GeoJSONSource).setData({
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: d.route },
  });
  cancelAnimationFrame(drawRaf);
  const t0 = performance.now();
  const dur = reduceMotion ? 1 : 2200;
  const frame = (t: number) => {
    const k = Math.min(1, (t - t0) / dur);
    const p = Math.max(0.0001, 1 - Math.pow(1 - k, 3));
    map.setPaintProperty('route-active', 'line-gradient', [
      'step',
      ['line-progress'],
      d.accent,
      p,
      'rgba(0,0,0,0)',
    ]);
    if (k < 1) drawRaf = requestAnimationFrame(frame);
  };
  drawRaf = requestAnimationFrame(frame);
}

function setActiveMarker(id: string | null, day: number) {
  const dayStops = new Set(dayByNum.get(day)!.stops.map((s) => s.id));
  for (const [key, el] of markers) {
    if (key.includes(',')) continue;
    el.classList.toggle('is-active', key === id);
    el.classList.toggle('is-today', dayStops.has(key));
  }
}

function viewport() {
  const { width: w, height: h } = map.getContainer().getBoundingClientRect();
  return { w, h, wide: w > 860 };
}

function go(fn: () => void) {
  if (mapReady) fn();
  else pending = fn;
}

function showDay(day: number) {
  go(() => {
    const d = dayByNum.get(day)!;
    const b = d.route.reduce((acc, c) => acc.extend(c), new LngLatBounds(d.route[0], d.route[0]));
    const { w, h, wide } = viewport();
    map.fitBounds(b, {
      padding: wide
        ? { top: h * 0.15, bottom: h * 0.15, left: w * 0.12, right: w * 0.4 }
        : { top: h * 0.12, bottom: h * 0.4, left: w * 0.1, right: w * 0.1 },
      maxZoom: 12,
      pitch: 35,
      bearing: 0,
      duration: reduceMotion ? 0 : 2400,
      essential: true,
    });
    drawRoute(day);
    setActiveMarker(null, day);
  });
}

function showStop(id: string) {
  go(() => {
    const s = stopById.get(id)!;
    const { w, h, wide } = viewport();
    map.flyTo({
      center: s.coords,
      zoom: s.camera.zoom,
      pitch: s.camera.pitch,
      bearing: s.camera.bearing,
      // 카드가 오른쪽(모바일은 아래)에 있으니 지도 중심을 반대로 민다.
      // padding은 지도에 계속 남아 이후 fitBounds와 겹치므로 offset을 쓴다
      offset: wide ? [-w * 0.18, 0] : [0, -h * 0.2],
      speed: 0.9,
      curve: 1.6,
      duration: reduceMotion ? 0 : undefined,
      essential: true,
    });
    drawRoute(s.day);
    setActiveMarker(id, s.day);
  });
}

/* ------------------------------------------------------------------ */
/* 4. 스크롤 스텝 → 지도 카메라                                         */
/* ------------------------------------------------------------------ */

const targets = document.querySelectorAll<HTMLElement>('[data-map-target]');
const stepIO = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target as HTMLElement;
      const day = Number(el.dataset.day);
      setRail(day);
      document.querySelectorAll('.step.is-active').forEach((s) => s.classList.remove('is-active'));
      if (el.dataset.mapTarget === 'day') showDay(day);
      else {
        el.classList.add('is-active');
        showStop(el.dataset.stopId!);
      }
    }
  },
  // 화면 가운데 선을 지나는 요소만
  { rootMargin: '-50% 0px -50% 0px' },
);
targets.forEach((t) => stepIO.observe(t));
