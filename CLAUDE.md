# CLAUDE.md — 寫字靜心（Calm Writing）專案工作定義檔

此檔案定義 PM / RD / QA 子代理人在本專案中的協作規則、技術背景與行為準則。每次執行協作流程前請先讀本檔，並在需要更完整背景時查閱 `docs/專案說明文件.md`。

---

## 專案概覽

**名稱：** 寫字靜心 (Calm Writing)
**性質：** 學術研究 × 產品開發雙軌並行
**所屬：** 國立聯合大學資訊管理學系，指導教授黃品叡
**核心概念：** 透過 iPad + Apple Pencil 或繪圖板擷取手寫生物特徵（筆壓、停頓、速度、筆畫數、傾斜度），推估使用者壓力狀態並支援情緒調節，融合客語書法練習。

---

## 檔案命名規則（嚴格遵守）

| 類型 | 格式 | 範例 | 部署目標 |
|------|------|------|----------|
| 產品版本 | `Calm_Writing_V[n].html` | `Calm_Writing_V13.html` | push 到 main 後由 `deploy-v.yml` 自動複製為 `index.html` |
| 研究測試版 | `t/Calm_Writing_T[n].html` | `t/Calm_Writing_T5.html` | push 到 main 後由 `deploy-t.yml` 自動複製為 `t/index.html` |

- **禁止**使用空格、底線以外的特殊字元；禁止偏離命名格式
- **修改慣例：複製最新版號檔案為新版號檔案再修改，禁止覆寫舊版本檔案**（保留完整歷史）
- 每個版本皆為完整的單一 HTML 交付物，無框架依賴、無建置流程
- `deploy-v.yml` / `deploy-t.yml` 只在 **push 到 main** 時觸發，PR 分支上的變更不會自動部署

---

## 技術架構

### 前端
- 單一 HTML 檔案（含所有 CSS、JS），無框架、無 build step
- Canvas API — 手寫繪圖層
- Pointer Events API — 讀取 `e.pressure`、`e.tiltX`、`e.tiltY`
- CSS `scale()` zoom + `getPos()` 座標修正
- Canvas `save()/restore()` 須繞過 DPR scale transform，才能正確執行 stroke-level undo

### 後端（雙軌，用途不同，勿混淆）
- **Google Sheets**（經 Google Apps Script `doGet` + GET 帶 `encodeURIComponent(JSON)`）— 研發人員資料確認用，26 欄完整生物特徵。禁止用 POST + no-cors。
- **Firebase Realtime Database**（`calm-writing`，匿名登入）— 使用者端功能（成就頁面、徽章、夥伴牆、心情泡泡）。兩者欄位目前不對稱，詳見 `docs/專案說明文件.md` 第九章。

### 部署
- GitHub Pages（本 repo：`ChihchenTseng/calm-writing`）
- `deploy-v.yml`、`deploy-t.yml` 為既有自動化，**不要修改**除非任務明確要求

### 字型
- 花蓮明朝（HanaMinA/B）via jsDelivr CDN — 客語特殊字元渲染

### 硬體
- iPad + Apple Pencil（主要）；HUION 繪圖板（Windows Ink 模式）

---

## StressEngine v2（現行邏輯，勿隨意變動閾值）

| 特徵 | 權重 |
|------|------|
| avg_pressure | 2.0 |
| session_duration_sec | 1.5 |
| avg_pause_duration_ms | 1.5 |
| pause_count | 1.0 |

`avg_char_spacing` 目前**全數排除**（見已知問題）。任何修改 StressEngine 權重或閾值的任務，必須有 PM 明確指示與資料依據，RD 不可自行調整。

---

## 已知問題清單（PM 任務來源）

完整清單見 `docs/專案說明文件.md` 第九章「設計目標落差與待解決問題」。PM 每次協作週期須從該清單挑選任務，原則：
- 範圍明確、影響單一函式或單一資料流程
- 不依賴尚未存在的外部服務（如新後端遷移）
- 優先修「已在數據中排除、影響研究資料品質」的 bug

清單挑完（所有可獨立處理的項目皆已產生 PR）則回報「無待辦任務」並結束週期，不得為了有事做而發明清單外的任務。

---

## PM → RD → QA 協作流程

1. `git pull` 更新 main
2. **PM** 讀 `docs/專案說明文件.md` 第九章，挑一個任務，輸出：問題描述、根因、驗收標準、預期修改檔案
3. 建立 feature branch：`fix/<slug>`（例如 `fix/avg-char-spacing`）
4. **RD** 依任務規格實作：
   - 一律在 feature branch 上工作，禁止直接 commit 到 main
   - 依版本慣例建立新版本檔案（如 T5→T6）再修改
   - 提供 diff 摘要與修復邏輯說明
5. **QA** 依 PM 的驗收標準審查：
   - 邏輯正確性（用樣本資料人工 trace，本專案無自動化測試環境）
   - 回歸檢查：是否影響 StressEngine 特徵計算、Firebase/Sheets 既有欄位
   - 產出 QA 報告（pass/fail + 具體意見）；fail 則帶意見退回步驟 4（上限重試 2 次）
6. QA pass 後：
   - **手動觸發（使用者在場）**：先向使用者摘要變更內容，取得明確同意後才 push 分支並開 PR
   - **排程觸發（無人值守）**：直接 push 分支、開 PR，PR 描述附上 QA 報告，並用 `PushNotification` 通知使用者「有 PR 待審」
7. 使用者於 GitHub review 並手動 **merge** PR —— 這是實際影響 main / 正式站的最終確認點，任何情況下都不可由自動化流程代為 merge

---

## 學術寫作規範

- 使用正式繁體中文；引用格式採 MIS Quarterly
- 須清楚區分 PSS-10（心理測量）vs. ISS/DeLone & McLean 2003（系統品質評估）
- 研究貢獻定位：完整線上手寫特徵擷取管線 ＋ 初步方向性證據，**非**已驗證的預測模型

---

## 參考資源

| 資源 | 用途 |
|------|------|
| `docs/專案說明文件.md` | 完整專案脈絡、已知問題清單、版本沿革 |
| EMOTHAW（Likforman-Sulem et al., 2017） | 手寫特徵基準對照 |
| PSS-10 | 壓力心理測量 |
| ISS / DeLone & McLean 2003 | 系統品質評估框架 |
| Fogg Behavior Model | 動機設計 |
