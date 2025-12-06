const hre = require("hardhat");
const { ethers } = hre;

async function main() {
  // Use Hardhat's first default account (Account #0) - deterministic across restarts
  // This is the standard Hardhat test account with known private key
  const HARDHAT_ACCOUNT_0_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  
  const provider = ethers.provider;
  const wallet = new ethers.Wallet(HARDHAT_ACCOUNT_0_PRIVATE_KEY, provider);

  console.log("Using Hardhat default deployer wallet:");
  console.log("Address:", wallet.address);
  console.log("PrivateKey:", HARDHAT_ACCOUNT_0_PRIVATE_KEY);

  // Deploy the contract using this signer
  const TournamentScores = await ethers.getContractFactory("TournamentScores", wallet);
  const ts = await TournamentScores.deploy();
  await ts.waitForDeployment();

  const contractAddress = await ts.getAddress();
  console.log("TournamentScores deployed to:", contractAddress);
  
  // Output in a format easy to parse
  console.log("=== DEPLOYMENT INFO ===");
  console.log("DEPLOYER_PRIVATE_KEY=" + HARDHAT_ACCOUNT_0_PRIVATE_KEY);
  console.log("CONTRACT_ADDRESS=" + contractAddress);
  console.log("=======================");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
