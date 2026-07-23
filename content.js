// Social Media Downloader Content Script - Multi-Platform Support

(function () {
  'use strict';

  const host = window.location.hostname.toLowerCase();

  // Platform Detection
  const isThreads = host.includes('threads.net') || host.includes('threads.com');
  const isInstagram = host.includes('instagram.com');
  const isTwitter = host.includes('twitter.com') || host.includes('x.com');
  const isFacebook = host.includes('facebook.com');
  const isPinterest = host.includes('pinterest.com');

  let isExtensionEnabled = true;

  // Load initial settings
  chrome.storage.local.get(['extensionEnabled'], (data) => {
    if (data.extensionEnabled === false) {
      isExtensionEnabled = false;
      hideFloatingButton();
    }
  });

  // Listen for setting changes from Popup
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.extensionEnabled) {
      isExtensionEnabled = changes.extensionEnabled.newValue !== false;
      if (!isExtensionEnabled) {
        hideFloatingButton();
      }
    }
  });

  console.log(
    '%c[Social Media Downloader] Content script active on: ' + window.location.hostname,
    'background: #10b981; color: #ffffff; font-size: 13px; font-weight: bold; padding: 4px 8px; border-radius: 4px;'
  );

  const SVG_DOWNLOAD = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
  `;

  const SVG_LOADING = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity="0.3" stroke-width="2.5" fill="none"/>
      <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none"/>
    </svg>
  `;

  const SVG_CHECK = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  `;

  // Platform-Specific High-Resolution Image Resolver
  function getHighResImageUrl(imgElement) {
    let rawSrc = imgElement.currentSrc || imgElement.src || '';

    // Twitter / X Original Quality Transformer
    if (isTwitter && rawSrc.includes('twimg.com')) {
      if (rawSrc.includes('name=')) {
        return rawSrc.replace(/name=\w+/, 'name=orig');
      } else if (rawSrc.includes('?format=')) {
        return `${rawSrc}&name=orig`;
      }
    }

    // Pinterest Original Image Transformer
    if (isPinterest && rawSrc.includes('pinimg.com')) {
      return rawSrc.replace(/\/(236x|474x|564x|736x)\//, '/originals/');
    }

    // Parse srcset for Threads, Instagram, Facebook, and general sites
    const srcset = imgElement.getAttribute('srcset');
    if (srcset) {
      const candidates = srcset.split(',').map(item => {
        const parts = item.trim().split(/\s+/);
        const url = parts[0];
        const descriptor = parts[1] || '';
        let width = 0;
        if (descriptor.endsWith('w')) {
          width = parseInt(descriptor.slice(0, -1), 10) || 0;
        } else if (descriptor.endsWith('x')) {
          width = (parseFloat(descriptor.slice(0, -1)) || 1) * 1000;
        }
        return { url, width };
      });
      candidates.sort((a, b) => b.width - a.width);
      if (candidates.length > 0 && candidates[0].url) {
        return candidates[0].url;
      }
    }

    return rawSrc;
  }

  // Video Source Resolver
  function getVideoUrl(videoElement) {
    if (videoElement.src) return videoElement.src;
    const sources = videoElement.querySelectorAll('source');
    for (const source of sources) {
      if (source.src) return source.src;
    }
    return videoElement.currentSrc || null;
  }

  // Resolve media URL to downloadable string
  async function resolveMediaUrl(element, type) {
    let url = type === 'video' ? getVideoUrl(element) : getHighResImageUrl(element);
    if (!url) return null;

    if (url.startsWith('blob:')) {
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
      } catch (e) {
        console.warn('[Social Media Downloader] Blob fetch fallback:', e);
      }
    }
    return url;
  }

  // Global floating download button
  let activeFloatingBtn = null;
  let activeMediaElement = null;
  let activeMediaType = null;

  function createGlobalFloatingButton() {
    if (activeFloatingBtn) return activeFloatingBtn;

    const btn = document.createElement('button');
    btn.className = 'tmd-download-btn tmd-floating-btn';
    btn.setAttribute('type', 'button');
    btn.setAttribute('aria-label', '下載媒體');
    btn.setAttribute('data-tooltip', '下載媒體');
    btn.innerHTML = SVG_DOWNLOAD;

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (!activeMediaElement || !isExtensionEnabled) return;

      btn.classList.add('tmd-loading');
      btn.innerHTML = SVG_LOADING;
      btn.setAttribute('data-tooltip', '解析媒體中...');

      const type = activeMediaType;
      const mediaUrl = await resolveMediaUrl(activeMediaElement, type);

      if (!mediaUrl) {
        btn.classList.remove('tmd-loading');
        btn.innerHTML = SVG_DOWNLOAD;
        btn.setAttribute('data-tooltip', '無法解析連結');
        setTimeout(() => {
          btn.setAttribute('data-tooltip', type === 'video' ? '下載影片' : '下載圖片');
        }, 2000);
        return;
      }

      btn.setAttribute('data-tooltip', '下載中...');
      const ext = type === 'video' ? 'mp4' : 'jpg';

      chrome.runtime.sendMessage(
        {
          action: 'download',
          url: mediaUrl,
          type: type,
          ext: ext,
          site: isTwitter ? 'Twitter' : isInstagram ? 'Instagram' : isThreads ? 'Threads' : isFacebook ? 'Facebook' : isPinterest ? 'Pinterest' : 'Social'
        },
        (response) => {
          btn.classList.remove('tmd-loading');

          if (chrome.runtime.lastError || (response && !response.success)) {
            console.error('[Social Media Downloader] Download Error:', chrome.runtime.lastError || response?.error);
            btn.innerHTML = SVG_DOWNLOAD;
            btn.setAttribute('data-tooltip', '下載失敗');
            setTimeout(() => {
              btn.setAttribute('data-tooltip', type === 'video' ? '下載影片' : '下載圖片');
            }, 2000);
          } else {
            btn.classList.add('tmd-success');
            btn.innerHTML = SVG_CHECK;
            btn.setAttribute('data-tooltip', '已開始下載！');

            setTimeout(() => {
              btn.classList.remove('tmd-success');
              btn.innerHTML = SVG_DOWNLOAD;
              btn.setAttribute('data-tooltip', type === 'video' ? '下載影片' : '下載圖片');
            }, 2500);
          }
        }
      );
    });

    document.body.appendChild(btn);
    activeFloatingBtn = btn;
    return btn;
  }

  // Update floating button position
  function updateFloatingButtonPosition(mediaElement, type) {
    if (!isExtensionEnabled) {
      hideFloatingButton();
      return;
    }

    const btn = createGlobalFloatingButton();
    const rect = mediaElement.getBoundingClientRect();

    if (rect.width < 60 || rect.height < 60) {
      btn.style.display = 'none';
      return;
    }

    activeMediaElement = mediaElement;
    activeMediaType = type;

    const top = rect.top + 12;
    const right = rect.right - 50;

    btn.style.display = 'flex';
    btn.style.position = 'fixed';
    btn.style.top = `${Math.max(10, top)}px`;
    btn.style.left = `${right}px`;
    btn.style.zIndex = '2147483647';
    btn.setAttribute('data-tooltip', type === 'video' ? '下載影片' : '下載圖片');
  }

  // Hide floating button
  function hideFloatingButton() {
    if (activeFloatingBtn && !activeFloatingBtn.matches(':hover')) {
      activeFloatingBtn.style.display = 'none';
    }
  }

  // Global mousemove listener
  let hoverCheckTimer = null;
  document.addEventListener('mousemove', (e) => {
    if (!isExtensionEnabled) {
      hideFloatingButton();
      return;
    }

    const target = e.target;
    if (!target) return;

    if (target.closest('.tmd-download-btn')) return;

    let media = null;
    let type = 'image';

    if (target.tagName === 'IMG') {
      media = target;
      type = 'image';
    } else if (target.tagName === 'VIDEO') {
      media = target;
      type = 'video';
    } else {
      const parentMedia = target.closest('div, a, article, figure');
      if (parentMedia) {
        const img = parentMedia.querySelector('img');
        const video = parentMedia.querySelector('video');
        if (video) {
          media = video;
          type = 'video';
        } else if (img) {
          media = img;
          type = 'image';
        }
      }
    }

    if (media) {
      const rect = media.getBoundingClientRect();
      const width = media.naturalWidth || media.videoWidth || rect.width;
      const height = media.naturalHeight || media.videoHeight || rect.height;

      if (width >= 80 && height >= 80 && rect.width >= 80 && rect.height >= 80) {
        const alt = (media.alt || '').toLowerCase();
        if (!alt.includes('profile picture') && !alt.includes('頭像') && !alt.includes('大頭貼') && !alt.includes('avatar')) {
          updateFloatingButtonPosition(media, type);
          return;
        }
      }
    }

    if (hoverCheckTimer) clearTimeout(hoverCheckTimer);
    hoverCheckTimer = setTimeout(() => {
      hideFloatingButton();
    }, 400);
  }, { passive: true });

  window.addEventListener('scroll', () => {
    if (isExtensionEnabled && activeMediaElement && activeFloatingBtn && activeFloatingBtn.style.display !== 'none') {
      updateFloatingButtonPosition(activeMediaElement, activeMediaType);
    }
  }, { passive: true });

  window.addEventListener('resize', () => {
    if (isExtensionEnabled && activeMediaElement && activeFloatingBtn && activeFloatingBtn.style.display !== 'none') {
      updateFloatingButtonPosition(activeMediaElement, activeMediaType);
    }
  }, { passive: true });

})();
