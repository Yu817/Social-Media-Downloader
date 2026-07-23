// Threads Media Downloader Popup Script

document.addEventListener('DOMContentLoaded', () => {
  const extensionToggle = document.getElementById('extensionToggle');
  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const filenameFormatSelect = document.getElementById('filenameFormatSelect');
  const customPrefixContainer = document.getElementById('customPrefixContainer');
  const customPrefixInput = document.getElementById('customPrefixInput');
  const historyList = document.getElementById('historyList');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');

  // Update Status Badge UI
  function updateStatusUI(enabled) {
    if (enabled) {
      statusBadge.className = 'status-badge active';
      statusText.textContent = '已啟用';
    } else {
      statusBadge.className = 'status-badge';
      statusText.textContent = '已停用';
    }
  }

  // Render History List
  function renderHistory(history = []) {
    historyList.innerHTML = '';
    if (!history || history.length === 0) {
      historyList.innerHTML = '<div class="empty-state">尚無下載紀錄</div>';
      return;
    }

    history.forEach((item) => {
      const el = document.createElement('div');
      el.className = 'history-item';

      const icon = item.type === 'video' ? '🎬' : '🖼️';
      const formattedTime = item.timestamp
        ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '';

      el.innerHTML = `
        <div class="history-file">
          <span class="history-icon">${icon}</span>
          <span class="history-name" title="${item.filename}">${item.filename}</span>
        </div>
        <span class="history-time">${formattedTime}</span>
      `;
      historyList.appendChild(el);
    });
  }

  // Load Saved Settings from Chrome Storage
  chrome.storage.local.get(
    ['extensionEnabled', 'filenameFormat', 'customPrefix', 'downloadHistory'],
    (data) => {
      const enabled = data.extensionEnabled !== false; // Default true
      extensionToggle.checked = enabled;
      updateStatusUI(enabled);

      const format = data.filenameFormat || 'default';
      filenameFormatSelect.value = format;

      if (format === 'custom') {
        customPrefixContainer.classList.remove('hidden');
      } else {
        customPrefixContainer.classList.add('hidden');
      }

      if (data.customPrefix) {
        customPrefixInput.value = data.customPrefix;
      }

      renderHistory(data.downloadHistory || []);
    }
  );

  // Toggle Extension On/Off
  extensionToggle.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    updateStatusUI(enabled);
    chrome.storage.local.set({ extensionEnabled: enabled });
  });

  // Filename Format Select Change
  filenameFormatSelect.addEventListener('change', (e) => {
    const format = e.target.value;
    if (format === 'custom') {
      customPrefixContainer.classList.remove('hidden');
    } else {
      customPrefixContainer.classList.add('hidden');
    }
    chrome.storage.local.set({ filenameFormat: format });
  });

  // Custom Prefix Input Change
  customPrefixInput.addEventListener('input', (e) => {
    const prefix = e.target.value.trim() || 'Threads_Media';
    chrome.storage.local.set({ customPrefix: prefix });
  });

  // Clear Download History
  clearHistoryBtn.addEventListener('click', () => {
    chrome.storage.local.set({ downloadHistory: [] }, () => {
      renderHistory([]);
    });
  });
});
