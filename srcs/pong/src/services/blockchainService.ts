import { Wallet, JsonRpcProvider, Contract } from "ethers";

const DEFAULT_ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export default class BlockchainService {
  provider: any;
  wallet: any | null;
  contract: any | null;

  constructor() {
    const rpc = process.env.AVALANCHE_RPC || process.env.AVALANCHE_FUJI_RPC || "http://127.0.0.1:8545";
    const pk = process.env.DEPLOYER_PRIVATE_KEY || "";
    const address = process.env.CONTRACT_ADDRESS || "";

    this.provider = new JsonRpcProvider(rpc);
    this.wallet = pk ? new Wallet(pk, this.provider) : null;

    // minimal ABI for interactions we need
    const abi = [
      "function recordScore(uint256 tournamentId, address player, uint256 score) external",
      "function getScoreCount(uint256 tournamentId) view returns (uint256)",
      "event ScoreRecorded(uint256 indexed tournamentId, address indexed player, uint256 score, uint256 timestamp)"
    ];

    this.contract = address && this.wallet ? new Contract(address, abi, this.wallet) : null;
  }

  isConfigured(): boolean {
    return !!this.contract;
  }

  async recordScore(tournamentId: number, playerAddress: string | undefined, score: number): Promise<string> {
    if (!this.contract) throw new Error("Blockchain contract not configured. Set CONTRACT_ADDRESS and DEPLOYER_PRIVATE_KEY.");
    const player = playerAddress && playerAddress.length > 0 ? playerAddress : DEFAULT_ZERO_ADDRESS;
    const tx = await this.contract.recordScore(tournamentId, player, BigInt(score));
    const receipt = await tx.wait(1);
    return receipt.hash;
  }

  async getScoreCount(tournamentId: number): Promise<number> {
    if (!this.contract) throw new Error("Blockchain contract not configured.");
    const c = await this.contract.getScoreCount(tournamentId);
    return Number(c.toString());
  }
}

// singleton instance (convenience for services that want a shared client)
export const blockchainServiceInstance = new BlockchainService();

