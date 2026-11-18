# UltimatumGame：commit-reveal 最後通牒賽局合約

第四組專題「最後通牒賽局視角下的 MEV 分潤分析」的合約部分。

## 流程

1. **開局** `createGame(proposer, responder, deposit, commitPeriod, revealPeriod)`：實驗者付出獎金池 `pot`（`msg.value`），指定兩位玩家。
2. **承諾** `commit(gameId, commitment)`：雙方各付押金 `deposit`。提議者承諾 `offer`（給回應者多少），回應者承諾 `threshold`（最低可接受金額）。兩邊都承諾後才進入揭露期。
3. **揭露** `reveal(gameId, value, salt)`：第二個人揭露時自動結算。
   - `offer >= threshold`：接受，提議者得 `pot - offer`，回應者得 `offer`，押金各自退回。
   - `offer < threshold`：拒絕，雙方只拿回押金，`pot` 退回實驗者。
4. **逾期**
   - `cancel(gameId)`：承諾期過了還沒湊齊兩個承諾 → 退回 `pot` 與已付押金。
   - `claimTimeout(gameId)`：揭露期過了有人沒揭露 → 沒揭露者的押金給有揭露的一方；兩邊都沒揭露則押金歸實驗者。
5. **提領** `withdraw()`：所有款項先記在 `balances`，由當事人自己領。

承諾值用 `commitmentOf(gameId, player, value, salt)` 計算：
`keccak256(abi.encode(合約位址, chainid, gameId, 玩家位址, value, salt))`。
`salt` 請用 32 bytes 亂數，否則 `value` 的範圍很小，別人可以暴力猜出來。

## 指令

```bash
npm install
npx hardhat test                      # 27 個單元測試
REPORT_GAS=1 npx hardhat test         # 附 gas 用量
npx hardhat run scripts/simulate.js   # 模擬玩家在本機鏈跑 600 局，結果寫到 ../data/contract_sim/
npx hardhat run scripts/deploy.js     # 本機部署
```

部署到 Sepolia（尚未執行）：自己在環境變數設定 `SEPOLIA_RPC_URL` 與 `SEPOLIA_PRIVATE_KEY`（不要寫進檔案或進 git），再執行
`npx hardhat run scripts/deploy.js --network sepolia`。

## 檔案

- `contracts/UltimatumGame.sol`：合約本體
- `contracts/test/ReentrantPlayer.sol`：測試重入攻擊用的假玩家
- `test/UltimatumGame.test.js`：單元測試
- `scripts/simulate.js`：模擬玩家跑完整流程
- `scripts/deploy.js`：部署
