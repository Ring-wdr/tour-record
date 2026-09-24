import PhotoSwipeLightbox from 'photoswipe/lightbox';
import 'photoswipe/style.css';

const lightbox = new PhotoSwipeLightbox({
  gallery: '.pswp-gallery',
  children: 'a.pswp-item',
  pswpModule: () => import('photoswipe'),
  bgOpacity: 0.96,
  showHideAnimationType: 'zoom',
});

// 캡션
lightbox.on('uiRegister', () => {
  lightbox.pswp?.ui?.registerElement({
    name: 'caption',
    order: 9,
    isButton: false,
    appendTo: 'root',
    onInit: (el, pswp) => {
      pswp.on('change', () => {
        const a = pswp.currSlide?.data.element as HTMLElement | undefined;
        el.textContent = a?.dataset.caption ?? '';
      });
    },
  });
});

lightbox.init();
