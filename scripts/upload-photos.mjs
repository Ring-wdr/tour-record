// public/photos의 변환본(pnpm photos 결과)을 R2 버킷에 올린다. R2 키 = URL 경로 (photos/<slug>/dayXX/...)
//
//   pnpm photos:upload                        # 모든 여행 → Cloudflare R2(원격)
//   pnpm photos:upload -- --trip almaty-2026  # 한 여행만
//   pnpm photos:upload -- --local             # wrangler dev용 로컬 R2에 업로드
//
// 로직은 scripts/lib/r2.mjs (관리자 화면의 "여행 만들기"도 같은 함수로 올린다)
import { args, selectedSlugs } from './lib/trips.mjs';
import { uploadPhotos } from './lib/r2.mjs';

await uploadPhotos({ slugs: selectedSlugs(), local: args.includes('--local') });
