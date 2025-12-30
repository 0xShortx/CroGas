#!/usr/bin/env npx tsx
/**
 * Agent Gas Station - Interactive CLI Demo
 *
 * Demonstrates how AI agents can transact on Cronos
 * without holding native CRO tokens.
 */

import * as p from "@clack/prompts";
import chalk from "chalk";
import ora from "ora";
import { ethers, Wallet, JsonRpcProvider, formatUnits, formatEther } from "ethers";
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
  "function name() view returns (string)",
];

let provider: JsonRpcProvider;
let relayerWallet: Wallet;
let usdc: ethers.Contract;

async function init() {
  provider = new JsonRpcProvider(CONFIG.rpcUrl);
  relayerWallet = new Wallet(CONFIG.relayerKey, provider);
  usdc = new ethers.Contract(CONFIG.usdcAddress, USDC_ABI, relayerWallet);
}

function banner() {
  console.log();
  console.log(chalk.cyan.bold("  ╔═══════════════════════════════════════════════════╗"));
  console.log(chalk.cyan.bold("  ║") + chalk.white.bold("       ⛽ AGENT GAS STATION - Cronos Testnet       ") + chalk.cyan.bold("║"));
  console.log(chalk.cyan.bold("  ║") + chalk.gray("       Pay gas fees with USDC via x402 protocol    ") + chalk.cyan.bold("║"));
  console.log(chalk.cyan.bold("  ╚═══════════════════════════════════════════════════╝"));
  console.log();
}

async function checkHealth() {
  const spinner = ora("Checking Gas Station health...").start();
  try {
    const response = await fetch(`${CONFIG.gasStationUrl}/health`);
    const health = await response.json();

    spinner.succeed("Gas Station is online!");
    console.log();
    console.log(chalk.gray("  Relayer Address:"), chalk.cyan(health.relayerAddress));
    console.log(chalk.gray("  CRO Balance:    "), chalk.yellow(health.relayerBalance.CRO + " CRO"));
    console.log(chalk.gray("  USDC Balance:   "), chalk.green(health.relayerBalance.USDC + " tUSDC"));
    console.log(chalk.gray("  CRO Price:      "), chalk.white("$" + health.pricing.croUsdPrice));
    console.log(chalk.gray("  Status:         "), health.status === "healthy"
      ? chalk.green("● Healthy")
      : chalk.yellow("● " + health.status));
    console.log();
  } catch (error) {
    spinner.fail("Gas Station is offline!");
    console.log(chalk.red("  Make sure the server is running: npm run dev"));
    console.log();
  }
}

async function createAgent(): Promise<{ wallet: Wallet; client: GasStationClient } | null> {
  console.log();
  p.intro(chalk.bgCyan.black(" Creating Test Agent "));

  const spinner = ora("Generating new agent wallet...").start();
  await new Promise((r) => setTimeout(r, 500));

  const agentWallet = Wallet.createRandom().connect(provider);
  spinner.succeed("Agent wallet created!");

  console.log();
  console.log(chalk.gray("  Address:"), chalk.cyan(agentWallet.address));

  // Check balances
  const croBalance = await provider.getBalance(agentWallet.address);
  const usdcBalance = await usdc.balanceOf(agentWallet.address);

  console.log(chalk.gray("  CRO:    "), chalk.yellow(formatEther(croBalance) + " CRO"));
  console.log(chalk.gray("  USDC:   "), chalk.green(formatUnits(usdcBalance, 6) + " tUSDC"));
  console.log();

  // Fund with USDC
  const fundAmount = await p.text({
    message: "How much tUSDC to fund the agent with?",
    placeholder: "10",
    defaultValue: "10",
    validate: (v) => {
      const num = parseFloat(v);
      if (isNaN(num) || num <= 0) return "Enter a positive number";
      if (num > 1000) return "Max 1000 tUSDC for demo";
    },
  });

  if (p.isCancel(fundAmount)) return null;

  const fundSpinner = ora(`Transferring ${fundAmount} tUSDC to agent...`).start();
  try {
    const amount = ethers.parseUnits(fundAmount as string, 6);
    const tx = await usdc.transfer(agentWallet.address, amount);
    await tx.wait();
    fundSpinner.succeed(`Funded agent with ${fundAmount} tUSDC!`);

    // Verify
    const newBalance = await usdc.balanceOf(agentWallet.address);
    console.log(chalk.gray("  New USDC Balance:"), chalk.green(formatUnits(newBalance, 6) + " tUSDC"));
    console.log(chalk.gray("  CRO Balance:     "), chalk.red("0 CRO") + chalk.gray(" (agent has no gas!)"));
    console.log();
  } catch (error) {
    fundSpinner.fail("Failed to fund agent");
    return null;
  }

  const client = new GasStationClient({
    apiUrl: CONFIG.gasStationUrl,
    wallet: agentWallet,
    usdcAddress: CONFIG.usdcAddress,
    chainId: CONFIG.chainId,
  });

  return { wallet: agentWallet, client };
}

async function executeTransaction(agent: { wallet: Wallet; client: GasStationClient }) {
  console.log();
  p.intro(chalk.bgMagenta.black(" Execute Meta-Transaction "));

  console.log(chalk.gray("  The agent will call a contract function"));
  console.log(chalk.gray("  WITHOUT holding any CRO for gas!"));
  console.log();

  const action = await p.select({
    message: "What should the agent do?",
    options: [
      { value: "balance", label: "Check USDC balance (read call)" },
      { value: "name", label: "Get USDC token name (read call)" },
      { value: "custom", label: "Custom contract call" },
    ],
  });

  if (p.isCancel(action)) return;

  let to: string;
  let data: string;
  let description: string;

  if (action === "balance") {
    to = CONFIG.usdcAddress;
    data = usdc.interface.encodeFunctionData("balanceOf", [agent.wallet.address]);
    description = "USDC.balanceOf(agent)";
  } else if (action === "name") {
    to = CONFIG.usdcAddress;
    data = usdc.interface.encodeFunctionData("name");
    description = "USDC.name()";
  } else {
    const customTo = await p.text({
      message: "Contract address:",
      placeholder: "0x...",
      validate: (v) => v.startsWith("0x") && v.length === 42 ? undefined : "Invalid address",
    });
    if (p.isCancel(customTo)) return;

    const customData = await p.text({
      message: "Calldata (hex):",
      placeholder: "0x...",
      defaultValue: "0x",
    });
    if (p.isCancel(customData)) return;

    to = customTo as string;
    data = customData as string;
    description = `Custom call to ${to.slice(0, 10)}...`;
  }

  // Get estimate
  const estimateSpinner = ora("Getting gas estimate...").start();
  const estimate = await agent.client.estimate(to, data);
  estimateSpinner.succeed("Got estimate!");

  console.log();
  console.log(chalk.gray("  Gas Estimate:"), chalk.white(estimate.gasEstimate));
  console.log(chalk.gray("  Price:       "), chalk.green(estimate.priceUSDC + " USDC"));
  console.log(chalk.gray("  CRO Price:   "), chalk.white("$" + estimate.croPrice));
  console.log();

  const confirm = await p.confirm({
    message: `Execute "${description}" for ${estimate.priceUSDC} USDC?`,
  });

  if (!confirm || p.isCancel(confirm)) return;

  // Execute!
  console.log();
  const execSpinner = ora("Signing meta-transaction...").start();

  try {
    await new Promise((r) => setTimeout(r, 300));
    execSpinner.text = "Signing USDC payment authorization...";
    await new Promise((r) => setTimeout(r, 300));
    execSpinner.text = "Submitting to Gas Station...";

    const result = await agent.client.execute({
      to,
      data,
      gasLimit: BigInt(estimate.gasEstimate),
    });

    execSpinner.succeed("Transaction executed!");
    console.log();
    console.log(chalk.green.bold("  ✓ SUCCESS!"));
    console.log();
    console.log(chalk.gray("  Forwarder Tx:"), chalk.cyan(result.txHash));
    console.log(chalk.gray("  Payment Tx:  "), chalk.cyan(result.paymentTxHash));
    console.log(chalk.gray("  Call Result: "), result.success ? chalk.green("Success") : chalk.red("Failed"));
    console.log();

    // Show final balance
    const finalBalance = await usdc.balanceOf(agent.wallet.address);
    const finalCro = await provider.getBalance(agent.wallet.address);
    console.log(chalk.gray("  Agent USDC:  "), chalk.green(formatUnits(finalBalance, 6) + " tUSDC"));
    console.log(chalk.gray("  Agent CRO:   "), chalk.red(formatEther(finalCro) + " CRO") + chalk.gray(" (still 0!)"));
    console.log();
  } catch (error: any) {
    execSpinner.fail("Transaction failed!");
    console.log(chalk.red("  Error:"), error.message);
    console.log();
  }
}

async function main() {
  await init();
  banner();

  // Check health first
  await checkHealth();

  while (true) {
    const action = await p.select({
      message: "What would you like to do?",
      options: [
        { value: "health", label: "🏥 Check Gas Station health" },
        { value: "demo", label: "🤖 Run full demo (create agent → execute tx)" },
        { value: "exit", label: "👋 Exit" },
      ],
    });

    if (p.isCancel(action) || action === "exit") {
      p.outro(chalk.cyan("Thanks for using Agent Gas Station!"));
      break;
    }

    if (action === "health") {
      await checkHealth();
    }

    if (action === "demo") {
      const agent = await createAgent();
      if (agent) {
        let continueDemo = true;
        while (continueDemo) {
          await executeTransaction(agent);

          const another = await p.confirm({
            message: "Execute another transaction with this agent?",
          });
          if (!another || p.isCancel(another)) {
            continueDemo = false;
          }
        }
      }
    }
  }
}

main().catch(console.error);
