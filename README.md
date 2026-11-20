# Social Media Downloader (v1.5.1)

跨社群平台一鍵高畫質圖片與原聲影片下載 Chrome 擴充功能，支援 **Threads、Instagram、Facebook、X (Twitter)、Pinterest**。

---

## ✨ 主要功能

- **🌐 多平台支援**
  - **Threads**（`threads.net` / `threads.com`）：支援單則貼文、多影片並排輪播原聲 MP4 與高畫質圖片。
  - **Instagram**（`instagram.com`）：支援貼文、多圖/多影片輪播、Reels、限時動態（Stories）與精選動態（Highlights）原聲下載。
  - **Facebook**（`facebook.com`）：支援貼文與 Reels，自動從 Relay / GraphQL 優先擷取 HD 原聲 MP4。
  - **X / Twitter**（`x.com` / `twitter.com`）：自動將圖片升級為 `name=orig` 原始解析度。
  - **Pinterest**（`pinterest.*`）：自動將縮圖路徑升級為 `/originals/` 無損原圖。
- **🎬 原聲影片精準解析（MAIN World Bridge）**
  - 透過 Manifest V3 `"world": "MAIN"` 橋接腳本（`page-bridge.js`）直接讀取頁面 React Fiber，並被動索引 Meta GraphQL / SSR 媒體資料。
  - 嚴格解碼 Meta `efg` 參數並過濾純音訊檔與無聲 DASH 分段，確保下載的是**對應你點選的那支影片**且為**影音合一的原聲 MP4**。
- **🎯 精準懸停浮動按鈕（Direct-Hover-Only）**
  - 滑鼠移到貼文圖片或影片時，右上角自動出現下載按鈕；自動過濾頭像、側邊欄與小圖示。
  - 按 `Esc`、關閉燈箱或捲動離開視口時自動隱藏，不遮擋操作。
- **⚙️ Popup 設定面板**
  - 一鍵啟用 / 停用擴充功能（即時生效，免重整頁面）。
  - 支援預設檔名（自動帶入平台與時間戳）或自訂檔名前綴。
  - 內建最近 20 筆下載紀錄列表與一鍵清除功能。

---

## 🛠️ 安裝方式（Chrome / Edge / Brave）

1. 下載或 clone 本專案至本機：
   ```bash
   git clone https://github.com/Yu817/Social-Media-Downloader.git
   ```
2. 開啟瀏覽器擴充功能管理頁面：
   - **Chrome**：`chrome://extensions/`
   - **Edge**：`edge://extensions/`
   - **Brave**：`brave://extensions/`
3. 開啟右上角的 **「開發人員模式 (Developer mode)」**。
4. 點擊 **「載入未封裝項目 (Load unpacked)」**，選擇本專案資料夾 `Social-Media-Downloader`。
5. 重新整理已開啟的社群網站分頁，滑鼠移至圖片或影片上即可點擊右上角按鈕下載。

> **更新程式碼後**：請回到 `chrome://extensions/` 點擊本擴充功能的 **重新載入（Reload）**，並重新整理目標分頁以載入最新腳本。

---

## 📁 專案結構

```text
Social-Media-Downloader/
├── manifest.json            # Chrome Extension Manifest V3 設定（含 MAIN / ISOLATED 雙腳本）
├── page-bridge.js           # MAIN World 橋接腳本：React Fiber 與 Meta GraphQL/SSR 原聲影片解析
├── content.js               # Content Script：懸停偵測、浮動按鈕 UI、多平台媒體解析與 IG API 備援
├── content.css              # 浮動下載按鈕與提示樣式
├── background.js            # Service Worker：呼叫 chrome.downloads 下載並寫入歷史紀錄
├── popup.html / .css / .js  # 擴充功能設定與下載紀錄視窗
├── icons/                   # 擴充功能圖示
└── tests/
    └── content-logic.test.js # 核心解析與比對邏輯單元測試
```

---

## 🧪 執行測試

本專案使用 Node.js 內建 `assert` 與 `vm` 執行單元測試（免安裝外部套件）：

```bash
node tests/content-logic.test.js
```
