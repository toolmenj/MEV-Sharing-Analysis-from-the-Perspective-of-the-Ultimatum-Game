# 專案工作清單：最後通牒賽局 × MEV 分潤

> 期限：一個月（2026/10/07 ～ 2026/11/03）
> 主軸：**數學模型 ＋ 鏈上資料實證**，最小版智能合約為輔

## 範圍

**要做**
- 模型四個情境：基本模型、外部選項、多 Builder 競爭、公平偏好
- MEV-Boost relay 鏈上資料分析，並與模型預測比對
- 最小版 commit-reveal 最後通牒合約（含測試、部署測試網）
- Report、Slide、口頭報告

**不做（寫進未來展望）**
- 招募受試者的合約實驗、前端介面
- Searcher→Builder→Proposer 兩層串接模型
- 重複賽局 / 聲譽效果
- 本地建塊價值 $L$ 的精確估計（改用假設值＋敏感度分析）

## 分工

| 角色 | 成員 | 負責內容 |
|---|---|---|
| A 模型（主） | （姓名） | 基本模型、外部選項、多 Builder 競爭推導 |
| B 模型（延伸）＋統整 | （姓名） | 公平偏好模型、模型性質整理、Report 主筆 |
| C 資料 | （姓名） | relay 資料爬取、清理、指標計算、迴歸、畫圖 |
| D 合約 | （姓名） | commit-reveal 合約、測試、部署，兼 Slide |

## 時程與待辦

### Week 1（10/07 ～ 10/13）：準備與起手

**全員**
- [ ] 讀懂 MEV / PBS / MEV-Boost 流程（Searcher、Builder、Relay、Proposer）
- [ ] 建立共用 GitHub repo 與 HackMD 共筆

**A**
- [ ] 讀 Güth (1982) 最後通牒賽局
- [ ] 寫出基本模型設定（玩家、行動、報酬）與 SPE
- [ ] 推導加入外部選項 $L$ 後的均衡

**B**
- [ ] 讀 Fehr & Schmidt (1999)
- [ ] 建立 Report 架構（章節大綱）

**C**
- [ ] 熟悉 relay Data API：`/relay/v1/data/bidtraces/proposer_payload_delivered`、`/relay/v1/data/bidtraces/builder_blocks_received`
- [ ] 決定資料範圍（哪個 relay、哪段時間）
- [ ] 寫好爬蟲（Python `requests`），抓到第一批資料

**D**
- [ ] 學 Solidity 基礎與 Foundry
- [ ] 設計合約流程：commit → reveal → settle，畫流程圖

### Week 2（10/14 ～ 10/20）：核心推導與資料處理

**全員**
- [ ] 🚩 **找教授確認模型設定**（建議本週前半）

**A**
- [ ] 推導多 Builder 競爭情境的均衡，嚴格證明 $\max(V_2, L)$
- [ ] 依教授意見修正模型

**B**
- [ ] 推導公平偏好下的接受門檻 $\frac{\alpha}{1+2\alpha}V$ 與提議者最適出價

**C**
- [ ] 資料清理：同 slot 多筆出價去重、缺值處理、wei → ETH 換算
- [ ] 計算 Proposer 分潤比例、Builder 集中度（HHI / 前幾大市占）

**D**
- [ ] 實作合約：commit、reveal、settle
- [ ] 實作押金與揭露期限、未揭露的懲罰
- [ ] 撰寫單元測試

### Week 3（10/21 ～ 10/27）：驗證與整合

**A**
- [ ] 整理「可被資料檢驗的預測」（如：集中度上升 → Proposer 分潤比例下降）
- [ ] 交給 C 進行比對

**B**
- [ ] 整理各情境均衡的數學性質與比較
- [ ] 開始撰寫 Report 的模型章節

**C**
- [ ] 迴歸 / 統計檢定，比對模型預測
- [ ] 畫圖：分潤比例分布、與集中度的關係、時間趨勢
- [ ] 對 $L$ 做敏感度分析

**D**
- [ ] 部署合約到測試網（Sepolia）
- [ ] 用模擬資料跑完整流程一次
- [ ] 撰寫合約說明文件（README）
- [ ] 開始做 Slide 架構

### Week 4（10/28 ～ 11/03）：產出與報告

**全員**
- [ ] 完成 Report（模型、實證、合約、結論、未來展望）
- [ ] 完成 Slide
- [ ] 整理 GitHub repo（爬蟲、分析 notebook、合約、README）
- [ ] 更新 Proposal HackMD（進度、連結）
- [ ] 報告彩排至少一次

## 檢查點

| 日期 | 檢查點 | 未達成時的備案 |
|---|---|---|
| 10/13 | 基本模型完成、爬蟲抓到資料 | 改用 relayscan / mevboost.pics 現成統計 |
| 10/20 | 教授確認模型方向 | 縮減到基本＋外部選項兩個情境 |
| 10/27 | 實證結果出爐、合約部署完成 | 合約只保留本地測試版本 |
| 11/03 | Report、Slide 完成 | — |

## 參考資源
- Güth, W., Schmittberger, R., & Schwarze, B. (1982). *An experimental analysis of ultimatum bargaining.*
- Fehr, E., & Schmidt, K. M. (1999). *A theory of fairness, competition, and cooperation.*
- Daian, P., et al. (2020). *Flash Boys 2.0.*
- Flashbots MEV-Boost 文件與 Relay Data API
- Foundry Book：https://book.getfoundry.sh
