/**
 * End-to-end test for Agent Gas Station (Meta-Transaction version)
 *
 * This script:
 * 1. Creates a test agent wallet (with NO CRO)
 * 2. Funds it with test USDC
 * 3. Executes a meta-transaction through the Gas Station
 * 4. Agent pays with USDC, Gas Station pays CRO gas
 */

import { ethers, Wallet, JsonRpcProvider, formatUnits } from "ethers";
import { GasStationClient } from "../src/client/GasStationClient.js";

const CONFIG = {
  rpcUrl: "https://evm-t3.cronos.org/",
  chainId: 338,
  gasStationUrl: "http://localhost:3000",
  usdcAddress: "0x38Bf87D7281A2F84c8ed5aF1410295f7BD4E20a1",
  forwarderAddress: "0x523D5F604788a9cFC74CcF81F0DE5B3b5623635F",
  relayerKey: "0xd6e09f02d1698fae4cc2f4a561ee62b06d15d895bb418da8c6a126118020b64e",
};

const USDC_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

async function main() {
  console.log("🧪 Agent Gas Station E2E Test (Meta-Transactions)\n");
  console.log("=".repeat(50));

  const provider = new JsonRpcProvider(CONFIG.rpcUrl);

  // Create test agent wallet (NO CRO!)
  const agentWallet = Wallet.createRandom().connect(provider);
  console.log("\n📱 Test Agent Wallet:", agentWallet.address);

  // Get relayer wallet (has USDC to distribute)
  const relayerWallet = new Wallet(CONFIG.relayerKey, provider);
  console.log("💰 Relayer Wallet:", relayerWallet.address);

  // USDC contract
  const usdc = new ethers.Contract(CONFIG.usdcAddress, USDC_ABI, relayerWallet);

  // Step 1: Fund agent with test USDC
  console.log("\n📤 Funding agent with 10 tUSDC...");
  const fundAmount = ethers.parseUnits("10", 6);
  const fundTx = await usdc.transfer(agentWallet.address, fundAmount);
  await fundTx.wait();
  console.log("   Tx:", fundTx.hash);

  // Check balances
  const agentUsdcBalance = await usdc.balanceOf(agentWallet.address);
  const agentCroBalance = await provider.getBalance(agentWallet.address);
  console.log("\n📊 Agent Balances:");
  console.log(`   CRO: ${ethers.formatEther(agentCroBalance)} (should be 0!)`);
  console.log(`   USDC: ${formatUnits(agentUsdcBalance, 6)} tUSDC`);

  if (agentCroBalance > 0n) {
    console.log("⚠️  Warning: Agent has CRO. Test should use agent with 0 CRO.");
  }

  // Step 2: Create Gas Station client
  const client = new GasStationClient({
    apiUrl: CONFIG.gasStationUrl,
    wallet: agentWallet,
    usdcAddress: CONFIG.usdcAddress,
    chainId: CONFIG.chainId,
  });

  // Step 3: Get estimate
  console.log("\n💵 Getting estimate...");
  const estimate = await client.estimate(CONFIG.usdcAddress, "0x");
  console.log("   Gas estimate:", estimate.gasEstimate);
  console.log("   Price:", estimate.priceUSDC, "USDC");

  // Step 4: Execute meta-transaction
  console.log("\n🚀 Executing meta-transaction via Gas Station...");
  console.log("   Target: USDC contract (reading balance)");
  console.log("   Agent has NO CRO - Gas Station pays gas!");

  try {
    // Call balanceOf on USDC contract via meta-transaction
    const balanceOfData = usdc.interface.encodeFunctionData("balanceOf", [
      agentWallet.address,
    ]);

    const result = await client.execute({
      to: CONFIG.usdcAddress,
      data: balanceOfData,
      gasLimit: 100000n,
    });

    console.log("\n✅ SUCCESS!");
    console.log("=".repeat(50));
    console.log("   Forwarder Tx Hash:", result.txHash);
    console.log("   Payment Tx Hash:", result.paymentTxHash);
    console.log("   Inner Call Success:", result.success);
  } catch (error) {
    console.error("\n❌ FAILED:", error);
  }

  // Final balances
  const finalUsdcBalance = await usdc.balanceOf(agentWallet.address);
  const finalCroBalance = await provider.getBalance(agentWallet.address);
  console.log("\n📊 Final Agent Balances:");
  console.log(`   CRO: ${ethers.formatEther(finalCroBalance)} (still 0!)`);
  console.log(`   USDC: ${formatUnits(finalUsdcBalance, 6)} tUSDC`);
  console.log(`   USDC spent: ${formatUnits(agentUsdcBalance - finalUsdcBalance, 6)} tUSDC`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
