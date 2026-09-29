---
day: 1
date: 2026-05-10
title: 바다를 내려다보는 탑
titleEn: A Tower by the Sea
lede: 한 시간 남짓 날아 후쿠오카에 내렸다. 하카타역에서 라멘으로 첫 끼를 먹고, 바닷가 타워에 올라 도시와 해변을 내려다본 뒤, 모츠나베로 첫날 밤을 데웠다.
driveKm: 20
tone: { accent: "#4fb3e8", from: "#0f2d4a", to: "#5aa9d6" } # 오월의 바다와 하늘
fromBase: false
toBase: true
cover:
  src: /photos/fukuoka-2026/day01/20260510_145219.jpg
  alt: 후쿠오카 타워 전망실에서 내려다본 모모치 해변과 하카타만
stops:
  - id: icn-fukuoka
    name: 인천 출발
    nameEn: Incheon International Airport
    coords: [126.4509, 37.4535]
    time: "09:05"
    kind: flight
    camera: { zoom: 10, pitch: 30, bearing: 0 }
    note: 게이트 유리창 너머로 비행기가 기다린다. 후쿠오카까지는 한 시간 남짓.
    photos:
      - { src: /photos/fukuoka-2026/day01/20260510_090508.jpg, alt: 탑승구 유리창 너머의 활주로 }
  - id: fukuoka-airport
    name: 후쿠오카 공항
    nameEn: Fukuoka Airport
    coords: [130.4444, 33.5858]
    time: "11:36"
    elevation: 9
    kind: arrival
    camera: { zoom: 13, pitch: 40, bearing: 250 }
    note: 매화 무늬의 "Welcome to Fukuoka"가 먼저 반긴다. 도심과 가까운 공항이라 지하철 몇 정거장이면 하카타역이다.
    photos:
      - { src: /photos/fukuoka-2026/day01/20260510_113645.jpg, alt: 매화 무늬의 환영 간판 }
      - { src: /photos/fukuoka-2026/day01/20260510_114635.jpg, alt: 공항 국제선 도착 홀 }
  - id: hakata-ramen
    name: 하카타역의 라멘집
    nameEn: Ramen at Hakata Station
    coords: [130.4212, 33.5906]
    time: "12:55"
    kind: food
    camera: { zoom: 16, pitch: 50, bearing: 0 }
    note: 역 안 식당가에서 식권을 뽑아 줄을 섰다. 식권에 찍힌 메뉴는 모츠 라멘, 한 그릇 1,300엔.
    photos:
      - { src: /photos/fukuoka-2026/day01/20260510_130224.jpg, alt: 차슈와 반숙 달걀을 얹은 라멘 }
      - { src: /photos/fukuoka-2026/day01/20260510_130213.jpg, alt: 부추를 듬뿍 올린 모츠 라멘 }
      - { src: /photos/fukuoka-2026/day01/20260510_130221.jpg, alt: 토마토를 올린 붉은 국물의 라멘 }
  - id: fukuoka-tower
    name: 후쿠오카 타워
    nameEn: Fukuoka Tower
    coords: [130.3516, 33.5932]
    time: "14:35"
    elevation: 123
    kind: city
    camera: { zoom: 15, pitch: 55, bearing: 20 }
    note: 바닷가에 선 234m의 유리 탑. 전망실(123m)에 오르면 한쪽은 모모치 해변과 하카타만, 다른 쪽은 산에 둘러싸인 시가지다.
    photos:
      - { src: /photos/fukuoka-2026/day01/20260510_143542.jpg, alt: 파란 하늘로 솟은 후쿠오카 타워와 지나가는 비행기 }
      - { src: /photos/fukuoka-2026/day01/20260510_145843.jpg, alt: 전망실에서 본 시가지와 산 }
      - { src: /photos/fukuoka-2026/day01/20260510_144804.jpg, alt: 타워 안쪽의 삼각형 유리 골조 }
  - id: motsunabe-dinner
    name: 모츠나베 저녁
    nameEn: Motsunabe Dinner
    coords: [130.4100, 33.5919]
    time: "18:32"
    kind: food
    camera: { zoom: 16, pitch: 50, bearing: 180 }
    note: 하카타의 냄비 요리 모츠나베. 양배추와 부추를 산처럼 쌓은 냄비가 끓어오르면 곱창이 부드러워진다. 마지막은 남은 국물에 면과 죽.
    photos:
      - { src: /photos/fukuoka-2026/day01/20260510_184101.jpg, alt: 부추를 가지런히 얹은 모츠나베 }
      - { src: /photos/fukuoka-2026/day01/20260510_183507.jpg, alt: 초록 잎을 얹은 생선 회 }
      - { src: /photos/fukuoka-2026/day01/20260510_183245.jpg, alt: 거품이 두툼한 생맥주 }
      - { src: /photos/fukuoka-2026/day01/20260510_191001.jpg, alt: 마무리로 끓인 죽 }
  - id: canal-city
    name: 캐널시티 하카타
    nameEn: Canal City Hakata
    coords: [130.4106, 33.5903]
    time: "19:22"
    kind: city
    camera: { zoom: 16, pitch: 55, bearing: 200 }
    note: 건물 사이로 물길이 흐르는 복합 쇼핑몰. 곡선의 층층 발코니 아래에서 크레페를 들고 피규어 가게를 구경했다.
    photos:
      - { src: /photos/fukuoka-2026/day01/20260510_194039.jpg, alt: 가로등이 켜진 캐널시티의 산책로 }
      - { src: /photos/fukuoka-2026/day01/20260510_194134.jpg, alt: 곡선으로 겹쳐진 층층 발코니 }
      - { src: /photos/fukuoka-2026/day01/20260510_193434.jpg, alt: 딸기를 얹은 크레페 }
      - { src: /photos/fukuoka-2026/day01/20260510_200726.jpg, alt: 진열장 속 피규어 }
---

오랜만의 일본, 후쿠오카. 인천에서 한 시간 남짓이면 닿는다. 공항이 도심 바로 옆이라 지하철 몇 정거장 만에 하카타역에 섰다.

첫 끼는 역 안 식당가의 라멘. 식권을 뽑고 기다렸다가 받은 그릇은 저마다 달랐다. 부추를 수북이 올린 모츠 라멘, 토마토를 얹은 붉은 국물, 차슈와 반숙 달걀을 얹은 맑은 국물.

오후에는 버스를 타고 바닷가 후쿠오카 타워로 갔다. 오월의 하늘이 너무 파래서 유리 탑이 하늘에 녹아드는 것 같았다. 전망실에 오르자 한쪽으로 모모치 해변의 모래사장과 하카타만, 다른 쪽으로 산에 둘러싸인 시가지가 펼쳐졌다.

저녁은 하카타에 오면 먹어야 한다는 모츠나베. 냄비가 끓는 동안 맥주를 한 잔 하고, 남은 국물에 면과 죽까지 끓여 바닥을 봤다. 소화도 시킬 겸 캐널시티까지 걸어가 크레페를 들고 늦게까지 구경했다. 숙소로 돌아오는 길에 편의점에서 산 칼피스 한 병이 첫날의 마지막이었다.
