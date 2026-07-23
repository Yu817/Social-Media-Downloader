// Threads Media Downloader Background Service Worker

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'download' && request.url) {
    chrome.storage.local.get(['filenameFormat', 'customPrefix', 'downloadHistory'], (data) => {
      const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
      const ext = request.ext || (request.type === 'video' ? 'mp4' : 'jpg');
      
      let prefix = request.type === 'video' ? 'Threads_Video_' : 'Threads_Image_';
      if (data.filenameFormat === 'custom' && data.customPrefix) {
        const cleanPrefix = data.customPrefix.replace(/[/\\?%*:|"<>]/g, '_');
        prefix = `${cleanPrefix}_`;
      }

      const filename = `${prefix}${timestamp}.${ext}`;

      chrome.downloads.download(
        {
          url: request.url,
          filename: filename,
          saveAs: false
        },
        (downloadId) => {
          if (chrome.runtime.lastError) {
            console.error('[Threads Downloader] Download failed:', chrome.runtime.lastError);
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            console.log('[Threads Downloader] Download started:', filename, downloadId);
            
            // Store entry in download history
            const history = data.downloadHistory || [];
            history.unshift({
              filename: filename,
              timestamp: Date.now(),
              type: request.type || 'image',
              url: request.url
            });
            // Keep latest 20 items
            if (history.length > 20) history.pop();
            chrome.storage.local.set({ downloadHistory: history });

            sendResponse({ success: true, downloadId: downloadId, filename: filename });
          }
        }
      );
    });
    return true; // Keep channel open for async sendResponse
  }
});
