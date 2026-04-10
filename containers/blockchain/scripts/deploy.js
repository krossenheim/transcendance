import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.connect();
  const TournamentScores = await ethers.getContractFactory("TournamentScores");
  const ts = await TournamentScores.deploy();
  await ts.waitForDeployment();
  console.log("TournamentScores deployed to:", await ts.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
