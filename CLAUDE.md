# ALMATY 2026 — 여행 기록 사이트

카자흐스탄 알마티 여행(2026.09.11–09.17)을 시네마틱 + 매거진 + 여행 일기 톤의 인터랙티브 웹페이지로 만든다.
포트폴리오용 전체 공개. 인터랙션을 위해 분위기를 일부 희생하는 것은 허용된다.

## 스택
- Astro 7 (정적 빌드, `output: 'static'`), 한 페이지 스크롤리텔링 (`src/pages/index.astro`)
- MapLibre GL 6 + OpenFreeMap `dark` 스타일 (키 없음) + AWS terrarium DEM (3D 지형/음영)
- PhotoSwipe 5 (라이트박스), sharp (빌드 시 사진 크기 측정)
- 배포: Cloudflare Workers Static Assets (`wrangler.jsonc`, `pnpm deploy`)
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
- 지도 카메라 이동에 `padding` 대신 `offset`을 쓴다 — flyTo의 padding은 지도에 남아 fitBounds와 겹치면 NaN 오류가 난다
- 사진 경로는 `/photos/dayXX/<장소>-NN.jpg`. 파일이 없으면 날짜 색 그라디언트 플레이스홀더가 자동으로 렌더링된다
- 웹에서 가져온 임시 이미지는 로컬 개발용이다. 배포 전 전부 본인 사진으로 교체한다
- 공개 이미지에서는 EXIF GPS를 제거한다
- 디자인 토큰은 `src/styles/global.css`의 `:root`. 폰트: Fraunces(영문 디스플레이), Noto Serif KR(본문/제목), Pretendard(UI), JetBrains Mono(데이터), Nanum Pen Script(손글씨 메모)
- `prefers-reduced-motion`을 존중한다

## 확인이 필요한 데이터 (TODO)
- 숙소, 샤슬릭 식당 Smile, 스테이크 식당, 알마티 미술관, 블랙 캐년, 싱잉 듄, 악타우의 정확한 좌표
- 각 날짜의 실제 방문 시각, 일기 본문, 식당 이름
- `driveKm`은 대략치
- `astro.config.mjs`의 `site`, Outro의 작성자 이름

## 로드맵
1. ~~스키마 + 더미 데이터 + 스크롤 지도 초안~~
2. 사진 가져오기 스크립트: 원본 폴더 → exifr로 촬영 시각/GPS 읽기 → 날짜·장소 자동 매칭 → sharp로 AVIF/WebP + thumbhash 생성 → GPS 제거
3. 실제 도로 경로 (휴대폰 타임라인 내보내기 또는 OSRM) → `dayRoute` 교체
4. 사진이 많아지면 R2 업로드 + `src`를 R2 URL로 (`w`/`h` 명시)
5. OG 이미지, 커스텀 도메인, 배포
