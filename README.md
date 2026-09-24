# ALMATY — Seven Days in Kazakhstan

카자흐스탄 알마티 여행(2026.09.11 – 09.17)을 스크롤하며 따라가는 인터랙티브 여행 기록.

**🔗 https://almaty-2026.akswnd55.workers.dev**

- **시네마틱 첫 화면** — 레터박스가 열리며 떠오르는 타이틀
- **스크롤리텔링 지도** — 장소 카드를 넘길 때마다 지도가 그곳으로 날아가고, 그날의 실제 이동 경로가 그려진다. 자연 명소는 3D 지형, 시내는 평면 지도
- **매거진 스타일 여행 일기** — 날짜별 일기, 손글씨 메모, 사진 모자이크와 라이트박스
- **고도 그래프** — 일주일 동안 오르내린 해발 고도(최고 3,200m 탈가르 패스)
- **카자흐스탄 스포트라이트** — 마지막 날 개요에서 국경 밖을 어둡게 가린다

## 기술 스택

| 영역 | 사용 |
|---|---|
| 사이트 | [Astro 7](https://astro.build) 정적 빌드, 한 페이지 |
| 지도 | [MapLibre GL 6](https://maplibre.org) + [OpenFreeMap](https://openfreemap.org) `dark` 스타일 + AWS terrarium 고도 타일 |
| 사진 | [sharp](https://sharp.pixelplumbing.com)로 변환, [PhotoSwipe 5](https://photoswipe.com) 라이트박스 |
| 호스팅 | Cloudflare Workers Static Assets + R2(사진) |

## 구조

```
src/content/days/day01~07.md   하루 = frontmatter(장소·좌표·카메라·사진) + 본문(일기)
src/components/                 Hero, Stats, DayChapter, AltitudeLine, DayRail, Outro, Photo
src/scripts/story.ts            스크롤 ↔ 지도 연동 (IntersectionObserver)
src/data/tracks.json            사진 GPS로 만든 날짜별 이동 경로
src/data/photos.json            사진 크기 목록 (빌드에 사진 파일이 필요 없도록)
src/data/kazakhstan.json        국경선 (Natural Earth)
worker/index.ts                 /photos/* 를 R2에서 서빙하는 Worker
scripts/                        사진 변환·업로드, 경로 생성, MapLibre 워커 복사
```

콘텐츠는 모두 `src/content/days/*.md`에서 수정한다. 스키마는 `src/content.config.ts`.

## 실행

```bash
pnpm install
pnpm dev          # http://localhost:4321
```

사진 파일은 저장소에 없다. 로컬에서 사진 없이 실행하면 날짜별 색의 플레이스홀더가 보인다.

## 명령어

| 명령 | 하는 일 |
|---|---|
| `pnpm dev` | 개발 서버 |
| `pnpm build` | 정적 빌드 (`dist/`) |
| `pnpm photos` | md에 적힌 사진만 원본 폴더에서 찾아 웹용(2400px JPEG + 1200px WebP)으로 변환, EXIF 제거, `photos.json`·`og.jpg` 생성 |
| `pnpm photos:upload` | 새로 생기거나 바뀐 사진만 R2에 업로드 (`-- --local`이면 로컬 R2) |
| `pnpm tracks` | 원본 사진 전체의 GPS로 날짜별 이동 경로 생성 |
| `pnpm cf:preview` | 빌드 후 Cloudflare 런타임으로 로컬 확인 |
| `pnpm cf:deploy` | 빌드 후 Cloudflare에 배포 |

`pnpm deploy`는 pnpm 내장 명령과 겹치므로 `cf:deploy`를 쓴다.

### 사진을 바꿀 때

```bash
# 1. src/content/days/dayXX.md의 photos / cover 수정
pnpm photos          # 2. 변환
pnpm photos:upload   # 3. R2 업로드
pnpm cf:deploy       # 4. 배포
```

## 개인정보

- 공개 사진은 변환할 때 EXIF(GPS 포함)를 모두 지운다.
- 숙소의 실제 좌표는 공개하지 않는다. git에서 제외된 `privacy.local.json`에만 두고, `pnpm tracks`가 그 반경 700m 안의 GPS 점을 경로에서 잘라낸다. 사이트에 표시되는 숙소 위치는 알마티 시내 중심이다.
- 원본·변환 사진, 업로드 기록은 git에 넣지 않는다.

## 출처

- 지도 © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, [OpenFreeMap](https://openfreemap.org)
- 고도 타일: [Mapzen Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (AWS Open Data)
- 국경선: [Natural Earth](https://www.naturalearthdata.com) (public domain)
- 고도 수치: 공식 자료·Wikipedia, 없는 곳은 사진 GPS

사진과 글 © 김만중.

---

에이전트(Claude Code)와 함께 작업한 프로젝트다. 작업 규칙과 맥락은 [CLAUDE.md](CLAUDE.md)에 있다.
