/**
 * Example: AI Agent Integration with CroGas
 *
 * This shows how an AI agent (using Claude Agent SDK or similar)
 * can execute blockchain transactions WITHOUT holding native CRO tokens.
 *
 * The agent pays gas fees with USDC via x402 protocol.
 */

import { Wallet, JsonRpcProvider, ethers } from "ethers";
import { GasStationClient } from "../src/client/GasStationClient.js";

// Configuration
const CROGAS_URL = "http://localhost:3000";  // Or production URL
const CHAIN_ID = 338;  // Cronos Testnet
const USDC_ADDRESS = "0x38Bf87D7281A2F84c8ed5aF1410295f7BD4E20a1";

/**
 * Example 1: Simple contract call
 * Agent reads data from a contract without needing CRO
 */
async function exampleContractCall(agentWallet: Wallet) {
  const client = new GasStationClient({
    apiUrl: CROGAS_URL,
    wallet: agentWallet,
    usdcAddress: USDC_ADDRESS,
    chainId: CHAIN_ID,
  });

  // Encode contract call (e.g., ERC20 balanceOf)
  const erc20Interface = new ethers.Interface([
    "function balanceOf(address) view returns (uint256)"
  ]);
  const callData = erc20Interface.encodeFunctionData("balanceOf", [
    agentWallet.address
  ]);

  // Execute via CroGas - pays gas with USDC automatically
  const result = await client.execute({
    to: USDC_ADDRESS,
    data: callData,
    gasLimit: 100000n,
  });

  console.log("Transaction hash:", result.txHash);
  console.log("Success:", result.success);
}

/**
 * Example 2: USDC Transfer
 * Agent sends USDC to another address, pays gas in USDC
 */
async function exampleUsdcTransfer(agentWallet: Wallet, recipient: string) {
  const client = new GasStationClient({
    apiUrl: CROGAS_URL,
    wallet: agentWallet,
    usdcAddress: USDC_ADDRESS,
    chainId: CHAIN_ID,
  });

  // Encode transfer call
  const erc20Interface = new ethers.Interface([
    "function transfer(address to, uint256 amount) returns (bool)"
  ]);
  const transferData = erc20Interface.encodeFunctionData("transfer", [
    recipient,
    ethers.parseUnits("1", 6)  // 1 USDC
  ]);

  // Get price estimate first
  const estimate = await client.estimate(USDC_ADDRESS, transferData);
  console.log("Estimated gas cost:", estimate.priceUSDC, "USDC");

  // Execute transfer - agent needs 0 CRO!
  const result = await client.execute({
    to: USDC_ADDRESS,
    data: transferData,
    gasLimit: 150000n,
  });

  return result;
}

/**
 * Example 3: Integration with AI Agent SDK
 * Shows how Claude Code or similar agents would use CroGas
 */
async function aiAgentExample() {
  // In a real AI agent, the wallet would be managed by the agent
  // Here we create a random one for demonstration
  const provider = new JsonRpcProvider("https://evm-t3.cronos.org/");
  const agentWallet = Wallet.createRandom().connect(provider);

  console.log("AI Agent wallet:", agentWallet.address);
  console.log("Agent CRO balance: 0 (intentionally!)");

  // Create CroGas client
  const crogas = new GasStationClient({
    apiUrl: CROGAS_URL,
    wallet: agentWallet,
    usdcAddress: USDC_ADDRESS,
    chainId: CHAIN_ID,
  });

  // AI agent can now execute any transaction by:
  // 1. Building the transaction data
  // 2. Calling crogas.execute()
  // 3. Gas is automatically paid in USDC via x402

  // Example: Agent wants to interact with a DeFi protocol
  const defiContractAddress = "0x...";  // Your DeFi contract
  const defiInterface = new ethers.Interface([
    "function stake(uint256 amount) returns (bool)"
  ]);

  // This would work even though agent has 0 CRO!
  // const result = await crogas.execute({
  //   to: defiContractAddress,
  //   data: defiInterface.encodeFunctionData("stake", [amount]),
  //   gasLimit: 200000n,
  // });

  console.log("Agent ready to transact without CRO!");
}

// Run examples
async function main() {
  console.log("=".repeat(60));
  console.log("CroGas AI Agent Integration Examples");
  console.log("=".repeat(60));

  await aiAgentExample();
}

main().catch(console.error);
