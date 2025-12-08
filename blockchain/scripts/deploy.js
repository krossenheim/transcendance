const hre = require("hardhat");

async function main() {
  const TournamentScores = await hre.ethers.getContractFactory("TournamentScores");
  const ts = await TournamentScores.deploy();
  await ts.waitForDeployment();
  console.log("TournamentScores deployed to:", await ts.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
