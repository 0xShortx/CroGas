#!/usr/bin/env npx tsx
/**
 * Try It Yourself - Interactive demo for hackathon judges
 *
 * This script lets anyone try the Gas Station without any setup.
 * It creates a fresh wallet, gets TestUSDC, and executes a gasless transaction.
 */

import * as p from "@clack/prompts";
import { Wallet, JsonRpcProvider, formatUnits } from "ethers";
import chalk from "chalk";
import { GasStation } from "../packages/sdk/src/index.js";

const RPC_URL = "https://evm-t3.cronos.org/";
const GAS_STATION_URL = "http://localhost:3000";
const CHAIN_ID = 338;

async function main() {
  console.clear();

  p.intro(chalk.bgCyan.black(" 🎮 CroGas - Try It Yourself "));

  console.log(chalk.dim(`
┌─────────────────────────────────────────────────────────────┐
│  This demo will:                                            │
│  1. Create a fresh wallet (with 0 CRO)                      │
│  2. Get TestUSDC from faucet                                │
│  3. Execute a gasless transaction                           │
│  4. Show that your agent paid USDC, not CRO!                │
└─────────────────────────────────────────────────────────────┘
`));

  const shouldContinue = await p.confirm({
    message: "Ready to try it?",
    initialValue: true,
  });

  if (p.isCancel(shouldContinue) || !shouldContinue) {
    p.cancel("Maybe next time!");
    process.exit(0);
  }

  // Step 1: Create or use existing wallet
  const walletChoice = await p.select({
    message: "Choose a wallet option:",
    options: [
      { value: "new", label: "Create new wallet", hint: "Fresh wallet with 0 CRO" },
      { value: "existing", label: "Use existing private key", hint: "Paste your key" },
    ],
  });

  if (p.isCancel(walletChoice)) {
    p.cancel("Cancelled");
    process.exit(0);
  }

  let privateKey: string;

  if (walletChoice === "new") {
    const newWallet = Wallet.createRandom();
    privateKey = newWallet.privateKey;

    console.log(chalk.dim("\n📝 New wallet created:"));
    console.log(chalk.cyan(`   Address: ${newWallet.address}`));
    console.log(chalk.dim(`   Private Key: ${privateKey.slice(0, 20)}...`));
    console.log();
  } else {
    const inputKey = await p.text({
      message: "Enter your private key:",
      placeholder: "0x...",
      validate: (value) => {
        if (!value.startsWith("0x") || value.length !== 66) {
          return "Invalid private key format";
        }
      },
    });

    if (p.isCancel(inputKey)) {
      p.cancel("Cancelled");
      process.exit(0);
    }

    privateKey = inputKey;
  }

  const provider = new JsonRpcProvider(RPC_URL);
  const wallet = new Wallet(privateKey, provider);

  // Step 2: Check balances
  const spinner1 = p.spinner();
  spinner1.start("Checking wallet balances...");

  const croBalance = await provider.getBalance(wallet.address);

  // Check USDC balance via API
  let usdcBalance = "0";
  try {
    const balanceRes = await fetch(`${GAS_STATION_URL}/faucet/balance/${wallet.address}`);
    if (balanceRes.ok) {
      const data = await balanceRes.json() as { balance: string };
      usdcBalance = data.balance;
    }
  } catch {
    // Faucet might not be available
  }

  spinner1.stop("Wallet balances checked");

  console.log(chalk.dim("\n💰 Current balances:"));
  console.log(`   CRO:  ${chalk.yellow(formatUnits(croBalance, 18))} CRO`);
  console.log(`   USDC: ${chalk.green((Number(usdcBalance) / 1e6).toFixed(2))} USDC`);
  console.log();

  // Step 3: Get TestUSDC from faucet if needed
  if (BigInt(usdcBalance) < BigInt(1e6)) { // Less than 1 USDC
    const getFaucet = await p.confirm({
      message: "Get 100 TestUSDC from faucet?",
      initialValue: true,
    });

    if (p.isCancel(getFaucet)) {
      p.cancel("Cancelled");
      process.exit(0);
    }

    if (getFaucet) {
      const spinner2 = p.spinner();
      spinner2.start("Requesting TestUSDC from faucet...");

      try {
        const faucetRes = await fetch(`${GAS_STATION_URL}/faucet/${wallet.address}`);
        const faucetData = await faucetRes.json() as { success?: boolean; txHash?: string; error?: string; message?: string };

        if (faucetData.success) {
          spinner2.stop(`Got 100 TestUSDC! Tx: ${faucetData.txHash?.slice(0, 20)}...`);
          usdcBalance = String(BigInt(usdcBalance) + BigInt(100e6));
        } else {
          spinner2.stop(`Faucet error: ${faucetData.error || faucetData.message}`);
        }
      } catch (error) {
        spinner2.stop("Faucet request failed - is the Gas Station running?");
        console.log(chalk.red("\n❌ Make sure Gas Station is running: npm run dev\n"));
        process.exit(1);
      }
    }
  }

  // Step 4: Execute gasless transaction
  console.log(chalk.dim("\n🚀 Now let's execute a gasless transaction!\n"));

  const executeDemo = await p.confirm({
    message: `Execute a demo transaction? (will cost ~0.01 USDC)`,
    initialValue: true,
  });

  if (p.isCancel(executeDemo) || !executeDemo) {
    p.outro("Thanks for trying CroGas!");
    process.exit(0);
  }

  const spinner3 = p.spinner();
  spinner3.start("Executing gasless transaction via Gas Station...");

  try {
    const gasStation = new GasStation({
      apiUrl: GAS_STATION_URL,
      wallet,
      chainId: CHAIN_ID,
    });

    // Simple self-transfer (demonstrates the flow)
    const result = await gasStation.execute({
      to: wallet.address,
      data: "0x",
      gasLimit: 50000n,
    });

    spinner3.stop("Transaction executed!");

    // Get final balances
    const finalCroBalance = await provider.getBalance(wallet.address);

    let finalUsdcBalance = "0";
    try {
      const balanceRes = await fetch(`${GAS_STATION_URL}/faucet/balance/${wallet.address}`);
      if (balanceRes.ok) {
        const data = await balanceRes.json() as { balance: string };
        finalUsdcBalance = data.balance;
      }
    } catch {}

    const usdcSpent = (Number(usdcBalance) - Number(finalUsdcBalance)) / 1e6;
    const croSpent = Number(formatUnits(croBalance - finalCroBalance, 18));

    console.log(chalk.green(`
┌─────────────────────────────────────────────────────────────┐
│                    ✅ SUCCESS!                              │
├─────────────────────────────────────────────────────────────┤
│  Transaction Hash: ${result.txHash.slice(0, 42)}...
│
│  💸 You paid:
│     CRO:  ${croSpent.toFixed(6)} CRO ${chalk.dim("(should be 0!)")}
│     USDC: ${usdcSpent.toFixed(6)} USDC ${chalk.dim("(gas fee)")}
│
│  🔍 View on Explorer:
│     https://explorer.cronos.org/testnet/tx/${result.txHash}
└─────────────────────────────────────────────────────────────┘
`));

    if (croSpent === 0) {
      console.log(chalk.bgGreen.black("\n 🎉 ZERO CRO SPENT! Your agent paid gas with USDC! \n"));
    }

  } catch (error) {
    spinner3.stop("Transaction failed");
    console.log(chalk.red(`\n❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`));
    console.log(chalk.dim("\nMake sure:\n1. Gas Station is running (npm run dev)\n2. Your wallet has TestUSDC\n"));
    process.exit(1);
  }

  p.outro(chalk.cyan("Thanks for trying CroGas! 🚀"));
}

main().catch(console.error);
