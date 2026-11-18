// 部署 UltimatumGame。
// 本機：npx hardhat run scripts/deploy.js
// Sepolia：先在環境變數設定 SEPOLIA_RPC_URL 與 SEPOLIA_PRIVATE_KEY（不要寫進檔案），再執行
//          npx hardhat run scripts/deploy.js --network sepolia
const { ethers, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`網路：${network.name}，部署者：${deployer.address}`);
  const game = await (await ethers.getContractFactory("UltimatumGame")).deploy();
  await game.waitForDeployment();
  console.log(`UltimatumGame 部署於：${game.target}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
