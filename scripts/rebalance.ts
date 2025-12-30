/**
 * Script to rebalance USDC to CRO using VVS Finance
 *
 * Usage: npm run rebalance
 */

import { ethers, parseUnits, formatEther, formatUnits } from "ethers";
import { env } from "../src/config/env.js";
import { walletService } from "../src/services/wallet.service.js";
import { CRONOS_TESTNET, CRONOS_MAINNET, ERC20_ABI } from "../src/config/constants.js";

// VVS Router ABI (minimal for swaps)
const VVS_ROUTER_ABI = [
  "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
  "function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)",
];

async function main() {
  console.log("🔄 Rebalance Script - Swap USDC → CRO");
  console.log("=".repeat(50));

  const network = env.CHAIN_ID === 25 ? CRONOS_MAINNET : CRONOS_TESTNET;

  // Get current balances
  const balances = await walletService.getBalances();
  console.log(`\nCurrent Balances:`);
  console.log(`  CRO: ${balances.cro}`);
  console.log(`  USDC: ${balances.usdc}`);

  const usdcBalance = parseFloat(balances.usdc);
  if (usdcBalance < 1) {
    console.log("\n⚠️  USDC balance too low for rebalancing.");
    return;
  }

  // Swap 50% of USDC to CRO
  const swapAmount = parseUnits((usdcBalance / 2).toFixed(6), 6);
  console.log(`\nSwapping ${formatUnits(swapAmount, 6)} USDC for CRO...`);

  const provider = walletService.rpcProvider;
  const wallet = walletService.wallet;

  // Create contract instances
  const usdcContract = new ethers.Contract(env.USDC_ADDRESS, ERC20_ABI, wallet);
  const routerContract = new ethers.Contract(network.vvsRouter, VVS_ROUTER_ABI, wallet);

  // Check and approve USDC spending
  const allowance = await usdcContract.allowance(wallet.address, network.vvsRouter);
  if (allowance < swapAmount) {
    console.log("Approving USDC...");
    const approveTx = await usdcContract.approve(
      network.vvsRouter,
      ethers.MaxUint256
    );
    await approveTx.wait();
    console.log("✅ USDC approved");
  }

  // Get expected output
  const path = [env.USDC_ADDRESS, network.wcro];
  const amounts = await routerContract.getAmountsOut(swapAmount, path);
  const expectedCro = amounts[1];
  const minOutput = (expectedCro * 95n) / 100n; // 5% slippage

  console.log(`Expected output: ~${formatEther(expectedCro)} CRO`);
  console.log(`Minimum output: ${formatEther(minOutput)} CRO (5% slippage)`);

  // Execute swap
  const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes
  const swapTx = await routerContract.swapExactTokensForETH(
    swapAmount,
    minOutput,
    path,
    wallet.address,
    deadline
  );

  console.log(`Transaction sent: ${swapTx.hash}`);
  const receipt = await swapTx.wait();

  if (receipt?.status === 1) {
    console.log("\n✅ Swap successful!");

    // Get new balances
    const newBalances = await walletService.getBalances();
    console.log(`\nNew Balances:`);
    console.log(`  CRO: ${newBalances.cro}`);
    console.log(`  USDC: ${newBalances.usdc}`);
  } else {
    console.log("\n❌ Swap failed!");
  }
}

main().catch(console.error);
