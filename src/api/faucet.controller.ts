import { Router, Request, Response } from "express";
import { Contract, parseUnits, isAddress } from "ethers";
import { walletService } from "../services/wallet.service.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const router = Router();

// TestUSDC ABI for minting
const USDC_ABI = [
  "function mint(address to, uint256 amount)",
  "function balanceOf(address owner) view returns (uint256)",
];

// Rate limiting: track last faucet request per address
const faucetCooldowns = new Map<string, number>();
const COOLDOWN_MS = 60 * 1000; // 1 minute cooldown
const FAUCET_AMOUNT = parseUnits("100", 6); // 100 USDC per request

/**
 * GET /faucet/:address
 * Mint TestUSDC to the given address
 */
router.get("/:address", async (req: Request, res: Response) => {
  const { address } = req.params;

  // Validate address
  if (!isAddress(address)) {
    return res.status(400).json({
      error: "Invalid address",
      message: "Please provide a valid Ethereum address",
    });
  }

  const normalizedAddress = address.toLowerCase();

  // Check cooldown
  const lastRequest = faucetCooldowns.get(normalizedAddress);
  if (lastRequest && Date.now() - lastRequest < COOLDOWN_MS) {
    const remainingSeconds = Math.ceil((COOLDOWN_MS - (Date.now() - lastRequest)) / 1000);
    return res.status(429).json({
      error: "Rate limited",
      message: `Please wait ${remainingSeconds} seconds before requesting again`,
      retryAfter: remainingSeconds,
    });
  }

  try {
    const usdcContract = new Contract(
      env.USDC_ADDRESS,
      USDC_ABI,
      walletService.wallet
    );

    // Check current balance
    const currentBalance = await usdcContract.balanceOf(address);

    // Mint tokens
    logger.info("Faucet: minting TestUSDC", {
      to: address,
      amount: "100 USDC",
    });

    const tx = await usdcContract.mint(address, FAUCET_AMOUNT);
    const receipt = await tx.wait();

    // Update cooldown
    faucetCooldowns.set(normalizedAddress, Date.now());

    // Get new balance
    const newBalance = await usdcContract.balanceOf(address);

    logger.info("Faucet: mint successful", {
      to: address,
      txHash: receipt.hash,
    });

    return res.json({
      success: true,
      message: "100 TestUSDC sent!",
      txHash: receipt.hash,
      address,
      previousBalance: currentBalance.toString(),
      newBalance: newBalance.toString(),
      explorer: `https://explorer.cronos.org/testnet/tx/${receipt.hash}`,
    });
  } catch (error) {
    logger.error("Faucet error", { error, address });

    return res.status(500).json({
      error: "Faucet failed",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /faucet/balance/:address
 * Check TestUSDC balance
 */
router.get("/balance/:address", async (req: Request, res: Response) => {
  const { address } = req.params;

  if (!isAddress(address)) {
    return res.status(400).json({ error: "Invalid address" });
  }

  try {
    const usdcContract = new Contract(
      env.USDC_ADDRESS,
      USDC_ABI,
      walletService.wallet
    );

    const balance = await usdcContract.balanceOf(address);
    const balanceFormatted = (Number(balance) / 1e6).toFixed(2);

    return res.json({
      address,
      balance: balance.toString(),
      balanceFormatted: `${balanceFormatted} USDC`,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to check balance",
    });
  }
});

export default router;
