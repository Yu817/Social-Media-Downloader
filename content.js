// Social Media Downloader Content Script - Multi-Platform (v1.4.2 Direct-Hover-Only Engine)

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
    '%c[Social Media Downloader v1.4.2] Active on: ' + window.location.hostname,
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

    // 1. Role or aria-label signals it's an icon / logo
    if (role === 'img' && (ariaLabel.includes('profile') || ariaLabel.includes('avatar') || ariaLabel.includes('logo'))) return true;

    // 2. Inside a <header> tag
    if (img.closest('header')) return true;

    // 3. CDN URL patterns for avatars (Meta/IG/Twitter specific)
    if (
      src.includes('t51.2885-19') || src.includes('t51.36379-19') ||
      src.includes('s150x150') || src.includes('s320x320') || src.includes('s640x640') ||
      src.includes('/profile_images/') ||
      src.includes('/p100x100/') || src.includes('/p50x50/') || src.includes('/p160x160/') ||
      src.includes('/75x75_') || src.includes('/150x150/')
    ) return true;

    // 4. Alt text keywords (multilingual)
    if (
      alt.includes('profile') || alt.includes('avatar') || alt.includes('icon') ||
      alt.includes('頭像') || alt.includes('大頭貼') || alt.includes('写真') ||
      alt.includes('perfil') || alt.includes('photo de profil')
    ) return true;

    // 5. Class-based heuristics (IG, Threads, Twitter all use these)
    if (
      classList.includes('Avatar') || classList.includes('avatar') ||
      classList.includes('ProfilePhoto') || classList.includes('profile') ||
      classList.includes('_aadp') // IG avatar class
    ) return true;

    // 6. Strict minimum rendered size: anything smaller than 200x200 in viewport is NOT post content
    const rect = img.getBoundingClientRect();
    if (rect.width < 200 || rect.height < 200) return true;

    // 7. If nested inside a small anchor (<200px) that doesn't link to a post/reel
    const parentAnchor = img.closest('a');
    if (parentAnchor) {
      const href = (parentAnchor.getAttribute('href') || '').toLowerCase();
      const isPostLink = href.includes('/p/') || href.includes('/post/') || href.includes('/status/') || href.includes('/reel/') || href.includes('/tv/');
      if (!isPostLink) {
        const aRect = parentAnchor.getBoundingClientRect();
        if (aRect.width < 200 || aRect.height < 200) return true;
      }
    }

    return false;
  }

  // Is the image fully rendered and large enough to be post content?
  function isContentImage(img) {
    if (!img) return false;
    if (!img.complete || !img.naturalWidth || img.naturalWidth < 200 || !img.naturalHeight || img.naturalHeight < 200) return false;
    const rect = img.getBoundingClientRect();
    return rect.width >= 200 && rect.height >= 200;
  }

  // Is the video fully loaded with real video dimensions?
  function isContentVideo(video) {
    if (!video) return false;
    const width = video.videoWidth || 0;
    const height = video.videoHeight || 0;
    // Accept if intrinsic dimensions available, OR if rendered size is large enough
    const rect = video.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 80) return false;
    // readyState >= HAVE_METADATA (1) means video loaded
    if (video.readyState < 1 && width === 0) return false;
    return true;
  }

  // Safe Props Inspector for video_versions array in Component State
  function searchPropsForVideoVersions(obj, depth = 0, visited = new WeakSet()) {
    if (!obj || depth > 6 || typeof obj !== 'object') return null;
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

  // Shallow React Fiber Walker: Only scans the element and its immediate 3 DOM parents,
  // climbing at most 5 fiber.return levels. Used for IG Stories to avoid picking up
  // video_versions data from adjacent pre-loaded story items in the fiber tree.
  function getUrlFromReactFiberShallow(element) {
    let curr = element;
    let domDepth = 0;
    const visited = new WeakSet();

    while (curr && domDepth < 4 && curr !== document.body) {
      for (const key in curr) {
        if (key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$') || key.startsWith('__reactProps$')) {
          let fiber = curr[key];
          let fiberDepth = 0;

          while (fiber && fiberDepth < 5) {
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
    if (!username) return null;
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

  // Fetch the current IG story item via the API v1 endpoint (uses session cookie)
  // The reels_media API requires a NUMERIC user_id, not a username string.
  async function fetchStoryItemFromApi(username, storyId) {
    if (!username) return null;

    // Step 1: Resolve username -> numeric user_id
    const userId = await resolveUserId(username);
    if (!userId) {
      console.warn('[Social Media Downloader] Could not resolve user_id, falling back to username');
    }

    const targetId = userId || username;
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

        // Collect all story items
        const allItems = [];
        const reels = data?.reels || data?.reels_media || {};
        for (const key of Object.keys(reels)) {
          const items = reels[key]?.items;
          if (Array.isArray(items)) allItems.push(...items);
        }
        const items2 = data?.reel?.items || data?.items;
        if (Array.isArray(items2)) allItems.push(...items2);

        if (allItems.length === 0) continue;

        // If we have a story_id, find the EXACT matching item first
        if (storyId) {
          const exactItem = allItems.find(item =>
            String(item?.pk) === String(storyId) ||
            String(item?.id) === String(storyId)
          );
          if (exactItem?.video_versions?.length > 0) {
            console.log('[Social Media Downloader] Matched story item by pk/id:', exactItem.pk);
            return cleanVideoUrl(exactItem.video_versions[0].url);
          }
        }

        // Fallback: return first item with video (only if no storyId to match)
        if (!storyId) {
          for (const item of allItems) {
            if (item?.video_versions?.length > 0) {
              return cleanVideoUrl(item.video_versions[0].url);
            }
          }
        }
      } catch (e) {
        console.warn('[Social Media Downloader] IG Story API endpoint failed:', url, e);
      }
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

    console.log('[Social Media Downloader] Resolving story:', { username, storyId });

    // Strategy 1: React fiber scan DIRECTLY on the video element (shallow, max 5 parent levels)
    // Shallow scan avoids picking up pre-loaded adjacent stories from neighboring fiber nodes
    const fiberUrl = getUrlFromReactFiberShallow(videoElement);
    if (fiberUrl && !isAudioOnlyUrl(fiberUrl) && !fiberUrl.startsWith('blob:')) {
      console.log('[Social Media Downloader] IG Story URL from React fiber (shallow):', fiberUrl);
      return fiberUrl;
    }

    // Strategy 2: window.__additionalData scan filtered by storyId
    const storeUrl = scanWindowForStoryVideoUrl(storyId);
    if (storeUrl && !isAudioOnlyUrl(storeUrl) && !storeUrl.startsWith('blob:')) {
      console.log('[Social Media Downloader] IG Story URL from window store:', storeUrl);
      return storeUrl;
    }

    // Strategy 3: IG API v1 - fetch story reel and match by story_id (item.pk)
    btn.setAttribute('data-tooltip', '從 IG API 取得原聲影片...');
    const apiUrl = await fetchStoryItemFromApi(username, storyId);
    if (apiUrl && !isAudioOnlyUrl(apiUrl)) {
      console.log('[Social Media Downloader] IG Story URL from API (matched story_id):', apiUrl);
      return apiUrl;
    }

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

    // Case 3: Mouse is on an overlay div — probe through the z-stack
    // to find media elements whose visible area contains the mouse.
    if (mouseX && mouseY) {
      try {
        const stack = document.elementsFromPoint(mouseX, mouseY);
        for (const el of stack) {
          if (el === target || el.classList.contains('tmd-download-btn')) continue;

          // Verify this element's rendered rect actually contains the mouse
          const elRect = el.getBoundingClientRect();
          if (elRect.width < 80 || elRect.height < 80) continue;
          if (mouseX < elRect.left || mouseX > elRect.right ||
              mouseY < elRect.top || mouseY > elRect.bottom) continue;

          if (el.tagName === 'VIDEO' && isContentVideo(el)) {
            return { media: el, type: 'video' };
          }
          if (el.tagName === 'IMG' && !isAvatarOrIcon(el) && isContentImage(el)) {
            return { media: el, type: 'image' };
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

  // =========================================================================
  // MOUSEMOVE: Only show button when mouse is DIRECTLY on a content media element
  // =========================================================================
  let hoverCheckTimer = null;
  document.addEventListener('mousemove', (e) => {
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
