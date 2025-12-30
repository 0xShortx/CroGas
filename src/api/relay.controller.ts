import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { transactionService } from "../services/transaction.service.js";
import { paymentService } from "../services/payment.service.js";
import { logger } from "../utils/logger.js";
import { GasStationError } from "../utils/errors.js";
import { env } from "../config/env.js";
import { X402 } from "../config/constants.js";

const relayRequestSchema = z.object({
  signedTx: z.string().startsWith("0x"),
  options: z
    .object({
      waitForConfirmation: z.boolean().default(true),
      confirmations: z.number().min(1).max(12).default(1),
    })
    .optional(),
});

export async function relayController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Validate request body
    const parsed = relayRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid request",
        details: parsed.error.format(),
      });
      return;
    }

    const { signedTx, options } = parsed.data;

    // Check if payment header is present
    const paymentHeader = req.headers["x-payment"];

    if (!paymentHeader) {
      // No payment - return 402 with price quote
      const { decoded, quote } = await transactionService.getQuoteForTransaction(signedTx);

      logger.info("Payment required for relay", {
        from: decoded.from,
        to: decoded.to,
        priceUSDC: quote.finalPriceUSDC,
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
              description: `Transaction relay - ${quote.gasEstimate.toString()} gas estimated`,
            },
          ],
        },
        quote: {
          gasEstimate: quote.gasEstimate.toString(),
          gasPriceGwei: quote.gasPriceGwei,
          croPrice: quote.croUsdPrice,
          priceUSDC: quote.finalPriceUSDC,
          validUntil: quote.validUntil.toISOString(),
        },
      });
      return;
    }

    // Payment header present - verify and execute payment, then relay
    const payment = paymentService.parsePaymentHeader(paymentHeader as string);

    if (!payment) {
      res.status(400).json({
        error: "INVALID_PAYMENT",
        message: "Could not parse x402 payment header",
      });
      return;
    }

    // Get quote to know expected amount
    const { quote } = await transactionService.getQuoteForTransaction(signedTx);

    // Verify payment
    const verification = await paymentService.verifyPayment(payment, quote.finalPriceRaw);
    if (!verification.valid) {
      res.status(402).json({
        error: "PAYMENT_INVALID",
        message: verification.reason,
      });
      return;
    }

    // Execute the payment (transferWithAuthorization)
    let paymentTxHash: string;
    try {
      paymentTxHash = await paymentService.executePayment(payment);
      logger.info("Payment executed", { paymentTxHash });
    } catch (error) {
      res.status(402).json({
        error: "PAYMENT_FAILED",
        message: "Failed to execute payment transfer",
        details: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    // Payment successful - now relay the transaction
    logger.info("Payment verified, relaying transaction", { paymentTxHash });

    const result = await transactionService.relayTransaction(
      signedTx,
      options?.waitForConfirmation ?? true,
      options?.confirmations ?? 1
    );

    res.status(200).json({
      ...result,
      paymentTxHash,
    });
  } catch (error) {
    if (error instanceof GasStationError) {
      res.status(error.statusCode).json({
        error: error.code,
        message: error.message,
        details: error.details,
      });
      return;
    }

    next(error);
  }
}
