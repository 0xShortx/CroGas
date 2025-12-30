/**
 * Auto-Rebalance Service
 *
 * Monitors CRO balance and automatically swaps USDC → CRO
 * when balance falls below threshold. Uses VVS Finance DEX.
 */

import { ethers, parseUnits, formatEther, formatUnits } from "ethers";
import { env } from "../config/env.js";
import { walletService } from "./wallet.service.js";
import { CRONOS_TESTNET, CRONOS_MAINNET, ERC20_ABI } from "../config/constants.js";
import { logger } from "../utils/logger.js";

// VVS Router ABI (minimal for swaps)
const VVS_ROUTER_ABI = [
  "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
  "function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)",
];

// Configuration
const MIN_CRO_BALANCE = 10; // Trigger rebalance when CRO drops below this
const TARGET_CRO_BALANCE = 50; // Try to maintain this much CRO
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes
const SLIPPAGE_PERCENT = 5; // 5% slippage tolerance

class RebalanceService {
  private isRebalancing = false;
  private intervalId: NodeJS.Timeout | null = null;
  private network = env.CHAIN_ID === 25 ? CRONOS_MAINNET : CRONOS_TESTNET;

  /**
   * Start automatic rebalancing
   */
  start() {
    logger.info("Auto-rebalance service started", {
      minCro: MIN_CRO_BALANCE,
      targetCro: TARGET_CRO_BALANCE,
      checkIntervalMin: CHECK_INTERVAL_MS / 60000,
    });

    // Check immediately on start
    this.checkAndRebalance();

    // Then check periodically
    this.intervalId = setInterval(() => {
      this.checkAndRebalance();
    }, CHECK_INTERVAL_MS);
  }

  /**
   * Stop automatic rebalancing
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info("Auto-rebalance service stopped");
    }
  }

  /**
   * Check balance and rebalance if needed
   */
  async checkAndRebalance() {
    if (this.isRebalancing) {
      logger.debug("Rebalance already in progress, skipping");
      return;
    }

    try {
      const balances = await walletService.getBalances();
      const croBalance = parseFloat(balances.cro);
      const usdcBalance = parseFloat(balances.usdc);

      logger.debug("Balance check", { cro: croBalance, usdc: usdcBalance });

      // Check if rebalance needed
      if (croBalance >= MIN_CRO_BALANCE) {
        return; // Sufficient CRO, no action needed
      }

      // Check if we have USDC to swap
      if (usdcBalance < 1) {
        logger.warn("Low CRO balance but no USDC to swap!", { cro: croBalance, usdc: usdcBalance });
        return;
      }

      // Calculate how much USDC to swap to reach target CRO
      const croNeeded = TARGET_CRO_BALANCE - croBalance;
      const croPrice = await this.getCroPrice();
      const usdcToSwap = Math.min(
        croNeeded * croPrice * 1.1, // Add 10% buffer for slippage
        usdcBalance * 0.5 // Max 50% of USDC balance
      );

      logger.info("Initiating auto-rebalance", {
        croBalance,
        croNeeded,
        usdcToSwap: usdcToSwap.toFixed(2),
      });

      await this.executeSwap(usdcToSwap);

    } catch (error) {
      logger.error("Rebalance check failed", { error });
    }
  }

  /**
   * Get current CRO price in USDC
   */
  private async getCroPrice(): Promise<number> {
    try {
      const routerContract = new ethers.Contract(
        this.network.vvsRouter,
        VVS_ROUTER_ABI,
        walletService.rpcProvider
      );

      const path = [this.network.wcro, env.USDC_ADDRESS];
      const amounts = await routerContract.getAmountsOut(
        parseUnits("1", 18), // 1 CRO
        path
      );

      return parseFloat(formatUnits(amounts[1], 6));
    } catch {
      return 0.10; // Fallback price
    }
  }

  /**
   * Execute USDC → CRO swap on VVS Finance
   */
  private async executeSwap(usdcAmount: number) {
    if (this.isRebalancing) return;
    this.isRebalancing = true;

    try {
      const swapAmount = parseUnits(usdcAmount.toFixed(6), 6);
      const wallet = walletService.wallet;

      logger.info("Executing swap", { usdcAmount: usdcAmount.toFixed(2) });

      // Create contract instances
      const usdcContract = new ethers.Contract(env.USDC_ADDRESS, ERC20_ABI, wallet);
      const routerContract = new ethers.Contract(this.network.vvsRouter, VVS_ROUTER_ABI, wallet);

      // Check and approve USDC spending
      const allowance = await usdcContract.allowance(wallet.address, this.network.vvsRouter);
      if (allowance < swapAmount) {
        logger.info("Approving USDC for VVS Router...");
        const approveTx = await usdcContract.approve(
          this.network.vvsRouter,
          ethers.MaxUint256
        );
        await approveTx.wait();
        logger.info("USDC approved");
      }

      // Get expected output
      const path = [env.USDC_ADDRESS, this.network.wcro];
      const amounts = await routerContract.getAmountsOut(swapAmount, path);
      const expectedCro = amounts[1];
      const minOutput = (expectedCro * BigInt(100 - SLIPPAGE_PERCENT)) / 100n;

      logger.info("Swap quote", {
        usdcIn: formatUnits(swapAmount, 6),
        expectedCro: formatEther(expectedCro),
        minCro: formatEther(minOutput),
      });

      // Execute swap
      const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes
      const swapTx = await routerContract.swapExactTokensForETH(
        swapAmount,
        minOutput,
        path,
        wallet.address,
        deadline
      );

      logger.info("Swap transaction sent", { txHash: swapTx.hash });
      const receipt = await swapTx.wait();

      if (receipt?.status === 1) {
        const newBalances = await walletService.getBalances();
        logger.info("Auto-rebalance successful!", {
          newCro: newBalances.cro,
          newUsdc: newBalances.usdc,
          txHash: swapTx.hash,
        });
      } else {
        logger.error("Swap transaction failed");
      }

    } catch (error) {
      logger.error("Swap execution failed", { error });
    } finally {
      this.isRebalancing = false;
    }
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      enabled: this.intervalId !== null,
      isRebalancing: this.isRebalancing,
      config: {
        minCroBalance: MIN_CRO_BALANCE,
        targetCroBalance: TARGET_CRO_BALANCE,
        checkIntervalMs: CHECK_INTERVAL_MS,
        slippagePercent: SLIPPAGE_PERCENT,
      },
    };
  }
}

export const rebalanceService = new RebalanceService();
