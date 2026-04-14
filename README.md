# calm-writing
寫字靜心 Calm Writing[README.md](https://github.com/user-attachments/files/26719301/README.md)

# 寫字靜心 Calm Writing

> 以 AI 筆跡特徵分析探索書寫與壓力調節之關係

**狀態：內部測試中**　｜　國立聯合大學資訊管理學系

---

## 專案簡介

「寫字靜心」是一個結合 AI 手寫分析與情緒調節研究的網頁應用，透過 iPad + Apple Pencil 的書寫互動，擷取筆壓、停頓節奏、傾斜角度等手寫特徵值，並配合 VAS 壓力量表，探索書寫行為與感知壓力之間的關聯。

本研究以苗栗客家文化為背景，書寫內容涵蓋客家諺語、自然意象與處世格言，兼顧文化保存與身心健康促進。

---

## 線上連結

| 用途 | 網址 |
|------|------|
| 穩定版（對外） | https://chihchenTseng.github.io/calm-writing/ |
| 研究測試版（受試者專用） | https://chihchenTseng.github.io/calm-writing/t/ |

---

## 功能說明

### 測試版（`/t/`）
- 書寫前填寫 VAS 壓力量尺（0–100）
- 固定書寫句子，確保數據可比性
- 自動擷取以下手寫特徵值並上傳至 Google Sheets：

| 特徵值 | 說明 |
|--------|------|
| `avg_pressure` | 平均筆壓 |
| `pressure_cv` | 筆壓變異係數 |
| `pause_count` | 停頓次數 |
| `avg_pause_duration_ms` | 平均停頓時長（毫秒） |
| `long_pause_count` | 長停頓次數（> 2 秒） |
| `vas_score` | 書寫前 VAS 壓力分數（0–100） |
| `vas_label` | VAS 對應文字描述 |
| `stroke_count` | 筆畫數 |
| `session_duration_sec` | 書寫總時長（秒） |

### 穩定版（`/`）
- 支援語料庫選句（客家諺語、苗栗地景、處世智慧等）
- 米字格 / 田字格 / 橫線格切換
- 客語 CJK Extension A/B 特殊字支援（花園明朝字型）
- 書寫後 AI 情緒回饋

---

## 目錄結構

```
calm-writing/
├── index.html          # 穩定版主程式
├── t/
│   └── index.html      # 研究測試版（T 系列）
├── archive/            # 歷史版本封存
│   ├── Calm Writing V1.html
│   ├── Calm Writing V1_2.html
│   ├── Calm Writing V2.html
│   └── Calm Writing V2_1.html
└── README.md
```

---

## 版本說明

| 版本 | 說明 |
|------|------|
| V1 | 初版，基礎書寫介面 |
| V1_2 | 新增語料庫與心情選擇 |
| V2 | 新增傾斜角度、基線穩定性特徵值擷取 |
| V2_1 | 客語特殊字與花園明朝字型整合 |
| T1 | 研究測試版，整合 VAS 量尺，固定書寫句子 |

---

## 技術架構

- **前端**：HTML / CSS / JavaScript（單檔案，無框架依賴）
- **書寫感測**：Pointer Events API（支援 Apple Pencil 壓力與傾斜感測）
- **畫布渲染**：Canvas API（含 devicePixelRatio 補償）
- **特殊字型**：花園明朝（HanaMinA / HanaMinB）via jsDelivr CDN
- **資料儲存**：Google Apps Script + Google Sheets（GET 請求，避免 CORS）
- **部署**：GitHub Pages

---

## 研究資訊

- **指導老師**：黃品叡 教授（國立聯合大學資訊管理學系）
- **研究目標**：探討手寫特徵值（筆壓、節奏、傾斜角）與感知壓力（VAS）之相關性，建立初步壓力判別模型
- **測量工具**：VAS 視覺類比量尺（書寫前）、PSS-10 感知壓力量表（長期追蹤）
- **研究倫理**：所有資料匿名收集，參與者 ID 隨機生成，不記錄個人識別資訊

---

## 開發團隊

**開發人員**

- 曾芷莀
- 林依臻
- 楊昀恩
- 杜婉瑜

**協助人員**

- 羅友芊
- 關筠曈
- 楊昕華

**聯絡信箱**：teamunexpected112@gmail.com

---

## 授權

本專案為學術研究用途，程式碼僅供研究參考，未經授權請勿商業使用。
