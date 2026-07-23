// Social Media Downloader Content Script - Multi-Platform (v1.2.3 Unfragmented Stream Version)

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
    '%c[Social Media Downloader v1.2.3] Active on: ' + window.location.hostname,
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

  // Clean video URL by removing byte range chunk parameters
  function cleanVideoUrl(url) {
    if (!url) return null;
    let clean = url;
    // Strip Instagram DASH byte range parameters that fragment MP4 files
    clean = clean.replace(/([?&])bytestart=\d+&?/g, '$1');
    clean = clean.replace(/([?&])byteend=\d+&?/g, '$1');
    clean = clean.replace(/[?&]$/, '');
    return clean;
  }

  // Extract full unfragmented MP4 URL from React Fiber props (Meta/IG/Threads SPA)
  function getUrlFromReactFiber(element) {
    let curr = element;
    let depth = 0;
    while (curr && depth < 8 && curr !== document.body) {
      for (const key in curr) {
        if (key.startsWith('__reactProps$') || key.startsWith('__reactFiber$')) {
          try {
            const val = curr[key];
            const jsonStr = JSON.stringify(val);
            
            // Search for video_versions array in IG Stories
            const storyMatch = jsonStr.match(/"video_versions"\s*:\s*\[\s*\{[^}]*"url"\s*:\s*"([^"]+)"/i);
            if (storyMatch && storyMatch[1]) {
              let storyUrl = storyMatch[1].replace(/\\/g, '');
              try { storyUrl = JSON.parse(`"${storyUrl}"`); } catch(e) {}
              return cleanVideoUrl(storyUrl);
            }

            // General mp4 regex search
            const match = jsonStr.match(/https?:\\?\/\\?\/[^\s"']+(\.mp4|\/v\/t51|\/v\/t64)[^\s"']*/i);
            if (match && match[0]) {
              let cleanUrl = match[0].replace(/\\/g, '');
              try { cleanUrl = JSON.parse(`"${cleanUrl}"`); } catch(e) {}
              return cleanVideoUrl(cleanUrl);
            }
          } catch (e) {}
        }
      }
      curr = curr.parentElement;
      depth++;
    }
    return null;
  }

  // Extract recent video MP4 URL from Performance network resource logs
  function getNetworkVideoUrl() {
    try {
      const entries = performance.getEntriesByType('resource');
      for (let i = entries.length - 1; i >= 0; i--) {
        const name = entries[i].name;
        if ((name.includes('.mp4') || name.includes('/v/t51.') || name.includes('/v/t64.')) && (name.includes('cdninstagram.com') || name.includes('fbcdn.net') || name.includes('twimg.com'))) {
          return cleanVideoUrl(name);
        }
      }
    } catch (e) {
      console.warn('[Social Media Downloader] Performance entry lookup error:', e);
    }
    return null;
  }

  // Helper to identify avatar images
  function isAvatarImage(img) {
    const rect = img.getBoundingClientRect();
    if (rect.width < 85 || rect.height < 85) return true;

    const alt = (img.alt || '').toLowerCase();
    if (alt.includes('profile picture') || alt.includes('頭像') || alt.includes('大頭貼') || alt.includes('avatar') || alt.includes('profile photo')) {
      return true;
    }

    if (img.closest('header')) return true;

    const parentAnchor = img.closest('a');
    if (parentAnchor) {
      const aRect = parentAnchor.getBoundingClientRect();
      if (aRect.width < 85 || aRect.height < 85) return true;
    }

    return false;
  }

  // Find best media element
  function findBestMediaElement(target) {
    if (target.tagName === 'IMG' && !isAvatarImage(target)) {
      return { media: target, type: 'image' };
    }
    if (target.tagName === 'VIDEO') {
      return { media: target, type: 'video' };
    }

    let parent = target.closest ? target.closest('div, li, article, figure, section') : null;
    let depth = 0;

    while (parent && depth < 5 && parent !== document.body) {
      const videos = parent.querySelectorAll('video');
      for (const v of videos) {
        const rect = v.getBoundingClientRect();
        if (rect.width >= 90 && rect.height >= 90) {
          return { media: v, type: 'video' };
        }
      }

      const images = parent.querySelectorAll('img');
      let bestImg = null;
      let maxArea = 0;

      for (const img of images) {
        if (!isAvatarImage(img)) {
          const rect = img.getBoundingClientRect();
          const area = rect.width * rect.height;
          if (rect.width >= 90 && rect.height >= 90 && area > maxArea) {
            maxArea = area;
            bestImg = img;
          }
        }
      }

      if (bestImg) {
        return { media: bestImg, type: 'image' };
      }

      parent = parent.parentElement;
      depth++;
    }

    return null;
  }

  // Platform-Specific High-Resolution Image Resolver
  function getHighResImageUrl(imgElement) {
    let rawSrc = imgElement.currentSrc || imgElement.src || '';

    if (isTwitter && rawSrc.includes('twimg.com')) {
      if (rawSrc.includes('name=')) {
        return rawSrc.replace(/name=\w+/, 'name=orig');
      } else if (rawSrc.includes('?format=')) {
        return `${rawSrc}&name=orig`;
      }
    }

    if (isPinterest && rawSrc.includes('pinimg.com')) {
      return rawSrc.replace(/\/(236x|474x|564x|736x)\//, '/originals/');
    }

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

  // Video Source Resolver (Prioritizes complete unfragmented MP4 URLs)
  function getVideoUrl(videoElement) {
    // 1. Extract original MP4 URL from React Fiber props (Highest Priority for IG Stories)
    const reactUrl = getUrlFromReactFiber(videoElement);
    if (reactUrl) return reactUrl;

    // 2. Direct src if not blob
    if (videoElement.src && !videoElement.src.startsWith('blob:')) return cleanVideoUrl(videoElement.src);
    if (videoElement.currentSrc && !videoElement.currentSrc.startsWith('blob:')) return cleanVideoUrl(videoElement.currentSrc);

    // 3. Check <source> tags
    const sources = videoElement.querySelectorAll('source');
    for (const source of sources) {
      if (source.src && !source.src.startsWith('blob:')) return cleanVideoUrl(source.src);
    }

    // 4. Fallback to Performance resource entries for MP4
    const networkUrl = getNetworkVideoUrl();
    if (networkUrl) return networkUrl;

    return cleanVideoUrl(videoElement.currentSrc || videoElement.src || null);
  }

  // Resolve media URL
  async function resolveMediaUrl(element, type) {
    let url = type === 'video' ? getVideoUrl(element) : getHighResImageUrl(element);
    if (!url) return null;

    if (url.startsWith('blob:')) {
      const netFallback = getNetworkVideoUrl();
      if (netFallback) {
        console.log('[Social Media Downloader] Replaced blob URL with network MP4 fallback:', netFallback);
        return netFallback;
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

    const result = findBestMediaElement(target);
    if (result && result.media) {
      updateFloatingButtonPosition(result.media, result.type);
      return;
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
