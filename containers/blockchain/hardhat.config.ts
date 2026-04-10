import { defineConfig, configVariable } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers],
  solidity: "0.8.19",
  networks: {
    hardhat: {
      type: "edr-simulated",
    },
    fuji: {
      type: "http",
      url: configVariable("AVALANCHE_FUJI_RPC"),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
  },
});
