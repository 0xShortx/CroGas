import { Router } from "express";
import { relayController } from "./relay.controller.js";
import { estimateController } from "./estimate.controller.js";
import { healthController } from "./health.controller.js";
import {
  metaRelayController,
  metaBatchController,
  metaNonceController,
  metaDomainController,
} from "./meta.controller.js";
import faucetRouter from "./faucet.controller.js";

const router = Router();

// Transaction relay endpoint (raw signed tx - limited use)
router.post("/relay", relayController);

// Meta-transaction endpoints (recommended)
router.post("/meta/relay", metaRelayController);
router.post("/meta/batch", metaBatchController);
router.get("/meta/nonce/:address", metaNonceController);
router.get("/meta/domain", metaDomainController);

// Price estimation endpoint
router.get("/estimate", estimateController);

// Health check endpoint
router.get("/health", healthController);

// Faucet endpoints (testnet only)
router.use("/faucet", faucetRouter);

// Root endpoint
router.get("/", (req, res) => {
  res.json({
    name: "Agent Gas Station",
    version: "1.0.0",
    description: "Transaction relay service for AI agents on Cronos",
    endpoints: {
      "POST /meta/relay": "Relay single meta-transaction",
      "POST /meta/batch": "Batch multiple transactions (10% discount)",
      "GET /meta/nonce/:address": "Get nonce for signing",
      "GET /meta/domain": "Get EIP-712 domain",
      "GET /faucet/:address": "Get 100 TestUSDC",
      "GET /estimate": "Get pricing for all tiers",
      "GET /health": "Service status",
    },
    features: {
      smartPricing: {
        slow: "🐢 ~30 sec, cheapest",
        normal: "🚗 ~10 sec, recommended",
        fast: "🚀 ~3 sec, priority",
      },
      batching: "10% discount when batching multiple transactions",
    },
    tryItYourself: {
      step1: "GET /faucet/YOUR_ADDRESS - Get 100 TestUSDC",
      step2: "Use SDK or CLI to execute a gasless transaction",
      step3: "Your agent pays USDC, we pay CRO gas!",
    },
    documentation: "https://github.com/klyntos/agent-gas-station",
  });
});

export default router;
