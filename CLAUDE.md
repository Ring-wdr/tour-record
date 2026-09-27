# 여행 기록 사이트

다녀온 여행들을 시네마틱 + 매거진 + 여행 일기 톤의 인터랙티브 웹페이지로 만든다. 여행: 카자흐스탄 알마티(2026.09.11–09.17), 일본 사가(2026.08.19–08.21), 대만 타이베이(2026.09.02–09.05), 강원 영월·태백(2026.08.05–08.07).
`/` = 여행 목록, `/trips/<slug>/` = 여행 하나의 스크롤리텔링 페이지. 모든 여행의 섹션 구성은 같다.
포트폴리오용 전체 공개. 인터랙션을 위해 분위기를 일부 희생하는 것은 허용된다.

## 스택
- Astro 7 (정적 빌드, `output: 'static'`). 여행 페이지는 `src/pages/trips/[slug]/index.astro` 하나가 `getStaticPaths`로 여행마다 생성. 여행 추가 = 재빌드·재배포
- MapLibre GL 6 + OpenFreeMap `dark` 스타일 (키 없음) + AWS terrarium DEM (3D 지형/음영)
- PhotoSwipe 5 (라이트박스), sharp (빌드 시 사진 크기 측정)
- 배포: Cloudflare Workers Static Assets (`wrangler.jsonc`) + R2(`tour-record-photos`, 키 = URL 경로). `worker/index.ts`가 `/photos/*`만 R2에서 서빙하고 나머지는 정적 에셋. 사진은 `public/.assetsignore`로 정적 에셋에서 제외. `pnpm cf:preview`(로컬 확인) → `pnpm cf:deploy`. `pnpm deploy`는 pnpm 내장 명령과 겹치므로 쓰지 않는다
- 관리자 화면 `/admin`(목록), `/admin/new`(새 여행 만들기): **`astro dev`에서만 존재.** `integrations/admin`이 dev일 때만 라우트를 주입하고 API는 Vite 미들웨어라 운영 빌드에 없다. 빌드 후 `dist/admin`·`dist/api`가 있으면 빌드 실패
- 패키지 매니저: pnpm. 타입 검사: `pnpm check` (astro check — TypeScript 6 고정, 7은 아직 미지원)

## 구조
- `src/content/trips/<slug>/` — **여행 1개 = 폴더 1개, 모든 콘텐츠의 원천.** 폴더 이름이 URL slug
  - `trip.yaml` — 제목·기간·나라·공개 숙소 좌표(`base`)·표지 날(`heroDay`)·스포트라이트 국경(`spotlight`). `draft: true`면 `astro dev`에서만 보이고 운영 빌드(`getTrips`)와 `pnpm photos:upload`에서 빠진다 → 공개할 때 지우고 업로드·배포
  - `days/dayXX.md` — frontmatter = 날짜 색(`tone`)·장소(stops)·좌표·카메라·사진, 본문 = 그날의 일기
  - `photos.json`(`pnpm photos`), `tracks.json`(`pnpm tracks`) — 생성 파일, 커밋함
- `src/schemas/trip.ts` — zod 스키마(`astro/zod`). content collection과 관리자 API가 같이 쓴다. 파일 하나로 확인되는 규칙은 여기
- `src/schemas/check.ts` — `tripIssues`: 여러 파일에 걸친 규칙(dayXX = day, 날짜 연속, 장소 id 중복, 사진 경로 등). astro:content에 의존하지 않아 빌드와 관리자 API가 같이 쓴다
- `src/content.config.ts` — `trips`(id = slug), `days`(id = `<slug>/dayXX`) 컬렉션
- `src/lib/trip.ts` — `getTrips()`(여행 + 날짜 + 경로 + 국경), `checkTrip`(`tripIssues`를 어기면 빌드 실패), 통계, 사진 해석(`resolvePhoto`)
- `src/lib/site.ts` — 사이트 전체 정보(제목, 작성자)
- `src/data/geo/<나라>.json` — 스포트라이트용 국경 (여러 여행이 공유)
- `src/components/DayChapter.astro` — 하루 = 타이틀 카드(불투명) → 장소 스텝(투명, 뒤에 고정 지도) → 일기 스프레드(종이)
- `src/scripts/story.ts` — IntersectionObserver로 스텝 진입 시 지도 `flyTo`/`fitBounds`, 경로 그리기 애니메이션, 레일/진행바
- `src/pages/index.astro` — 여행 목록 (`TripEntry` + `RouteGlyph`: 경로를 날짜 색 선으로 그린 SVG)
- 목록 ↔ 여행 페이지 전환: 문서 간 View Transition(`global.css`의 `@view-transition`). `Base.astro` head의 인라인 스크립트가 `pageswap`/`pagereveal`에서 누른 표지(`[data-vt-cover]`)와 여행 첫 화면(`#trip-hero`)에만 `trip-cover` 이름을 붙인다. 이름 붙일 요소가 첫 렌더 전에 파싱되도록 각 페이지가 `<link rel="expect" blocking="render">`를 head 슬롯에 넣는다. 표지에서 들어오면 `html.vt-from-list` → Hero의 켄번스·레터박스 연출 생략. 미지원 브라우저(Firefox)는 일반 이동
- `integrations/admin/` — 관리자 통합: `index.ts`(dev 전용 라우트·미들웨어·빌드 검사), `api.ts`(검증 `POST /trips?dryRun=1` → 사진 한 장씩 `PUT /photos/<slug>/dayXX/<이름>`(변환) → `POST /trips`(photos.json·og.jpg → R2 업로드 → 성공하면 trip.yaml·dayXX.md 쓰기), 로컬 설정은 trips.local.json), `serialize.ts`(기존 파일과 같은 YAML 모양)
- `src/admin/` — 관리자 페이지(`pages/`)와 폼(`editor.ts`: 상태 객체 → 폼, 입력칸 `data-k` = 상태 경로, 초안은 localStorage, 지도 클릭으로 좌표 입력). 사진은 고른 `File`을 메모리 Map에 그대로 두고 초안에는 설명과 EXIF 요약(촬영 UTC 시각·GPS·고도)만 저장 → 새로고침하면 "파일 다시 선택". 장소에 사진을 넣으면 브라우저에서 EXIF(`exifr`)를 읽어 **빈** 좌표(GPS 중앙값)·시각(가장 이른 사진, `OffsetTimeOriginal` 반영, 다음 날 06시 전은 `+1`)·고도(GPS 중앙값)를 채운다. 그 날짜가 아닌 사진은 "다른 날"로 표시하고 계산에서 뺀다
- `scripts/lib/photo.mjs`(변환: 2400px JPEG + 1200px WebP, EXIF 제거) · `scripts/lib/r2.mjs`(R2 업로드) — CLI(`pnpm photos`, `photos:upload`)와 관리자가 같이 쓴다
- `scripts/copy-maplibre-worker.mjs` — MapLibre 6 워커를 `public/vendor/`로 복사 (predev/prebuild에서 자동 실행)

## 규칙
- 관리자에서 "여행 만들기"를 누르면 사진이 **원격 R2 버킷에 바로 올라간다.** R2 업로드가 실패하면 md는 쓰지 않는다(다시 누르면 이어서). md를 쓰는 순간 dev 서버가 페이지를 새로고침하므로, 완료 화면은 sessionStorage 표시로 새로고침 뒤에 다시 그린다
- 관리자 화면은 **새 여행 만들기만** 한다. 기존 여행 수정은 여행 폴더의 파일을 직접 고친다
- `astro.config.mjs`나 `integrations/`를 고쳐 dev 서버가 스스로 재시작하면, 그 뒤로 콘텐츠 변경(새 여행 폴더·md 수정)을 감지하지 못한다(Astro 7.3 dev 서버 동작). 이럴 땐 dev 서버를 껐다 켠다
- 좌표는 `[경도, 위도]`. 확인되지 않은 좌표는 `approx: true` (개발 서버에서 "좌표 대략치" 배지로 보임)
- 컴포넌트는 전역 상수 대신 `trip`/`day`를 prop으로 받는다. 특정 여행에만 맞는 문구·값을 컴포넌트에 하드코딩하지 않는다 (→ trip.yaml / dayXX.md)
- 알마티 7일차 개요는 `spotlightCountry`로 카자흐스탄 국경(`src/data/geo/kazakhstan.json`, Natural Earth 1:50m) 밖을 어둡게 가린다
- 3D 지형은 `kind: nature` 장소와 하루 개요에서만 켠다. 시내(식당·박물관 등)는 산 바로 아래라 지형을 켜면 카메라 앞 지면이 솟아 장소를 가린다 → 평면 + 음영만. 시내 장소 카메라는 남쪽(bearing 160~180)을 보게 해 산을 배경으로 둔다
- 지도 카메라 이동에 `padding` 대신 `offset`을 쓴다 — flyTo의 padding은 지도에 남아 fitBounds와 겹치면 NaN 오류가 난다
- 사진 파일이 없으면 날짜 색 그라디언트 플레이스홀더가 자동으로 렌더링된다
- 공개 이미지에서는 EXIF GPS를 제거한다
- **숙소 실제 좌표는 공개하지 않는다.** 실제 좌표는 git 제외 파일 `trips.local.json`(여행별 `zones`)에만 두고, `pnpm tracks`가 그 반경 700m 안의 GPS 점을 잘라낸다. 사이트에 표시되는 숙소 좌표(trip.yaml `base`, day01 hotel)는 알마티 시내 중심
- 디자인 토큰은 `src/styles/global.css`의 `:root`. 폰트: Fraunces(영문 디스플레이), Noto Serif KR(본문/제목), Pretendard(UI), JetBrains Mono(데이터), Nanum Pen Script(손글씨 메모)
- `prefers-reduced-motion`을 존중한다

## 사진
- 원본: `D:\archive\Camera_202609` (Galaxy S26 Ultra, 파일명 = 현지 촬영 시각 `YYYYMMDD_HHMMSS[_NNN].jpg`, 97%가 EXIF GPS 보유)
- 주의: 파일명 시각은 휴대폰 시간대 기준이다. 착륙 직전 사진(`20260912_0112*`)처럼 한국 시간(+09:00)이 남은 사진이 있으므로 시각 계산에는 EXIF `OffsetTimeOriginal`을 반영한다 (01:12 KST = 9/11 21:12 알마티)
- 동행자(초록색 옷)가 나온 사진은 쓰지 않는다. 본인은 푸른 체크셔츠, 침블락에서는 흰 점퍼
- 장소 좌표·시각은 사진 EXIF GPS의 중앙값. 고도는 공식/문헌 값이 있는 곳은 그 값(빅 알마티 호수 2,511 · 메데우 1,691 · 탈가르 패스 3,200 · 콕토베 1,100 · 콜사이 1호 1,818 · 카인디 2,000), 없는 곳은 GPS 중앙값
- 문구에 "톈산" 지명은 쓰지 않는다
- `trips.local.json`(git 제외) = 여행별 로컬 설정: `{ "<slug>": { "source": 원본 사진 폴더, "zones": 프라이버시 구역 } }`. 파이프라인 스크립트는 `scripts/lib/trips.mjs`로 여행 폴더와 이 파일을 읽는다
- 파이프라인 스크립트(`photos`, `tracks`, `photos:upload`)는 인자가 없으면 모든 여행, `-- --trip <slug>`면 그 여행만
- 사진 선정은 dayXX.md의 `photos`/`cover`가 기준. 경로는 `/photos/<slug>/dayXX/<원본파일명>.jpg` (checkTrip이 확인). R2 키 = URL 경로에서 앞의 `/`만 뺀 것
- `pnpm photos` → md에 적힌 사진만 원본에서 찾아 `public/photos/<slug>/dayXX/`에 `<이름>.jpg`(2400px, 라이트박스) + `<이름>-md.webp`(1200px, 카드)로 변환, EXIF 전부 제거
- 변환된 사진은 git에 넣지 않는다 (`.gitignore`). 사진 크기는 여행 폴더의 `photos.json`(커밋됨)에 있어 사진 파일 없이도 빌드된다
- 새 여행의 사진은 관리자 화면에서 파일로 올린다(변환·EXIF 제거·R2까지 한 번에, 파일 이름은 원본 이름에서 영문·숫자·`_-`만). 원본 폴더에서 md 경로로 고르는 방식(`pnpm photos`)은 기존 여행용
- 사진 추가/변경 순서: dayXX.md 수정 → `pnpm photos` → `pnpm photos:upload`(바뀐 파일만 R2에 업로드) → `pnpm cf:deploy`
- 로컬에서 R2까지 확인: `pnpm photos:upload -- --local` → `pnpm cf:preview`
- 링크 미리보기 `/photos/<slug>/og.jpg`(1200×630)는 `pnpm photos`가 trip.yaml `heroDay`의 표지(첫 화면 사진)로 만든다. `/`는 가장 최근 여행의 것을 쓴다
- trip.yaml `tracks.maxAltitude`: GPS 고도가 이보다 높은 점(착륙 직전 기내 사진) 제외. `tracks.dayStartHour`: 현지 그 시각 전 사진은 전날 경로(자정 넘어 도착한 첫날). 사진 궤적이 있는 날도 맨 앞·맨 뒤의 `kind: flight` 장소는 경로선에 이어 붙는다
- `pnpm tracks` → 원본 사진 전체의 GPS를 실제 시각(EXIF 오프셋 반영) 순으로 이어 날짜별 경로(`tracks.json`) 생성, 시속 180km 초과 점은 GPS 오류로 제외. 날짜 구분은 trip.yaml `utcOffset`, `tracks.skipDays`(알마티 1일차 = 비행)는 장소를 잇는 선, `tracks.bbox` 밖 점은 버림
- `.scratch/` (git 제외)에 EXIF 스캔(`scan.json`)·밀착 인화 스크립트가 있다: `node .scratch/sheet.mjs <날짜> <시작> <끝> <이름> [최대장수]`

## 확인이 필요한 데이터 (TODO)
- 사가·타이베이: 일기 본문과 장소 설명은 사진만 보고 쓴 초안 (알마티와 달리 본인 메모 없음) → 직접 고쳐 쓰기. 가게 이름(다라 라멘집, 가시마 케이크 가게, 다케오 라멘집, 루러우판 집) 미확인. 사람이 나온 사진(도리이 앞 인물, 지우펀 홍등 앞 인물)은 뺐음
- 사가·타이베이 고도: GPS 고도는 타원체 기준이라 지오이드만큼 높게 나온다(규슈 약 +31m, 대만 약 +20m) → 공식 값(공항 등)이 없는 곳은 GPS 중앙값에서 빼서 적음. 평지 시내 장소는 고도 생략
- 개발 서버가 이미 떠 있을 때(다른 세션) 하나 더 띄우려면 `.claude/launch.json`의 `dev-4322`(`astro dev --ignore-lock`)
- 영월·태백: 본인 메모 없이 사진 + 영화 『왕과 사는 남자』 연관으로 쓴 초안. 관광택시 '한반도지형권역'이 어디부터 어디까지였는지(지금은 청령포~한반도지형으로 씀), 태백 시내 전망타워 이름 미확인. 숙소 zones(trips.local.json)는 밤·아침 사진 위치로 추정한 값 → 실제 숙소로 고치고 `pnpm tracks -- --trip yeongwol-taebaek-2026`.
- 식당 이름(Smile·Navat 외), 카투타우 식별(사진상 붉은 화산암 지대)
- 4일차 Navat 아점·아르바트 거리는 일기에만 있고 지도 장소로는 아직 없음 (사진 09:30~10:50, 12:20~14:00 묶음)
- `driveKm`은 사진 GPS 직선거리 × 1.25 추정치
- 배포 주소: https://tour-record.akswnd55.workers.dev (커스텀 도메인을 붙이면 `astro.config.mjs`의 `site`, `worker/legacy-redirect.ts`의 TARGET도 교체)
- 옛 주소 https://almaty-2026.akswnd55.workers.dev 는 `worker/legacy-redirect.ts`(`wrangler.legacy.jsonc`, `pnpm cf:deploy:legacy`)가 새 주소로 301. 옛 버킷 `almaty-2026-photos`는 더 이상 쓰지 않음(삭제 전 보관 중)
- 영상 115개(mp4)는 아직 사용하지 않음

## 로드맵 — 여러 여행
1. ~~여행 단위 폴더 + `/trips/[slug]/` 라우트 + 스키마/교차 검증~~
2. ~~파이프라인 스크립트 `--trip <slug>`, 사진 URL·R2 키에 slug 접두사(`/photos/<slug>/dayXX/...`), 여행별 OG 이미지~~
3. ~~Cloudflare 이전: Worker `tour-record`, R2 `tour-record-photos`, 옛 주소는 301 리다이렉트 Worker~~
4. ~~메인 목록 페이지 (`src/pages/index.astro` + `TripEntry`·`RouteGlyph`: 여행별 표지·통계·경로 선 그림)~~
5. ~~관리자(create) 화면 — Astro 통합으로 `astro dev`에서만 라우트/API 주입, 운영 빌드에는 없음. 폼 → md 파일 저장~~
6. ~~관리자: 사진 파일 업로드 → 변환 → R2~~
7. ~~관리자: 사진 EXIF 시각·GPS로 장소 좌표·시각·고도 자동 채우기~~
8. 관리자: 기존 여행 수정, "발행" 버튼(deploy), 사진 GPS로 이동 경로(tracks.json)까지 만들기

## 로드맵 — 알마티
1. ~~스키마 + 더미 데이터 + 스크롤 지도 초안~~
2. ~~사진 분류(EXIF 시각/GPS) + 장소 재구성 + 웹용 변환~~
3. ~~실제 이동 경로: 사진 GPS 궤적 (`pnpm tracks` → 여행 폴더의 `tracks.json`)~~ — 사진이 드문 구간(야간 귀가 등)은 직선. 필요하면 OSRM으로 도로 스냅
4. 짧은 영상 클립(음소거 루프) 추가
5. ~~사진 R2 업로드~~ (URL은 그대로 `/photos/...`, Worker가 R2에서 서빙)
6. ~~OG 이미지~~, ~~배포~~, 커스텀 도메인(구매 예정)
