import { useEffect } from 'react';

const TEA_BANNER_URL = '/4.0/login-tea-banner.jpg?v=20260827-1920';

function applyTeaLoginBanner(): void {
  const originalImage = document.querySelector<HTMLImageElement>('img[alt="Giáo viên giảng dạy"], img[alt="Học sinh hái chè"]');
  if (!originalImage) return;

  const card = originalImage.parentElement as HTMLElement | null;
  const contentWrapper = card?.parentElement as HTMLElement | null;
  const panel = contentWrapper?.parentElement as HTMLElement | null;
  if (!card || !contentWrapper || !panel) return;

  panel.style.position = 'relative';
  panel.style.backgroundColor = '#0f172a';

  let banner = panel.querySelector<HTMLImageElement>('img[data-login-tea-banner="true"]');
  if (!banner) {
    banner = document.createElement('img');
    banner.dataset.loginTeaBanner = 'true';
    banner.alt = 'Học sinh hái chè';
    banner.src = TEA_BANNER_URL;
    Object.assign(banner.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      objectPosition: 'center center',
      zIndex: '0',
      display: 'block',
    });
    panel.prepend(banner);
  }

  let shade = panel.querySelector<HTMLElement>('[data-login-tea-shade="true"]');
  if (!shade) {
    shade = document.createElement('div');
    shade.dataset.loginTeaShade = 'true';
    Object.assign(shade.style, {
      position: 'absolute',
      inset: '0',
      zIndex: '1',
      pointerEvents: 'none',
      background: 'linear-gradient(180deg, rgba(15,23,42,0.28) 0%, rgba(15,23,42,0.10) 45%, rgba(15,23,42,0.72) 100%)',
    });
    panel.insertBefore(shade, panel.children[1] || null);
  }

  // Keep the existing logo above the photo.
  Array.from(panel.children).forEach(child => {
    const element = child as HTMLElement;
    if (element === banner || element === shade) return;
    if (element === contentWrapper) return;
    element.style.zIndex = '3';
  });

  // Reuse only the existing caption; hide the old card image and card background.
  originalImage.style.display = 'none';
  Object.assign(contentWrapper.style, {
    position: 'absolute',
    inset: '0',
    marginTop: '0',
    width: '100%',
    height: '100%',
    zIndex: '2',
    pointerEvents: 'none',
  });

  Object.assign(card.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    maxWidth: 'none',
    aspectRatio: 'auto',
    borderRadius: '0',
    boxShadow: 'none',
    overflow: 'visible',
    background: 'transparent',
  });

  const oldOverlay = card.children[1] as HTMLElement | undefined;
  if (oldOverlay) oldOverlay.style.display = 'none';

  const caption = card.children[2] as HTMLElement | undefined;
  if (caption) {
    Object.assign(caption.style, {
      display: 'block',
      position: 'absolute',
      left: '0',
      right: '0',
      bottom: '0',
      zIndex: '4',
      padding: '3rem',
      paddingBottom: '4.5rem',
      pointerEvents: 'none',
    });
  }

  panel.dataset.teaLoginBanner = 'ready-layer';
}

export default function AuthBannerCustomizer() {
  useEffect(() => {
    applyTeaLoginBanner();
    const root = document.getElementById('root');
    if (!root) return;

    const observer = new MutationObserver(() => applyTeaLoginBanner());
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
