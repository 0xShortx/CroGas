import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { forwarderService, ForwardRequest } from "../services/forwarder.service.js";
import { paymentService } from "../services/payment.service.js";
import { pricingService, Priority, PRIORITY_CONFIGS } from "../services/pricing.service.js";
import { logger } from "../utils/logger.js";
import { env } from "../config/env.js";
import { X402 } from "../config/constants.js";

const metaRelaySchema = z.object({
  request: z.object({
    from: z.string().startsWith("0x"),
    to: z.string().startsWith("0x"),
    value: z.string(),
    gas: z.string(),
    nonce: z.string(),
    deadline: z.string(),
    data: z.string().startsWith("0x"),
  }),
  signature: z.string().startsWith("0x"),
  priority: z.enum(["slow", "normal", "fast"]).optional().default("normal"),
});

const batchRelaySchema = z.object({
  requests: z.array(z.object({
    request: z.object({
      from: z.string().startsWith("0x"),
      to: z.string().startsWith("0x"),
      value: z.string(),
      gas: z.string(),
      nonce: z.string(),
      deadline: z.string(),
      data: z.string().startsWith("0x"),
    }),
    signature: z.string().startsWith("0x"),
  })).min(1).max(10),
  priority: z.enum(["slow", "normal", "fast"]).optional().default("normal"),
});

/**
 * POST /meta/relay
 * Relay a meta-transaction through the forwarder
 */
export async function metaRelayController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = metaRelaySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid request",
        details: parsed.error.format(),
      });
      return;
    }

    const { request, signature, priority } = parsed.data;
    const paymentHeader = req.headers["x-payment"];

    // Verify the signature first
    const isValid = await forwarderService.verify(request, signature);
    if (!isValid) {
      res.status(400).json({
        error: "INVALID_SIGNATURE",
        message: "Meta-transaction signature verification failed",
      });
      return;
    }

    // Calculate price with priority
    const quote = await pricingService.calculatePrice(BigInt(request.gas), priority);
    const priorityConfig = PRIORITY_CONFIGS[priority];

    if (!paymentHeader) {
      // Return 402 with payment requirements
      logger.info("Payment required for meta-relay", {
        from: request.from,
        to: request.to,
        priceUSDC: quote.finalPriceUSDC,
        priority,
      });

      res.status(402).json({
        error: "Payment Required",
        x402: {
          version: X402.VERSION,
          accepts: [
            {
              scheme: X402.SCHEME,
              network: `${X402.NETWORK_PREFIX}:${env.CHAIN_ID}`,
              asset: env.USDC_ADDRESS,
              payTo: env.RECEIVING_WALLET,
              maxAmountRequired: quote.finalPriceRaw.toString(),
              description: `Meta-transaction relay - ${request.gas} gas (${priorityConfig.label})`,
            },
          ],
        },
        quote: {
          gasEstimate: request.gas,
          gasPriceGwei: quote.gasPriceGwei,
          croPrice: quote.croUsdPrice,
          priceUSDC: quote.finalPriceUSDC,
          priority,
          priorityEmoji: priorityConfig.emoji,
          estimatedTime: priorityConfig.estimatedTime,
          validUntil: quote.validUntil.toISOString(),
        },
      });
      return;
    }

    // Verify and execute payment
    const payment = paymentService.parsePaymentHeader(paymentHeader as string);
    if (!payment) {
      res.status(400).json({
        error: "INVALID_PAYMENT",
        message: "Could not parse x402 payment header",
      });
      return;
    }

    const verification = await paymentService.verifyPayment(payment, quote.finalPriceRaw);
    if (!verification.valid) {
      res.status(402).json({
        error: "PAYMENT_INVALID",
        message: verification.reason,
      });
      return;
    }

    // Execute payment
    let paymentTxHash: string;
    try {
      paymentTxHash = await paymentService.executePayment(payment);
      logger.info("Payment executed", { paymentTxHash });
    } catch (error) {
      res.status(402).json({
        error: "PAYMENT_FAILED",
        message: "Failed to execute payment transfer",
      });
      return;
    }

    // Execute meta-transaction
    const result = await forwarderService.execute(request, signature);

    res.status(200).json({
      success: result.success,
      txHash: result.txHash,
      paymentTxHash,
      result: result.result,
      priority,
    });
  } catch (error) {
    logger.error("Meta-relay error", { error });
    next(error);
  }
}

/**
 * POST /meta/batch
 * Execute multiple meta-transactions with single payment
 */
export async function metaBatchController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = batchRelaySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid request",
        details: parsed.error.format(),
      });
      return;
    }

    const { requests, priority } = parsed.data;
    const paymentHeader = req.headers["x-payment"];

    // Verify all signatures first
    for (let i = 0; i < requests.length; i++) {
      const { request, signature } = requests[i];
      const isValid = await forwarderService.verify(request, signature);
      if (!isValid) {
        res.status(400).json({
          error: "INVALID_SIGNATURE",
          message: `Meta-transaction ${i} signature verification failed`,
          index: i,
        });
        return;
      }
    }

    // Calculate total gas and price
    const totalGas = requests.reduce((sum, r) => sum + BigInt(r.request.gas), 0n);
    const quote = await pricingService.calculatePrice(totalGas, priority);
    const priorityConfig = PRIORITY_CONFIGS[priority];

    // Apply batch discount (10% off for batching)
    const discountedPrice = (quote.finalPriceRaw * 90n) / 100n;
    const discountedPriceUSDC = (Number(discountedPrice) / 1e6).toFixed(6);

    if (!paymentHeader) {
      // Return 402 with payment requirements
      logger.info("Payment required for batch relay", {
        count: requests.length,
        totalGas: totalGas.toString(),
        priceUSDC: discountedPriceUSDC,
        priority,
      });

      res.status(402).json({
        error: "Payment Required",
        x402: {
          version: X402.VERSION,
          accepts: [
            {
              scheme: X402.SCHEME,
              network: `${X402.NETWORK_PREFIX}:${env.CHAIN_ID}`,
              asset: env.USDC_ADDRESS,
              payTo: env.RECEIVING_WALLET,
              maxAmountRequired: discountedPrice.toString(),
              description: `Batch relay - ${requests.length} transactions (10% discount)`,
            },
          ],
        },
        quote: {
          transactionCount: requests.length,
          totalGas: totalGas.toString(),
          originalPriceUSDC: quote.finalPriceUSDC,
          discountPercent: 10,
          priceUSDC: discountedPriceUSDC,
          priority,
          priorityEmoji: priorityConfig.emoji,
          estimatedTime: priorityConfig.estimatedTime,
          validUntil: quote.validUntil.toISOString(),
        },
      });
      return;
    }

    // Verify and execute payment
    const payment = paymentService.parsePaymentHeader(paymentHeader as string);
    if (!payment) {
      res.status(400).json({
        error: "INVALID_PAYMENT",
        message: "Could not parse x402 payment header",
      });
      return;
    }

    const verification = await paymentService.verifyPayment(payment, discountedPrice);
    if (!verification.valid) {
      res.status(402).json({
        error: "PAYMENT_INVALID",
        message: verification.reason,
      });
      return;
    }

    // Execute payment first
    let paymentTxHash: string;
    try {
      paymentTxHash = await paymentService.executePayment(payment);
      logger.info("Batch payment executed", { paymentTxHash });
    } catch (error) {
      res.status(402).json({
        error: "PAYMENT_FAILED",
        message: "Failed to execute payment transfer",
      });
      return;
    }

    // Execute all meta-transactions
    const results = [];
    for (const { request, signature } of requests) {
      try {
        const result = await forwarderService.execute(request, signature);
        results.push({
          success: result.success,
          txHash: result.txHash,
          to: request.to,
        });
      } catch (error) {
        results.push({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
          to: request.to,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;

    res.status(200).json({
      success: successCount === results.length,
      successCount,
      totalCount: results.length,
      paymentTxHash,
      results,
      priority,
    });
  } catch (error) {
    logger.error("Batch relay error", { error });
    next(error);
  }
}

/**
 * GET /meta/nonce/:address
 * Get current nonce for an address
 */
export async function metaNonceController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { address } = req.params;

    if (!address?.startsWith("0x")) {
      res.status(400).json({ error: "Invalid address" });
      return;
    }

    const nonce = await forwarderService.getNonce(address);

    res.status(200).json({
      address,
      nonce: nonce.toString(),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /meta/domain
 * Get EIP-712 domain for signing
 */
export function metaDomainController(
  req: Request,
  res: Response
): void {
  res.status(200).json({
    domain: forwarderService.getDomain(),
    types: forwarderService.getTypes(),
    forwarderAddress: env.FORWARDER_ADDRESS,
  });
}
