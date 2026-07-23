# Threads Media Downloader 擴充功能 (v1.1.0)

Threads 網頁版專用的高畫質圖片與影片一鍵下載擴充功能，附帶精美的 Popup 設定選單。

## 🌟 特點與功能
- **視口全域浮動定位 (Fixed Viewport Overlay)**：滑鼠游標移至 Threads 貼文中的圖片或影片時，右上角會自動浮現黑底白字的圓形下載按鈕。
- **原圖與高畫質影片下載**：自動解析圖片 `srcset` 抓取最高解析度原圖，或解析 `<video>` 標籤與 Blob 中的 MP4 連結。
- **⚙️ Popup 質感設定視窗**：
  - **功能總開關**：可在擴充功能選單中一鍵開啟/關閉懸停按鈕（即時生效免刷新）。
  - **自訂檔名前綴**：支援預設檔名與自訂字首（如 `MySaved_20260723_1530.jpg`）。
  - **最近下載歷史紀錄**：自動儲存近期下載紀錄，包含圖片與影片分類與時間標記。
- **現代毛玻璃 (Glassmorphism) UI**：符合 Threads 深色/淺色主題風格，附帶微動畫與視覺狀態回饋（下載中、已完成）。

---

## 🛠️ 安裝教學 (Chrome / Edge / Brave)

1. 開啟瀏覽器擴充功能管理頁面：
   - **Chrome**: 在網址列輸入 `chrome://extensions/`
   - **Edge**: 在網址列輸入 `edge://extensions/`
   - **Brave**: 在網址列輸入 `brave://extensions/`

2. 開啟右側/右上角的 **「開發人員模式 (Developer Mode)」** 開關。

3. 點擊 **「載入未封裝項目 (Load unpacked)」** 按鈕。

4. 選擇資料夾：
   `threads-media-downloader`

5. 前往 [Threads 網頁版](https://www.threads.net/)，將滑鼠移至任意圖片或影片上，即可看到右上角的下載圖示！
