# ALMATY 2026 — 여행 기록 사이트

카자흐스탄 알마티 여행(2026.09.11–09.17)을 시네마틱 + 매거진 + 여행 일기 톤의 인터랙티브 웹페이지로 만든다.
포트폴리오용 전체 공개. 인터랙션을 위해 분위기를 일부 희생하는 것은 허용된다.

## 스택
- Astro 7 (정적 빌드, `output: 'static'`), 한 페이지 스크롤리텔링 (`src/pages/index.astro`)
- MapLibre GL 6 + OpenFreeMap `dark` 스타일 (키 없음) + AWS terrarium DEM (3D 지형/음영)
- PhotoSwipe 5 (라이트박스), sharp (빌드 시 사진 크기 측정)
- 배포: Cloudflare Workers Static Assets (`wrangler.jsonc`). `pnpm cf:preview`(로컬 확인) → `pnpm cf:deploy`. `pnpm deploy`는 pnpm 내장 명령과 겹치므로 쓰지 않는다
- 패키지 매니저: pnpm

## 구조
- `src/content/days/dayXX.md` — **모든 콘텐츠의 원천.** frontmatter = 장소(stops)·좌표·카메라·사진, 본문 = 그날의 일기
- `src/content.config.ts` — 위 파일의 스키마 (zod: `astro/zod`)
- `src/lib/trip.ts` — 날짜별 색(`DAY_TONES`), 숙소 좌표, 통계, 사진 해석(`resolvePhoto`)
- `src/components/DayChapter.astro` — 하루 = 타이틀 카드(불투명) → 장소 스텝(투명, 뒤에 고정 지도) → 일기 스프레드(종이)
- `src/scripts/story.ts` — IntersectionObserver로 스텝 진입 시 지도 `flyTo`/`fitBounds`, 경로 그리기 애니메이션, 레일/진행바
- `scripts/copy-maplibre-worker.mjs` — MapLibre 6 워커를 `public/vendor/`로 복사 (predev/prebuild에서 자동 실행)

## 규칙
- 좌표는 `[경도, 위도]`. 확인되지 않은 좌표는 `approx: true` (개발 서버에서 "좌표 대략치" 배지로 보임)
- 7일차 개요는 `spotlightCountry`로 카자흐스탄 국경(`src/data/kazakhstan.json`, Natural Earth 1:50m) 밖을 어둡게 가린다
- 3D 지형은 `kind: nature` 장소와 하루 개요에서만 켠다. 시내(식당·박물관 등)는 산 바로 아래라 지형을 켜면 카메라 앞 지면이 솟아 장소를 가린다 → 평면 + 음영만. 시내 장소 카메라는 남쪽(bearing 160~180)을 보게 해 산을 배경으로 둔다
- 지도 카메라 이동에 `padding` 대신 `offset`을 쓴다 — flyTo의 padding은 지도에 남아 fitBounds와 겹치면 NaN 오류가 난다
- 사진 파일이 없으면 날짜 색 그라디언트 플레이스홀더가 자동으로 렌더링된다
- 공개 이미지에서는 EXIF GPS를 제거한다
- **숙소 실제 좌표는 공개하지 않는다.** 실제 좌표는 git 제외 파일 `privacy.local.json`에만 두고, `pnpm tracks`가 그 반경 700m 안의 GPS 점을 잘라낸다. 사이트에 표시되는 숙소 좌표(`TRIP.base`, day01 hotel)는 알마티 시내 중심
- 디자인 토큰은 `src/styles/global.css`의 `:root`. 폰트: Fraunces(영문 디스플레이), Noto Serif KR(본문/제목), Pretendard(UI), JetBrains Mono(데이터), Nanum Pen Script(손글씨 메모)
- `prefers-reduced-motion`을 존중한다

## 사진
- 원본: `D:\archive\Camera_202609` (Galaxy S26 Ultra, 파일명 = 현지 촬영 시각 `YYYYMMDD_HHMMSS[_NNN].jpg`, 97%가 EXIF GPS 보유)
- 주의: 파일명 시각은 휴대폰 시간대 기준이다. 착륙 직전 사진(`20260912_0112*`)처럼 한국 시간(+09:00)이 남은 사진이 있으므로 시각 계산에는 EXIF `OffsetTimeOriginal`을 반영한다 (01:12 KST = 9/11 21:12 알마티)
- 동행자(초록색 옷)가 나온 사진은 쓰지 않는다. 본인은 푸른 체크셔츠, 침블락에서는 흰 점퍼
- 장소 좌표·시각은 사진 EXIF GPS의 중앙값. 고도는 공식/문헌 값이 있는 곳은 그 값(빅 알마티 호수 2,511 · 메데우 1,691 · 탈가르 패스 3,200 · 콕토베 1,100 · 콜사이 1호 1,818 · 카인디 2,000), 없는 곳은 GPS 중앙값
- 문구에 "톈산" 지명은 쓰지 않는다
- 사진 선정은 dayXX.md의 `photos`/`cover`가 기준. 경로는 `/photos/dayXX/<원본파일명>.jpg`
- `pnpm photos` → md에 적힌 사진만 원본에서 찾아 `public/photos/dayXX/`에 `<이름>.jpg`(2400px, 라이트박스) + `<이름>-md.webp`(1200px, 카드)로 변환, EXIF 전부 제거
- 변환된 사진은 git에 넣지 않는다 (`.gitignore`). 배포는 사진이 있는 이 PC의 로컬 빌드(`pnpm cf:deploy`) 기준 — Git 연동 자동 배포를 켜면 사진 없이 플레이스홀더로 배포된다
- `pnpm tracks` → 원본 사진 전체의 GPS를 실제 시각(EXIF 오프셋 반영) 순으로 이어 2~7일차 경로 생성, 시속 180km 초과 점은 GPS 오류로 제외. 1일차는 장소를 잇는 비행 경로
- `.scratch/` (git 제외)에 EXIF 스캔(`scan.json`)·밀착 인화 스크립트가 있다: `node .scratch/sheet.mjs <날짜> <시작> <끝> <이름> [최대장수]`

## 확인이 필요한 데이터 (TODO)
- 각 날짜의 일기 본문, 식당 이름(Smile 외), 카투타우 식별(사진상 붉은 화산암 지대)
- `driveKm`은 사진 GPS 직선거리 × 1.25 추정치
- `astro.config.mjs`의 `site`
- 영상 115개(mp4)는 아직 사용하지 않음

## 로드맵
1. ~~스키마 + 더미 데이터 + 스크롤 지도 초안~~
2. ~~사진 분류(EXIF 시각/GPS) + 장소 재구성 + 웹용 변환~~
3. ~~실제 이동 경로: 사진 GPS 궤적 (`pnpm tracks` → `src/data/tracks.json`)~~ — 사진이 드문 구간(야간 귀가 등)은 직선. 필요하면 OSRM으로 도로 스냅
4. 짧은 영상 클립(음소거 루프) 추가
5. 사진 R2 업로드 + `src`를 R2 URL로 (`w`/`h` 명시)
6. OG 이미지, 커스텀 도메인, 배포
