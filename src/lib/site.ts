/** 여행과 상관없는 사이트 전체 정보 */
export const SITE = {
  title: 'TRAVEL RECORDS',
  titleKo: '여행 기록',
  author: '김만중',
};

/**
 * 사진 주소 앞부분. 운영은 R2 버킷 tour-record-photos에 붙인 커스텀 도메인 — 사진이 Worker를 거치지 않고
 * CDN 캐시에서 나간다(Worker 요청 한도와 무관). 개발 서버는 public/photos(pnpm photos)를 쓴다.
 * 콘텐츠·R2 키는 계속 '/photos/<slug>/...' 경로이고, 화면에 그릴 때만 이 앞부분을 붙인다.
 */
export const PHOTO_ORIGIN = import.meta.env.DEV ? '' : 'https://photos.tour-record.page';
