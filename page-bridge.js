// Social Media Downloader - MAIN World Page Bridge (FB, IG, Threads)
// Runs in the page's MAIN world to read React Fiber props/state and passively
// index progressive (video+audio) URLs from Meta GraphQL/API and SSR payloads.

(function () {
  'use strict';

  if (window !== window.top) return;

  const host = (window.location.hostname || '').toLowerCase();
  const isMetaSite =
    host.includes('instagram.com') ||
    host.includes('threads.net') ||
    host.includes('threads.com') ||
    host.includes('facebook.com');

  if (!isMetaSite) return;
  if (window.__TMD_PAGE_BRIDGE_LOADED__) return;
  window.__TMD_PAGE_BRIDGE_LOADED__ = true;

  const MAX_REGISTRY_SIZE = 300;
  const mediaRegistry = [];
  const registryByUrl = new Map();
  const scannedScripts = new WeakSet();

  // =========================================================================
  // URL & META EFG CLASSIFICATION
  // =========================================================================

  function cleanVideoUrl(url) {
    if (!url || typeof url !== 'string') return null;
    let clean = url.trim();
    clean = clean.replace(/([?&])bytestart=\d+&?/g, '$1');
    clean = clean.replace(/([?&])byteend=\d+&?/g, '$1');
    clean = clean.replace(/[?&]$/, '');
    return clean;
  }

  function decodeMetaEfg(url) {
    if (!url || typeof url !== 'string') return null;
    const match = url.match(/[?&]efg=([^&]+)/i);
    if (!match || !match[1]) return null;
    try {
      let b64 = decodeURIComponent(match[1]);
      b64 = b64.replace(/-/g, '+').replace(/_/g, '/');
      const pad = b64.length % 4;
      if (pad) b64 += '='.repeat(4 - pad);
      const decoded = window.atob(b64);
      try {
        return { raw: decoded, json: JSON.parse(decoded) };
      } catch (e) {
        return { raw: decoded, json: null };
      }
    } catch (e) {
      return null;
    }
  }

  function getMetaVencodeTag(url) {
    const efg = decodeMetaEfg(url);
    if (!efg) return '';
    if (efg.json && typeof efg.json === 'object') {
      return String(efg.json.vencode_tag || efg.json.tag || '').toLowerCase();
    }
    return String(efg.raw || '').toLowerCase();
  }

  function isAudioOnlyUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const lower = url.toLowerCase();

    if (
      lower.includes('dash_audio') ||
      lower.includes('_a.mp4') ||
      lower.includes('mime=audio') ||
      lower.includes('audio_') ||
      lower.includes('.mp3') ||
      lower.includes('.m4a') ||
      lower.includes('.aac')
    ) {
      return true;
    }

    const tag = getMetaVencodeTag(url);
    if (tag) {
      if (
        tag.includes('audio') ||
        tag.includes('heaac') ||
        tag.includes('aac') ||
        tag.includes('opus') ||
        tag.includes('dash_r2a') ||
        /_a($|[^a-z0-9])/.test(tag)
      ) {
        return true;
      }
    }

    return false;
  }

  function isDashOnlyUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const lower = url.toLowerCase();

    if (/[?&](bytestart|byteend)=/i.test(url)) return true;
    if (lower.includes('dash_')) return true;

    const tag = getMetaVencodeTag(url);
    if (tag && tag.includes('dash') && !tag.includes('progressive')) {
      return true;
    }

    return false;
  }

  function isProgressiveVideoUrl(url, trustProgressiveField = false) {
    if (!url || typeof url !== 'string') return false;
    if (url.startsWith('blob:') || url.startsWith('data:')) return false;
    if (!/^https?:\/\//i.test(url)) return false;
    if (isAudioOnlyUrl(url)) return false;
    if (/[?&](bytestart|byteend)=/i.test(url)) return false;
    if (!trustProgressiveField && isDashOnlyUrl(url)) return false;
    return true;
  }

  function normalizeMediaPath(url) {
    if (!url || typeof url !== 'string' || url.startsWith('blob:') || url.startsWith('data:')) {
      return null;
    }
    try {
      return decodeURIComponent(new URL(url, window.location.href).pathname)
        .replace(/\/+$/, '')
        .toLowerCase();
    } catch (e) {
      return null;
    }
  }

  function getFilenameFromPath(path) {
    if (!path) return null;
    const name = path.split('/').pop();
    return name && name.length >= 6 ? name : null;
  }

  // =========================================================================
  // RECORD EXTRACTION & REGISTRY
  // =========================================================================

  function pickProgressiveFromVideoVersions(versions) {
    if (!Array.isArray(versions) || versions.length === 0) return null;
    const sorted = [...versions].sort(
      (a, b) => ((b?.width || 0) * (b?.height || 0)) - ((a?.width || 0) * (a?.height || 0))
    );
    for (const v of sorted) {
      if (v && typeof v.url === 'string' && isProgressiveVideoUrl(v.url, true)) {
        return {
          url: cleanVideoUrl(v.url),
          width: Number(v.width) || null,
          height: Number(v.height) || null
        };
      }
    }
    return null;
  }

  function pickProgressiveFromFbDelivery(obj) {
    const progressiveList =
      obj?.videoDeliveryResponseFragment?.videoDeliveryResponseResult?.progressive_urls ||
      obj?.videoDeliveryResponseResult?.progressive_urls ||
      obj?.progressive_urls;

    if (Array.isArray(progressiveList) && progressiveList.length > 0) {
      const sorted = [...progressiveList].sort((a, b) => {
        const qa = String(a?.metadata?.quality || '').toUpperCase() === 'HD' ? 2 : 1;
        const qb = String(b?.metadata?.quality || '').toUpperCase() === 'HD' ? 2 : 1;
        return qb - qa;
      });
      for (const entry of sorted) {
        const candidate = entry?.progressive_url || entry?.url;
        if (isProgressiveVideoUrl(candidate, true)) {
          return cleanVideoUrl(candidate);
        }
      }
    }

    const legacy = obj?.videoDeliveryLegacyFields;
    if (legacy && typeof legacy === 'object') {
      const candidates = [legacy.browser_native_hd_url, legacy.browser_native_sd_url];
      for (const candidate of candidates) {
        if (isProgressiveVideoUrl(candidate, true)) return cleanVideoUrl(candidate);
      }
    }

    // CometVideoPlayer / BarcelonaVideoPlayer implementations array
    if (Array.isArray(obj?.implementations)) {
      for (const impl of obj.implementations) {
        const implUrl = impl?.url || impl?.src || impl?.progressive_url;
        const implType = String(impl?.type || '').toUpperCase();
        if (implUrl && (!implType || implType.includes('MP4') || implType.includes('PROGRESSIVE'))) {
          if (isProgressiveVideoUrl(implUrl, true)) return cleanVideoUrl(implUrl);
        }
      }
    }

    return null;
  }

  function collectPosterPathsFromObject(obj) {
    const urls = [
      obj.thumbnail_url,
      obj.display_url,
      obj.image_url,
      obj.first_frame_thumbnail,
      obj.preferred_thumbnail?.image?.uri,
      obj.thumbnailImage?.uri,
      obj.thumbnail?.uri,
      obj.poster_image?.uri
    ];

    if (Array.isArray(obj.image_versions2?.candidates)) {
      for (const cand of obj.image_versions2.candidates) {
        if (cand?.url) urls.push(cand.url);
      }
    }

    const paths = [];
    for (const u of urls) {
      const p = normalizeMediaPath(u);
      if (p) paths.push(p);
    }
    return [...new Set(paths)];
  }

  function extractDurationFromObject(obj) {
    const ms = Number(obj.playable_duration_in_ms ?? obj.duration_ms);
    if (Number.isFinite(ms) && ms > 0) return ms / 1000;
    const sec = Number(
      obj.video_duration ??
      obj.videoDuration ??
      obj.playable_duration ??
      obj.duration ??
      obj.video_versions?.[0]?.duration
    );
    return Number.isFinite(sec) && sec > 0 ? sec : null;
  }

  function extractVideoRecordFromObject(obj, inheritedShortcode = null) {
    if (!obj || typeof obj !== 'object') return null;

    let url = null;
    let width = Number(obj.original_width ?? obj.width) || null;
    let height = Number(obj.original_height ?? obj.height) || null;

    // 1. Facebook Relay delivery fragments (HD > SD)
    const fbDeliveryUrl = pickProgressiveFromFbDelivery(obj);
    if (fbDeliveryUrl) url = fbDeliveryUrl;

    // 2. Direct progressive fields (HD prioritized over SD)
    if (!url) {
      const directCandidates = [
        obj.browser_native_hd_url,
        obj.playable_url_quality_hd,
        obj.hd_src_no_ratelimit,
        obj.hd_src,
        obj.progressive_url,
        obj.browser_native_sd_url,
        obj.playable_url,
        obj.sd_src_no_ratelimit,
        obj.sd_src,
        obj.video_url
      ];
      for (const candidate of directCandidates) {
        if (isProgressiveVideoUrl(candidate, true)) {
          url = cleanVideoUrl(candidate);
          break;
        }
      }
    }

    // 3. Instagram / Threads video_versions
    if (!url && Array.isArray(obj.video_versions)) {
      const picked = pickProgressiveFromVideoVersions(obj.video_versions);
      if (picked) {
        url = picked.url;
        if (!width) width = picked.width;
        if (!height) height = picked.height;
      }
    }

    if (!url) return null;

    const rawIds = [obj.pk, obj.id, obj.video_id, obj.videoId, obj.media_id, obj.fbid]
      .filter(v => v !== undefined && v !== null && String(v).trim() !== '')
      .map(v => String(v).split('_')[0]);

    const shortcode = obj.code || obj.shortcode || inheritedShortcode || null;
    const posterPaths = collectPosterPathsFromObject(obj);
    const duration = extractDurationFromObject(obj);

    return {
      url,
      ids: [...new Set(rawIds)],
      shortcode: shortcode ? String(shortcode) : null,
      posterPaths,
      posterFilenames: [...new Set(posterPaths.map(getFilenameFromPath).filter(Boolean))],
      duration,
      width,
      height,
      ts: Date.now()
    };
  }

  function getCanonicalVideoKey(record) {
    if (!record || !record.url) return null;
    const path = normalizeMediaPath(record.url);
    const filename = getFilenameFromPath(path);
    if (filename) return `file:${filename}`;
    if (path) return `path:${path}`;
    return `url:${record.url}`;
  }

  function mergeRecordInto(target, incoming) {
    // Prefer higher resolution or fresher CDN token
    const targetArea = (target.width || 0) * (target.height || 0);
    const incomingArea = (incoming.width || 0) * (incoming.height || 0);
    if (incomingArea > targetArea || (incomingArea === targetArea && (incoming.ts || 0) >= (target.ts || 0))) {
      target.url = incoming.url;
      if (incoming.width) target.width = incoming.width;
      if (incoming.height) target.height = incoming.height;
    }
    target.ids = [...new Set([...target.ids, ...incoming.ids])];
    if (!target.shortcode && incoming.shortcode) target.shortcode = incoming.shortcode;
    target.posterPaths = [...new Set([...target.posterPaths, ...incoming.posterPaths])];
    target.posterFilenames = [...new Set([...target.posterFilenames, ...incoming.posterFilenames])];
    if (!target.duration && incoming.duration) target.duration = incoming.duration;
    target.ts = Math.max(target.ts || 0, incoming.ts || Date.now());
  }

  function dedupeRecords(records) {
    const result = [];
    for (const rec of records) {
      if (!rec || !rec.url) continue;
      const key = getCanonicalVideoKey(rec);
      const existing = result.find(item =>
        getCanonicalVideoKey(item) === key ||
        (rec.ids.length > 0 && item.ids.some(id => rec.ids.includes(id)))
      );
      if (existing) {
        mergeRecordInto(existing, rec);
      } else {
        result.push({
          ...rec,
          ids: [...rec.ids],
          posterPaths: [...rec.posterPaths],
          posterFilenames: [...rec.posterFilenames]
        });
      }
    }
    return result;
  }

  function registerRecord(record) {
    if (!record || !record.url) return;
    const key = getCanonicalVideoKey(record);
    const existing =
      registryByUrl.get(key) ||
      (record.ids.length > 0 && mediaRegistry.find(item => item.ids.some(id => record.ids.includes(id))));

    if (existing) {
      mergeRecordInto(existing, record);
      if (key) registryByUrl.set(key, existing);
      return;
    }

    if (key) registryByUrl.set(key, record);
    mediaRegistry.push(record);
    if (mediaRegistry.length > MAX_REGISTRY_SIZE) {
      const oldest = mediaRegistry.shift();
      const oldKey = getCanonicalVideoKey(oldest);
      if (oldKey) registryByUrl.delete(oldKey);
    }
  }

  function extractShortcodeFromNode(node) {
    if (!node || typeof node !== 'object') return null;
    if (typeof node.code === 'string' && node.code.length >= 5) return node.code;
    if (typeof node.shortcode === 'string' && node.shortcode.length >= 5) return node.shortcode;
    const linkFields = [node.permalink, node.url, node.uri];
    for (const link of linkFields) {
      if (typeof link === 'string') {
        const m = link.match(/\/(?:p|reel|tv|post)\/([A-Za-z0-9_-]{5,})/);
        if (m && m[1]) return m[1];
      }
    }
    return null;
  }

  function indexJsonTree(root, maxDepth = 40) {
    if (!root || typeof root !== 'object') return;
    const visited = new WeakSet();
    // Use FIFO-preserving traversal for arrays so carousel items stay in display order
    const walk = (node, depth, inheritedShortcode) => {
      if (!node || typeof node !== 'object' || depth > maxDepth) return;
      if (visited.has(node)) return;
      visited.add(node);

      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) {
          if (node[i] && typeof node[i] === 'object') {
            walk(node[i], depth + 1, inheritedShortcode);
          }
        }
        return;
      }

      const ownShortcode = extractShortcodeFromNode(node);
      const currentShortcode = ownShortcode || inheritedShortcode;

      const record = extractVideoRecordFromObject(node, currentShortcode);
      if (record) registerRecord(record);

      for (const key in node) {
        if (!Object.prototype.hasOwnProperty.call(node, key)) continue;
        if (
          record && (
            key === 'progressive_urls' ||
            key === 'videoDeliveryResponseFragment' ||
            key === 'videoDeliveryResponseResult' ||
            key === 'videoDeliveryLegacyFields' ||
            key === 'video_versions' ||
            key === 'implementations'
          )
        ) {
          continue;
        }
        const val = node[key];
        if (val && typeof val === 'object') {
          walk(val, depth + 1, currentShortcode);
        }
      }
    };

    walk(root, 0, null);
  }

  function hasVideoKeywords(text) {
    if (!text || text.length < 40) return false;
    return (
      text.includes('video_versions') ||
      text.includes('browser_native_hd_url') ||
      text.includes('browser_native_sd_url') ||
      text.includes('playable_url') ||
      text.includes('progressive_url') ||
      text.includes('hd_src')
    );
  }

  function parseAndIndexPayloadText(text) {
    if (!hasVideoKeywords(text)) return;
    let cleaned = text.trim();
    if (cleaned.startsWith('for (;;);')) {
      cleaned = cleaned.slice(9).trim();
    }

    // Try single JSON first, then NDJSON (Facebook / Threads GraphQL stream)
    try {
      const parsed = JSON.parse(cleaned);
      indexJsonTree(parsed);
      return;
    } catch (e) {}

    const lines = cleaned.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed[0] !== '{') continue;
      if (!hasVideoKeywords(trimmed)) continue;
      try {
        indexJsonTree(JSON.parse(trimmed));
      } catch (e) {}
    }
  }

  function scanSsrScripts() {
    try {
      const scripts = document.querySelectorAll('script[type="application/json"]');
      for (const script of scripts) {
        if (scannedScripts.has(script)) continue;
        scannedScripts.add(script);
        const text = script.textContent;
        if (text && hasVideoKeywords(text)) {
          parseAndIndexPayloadText(text);
        }
      }
    } catch (e) {}
  }

  // =========================================================================
  // PASSIVE NETWORK INTERCEPTORS (FETCH & XHR)
  // =========================================================================

  function isRelevantApiUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return (
      url.includes('/graphql') ||
      url.includes('/api/v1/') ||
      url.includes('/ajax/') ||
      url.includes('reels_media') ||
      url.includes('bulk-route-definitions')
    );
  }

  try {
    const origFetch = window.fetch;
    if (typeof origFetch === 'function') {
      window.fetch = function (...args) {
        const reqUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
        const promise = origFetch.apply(this, args);
        if (isRelevantApiUrl(reqUrl)) {
          promise
            .then((res) => {
              if (!res || !res.ok) return;
              const ct = ((res.headers && res.headers.get('content-type')) || '').toLowerCase();
              if (ct.startsWith('image/') || ct.startsWith('video/') || ct.startsWith('audio/') || ct.startsWith('font/')) return;
              res.clone().text().then(parseAndIndexPayloadText).catch(() => {});
            })
            .catch(() => {});
        }
        return promise;
      };
    }
  } catch (e) {}

  try {
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this.__tmdUrl = typeof url === 'string' ? url : String(url || '');
      return origOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function (...args) {
      if (isRelevantApiUrl(this.__tmdUrl)) {
        this.addEventListener('load', function () {
          try {
            if (this.responseType === '' || this.responseType === 'text') {
              parseAndIndexPayloadText(this.responseText);
            }
          } catch (e) {}
        });
      }
      return origSend.apply(this, args);
    };
  } catch (e) {}

  // =========================================================================
  // TARGETED REACT FIBER & DOM IDENTITY MATCHER
  // =========================================================================

  function getDomIdentity(videoElement) {
    const posterUrls = [
      videoElement.poster,
      videoElement.getAttribute('poster')
    ];

    let container = videoElement.parentElement;
    for (let depth = 0; container && depth < 3; depth++, container = container.parentElement) {
      const imgs = container.querySelectorAll('img');
      for (const img of imgs) {
        posterUrls.push(img.currentSrc, img.src, img.getAttribute('src'));
      }
    }

    const posterPaths = [...new Set(posterUrls.map(normalizeMediaPath).filter(Boolean))];
    const posterFilenames = [...new Set(posterPaths.map(getFilenameFromPath).filter(Boolean))];

    // Extract possible FB/IG video IDs & shortcodes from nearby links
    const ids = new Set();
    const shortcodes = new Set();

    const checkHref = (href) => {
      if (!href) return;
      const fbVid = href.match(/\/(?:videos|reel|watch\/?\?v=|story\.php\?.*fbid=)(\d{6,})/i);
      if (fbVid && fbVid[1]) ids.add(fbVid[1]);
      const fbParam = href.match(/[?&]v=(\d{6,})/);
      if (fbParam && fbParam[1]) ids.add(fbParam[1]);
      const igCode = href.match(/\/(?:p|reel|tv|post)\/([A-Za-z0-9_-]{5,})/);
      if (igCode && igCode[1]) shortcodes.add(igCode[1]);
    };

    checkHref(window.location.href);
    let anc = videoElement.parentElement;
    for (let d = 0; anc && d < 14 && anc !== document.body; d++, anc = anc.parentElement) {
      if (anc.tagName === 'A') checkHref(anc.getAttribute('href'));
      const vids = anc.querySelectorAll('video');
      // Stay inside the current post/carousel container (up to 6 videos);
      // stop climbing once we find post links so we never bleed into adjacent posts.
      if (vids.length >= 1 && vids.length <= 6) {
        const beforeIds = ids.size;
        const beforeCodes = shortcodes.size;
        const links = anc.querySelectorAll('a[href]');
        for (const link of links) checkHref(link.getAttribute('href'));
        if (ids.size > beforeIds || shortcodes.size > beforeCodes) break;
      } else if (vids.length > 6) {
        break;
      }
    }

    return {
      posterPaths,
      posterFilenames,
      ids,
      shortcodes,
      duration: Number(videoElement.duration),
      width: Number(videoElement.videoWidth),
      height: Number(videoElement.videoHeight)
    };
  }

  function collectFromFiberProps(obj, records, ids, shortcodes, depth = 0, visited = new WeakSet()) {
    if (!obj || depth > 7 || typeof obj !== 'object') return;
    if (visited.has(obj)) return;
    visited.add(obj);

    try {
      const rec = extractVideoRecordFromObject(obj);
      if (rec) {
        records.push(rec);
        registerRecord(rec);
      }

      const idFields = ['videoID', 'videoId', 'video_id', 'mediaId', 'media_id', 'pk', 'fbid'];
      for (const f of idFields) {
        if (obj[f] !== undefined && obj[f] !== null && /^\d{6,}$/.test(String(obj[f]).split('_')[0])) {
          ids.add(String(obj[f]).split('_')[0]);
        }
      }
      if (typeof obj.code === 'string' && obj.code.length >= 5) shortcodes.add(obj.code);
      if (typeof obj.shortcode === 'string' && obj.shortcode.length >= 5) shortcodes.add(obj.shortcode);

      if (Array.isArray(obj)) {
        if (obj.length <= 20) {
          for (const item of obj) {
            if (item && typeof item === 'object') {
              collectFromFiberProps(item, records, ids, shortcodes, depth + 1, visited);
            }
          }
        }
        return;
      }

      const keys = Object.keys(obj);
      const skipFiberKeys = new Set([
        '_owner', '_store', 'return', 'child', 'sibling', 'alternate',
        'stateNode', 'ref', 'window', 'document', 'ownerDocument', 'parentNode',
        'parentElement', 'firstChild', 'lastChild', 'nextSibling', 'previousSibling'
      ]);
      for (const k of keys) {
        if (skipFiberKeys.has(k) || k.startsWith('__react')) continue;
        if (
          rec && (
            k === 'progressive_urls' ||
            k === 'videoDeliveryResponseFragment' ||
            k === 'videoDeliveryResponseResult' ||
            k === 'videoDeliveryLegacyFields' ||
            k === 'video_versions' ||
            k === 'implementations'
          )
        ) {
          continue;
        }
        const val = obj[k];
        if (!val || typeof val !== 'object') continue;
        if (typeof Node !== 'undefined' && val instanceof Node) continue;
        if (
          depth <= 2 ||
          k === 'children' || k === 'memoizedState' || k === 'next' ||
          k === 'data' || k === 'value' || k === 'current' || k === 'node' ||
          k === 'props' || k === 'source' || k === 'sources' || k === 'implementations' ||
          k === 'item' || k === 'items' || k === 'media' || k === 'story' || k === 'video' ||
          k === 'post' || k === 'attachment' || k === 'attachments' ||
          k === 'carousel_media' || k === 'thread_items' || k === 'resource' ||
          k === 'videoData' || k === 'videoPlayerMetadata' || k === 'coreVideoPlayerMetaData' ||
          k === 'videoDeliveryResponseFragment' || k === 'videoDeliveryLegacyFields' ||
          k.includes('video') || k.includes('Video') || k.includes('media') ||
          k.includes('Media') || k.includes('story') || k.includes('Reel')
        ) {
          collectFromFiberProps(val, records, ids, shortcodes, depth + 1, visited);
        }
      }
    } catch (e) {}
  }

  function getSiblingVideoIndex(videoElement, expectedCount) {
    if (!videoElement || expectedCount < 2) return -1;
    let anc = videoElement.parentElement;
    for (let d = 0; anc && d < 10 && anc !== document.body; d++, anc = anc.parentElement) {
      const vids = [...(anc.querySelectorAll?.('video') || [])];
      if (vids.length === expectedCount) {
        const idx = vids.indexOf(videoElement);
        if (idx >= 0) return idx;
      } else if (vids.length > expectedCount) {
        break;
      }
    }
    return -1;
  }

  function matchBestRecord(records, identity, meta = {}, videoElement = null) {
    const unique = dedupeRecords(records);
    if (unique.length === 0) return null;

    // 1. Exact storyId match
    if (meta.storyId) {
      const storyIdStr = String(meta.storyId);
      const storyMatch = unique.find(r => r.ids.includes(storyIdStr));
      if (storyMatch) return storyMatch.url;
    }

    // 2. Exact video/media ID match
    if (identity.ids.size > 0) {
      const idMatches = unique.filter(r => r.ids.some(id => identity.ids.has(id)));
      if (idMatches.length === 1) return idMatches[0].url;
    }

    // 3. Exact shortcode match (supports both single-video posts and multi-video carousels!)
    if (identity.shortcodes.size > 0) {
      const codeMatches = unique.filter(r => r.shortcode && identity.shortcodes.has(r.shortcode));
      if (codeMatches.length === 1) return codeMatches[0].url;
      if (codeMatches.length > 1) {
        // Narrowed down to this exact post's videos: disambiguate by poster, duration, or sibling index
        if (identity.posterPaths.length > 0) {
          const pm = codeMatches.filter(r => r.posterPaths.some(p => identity.posterPaths.includes(p)));
          if (pm.length === 1) return pm[0].url;
        }
        if (Number.isFinite(identity.duration) && identity.duration > 0) {
          const dm = codeMatches.filter(r => r.duration !== null && Math.abs(r.duration - identity.duration) < 0.75);
          if (dm.length === 1) return dm[0].url;
        }
        if (videoElement) {
          const siblingIdx = getSiblingVideoIndex(videoElement, codeMatches.length);
          if (siblingIdx >= 0 && siblingIdx < codeMatches.length) {
            return codeMatches[siblingIdx].url;
          }
        }
      }
    }

    // 4. Exact poster URL path match
    if (identity.posterPaths.length > 0) {
      const pathMatches = unique.filter(r =>
        r.posterPaths.some(p => identity.posterPaths.includes(p))
      );
      if (pathMatches.length === 1) return pathMatches[0].url;
    }

    // 5. Unique poster filename match
    if (identity.posterFilenames.length > 0) {
      const nameMatches = unique.filter(r =>
        r.posterFilenames.some(n => identity.posterFilenames.includes(n))
      );
      if (nameMatches.length === 1) return nameMatches[0].url;
    }

    // 6. Unique duration match
    if (Number.isFinite(identity.duration) && identity.duration > 0) {
      const durMatches = unique.filter(r =>
        r.duration !== null && Math.abs(r.duration - identity.duration) < 0.75
      );
      if (durMatches.length === 1) return durMatches[0].url;
      if (durMatches.length > 1 && identity.width > 0 && identity.height > 0) {
        const both = durMatches.filter(r => r.width === identity.width && r.height === identity.height);
        if (both.length === 1) return both[0].url;
      }
    }

    // 7. Unique dimensions match (only when candidate pool is small/scoped)
    if (unique.length <= 10 && identity.width > 0 && identity.height > 0) {
      const dimMatches = unique.filter(r => r.width === identity.width && r.height === identity.height);
      if (dimMatches.length === 1) return dimMatches[0].url;
    }

    // 8. Sibling <video> index match for multi-video carousels (e.g. Threads / IG side-by-side videos)
    if (videoElement && unique.length >= 2 && unique.length <= 20) {
      const siblingIdx = getSiblingVideoIndex(videoElement, unique.length);
      if (siblingIdx >= 0 && siblingIdx < unique.length) {
        return unique[siblingIdx].url;
      }
    }

    return null;
  }

  function resolveVideoInMainWorld(videoElement, meta = {}) {
    if (!videoElement) return null;

    const identity = getDomIdentity(videoElement);
    if (meta.shortcode) identity.shortcodes.add(String(meta.shortcode));

    // Step 1: Walk React Fiber starting directly on the clicked <video> element
    // Stop at the closest Fiber component that uniquely identifies this video.
    let curr = videoElement;
    let domDepth = 0;
    const allFiberRecords = [];

    while (curr && domDepth < 4 && curr !== document.body) {
      for (const key in curr) {
        if (
          !key.startsWith('__reactFiber$') &&
          !key.startsWith('__reactInternalInstance$') &&
          !key.startsWith('__reactProps$')
        ) {
          continue;
        }

        let fiber = curr[key];
        let fiberDepth = 0;
        while (fiber && fiberDepth < 45) {
          const levelRecords = [];
          const visited = new WeakSet();
          const props = fiber.memoizedProps || fiber.pendingProps;
          if (props) {
            collectFromFiberProps(props, levelRecords, identity.ids, identity.shortcodes, 0, visited);
          }
          if (fiber.memoizedState && typeof fiber.memoizedState === 'object') {
            collectFromFiberProps(fiber.memoizedState, levelRecords, identity.ids, identity.shortcodes, 0, visited);
          }
          if (fiber.stateNode && typeof fiber.stateNode === 'object') {
            const st = fiber.stateNode.props || fiber.stateNode.state;
            if (st) collectFromFiberProps(st, levelRecords, identity.ids, identity.shortcodes, 0, visited);
          }

          if (levelRecords.length > 0) {
            const uniqueLevel = [...new Map(levelRecords.map(r => [r.url, r])).values()];
            allFiberRecords.push(...uniqueLevel);

            // If this immediate component holds exactly 1 progressive video URL
            // and we aren't on a multi-item highlight/carousel where Fiber can
            // hold the first preloaded slide, return it immediately!
            if (uniqueLevel.length === 1 && !meta.isHighlight && !meta.isCarousel) {
              if (!meta.storyId || uniqueLevel[0].ids.length === 0 || uniqueLevel[0].ids.includes(String(meta.storyId))) {
                return { url: uniqueLevel[0].url, source: 'main-fiber-direct' };
              }
            }

            const matched = matchBestRecord(uniqueLevel, identity, meta, videoElement);
            if (matched) {
              return { url: matched, source: 'main-fiber-matched' };
            }
          }

          fiber = fiber.return;
          fiberDepth++;
        }
      }
      curr = curr.parentElement;
      domDepth++;
    }

    // Step 2: Check all collected fiber records with combined identity
    if (allFiberRecords.length > 0) {
      const matched = matchBestRecord(allFiberRecords, identity, meta, videoElement);
      if (matched) return { url: matched, source: 'main-fiber-aggregate' };
    }

    // Step 3: Scan SSR JSON scripts and match against passive GraphQL/API registry
    scanSsrScripts();
    if (mediaRegistry.length > 0) {
      const matched = matchBestRecord(mediaRegistry, identity, meta, videoElement);
      if (matched) return { url: matched, source: 'main-registry' };
    }

    console.warn('[Social Media Downloader] MAIN bridge could not uniquely match video:', {
      fiberCount: allFiberRecords.length,
      registryCount: mediaRegistry.length,
      registryShortcodes: [...new Set(mediaRegistry.map(r => r.shortcode).filter(Boolean))].slice(0, 15),
      ids: [...identity.ids],
      shortcodes: [...identity.shortcodes],
      posterCount: identity.posterPaths.length,
      duration: identity.duration,
      videoSrc: (videoElement.currentSrc || videoElement.src || '').slice(0, 80)
    });
    return null;
  }

  document.addEventListener('tmd-resolve-video', () => {
    try {
      const video = document.querySelector('[data-tmd-probe-id]');
      if (!video) return;

      let meta = {};
      try {
        const rawMeta = video.getAttribute('data-tmd-probe-meta');
        if (rawMeta) meta = JSON.parse(rawMeta);
      } catch (e) {}

      const result = resolveVideoInMainWorld(video, meta);
      if (result && result.url) {
        video.setAttribute('data-tmd-probe-result', JSON.stringify(result));
      }
    } catch (e) {}
  });
})();
