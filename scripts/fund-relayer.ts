/**
 * Script to fund the relayer wallet with CRO from the testnet faucet
 * or transfer CRO from another wallet.
 *
 * Usage: npm run fund-relayer
 */

import { ethers, parseEther } from "ethers";
import { env } from "../src/config/env.js";
import { walletService } from "../src/services/wallet.service.js";

async function main() {
  console.log("🔧 Fund Relayer Script");
  console.log("=".repeat(50));

  const address = walletService.address;
  console.log(`\nRelayer Address: ${address}`);

  // Get current balance
  const balances = await walletService.getBalances();
  console.log(`Current CRO Balance: ${balances.cro}`);
  console.log(`Current USDC Balance: ${balances.usdc}`);

  if (env.CHAIN_ID === 338) {
    // Testnet
    console.log("\n📱 Cronos Testnet Faucet:");
    console.log("Visit: https://cronos.org/faucet");
    console.log(`Paste your address: ${address}`);
    console.log("\nWaiting for funds...");
  } else {
    // Mainnet
    console.log("\n⚠️  Mainnet detected. Please transfer CRO manually.");
    console.log(`Send CRO to: ${address}`);
  }

  // Poll for balance change
  const initialBalance = balances.croWei;
  let attempts = 0;
  const maxAttempts = 60;

  while (attempts < maxAttempts) {
    await new Promise((r) => setTimeout(r, 5000)); // Wait 5 seconds
    attempts++;

    const newBalances = await walletService.getBalances();
    if (newBalances.croWei > initialBalance) {
      console.log(`\n✅ Funds received! New balance: ${newBalances.cro} CRO`);
      break;
    }

    process.stdout.write(".");
  }

  if (attempts >= maxAttempts) {
    console.log("\n⏰ Timeout waiting for funds. Check manually.");
  }
}

main().catch(console.error);
