# Threads Media Downloader 擴充功能

Threads 網頁版專用的高畫質圖片與影片一鍵下載擴充功能。

## 🌟 特點與功能
- **懸停自動顯示**：滑鼠游標移至 Threads 貼文中的圖片或影片時，右上角會自動浮現下載按鈕。
- **原圖與高畫質影片下載**：自動解析圖片 `srcset` 抓取最高解析度原圖，或解析 `<video>` 標籤中的 MP4 連結。
- **動態載入支援**：使用 `MutationObserver` 技術，Threads 貼文無限向下滾動時，新載入的貼文亦能即時支援下載。
- **現代玻璃擬態 (Glassmorphism) UI**：符合 Threads 深色/淺色主題風格，附帶微動畫與視覺狀態回饋（下載中、已完成）。

---

## 🛠️ 安裝教學 (Chrome / Edge / Brave)

1. 開啟瀏覽器擴充功能管理頁面：
   - **Chrome**: 在網址列輸入 `chrome://extensions/`
   - **Edge**: 在網址列輸入 `edge://extensions/`
   - **Brave**: 在網址列輸入 `brave://extensions/`

2. 開啟右側/右上角的 **「開發人員模式 (Developer Mode)」** 開關。

3. 點擊 **「載入未封裝項目 (Load unpacked)」** 按鈕。

4. 選擇以下資料夾：
   `c:\Users\a0966\OneDrive\桌面\extension\threads-media-downloader`

5. 前往 [Threads 網頁版](https://www.threads.net/)，將滑鼠移至任意圖片或影片上，即可看到右上角的下載圖示！
