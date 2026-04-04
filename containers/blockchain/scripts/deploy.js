const hre = require("hardhat");

async function main() {
  const TournamentScores = await hre.ethers.getContractFactory("TournamentScores");
  const ts = await TournamentScores.deploy();
  await ts.deployed();
  console.log("TournamentScores deployed to:", ts.target ? ts.target : ts.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
