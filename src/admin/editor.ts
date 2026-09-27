// 새 여행 폼 (dev 전용 /admin/new). 상태 객체 하나를 그대로 그리고, 입력칸은 data-k 경로로 상태에 묶는다.
// 날짜 수는 시작일~끝일로 정해지고, 저장하면 /api/admin/trips가 같은 zod 스키마로 검증한다.
// 사진은 작성 중에는 브라우저 메모리에 File 그대로 두고(초안에는 설명만 저장),
// "여행 만들기"를 누르면 검증 → 한 장씩 서버로 보내 변환 → R2 업로드 → md 쓰기 순서로 처리한다.
import { Map as MapLibre, Marker, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

setWorkerUrl('/vendor/maplibre/maplibre-gl-worker.mjs');

/* ------------------------------------------------------------------ */
/* 상태                                                                 */
/* ------------------------------------------------------------------ */

/** 사진 한 장 — 파일 자체는 files(Map)에 id로, 초안(localStorage)에는 이 메타데이터만 */
type PhotoEntry = { id: string; fileName: string; alt: string; caption: string };
type Stop = {
  id: string; name: string; nameEn: string; lng: string; lat: string; approx: boolean; time: string;
  elevation: string; kind: string; zoom: string; pitch: string; bearing: string; note: string;
  photos: PhotoEntry[];
};
type Day = {
  title: string; titleEn: string; lede: string; accent: string; from: string; to: string; driveKm: string;
  fromBase: boolean; toBase: boolean; spotlightCountry: boolean; cover: PhotoEntry | null;
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
  zoom: '13', pitch: '40', bearing: '170', note: '', photos: [],
});
const blankDay = (i: number): Day => {
  const [accent, from, to] = PALETTE[i % PALETTE.length];
  return {
    title: '', titleEn: '', lede: '', accent, from, to, driveKm: '', fromBase: i > 0, toBase: true,
    spotlightCountry: false, cover: null, stops: [blankStop()], body: '',
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
    if (raw) {
      const st: State = { ...blankState(), ...JSON.parse(raw) };
      for (const d of st.days as any[]) {
        d.cover ??= null;
        delete d.coverSrc;
        delete d.coverAlt;
        for (const s of d.stops) if (!Array.isArray(s.photos)) s.photos = [];
      }
      return st;
    }
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

/* ------------------------------------------------------------------ */
/* 사진 파일 — 고른 File을 그대로 메모리에 보관                            */
/* ------------------------------------------------------------------ */

const ACCEPT = 'image/jpeg,image/png,image/webp';
/** PhotoEntry.id → 고른 File. 새로고침하면 사라진다 (초안에는 설명만 남고 "다시 선택"으로 표시) */
const files = new Map<string, File>();
/** 미리보기 objectURL (File마다 한 번만 만든다) */
const thumbs = new Map<string, string>();
const thumbOf = (id: string) => {
  const file = files.get(id);
  if (!file) return '';
  if (!thumbs.has(id)) thumbs.set(id, URL.createObjectURL(file));
  return thumbs.get(id)!;
};
function newEntry(file: File): PhotoEntry {
  const id = crypto.randomUUID();
  files.set(id, file);
  return { id, fileName: file.name, alt: '', caption: '' };
}
function forget(entry: PhotoEntry | null) {
  if (!entry) return;
  files.delete(entry.id);
  const url = thumbs.get(entry.id);
  if (url) URL.revokeObjectURL(url);
  thumbs.delete(entry.id);
}
const isImage = (f: File) => ACCEPT.split(',').includes(f.type);
let finished = false;
// 고른 사진이 있으면 페이지를 떠날 때 경고 (파일은 초안에 저장되지 않는다)
addEventListener('beforeunload', (e) => {
  if (files.size && !finished) e.preventDefault();
});

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

/** 사진 카드 한 장 — 미리보기, 파일 이름, 설명·캡션, 순서·삭제 */
function photoCard(path: string, ph: PhotoEntry, tools: string) {
  const url = thumbOf(ph.id);
  const thumb = url
    ? `<img src="${url}" alt="" loading="lazy" decoding="async">`
    : `<label class="ed-photo-missing" title="새로고침하면 파일이 사라진다">파일 다시 선택<input type="file" accept="${ACCEPT}" data-photo-reattach="${ph.id}" hidden></label>`;
  return `
  <div class="ed-photo${url ? '' : ' missing'}" data-f="${path}">
    <div class="ed-photo-thumb">${thumb}</div>
    <div class="ed-photo-meta">
      <small title="${esc(ph.fileName)}">${esc(ph.fileName)}</small>
      <input data-k="${path}.alt" value="${esc(ph.alt)}" placeholder="설명 (비우면 기본값)">
      <input data-k="${path}.caption" value="${esc(ph.caption)}" placeholder="캡션 (선택)">
    </div>
    <div class="ed-photo-tools">${tools}</div>
  </div>`;
}
const photoInput = (attr: string, multiple: boolean) =>
  `<input type="file" accept="${ACCEPT}"${multiple ? ' multiple' : ''} ${attr} hidden>`;

function photosField(i: number, j: number) {
  const p = `days.${i}.stops.${j}.photos`;
  const list = state.days[i].stops[j].photos;
  const cards = list.map((ph, k) =>
    photoCard(
      `${p}.${k}`,
      ph,
      `<button type="button" class="btn" data-act="photo-move" data-path="${p}" data-k="${k}" data-d="-1" ${k === 0 ? 'disabled' : ''} title="앞으로">←</button>
       <button type="button" class="btn" data-act="photo-move" data-path="${p}" data-k="${k}" data-d="1" ${k === list.length - 1 ? 'disabled' : ''} title="뒤로">→</button>
       <button type="button" class="btn" data-act="photo-del" data-path="${p}" data-k="${k}" title="빼기">✕</button>`,
    ),
  );
  return `
  <div class="ed-field wide" data-f="${p}">
    <span>사진 <em class="inline">${list.length}장 · 장소 카드에는 앞의 3장 · 설명을 비우면 장소 이름</em></span>
    <div class="ed-photos" data-drop="${p}">
      ${cards.join('')}
      <label class="ed-photo-add">${photoInput(`data-photo-add="${p}"`, true)}<b>+</b><span>사진 추가<br><small>여러 장 · 끌어다 놓기</small></span></label>
    </div>
  </div>`;
}

/** 날짜 표지 사진 한 장 */
function coverField(i: number) {
  const p = `days.${i}.cover`;
  const cover = state.days[i].cover;
  const body = cover
    ? photoCard(p, cover, `<button type="button" class="btn" data-act="cover-del" data-i="${i}" title="빼기">✕</button>`)
    : `<label class="ed-photo-add">${photoInput(`data-cover-add="${i}"`, false)}<b>+</b><span>표지 사진<br><small>한 장 · 끌어다 놓기</small></span></label>`;
  return `
  <div class="ed-field wide" data-f="${p}">
    <span>표지 사진 <em class="inline">타이틀 카드 배경 · 설명을 비우면 날짜 제목</em></span>
    <div class="ed-photos" data-drop="${p}">${body}</div>
  </div>`;
}

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
      ${photosField(i, j)}
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
          ${coverField(i)}
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

/** 고른 파일을 사진 목록(…photos) 또는 표지(…cover)에 넣는다 */
function addFiles(target: string, list: FileList | File[]) {
  const picked = [...list].filter(isImage);
  const skipped = [...list].length - picked.length;
  if (skipped) alert(`${skipped}개는 JPEG·PNG·WebP가 아니라 뺐다 (HEIC는 휴대폰에서 JPEG로 바꿔 올린다)`);
  if (!picked.length) return;
  if (target.endsWith('.cover')) {
    const day = state.days[+target.split('.')[1]];
    forget(day.cover);
    day.cover = newEntry(picked[0]);
  } else {
    (getAt(target) as PhotoEntry[]).push(...picked.map(newEntry));
  }
  saveDraft();
  renderDays();
}

form.addEventListener('change', (e) => {
  const input = e.target as HTMLInputElement;
  if (input.type !== 'file') return;
  const { photoAdd, coverAdd, photoReattach } = input.dataset;
  if (photoAdd) addFiles(photoAdd, input.files!);
  else if (coverAdd) addFiles(`days.${coverAdd}.cover`, input.files!);
  else if (photoReattach && input.files?.[0] && isImage(input.files[0])) {
    files.set(photoReattach, input.files[0]);
    renderDays();
  }
});

form.addEventListener('dragover', (e) => {
  const zone = (e.target as HTMLElement).closest<HTMLElement>('[data-drop]');
  if (!zone || !e.dataTransfer?.types.includes('Files')) return;
  e.preventDefault();
  zone.classList.add('dropping');
});
form.addEventListener('dragleave', (e) => (e.target as HTMLElement).closest('[data-drop]')?.classList.remove('dropping'));
form.addEventListener('drop', (e) => {
  const zone = (e.target as HTMLElement).closest<HTMLElement>('[data-drop]');
  if (!zone || !e.dataTransfer?.files.length) return;
  e.preventDefault();
  zone.classList.remove('dropping');
  addFiles(zone.dataset.drop!, e.dataTransfer.files);
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
    case 'photo-move': {
      const list = getAt(btn.dataset.path!) as PhotoEntry[];
      const a = +btn.dataset.k!;
      const b = a + +btn.dataset.d!;
      [list[a], list[b]] = [list[b], list[a]];
      break;
    }
    case 'photo-del': {
      const list = getAt(btn.dataset.path!) as PhotoEntry[];
      forget(list.splice(+btn.dataset.k!, 1)[0]);
      break;
    }
    case 'cover-del':
      forget(state.days[+i!].cover);
      state.days[+i!].cover = null;
      break;
    case 'clear-draft':
      if (!confirm('입력한 초안을 모두 지울까요? (고른 사진도 빠진다)')) return;
      for (const d of state.days) [d.cover, ...d.stops.flatMap((s) => s.photos)].forEach(forget);
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
/**
 * 사진 경로 /photos/<slug>/dayXX/<이름>.jpg — 이름은 원본 파일 이름(확장자 빼고, 영문·숫자·_- 만).
 * 같은 날 안에서 이름이 겹치면 -2, -3… 을 붙이고, 같은 파일을 두 번 쓰면(표지 + 장소) 한 번만 올린다.
 */
function photoSrcs(): Map<string, string> {
  const out = new Map<string, string>();
  visibleDays().forEach((d, i) => {
    const byFile = new Map<string, string>();
    const used = new Set<string>();
    for (const ph of [d.cover, ...d.stops.flatMap((s) => s.photos)]) {
      if (!ph) continue;
      const f = files.get(ph.id);
      const same = f ? `${f.name}|${f.size}|${f.lastModified}` : ph.id;
      let src = byFile.get(same);
      if (!src) {
        const stem = ph.fileName.replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'photo';
        let name = stem;
        for (let n = 2; used.has(name); n++) name = `${stem}-${n}`;
        used.add(name);
        src = `/photos/${state.slug.trim()}/day${pad2(i + 1)}/${name}.jpg`;
        byFile.set(same, src);
      }
      out.set(ph.id, src);
    }
  });
  return out;
}

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

function payload(srcs: Map<string, string>) {
  const ids = stopIds();
  const photo = (ph: PhotoEntry, fallbackAlt: string) => ({
    src: srcs.get(ph.id)!,
    alt: ph.alt.trim() || fallbackAlt,
    ...(ph.caption.trim() && { caption: ph.caption.trim() }),
  });
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
        cover: d.cover ? photo(d.cover, d.title) : undefined,
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
          photos: s.photos.map((ph) => photo(ph, s.name)),
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
    if (p[2] === 'cover') return `${d}.cover`;
    if (p[2] === 'stops' && p[3] != null) {
      const s = `${d}.stops.${p[3]}`;
      if (p[4] === 'coords') return `${s}.lng`;
      if (p[4] === 'camera') return `${s}.${p[5] ?? 'zoom'}`;
      if (p[4] === 'photos') return p[5] != null ? `${s}.photos.${p[5]}` : `${s}.photos`;
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
  const ph = k.match(/\.photos\.(\d+)$/);
  const where = m
    ? `Day ${pad2(+m[1] + 1)}${m[2] != null ? ` · 장소 ${+m[2] + 1}` : ''}${ph ? ` · 사진 ${+ph[1] + 1}` : k.endsWith('.cover') ? ' · 표지 사진' : ''}`
    : '여행 정보';
  if (ph || k.endsWith('.cover')) return where;
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

const api = async (url: string, init: RequestInit) => {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({ error: res.statusText }));
  return { res, json };
};
/** 이번 페이지에서 이미 서버로 보낸 사진 (src|파일) — R2 실패 후 다시 누를 때 건너뛴다 */
const sent = new Set<string>();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('submit') as HTMLButtonElement;
  const status = document.getElementById('status')!;
  const say = (t: string) => (status.textContent = t);
  const fail = (issues: { path: string; message: string }[]) => {
    say('');
    showIssues(issues);
  };
  const srcs = photoSrcs();
  const body = payload(srcs);
  btn.disabled = true;
  try {
    // 1) 검증 — 사진을 올리기 전에 입력 오류부터
    say('검증하는 중…');
    let r = await api('/api/admin/trips?dryRun=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.res.status === 422) return fail(r.json.issues);
    if (!r.res.ok) throw new Error(r.json.error);

    // 2) 파일이 없는 사진 (새로고침으로 사라진 것)
    const entries = visibleDays().flatMap((d, i) => [
      ...(d.cover ? [{ path: `days.${i}.cover`, ph: d.cover }] : []),
      ...d.stops.flatMap((s, j) => s.photos.map((ph, k) => ({ path: `days.${i}.stops.${j}.photos.${k}`, ph }))),
    ]);
    const lost = entries.filter((x) => !files.has(x.ph.id));
    if (lost.length) return fail(lost.map((x) => ({ path: x.path, message: '파일이 없다 — 다시 선택하세요' })));

    // 3) 사진을 한 장씩 서버로 — 변환(2400px JPEG + 1200px WebP, EXIF 제거)
    const uploads = new Map<string, { file: File; path: string }>();
    for (const x of entries) {
      const src = srcs.get(x.ph.id)!;
      if (!uploads.has(src)) uploads.set(src, { file: files.get(x.ph.id)!, path: x.path });
    }
    let n = 0;
    for (const [src, { file, path }] of uploads) {
      n++;
      const key = `${src}|${file.name}|${file.size}|${file.lastModified}`;
      if (sent.has(key)) continue;
      say(`사진 변환 중 ${n} / ${uploads.size} — ${file.name}`);
      const p = await api(`/api/admin${src.replace(/\.jpg$/, '')}`, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'image/jpeg' },
        body: file,
      });
      if (!p.res.ok) return fail([{ path, message: p.json.error ?? '사진을 올리지 못했다' }]);
      sent.add(key);
    }

    // 4) R2 업로드 + 파일 쓰기
    // 파일을 쓰면 dev 서버가 열린 페이지를 모두 새로고침한다 → 무엇을 저장 중이었는지 남겨 두고, 떠날 때 경고도 끈다
    // (사진은 이미 서버에 있으므로 새로고침돼도 잃는 것이 없다)
    finished = true;
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify({ slug: body.slug, title: state.title, at: Date.now() }));
    } catch {}
    say(uploads.size ? `R2 버킷에 사진 ${uploads.size}장 올리는 중… (몇십 초 걸릴 수 있다)` : '파일 쓰는 중…');
    r = await api('/api/admin/trips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.res.ok) {
      finished = false;
      clearPending();
      if (r.res.status === 422) return fail(r.json.issues);
      throw new Error(r.json.error ?? r.res.statusText);
    }
    complete(r.json.slug, state.title, r.json.files, `${r.json.photos}장 — R2 ${r.json.r2.bucket}에 변환본 ${r.json.r2.uploaded}개 새로 올림`);
  } catch (err) {
    say(`저장 실패: ${err instanceof Error ? err.message : err}`);
  } finally {
    btn.disabled = false;
  }
});

const PENDING_KEY = 'tour-record:admin:saving';
const clearPending = () => {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {}
};

/**
 * 저장 끝: 완료 화면 + 초안 지우기 (메모리 상태도 비워 이후 입력이 옛 초안을 되살리지 않게).
 * 저장 표시(PENDING_KEY)는 남겨 둔다 — 파일마다 새로고침이 한 번씩 더 올 수 있어서, 완료 화면의 버튼을 누르거나 5분이 지나면 지운다
 */
function complete(slug: string, title: string, written: string[], photos: string) {
  clearTimeout(saveTimer);
  state = blankState();
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {}
  showDone(slug, title, written, photos);
}

function showDone(slug: string, title: string, written: string[], photos: string) {
  form.hidden = true;
  document.getElementById('issues')!.hidden = true;
  const done = document.getElementById('done')!;
  const t = `-- --trip ${slug}`;
  done.innerHTML = `
    <h2>「${esc(title)}」 여행을 만들었다</h2>
    <ul>${written.map((f) => `<li><code>${esc(f)}</code></li>`).join('')}</ul>
    ${photos ? `<p>사진 ${esc(photos)}</p>` : ''}
    <p><a class="btn primary" href="/trips/${esc(slug)}/" target="_blank">여행 페이지 보기 ↗</a>
       <a class="btn" href="/admin" data-leave>여행 목록</a> <a class="btn" href="/admin/new" data-leave>새 여행 하나 더</a></p>
    <h3>사이트에 올리려면</h3>
    <ol>
      <li><code>pnpm tracks ${t}</code> — 원본 사진 GPS로 이동 경로 (선택, 원본 폴더 필요)</li>
      <li>커밋 → <code>pnpm cf:deploy</code></li>
    </ol>`;
  done.hidden = false;
  done.scrollIntoView({ behavior: 'smooth' });
  done.querySelectorAll('[data-leave]').forEach((a) => a.addEventListener('click', clearPending));
}

/* ------------------------------------------------------------------ */

const meta: { trips: string[]; geo: string[]; kinds: string[] } = await fetch('/api/admin/meta')
  .then((r) => r.json())
  .catch(() => ({ trips: [], geo: [], kinds: [] }));
// 저장 도중 새로고침됐으면(파일을 쓰면 dev 서버가 페이지를 새로고침한다) 결과를 확인해 완료 화면으로
const pending = (() => {
  try {
    const p = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? 'null') as { slug: string; title: string; at: number } | null;
    return p && Date.now() - p.at < 5 * 60_000 ? p : null;
  } catch {
    return null;
  }
})();
if (!pending) clearPending();
else {
  const r = await api(`/api/admin/trips/${pending.slug}`, { method: 'GET' });
  if (r.res.ok) complete(r.json.slug, pending.title, r.json.files, r.json.photos ? `${r.json.photos}장 — R2 업로드 완료` : '');
  else clearPending(); // 저장이 끝나지 않았다 — 초안으로 이어서 (사진은 다시 선택)
}

// 옛 초안의 잘못된 날짜(직접 타이핑한 "0002-…" 등)는 비운다
for (const k of ['start', 'end'] as const) if (state[k] && !validDate(state[k])) state[k] = '';
syncDays();
renderAll();
