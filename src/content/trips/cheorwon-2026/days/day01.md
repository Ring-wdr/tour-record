---
day: 1
date: 2026-09-26
title: 협곡 위의 길, 꽃밭의 오후
titleEn: A Path Above the Gorge, an Afternoon in Flowers
lede: 부모님과 한탄강 주상절리길을 걸었다. 점심은 감자옹심이, 오후는 고석정과 꽃밭에서. 아침 여덟 시 사십 분부터 저녁 여섯 시까지, 철원에서의 하루.
driveKm: 11
tone: { accent: "#5cc4a4", from: "#0d2a26", to: "#3f8f7f" } # 한탄강의 비취색 물빛
# 출발·귀가 지점(집)은 사진에 없다 — 경로는 첫 장소에서 시작해 마지막 장소에서 끝난다
fromBase: false
cover:
  src: /photos/cheorwon-2026/day01/20260926_101445.jpg
  alt: 거울 같은 강물에 비친 바위 절벽
# 장소 노트 = 실린 사진에 보이는 것만 짧게. 사진에 없는 이야기(출렁다리·유람선·꽃밭·옥상)는 아래 일기에
# 사진 편집(당일 여행 페이지): size full = 페이지 폭 가득, small = 작게(첫 본사진보다 이르면 글 옆, 늦으면 본사진 오른쪽),
#   crop = 원본 기준 [왼쪽, 위, 폭, 높이] %, caption = 화면에 보이는 짧은 설명(노트에 없는 것만 — 없으면 시각 각인만)
stops:
  - id: deureuni
    name: 드르니 매표소
    nameEn: Deureuni Ticket Office
    coords: [127.28852, 38.1546]
    time: "08:42"
    kind: arrival
    camera: { zoom: 15, pitch: 0, bearing: 0 }
    note: 한탄강 주상절리길의 남쪽 들머리. 주차장 옆 논은 추수를 마치고 그루터기만 남았다.
    photos:
      - { src: /photos/cheorwon-2026/day01/20260926_084301.jpg, alt: 주차장 옆 추수를 마친 논과 먼 산, crop: [0, 24, 100, 76] }
      - { src: /photos/cheorwon-2026/day01/20260926_084712.jpg, alt: 드르니 관리센터 매표소 간판과 주상절리길 입구 문, trim: [24, 34, 76, 34], size: full }
  - id: durumi-bridge
    name: 두루미교
    nameEn: Durumi Bridge
    coords: [127.28564, 38.15305]
    time: "09:02"
    elevation: 151
    kind: nature
    camera: { zoom: 15, pitch: 0, bearing: 0 }
    note: 협곡으로 내려가기 전, 흰 구조물의 케이블 사이로 처음 협곡을 내려다봤다. 입구 쪽 들판에는 둥글게 만 볏짚 곤포가 놓여 있었다.
    photos:
      - { src: /photos/cheorwon-2026/day01/20260926_090254.jpg, alt: 흰 구조물의 케이블 사이로 내려다본 한탄강 협곡 }
      - { src: /photos/cheorwon-2026/day01/20260926_090213.jpg, alt: 두루미교 앞의 흰 조형물, trim: [16, 0, 72, 100] }
      - { src: /photos/cheorwon-2026/day01/20260926_090633.jpg, alt: 둥근 볏짚 곤포가 놓인 가을 들판과 곧은 농로, crop: [0, 24, 100, 76] }
  - id: jando
    name: 한탄강 주상절리길
    nameEn: Hantan River Cliff Trail
    coords: [127.29144, 38.17007]
    time: "09:18"
    elevation: 134
    kind: nature
    camera: { zoom: 14.5, pitch: 0, bearing: 0 }
    note: 절벽 허리에 매단 길. 동주황벽 전망쉼터 표지판으로 지나온 드르니가 1.7킬로미터, 남은 순담이 1.9킬로미터였다. 강 건너 절벽에는 세로로 쪼개진 돌기둥이 병풍처럼 늘어섰고, 가는 물줄기 하나가 그 한가운데로 흘러내렸다. 길가 바위 틈에도 물이 스며 떨어졌다.
    photos:
      - { src: /photos/cheorwon-2026/day01/20260926_094944.jpg, alt: 동주황벽 전망쉼터 표지판 — 순담 1.9km · 드르니 1.7km, size: small }
      - { src: /photos/cheorwon-2026/day01/20260926_095015.jpg, alt: 강 건너 동주황벽의 주상절리 절벽 }
      - { src: /photos/cheorwon-2026/day01/20260926_095148.jpg, alt: 길가 바위 틈으로 떨어지는 가는 물줄기와 잎사귀 }
      - { src: /photos/cheorwon-2026/day01/20260926_095626.jpg, alt: 주상절리 절벽 아래로 흐르는 한탄강, trim: [19, 0, 81, 100] }
      - { src: /photos/cheorwon-2026/day01/20260926_100708.jpg, alt: 강물에 깎인 바위섬과 주상절리, caption: 강물에 깎인 바위섬, size: full }
      - { src: /photos/cheorwon-2026/day01/20260926_100838.jpg, alt: 소나무 너머로 보이는 잔잔한 강과 바위 }
      - { src: /photos/cheorwon-2026/day01/20260926_103201.jpg, alt: 절벽 틈으로 들어오는 역광, size: small }
  - id: sundam-beach
    name: 순담 모래톱
    nameEn: Sundam Sandbar
    coords: [127.2982, 38.17598]
    time: "10:47"
    elevation: 120
    kind: nature
    camera: { zoom: 15, pitch: 0, bearing: 0 }
    note: 주상절리길이 끝나는 순담. 강가 모래톱까지 내려갔다가, 열한 시가 조금 넘어 순담 쪽 주차장으로 나왔다.
    photos:
      - { src: /photos/cheorwon-2026/day01/KakaoTalk_20260926_111232831_04.jpg, alt: 순담계곡 모래톱과 강물에 비친 숲, size: full }
  - id: lunch
    name: 점심, 고석정 나들이
    nameEn: Lunch at Goseokjeong Nadeuri
    coords: [127.285, 38.18954]
    time: "12:08"
    kind: food
    camera: { zoom: 15, pitch: 0, bearing: 0 }
    note: 간판에 ‘감자옹심이와 막국수’라고 적힌 식당. 뽀얀 국물 위에 김을 얹은 감자옹심이. 숟가락으로 떠 올린 옹심이는 반쯤 투명했다.
    photos:
      - { src: /photos/cheorwon-2026/day01/20260926_125432.jpg, alt: 김을 얹은 감자옹심이와 밑반찬 }
      - { src: /photos/cheorwon-2026/day01/20260926_125624.jpg, alt: 숟가락으로 떠 올린 감자옹심이, size: small, crop: [33, 11, 36, 64] }
  - id: goseokjeong
    name: 고석정
    nameEn: Goseokjeong
    coords: [127.28771, 38.18478]
    time: "13:42"
    elevation: 119
    kind: nature
    camera: { zoom: 15, pitch: 0, bearing: 0 }
    note: 강가로 내려서면 소나무를 얹은 커다란 바위가 물 위로 솟아 있다. 그 옆으로 래프팅 보트가 지나갔고, 어머니는 모래톱에서 강을 등지고 두 팔을 활짝 벌렸다.
    photos:
      - { src: /photos/cheorwon-2026/day01/20260926_134352.jpg, alt: 고석정 안내판 앞에서 찍은 셀카, caption: 안내판 앞에서 셀카 한 장, size: small }
      - { src: /photos/cheorwon-2026/day01/20260926_134545.jpg, alt: 꽃이 핀 바위와 절벽, caption: 꽃이 핀 바위, crop: [0, 14, 100, 76] }
      - { src: /photos/cheorwon-2026/day01/20260926_134538.jpg, alt: 절벽 아래 초록 풀숲과 강물 }
      - { src: /photos/cheorwon-2026/day01/20260926_134640.jpg, alt: 모래톱에서 두 팔을 활짝 벌린 어머니, size: full, crop: [0, 29.6, 100, 70.4] }
      - { src: /photos/cheorwon-2026/day01/20260926_135705.jpg, alt: 소나무를 얹은 고석정 바위와 강을 지나는 래프팅 보트, size: full }
      - { src: /photos/cheorwon-2026/day01/20260926_141823.jpg, alt: 강가 연못의 ‘수영 금지’ 표지, trim: [0, 9, 100, 91], size: small }
  - id: goseokjeong-garden
    name: 고석정꽃밭
    nameEn: Goseokjeong Flower Garden
    coords: [127.2949, 38.18632]
    time: "14:36"
    elevation: 160
    kind: nature
    camera: { zoom: 15, pitch: 0, bearing: 0 }
    note: 꽃밭 사이로 한 시간쯤 걸었다. 천일홍과 맨드라미가 줄무늬처럼 이어지고, 초가지붕을 얹은 통나무 오두막 창가에서는 초록 옷을 입은 인형이 꽃밭을 내다본다.
    photos:
      - { src: /photos/cheorwon-2026/day01/20260926_143714.jpg, alt: 보라 천일홍과 흰 천일홍 사이로 핀 코스모스, trim: [3, 45, 97, 55] }
      - { src: /photos/cheorwon-2026/day01/20260926_144322.jpg, alt: 붉은 맨드라미와 주황 맨드라미가 줄지어 선 꽃밭, trim: [0, 22, 100, 78] }
      - { src: /photos/cheorwon-2026/day01/20260926_144647.jpg, alt: 주황·자주 맨드라미 줄무늬 꽃밭, trim: [0, 56, 93, 44] }
      - { src: /photos/cheorwon-2026/day01/20260926_151043.jpg, alt: 초가지붕 통나무 오두막 창가에서 꽃밭을 내다보는 초록 옷 인형, caption: 오두막 옆 가우라 꽃밭, crop: [0, 8, 87, 88] }
      - { src: /photos/cheorwon-2026/day01/KakaoTalk_20260926_214412595_25.jpg, alt: 곡선으로 심은 꽃밭을 내려다보는 전망대 난간 앞에서 브이 한 나, caption: 전망대에서 한 장 }
      - { src: /photos/cheorwon-2026/day01/20260926_150321.jpg, alt: 줄무늬처럼 심은 가우라와 분홍 꽃밭, trim: [0, 62, 100, 38], size: full }
      - { src: /photos/cheorwon-2026/day01/20260926_152954.jpg, alt: 풍차가 보이는 꽃밭 앞에서 함께 팔을 든 부모님, size: full }
      - { src: /photos/cheorwon-2026/day01/20260926_153236.jpg, alt: 붉은 맨드라미와 노란 꽃 줄무늬, trim: [0, 58, 94, 42] }
  - id: cafe
    name: CAFE 고석정
    nameEn: Cafe Goseokjeong
    coords: [127.28795, 38.18761]
    time: "15:53"
    kind: food
    camera: { zoom: 15, pitch: 0, bearing: 0 }
    note: GO SUK JUNG 조형물 옆의 카페. 창가 자리는 비어 있었고, 바닥에는 오후 햇빛이 길게 들었다.
    photos:
      - { src: /photos/cheorwon-2026/day01/20260926_155804.jpg, alt: 오후 햇빛이 든 카페의 빈 창가 자리, crop: [0, 26, 55, 56] }
  # 사진 없는 마지막 출발 = 번호 없는 끝줄 (당일 여행 페이지)
  - id: parking
    name: 고석정 주차장
    nameEn: Goseokjeong Parking Lot
    coords: [127.28978, 38.18798]
    approx: true # 주차 요금 정산기 사진 한 장 (src/daytrip/CLAUDE.md TODO)
    time: "18:04"
    kind: departure
    camera: { zoom: 15, pitch: 0, bearing: 0 }
    note: 주차 요금을 정산하고 철원을 떠났다.
---

드르니 매표소 앞에는 아홉 시도 되기 전에 벌써 줄이 서 있었다. 두루미교를 지나 계단을 내려가면, 거기서부터 절벽을 따라가는 길이 시작된다.

길은 드르니에서 순담까지 3.6킬로미터. 중간에 협곡을 가로지르는 출렁다리를 건넜다. 걷는 내내 발밑으로 강이 흘렀고, 물살이 잔잔한 곳에서는 강물이 거울처럼 절벽을 비췄다. 순담까지 한 시간 반쯤 걸렸다. 길 끝 모래톱의 절벽에는 ‘주상절리길 순담’이라는 글자가 붙어 있었다.

점심을 먹고 고석정으로 갔다. 주차장 옆에 ‘꽃밭 가는 길’이라고 쓴 아치가 서 있었지만, 먼저 강가의 고석정으로 내려갔다. 바위 옆으로 유람선이 오갔다. 계단을 올라 위에서 내려다보니 선착장 앞에서 강이 크게 굽이쳤다.

고석정꽃밭에는 천일홍과 맨드라미가 줄무늬처럼 심겨 있었다. 부모님은 빨간 우산을 함께 쓰고 맨드라미 길을 걸었다. 전망대에 오르니 곡선으로 심은 꽃 줄이 물결처럼 휘었고, 그 너머에 풍차가 서 있었다.

마지막은 카페였다. 한 시간 남짓 앉아 있다가 옥상에 올라가니, 한옥 지붕 너머로 저녁빛이 번지고 있었다. 집으로 가는 길에 해가 졌다.
