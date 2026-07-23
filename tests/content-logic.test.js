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
    isVisibleMediaElement
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

console.log('content logic tests passed');
