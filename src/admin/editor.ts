// 새 여행 폼 (dev 전용 /admin/new). 상태 객체 하나를 그대로 그리고, 입력칸은 data-k 경로로 상태에 묶는다.
// 날짜 수는 시작일~끝일로 정해지고, 저장하면 /api/admin/trips가 같은 zod 스키마로 검증한다.
import { Map as MapLibre, Marker, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

setWorkerUrl('/vendor/maplibre/maplibre-gl-worker.mjs');

/* ------------------------------------------------------------------ */
/* 상태                                                                 */
/* ------------------------------------------------------------------ */

type Stop = {
  id: string; name: string; nameEn: string; lng: string; lat: string; approx: boolean; time: string;
  elevation: string; kind: string; zoom: string; pitch: string; bearing: string; note: string;
  /** 한 줄에 한 장: `파일명 | 설명 | 캡션` */
  photos: string;
};
type Day = {
  title: string; titleEn: string; lede: string; accent: string; from: string; to: string; driveKm: string;
  fromBase: boolean; toBase: boolean; spotlightCountry: boolean; coverSrc: string; coverAlt: string;
  stops: Stop[]; body: string;
};
type State = {
  slug: string; title: string; subtitle: string; subtitleKo: string; description: string; country: string;
  start: string; end: string; baseLng: string; baseLat: string; heroDay: string; spotlight: string; utcOffset: string;
  skipDays: string; bbox: string; altitudeNote: string; source: string; hotelLng: string; hotelLat: string;
  days: Day[];
};

// 알마티 여행에서 쓴 날짜 색 — 새 날의 기본값으로 돌려 쓴다
const PALETTE = [
  ['#f2a65a', '#3b2a4d', '#d9825b'], ['#3fd0c9', '#0c3b4a', '#2fa7a0'], ['#9cc3ff', '#1c2a44', '#8fb3d9'],
  ['#f4d35e', '#2f4a3a', '#e8c46a'], ['#ff6b4a', '#4a1c14', '#d0573a'], ['#e9c46a', '#4a3418', '#d9b26a'],
  ['#8bd17c', '#2b3a1f', '#b98a4a'],
];
const KIND_LABEL: Record<string, string> = {
  arrival: '도착', stay: '숙소', nature: '자연 (3D 지형)', food: '식당', culture: '문화', market: '시장',
  departure: '출발', city: '시내', flight: '비행',
};
const DRAFT_KEY = 'tour-record:admin:new-trip';
const DAY_MS = 86_400_000;
const pad2 = (n: number) => String(n).padStart(2, '0');

const blankStop = (): Stop => ({
  id: '', name: '', nameEn: '', lng: '', lat: '', approx: false, time: '', elevation: '', kind: 'city',
  zoom: '13', pitch: '40', bearing: '170', note: '', photos: '',
});
const blankDay = (i: number): Day => {
  const [accent, from, to] = PALETTE[i % PALETTE.length];
  return {
    title: '', titleEn: '', lede: '', accent, from, to, driveKm: '', fromBase: i > 0, toBase: true,
    spotlightCountry: false, coverSrc: '', coverAlt: '', stops: [blankStop()], body: '',
  };
};
const blankState = (): State => ({
  slug: '', title: '', subtitle: '', subtitleKo: '', description: '', country: '', start: '', end: '',
  baseLng: '', baseLat: '', heroDay: '1', spotlight: '', utcOffset: '+09:00', skipDays: '', bbox: '',
  altitudeNote: '', source: '', hotelLng: '', hotelLat: '', days: [],
});

function loadDraft(): State {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) return { ...blankState(), ...JSON.parse(raw) };
  } catch {}
  return blankState();
}
let state = loadDraft();
let saveTimer = 0;
const saveDraft = () => {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
    } catch {}
  }, 300);
};

/** "days.0.stops.1.name" 같은 경로로 읽고 쓰기 */
const getAt = (path: string): any => path.split('.').reduce<any>((o, k) => o?.[k], state);
function setAt(path: string, value: unknown) {
  const keys = path.split('.');
  const last = keys.pop()!;
  const obj = keys.reduce<any>((o, k) => o[k], state);
  obj[last] = value;
}

/** 날짜 입력칸이 허용하는 범위 — 네이티브 datepicker의 min/max */
const DATE_MIN = '1990-01-01';
const DATE_MAX = '2099-12-31';
const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && s >= DATE_MIN && s <= DATE_MAX && !Number.isNaN(Date.parse(s));

/** 시작일~끝일의 날짜 수 (최대 60) */
function dayCount() {
  if (!validDate(state.start) || !validDate(state.end) || state.end < state.start) return 0;
  return Math.min(60, Math.round((Date.parse(state.end) - Date.parse(state.start)) / DAY_MS) + 1);
}
/** 기간이 늘면 날을 추가한다. 줄어도 지우지 않고 숨기기만 한다 (기간을 잘못 골랐다 되돌려도 입력이 남도록) */
function syncDays() {
  const n = dayCount();
  while (state.days.length < n) state.days.push(blankDay(state.days.length));
}
/** 화면에 보이고 저장되는 날들 */
const visibleDays = () => state.days.slice(0, dayCount());
function dayLabel(i: number) {
  const t = Date.parse(state.start) + i * DAY_MS;
  if (Number.isNaN(t)) return '';
  const d = new Date(t);
  return `${d.getUTCFullYear()}.${pad2(d.getUTCMonth() + 1)}.${pad2(d.getUTCDate())} ${['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getUTCDay()]}`;
}

/* ------------------------------------------------------------------ */
/* 그리기                                                               */
/* ------------------------------------------------------------------ */

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

type FieldOpt = { label: string; hint?: string; type?: string; wide?: boolean; req?: boolean; placeholder?: string; mono?: boolean; attrs?: string };
function field(k: string, o: FieldOpt) {
  const v = getAt(k);
  const label = `<span>${esc(o.label)}${o.req ? ' <b>*</b>' : ''}</span>`;
  const cls = o.mono ? ' class="mono"' : '';
  const ph = o.placeholder ? ` placeholder="${esc(o.placeholder)}"` : '';
  const input =
    o.type === 'textarea'
      ? `<textarea data-k="${k}" rows="${o.attrs ?? 3}"${cls}${ph}>${esc(v)}</textarea>`
      : `<input data-k="${k}" type="${o.type ?? 'text'}" value="${esc(v)}"${cls}${ph} ${o.type === 'textarea' ? '' : (o.attrs ?? '')}>`;
  return `<label class="ed-field${o.wide ? ' wide' : ''}" data-f="${k}">${label}${input}${o.hint ? `<em>${esc(o.hint)}</em>` : ''}</label>`;
}
const check = (k: string, label: string, hint?: string) =>
  `<label class="ed-check" data-f="${k}"><input type="checkbox" data-k="${k}"${getAt(k) ? ' checked' : ''}> ${esc(label)}${hint ? `<em>${esc(hint)}</em>` : ''}</label>`;
/** [경도, 위도] 두 칸 + 지도에서 고르기 */
const coords = (lngK: string, latK: string, label: string, req = false, hint?: string) => `
  <div class="ed-field" data-f="${lngK}">
    <span>${esc(label)}${req ? ' <b>*</b>' : ''}</span>
    <div class="ed-coords">
      <input data-k="${lngK}" type="number" step="any" placeholder="경도 (lng)" value="${esc(getAt(lngK))}">
      <input data-k="${latK}" type="number" step="any" placeholder="위도 (lat)" value="${esc(getAt(latK))}">
      <button type="button" class="btn" data-act="pick" data-lng="${lngK}" data-lat="${latK}" data-label="${esc(label)}" title="지도에서 고르기">◎</button>
    </div>
    ${hint ? `<em>${esc(hint)}</em>` : ''}
  </div>`;

function stopHtml(i: number, j: number, n: number) {
  const p = `days.${i}.stops.${j}`;
  const s = state.days[i].stops[j];
  const kinds = Object.entries(KIND_LABEL)
    .map(([k, l]) => `<option value="${k}"${s.kind === k ? ' selected' : ''}>${k} · ${l}</option>`)
    .join('');
  return `
  <div class="ed-stop" data-f="${p}">
    <header>
      <span>${pad2(j + 1)} / ${pad2(n)}${s.name ? ` · ${esc(s.name)}` : ''}</span>
      <div>
        <button type="button" class="btn" data-act="stop-up" data-i="${i}" data-j="${j}" ${j === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" class="btn" data-act="stop-down" data-i="${i}" data-j="${j}" ${j === n - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" class="btn" data-act="stop-del" data-i="${i}" data-j="${j}" ${n === 1 ? 'disabled' : ''}>삭제</button>
      </div>
    </header>
    <div class="ed-grid">
      ${field(`${p}.name`, { label: '장소 이름', req: true, placeholder: '빅 알마티 호수' })}
      ${field(`${p}.nameEn`, { label: '영문/현지 표기', req: true, placeholder: 'Big Almaty Lake' })}
      ${field(`${p}.id`, { label: 'id', mono: true, placeholder: stopIds()[i]?.[j], hint: '비우면 영문 이름으로 자동 (여행 전체에서 고유)' })}
      <label class="ed-field" data-f="${p}.kind"><span>종류 <b>*</b></span><select data-k="${p}.kind">${kinds}</select></label>
      ${coords(`${p}.lng`, `${p}.lat`, '좌표', true)}
      ${check(`${p}.approx`, '좌표 대략치')}
      ${field(`${p}.time`, { label: '시각', placeholder: '09:40', hint: '다음 날이면 +1 09:20', mono: true })}
      ${field(`${p}.elevation`, { label: '고도 (m)', type: 'number', hint: '고도 그래프에 쓰인다' })}
      ${field(`${p}.zoom`, { label: '카메라 zoom', type: 'number', attrs: 'step="0.1" min="0" max="22"' })}
      ${field(`${p}.pitch`, { label: 'pitch (0–75)', type: 'number', attrs: 'min="0" max="75"' })}
      ${field(`${p}.bearing`, { label: 'bearing', type: 'number', hint: '시내는 160~180 (산을 배경으로)' })}
      ${field(`${p}.note`, { label: '장소 카드 문구', type: 'textarea', wide: true })}
      ${field(`${p}.photos`, {
        label: '사진',
        type: 'textarea',
        wide: true,
        mono: true,
        placeholder: '20260912_121051 | 빅 알마티 호수 전경 | 캡션(선택)',
        hint: '한 줄에 한 장: 파일명 | 설명 | 캡션. 파일명만 쓰면 /photos/<slug>/dayXX/<파일명>.jpg. 설명을 비우면 장소 이름. 카드에는 앞의 3장',
      })}
    </div>
  </div>`;
}

function dayHtml(i: number) {
  const d = state.days[i];
  const p = `days.${i}`;
  return `
  <section class="ed-day" id="day-${i}" data-f="${p}" style="--accent:${esc(d.accent)}">
    <header><b>${pad2(i + 1)}</b><span>Day ${pad2(i + 1)} · ${esc(dayLabel(i))}</span></header>
    <div class="ed-daybody">
      <div class="ed-sub"><h3>타이틀 카드 <small>title card</small></h3>
        <div class="ed-grid">
          ${field(`${p}.title`, { label: '제목', req: true, placeholder: '사과의 도시에 내리다' })}
          ${field(`${p}.titleEn`, { label: '영문 제목', req: true, placeholder: 'Arrival in the City of Apples' })}
          ${field(`${p}.lede`, { label: '리드 문장', type: 'textarea', wide: true, attrs: '2' })}
          ${field(`${p}.coverSrc`, { label: '표지 사진', mono: true, placeholder: '20260911_191116', hint: '파일명만 쓰면 이 날 폴더 경로로' })}
          ${field(`${p}.coverAlt`, { label: '표지 설명', placeholder: '구름 위의 일몰' })}
          ${field(`${p}.accent`, { label: '날짜 색 (경로·강조)', type: 'color' })}
          ${field(`${p}.from`, { label: '플레이스홀더 색 1', type: 'color' })}
          ${field(`${p}.to`, { label: '플레이스홀더 색 2', type: 'color' })}
        </div>
      </div>
      <div class="ed-sub"><h3>경로 개요 <small>the route</small></h3>
        <div class="ed-grid">
          ${field(`${p}.driveKm`, { label: '이동 거리 (km)', type: 'number', req: true })}
          ${check(`${p}.fromBase`, '숙소에서 출발', '아니면 전날 마지막 장소에서')}
          ${check(`${p}.toBase`, '숙소로 돌아옴')}
          ${check(`${p}.spotlightCountry`, '나라 스포트라이트', '여행 정보의 국경 파일 필요')}
        </div>
      </div>
      <div class="ed-sub"><h3>장소 스텝 <small>stops · 지도 위 카드</small></h3>
        ${d.stops.map((_, j) => stopHtml(i, j, d.stops.length)).join('')}
        <button type="button" class="btn" data-act="stop-add" data-i="${i}">+ 장소 추가</button>
      </div>
      <div class="ed-sub"><h3>일기 <small>journal · 종이 스프레드</small></h3>
        ${field(`${p}.body`, { label: '본문 (Markdown, 빈 줄로 문단 구분)', type: 'textarea', wide: true, attrs: '8' })}
      </div>
    </div>
  </section>`;
}

const endHint = (n: number) => (n ? `${n}일 — 아래에 날짜가 만들어진다` : '달력에서 고른다');

/** 날짜 입력칸 — 네이티브 datepicker로만 고른다 (직접 타이핑하면 "0002-…" 같은 중간값이 들어가므로 막는다) */
function dateField(k: 'start' | 'end', label: string, hint: string) {
  const min = k === 'end' && validDate(state.start) ? state.start : DATE_MIN;
  return `<label class="ed-field" data-f="${k}"><span>${label} <b>*</b></span>
    <input data-k="${k}" type="date" value="${esc(getAt(k))}" min="${min}" max="${DATE_MAX}">
    <em data-hint="${k}">${esc(hint)}</em></label>`;
}

/** 날짜별 입력칸만 다시 그린다 — 위쪽 여행 정보 입력칸(포커스 중인 날짜 칸 포함)은 건드리지 않는다 */
function renderDays() {
  const n = dayCount();
  document.getElementById('days')!.innerHTML = n
    ? visibleDays().map((_, i) => dayHtml(i)).join('')
    : '<p class="ed-block">시작일과 끝일을 고르면 날짜별 입력칸이 생긴다.</p>';
  syncMarkers();
}

/** 기간이 바뀌면: 날짜 수 맞추기, 끝일 안내·최소값, 표지 날 최대값, 날짜 목록 */
function onPeriodChange() {
  syncDays();
  const n = dayCount();
  const hint = document.querySelector('[data-hint="end"]');
  if (hint) hint.textContent = endHint(n);
  const end = document.querySelector<HTMLInputElement>('[data-k="end"]');
  if (end) end.min = validDate(state.start) ? state.start : DATE_MIN;
  const hero = document.querySelector<HTMLInputElement>('[data-k="heroDay"]');
  if (hero) hero.max = String(Math.max(n, 1));
  renderDays();
}

function renderAll() {
  const geo = meta.geo.map((g) => `<option value="${g}"${state.spotlight === g ? ' selected' : ''}>${g}</option>`).join('');
  const n = dayCount();
  document.getElementById('editor')!.innerHTML = `
  <div class="ed-block"><h2>여행 정보 <small>첫 화면 · 숫자 · 엔딩</small></h2>
    <div class="ed-grid">
      ${field('slug', { label: '주소 (slug)', req: true, mono: true, placeholder: 'osaka-2025', hint: '/trips/<slug>/ — 소문자·숫자·하이픈' })}
      ${field('title', { label: '큰 제목', req: true, placeholder: 'ALMATY', hint: '영문 대문자 권장' })}
      ${field('subtitle', { label: '영문 부제', req: true, placeholder: 'Seven Days in Kazakhstan' })}
      ${field('subtitleKo', { label: '한글 부제', req: true, placeholder: '카자흐스탄에서 보낸 7일' })}
      ${field('country', { label: '나라', req: true, placeholder: 'Kazakhstan' })}
      ${dateField('start', '시작일', '달력에서 고른다')}
      ${dateField('end', '끝일', endHint(n))}
      ${field('heroDay', { label: '첫 화면 표지로 쓸 날', type: 'number', attrs: `min="1" max="${Math.max(n, 1)}"` })}
      ${field('description', { label: '설명 (검색·링크 미리보기)', type: 'textarea', wide: true, req: true, attrs: '2' })}
    </div>
  </div>

  <div class="ed-block"><h2>지도 <small>map</small></h2>
    <div class="ed-grid">
      ${coords('baseLng', 'baseLat', '공개 숙소 좌표', true, '실제 숙소가 아닌 시내 중심 등 — 사이트에 공개된다')}
      <label class="ed-field" data-f="spotlight"><span>나라 스포트라이트 국경</span>
        <select data-k="spotlight"><option value="">없음</option>${geo}</select>
        <em>src/data/geo/&lt;이름&gt;.json</em></label>
      ${field('utcOffset', { label: '현지 시간대', req: true, mono: true, placeholder: '+09:00', hint: 'pnpm tracks가 사진 시각을 날짜로 나눌 때' })}
      ${field('skipDays', { label: '경로에서 사진 궤적을 안 쓸 날', mono: true, placeholder: '1, 7', hint: '비행만 있는 날 등 — 장소를 이은 선' })}
      ${field('bbox', { label: '궤적 범위 [서, 남, 동, 북]', mono: true, placeholder: '70, 35, 85, 56', hint: '밖의 GPS 점(기내·경유지)은 버림. 비우면 전부' })}
    </div>
  </div>

  <div id="days"></div>

  <div class="ed-block"><h2>고도 그래프 <small>the altitude line</small></h2>
    <div class="ed-grid">${field('altitudeNote', { label: '설명 문구', type: 'textarea', wide: true, attrs: '2' })}</div>
  </div>

  <div class="ed-block"><h2>로컬 전용 <small>trips.local.json · 사이트에 안 나감</small></h2>
    <div class="ed-grid">
      ${field('source', { label: '원본 사진 폴더', mono: true, placeholder: 'D:/archive/Camera_202609', hint: 'pnpm photos / tracks가 읽는다' })}
      ${coords('hotelLng', 'hotelLat', '실제 숙소 좌표 (비공개)', false, '반경 700m 안의 GPS 궤적을 pnpm tracks가 잘라낸다')}
    </div>
  </div>

  <div class="editor-actions">
    <span class="status" id="status"></span>
    <button type="submit" class="btn primary" id="submit">여행 만들기</button>
  </div>`;
  renderDays();
}

/* ------------------------------------------------------------------ */
/* 지도: 좌표 고르기 + 입력한 장소 표시                                   */
/* ------------------------------------------------------------------ */

const map = new MapLibre({
  container: 'admin-map',
  style: 'https://tiles.openfreemap.org/styles/dark',
  center: [127, 37.5],
  zoom: 2,
  attributionControl: { compact: true },
});
let picking: { lng: string; lat: string } | null = null;
const banner = document.getElementById('pick-banner')!;
const mapBox = document.querySelector('.editor-map')!;

function setPicking(p: typeof picking, label = '') {
  picking = p;
  banner.hidden = !p;
  banner.textContent = p ? `「${label}」 좌표: 지도를 클릭하세요 (Esc 취소)` : '';
  mapBox.classList.toggle('picking', !!p);
}
map.on('click', (e) => {
  if (!picking) return;
  const lng = +e.lngLat.lng.toFixed(4);
  const lat = +e.lngLat.lat.toFixed(4);
  for (const [k, v] of [[picking.lng, lng], [picking.lat, lat]] as const) {
    setAt(k, String(v));
    const el = document.querySelector<HTMLInputElement>(`[data-k="${k}"]`);
    if (el) el.value = String(v);
  }
  setPicking(null);
  saveDraft();
  syncMarkers();
});
addEventListener('keydown', (e) => e.key === 'Escape' && setPicking(null));

let markers: Marker[] = [];
function syncMarkers() {
  markers.forEach((m) => m.remove());
  markers = [];
  const add = (lng: string, lat: string, color: string, title: string) => {
    if (lng === '' || lat === '' || Number.isNaN(+lng) || Number.isNaN(+lat)) return;
    const el = document.createElement('div');
    el.title = title;
    el.style.cssText = `width:10px;height:10px;border-radius:50%;background:${color};box-shadow:0 0 0 3px rgb(0 0 0 / .6)`;
    markers.push(new Marker({ element: el }).setLngLat([+lng, +lat]).addTo(map));
  };
  add(state.baseLng, state.baseLat, '#ffffff', '공개 숙소 좌표');
  add(state.hotelLng, state.hotelLat, '#ff6b4a', '실제 숙소 (비공개)');
  visibleDays().forEach((d, i) => d.stops.forEach((s, j) => add(s.lng, s.lat, d.accent, `D${i + 1} ${j + 1}. ${s.name}`)));
}

/* ------------------------------------------------------------------ */
/* 입력 → 상태                                                          */
/* ------------------------------------------------------------------ */

const form = document.getElementById('editor') as HTMLFormElement;

form.addEventListener('input', (e) => {
  const el = e.target as HTMLInputElement;
  const k = el.dataset.k;
  if (!k || el.type === 'date') return; // 날짜는 change(달력에서 고른 뒤)에서만
  setAt(k, el.type === 'checkbox' ? el.checked : el.value);
  el.closest('.has-issue')?.classList.remove('has-issue');
  saveDraft();
  if (/(Lng|Lat|\.lng|\.lat)$/.test(k)) syncMarkers();
  else if (/\.nameEn$/.test(k)) {
    // id placeholder(자동 id 미리보기)를 영문 이름에 맞춰 갱신
    const [, i, j] = k.match(/^days\.(\d+)\.stops\.(\d+)\./)!.map(Number);
    const idInput = document.querySelector<HTMLInputElement>(`[data-k="days.${i}.stops.${j}.id"]`);
    if (idInput) idInput.placeholder = stopIds()[i][j];
  }
  else if (/\.accent$/.test(k)) (el.closest('.ed-day') as HTMLElement)?.style.setProperty('--accent', el.value);
});

form.addEventListener('change', (e) => {
  const el = e.target as HTMLInputElement;
  const k = el.dataset.k;
  if (el.type !== 'date' || (k !== 'start' && k !== 'end')) return;
  // 범위 밖이거나 반쯤 지운 값은 받지 않고 이전 값으로 되돌린다
  if (el.value && !validDate(el.value)) {
    el.value = state[k];
    return;
  }
  state[k] = el.value;
  el.closest('.has-issue')?.classList.remove('has-issue');
  saveDraft();
  onPeriodChange();
});

// 날짜 칸: 클릭하면 달력을 열고, 숫자 타이핑은 막는다 (Tab·Esc·지우기만 허용)
const openPicker = (el: HTMLInputElement) => {
  try {
    el.showPicker();
  } catch {}
};
form.addEventListener('click', (e) => {
  const el = e.target as HTMLInputElement;
  if (el.type === 'date') openPicker(el);
});
form.addEventListener('keydown', (e) => {
  const el = e.target as HTMLInputElement;
  if (el.type !== 'date') return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    openPicker(el);
  } else if (!['Tab', 'Escape', 'Backspace', 'Delete'].includes(e.key)) e.preventDefault();
});

document.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!btn) return;
  const { act, i, j } = btn.dataset;
  const stops = i != null ? state.days[+i].stops : [];
  switch (act) {
    case 'pick':
      setPicking({ lng: btn.dataset.lng!, lat: btn.dataset.lat! }, btn.dataset.label);
      return;
    case 'stop-add':
      stops.push(blankStop());
      break;
    case 'stop-del':
      stops.splice(+j!, 1);
      break;
    case 'stop-up':
    case 'stop-down': {
      const a = +j!;
      const b = act === 'stop-up' ? a - 1 : a + 1;
      [stops[a], stops[b]] = [stops[b], stops[a]];
      break;
    }
    case 'clear-draft':
      if (!confirm('입력한 초안을 모두 지울까요?')) return;
      state = blankState();
      document.getElementById('issues')!.hidden = true;
      saveDraft();
      renderAll();
      return;
    default:
      return;
  }
  saveDraft();
  renderDays();
});

/* ------------------------------------------------------------------ */
/* 저장                                                                 */
/* ------------------------------------------------------------------ */

const num = (s: string) => (s === '' || s == null ? undefined : Number(s));
const slugify = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
/** 파일명만 적었으면 /photos/<slug>/dayXX/<이름>.jpg */
const photoSrc = (s: string, i: number) =>
  /^(https?:\/\/|\/)/.test(s) ? s : `/photos/${state.slug}/day${pad2(i + 1)}/${s.replace(/\.jpe?g$/i, '')}.jpg`;

/** 장소 id — 비어 있으면 영문 이름에서 만든다. 초안에는 저장하지 않고(이름을 고치면 따라 바뀌게) 입력칸 placeholder로만 보인다 */
function stopIds(): string[][] {
  const used = new Set<string>();
  return visibleDays().map((d, i) =>
    d.stops.map((s, j) => {
      let id = s.id.trim();
      if (!id) {
        id = slugify(s.nameEn) || `d${i + 1}-${j + 1}`;
        while (used.has(id)) id += '-2';
      }
      used.add(id);
      return id;
    }),
  );
}

function payload() {
  const ids = stopIds();
  const nums = (s: string) => s.split(/[\s,]+/).filter(Boolean).map(Number);
  const bbox = nums(state.bbox);
  return {
    slug: state.slug.trim(),
    trip: {
      title: state.title,
      subtitle: state.subtitle,
      subtitleKo: state.subtitleKo,
      description: state.description,
      country: state.country,
      start: state.start,
      end: state.end,
      base: [num(state.baseLng), num(state.baseLat)],
      heroDay: num(state.heroDay) ?? 1,
      spotlight: state.spotlight || undefined,
      utcOffset: state.utcOffset.trim(),
      tracks: {
        skipDays: nums(state.skipDays),
        ...(bbox.length === 4 && { bbox: [[bbox[0], bbox[1]], [bbox[2], bbox[3]]] }),
      },
      altitudeNote: state.altitudeNote || undefined,
    },
    days: visibleDays().map((d, i) => ({
      data: {
        title: d.title,
        titleEn: d.titleEn,
        lede: d.lede,
        tone: { accent: d.accent, from: d.from, to: d.to },
        driveKm: num(d.driveKm) ?? 0,
        fromBase: d.fromBase,
        toBase: d.toBase,
        spotlightCountry: d.spotlightCountry,
        cover: d.coverSrc.trim() ? { src: photoSrc(d.coverSrc.trim(), i), alt: d.coverAlt || d.title } : undefined,
        stops: d.stops.map((s, j) => ({
          id: ids[i][j],
          name: s.name,
          nameEn: s.nameEn,
          coords: [num(s.lng), num(s.lat)],
          approx: s.approx,
          time: s.time.trim() || undefined,
          elevation: num(s.elevation),
          kind: s.kind,
          camera: { zoom: num(s.zoom) ?? 13, pitch: num(s.pitch) ?? 0, bearing: num(s.bearing) ?? 0 },
          note: s.note,
          photos: s.photos
            .split('\n')
            .map((l) => l.split('|').map((x) => x.trim()))
            .filter(([src]) => src)
            .map(([src, alt, caption]) => ({ src: photoSrc(src, i), alt: alt || s.name, ...(caption && { caption }) })),
        })),
      },
      body: d.body,
    })),
    local: {
      source: state.source.trim() || undefined,
      hotel: num(state.hotelLng) != null && num(state.hotelLat) != null ? [num(state.hotelLng), num(state.hotelLat)] : undefined,
    },
  };
}

/** 서버 오류 경로(payload 기준) → 폼 입력칸 data-k */
function fieldKey(path: string): string {
  const p = path.split('.');
  if (p[0] === 'slug') return 'slug';
  if (p[0] === 'trip') {
    if (p[1] === 'base') return 'baseLng'; // 좌표 두 칸은 경도 칸 하나로 묶어 표시
    if (p[1] === 'tracks') return p[2] === 'bbox' ? 'bbox' : 'skipDays';
    return p[1] ?? 'title';
  }
  if (p[0] === 'days') {
    const d = `days.${p[1]}`;
    if (p[2] === 'tone') return `${d}.${p[3] ?? 'accent'}`;
    if (p[2] === 'cover') return `${d}.${p[3] === 'alt' ? 'coverAlt' : 'coverSrc'}`;
    if (p[2] === 'stops' && p[3] != null) {
      const s = `${d}.stops.${p[3]}`;
      if (p[4] === 'coords') return `${s}.lng`;
      if (p[4] === 'camera') return `${s}.${p[5] ?? 'zoom'}`;
      if (p[4] === 'photos') return `${s}.photos`;
      return p[4] ? `${s}.${p[4]}` : s;
    }
    return p[2] && p[2] !== 'day' && p[2] !== 'date' ? `${d}.${p[2]}` : d;
  }
  return path;
}
function fieldLabel(k: string) {
  const el = document.querySelector(`[data-f="${k}"]`);
  const own = el?.querySelector(':scope > span')?.textContent?.replace('*', '').trim();
  const m = k.match(/^days\.(\d+)(?:\.stops\.(\d+))?/);
  const where = m ? `Day ${pad2(+m[1] + 1)}${m[2] != null ? ` · 장소 ${+m[2] + 1}` : ''}` : '여행 정보';
  return own ? `${where} · ${own}` : where;
}

function showIssues(all: { path: string; message: string }[]) {
  const box = document.getElementById('issues')!;
  // 경도·위도처럼 같은 칸으로 모이는 같은 오류는 한 번만
  const seen = new Set<string>();
  const issues = all
    .map((x) => ({ ...x, k: fieldKey(x.path) }))
    .filter((x) => !seen.has(x.k + x.message) && seen.add(x.k + x.message));
  document.querySelectorAll('.has-issue').forEach((el) => el.classList.remove('has-issue'));
  document.querySelectorAll('.ed-issue').forEach((el) => el.remove());
  const items = issues.map((x) => {
    const k = x.k;
    const el = document.querySelector(`[data-f="${k}"]`) ?? document.querySelector(`[data-k="${k}"]`);
    el?.classList.add('has-issue');
    if (el && !el.querySelector('.ed-issue')) el.insertAdjacentHTML('beforeend', `<span class="ed-issue">${esc(x.message)}</span>`);
    return `<li><a href="#" data-goto="${esc(k)}">${esc(fieldLabel(k))}</a> — ${esc(x.message)}</li>`;
  });
  box.innerHTML = `<h2>고칠 곳 ${issues.length}개</h2><ul>${items.join('')}</ul>`;
  box.hidden = false;
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
document.getElementById('issues')!.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest<HTMLElement>('[data-goto]');
  if (!a) return;
  e.preventDefault();
  const el = document.querySelector<HTMLElement>(`[data-f="${a.dataset.goto}"]`);
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el?.querySelector<HTMLElement>('input, textarea, select')?.focus({ preventScroll: true });
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = payload();
  const btn = document.getElementById('submit') as HTMLButtonElement;
  const status = document.getElementById('status')!;
  btn.disabled = true;
  status.textContent = '검증하고 저장하는 중…';
  try {
    const res = await fetch('/api/admin/trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (res.status === 422) {
      status.textContent = '';
      showIssues(json.issues);
      return;
    }
    if (!res.ok) throw new Error(json.error ?? res.statusText);
    showDone(json.slug, json.files);
    // 저장된 여행은 초안에서 지운다 (메모리 상태도 비워 이후 입력이 옛 초안을 되살리지 않게)
    clearTimeout(saveTimer);
    state = blankState();
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
  } catch (err) {
    status.textContent = `저장 실패: ${err instanceof Error ? err.message : err}`;
  } finally {
    btn.disabled = false;
  }
});

function showDone(slug: string, files: string[]) {
  form.hidden = true;
  document.getElementById('issues')!.hidden = true;
  const done = document.getElementById('done')!;
  const t = `-- --trip ${slug}`;
  done.innerHTML = `
    <h2>「${esc(state.title)}」 여행을 만들었다</h2>
    <ul>${files.map((f) => `<li><code>${esc(f)}</code></li>`).join('')}</ul>
    <p><a class="btn primary" href="/trips/${esc(slug)}/" target="_blank">여행 페이지 보기 ↗</a>
       <a class="btn" href="/admin">여행 목록</a> <a class="btn" href="/admin/new">새 여행 하나 더</a></p>
    <h3>사이트에 올리려면</h3>
    <ol>
      <li><code>pnpm photos ${t}</code> — 사진 변환${state.source ? '' : ' (원본 폴더: trips.local.json에 source 추가 또는 --src)'}</li>
      <li><code>pnpm tracks ${t}</code> — 사진 GPS 이동 경로 (선택)</li>
      <li><code>pnpm photos:upload ${t}</code> — R2 업로드</li>
      <li>커밋 → <code>pnpm cf:deploy</code></li>
    </ol>`;
  done.hidden = false;
  done.scrollIntoView({ behavior: 'smooth' });
}

/* ------------------------------------------------------------------ */

const meta: { trips: string[]; geo: string[]; kinds: string[] } = await fetch('/api/admin/meta')
  .then((r) => r.json())
  .catch(() => ({ trips: [], geo: [], kinds: [] }));
// 옛 초안의 잘못된 날짜(직접 타이핑한 "0002-…" 등)는 비운다
for (const k of ['start', 'end'] as const) if (state[k] && !validDate(state[k])) state[k] = '';
syncDays();
renderAll();
