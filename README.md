# Travel Records

다녀온 여행을 하나씩 스크롤하며 따라가는 인터랙티브 여행 기록.

**🔗 https://tour-record.page**

| 여행 | 기간 |
|---|---|
| [ALMATY — Seven Days in Kazakhstan](https://tour-record.page/trips/almaty-2026/) | 2026.09.11 – 09.17 |

여행 페이지마다 같은 구성:

- **시네마틱 첫 화면** — 레터박스가 열리며 떠오르는 타이틀
- **스크롤리텔링 지도** — 장소 카드를 넘길 때마다 지도가 그곳으로 날아가고, 그날의 실제 이동 경로가 그려진다. 자연 명소는 3D 지형, 시내는 평면 지도
- **매거진 스타일 여행 일기** — 날짜별 일기, 손글씨 메모, 사진 모자이크와 라이트박스
- **고도 그래프** — 여행 동안 오르내린 해발 고도 (알마티: 최고 3,200m 탈가르 패스)
- **나라 스포트라이트** — 지정한 날의 개요에서 국경 밖을 어둡게 가린다

## 기술 스택

| 영역 | 사용 |
|---|---|
| 사이트 | [Astro 7](https://astro.build) 정적 빌드, 여행마다 한 페이지 (`/trips/<slug>/`) |
| 지도 | [MapLibre GL 6](https://maplibre.org) + [OpenFreeMap](https://openfreemap.org) `dark` 스타일 + AWS terrarium 고도 타일 |
| 사진 | [sharp](https://sharp.pixelplumbing.com)로 변환, [PhotoSwipe 5](https://photoswipe.com) 라이트박스 |
| 호스팅 | Cloudflare Workers Static Assets + R2 커스텀 도메인(사진, `photos.tour-record.page`) |

## 구조

```
src/content/trips/<slug>/       여행 1개 = trip.yaml(여행 정보) + days/dayXX.md + photos.json·tracks.json
  days/dayXX.md                 하루 = frontmatter(장소·좌표·카메라·사진) + 본문(일기)
src/schemas/trip.ts             콘텐츠 스키마 (zod)
src/components/                 Hero, Stats, DayChapter, AltitudeLine, DayRail, Outro, Photo
src/scripts/story.ts            스크롤 ↔ 지도 연동 (IntersectionObserver)
src/data/geo/                   국경선 (Natural Earth)
worker/index.ts                 옛 사진 주소 /photos/* 를 사진 도메인으로 301
scripts/                        사진 변환·업로드, 경로 생성, MapLibre 워커 복사
```

콘텐츠는 모두 `src/content/trips/<slug>/`에서 수정한다. 스키마는 `src/schemas/trip.ts`, 여러 파일에 걸친 검증은 `src/lib/trip.ts`의 `checkTrip`.

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

사진·경로 명령은 모든 여행을 처리하고, `-- --trip <slug>`를 붙이면 그 여행만 처리한다. 원본 사진 폴더와 숙소 프라이버시 구역은 git에서 제외된 `trips.local.json`에 여행별로 적는다.
| `pnpm cf:preview` | 빌드 후 Cloudflare 런타임으로 로컬 확인 |
| `pnpm cf:deploy` | 빌드 후 Cloudflare에 배포 |
| `pnpm check` | 타입 검사 (astro check) |

`pnpm deploy`는 pnpm 내장 명령과 겹치므로 `cf:deploy`를 쓴다.

### 사진을 바꿀 때

```bash
# 1. src/content/trips/<slug>/days/dayXX.md의 photos / cover 수정
pnpm photos          # 2. 변환
pnpm photos:upload   # 3. R2 업로드
pnpm cf:deploy       # 4. 배포
```

## 관리자 화면 (로컬 전용)

`pnpm dev` 후 http://localhost:4321/admin — 여행 목록과 **새 여행 만들기** 폼. 섹션은 여행 페이지와 같은 순서(여행 정보 → 날짜별 타이틀 카드·경로 개요·장소·일기 → 고도 그래프)이고, 좌표는 옆의 지도를 클릭해 넣고, 사진은 파일을 고르거나 끌어다 놓는다(작성 중에는 브라우저에만 있다). 장소에 사진을 넣으면 사진의 촬영 시각·GPS로 비어 있는 좌표·시각·고도가 채워진다. **여행 만들기**를 누르면 사이트와 같은 스키마로 검증 → 사진 변환(EXIF 제거) → R2 업로드 → `src/content/trips/<slug>/`에 파일 쓰기 순서로 처리한다.

관리자 화면은 개발 서버에만 있다. 운영 빌드에는 라우트도 API도 들어가지 않으며, 들어가면 빌드가 실패한다.

## 개인정보

- 공개 사진은 변환할 때 EXIF(GPS 포함)를 모두 지운다.
- 숙소의 실제 좌표는 공개하지 않는다. git에서 제외된 `trips.local.json`에만 두고, `pnpm tracks`가 그 반경 700m 안의 GPS 점을 경로에서 잘라낸다. 사이트에 표시되는 숙소 위치는 알마티 시내 중심이다.
- 원본·변환 사진, 업로드 기록은 git에 넣지 않는다.

## 출처

- 지도 © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, [OpenFreeMap](https://openfreemap.org)
- 고도 타일: [Mapzen Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (AWS Open Data)
- 국경선: [Natural Earth](https://www.naturalearthdata.com) (public domain)
- 고도 수치: 공식 자료·Wikipedia, 없는 곳은 사진 GPS

사진과 글 © 김만중.

---

에이전트(Claude Code)와 함께 작업한 프로젝트다. 작업 규칙과 맥락은 [CLAUDE.md](CLAUDE.md)에 있다.
