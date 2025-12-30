import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import routes from "./api/routes.js";
import { generalLimiter, relayLimiter, estimateLimiter } from "./middleware/rateLimit.middleware.js";
import { errorMiddleware } from "./middleware/error.middleware.js";
import { walletService } from "./services/wallet.service.js";
import { rebalanceService } from "./services/rebalance.service.js";
import { relayerPool } from "./services/relayer-pool.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Security middleware (CSP disabled for hackathon demo dashboard)
app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(cors());

// Body parsing
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.debug(`${req.method} ${req.path}`, {
      status: res.statusCode,
      duration: `${duration}ms`,
    });
  });
  next();
});

// Rate limiting
app.use("/relay", relayLimiter);
app.use("/estimate", estimateLimiter);
app.use(generalLimiter);

// Serve static dashboard
app.use(express.static(path.join(__dirname, "../public")));

// API routes
app.use("/", routes);

// Error handling
app.use(errorMiddleware);

// Start server
async function start() {
  try {
    // Initialize relayer pool (supports multiple relayers for scaling)
    await relayerPool.initialize();
    logger.info("Relayer pool ready", {
      relayerCount: relayerPool.size,
      addresses: relayerPool.getAddresses(),
    });

    // Log startup info
    logger.info("Starting Agent Gas Station...", {
      network: env.CHAIN_ID === 25 ? "Cronos Mainnet" : "Cronos Testnet",
      chainId: env.CHAIN_ID,
      relayerAddress: walletService.address,
      poolSize: relayerPool.size,
    });

    // Check relayer balance
    const balances = await walletService.getBalances();
    logger.info("Primary relayer balances", {
      CRO: balances.cro,
      USDC: balances.usdc,
    });

    if (parseFloat(balances.cro) < 1) {
      logger.warn("⚠️  Low CRO balance! Relayer may not be able to pay gas fees.");
    }

    // Start auto-rebalance service (swaps USDC → CRO when low)
    rebalanceService.start();

    // Start HTTP server
    app.listen(env.PORT, () => {
      logger.info(`🚀 Agent Gas Station running on port ${env.PORT}`);
      logger.info(`📍 Dashboard: http://localhost:${env.PORT}/`);
      logger.info(`📍 Health check: http://localhost:${env.PORT}/health`);
      logger.info(`📍 Meta relay: http://localhost:${env.PORT}/meta/relay`);
      logger.info(`📍 Batch relay: http://localhost:${env.PORT}/meta/batch`);
    });
  } catch (error) {
    logger.error("Failed to start server", { error });
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  logger.info("Shutting down...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("Shutting down...");
  process.exit(0);
});

start();
