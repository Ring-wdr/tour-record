// 당일 여행 지도 한 장 — 하루 경로를 시각의 빛(sky.ts)으로 칠하고, 범례 버튼으로 장소를 비춘다.
// 사진이 없는 긴 구간은 점선(다른 구간을 가로지르면 휜 선 — lib.ts arcFor), 장소가 좁은 곳에 모여 사진 점 선이 엇갈리는 구간은 장소끼리 이은 가는 선(link).
// 전체에 비해 아주 촘촘한 구간(detail)은 지도 가장자리에 확대 칸(두 번째 작은 지도)으로.
// daytrip.ts가 지도 칸이 화면에 가까워질 때 동적으로 불러온다 (MapLibre는 무겁다).
import {
  Map as MapLibre,
  Marker,
  LngLatBounds,
  MercatorCoordinate,
  NavigationControl,
  setWorkerUrl,
  type ExpressionSpecification,
  type LngLatBoundsLike,
  type PaddingOptions,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './route-map.css';

// scripts/copy-maplibre-worker.mjs가 복사해 둔 워커
setWorkerUrl('/vendor/maplibre/maplibre-gl-worker.mjs');

type LngLat = [number, number];
/** k = 지도 점 id(순서), n = 번호 — 0이면 하루를 여닫는 끝줄(번호 없이 속 빈 점) */
export type MapStop = { k: number; id: string; n: number; name: string; time: string; color: string; coords: LngLat; zoom: number };
/** 경로 토막 (lib.ts RoutePart) — from/to는 하루 경로 전체에서의 진행률. link = 장소 순서만 이은 가는 선 */
export type MapPart = { coords: LngLat[]; from: number; to: number; dashed: boolean; link?: boolean; stops: [number, string][]; color: string };
/** 확대 칸으로 보일 촘촘한 구간 (lib.ts detailLeg) */
export type MapDetail = { bounds: [LngLat, LngLat]; from: string; to: string; ns: number[] };
export type MapData = { parts: MapPart[]; stops: MapStop[]; detail?: MapDetail };

const STYLE = 'https://tiles.openfreemap.org/styles/dark';
const DEM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const CLEAR = 'rgba(0,0,0,0)';

/** 진행률 p까지만 그린 경로 색 — p 뒤는 투명 */
function gradient(stops: [number, string][], p = 1): ExpressionSpecification {
  const colors = ['interpolate', ['linear'], ['line-progress'], ...stops.flat()] as ExpressionSpecification;
  return p >= 1 ? colors : ['case', ['<=', ['line-progress'], p], colors, CLEAR];
}
/** 하루 경로 전체의 진행률 p → 그 토막 안의 진행률 */
const within = (part: MapPart, p: number) => Math.min(1, Math.max(0, (p - part.from) / (part.to - part.from || 1)));
const DASH_OPACITY = 0.9;

function newMap(container: HTMLElement, options: Partial<ConstructorParameters<typeof MapLibre>[0]>) {
  const map = new MapLibre({ container, style: STYLE, ...options });
  // OpenFreeMap 스타일이 스프라이트에 없는 무늬(wood-pattern 등)를 찾으면 콘솔 경고가 난다 — 빈 1px 그림으로 채운다
  map.setMissingStyleImageResolver((id) => {
    if (!map.hasImage(id)) map.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
  });
  // 'error' 듣는 쪽이 없으면 MapLibre가 타일 하나 실패(네트워크·바다의 고도 타일 등)도 console.error로 찍는다.
  // 타일 오류는 조용히 넘기고, 스타일·레이어 오류만 개발 중에 경고로 남긴다
  map.on('error', (e) => {
    if (import.meta.env.DEV && !(e as { sourceId?: string }).sourceId) console.warn('[daytrip map]', e.error?.message);
  });
  return map;
}

/** 물 색·지형 음영·경로·장소 점 — 본 지도와 확대 칸이 같이 쓴다. thin = 확대 칸(작은 칸에 촘촘한 길 — 선을 가늘게) */
function decorate(map: MapLibre, data: MapData, { progress, allNumbers, thin = false }: { progress: number; allNumbers: boolean; thin?: boolean }) {
  // 강을 조금 드러낸다 — 협곡·강변 여행이 많아 물이 배경색에 묻히지 않게
  for (const [id, prop, color] of [
    ['water', 'fill-color', '#0f2a33'],
    ['waterway', 'line-color', '#1a4452'],
  ] as const) {
    if (map.getLayer(id)) map.setPaintProperty(id, prop, color);
  }
  // 활주로·유도로는 dark 스타일에서 새까만 굵은 막대로 그려져 튄다 — 여행 지도에는 필요 없어 숨긴다
  for (const l of map.getStyle().layers) {
    if (l.id.startsWith('aeroway')) map.setLayoutProperty(l.id, 'visibility', 'none');
  }

  // 지형 음영 (3D 지형 없이) — 협곡의 골이 보이도록
  map.addSource('dtm-dem', { type: 'raster-dem', tiles: [DEM], encoding: 'terrarium', tileSize: 256, maxzoom: 13 });
  const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
  map.addLayer(
    {
      id: 'dtm-hillshade',
      type: 'hillshade',
      source: 'dtm-dem',
      paint: {
        // 고도 타일은 13레벨까지 — 더 확대하면 뭉개지므로 음영을 옅게
        'hillshade-exaggeration': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 15, 0.3, 17, 0.12],
        'hillshade-shadow-color': '#000000',
        'hillshade-highlight-color': '#57524c',
        'hillshade-accent-color': '#161616',
      },
    },
    firstSymbol,
  );

  data.parts.forEach((part, i) => {
    const id = `dtm-part-${i}`;
    map.addSource(id, {
      type: 'geojson',
      lineMetrics: !part.dashed,
      data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: part.coords } },
    });
    const p = within(part, progress);
    if (part.dashed) {
      // 사진이 없어 길을 모르는 구간 — 걸은 길로 읽히지 않게 가늘고 성긴 점선
      map.addLayer({
        id,
        type: 'line',
        source: id,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': part.color,
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, thin ? 1.2 : 1.6, 16, thin ? 1.8 : 2.4],
          'line-dasharray': [0.1, 3],
          'line-opacity': p >= 1 ? DASH_OPACITY : 0,
        },
      });
      return;
    }
    // 걸은 길(사진 점 궤적)은 굵게, 장소 순서만 이은 선(link)은 가늘게 — 길이 아니라 순서로 읽히게
    const width: ExpressionSpecification = part.link
      ? ['interpolate', ['linear'], ['zoom'], 12, thin ? 1.3 : 1.7, 16, thin ? 1.9 : 2.6]
      : ['interpolate', ['linear'], ['zoom'], 12, thin ? 1.8 : 3, 16, thin ? 2.6 : 5];
    map.addLayer({
      id: `${id}-case`,
      type: 'line',
      source: id,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#000000', 'line-width': part.link ? (thin ? 3.5 : 5) : thin ? 5 : 8, 'line-opacity': part.link ? 0.45 : 0.55, 'line-blur': part.link ? 1 : 2 },
    });
    map.addLayer({
      id,
      type: 'line',
      source: id,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-width': width,
        'line-gradient': gradient(part.stops, p),
      },
    });
  });

  // 장소: 색 점 + 번호 (본 지도는 번호가 겹치면 숨는다 — 확대하면 나타남, 확대 칸은 늘 보인다)
  map.addSource('dtm-stops', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: data.stops.map((s) => ({
        type: 'Feature',
        id: s.k,
        properties: { id: s.id, n: s.n, color: s.color },
        geometry: { type: 'Point', coordinates: s.coords },
      })),
    },
  });
  const active = ['boolean', ['feature-state', 'active'], false] as ExpressionSpecification;
  const end = ['==', ['get', 'n'], 0] as ExpressionSpecification;
  map.addLayer({
    id: 'dtm-stops',
    type: 'circle',
    source: 'dtm-stops',
    paint: {
      // 끝줄(번호 없음)은 속 빈 작은 점
      'circle-color': ['case', end, '#0b0b0d', ['get', 'color']],
      // zoom은 맨 바깥 interpolate의 입력으로만 쓸 수 있다
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        12,
        ['case', end, 4, active, 10, 7],
        16,
        ['case', end, 6, active, 13, 10],
      ],
      'circle-stroke-color': ['case', end, ['get', 'color'], active, '#ffffff', '#0b0b0d'],
      'circle-stroke-width': 2,
    },
  });
  map.addLayer({
    id: 'dtm-stops-n',
    type: 'symbol',
    source: 'dtm-stops',
    filter: ['>', ['get', 'n'], 0],
    layout: {
      'text-field': ['to-string', ['get', 'n']],
      'text-font': ['Noto Sans Regular'],
      'text-size': 11,
      'text-allow-overlap': allNumbers,
      'text-ignore-placement': allNumbers,
      'symbol-sort-key': ['get', 'n'],
    },
    paint: { 'text-color': '#0b0b0d' },
  });
}

/** 경로를 진행률 p까지 그린 상태로 */
function paintProgress(map: MapLibre, data: MapData, p: number) {
  data.parts.forEach((part, i) => {
    const q = within(part, p);
    if (part.dashed) map.setPaintProperty(`dtm-part-${i}`, 'line-opacity', q * DASH_OPACITY);
    else map.setPaintProperty(`dtm-part-${i}`, 'line-gradient', gradient(part.stops, q));
  });
}

const merc = ([lng, lat]: LngLat) => {
  const m = MercatorCoordinate.fromLngLat({ lng, lat });
  return [m.x, m.y] as const;
};

type Side = 'left' | 'right' | 'top' | 'bottom';
type Plan = { side: Side; w: number; h: number };
const EDGE = 12; // 확대 칸과 지도 가장자리 사이
const GAP = 16; // 경로 자리와 확대 칸 사이
// 확대 칸 안 여백 — 위는 글자표("12:08–18:04 확대") 자리만큼 더
const DETAIL_PAD = { top: 34, bottom: 14, left: 14, right: 14 };

export function mountRouteMap(el: HTMLElement, data: MapData, reduceMotion: boolean) {
  const pts = [...data.parts.flatMap((p) => p.coords), ...data.stops.map((s) => s.coords)];
  const bounds = pts.reduce((b, c) => b.extend(c), new LngLatBounds(pts[0], pts[0]));
  const basePad = () => Math.round(Math.min(72, Math.max(32, el.clientWidth * 0.09)));

  const box = el.parentElement!;
  const detailEl = data.detail ? box.querySelector<HTMLElement>('[data-map-detail]') : null;
  const detail = detailEl ? data.detail : undefined;
  const linesEl = box.querySelector<SVGSVGElement>('.detail-lines');

  /**
   * 확대 칸 자리 — 경로가 비워 둔 쪽(세로로 긴 길이면 옆, 가로로 긴 길이면 위·아래)에 두고, 그만큼 전체 보기 여백을 넓힌다.
   * 크기 = 본 경로를 줄이지 않고 남는 폭(높이) 전부. 너무 좁으면 본 경로를 조금(1.35배까지) 줄이고, 그래도 안 되면 쓰지 않는다
   */
  function plan(): Plan | undefined {
    if (!detail) return undefined;
    const W = el.clientWidth;
    const H = el.clientHeight;
    const p = basePad();
    const [x0, y0] = merc([bounds.getWest(), bounds.getNorth()]);
    const [x1, y1] = merc([bounds.getEast(), bounds.getSouth()]);
    const [lx0, ly0] = merc([detail.bounds[0][0], detail.bounds[1][1]]);
    const [lx1, ly1] = merc([detail.bounds[1][0], detail.bounds[0][1]]);
    const [RW, RH] = [x1 - x0 || 1e-12, y1 - y0 || 1e-12];
    const fx = ((lx0 + lx1) / 2 - x0) / RW;
    const fy = ((ly0 + ly1) / 2 - y0) / RH;
    const legAspect = Math.min(1.8, Math.max(0.7, (lx1 - lx0) / (ly1 - ly0 || 1e-12)));
    const fit = (w: number, h: number) => Math.max(RW / Math.max(1, w), RH / Math.max(1, h));
    const s0 = fit(W - 2 * p, H - 2 * p);
    const MIN = 150;

    if (RW / RH < (W - 2 * p) / (H - 2 * p)) {
      // 세로로 긴 길 — 옆에
      const free = W - 2 * p - RW / s0 - GAP;
      const w = Math.round(Math.min(W * 0.62, Math.max(MIN, free)));
      const h = Math.round(Math.min(H - 2 * EDGE, w / legAspect));
      if (fit(W - 2 * p - w - GAP, H - 2 * p) > s0 * 1.35) return undefined;
      return { side: fx < 0.5 ? 'right' : 'left', w, h };
    }
    // 가로로 긴 길 — 위나 아래에
    const free = H - 2 * p - RH / s0 - GAP;
    const h = Math.round(Math.min(H * 0.5, Math.max(MIN * 0.8, free)));
    const w = Math.round(Math.min(W - 2 * EDGE, h * legAspect));
    if (fit(W - 2 * p, H - 2 * p - h - GAP) > s0 * 1.35) return undefined;
    return { side: fy < 0.5 ? 'bottom' : 'top', w, h };
  }

  let layout = plan();
  const overviewPadding = (): PaddingOptions => {
    const p = basePad();
    const pad = { top: p, bottom: p, left: p, right: p };
    if (layout) pad[layout.side] += layout[layout.side === 'left' || layout.side === 'right' ? 'w' : 'h'] + GAP;
    return pad;
  };

  const map = newMap(el, {
    bounds,
    fitBoundsOptions: { padding: overviewPadding() },
    // 페이지 스크롤을 빼앗지 않도록 — 확대는 Ctrl(⌘)+휠, 모바일은 두 손가락
    cooperativeGestures: true,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    maxZoom: 17.5,
    attributionControl: { compact: true },
    locale: {
      'CooperativeGesturesHandler.WindowsHelpText': 'Ctrl 키를 누른 채 스크롤하면 지도를 확대·축소합니다',
      'CooperativeGesturesHandler.MacHelpText': '⌘ 키를 누른 채 스크롤하면 지도를 확대·축소합니다',
      'CooperativeGesturesHandler.MobileHelpText': '두 손가락으로 지도를 움직이세요',
      'NavigationControl.ZoomIn': '확대',
      'NavigationControl.ZoomOut': '축소',
      'Map.Title': '지도',
    },
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  map.addControl(new NavigationControl({ showCompass: false, visualizePitch: false }), 'top-right');

  // 지금 비추는 장소의 이름표 — 글꼴을 맞추려고 HTML 마커 하나를 옮겨 다닌다
  const tag = document.createElement('div');
  tag.className = 'dtm-tag';
  tag.innerHTML = '<span class="dtm-tag-t"></span><span class="dtm-tag-n"></span>';
  const tagMarker = new Marker({ element: tag, anchor: 'bottom', offset: [0, -14] });

  let ready = false;
  const queued: (() => void)[] = [];
  const whenReady = (fn: () => void) => (ready ? fn() : queued.push(fn));

  map.on('load', () => {
    decorate(map, data, { progress: reduceMotion ? 1 : 0, allNumbers: false });
    // 지도 안 저작권 표시는 접어 둔다 (ⓘ로 펼침) — 지도 칸 아래에 같은 크레딧 줄이 늘 보인다
    el.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
    ready = true;
    queued.splice(0).forEach((fn) => fn());
  });

  /* ---------------- 확대 칸 ---------------- */
  let atOverview = true;
  /** 경로를 그린 정도(0~1) — 확대 칸도 본 지도와 같은 만큼 그린다 */
  let progress = reduceMotion ? 1 : 0;
  let detailMap: MapLibre | undefined;
  let detailReady = false;

  /** 확대 칸 자리·크기와 잇는 선 — 본 지도가 전체 보기일 때만 */
  function placeDetail() {
    if (!detail || !detailEl || !layout) return;
    const W = el.clientWidth;
    const H = el.clientHeight;
    const { side, w, h } = layout;
    const nw = map.project([detail.bounds[0][0], detail.bounds[1][1]]);
    const se = map.project([detail.bounds[1][0], detail.bounds[0][1]]);
    const R = { l: nw.x - 8, t: nw.y - 8, r: se.x + 8, b: se.y + 8 };
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    let x: number;
    let y: number;
    if (side === 'left' || side === 'right') {
      x = side === 'right' ? W - w - EDGE : EDGE;
      y = clamp((R.t + R.b) / 2 - h / 2, EDGE, H - h - EDGE);
    } else {
      y = side === 'bottom' ? H - h - EDGE : EDGE;
      x = clamp((R.l + R.r) / 2 - w / 2, EDGE, W - w - EDGE);
    }
    Object.assign(detailEl.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
    detailMap?.resize();
    detailMap?.fitBounds(detail.bounds, { padding: DETAIL_PAD, duration: 0 });

    if (!linesEl) return;
    const rect = linesEl.querySelector('rect')!;
    rect.setAttribute('x', `${R.l}`);
    rect.setAttribute('y', `${R.t}`);
    rect.setAttribute('width', `${Math.max(0, R.r - R.l)}`);
    rect.setAttribute('height', `${Math.max(0, R.b - R.t)}`);
    // 가까운 두 모서리끼리 잇는다
    const pairs: [number, number, number, number][] =
      side === 'right'
        ? [[R.r, R.t, x, y], [R.r, R.b, x, y + h]]
        : side === 'left'
          ? [[R.l, R.t, x + w, y], [R.l, R.b, x + w, y + h]]
          : side === 'bottom'
            ? [[R.l, R.b, x, y], [R.r, R.b, x + w, y]]
            : [[R.l, R.t, x, y + h], [R.r, R.t, x + w, y + h]];
    linesEl.querySelectorAll('line').forEach((line, i) => {
      const [x1, y1, x2, y2] = pairs[i];
      line.setAttribute('x1', `${x1}`);
      line.setAttribute('y1', `${y1}`);
      line.setAttribute('x2', `${x2}`);
      line.setAttribute('y2', `${y2}`);
    });
  }

  function showDetail(on: boolean) {
    box.classList.toggle('dt-detail-on', on && !!layout);
    detailEl?.querySelector('button')?.toggleAttribute('disabled', !(on && layout));
  }

  function mountDetail() {
    if (!detail || !detailEl || !layout || detailMap) return;
    placeDetail();
    // 확대 칸의 틀(칸·점선 사각형·잇는 선)은 본 지도가 뜨자마자 보인다 — 경로를 그리기 전부터 그 자리가 비어 보이지 않게.
    // 칸 안의 지도는 뜨면 서서히, 경로는 본 지도와 같이 그려진다
    showDetail(atOverview);
    const inner = detailEl.querySelector<HTMLElement>('.detail-map')!;
    detailMap = newMap(inner, {
      bounds: detail.bounds as LngLatBoundsLike,
      fitBoundsOptions: { padding: DETAIL_PAD },
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
    });
    detailMap.once('load', () => {
      decorate(detailMap!, data, { progress, allNumbers: true, thin: true });
      detailReady = true;
      detailEl.classList.add('is-ready');
    });
  }

  if (detail && detailEl) {
    whenReady(mountDetail);
    // 손으로 지도를 움직이면 확대 칸은 비킨다 (전체 경로 버튼으로 돌아온다)
    map.on('movestart', (e) => {
      if (!(e as { originalEvent?: unknown }).originalEvent) return;
      atOverview = false;
      showDetail(false);
    });
    map.on('resize', () => {
      if (!atOverview) return;
      layout = plan();
      map.fitBounds(bounds, { padding: overviewPadding(), duration: 0 });
      placeDetail();
      showDetail(true);
    });
  }

  /** 경로를 처음부터 끝까지 그려 나간다 */
  function draw() {
    if (reduceMotion) return;
    const t0 = performance.now();
    const dur = 2600;
    const frame = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      progress = 1 - Math.pow(1 - k, 3);
      paintProgress(map, data, progress);
      if (detailReady) paintProgress(detailMap!, data, progress);
      if (k < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  let active: MapStop | undefined;
  function setActive(s?: MapStop) {
    if (active) map.setFeatureState({ source: 'dtm-stops', id: active.k }, { active: false });
    active = s;
    if (!s) {
      tagMarker.remove();
      return;
    }
    map.setFeatureState({ source: 'dtm-stops', id: s.k }, { active: true });
    tag.style.setProperty('--c', s.color);
    tag.querySelector('.dtm-tag-t')!.textContent = s.time;
    tag.querySelector('.dtm-tag-n')!.textContent = s.name;
    tagMarker.setLngLat(s.coords).addTo(map);
  }

  return {
    /** 지도 칸이 화면에 들어오면 한 번 */
    reveal: () => whenReady(draw),
    focus(id: string) {
      const s = data.stops.find((x) => x.id === id);
      if (!s) return;
      whenReady(() => {
        atOverview = false;
        showDetail(false);
        setActive(s);
        // padding은 지도에 남아 이후 fitBounds와 겹치므로 flyTo에는 쓰지 않는다 (CLAUDE.md)
        // 좁은 지도에서는 반 단계 덜 — 장소 둘레(강·길·이웃 장소)가 보이게
        const zoom = Math.min(s.zoom, el.clientWidth < 600 ? 14.5 : 15);
        map.flyTo({ center: s.coords, zoom, duration: reduceMotion ? 0 : 1600, essential: true });
      });
    },
    /** 확대 칸의 구간을 본 지도에서 크게 */
    focusDetail() {
      if (!detail) return;
      whenReady(() => {
        atOverview = false;
        showDetail(false);
        setActive(undefined);
        map.fitBounds(detail.bounds, { padding: basePad(), maxZoom: 16, duration: reduceMotion ? 0 : 1400, essential: true });
      });
    },
    overview() {
      whenReady(() => {
        setActive(undefined);
        layout = plan();
        map.fitBounds(bounds, { padding: overviewPadding(), duration: reduceMotion ? 0 : 1400, essential: true });
        map.once('moveend', () => {
          atOverview = true;
          placeDetail();
          showDetail(true);
        });
      });
    },
    onLoad(fn: () => void) {
      map.once('load', fn);
    },
  };
}
