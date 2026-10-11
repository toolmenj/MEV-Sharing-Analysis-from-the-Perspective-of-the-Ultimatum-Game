# 最後通牒賽局視角下的 MEV 分潤分析

## 組員: 
## 1. R15631009鄧杰修
## 2. B15902045曾士育
## 3. T15701209林玎揚

## 4. B15902113周家釩

# slide和report連結
[slide link](#)
[report](#)

# 授權
只要是我們獨立推導的公式或概念，或是我們寫的code，都可以供後人自由使用。

# Proposal

## 研究動機:
最後通牒賽局（Ultimatum Game）是賽局理論中最經典的談判模型：提議者（Proposer）提出一筆金額的分配方式，回應者（Responder）只能選擇「接受」或「拒絕」，若拒絕則雙方皆一無所獲。理論上的子賽局完美均衡（SPE）預測提議者只會給出極小的金額，而回應者仍會接受；但大量實驗顯示，人們實際提出的分配多落在 40%～50%，且低於 20% 的提議經常被拒絕。

我們注意到，區塊鏈上的 MEV（Maximal Extractable Value）分潤過程，在結構上與最後通牒賽局高度相似：

| 環節 | 提議者 | 回應者 | 「拒絕」的意義 |
|---|---|---|---|
| Searcher → Builder | Searcher 決定把多少 MEV 透過 priority fee / coinbase transfer 分給 Builder | Builder | 不把該 bundle 打包進區塊 |
| Builder → Proposer（PBS / MEV-Boost） | Builder 決定把多少區塊價值以 bid 付給 Proposer | Proposer（驗證者） | 改用其他 Builder 的區塊，或自行本地建塊 |

與教科書版本不同的是，鏈上的分潤具有**多個競爭的提議者**、**回應者具有外部選項（outside option）**、以及**重複且公開可觀察**等特性。這些特性如何改變均衡下的分配比例，目前相關的數學分析仍不多見。加上 MEV-Boost relay 的出價資料是公開的，讓我們有機會用真實的鏈上資料來檢驗理論預測，因此我們想以此為題，結合賽局理論與區塊鏈實證進行研究。

### 研究目標:
- 以最後通牒賽局為基礎，建立 Searcher–Builder–Proposer 兩層分潤的數學模型
- 在模型中依序加入「多提議者競爭」、「回應者外部選項」與「公平偏好」，推導各情境下的均衡分配
- 以 MEV-Boost relay 的公開資料，檢驗實際的分潤比例是否符合模型預測
- 撰寫一個以 commit-reveal 實作的最後通牒賽局智能合約，在可控環境下進行小規模實驗，作為實證資料的對照

### 模型初步構想:

**1. 基本模型**

設可分配的總價值為 $V$，提議者給回應者 $s \in [0, V]$。回應者接受時，報酬為 $(V-s,\ s)$；拒絕時為 $(0,\ 0)$。SPE 為 $s^* \to 0$。

**2. 加入外部選項**

在 PBS 中，Proposer 拒絕某個 Builder 的 bid 後，仍可本地建塊並取得價值 $L$。因此回應者接受的條件變為 $s \ge L$，均衡下 $s^* = L$。

**3. 加入多提議者競爭**

若有 $n$ 個 Builder 同時對同一個 slot 出價，各自能從區塊萃取的價值為 $V_1 \ge V_2 \ge \dots \ge V_n$，情境會從最後通牒賽局轉為類似第一價格拍賣的結構，均衡出價趨近 $\max(V_2, L)$。我們想刻畫：當 Builder 市場集中度提高（$n$ 變小、$V_1 - V_2$ 變大）時，分潤比例如何從「競爭」退回到「最後通牒」的極端。

**4. 加入公平偏好（Fehr–Schmidt）**

回應者的效用為
$$
U_R(s) = s - \alpha \cdot \max(V - 2s,\ 0)
$$
此時回應者接受的門檻為
$$
s \ge \frac{\alpha}{1 + 2\alpha} V
$$
我們想探討：在匿名且由程式自動化執行的鏈上環境中，「公平偏好」是否仍然存在，抑或回應者行為會更接近 SPE 的預測。

### 實證與實驗設計:
- **鏈上資料**：從 MEV-Boost relay 的 Data API（`proposer_payload_delivered`、`builder_blocks_received`）收集歷史出價，計算每個 slot 中 Proposer 所得占區塊總價值的比例，並與 Builder 集中度做迴歸分析
- **智能合約實驗**：
  - 雙方先送出承諾 $H(\text{offer} \| \text{salt})$ 與 $H(\text{threshold} \| \text{salt})$，再揭露，由合約自動結算，避免任一方看到對方的選擇後再行動
  - 回應者採用 strategy method（事先承諾最低可接受門檻），可以一次收集完整的策略資料
  - 設置揭露期限與押金，處理拒不揭露的情況
  - 先在測試網上部署並進行實驗

### 目前進度:
- 已閱讀最後通牒賽局與公平偏好模型的相關文獻，並整理 MEV 與 PBS 的運作機制
- 已確認 Searcher→Builder 與 Builder→Proposer 兩個環節可以對應到最後通牒賽局，並完成初步的問題定義
- 已確認 MEV-Boost relay 的公開資料可以作為實證資料來源

### 未來展望:
- 與教授討論模型設定是否合理，特別是外部選項與多提議者競爭的建模方式
- 完成各情境下的均衡推導，並分析其數學性質
- 收集並分析 relay 資料，檢驗模型預測
- 完成 commit-reveal 合約並進行小規模實驗
- 根據研究結果，討論 PBS 機制設計上可能的改進方向（例如對 Builder 集中化的影響）

# 參考資料
- Güth, W., Schmittberger, R., & Schwarze, B. (1982). *An experimental analysis of ultimatum bargaining.* Journal of Economic Behavior & Organization.
- Fehr, E., & Schmidt, K. M. (1999). *A theory of fairness, competition, and cooperation.* The Quarterly Journal of Economics.
- Daian, P., et al. (2020). *Flash Boys 2.0: Frontrunning in Decentralized Exchanges, Miner Extractable Value, and Consensus Instability.* IEEE S&P.
- Flashbots. *MEV-Boost* documentation & Relay Data API.
- Ethereum Foundation. *Proposer-Builder Separation (PBS).*
