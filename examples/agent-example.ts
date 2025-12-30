/**
 * Example: How a developer uses Agent Gas Station
 *
 * This is what a real AI agent integration looks like.
 * Copy this into your agent project!
 */

import { ethers, Wallet, JsonRpcProvider } from "ethers";
import { GasStationClient } from "agent-gas-station"; // npm install agent-gas-station

// Your agent's wallet (only needs USDC, no CRO required!)
const AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY!;

// Gas Station config
const GAS_STATION_URL = "https://gas.crogas.io"; // or localhost:3000

async function main() {
  // Setup
  const provider = new JsonRpcProvider("https://evm.cronos.org");
  const agentWallet = new Wallet(AGENT_PRIVATE_KEY, provider);

  // Create client
  const gasStation = new GasStationClient({
    apiUrl: GAS_STATION_URL,
    wallet: agentWallet,
    usdcAddress: "0xc21223249CA28397B4B6541dfFaEcC539BfF0c59", // Cronos USDC
    chainId: 25, // Cronos mainnet
  });

  // Example 1: Simple contract call
  const result = await gasStation.execute({
    to: "0x...", // any contract
    data: "0x...", // your calldata
    gasLimit: 100000n,
  });
  console.log("Tx:", result.txHash);

  // Example 2: Swap tokens on VVS Finance
  const vvsRouter = "0x145863Eb42Cf62847A6Ca784e6416C1682b1b2Ae";
  const swapData = "0x..."; // encoded swap call

  const swapResult = await gasStation.execute({
    to: vvsRouter,
    data: swapData,
    gasLimit: 300000n,
  });
  console.log("Swap Tx:", swapResult.txHash);
}

main();
