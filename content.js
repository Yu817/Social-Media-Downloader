// Social Media Downloader Content Script - Multi-Platform (v1.5.1 Direct-Hover-Only Engine)

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
    '%c[Social Media Downloader v1.5.1] Active on: ' + window.location.hostname,
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

  // =========================================================================
  // STRICT AVATAR / NON-CONTENT DETECTOR
  // Returns true if the image should be IGNORED (is a profile pic, icon, etc.)
  // =========================================================================
  function isAvatarOrIcon(img) {
    if (!img) return true;

    const src = (img.currentSrc || img.src || '').toLowerCase();
    const alt = (img.alt || '').toLowerCase();
    const classList = (img.className || '');
    const role = (img.getAttribute('role') || '').toLowerCase();
    const ariaLabel = (img.getAttribute('aria-label') || '').toLowerCase();

    // 1. Role or aria-label signals it's a profile avatar or logo icon
    if (role === 'img' && (ariaLabel.includes('profile') || ariaLabel.includes('avatar') || ariaLabel.includes('logo') || ariaLabel.includes('頭像') || ariaLabel.includes('大頭貼'))) return true;

    // 2. Profile avatars are tiny (24px - 48px circles).
    // Real post media on Threads/IG/Twitter are almost always >= 50px.
    const rect = img.getBoundingClientRect();
    if (rect.width < 50 || rect.height < 50) return true;

    // 3. CDN URL patterns that are specific to avatars (Meta/IG/Twitter)
    if (
      src.includes('t51.2885-19') || src.includes('t51.36379-19') ||
      src.includes('/profile_images/') ||
      src.includes('/p100x100/') || src.includes('/p50x50/') || src.includes('/p160x160/') ||
      src.includes('/75x75_')
    ) return true;

    // 4. Alt text keywords for avatars
    if (
      alt.includes('profile photo') || alt.includes('profile picture') ||
      alt.includes('avatar') || alt.includes('頭像') || alt.includes('大頭貼') ||
      alt.includes('photo de profil')
    ) return true;

    // 5. Class-based heuristics for avatars
    if (
      classList.includes('Avatar') || classList.includes('avatar') ||
      classList.includes('ProfilePhoto') || classList.includes('_aadp')
    ) return true;

    // 6. If nested inside a small user-profile anchor (<75px)
    const parentAnchor = img.closest('a');
    if (parentAnchor) {
      const href = (parentAnchor.getAttribute('href') || '').toLowerCase();
      const isPostLink = href.includes('/p/') || href.includes('/post/') || href.includes('/status/') || href.includes('/reel/') || href.includes('/tv/') || href.includes('/t/');
      if (!isPostLink && (href.startsWith('/@') || href.includes('instagram.com/') || href.includes('twitter.com/'))) {
        const aRect = parentAnchor.getBoundingClientRect();
        if (aRect.width < 75 && aRect.height < 75) return true;
      }
    }

    return false;
  }

  // Is the image fully rendered and large enough to be post content?
  function isContentImage(img) {
    if (!img) return false;
    if (!img.complete || !img.naturalWidth || img.naturalWidth < 80 || !img.naturalHeight || img.naturalHeight < 80) return false;
    const rect = img.getBoundingClientRect();
    return rect.width >= 50 && rect.height >= 50;
  }

  // Is the video fully loaded with real video dimensions?
  function isContentVideo(video) {
    if (!video) return false;
    const width = video.videoWidth || 0;
    const height = video.videoHeight || 0;
    const rect = video.getBoundingClientRect();
    if (rect.width < 50 || rect.height < 50) return false;
    if (video.readyState < 1 && width === 0) return false;
    return true;
  }

  // Safe Props Inspector for video_versions array in Component State
  function searchPropsForVideoVersions(obj, depth = 0, visited = new WeakSet()) {
    if (!obj || depth > 8 || typeof obj !== 'object') return null;
    if (visited.has(obj)) return null;
    visited.add(obj);

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

    try {
      // Check hooks memoizedState linked list
      if (obj.memoizedState && typeof obj.memoizedState === 'object') {
        const found = searchPropsForVideoVersions(obj.memoizedState, depth + 1, visited);
        if (found) return found;
      }
      if (obj.next && typeof obj.next === 'object') {
        const found = searchPropsForVideoVersions(obj.next, depth + 1, visited);
        if (found) return found;
      }

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
        if (
          k === 'children' || k.includes('video') || k.includes('story') ||
          k.includes('item') || k.includes('media') || k.includes('Reel') ||
          k === 'memoizedProps' || k === 'pendingProps' || k === 'stateNode'
        ) {
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

  // Deep React Component Fiber Tree Walker
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
            const props = fiber.memoizedProps || fiber.pendingProps;
            if (props) {
              const found = searchPropsForVideoVersions(props, 0, visited);
              if (found) return found;
            }

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

  // Shallow React Fiber Walker: Scans element and 3 DOM parents up to 12 fiber.return levels.
  // Used for IG Stories & Highlights to extract progressive video_versions with audio.
  function getUrlFromReactFiberShallow(element) {
    let curr = element;
    let domDepth = 0;
    const visited = new WeakSet();

    while (curr && domDepth < 4 && curr !== document.body) {
      for (const key in curr) {
        if (key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$') || key.startsWith('__reactProps$')) {
          let fiber = curr[key];
          let fiberDepth = 0;

          while (fiber && fiberDepth < 12) {
            const props = fiber.memoizedProps || fiber.pendingProps;
            if (props) {
              const found = searchPropsForVideoVersions(props, 0, visited);
              if (found) return found;
            }
            fiber = fiber.return;
            fiberDepth++;
          }
        }
      }
      curr = curr.parentElement;
      domDepth++;
    }
    return null;
  }

  function collectReactVideoRecords(obj, records, depth = 0, visited = new WeakSet()) {
    if (!obj || depth > 8 || typeof obj !== 'object') return;
    if (visited.has(obj)) return;
    visited.add(obj);

    try {
      if (Array.isArray(obj.video_versions) || obj.video_url || obj.progressive_url) {
        const url = obj.progressive_url && !isAudioOnlyUrl(obj.progressive_url)
          ? cleanVideoUrl(obj.progressive_url)
          : getInstagramVideoUrl(obj);
        if (url) {
          const versions = Array.isArray(obj.video_versions) ? [...obj.video_versions] : [];
          versions.sort((a, b) => (b.width || 0) - (a.width || 0));
          const version = versions.find(item => item?.url && !isAudioOnlyUrl(item.url));
          records.push({
            url,
            duration: getInstagramItemDuration(obj),
            width: Number(obj.original_width ?? obj.width ?? version?.width) || null,
            height: Number(obj.original_height ?? obj.height ?? version?.height) || null
          });
        }
      }

      if (obj.memoizedState && typeof obj.memoizedState === 'object') {
        collectReactVideoRecords(obj.memoizedState, records, depth + 1, visited);
      }
      if (obj.next && typeof obj.next === 'object') {
        collectReactVideoRecords(obj.next, records, depth + 1, visited);
      }
      if (obj.item && typeof obj.item === 'object') {
        collectReactVideoRecords(obj.item, records, depth + 1, visited);
      }
      if (obj.media && typeof obj.media === 'object') {
        collectReactVideoRecords(obj.media, records, depth + 1, visited);
      }
      if (obj.story && typeof obj.story === 'object') {
        collectReactVideoRecords(obj.story, records, depth + 1, visited);
      }

      for (const key of Object.keys(obj)) {
        if (
          key === 'children' || key.includes('video') || key.includes('story') ||
          key.includes('item') || key.includes('media') || key.includes('Reel') ||
          key === 'memoizedProps' || key === 'pendingProps' || key === 'stateNode'
        ) {
          const value = obj[key];
          if (value && typeof value === 'object') {
            collectReactVideoRecords(value, records, depth + 1, visited);
          }
        }
      }
    } catch (e) {}
  }

  // Return a Fiber URL only when the current DOM video has a unique metadata
  // match. This avoids taking the first preloaded highlight item.
  function getReactVideoUrlByMetadata(videoElement) {
    if (!videoElement) return null;

    const records = [];
    const visited = new WeakSet();
    let curr = videoElement;
    let domDepth = 0;

    while (curr && domDepth < 4 && curr !== document.body) {
      for (const key in curr) {
        if (!key.startsWith('__reactFiber$') && !key.startsWith('__reactInternalInstance$') && !key.startsWith('__reactProps$')) continue;

        let fiber = curr[key];
        let fiberDepth = 0;
        while (fiber && fiberDepth < 12) {
          const props = fiber.memoizedProps || fiber.pendingProps;
          if (props) collectReactVideoRecords(props, records, 0, visited);

          if (fiber.stateNode && typeof fiber.stateNode === 'object') {
            const stateProps = fiber.stateNode.props || fiber.stateNode.state;
            if (stateProps) collectReactVideoRecords(stateProps, records, 0, visited);
          }

          fiber = fiber.return;
          fiberDepth++;
        }
      }
      curr = curr.parentElement;
      domDepth++;
    }

    const uniqueRecords = [...new Map(records.map(record => [record.url, record])).values()];
    const currentDuration = Number(videoElement.duration);
    if (Number.isFinite(currentDuration) && currentDuration > 0) {
      const durationMatches = uniqueRecords.filter(record =>
        record.duration !== null && Math.abs(record.duration - currentDuration) < 0.75
      );
      if (durationMatches.length === 1) return durationMatches[0].url;
    }

    const currentWidth = Number(videoElement.videoWidth);
    const currentHeight = Number(videoElement.videoHeight);
    if (currentWidth > 0 && currentHeight > 0) {
      const dimensionMatches = uniqueRecords.filter(record =>
        record.width === currentWidth && record.height === currentHeight
      );
      if (dimensionMatches.length === 1) return dimensionMatches[0].url;
    }

    return null;
  }

  // Scan window.__additionalData and Redux stores for story video URL
  // storyId: when provided, only return a URL for that specific story item
  function scanWindowForStoryVideoUrl(storyId) {
    try {
      const ad = window.__additionalData;
      if (ad) {
        const url = deepFindVideoUrl(ad, new WeakSet(), 0, storyId);
        if (url) return url;
      }
    } catch (e) {}

    try {
      const storeKeys = ['__reduxStore', '__reactStore', '__store'];
      for (const k of storeKeys) {
        if (window[k] && typeof window[k].getState === 'function') {
          const state = window[k].getState();
          const url = deepFindVideoUrl(state, new WeakSet(), 0, storyId);
          if (url) return url;
        }
      }
    } catch (e) {}

    return null;
  }

  // Deep-scan any object tree for IG video_versions URLs
  // storyId: when provided, only return a URL from an item whose pk/id matches
  function deepFindVideoUrl(obj, visited, depth = 0, storyId = null) {
    if (!obj || depth > 8 || typeof obj !== 'object') return null;
    if (visited.has(obj)) return null;
    visited.add(obj);

    if (Array.isArray(obj.video_versions) && obj.video_versions.length > 0) {
      // If storyId provided, check that this object's pk or id matches
      if (storyId) {
        const itemPk = String(obj.pk || obj.id || '');
        if (itemPk && itemPk !== String(storyId)) {
          // pk exists but doesn't match — skip this item
          return null;
        }
      }
      const sorted = [...obj.video_versions].sort((a, b) => (b.width || 0) - (a.width || 0));
      for (const v of sorted) {
        if (v && v.url && !isAudioOnlyUrl(v.url)) {
          return cleanVideoUrl(v.url);
        }
      }
    }

    try {
      for (const key of Object.keys(obj)) {
        if (
          key === 'video_versions' || key === 'items' || key === 'story' ||
          key === 'media' || key === 'reel' || key === 'reels'
        ) {
          const result = deepFindVideoUrl(obj[key], visited, depth + 1, storyId);
          if (result) return result;
        }
      }
    } catch (e) {}

    return null;
  }

  // Resolve IG username to numeric user_id (needed for reels_media API)
  async function resolveUserId(username) {
    if (!username || username === 'highlights' || username.startsWith('highlight')) return null;
    try {
      const res = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`, {
        credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-IG-App-ID': '936619743392459' }
      });
      if (res.ok) {
        const data = await res.json();
        const userId = data?.data?.user?.id || data?.user?.pk;
        if (userId) {
          console.log('[Social Media Downloader] Resolved user_id:', username, '->', userId);
          return String(userId);
        }
      }
    } catch (e) {
      console.warn('[Social Media Downloader] Failed to resolve user_id for:', username, e);
    }
    return null;
  }

  function getStoryProgressRatio(segment) {
    const nodes = [segment, ...segment.querySelectorAll('*')];
    const ratios = [];

    for (const node of nodes) {
      const ariaValue = Number(node.getAttribute?.('aria-valuenow'));
      const ariaMax = Number(node.getAttribute?.('aria-valuemax'));
      if (Number.isFinite(ariaValue) && Number.isFinite(ariaMax) && ariaMax > 0) {
        ratios.push(Math.max(0, Math.min(1, ariaValue / ariaMax)));
      }

      const inlineTransform = String(node.style?.transform || '');
      const computedTransform = String(window.getComputedStyle?.(node)?.transform || '');
      const transform = inlineTransform || computedTransform;
      const scaleMatch = transform.match(/scalex\(\s*([0-9.]+)\s*\)/i);
      const matrixMatch = transform.match(/^matrix\(\s*([0-9.]+)/i);
      const scale = Number(scaleMatch?.[1] ?? matrixMatch?.[1]);
      if (Number.isFinite(scale) && scale >= 0 && scale <= 1) ratios.push(scale);

      const widthMatch = String(node.style?.width || '').match(/^([0-9.]+)%$/);
      if (widthMatch) {
        const widthRatio = Number(widthMatch[1]) / 100;
        if (widthRatio >= 0 && widthRatio <= 1) ratios.push(widthRatio);
      }
    }

    if (ratios.length === 0) return null;
    return Math.min(...ratios);
  }

  function getStoryIndexFromSegments(segments) {
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (
        segment.getAttribute('aria-current') === 'true' ||
        segment.getAttribute('aria-selected') === 'true' ||
        segment.dataset?.active === 'true'
      ) {
        return i;
      }
    }

    const ratios = segments.map(getStoryProgressRatio);
    const partialIndex = ratios.findIndex(ratio => ratio !== null && ratio > 0.01 && ratio < 0.99);
    if (partialIndex >= 0) return partialIndex;

    // Between animation frames the active segment can still be at zero.
    // The first empty segment after completed segments is then the current one.
    let completedCount = 0;
    while (completedCount < ratios.length && ratios[completedCount] !== null && ratios[completedCount] >= 0.99) {
      completedCount++;
    }
    if (completedCount < ratios.length && ratios.slice(completedCount).some(ratio => ratio !== null)) {
      return completedCount;
    }

    return -1;
  }

  // Get active slide index for stories & highlights from the visible top
  // progress segments. Instagram changes class names frequently, so use
  // geometry, ARIA state and computed progress instead of class names alone.
  function getActiveStoryIndex(mediaElement = null, totalItems = 0) {
    try {
      const mediaRect = mediaElement?.getBoundingClientRect?.();
      const selectors = 'div._ac3r, div._aa67, [role="tablist"], [role="progressbar"]';
      const explicitContainers = [...document.querySelectorAll(selectors)];
      const geometricContainers = totalItems > 1
        ? [...document.querySelectorAll('div')].filter(container => {
            if (container.children.length !== totalItems) return false;
            const rect = container.getBoundingClientRect();
            if (rect.width < 100 || rect.height <= 0 || rect.height > 32) return false;
            if (!mediaRect) return true;
            return rect.bottom >= mediaRect.top - 80 && rect.top <= mediaRect.top + 120 &&
              rect.left < mediaRect.right && rect.right > mediaRect.left;
          })
        : [];

      const seen = new Set();
      for (const container of [...explicitContainers, ...geometricContainers]) {
        if (seen.has(container)) continue;
        seen.add(container);

        if (container.getAttribute?.('role') === 'progressbar') {
          const progressBars = [...document.querySelectorAll('[role="progressbar"]')];
          if (totalItems > 1 && progressBars.length === totalItems) {
            const index = getStoryIndexFromSegments(progressBars);
            if (index >= 0) return index;
          }
          continue;
        }

        const bars = [...container.children];
        if (bars.length < 2) continue;
        if (totalItems > 1 && bars.length !== totalItems) continue;
        const index = getStoryIndexFromSegments(bars);
        if (index >= 0) return index;
      }
    } catch (e) {}
    return -1;
  }

  // Fetch the current IG story or highlight item via the API v1 endpoint (uses session cookie)
  // Handles both regular user stories (numeric user_id) and IG Highlights (highlight:HIGHLIGHT_ID)
  async function fetchStoryItemFromApi(username, storyId, mediaElement = null) {
    if (!username && !storyId) return null;

    const isHighlightTarget = username === 'highlights' || (username && username.startsWith('highlight'));
    let targetId;
    if (isHighlightTarget) {
      const rawId = storyId || username;
      targetId = rawId.startsWith('highlight:') ? rawId : `highlight:${rawId}`;
      console.log('[Social Media Downloader] Fetching IG Highlight Reel API for:', targetId);
    } else {
      const userId = await resolveUserId(username);
      if (!userId && username) {
        console.warn('[Social Media Downloader] Could not resolve user_id, using fallback target:', username);
      }
      targetId = userId || username;
    }

    const endpoints = [
      `https://www.instagram.com/api/v1/feed/reels_media/?reel_ids=${targetId}`,
    ];
    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          credentials: 'include',
          headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-IG-App-ID': '936619743392459' }
        });
        if (!res.ok) continue;
        const data = await res.json();

        // Collect all story items from response
        const allItems = [];
        const reels = data?.reels || data?.reels_media || {};
        for (const key of Object.keys(reels)) {
          const items = reels[key]?.items;
          if (Array.isArray(items)) allItems.push(...items);
        }
        const items2 = data?.reel?.items || data?.items;
        if (Array.isArray(items2)) allItems.push(...items2);

        const uniqueItems = [];
        const seenItemKeys = new Set();
        for (const item of allItems) {
          const key = String(
            item?.pk || item?.id || item?.video_versions?.[0]?.url ||
            item?.image_versions2?.candidates?.[0]?.url || ''
          );
          if (key && seenItemKeys.has(key)) continue;
          if (key) seenItemKeys.add(key);
          uniqueItems.push(item);
        }
        allItems.length = 0;
        allItems.push(...uniqueItems);

        if (allItems.length === 0) {
          console.warn('[Social Media Downloader] IG Highlight API returned no items:', targetId);
          continue;
        }

        // 1. If we have a specific story_id (for normal user stories), find matching item first
        if (storyId && username !== 'highlights') {
          const exactItem = allItems.find(item =>
            String(item?.pk) === String(storyId) ||
            String(item?.id) === String(storyId)
          );
          const exactUrl = getInstagramMediaUrl(exactItem);
          if (exactUrl) {
            console.log('[Social Media Downloader] Matched story item by pk/id:', exactItem.pk);
            return exactUrl;
          }
        }

        // 2. For Highlights or multi-item reels: match the current DOM media
        // first, then use the active progress-bar slide index.
        const metadataIdx = getInstagramItemIndexByMetadata(mediaElement, allItems);
        const domIdx = getInstagramCarouselIndex(mediaElement, allItems.length);
        const progressIdx = getActiveStoryIndex(mediaElement, allItems.length);
        const activeIdx = metadataIdx >= 0 ? metadataIdx : domIdx >= 0 ? domIdx : progressIdx;
        if (activeIdx >= 0 && activeIdx < allItems.length) {
          const activeItem = allItems[activeIdx];
          const activeUrl = getInstagramMediaUrl(activeItem);
          if (activeUrl) {
            console.log('[Social Media Downloader] Matched highlight story item by active slide index:', activeIdx);
            return activeUrl;
          }
        }

        console.warn('[Social Media Downloader] IG Highlight item index unavailable, using fallback item matching:', {
          itemCount: allItems.length,
          metadataIdx,
          domIdx,
          progressIdx
        });

        // 3. Fallback: If mediaElement itself has a direct URL (for non-blob elements)
        if (mediaElement) {
          if (mediaElement.tagName === 'VIDEO') {
            const directVideo = getDirectVideoUrl(mediaElement);
            if (directVideo) return directVideo;
          } else if (mediaElement.tagName === 'IMG') {
            const directImg = getHighResImageUrl(mediaElement);
            if (directImg) return directImg;
          }
        }

        // 4. Fallback across all items in Highlight: find first matching item or item 0
        for (const item of allItems) {
          const fallbackUrl = getInstagramMediaUrl(item);
          if (fallbackUrl) return fallbackUrl;
        }
      } catch (e) {
        console.warn('[Social Media Downloader] IG Story/Highlight API endpoint failed:', url, e);
      }
    }
    return null;
  }

  function getDirectVideoUrl(videoElement) {
    if (!videoElement) return null;

    const candidates = [videoElement.currentSrc, videoElement.src];
    const sources = videoElement.querySelectorAll ? videoElement.querySelectorAll('source') : [];
    for (const source of sources) candidates.push(source.src);

    for (const candidate of candidates) {
      if (candidate && !candidate.startsWith('blob:') && !isAudioOnlyUrl(candidate)) {
        return cleanVideoUrl(candidate);
      }
    }
    return null;
  }

  function parseCarouselIndex(value, totalItems) {
    if (!value) return -1;
    const match = String(value).match(/(?:slide|image|photo|media|item)?\s*(\d+)\s*(?:of|\/)\s*(\d+)/i);
    if (!match || Number(match[2]) !== totalItems) return -1;
    const index = Number(match[1]) - 1;
    return index >= 0 && index < totalItems ? index : -1;
  }

  // Try to map the clicked DOM media to the corresponding Instagram API item.
  // Never guess item 0 for a carousel: that is what caused mixed photo/video
  // posts to download the first slide.
  function getInstagramCarouselIndex(mediaElement, totalItems) {
    if (!mediaElement || totalItems <= 1) return totalItems === 1 ? 0 : -1;

    let node = mediaElement;
    let depth = 0;
    while (node && depth < 8) {
      const values = [
        node.getAttribute?.('aria-label'),
        node.getAttribute?.('data-slide-index'),
        node.getAttribute?.('data-carousel-index'),
        node.getAttribute?.('data-index'),
        node.getAttribute?.('aria-posinset')
      ];

      for (const value of values) {
        const pairIndex = parseCarouselIndex(value, totalItems);
        if (pairIndex >= 0) return pairIndex;
      }

      const slideIndexValue = node.getAttribute?.('data-slide-index');
      const numericIndex = slideIndexValue === null || slideIndexValue === '' ? NaN : Number(slideIndexValue);
      if (Number.isInteger(numericIndex) && numericIndex >= 0 && numericIndex < totalItems) {
        return numericIndex;
      }

      const positionValue = node.getAttribute?.('aria-posinset');
      const role = node.getAttribute?.('role');
      const isSlideNode = role === 'group' || role === 'tabpanel' || role === 'tab' ||
        node.hasAttribute?.('aria-roledescription');
      const position = positionValue === null || positionValue === '' ? NaN : Number(positionValue);
      if (isSlideNode && Number.isInteger(position) && position > 0 && position <= totalItems) {
        return position - 1;
      }

      node = node.parentElement;
      depth++;
    }

    const article = mediaElement.closest?.('article');
    if (!article) return -1;

    const activeTab = article.querySelector('[role="tab"][aria-selected="true"], [role="tab"][aria-current="true"]');
    if (activeTab) {
      const tabs = [...article.querySelectorAll('[role="tab"]')];
      const tabIndex = tabs.indexOf(activeTab);
      if (tabs.length === totalItems && tabIndex >= 0) return tabIndex;
    }

    const mediaElements = [...article.querySelectorAll('img, video')].filter((element) => {
      if (element.tagName === 'IMG') return !isAvatarOrIcon(element) && isContentImage(element);
      return isContentVideo(element);
    });
    const mediaIndex = mediaElements.indexOf(mediaElement);
    if (mediaElements.length === totalItems && mediaIndex >= 0) return mediaIndex;

    return -1;
  }

  function isLikelyInstagramCarousel(mediaElement) {
    const article = mediaElement?.closest?.('article');
    if (!article) return false;
    if (article.querySelector('[aria-roledescription="carousel"], [role="tablist"]')) return true;

    const labels = [...article.querySelectorAll('[aria-label]')]
      .map(element => (element.getAttribute('aria-label') || '').toLowerCase());
    return labels.some(label =>
      label.includes('next') || label.includes('previous') ||
      label.includes('go to slide') || label.includes('carousel') ||
      label.includes('下一張') || label.includes('上一張')
    );
  }

  function getInstagramVideoUrl(item) {
    if (!item) return null;
    if (item.video_url && !isAudioOnlyUrl(item.video_url)) return cleanVideoUrl(item.video_url);

    const versions = Array.isArray(item.video_versions) ? [...item.video_versions] : [];
    versions.sort((a, b) => (b.width || 0) - (a.width || 0));
    for (const version of versions) {
      if (version?.url && !isAudioOnlyUrl(version.url)) return cleanVideoUrl(version.url);
    }
    return null;
  }

  function getInstagramMediaUrl(item, type = null) {
    if (!item) return null;
    if ((!type || type === 'video') && Array.isArray(item.video_versions) && item.video_versions.length > 0) {
      const videoUrl = getInstagramVideoUrl(item);
      if (videoUrl) return videoUrl;
    }
    if (item.display_url) return item.display_url;
    if (Array.isArray(item.image_versions2?.candidates) && item.image_versions2.candidates.length > 0) {
      const candidates = [...item.image_versions2.candidates].sort((a, b) => (b.width || 0) - (a.width || 0));
      for (const cand of candidates) {
        if (cand?.url) return cand.url;
      }
    }
    if (item.image_url) return item.image_url;
    return getInstagramVideoUrl(item);
  }

  function getInstagramItemDuration(item) {
    const value = item?.video_duration ?? item?.videoDuration ?? item?.duration ?? item?.video_versions?.[0]?.duration;
    const duration = Number(value);
    return Number.isFinite(duration) && duration > 0 ? duration : null;
  }

  function getInstagramItemDimensions(item) {
    const version = item?.video_versions?.[0];
    const width = Number(item?.original_width ?? item?.width ?? version?.width);
    const height = Number(item?.original_height ?? item?.height ?? version?.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
    return { width, height };
  }

  function getComparableInstagramMediaPath(url) {
    if (!url || String(url).startsWith('blob:') || String(url).startsWith('data:')) return null;
    try {
      return decodeURIComponent(new URL(url, window.location.href).pathname)
        .replace(/\/+$/, '')
        .toLowerCase();
    } catch (e) {
      return null;
    }
  }

  function getInstagramItemMediaPaths(item) {
    if (!item || typeof item !== 'object') return [];
    const urls = [
      item.video_url,
      item.thumbnail_url,
      item.display_url,
      item.image_url,
      ...(Array.isArray(item.video_versions) ? item.video_versions.map(version => version?.url) : []),
      ...(Array.isArray(item.image_versions2?.candidates)
        ? item.image_versions2.candidates.map(candidate => candidate?.url)
        : [])
    ];
    return [...new Set(urls.map(getComparableInstagramMediaPath).filter(Boolean))];
  }

  function getDomMediaIdentityPaths(mediaElement) {
    if (!mediaElement) return [];
    const urls = [
      mediaElement.currentSrc,
      mediaElement.src,
      mediaElement.poster,
      mediaElement.getAttribute?.('src'),
      mediaElement.getAttribute?.('poster')
    ];

    const srcset = mediaElement.getAttribute?.('srcset');
    if (srcset) {
      const candidates = srcset.split(',').map(item => item.trim().split(/\s+/)[0]);
      urls.push(...candidates);
    }

    for (const source of mediaElement.querySelectorAll?.('source') || []) {
      urls.push(source.currentSrc, source.src);
    }

    // Instagram often renders the video's poster or story photo as an overlapping <img>.
    const mediaRect = mediaElement.getBoundingClientRect?.();
    let container = mediaElement.parentElement;
    for (let depth = 0; container && depth < 3; depth++, container = container.parentElement) {
      for (const image of container.querySelectorAll?.('img') || []) {
        urls.push(image.currentSrc, image.src, image.getAttribute('src'));
        const imgSrcset = image.getAttribute?.('srcset');
        if (imgSrcset) {
          const candidates = imgSrcset.split(',').map(item => item.trim().split(/\s+/)[0]);
          urls.push(...candidates);
        }
      }
    }

    return [...new Set(urls.map(getComparableInstagramMediaPath).filter(Boolean))];
  }

  function getInstagramItemIndexByMetadata(mediaElement, items) {
    if (!mediaElement || !Array.isArray(items)) return -1;

    const domPaths = getDomMediaIdentityPaths(mediaElement);
    if (domPaths.length > 0) {
      const pathMatches = items
        .map((item, index) => ({ index, paths: getInstagramItemMediaPaths(item) }))
        .filter(entry => entry.paths.some(path => domPaths.includes(path)));
      if (pathMatches.length === 1) return pathMatches[0].index;

      // Some CDN variants change the host/query but preserve a unique filename.
      const domNames = domPaths.map(path => path.split('/').pop()).filter(Boolean);
      const filenameMatches = items
        .map((item, index) => ({ index, paths: getInstagramItemMediaPaths(item) }))
        .filter(entry => entry.paths.some(path => domNames.includes(path.split('/').pop())));
      if (filenameMatches.length === 1) return filenameMatches[0].index;
    }

    if (mediaElement.tagName === 'VIDEO') {
      const currentDuration = Number(mediaElement.duration);
      if (Number.isFinite(currentDuration) && currentDuration > 0) {
        const durationMatches = items
          .map((item, index) => ({ index, duration: getInstagramItemDuration(item) }))
          .filter(entry => entry.duration !== null && Math.abs(entry.duration - currentDuration) < 0.75);
        if (durationMatches.length === 1) return durationMatches[0].index;
      }

      const currentWidth = Number(mediaElement.videoWidth);
      const currentHeight = Number(mediaElement.videoHeight);
      if (currentWidth > 0 && currentHeight > 0) {
        const dimensionMatches = items
          .map((item, index) => ({ index, dimensions: getInstagramItemDimensions(item) }))
          .filter(entry => entry.dimensions &&
            entry.dimensions.width === currentWidth && entry.dimensions.height === currentHeight);
        if (dimensionMatches.length === 1) return dimensionMatches[0].index;
      }
    }

    return -1;
  }

  function getInstagramMediaItems(data) {
    const root = data?.graphql?.shortcode_media || data?.items?.[0];
    if (!root) return [];
    if (Array.isArray(root.carousel_media)) return root.carousel_media;

    const edges = root.edge_sidecar_to_children?.edges;
    if (Array.isArray(edges) && edges.length > 0) {
      return edges.map(edge => edge?.node).filter(Boolean);
    }
    return [root];
  }

  // Fetch Instagram post/reel progressive MP4 via Info API
  async function fetchInstagramProgressiveVideo(shortcode, mediaElement = null) {
    if (!shortcode) return null;
    try {
      const apiUrl = `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`;
      const res = await fetch(apiUrl, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      if (res.ok) {
        const data = await res.json();
        const items = getInstagramMediaItems(data);
        if (items.length === 1) return getInstagramVideoUrl(items[0]);

        const metadataIndex = getInstagramItemIndexByMetadata(mediaElement, items);
        if (metadataIndex >= 0) return getInstagramVideoUrl(items[metadataIndex]);

        const mediaIndex = getInstagramCarouselIndex(mediaElement, items.length);
        if (mediaIndex >= 0) return getInstagramVideoUrl(items[mediaIndex]);

        console.warn('[Social Media Downloader] IG carousel index unavailable; refusing to guess the first item.');
      }
    } catch (e) {
      console.warn('[Social Media Downloader] IG info API lookup skipped:', e);
    }
    return null;
  }

  // Fetch Instagram Story Reel Media API by username
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

  // Extract recent video MP4 URL from Performance network resource logs
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

  // =========================================================================
  // IG STORIES AUDIO FIX: Multi-strategy resolver for story video WITH audio
  // Uses the story_id from the URL to EXACTLY identify the current story.
  // =========================================================================
  async function resolveStoryVideoWithAudio(videoElement, btn) {
    btn.setAttribute('data-tooltip', '解析限動原聲影片...');

    const pathname = window.location.pathname;
    // URL format: /stories/username/story_id/
    const storyMatch = pathname.match(/\/stories\/([^/]+)(?:\/(\d+))?/);
    const username = storyMatch ? storyMatch[1] : null;
    const storyId = storyMatch ? storyMatch[2] : null; // The specific story item ID

    console.log('[Social Media Downloader] Resolving story:', username, storyId);

    const isHighlight = username === 'highlights' || (username && username.startsWith('highlight'));

    // The current video element is the most reliable identity after a story
    // navigation. Use its own source before inspecting shared React/API data.
    const directUrl = getDirectVideoUrl(videoElement);
    if (directUrl) return directUrl;

    const scopedFiberUrl = getReactVideoUrlByMetadata(videoElement);
    if (scopedFiberUrl) {
      console.log('[Social Media Downloader] IG Story URL matched to current video metadata.');
      return scopedFiberUrl;
    }

    // React Fiber can contain multiple preloaded highlight items. Do not use
    // an unscoped Fiber URL for highlights because it may always return the
    // first item instead of the currently visible slide.
    if (!isHighlight) {
      const fiberUrl = getUrlFromReactFiberShallow(videoElement);
      if (fiberUrl && !isAudioOnlyUrl(fiberUrl) && !fiberUrl.startsWith('blob:')) {
        console.log('[Social Media Downloader] IG Story URL from React fiber (shallow):', fiberUrl);
        return fiberUrl;
      }
    }

    // Strategy 2: window.__additionalData scan filtered by storyId.
    // A highlight URL identifies the collection, not the active item, so its
    // unscoped store tree can also return the first preloaded video.
    if (!isHighlight) {
      const storeUrl = scanWindowForStoryVideoUrl(storyId);
      if (storeUrl && !isAudioOnlyUrl(storeUrl) && !storeUrl.startsWith('blob:')) {
        console.log('[Social Media Downloader] IG Story URL from window store:', storeUrl);
        return storeUrl;
      }
    }

    // Strategy 3: IG API v1 - fetch story reel and match by story_id (item.pk)
    btn.setAttribute('data-tooltip', '從 IG API 取得原聲影片...');
    const apiUrl = await fetchStoryItemFromApi(username, storyId, videoElement);
    if (apiUrl && !isAudioOnlyUrl(apiUrl)) {
      console.log('[Social Media Downloader] IG Story URL from API (matched story_id):', apiUrl);
      return apiUrl;
    }

    // Metadata may become available while the API request is in flight.
    const lateDirectUrl = getDirectVideoUrl(videoElement);
    if (lateDirectUrl) return lateDirectUrl;
    const lateScopedFiberUrl = getReactVideoUrlByMetadata(videoElement);
    if (lateScopedFiberUrl) return lateScopedFiberUrl;

    // Note: We intentionally do NOT fall back to getNetworkVideoUrl() here.
    // That function scans recent network requests and would return whichever
    // story was most recently pre-fetched by IG, NOT necessarily the one you are viewing.
    console.warn('[Social Media Downloader] All story URL strategies failed for story_id:', storyId);
    return null;
  }

  // =========================================================================
  // MEDIA DETECTOR: Uses elementsFromPoint to find media under overlay divs.
  // Critical: each found element's bounding rect must CONTAIN the mouse pos
  // to avoid matching carousel slides or adjacent posts' media.
  // =========================================================================
  function findDirectMediaElement(target, mouseX, mouseY) {
    // Case 1: mouse is directly ON a <video>
    if (target.tagName === 'VIDEO') {
      if (isContentVideo(target)) {
        return { media: target, type: 'video' };
      }
      return null;
    }

    // Case 2: mouse is directly ON an <img>
    if (target.tagName === 'IMG') {
      if (!isAvatarOrIcon(target) && isContentImage(target)) {
        return { media: target, type: 'image' };
      }
      return null;
    }

    // Case 3: Mouse is on an overlay div/link — probe elements stacked under (mouseX, mouseY)
    if (Number.isFinite(mouseX) && Number.isFinite(mouseY)) {
      try {
        const stack = document.elementsFromPoint(mouseX, mouseY);
        for (const el of stack) {
          if (el.classList.contains('tmd-download-btn')) continue;

          const elRect = el.getBoundingClientRect();
          if (elRect.width < 50 || elRect.height < 50) continue;
          if (mouseX < elRect.left || mouseX > elRect.right ||
              mouseY < elRect.top || mouseY > elRect.bottom) continue;

          if (el.tagName === 'VIDEO' && isContentVideo(el)) {
            return { media: el, type: 'video' };
          }
          if (el.tagName === 'IMG' && !isAvatarOrIcon(el) && isContentImage(el)) {
            return { media: el, type: 'image' };
          }

          // If element is a link or overlay container directly under cursor, check its direct child media
          const childVid = el.querySelector?.('video');
          if (childVid && isContentVideo(childVid)) {
            const vRect = childVid.getBoundingClientRect();
            if (mouseX >= vRect.left && mouseX <= vRect.right && mouseY >= vRect.top && mouseY <= vRect.bottom) {
              return { media: childVid, type: 'video' };
            }
          }
          const childImg = el.querySelector?.('img');
          if (childImg && !isAvatarOrIcon(childImg) && isContentImage(childImg)) {
            const iRect = childImg.getBoundingClientRect();
            if (mouseX >= iRect.left && mouseX <= iRect.right && mouseY >= iRect.top && mouseY <= iRect.bottom) {
              return { media: childImg, type: 'image' };
            }
          }
        }
      } catch (e) {}
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
    // 1. Prefer the source attached to the exact DOM video element.
    // React/API data can contain multiple carousel items and is not scoped
    // reliably enough to run before the element's own source.
    const directUrl = getDirectVideoUrl(videoElement);
    if (directUrl) return directUrl;

    const isCarousel = isLikelyInstagramCarousel(videoElement);

    const scopedFiberUrl = getReactVideoUrlByMetadata(videoElement);
    if (scopedFiberUrl) return scopedFiberUrl;

    // 2. SHALLOW fiber scan only (max 4 DOM parents, 12 fiber levels).
    // Skip this for carousels because the shared Fiber tree can contain
    // several slides and return the first one.
    if (!isCarousel) {
      const reactUrl = getUrlFromReactFiberShallow(videoElement);
      if (reactUrl && !isAudioOnlyUrl(reactUrl)) return reactUrl;
    }

    // 3. Query Instagram APIs
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

      // Handle IG Posts & Reels - try to get shortcode from:
      // a) The URL (works when viewing a single post page)
      // b) The closest <article> ancestor's link (works in feed scroll)
      let shortcode = null;
      const postMatch = pathname.match(/\/(p|reel)\/([A-Za-z0-9_-]+)/);
      if (postMatch && postMatch[2]) {
        shortcode = postMatch[2];
      }

      // If we're in the feed (no shortcode in URL), find it from the article element
      if (!shortcode) {
        const article = videoElement.closest('article');
        if (article) {
          const postLink = article.querySelector('a[href*="/p/"], a[href*="/reel/"]');
          if (postLink) {
            const linkMatch = postLink.getAttribute('href').match(/\/(p|reel)\/([A-Za-z0-9_-]+)/);
            if (linkMatch && linkMatch[2]) {
              shortcode = linkMatch[2];
            }
          }
        }
      }

      if (shortcode) {
        const postVideoUrl = await fetchInstagramProgressiveVideo(shortcode, videoElement);
        if (postVideoUrl) return postVideoUrl;
      }

      // Do not fall through to a shared Fiber/network URL for a carousel.
      // If the exact slide cannot be identified, refusing the download is
      // safer than downloading another slide.
      if (isCarousel) return null;
    }

    // 4. Fallback to Performance resource entries for MP4
    const networkUrl = getNetworkVideoUrl();
    if (networkUrl) return networkUrl;

    return cleanVideoUrl(videoElement.currentSrc || videoElement.src || null);
  }

  // Resolve media URL
  async function resolveMediaUrl(element, type) {
    let url = null;
    if (type === 'video') {
      url = await getVideoUrl(element);
    } else {
      url = getHighResImageUrl(element);
      if (isInstagram && window.location.pathname.includes('/stories/')) {
        const storyMatch = window.location.pathname.match(/\/stories\/([^\/]+)(?:\/(\d+))?/);
        if (storyMatch) {
          const username = storyMatch[1];
          const storyId = storyMatch[2];
          const apiUrl = await fetchStoryItemFromApi(username, storyId, element);
          if (apiUrl) url = apiUrl;
        }
      }
    }
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

      if (!isExtensionEnabled) return;

      if (!refreshActiveMediaFromButton(btn) || !activeMediaElement.isConnected) return;

      btn.classList.add('tmd-loading');
      btn.innerHTML = SVG_LOADING;
      btn.setAttribute('data-tooltip', '解析媒體中...');

      const type = activeMediaType;

      // IG Stories: ALWAYS use dedicated audio resolver (never captureStream)
      if (isInstagram && type === 'video' && window.location.pathname.includes('/stories/')) {
        const storyUrl = await resolveStoryVideoWithAudio(activeMediaElement, btn);
        if (storyUrl) {
          btn.setAttribute('data-tooltip', '下載中...');
          try {
            chrome.runtime.sendMessage(
              { action: 'download', url: storyUrl, type: 'video', ext: 'mp4', site: 'Instagram' },
              (response) => {
                btn.classList.remove('tmd-loading');
                if (chrome.runtime.lastError || (response && !response.success)) {
                  triggerSilentDirectDownload(storyUrl, 'video', 'mp4', btn);
                } else {
                  btn.classList.add('tmd-success');
                  btn.innerHTML = SVG_CHECK;
                  btn.setAttribute('data-tooltip', '已開始下載！');
                  setTimeout(() => {
                    btn.classList.remove('tmd-success');
                    btn.innerHTML = SVG_DOWNLOAD;
                    btn.setAttribute('data-tooltip', '下載影片');
                  }, 2500);
                }
              }
            );
          } catch (err) {
            triggerSilentDirectDownload(storyUrl, 'video', 'mp4', btn);
          }
        } else {
          // All strategies failed - tell the user
          btn.classList.remove('tmd-loading');
          btn.innerHTML = SVG_DOWNLOAD;
          btn.setAttribute('data-tooltip', '限動下載失敗，請重新整理頁面再試');
          setTimeout(() => btn.setAttribute('data-tooltip', '下載影片'), 3000);
        }
        return;
      }

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

    const isInViewport = rect.bottom > 0 && rect.right > 0 &&
      rect.left < window.innerWidth && rect.top < window.innerHeight;
    if (!mediaElement.isConnected || rect.width < 60 || rect.height < 60 || !isInViewport) {
      hideFloatingButton(true);
      return;
    }

    activeMediaElement = mediaElement;
    activeMediaType = type;

    const top = Math.max(rect.top + 8, Math.min(rect.top + 12, window.innerHeight - 58));
    const left = Math.max(rect.left + 8, Math.min(rect.right - 48, window.innerWidth - 50));

    btn.style.display = 'flex';
    btn.style.position = 'fixed';
    btn.style.top = `${top}px`;
    btn.style.left = `${left}px`;
    btn.style.zIndex = '2147483647';
    btn.setAttribute('data-tooltip', type === 'video' ? '下載影片' : '下載圖片');
  }

  // Hide floating button
  function hideFloatingButton(force = false) {
    const canHide = force || !activeFloatingBtn?.matches(':hover');
    if (activeFloatingBtn && canHide) {
      activeFloatingBtn.style.display = 'none';
    }
    if (canHide) {
      activeMediaElement = null;
      activeMediaType = null;
    }
  }

  function isVisibleMediaElement(mediaElement) {
    if (!mediaElement || !mediaElement.isConnected) return false;

    if (typeof mediaElement.checkVisibility === 'function') {
      try {
        if (!mediaElement.checkVisibility({
          checkOpacity: true,
          checkVisibilityCSS: true
        })) return false;
      } catch (e) {}
    }

    const rect = mediaElement.getBoundingClientRect();
    if (rect.width < 60 || rect.height < 60 || rect.bottom <= 0 || rect.right <= 0 ||
        rect.left >= window.innerWidth || rect.top >= window.innerHeight) return false;

    let node = mediaElement;
    while (node && node !== document.body) {
      if (node.hidden || node.getAttribute?.('aria-hidden') === 'true') return false;
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      node = node.parentElement;
    }

    const centerX = Math.max(0, Math.min(window.innerWidth - 1, rect.left + rect.width / 2));
    const centerY = Math.max(0, Math.min(window.innerHeight - 1, rect.top + rect.height / 2));
    const stack = document.elementsFromPoint?.(centerX, centerY) || [];
    return stack.some(element =>
      element === mediaElement ||
      mediaElement.contains?.(element) ||
      element.contains?.(mediaElement)
    );
  }

  function validateFloatingButtonState() {
    if (!activeFloatingBtn || activeFloatingBtn.style.display === 'none') return;
    if (!isVisibleMediaElement(activeMediaElement)) hideFloatingButton(true);
  }

  // The visible story can change without a mousemove event. Re-detect the
  // media behind the button immediately before downloading so navigation in
  // Instagram Highlights cannot leave a stale DOM element selected.
  function refreshActiveMediaFromButton(btn) {
    if (!btn || btn.style.display === 'none') return false;

    activeMediaElement = null;
    activeMediaType = null;

    const rect = btn.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const result = findDirectMediaElement(btn, x, y);

    if (!result || !result.media) return false;

    activeMediaElement = result.media;
    activeMediaType = result.type;
    return true;
  }

  // =========================================================================
  // MOUSEMOVE: Only show button when mouse is DIRECTLY on a content media element
  // =========================================================================
  let hoverCheckTimer = null;
  let lastPointerX = NaN;
  let lastPointerY = NaN;
  document.addEventListener('mousemove', (e) => {
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;

    if (!isExtensionEnabled) {
      hideFloatingButton();
      return;
    }

    const target = e.target;
    if (!target) return;

    // Ignore hover events on the button itself
    if (target.closest && target.closest('.tmd-download-btn')) return;

    const result = findDirectMediaElement(target, e.clientX, e.clientY);
    if (result && result.media) {
      updateFloatingButtonPosition(result.media, result.type);
      if (hoverCheckTimer) { clearTimeout(hoverCheckTimer); hoverCheckTimer = null; }
      return;
    }

    // Mouse moved off media — hide after short delay to allow clicking the button
    if (hoverCheckTimer) clearTimeout(hoverCheckTimer);
    hoverCheckTimer = setTimeout(() => {
      hideFloatingButton();
    }, 350);
  }, { passive: true });

  // Lazy-loaded Threads media may finish loading while the pointer stays
  // still. Re-run the same hover check when the actual image/video becomes
  // ready instead of requiring the user to move the mouse again.
  function handleMediaReady(e) {
    const element = e.target;
    if (!element || (element.tagName !== 'IMG' && element.tagName !== 'VIDEO')) return;
    if (!Number.isFinite(lastPointerX) || !Number.isFinite(lastPointerY)) return;

    const rect = element.getBoundingClientRect();
    if (lastPointerX < rect.left || lastPointerX > rect.right ||
        lastPointerY < rect.top || lastPointerY > rect.bottom) return;

    const result = findDirectMediaElement(element, lastPointerX, lastPointerY);
    if (result?.media) updateFloatingButtonPosition(result.media, result.type);
  }

  document.addEventListener('load', handleMediaReady, true);
  document.addEventListener('loadedmetadata', handleMediaReady, true);
  document.addEventListener('canplay', handleMediaReady, true);

  window.addEventListener('scroll', () => {
    if (isExtensionEnabled && activeMediaElement && activeFloatingBtn && activeFloatingBtn.style.display !== 'none') {
      updateFloatingButtonPosition(activeMediaElement, activeMediaType);
    } else if (activeFloatingBtn) {
      hideFloatingButton(true);
    }
  }, { passive: true });

  window.addEventListener('resize', () => {
    if (isExtensionEnabled && activeMediaElement && activeFloatingBtn && activeFloatingBtn.style.display !== 'none') {
      updateFloatingButtonPosition(activeMediaElement, activeMediaType);
    } else if (activeFloatingBtn) {
      hideFloatingButton(true);
    }
  }, { passive: true });

  window.addEventListener('blur', () => hideFloatingButton(true));

  // Hide floating button immediately on click/pointer outside (e.g. closing modal via close button 'X' or backdrop)
  const handleOutsideInteraction = (e) => {
    if (!activeFloatingBtn || activeFloatingBtn.style.display === 'none') return;
    if (e.target && e.target.closest && e.target.closest('.tmd-download-btn')) return;
    hideFloatingButton(true);
  };

  window.addEventListener('pointerdown', handleOutsideInteraction, true);
  window.addEventListener('mousedown', handleOutsideInteraction, true);
  window.addEventListener('click', handleOutsideInteraction, true);

  // Hide floating button immediately on ESC key or navigation keys (keydown & keyup in capture phase on window)
  const handleKeyClose = (e) => {
    if (e.key === 'Escape' || e.code === 'Escape' || e.keyCode === 27) {
      hideFloatingButton(true);
    }
  };

  window.addEventListener('keydown', handleKeyClose, true);
  window.addEventListener('keyup', handleKeyClose, true);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hideFloatingButton(true);
  });
  window.addEventListener('popstate', () => hideFloatingButton(true));
  window.addEventListener('hashchange', () => hideFloatingButton(true));

  if (typeof MutationObserver !== 'undefined' && document.body) {
    const floatingStateObserver = new MutationObserver(() => validateFloatingButtonState());
    floatingStateObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden']
    });
  }

  // Modal close animations can leave the old media connected for a short time
  // without producing mouse, keyboard or history events.
  window.setInterval(validateFloatingButtonState, 200);

})();
