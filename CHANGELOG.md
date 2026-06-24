# 版本紀錄

本檔案用於追蹤專案每次修改內容，方便回顧與對照。  
格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)。

---

## 如何更新

每次完成一組有意義的修改後：

1. 在上方 **「未發布」** 區塊補充條目（或將「未發布」改為正式版本號與日期）。
2. 條目分類建議使用：**新增**、**變更**、**修復**、**移除**、**備註**。
3. 可一併更新 `package.json` 的 `version`（若需要語意化版本號）。

```markdown
## [1.1.0] - 2026-06-01

### 新增
- 說明做了什麼

### 修復
- 說明修了什么問題
```

---

## [未發布]

> 目前工作區尚未 commit 的變更摘要（最後整理：2026-05-27）

### 修復

- **Netlify 建置**：勿用 `--with-deps`（Netlify 無 root）；檢測失敗仍會部署儀表板（預設不 `exit 1`）
- 切換單項檢測時，從「全部檢測」報告切出該項結果，不再顯示尚無報告

### 變更

- **儀表板 ↔ Playwright 同步**：`test-cases.json` 新增「開啟首頁進入下載頁面」，與報告四項一致
- 全部檢測只跑 `test-cases.json` 列出的 spec；狀態列「全部檢測」時採用 Playwright `summary` 與 `ok`
- 新增 `npm run sync:cases` 檢查標題是否對齊；`build:netlify` 建置前自動執行

### 新增

- **檢測儀表板**（`dashboard/`）
  - 本地 server：`npm run dashboard`
  - 選擇執行範圍（全部檢測 / 單項）、開始檢測、顯示各項目通過與否
  - 「詳細檢測報告」連結至 Playwright HTML 報告（`/playwright-report/index.html`）
- **報告產生腳本**（`scripts/generate-report-json.mjs`、`scripts/report-utils.mjs`）
  - 執行測試、產生 `dashboard/public/data/latest-report.json`
  - 複製 HTML 報告至 `dashboard/public/playwright-report/`
- **Netlify 部署**（`netlify.toml`、`netlify/functions/`）
  - `npm run build:netlify` 建置時跑檢測並更新報告
- **檢測項目設定**（`dashboard/public/data/test-cases.json`）
  - 電腦版-進入首頁點擊 download 按鈕
  - 下載頁面-下載按鈕、下載頁面-回首頁
- **錄製測試**
  - `tests/recorded/desktop-download.spec.ts`
  - `tests/recorded/w01-link-check.spec.ts`
  - `tests/recorded/homepage-navigation.spec.ts`（站點導覽，未列入儀表板大項）
- **w01 連結檢查**（`sites/w01-jitabet.ts`、helpers）

### 變更

- 下拉選單「**全部檢測**」置於最上方
- 「全部檢測」僅執行 `test-cases.json` 內列出的 spec 檔案
- 儀表板結果區只顯示大項通過／失敗，步驟細節改由 Playwright 報告查看
- 測試結果與大項 id 對應邏輯加強（`grep`、`matchInTitle`、檔名比對）
- `tests/helpers/navigation.ts` 擴充導覽與彈窗處理
- `package.json` 新增 `dashboard`、`build:netlify` 指令

### 移除

- `tests/homepage-navigation.spec.ts`（移至 `tests/recorded/`）
- `tests/recorded/jitabet-download.codegen.spec.ts`（改由 desktop-download 等取代）

### 備註

- 儀表板大項與 `homepage-navigation` 分開：後者為站點設定驅動的多導覽測試，目前未納入 `test-cases.json`
- 本地需先跑過檢測並產生報告，詳細報告連結才有內容可瀏覽

---

## [0.2.0] - 2026-05-27

### 新增

- `tests/recorded/desktop-download.spec.ts`：電腦版進入首頁並點擊 download，驗證導向 w01

### 備註

- Git：`9b2fd4c`、`d87df98` — 新增電腦版-進入首頁點擊 download 按鈕

---

## [0.1.0] - 2026-05-26

### 新增

- 初始化 Playwright 專案（TypeScript、Chromium）
- 站點設定 `sites/jitabet.ts`
- 基本首頁導覽測試結構

### 備註

- Git：`43cc98b` — 初始化 Playwright 專案並清理版本庫內容

---

## 版本對照（package.json）

| package.json | 說明           |
|--------------|----------------|
| 1.0.0        | 目前 npm 版本號（尚未隨 CHANGELOG 遞增） |

建議下次發布時將 `package.json` 的 `version` 與本檔案標題版本一併更新。
