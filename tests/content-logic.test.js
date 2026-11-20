const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const contentPath = path.join(__dirname, '..', 'content.js');
let source = fs.readFileSync(contentPath, 'utf8');
source = source.replace(
  /\n\}\)\(\);\s*$/,
  `
  globalThis.__TMD_TEST__ = {
    getComparableInstagramMediaPath,
    getInstagramItemIndexByMetadata,
    getInstagramMediaUrl,
    getStoryIndexFromSegments,
    isContentImage,
    isVisibleMediaElement,
    isAudioOnlyUrl,
    isDashOnlyUrl,
    isProgressiveVideoUrl,
    getNetworkVideoUrl,
    extractThreadsVideosFromHtml
  };
})();`
);

const body = {
  appendChild() {},
  contains() { return true; }
};
const documentStub = {
  body,
  hidden: false,
  addEventListener() {},
  querySelector() { return null; },
  querySelectorAll() { return []; },
  elementsFromPoint() { return []; },
  createElement() {
    return {
      className: '',
      style: {},
      classList: { add() {}, remove() {}, contains() { return false; } },
      setAttribute() {},
      addEventListener() {}
    };
  }
};
const windowStub = {
  location: {
    hostname: 'www.instagram.com',
    href: 'https://www.instagram.com/stories/highlights/123/',
    pathname: '/stories/highlights/123/'
  },
  innerWidth: 1920,
  innerHeight: 1080,
  addEventListener() {},
  setInterval() { return 1; },
  getComputedStyle(node) {
    return {
      display: node.computedDisplay || 'block',
      visibility: node.computedVisibility || 'visible',
      opacity: node.computedOpacity ?? '1',
      transform: node.computedTransform || node.style?.transform || 'none'
    };
  },
  atob(value) {
    return Buffer.from(value, 'base64').toString('binary');
  }
};
windowStub.top = windowStub;

const context = {
  window: windowStub,
  document: documentStub,
  location: windowStub.location,
  URL,
  Buffer,
  console: { log() {}, warn() {} },
  performance: { getEntriesByType() { return []; } },
  MutationObserver: class {
    observe() {}
  },
  chrome: {
    storage: {
      local: { get(_keys, callback) { callback({}); } },
      onChanged: { addListener() {} }
    },
    runtime: {}
  },
  setTimeout() { return 1; },
  clearTimeout() {}
};

vm.runInNewContext(source, context, { filename: contentPath });
const api = context.__TMD_TEST__;

function makeNode({ transform = 'none', opacity = '1', children = [] } = {}) {
  return {
    style: { transform },
    dataset: {},
    children,
    computedTransform: transform,
    computedOpacity: opacity,
    getAttribute() { return null; },
    querySelectorAll() { return children; }
  };
}

assert.equal(
  api.getComparableInstagramMediaPath('https://scontent.cdninstagram.com/v/t51/file.mp4?x=1'),
  '/v/t51/file.mp4'
);

const video = {
  tagName: 'VIDEO',
  currentSrc: 'blob:https://www.instagram.com/abc',
  src: '',
  poster: 'https://scontent.cdninstagram.com/v/t51/current.jpg?token=dom',
  duration: Number.NaN,
  videoWidth: 1080,
  videoHeight: 1920,
  parentElement: null,
  getAttribute(name) { return name === 'poster' ? this.poster : null; },
  querySelectorAll() { return []; },
  getBoundingClientRect() {
    return { left: 0, top: 0, right: 1080, bottom: 1920, width: 1080, height: 1920 };
  }
};
const items = [
  {
    image_versions2: { candidates: [{ url: 'https://cdn.example/v/t51/first.jpg?token=api' }] },
    video_versions: [{ url: 'https://cdn.example/first.mp4', width: 1080, height: 1920 }]
  },
  {
    image_versions2: { candidates: [{ url: 'https://other.example/v/t51/current.jpg?token=api' }] },
    video_versions: [{ url: 'https://cdn.example/current.mp4', width: 1080, height: 1920 }]
  }
];
assert.equal(api.getInstagramItemIndexByMetadata(video, items), 1);

// Test IMG element metadata index matching (for Photo Highlights)
const imgElement = {
  tagName: 'IMG',
  currentSrc: 'https://scontent.cdninstagram.com/v/t51/photo2.jpg?token=dom',
  src: 'https://scontent.cdninstagram.com/v/t51/photo2.jpg?token=dom',
  parentElement: null,
  getAttribute(name) { return name === 'src' ? this.src : null; },
  querySelectorAll() { return []; },
  getBoundingClientRect() {
    return { left: 0, top: 0, right: 1080, bottom: 1920, width: 1080, height: 1920 };
  }
};
const photoItems = [
  {
    display_url: 'https://cdn.example/v/t51/photo1.jpg?token=api',
    image_versions2: { candidates: [{ url: 'https://cdn.example/v/t51/photo1.jpg?token=api' }] }
  },
  {
    display_url: 'https://cdn.example/v/t51/photo2.jpg?token=api',
    image_versions2: { candidates: [{ url: 'https://cdn.example/v/t51/photo2.jpg?token=api' }] }
  }
];
assert.equal(api.getInstagramItemIndexByMetadata(imgElement, photoItems), 1);
assert.equal(api.getInstagramMediaUrl(photoItems[1]), 'https://cdn.example/v/t51/photo2.jpg?token=api');

assert.equal(
  api.getStoryIndexFromSegments([
    makeNode({ transform: 'scaleX(1)' }),
    makeNode({ transform: 'scaleX(0.45)' }),
    makeNode({ transform: 'scaleX(0)' })
  ]),
  1
);
assert.equal(
  api.getStoryIndexFromSegments([
    makeNode({ transform: 'scaleX(1)' }),
    makeNode({ transform: 'scaleX(0)' }),
    makeNode({ transform: 'scaleX(0)' })
  ]),
  1
);

assert.equal(api.isContentImage({
  complete: true,
  naturalWidth: 640,
  naturalHeight: 640,
  getBoundingClientRect() { return { width: 120, height: 120 }; }
}), true);

const hiddenParent = {
  hidden: false,
  parentElement: body,
  computedOpacity: '0',
  getAttribute() { return null; }
};
const hiddenMedia = {
  isConnected: true,
  hidden: false,
  parentElement: hiddenParent,
  getAttribute() { return null; },
  getBoundingClientRect() {
    return { left: 10, top: 10, right: 210, bottom: 210, width: 200, height: 200 };
  }
};
assert.equal(api.isVisibleMediaElement(hiddenMedia), false);

// Test non-supported domain early return
const unsupportedContext = {
  window: {
    location: { hostname: 'www.google.com', href: 'https://www.google.com/', pathname: '/' },
    innerWidth: 1920,
    innerHeight: 1080,
    addEventListener() {},
    getComputedStyle() { return {}; }
  },
  document: documentStub,
  location: { hostname: 'www.google.com' },
  console: { log() {}, warn() {} },
  setTimeout() { return 1; },
  clearTimeout() {}
};
unsupportedContext.window.top = unsupportedContext.window;
vm.runInNewContext(source, unsupportedContext, { filename: contentPath });
assert.equal(unsupportedContext.__TMD_TEST__, undefined);

// =========================================================================
// Test Meta efg Base64 (including URL-safe & video_id alongside audio tag)
// =========================================================================
function toUrlSafeBase64(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

const audioEfg = toUrlSafeBase64({
  vencode_tag: 'dash_ln_heaac_vbr3_audio',
  video_id: 987654321
});
const metaAudioDashUrl = `https://scontent.cdninstagram.com/o1/v/t16/f2/m86/123_n.mp4?efg=${audioEfg}&bytestart=0&byteend=65535`;
assert.equal(api.isAudioOnlyUrl(metaAudioDashUrl), true);
assert.equal(api.isProgressiveVideoUrl(metaAudioDashUrl), false);

const videoDashEfg = toUrlSafeBase64({
  vencode_tag: 'dash_vp9-basic-gen2_720p',
  xpv_asset_id: 987654321
});
const metaVideoDashUrl = `https://video.xx.fbcdn.net/v/t42.1790-2/456_n.mp4?efg=${videoDashEfg}`;
assert.equal(api.isAudioOnlyUrl(metaVideoDashUrl), false);
assert.equal(api.isDashOnlyUrl(metaVideoDashUrl), true);
assert.equal(api.isProgressiveVideoUrl(metaVideoDashUrl), false);

const progressiveEfg = toUrlSafeBase64({
  vencode_tag: 'xpv_progressive.INSTAGRAM.C3.720.baseline',
  xpv_asset_id: 987654321
});
const metaProgressiveUrl = `https://scontent.cdninstagram.com/v/t51.2885-15/789_n.mp4?efg=${progressiveEfg}`;
assert.equal(api.isAudioOnlyUrl(metaProgressiveUrl), false);
assert.equal(api.isDashOnlyUrl(metaProgressiveUrl), false);
assert.equal(api.isProgressiveVideoUrl(metaProgressiveUrl), true);

// =========================================================================
// Test MAIN world page-bridge.js (FB Relay Fiber + IG/Threads SSR Registry)
// =========================================================================
const bridgePath = path.join(__dirname, '..', 'page-bridge.js');
const bridgeSource = fs.readFileSync(bridgePath, 'utf8');

let resolveHandler = null;
const fbVideoAttrs = new Map();
const fbVideoNode = {
  tagName: 'VIDEO',
  poster: 'https://scontent.xx.fbcdn.net/v/t15/target_thumb.jpg?oe=123',
  duration: 12.5,
  videoWidth: 720,
  videoHeight: 1280,
  parentElement: null,
  getAttribute(name) { return fbVideoAttrs.get(name) ?? null; },
  setAttribute(name, val) { fbVideoAttrs.set(name, String(val)); },
  removeAttribute(name) { fbVideoAttrs.delete(name); },
  querySelectorAll() { return []; },
  __reactFiber$test: {
    memoizedProps: {
      videoDeliveryResponseFragment: {
        videoDeliveryResponseResult: {
          progressive_urls: [
            {
              progressive_url: `https://video.xx.fbcdn.net/v/t42/fb_sd.mp4?efg=${progressiveEfg}`,
              metadata: { quality: 'SD' }
            },
            {
              progressive_url: `https://video.xx.fbcdn.net/v/t42/fb_hd.mp4?efg=${progressiveEfg}`,
              metadata: { quality: 'HD' }
            }
          ]
        }
      }
    },
    return: null
  }
};

const ssrScriptNode = {
  textContent: JSON.stringify({
    feed: [
      {
        id: '111111111',
        thumbnail_url: 'https://scontent.cdninstagram.com/v/t51/other_post.jpg?a=1',
        video_versions: [
          { url: `https://scontent.cdninstagram.com/v/t51/other_video.mp4?efg=${progressiveEfg}`, width: 720, height: 1280 }
        ]
      },
      {
        id: '222222222',
        thumbnail_url: 'https://scontent.cdninstagram.com/v/t51/clicked_post.jpg?a=2',
        video_versions: [
          { url: metaAudioDashUrl, width: 1080, height: 1920 },
          { url: `https://scontent.cdninstagram.com/v/t51/clicked_video.mp4?efg=${progressiveEfg}`, width: 1080, height: 1920 }
        ]
      }
    ]
  })
};

let activeProbeVideo = fbVideoNode;
const bridgeWindow = {
  location: {
    hostname: 'www.facebook.com',
    href: 'https://www.facebook.com/watch/',
    pathname: '/watch/'
  },
  atob(value) { return Buffer.from(value, 'base64').toString('binary'); }
};
bridgeWindow.top = bridgeWindow;

const bridgeContext = {
  window: bridgeWindow,
  document: {
    body: {},
    addEventListener(eventName, fn) {
      if (eventName === 'tmd-resolve-video') resolveHandler = fn;
    },
    querySelector(sel) {
      return sel === '[data-tmd-probe-id]' ? activeProbeVideo : null;
    },
    querySelectorAll(sel) {
      return sel === 'script[type="application/json"]' ? [ssrScriptNode] : [];
    }
  },
  URL,
  XMLHttpRequest: { prototype: { open() {}, send() {} } },
  console: { log() {}, warn() {} }
};

vm.runInNewContext(bridgeSource, bridgeContext, { filename: bridgePath });
assert.equal(typeof resolveHandler, 'function');

// Case 1: FB Fiber progressive HD URL preferred over SD
fbVideoAttrs.set('data-tmd-probe-id', 'probe-1');
fbVideoAttrs.set('data-tmd-probe-meta', '{}');
resolveHandler();
const fbResult = JSON.parse(fbVideoAttrs.get('data-tmd-probe-result'));
assert.equal(fbResult.url, `https://video.xx.fbcdn.net/v/t42/fb_hd.mp4?efg=${progressiveEfg}`);
assert.equal(fbResult.source, 'main-fiber-direct');

// Case 2: SSR JSON registry matches clicked video by poster path (ignores unrelated video & audio-only stream)
const threadsVideoAttrs = new Map([
  ['data-tmd-probe-id', 'probe-2'],
  ['data-tmd-probe-meta', '{}']
]);
activeProbeVideo = {
  tagName: 'VIDEO',
  poster: 'https://scontent.cdninstagram.com/v/t51/clicked_post.jpg?token=dom',
  duration: Number.NaN,
  videoWidth: 1080,
  videoHeight: 1920,
  parentElement: null,
  getAttribute(name) { return threadsVideoAttrs.get(name) ?? null; },
  setAttribute(name, val) { threadsVideoAttrs.set(name, String(val)); },
  removeAttribute(name) { threadsVideoAttrs.delete(name); },
  querySelectorAll() { return []; }
};
resolveHandler();
const threadsResult = JSON.parse(threadsVideoAttrs.get('data-tmd-probe-result'));
assert.equal(threadsResult.url, `https://scontent.cdninstagram.com/v/t51/clicked_video.mp4?efg=${progressiveEfg}`);
assert.equal(threadsResult.source, 'main-registry');

// Case 3: Threads multi-video carousel (identical dimensions, no poster, no duration)
// Matches by sibling <video> index inside the post container
const carouselVid1Attrs = new Map([
  ['data-tmd-probe-id', 'probe-3'],
  ['data-tmd-probe-meta', '{}']
]);
const carouselVid2Attrs = new Map();
const carouselContainer = {
  parentElement: null,
  querySelectorAll(sel) { return sel === 'video' ? [carouselVid1, carouselVid2] : []; }
};
const sharedCarouselFiber = {
  memoizedProps: {
    post: {
      carousel_media: [
        { video_versions: [{ url: `https://scontent.cdninstagram.com/v/t51/slide1.mp4?efg=${videoDashEfg}`, width: 720, height: 1280 }] },
        { video_versions: [{ url: `https://scontent.cdninstagram.com/v/t51/slide2.mp4?efg=${videoDashEfg}`, width: 720, height: 1280 }] }
      ]
    }
  },
  return: null
};
const carouselVid1 = {
  tagName: 'VIDEO',
  poster: '',
  duration: Number.NaN,
  videoWidth: 720,
  videoHeight: 1280,
  parentElement: carouselContainer,
  getAttribute(name) { return carouselVid1Attrs.get(name) ?? null; },
  setAttribute(name, val) { carouselVid1Attrs.set(name, String(val)); },
  removeAttribute(name) { carouselVid1Attrs.delete(name); },
  querySelectorAll() { return []; },
  __reactFiber$test: sharedCarouselFiber
};
const carouselVid2 = {
  tagName: 'VIDEO',
  poster: '',
  duration: Number.NaN,
  videoWidth: 720,
  videoHeight: 1280,
  parentElement: carouselContainer,
  getAttribute(name) { return carouselVid2Attrs.get(name) ?? null; },
  setAttribute(name, val) { carouselVid2Attrs.set(name, String(val)); },
  removeAttribute(name) { carouselVid2Attrs.delete(name); },
  querySelectorAll() { return []; },
  __reactFiber$test: sharedCarouselFiber
};
activeProbeVideo = carouselVid1;
resolveHandler();
const carouselResult1 = JSON.parse(carouselVid1Attrs.get('data-tmd-probe-result'));
assert.equal(carouselResult1.url, `https://scontent.cdninstagram.com/v/t51/slide1.mp4?efg=${videoDashEfg}`);

// Case 4: Exact Threads GraphQL/SSR scenario where parent post has `code: 'Df9c6UjiTeZ'`,
// child `carousel_media` items have NO `code`, NO `duration`, NO `poster`, and DOM has no Fiber match.
const ssrCarouselScript = {
  textContent: JSON.stringify({
    posts: [
      {
        code: 'OtherPost99',
        carousel_media: [
          { video_versions: [{ url: `https://scontent.cdninstagram.com/v/t51/unrelated.mp4?efg=${progressiveEfg}`, width: 720, height: 1280 }] }
        ]
      },
      {
        code: 'Df9c6UjiTeZ',
        carousel_media: [
          { video_versions: [{ url: `https://scontent.cdninstagram.com/v/t51/df9_first.mp4?efg=${progressiveEfg}`, width: 720, height: 1280 }] },
          { video_versions: [{ url: `https://scontent.cdninstagram.com/v/t51/df9_second.mp4?efg=${progressiveEfg}`, width: 720, height: 1280 }] }
        ]
      }
    ]
  })
};
const df9Vid1Attrs = new Map();
const df9Vid2Attrs = new Map([
  ['data-tmd-probe-id', 'probe-4'],
  ['data-tmd-probe-meta', '{}']
]);
const df9PostLink = { getAttribute(name) { return name === 'href' ? '/@jason__jn/post/Df9c6UjiTeZ' : null; } };
const df9PostContainer = {
  parentElement: null,
  querySelectorAll(sel) {
    if (sel === 'video') return [df9Vid1, df9Vid2];
    if (sel === 'a[href]') return [df9PostLink];
    return [];
  }
};
const df9Vid1 = {
  tagName: 'VIDEO',
  poster: '',
  duration: 25.3,
  videoWidth: 720,
  videoHeight: 1280,
  parentElement: df9PostContainer,
  getAttribute(name) { return df9Vid1Attrs.get(name) ?? null; },
  setAttribute(name, val) { df9Vid1Attrs.set(name, String(val)); },
  removeAttribute(name) { df9Vid1Attrs.delete(name); },
  querySelectorAll() { return []; }
};
const df9Vid2 = {
  tagName: 'VIDEO',
  poster: '',
  duration: 25.2,
  videoWidth: 720,
  videoHeight: 1280,
  parentElement: df9PostContainer,
  getAttribute(name) { return df9Vid2Attrs.get(name) ?? null; },
  setAttribute(name, val) { df9Vid2Attrs.set(name, String(val)); },
  removeAttribute(name) { df9Vid2Attrs.delete(name); },
  querySelectorAll() { return []; }
};
bridgeContext.document.querySelectorAll = (sel) =>
  sel === 'script[type="application/json"]' ? [ssrScriptNode, ssrCarouselScript] : [];
activeProbeVideo = df9Vid2;
resolveHandler();
const df9Result = JSON.parse(df9Vid2Attrs.get('data-tmd-probe-result'));
assert.equal(df9Result.url, `https://scontent.cdninstagram.com/v/t51/df9_second.mp4?efg=${progressiveEfg}`);
assert.equal(df9Result.source, 'main-registry');

// Case 5: Single-video post appearing twice in SSR/GraphQL with different CDN hosts/tokens
// Must deduplicate to 1 video instead of failing with codeMatches.length === 2
const duplicateCdnScript = {
  textContent: JSON.stringify({
    items: [
      {
        code: 'Df9bvZjkn91',
        pk: '5555555555',
        video_versions: [
          { url: `https://scontent-tpe1-1.cdninstagram.com/v/t51/same_vid_n.mp4?oh=AAA&efg=${progressiveEfg}`, width: 720, height: 1280 }
        ]
      },
      {
        code: 'Df9bvZjkn91',
        pk: '5555555555',
        video_versions: [
          { url: `https://scontent-tpe1-2.cdninstagram.com/v/t51/same_vid_n.mp4?oh=BBB&efg=${progressiveEfg}`, width: 1080, height: 1920 }
        ]
      }
    ]
  })
};
const dupVidAttrs = new Map([
  ['data-tmd-probe-id', 'probe-5'],
  ['data-tmd-probe-meta', '{}']
]);
const dupPostLink = { getAttribute(name) { return name === 'href' ? '/@user/post/Df9bvZjkn91' : null; } };
const dupPostContainer = {
  parentElement: null,
  querySelectorAll(sel) {
    if (sel === 'video') return [dupVid];
    if (sel === 'a[href]') return [dupPostLink];
    return [];
  }
};
const dupVid = {
  tagName: 'VIDEO',
  poster: '',
  duration: 29.13,
  videoWidth: 1080,
  videoHeight: 1920,
  parentElement: dupPostContainer,
  getAttribute(name) { return dupVidAttrs.get(name) ?? null; },
  setAttribute(name, val) { dupVidAttrs.set(name, String(val)); },
  removeAttribute(name) { dupVidAttrs.delete(name); },
  querySelectorAll() { return []; }
};
bridgeContext.document.querySelectorAll = (sel) =>
  sel === 'script[type="application/json"]' ? [duplicateCdnScript] : [];
activeProbeVideo = dupVid;
resolveHandler();
const dupResult = JSON.parse(dupVidAttrs.get('data-tmd-probe-result'));
assert.equal(dupResult.url, `https://scontent-tpe1-2.cdninstagram.com/v/t51/same_vid_n.mp4?oh=BBB&efg=${progressiveEfg}`);
assert.equal(dupResult.source, 'main-registry');

// Case 6: Threads on-demand post HTML fallback extracts exact shortcode's video_versions
const sampleThreadsHtml = `
  <html><body>
    <script type="application/json" data-sjs>${JSON.stringify({
      require: [[['X', 'Y', null, [{
        __bbox: {
          result: {
            data: {
              posts: [
                {
                  code: 'Df7kFQfElDu',
                  video_versions: [{ url: `https://scontent.cdninstagram.com/v/t51/other.mp4?efg=${progressiveEfg}`, width: 720, height: 1280 }]
                },
                {
                  code: 'Df7kK4-knTE',
                  video_versions: [{ url: `https://scontent.cdninstagram.com/v/t51/target_df7k.mp4?efg=${progressiveEfg}`, width: 1080, height: 1920 }]
                }
              ]
            }
          }
        }
      }]]]]
    })}</script>
  </body></html>
`;
const extracted = api.extractThreadsVideosFromHtml(sampleThreadsHtml, 'Df7kK4-knTE');
assert.equal(extracted.length, 1);
assert.equal(extracted[0].url, `https://scontent.cdninstagram.com/v/t51/target_df7k.mp4?efg=${progressiveEfg}`);

console.log('content logic tests passed');
