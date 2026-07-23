// Threads Media Downloader Background Service Worker

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'download' && request.url) {
    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    const prefix = request.type === 'video' ? 'Threads_Video_' : 'Threads_Image_';
    const ext = request.ext || (request.type === 'video' ? 'mp4' : 'jpg');
    
    // Generate clean filename
    const filename = request.filename || `${prefix}${timestamp}.${ext}`;

    chrome.downloads.download(
      {
        url: request.url,
        filename: filename,
        saveAs: false
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error('[Threads Downloader] Download failed:', chrome.runtime.lastError);
          // If direct download fails (e.g. CORS blob issue), notify content script
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          console.log('[Threads Downloader] Download started with ID:', downloadId);
          sendResponse({ success: true, downloadId: downloadId });
        }
      }
    );
    return true; // Keep message channel open for async sendResponse
  }
});
