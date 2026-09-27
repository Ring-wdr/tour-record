// public/photos의 변환본(pnpm photos 결과)을 R2 버킷에 올린다. R2 키 = URL 경로 (photos/<slug>/dayXX/...)
//
//   pnpm photos:upload                        # 모든 여행 → Cloudflare R2(원격)
//   pnpm photos:upload -- --trip almaty-2026  # 한 여행만
//   pnpm photos:upload -- --local             # wrangler dev용 로컬 R2에 업로드
//
// trip.yaml에 draft: true인 여행(개발 서버에서만 보는 여행)은 올리지 않는다.
// 로직은 scripts/lib/r2.mjs (관리자 화면의 "여행 만들기"도 같은 함수로 올린다)
import { args, selectedSlugs, loadTrip } from './lib/trips.mjs';
import { uploadPhotos } from './lib/r2.mjs';

const slugs = selectedSlugs().filter((slug) => {
  if (!loadTrip(slug).meta.draft) return true;
  console.log(`[photos:upload] ${slug}: draft — 건너뜀 (trip.yaml의 draft를 지우면 올라간다)`);
  return false;
});
if (slugs.length) await uploadPhotos({ slugs, local: args.includes('--local') });
