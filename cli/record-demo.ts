#!/usr/bin/env npx tsx
/**
 * Automated Demo Recording
 * Runs the full demo flow and saves output to a file
 */

import { ethers, Wallet, JsonRpcProvider, formatUnits, formatEther } from "ethers";
import { GasStationClient } from "../src/client/GasStationClient.js";
import { writeFileSync } from "fs";
import path from "path";

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
  "function name() view returns (string)",
];

let output: string[] = [];

function log(msg: string = "") {
  console.log(msg);
  output.push(msg);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const provider = new JsonRpcProvider(CONFIG.rpcUrl);
  const relayerWallet = new Wallet(CONFIG.relayerKey, provider);
  const usdc = new ethers.Contract(CONFIG.usdcAddress, USDC_ABI, relayerWallet);

  log("╔══════════════════════════════════════════════════════════════════╗");
  log("║                                                                  ║");
  log("║          ⛽ AGENT GAS STATION - Demo Recording                   ║");
  log("║          Cronos Testnet | x402 Protocol | Meta-Transactions      ║");
  log("║                                                                  ║");
  log("╚══════════════════════════════════════════════════════════════════╝");
  log();

  // Step 1: Health Check
  log("═══════════════════════════════════════════════════════════════════");
  log("  STEP 1: Check Gas Station Health");
  log("═══════════════════════════════════════════════════════════════════");
  log();

  const health = await fetch(`${CONFIG.gasStationUrl}/health`).then((r) => r.json());
  log(`  ✓ Gas Station Status:  ${health.status === "healthy" ? "🟢 ONLINE" : "🟡 " + health.status}`);
  log(`  ✓ Relayer Address:     ${health.relayerAddress}`);
  log(`  ✓ CRO Balance:         ${health.relayerBalance.CRO} CRO`);
  log(`  ✓ USDC Balance:        ${health.relayerBalance.USDC} tUSDC`);
  log(`  ✓ Current CRO Price:   $${health.pricing.croUsdPrice}`);
  log();

  await sleep(500);

  // Step 2: Create Agent
  log("═══════════════════════════════════════════════════════════════════");
  log("  STEP 2: Create AI Agent Wallet");
  log("═══════════════════════════════════════════════════════════════════");
  log();

  const agentWallet = Wallet.createRandom().connect(provider);
  log(`  ✓ New Agent Created:   ${agentWallet.address}`);

  const agentCro = await provider.getBalance(agentWallet.address);
  const agentUsdc = await usdc.balanceOf(agentWallet.address);
  log(`  ✓ Agent CRO Balance:   ${formatEther(agentCro)} CRO`);
  log(`  ✓ Agent USDC Balance:  ${formatUnits(agentUsdc, 6)} tUSDC`);
  log();
  log("  ⚠️  Agent has NO native tokens - cannot pay gas fees directly!");
  log();

  await sleep(500);

  // Step 3: Fund Agent
  log("═══════════════════════════════════════════════════════════════════");
  log("  STEP 3: Fund Agent with USDC (simulating x402 earnings)");
  log("═══════════════════════════════════════════════════════════════════");
  log();

  const fundAmount = ethers.parseUnits("5", 6);
  log(`  → Transferring 5 tUSDC to agent...`);
  const fundTx = await usdc.transfer(agentWallet.address, fundAmount);
  await fundTx.wait();
  log(`  ✓ Funded! Tx: ${fundTx.hash.slice(0, 20)}...`);

  const newUsdc = await usdc.balanceOf(agentWallet.address);
  const stillNoCro = await provider.getBalance(agentWallet.address);
  log();
  log(`  ✓ Agent USDC Balance:  ${formatUnits(newUsdc, 6)} tUSDC`);
  log(`  ✓ Agent CRO Balance:   ${formatEther(stillNoCro)} CRO (still zero!)`);
  log();

  await sleep(500);

  // Step 4: Execute Transaction
  log("═══════════════════════════════════════════════════════════════════");
  log("  STEP 4: Execute Transaction via Gas Station");
  log("═══════════════════════════════════════════════════════════════════");
  log();

  const client = new GasStationClient({
    apiUrl: CONFIG.gasStationUrl,
    wallet: agentWallet,
    usdcAddress: CONFIG.usdcAddress,
    chainId: CONFIG.chainId,
  });

  // Get estimate
  const callData = usdc.interface.encodeFunctionData("balanceOf", [agentWallet.address]);
  const estimate = await client.estimate(CONFIG.usdcAddress, callData);

  log(`  Target Contract:       ${CONFIG.usdcAddress}`);
  log(`  Function:              balanceOf(agent)`);
  log(`  Gas Estimate:          ${estimate.gasEstimate}`);
  log(`  Price:                 ${estimate.priceUSDC} USDC`);
  log();
  log("  → Agent signs meta-transaction (no CRO needed!)");
  log("  → Agent signs USDC payment authorization (EIP-3009)");
  log("  → Submitting to Gas Station...");
  log();

  const result = await client.execute({
    to: CONFIG.usdcAddress,
    data: callData,
    gasLimit: 100000n,
  });

  log(`  ✅ SUCCESS!`);
  log();
  log(`  ✓ Forwarder Tx:        ${result.txHash}`);
  log(`  ✓ Payment Tx:          ${result.paymentTxHash}`);
  log(`  ✓ Inner Call:          ${result.success ? "SUCCESS" : "FAILED"}`);
  log();

  await sleep(500);

  // Step 5: Final State
  log("═══════════════════════════════════════════════════════════════════");
  log("  STEP 5: Final State");
  log("═══════════════════════════════════════════════════════════════════");
  log();

  const finalUsdc = await usdc.balanceOf(agentWallet.address);
  const finalCro = await provider.getBalance(agentWallet.address);

  log(`  Agent Address:         ${agentWallet.address}`);
  log(`  Final CRO Balance:     ${formatEther(finalCro)} CRO`);
  log(`  Final USDC Balance:    ${formatUnits(finalUsdc, 6)} tUSDC`);
  log(`  USDC Spent:            ${formatUnits(newUsdc - finalUsdc, 6)} tUSDC`);
  log();
  log("  ✨ Agent executed a transaction WITHOUT holding any CRO!");
  log("  ✨ Gas was paid by the Gas Station, agent paid with USDC.");
  log();

  log("═══════════════════════════════════════════════════════════════════");
  log("  DEMO COMPLETE");
  log("═══════════════════════════════════════════════════════════════════");
  log();
  log("  Contracts (Cronos Testnet):");
  log(`    • TestUSDC:          ${CONFIG.usdcAddress}`);
  log(`    • MinimalForwarder:  ${CONFIG.forwarderAddress}`);
  log();
  log("  Links:");
  log("    • Cronos Explorer:   https://explorer.cronos.org/testnet");
  log("    • x402 Protocol:     https://x402.org");
  log("    • Cronos Docs:       https://docs.cronos.org");
  log();

  // Save to Downloads
  const outputPath = path.join(process.env.HOME || "~", "Downloads", "CroGas-Demo.txt");
  writeFileSync(outputPath, output.join("\n"));
  console.log(`\n📁 Demo saved to: ${outputPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Demo failed:", err);
    process.exit(1);
  });
