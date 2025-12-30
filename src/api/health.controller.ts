import { Request, Response, NextFunction } from "express";
import { walletService } from "../services/wallet.service.js";
import { transactionService } from "../services/transaction.service.js";
import { pricingService } from "../services/pricing.service.js";
import { rebalanceService } from "../services/rebalance.service.js";
import { logger } from "../utils/logger.js";

export async function healthController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Get relayer balances
    const balances = await walletService.getBalances();

    // Get transaction stats
    const stats = transactionService.getStats();

    // Get current gas price
    const gasPrice = await walletService.getGasPrice();

    // Determine health status
    const croThreshold = 10; // Alert if below 10 CRO
    const isHealthy = parseFloat(balances.cro) >= croThreshold;

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? "healthy" : "degraded",
      relayerAddress: walletService.address,
      relayerBalance: {
        CRO: balances.cro,
        USDC: balances.usdc,
      },
      stats: {
        totalRelayed: stats.totalRelayed,
        pending: stats.pending,
        confirmed: stats.confirmed,
        failed: stats.failed,
        successRate:
          stats.totalRelayed > 0
            ? (stats.confirmed / stats.totalRelayed).toFixed(3)
            : "1.000",
      },
      pricing: {
        croUsdPrice: pricingService.getCroUsdPrice(),
        currentGasPriceGwei: (Number(gasPrice) / 1e9).toFixed(0),
      },
      warnings: isHealthy
        ? []
        : [`Low CRO balance: ${balances.cro} CRO (threshold: ${croThreshold})`],
      autoRebalance: rebalanceService.getStatus(),
    });
  } catch (error) {
    logger.error("Health check failed", { error });
    res.status(503).json({
      status: "unhealthy",
      error: "Health check failed",
    });
  }
}
