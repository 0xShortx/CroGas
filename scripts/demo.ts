#!/usr/bin/env tsx
/**
 * Quick Demo: Test CroGas is working
 *
 * Run: npm run demo
 *
 * This creates a fresh wallet, gets USDC from faucet,
 * and executes a gasless transaction via CroGas.
 */

import { ethers, Wallet, JsonRpcProvider, formatUnits } from "ethers";
import { GasStationClient } from "../src/client/GasStationClient.js";

const CONFIG = {
  rpcUrl: "https://evm-t3.cronos.org/",
  chainId: 338,
  gasStationUrl: "http://localhost:3000",
  usdcAddress: "0x38Bf87D7281A2F84c8ed5aF1410295f7BD4E20a1",
};

const USDC_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

async function demo() {
  console.log("\n🔥 CroGas Quick Demo\n");
  console.log("Testing gasless transactions on Cronos Testnet...\n");

  const provider = new JsonRpcProvider(CONFIG.rpcUrl);

  // Step 1: Create fresh agent wallet
  const agent = Wallet.createRandom().connect(provider);
  console.log("📱 Agent Wallet:", agent.address);

  // Step 2: Get USDC from faucet
  console.log("\n💰 Getting USDC from faucet...");
  const faucetRes = await fetch(`${CONFIG.gasStationUrl}/faucet/${agent.address}`);
  const faucetData = await faucetRes.json();

  if (!faucetData.success) {
    console.error("❌ Faucet failed:", faucetData.error);
    return;
  }
  console.log("   ✓ Got 100 USDC! Tx:", faucetData.txHash?.slice(0, 20) + "...");

  // Wait for confirmation
  console.log("   Waiting for confirmation...");
  await new Promise(r => setTimeout(r, 5000));

  // Step 3: Check balances
  const usdc = new ethers.Contract(CONFIG.usdcAddress, USDC_ABI, provider);
  const croBalance = await provider.getBalance(agent.address);
  const usdcBalance = await usdc.balanceOf(agent.address);

  console.log("\n📊 Agent Balances:");
  console.log(`   CRO:  ${ethers.formatEther(croBalance)} (ZERO!)`);
  console.log(`   USDC: ${formatUnits(usdcBalance, 6)}`);

  // Step 4: Execute gasless transaction
  console.log("\n🚀 Sending 1 USDC via CroGas (0 CRO needed!)...");

  const client = new GasStationClient({
    apiUrl: CONFIG.gasStationUrl,
    wallet: agent,
    usdcAddress: CONFIG.usdcAddress,
    chainId: CONFIG.chainId,
  });

  // Send 1 USDC back to gas station (keeps demo USDC circulating)
  const recipient = "0xF40B9a42cD26166051455c23508C2EbA997da7e2";
  const transferData = usdc.interface.encodeFunctionData("transfer", [
    recipient,
    ethers.parseUnits("1", 6),
  ]);

  try {
    const result = await client.execute({
      to: CONFIG.usdcAddress,
      data: transferData,
      gasLimit: 150000n,
    });

    console.log("\n✅ SUCCESS!");
    console.log("=" .repeat(50));
    console.log("   Transaction:", result.txHash);
    console.log("   Payment Tx: ", result.paymentTxHash);
    console.log("   Explorer:    https://explorer.cronos.org/testnet/tx/" + result.txHash);

    // Final balances
    await new Promise(r => setTimeout(r, 3000));
    const finalCro = await provider.getBalance(agent.address);
    const finalUsdc = await usdc.balanceOf(agent.address);

    console.log("\n📊 Final Balances:");
    console.log(`   CRO:  ${ethers.formatEther(finalCro)} (STILL ZERO!)`);
    console.log(`   USDC: ${formatUnits(finalUsdc, 6)} (paid ~0.01 gas + 1 transfer)`);
    console.log("\n🎉 Demo complete! Agent transacted without CRO!\n");

  } catch (error: any) {
    console.error("\n❌ Failed:", error.message);
  }
}

demo().catch(console.error);
