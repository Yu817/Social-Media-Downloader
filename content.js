// Social Media Downloader Content Script - Multi-Platform (v1.3.6 Fiber Return Component Walker Version)

(function () {
  'use strict';

  // Only run in top window frame, ignore sub-iframes (e.g. Meta/Facebook tracking or auth iframes inside IG)
  if (window !== window.top) {
    return;
  }

  const host = window.location.hostname.toLowerCase();

  // Platform Detection
  const isThreads = host.includes('threads.net') || host.includes('threads.com');
  const isInstagram = host.includes('instagram.com');
  const isTwitter = host.includes('twitter.com') || host.includes('x.com');
  const isFacebook = host.includes('facebook.com');
  const isPinterest = host.includes('pinterest.com');

  let isExtensionEnabled = true;

  // Load initial settings with fallback
  try {
    if (chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['extensionEnabled'], (data) => {
        if (data && data.extensionEnabled === false) {
          isExtensionEnabled = false;
          hideFloatingButton();
        }
      });

      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes.extensionEnabled) {
          isExtensionEnabled = changes.extensionEnabled.newValue !== false;
          if (!isExtensionEnabled) {
            hideFloatingButton();
          }
        }
      });
    }
  } catch (e) {
    console.warn('[Social Media Downloader] Storage initialization skipped:', e);
  }

  console.log(
    '%c[Social Media Downloader v1.3.6] Active on: ' + window.location.hostname,
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

  // Clean video URL by removing DASH byte range parameters
  function cleanVideoUrl(url) {
    if (!url) return null;
    let clean = url;
    clean = clean.replace(/([?&])bytestart=\d+&?/g, '$1');
    clean = clean.replace(/([?&])byteend=\d+&?/g, '$1');
    clean = clean.replace(/[?&]$/, '');
    return clean;
  }

  // Multi-Layer Audio-Only Stream Detector (Includes Meta efg Base64 decoding)
  function isAudioOnlyUrl(url) {
    if (!url) return false;
    const lower = url.toLowerCase();

    if (lower.includes('dash_audio') || lower.includes('_a.mp4') || lower.includes('mime=audio') || lower.includes('audio_') || lower.includes('.mp3')) {
      return true;
    }

    if (lower.includes('efg=')) {
      try {
        const efgMatch = url.match(/[?&]efg=([^&]+)/);
        if (efgMatch && efgMatch[1]) {
          let b64 = decodeURIComponent(efgMatch[1]);
          let decoded = window.atob(b64);
          if (decoded.includes('audio') && !decoded.includes('video')) {
            return true;
          }
        }
      } catch (e) {}
    }

    return false;
  }

  // Multi-Layer Bulletproof Avatar Detector
  function isAvatarImage(img) {
    if (!img) return true;
    const src = (img.currentSrc || img.src || '').toLowerCase();
    const alt = (img.alt || '').toLowerCase();

    if (src.includes('t51.2885-19') || src.includes('t51.36379-19') || src.includes('s150x150') || src.includes('s320x320') || src.includes('/profile_images/')) {
      return true;
    }
    if (src.includes('/p100x100/') || src.includes('/p50x50/') || src.includes('/p160x160/') || src.includes('/75x75_')) {
      return true;
    }

    if (alt.includes('profile') || alt.includes('avatar') || alt.includes('頭像') || alt.includes('大頭貼') || alt.includes('写真') || alt.includes('perfil')) {
      return true;
    }

    if (img.closest('header')) return true;

    const parentAnchor = img.closest('a');
    if (parentAnchor) {
      const href = (parentAnchor.getAttribute('href') || '').toLowerCase();
      if (href && !href.includes('/p/') && !href.includes('/post/') && !href.includes('/status/') && !href.includes('/reel/') && !href.includes('/tv/')) {
        const aRect = parentAnchor.getBoundingClientRect();
        if (aRect.width < 160 && aRect.height < 160) {
          return true;
        }
      }
    }

    const rect = img.getBoundingClientRect();
    if (rect.width < 120 || rect.height < 120) {
      const article = img.closest('article, section, [role="article"]');
      if (article) {
        const otherImgs = article.querySelectorAll('img');
        for (const other of otherImgs) {
          const oRect = other.getBoundingClientRect();
          if (oRect.width > rect.width * 1.8 && oRect.height > rect.height * 1.8) {
            return true;
          }
        }
      }
    }

    return false;
  }

  // Verify image is fully loaded and rendered
  function isImageReady(img) {
    if (!img) return false;
    if (!img.complete) return false;
    if (!img.naturalWidth || img.naturalWidth < 80 || !img.naturalHeight || img.naturalHeight < 80) {
      return false;
    }
    const rect = img.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 80) return false;
    return true;
  }

  // Verify video is loaded and has video metadata/frames
  function isVideoReady(video) {
    if (!video) return false;
    if (video.readyState < 1 && !video.videoWidth) return false;
    const width = video.videoWidth || video.width || 0;
    const height = video.videoHeight || video.height || 0;
    if (width < 80 || height < 80) return false;
    const rect = video.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 80) return false;
    return true;
  }

  // Safe Props Inspector for video_versions array in Component State
  function searchPropsForVideoVersions(obj, depth = 0, visited = new WeakSet()) {
    if (!obj || depth > 6 || typeof obj !== 'object') return null;
    if (visited.has(obj)) return null;
    visited.add(obj);

    // Direct check for video_versions array
    if (Array.isArray(obj.video_versions) && obj.video_versions.length > 0) {
      for (const v of obj.video_versions) {
        if (v && v.url && typeof v.url === 'string' && !isAudioOnlyUrl(v.url)) {
          return cleanVideoUrl(v.url);
        }
      }
    }

    if (obj.progressive_url && typeof obj.progressive_url === 'string') {
      return cleanVideoUrl(obj.progressive_url);
    }

    // Inspect common container keys
    try {
      if (obj.item && typeof obj.item === 'object') {
        const found = searchPropsForVideoVersions(obj.item, depth + 1, visited);
        if (found) return found;
      }
      if (obj.media && typeof obj.media === 'object') {
        const found = searchPropsForVideoVersions(obj.media, depth + 1, visited);
        if (found) return found;
      }
      if (obj.story && typeof obj.story === 'object') {
        const found = searchPropsForVideoVersions(obj.story, depth + 1, visited);
        if (found) return found;
      }

      for (const k in obj) {
        if (k === 'children' || k.includes('video') || k.includes('story') || k.includes('item') || k.includes('media') || k.includes('Reel')) {
          const val = obj[k];
          if (val && typeof val === 'object') {
            const found = searchPropsForVideoVersions(val, depth + 1, visited);
            if (found) return found;
          }
        }
      }
    } catch (e) {}

    return null;
  }

  // Deep React Component Fiber Tree Walker (Climbs fiber.return up to 30 levels to extract IG Story Component state)
  function getUrlFromReactFiber(element) {
    let curr = element;
    let depth = 0;
    const visited = new WeakSet();

    while (curr && depth < 10 && curr !== document.body) {
      for (const key in curr) {
        if (key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$') || key.startsWith('__reactProps$')) {
          let fiber = curr[key];
          let fiberDepth = 0;
          
          while (fiber && fiberDepth < 30) {
            // Check memoizedProps / pendingProps
            const props = fiber.memoizedProps || fiber.pendingProps;
            if (props) {
              const found = searchPropsForVideoVersions(props, 0, visited);
              if (found) return found;
            }

            // Check stateNode Component instance props/state
            if (fiber.stateNode && typeof fiber.stateNode === 'object') {
              const compProps = fiber.stateNode.props || fiber.stateNode.state;
              if (compProps) {
                const found = searchPropsForVideoVersions(compProps, 0, visited);
                if (found) return found;
              }
            }

            fiber = fiber.return;
            fiberDepth++;
          }
        }
      }
      curr = curr.parentElement;
      depth++;
    }
    return null;
  }

  // Fetch Instagram post/reel progressive MP4 via Info API
  async function fetchInstagramProgressiveVideo(shortcode) {
    if (!shortcode) return null;
    try {
      const apiUrl = `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`;
      const res = await fetch(apiUrl, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      if (res.ok) {
        const data = await res.json();
        const items = data?.graphql?.shortcode_media || data?.items?.[0];
        if (items && items.video_versions && items.video_versions.length > 0) {
          return cleanVideoUrl(items.video_versions[0].url);
        }
      }
    } catch (e) {
      console.warn('[Social Media Downloader] IG info API lookup skipped:', e);
    }
    return null;
  }

  // Fetch Instagram Story Reel Media API by username/user_id for Story video with full audio
  async function fetchInstagramStoryVideo(username, storyId) {
    if (!username && !storyId) return null;
    try {
      const targetId = username || storyId;
      const apiUrl = `https://www.instagram.com/api/v1/feed/reels_media/?reel_ids=${targetId}`;
      const res = await fetch(apiUrl, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      if (res.ok) {
        const data = await res.json();
        const reels = data?.reels || data?.reels_media;
        if (reels) {
          for (const key in reels) {
            const items = reels[key]?.items;
            if (Array.isArray(items)) {
              for (const item of items) {
                if (item.video_versions && item.video_versions.length > 0) {
                  return cleanVideoUrl(item.video_versions[0].url);
                }
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('[Social Media Downloader] IG Story Reel API lookup skipped:', e);
    }
    return null;
  }

  // Extract recent video MP4 URL from Performance network resource logs (prioritizes combined progressive stream)
  function getNetworkVideoUrl() {
    try {
      const entries = performance.getEntriesByType('resource');
      let progressiveUrl = null;
      let fallbackVideoUrl = null;

      for (let i = entries.length - 1; i >= 0; i--) {
        const name = entries[i].name;
        if (isAudioOnlyUrl(name)) continue;

        if ((name.includes('.mp4') || name.includes('/v/t51.') || name.includes('/v/t64.')) && (name.includes('cdninstagram.com') || name.includes('fbcdn.net') || name.includes('twimg.com'))) {
          const clean = cleanVideoUrl(name);
          
          if (name.includes('_n.mp4') || name.includes('progressive') || name.includes('t51.2885-15')) {
            progressiveUrl = clean;
            break;
          }
          if (!fallbackVideoUrl) {
            fallbackVideoUrl = clean;
          }
        }
      }
      return progressiveUrl || fallbackVideoUrl;
    } catch (e) {
      console.warn('[Social Media Downloader] Performance entry lookup error:', e);
    }
    return null;
  }

  // Find best media element
  function findBestMediaElement(target) {
    if (target.tagName === 'IMG' && !isAvatarImage(target) && isImageReady(target)) {
      return { media: target, type: 'image' };
    }
    if (target.tagName === 'VIDEO' && isVideoReady(target)) {
      return { media: target, type: 'video' };
    }

    let parent = target.closest ? target.closest('div, li, article, figure, section') : null;
    let depth = 0;

    while (parent && depth < 5 && parent !== document.body) {
      const videos = parent.querySelectorAll('video');
      for (const v of videos) {
        if (isVideoReady(v)) {
          return { media: v, type: 'video' };
        }
      }

      const images = parent.querySelectorAll('img');
      let bestImg = null;
      let maxArea = 0;

      for (const img of images) {
        if (!isAvatarImage(img) && isImageReady(img)) {
          const rect = img.getBoundingClientRect();
          const area = rect.width * rect.height;
          if (area > maxArea) {
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

  // Video Source Resolver (Prioritizes Combined Video+Audio Progressive Stream)
  async function getVideoUrl(videoElement) {
    // 1. Extract combined progressive MP4 URL from React Component Fiber Tree (Highest Priority)
    const reactUrl = getUrlFromReactFiber(videoElement);
    if (reactUrl && !isAudioOnlyUrl(reactUrl)) return reactUrl;

    // 2. Query Instagram APIs (Post/Reel shortcode or Story username/reelId)
    if (isInstagram) {
      const pathname = window.location.pathname;

      // Handle IG Stories (/stories/username/story_id/)
      const storyMatch = pathname.match(/\/stories\/([^\/]+)\/(\d+)?/);
      if (storyMatch) {
        const username = storyMatch[1];
        const storyId = storyMatch[2];
        const storyVideoUrl = await fetchInstagramStoryVideo(username, storyId);
        if (storyVideoUrl) return storyVideoUrl;
      }

      // Handle IG Posts & Reels (/p/shortcode/ or /reel/shortcode/)
      const postMatch = pathname.match(/\/(p|reel)\/([A-Za-z0-9_-]+)/);
      if (postMatch && postMatch[2]) {
        const postVideoUrl = await fetchInstagramProgressiveVideo(postMatch[2]);
        if (postVideoUrl) return postVideoUrl;
      }
    }

    // 3. Direct src if not blob and not audio-only
    if (videoElement.src && !videoElement.src.startsWith('blob:') && !isAudioOnlyUrl(videoElement.src)) {
      return cleanVideoUrl(videoElement.src);
    }
    if (videoElement.currentSrc && !videoElement.currentSrc.startsWith('blob:') && !isAudioOnlyUrl(videoElement.currentSrc)) {
      return cleanVideoUrl(videoElement.currentSrc);
    }

    // 4. Check <source> tags
    const sources = videoElement.querySelectorAll('source');
    for (const source of sources) {
      if (source.src && !source.src.startsWith('blob:') && !isAudioOnlyUrl(source.src)) {
        return cleanVideoUrl(source.src);
      }
    }

    // 5. Fallback to Performance resource entries for MP4
    const networkUrl = getNetworkVideoUrl();
    if (networkUrl) return networkUrl;

    return cleanVideoUrl(videoElement.currentSrc || videoElement.src || null);
  }

  // Resolve media URL
  async function resolveMediaUrl(element, type) {
    let url = type === 'video' ? await getVideoUrl(element) : getHighResImageUrl(element);
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

      try {
        if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
          throw new Error('Chrome extension runtime disconnected.');
        }

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
              console.warn('[Social Media Downloader] Message response error, triggering silent fallback:', chrome.runtime.lastError || response?.error);
              triggerSilentDirectDownload(mediaUrl, type, ext, btn);
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
      } catch (err) {
        console.warn('[Social Media Downloader] Extension disconnected error, triggering silent download fallback:', err);
        triggerSilentDirectDownload(mediaUrl, type, ext, btn);
      }
    });

    document.body.appendChild(btn);
    activeFloatingBtn = btn;
    return btn;
  }

  // Silent Direct Download Helper
  async function triggerSilentDirectDownload(mediaUrl, type, ext, btn) {
    btn.classList.remove('tmd-loading');

    try {
      const res = await fetch(mediaUrl);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `Social_${type}_${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
    } catch (e) {
      console.warn('[Social Media Downloader] Silent blob fallback error:', e);
    }

    btn.classList.add('tmd-success');
    btn.innerHTML = SVG_CHECK;
    btn.setAttribute('data-tooltip', '已開始下載！');

    setTimeout(() => {
      btn.classList.remove('tmd-success');
      btn.innerHTML = SVG_DOWNLOAD;
      btn.setAttribute('data-tooltip', type === 'video' ? '下載影片' : '下載圖片');
    }, 2500);
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

  // Global mousemove listener with strict hover bounds and readiness checks
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
      const rect = result.media.getBoundingClientRect();
      const padding = 15;

      if (
        e.clientX >= rect.left - padding &&
        e.clientX <= rect.right + padding &&
        e.clientY >= rect.top - padding &&
        e.clientY <= rect.bottom + padding
      ) {
        updateFloatingButtonPosition(result.media, result.type);
        return;
      }
    }

    if (hoverCheckTimer) clearTimeout(hoverCheckTimer);
    hoverCheckTimer = setTimeout(() => {
      hideFloatingButton();
    }, 300);
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
