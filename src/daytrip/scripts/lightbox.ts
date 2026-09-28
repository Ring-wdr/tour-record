// 당일 여행 페이지 전용 사진 크게 보기 — 표지 + 타임라인 사진이 한 갤러리(.dt-page 안의 a.dt-lb).
// 사이트 공용 src/scripts/lightbox.ts와 다른 점: 배경을 완전히 가린다(끈끈한 시계 막대·본문이 비치지 않게),
// 캡션에 촬영 시각(필름 각인 색), 잘라 보인 사진(data-crop)은 잘린 자리에서 커진다.
import PhotoSwipeLightbox from 'photoswipe/lightbox';
import 'photoswipe/style.css';

const lightbox = new PhotoSwipeLightbox({
  gallery: '.dt-page',
  children: 'a.dt-lb',
  pswpModule: () => import('photoswipe'),
  bgOpacity: 1,
  showHideAnimationType: 'zoom',
  closeTitle: '닫기',
  zoomTitle: '확대',
  arrowPrevTitle: '이전 사진',
  arrowNextTitle: '다음 사진',
});

// 잘라 보인 사진 — 칸(a) 밖으로 밀려 있는 img 전체가 원본, 보이는 칸이 innerRect (PhotoSwipe의 잘린 썸네일 규약)
lightbox.addFilter('thumbBounds', (bounds, itemData) => {
  const a = itemData.element;
  const img = a?.querySelector('img');
  // 잘리지 않은 사진은 PhotoSwipe가 구한 그대로 (썸네일이 없으면 undefined — 타입은 Bounds지만 PhotoSwipe가 받아 준다)
  if (!a || !img || !('crop' in a.dataset)) return bounds as NonNullable<typeof bounds>;
  const box = a.getBoundingClientRect();
  const r = img.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, innerRect: { x: r.left - box.left, y: r.top - box.top, w: box.width, h: box.height } };
});

lightbox.on('uiRegister', () => {
  lightbox.pswp?.ui?.registerElement({
    name: 'caption',
    order: 9,
    isButton: false,
    appendTo: 'root',
    onInit: (el, pswp) => {
      el.classList.add('dt-lb-caption');
      const time = document.createElement('time');
      const text = document.createElement('span');
      el.append(time, text);
      pswp.on('change', () => {
        const a = pswp.currSlide?.data.element;
        time.textContent = a?.dataset.time ?? '';
        time.hidden = !a?.dataset.time;
        text.textContent = a?.dataset.caption ?? '';
      });
    },
  });
});

lightbox.init();
