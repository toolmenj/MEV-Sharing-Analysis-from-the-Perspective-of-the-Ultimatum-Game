require("@nomicfoundation/hardhat-toolbox");

// 部署到 Sepolia 時才需要；金鑰請自己放在環境變數，不要寫進檔案。
const { SEPOLIA_RPC_URL, SEPOLIA_PRIVATE_KEY } = process.env;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    // Game 結構有 15 個欄位，自動產生的 getter 需要 viaIR 才編得過
    settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true },
  },
  networks: {
    hardhat: { accounts: { count: 40 } },
    ...(SEPOLIA_RPC_URL && SEPOLIA_PRIVATE_KEY
      ? { sepolia: { url: SEPOLIA_RPC_URL, accounts: [SEPOLIA_PRIVATE_KEY] } }
      : {}),
  },
  gasReporter: { enabled: process.env.REPORT_GAS === "1" },
};
