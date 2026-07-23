// Social Media Downloader Background Service Worker - Fetch Blob Anti-CORS Version

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'download' && request.url) {
    chrome.storage.local.get(['filenameFormat', 'customPrefix', 'downloadHistory'], async (data) => {
      const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
      const ext = request.ext || (request.type === 'video' ? 'mp4' : 'jpg');
      const site = request.site || 'Social';

      let prefix = `${site}_${request.type === 'video' ? 'Video' : 'Image'}_`;
      if (data.filenameFormat === 'custom' && data.customPrefix) {
        const cleanPrefix = data.customPrefix.replace(/[/\\?%*:|"<>]/g, '_');
        prefix = `${cleanPrefix}_`;
      }

      const filename = `${prefix}${timestamp}.${ext}`;

      let downloadTargetUrl = request.url;
      let blobUrlToRevoke = null;

      // Handle HTTP/HTTPS URLs by fetching blob locally to bypass CORS and Network Error
      if (request.url.startsWith('http://') || request.url.startsWith('https://')) {
        try {
          const res = await fetch(request.url, { credentials: 'include' });
          if (res.ok) {
            const blob = await res.blob();
            downloadTargetUrl = URL.createObjectURL(blob);
            blobUrlToRevoke = downloadTargetUrl;
          }
        } catch (err) {
          console.warn('[Social Media Downloader] Fetch blob fallback to raw URL:', err);
        }
      }

      chrome.downloads.download(
        {
          url: downloadTargetUrl,
          filename: filename,
          saveAs: false
        },
        (downloadId) => {
          if (blobUrlToRevoke) {
            setTimeout(() => URL.revokeObjectURL(blobUrlToRevoke), 15000);
          }

          if (chrome.runtime.lastError) {
            console.error('[Social Media Downloader] Download failed:', chrome.runtime.lastError);
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            console.log('[Social Media Downloader] Download started:', filename, downloadId);
            
            // Store entry in download history
            const history = data.downloadHistory || [];
            history.unshift({
              filename: filename,
              timestamp: Date.now(),
              type: request.type || 'image',
              site: site,
              url: request.url
            });
            if (history.length > 20) history.pop();
            chrome.storage.local.set({ downloadHistory: history });

            sendResponse({ success: true, downloadId: downloadId, filename: filename });
          }
        }
      );
    });
    return true; // Keep channel open for async response
  }
});
