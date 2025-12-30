import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger.js";
import { env } from "../config/env.js";

// x402 Payment header structure
interface X402Payment {
  version: number;
  scheme: string;
  network: string;
  payload: {
    signature: string;
    authorization: {
      from: string;
      to: string;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: string;
    };
  };
}

export function parseX402Header(header: string): X402Payment | null {
  try {
    // x402 header is base64 encoded JSON
    const decoded = Buffer.from(header, "base64").toString("utf-8");
    return JSON.parse(decoded) as X402Payment;
  } catch (error) {
    logger.warn("Failed to parse x402 header", { error });
    return null;
  }
}

export async function verifyX402Payment(
  payment: X402Payment,
  expectedAmount: bigint
): Promise<boolean> {
  // TODO: Implement full x402 verification
  // 1. Verify the signature matches the authorization
  // 2. Verify the amount is >= expectedAmount
  // 3. Verify the payTo address matches our receiving wallet
  // 4. Verify the network matches our chain
  // 5. Check nonce hasn't been used (via EIP-3009)

  logger.debug("Verifying x402 payment", {
    from: payment.payload.authorization.from,
    to: payment.payload.authorization.to,
    value: payment.payload.authorization.value,
  });

  // For MVP, we do basic validation
  const auth = payment.payload.authorization;

  // Check recipient
  if (auth.to.toLowerCase() !== env.RECEIVING_WALLET.toLowerCase()) {
    logger.warn("Payment to wrong address", {
      expected: env.RECEIVING_WALLET,
      received: auth.to,
    });
    return false;
  }

  // Check amount
  const paymentAmount = BigInt(auth.value);
  if (paymentAmount < expectedAmount) {
    logger.warn("Insufficient payment", {
      expected: expectedAmount.toString(),
      received: auth.value,
    });
    return false;
  }

  // TODO: Verify signature and execute transferWithAuthorization on-chain

  return true;
}

export function x402Middleware(expectedAmountGetter: (req: Request) => Promise<bigint>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const paymentHeader = req.headers["x-payment"] as string | undefined;

    if (!paymentHeader) {
      // Let the controller handle 402 response
      return next();
    }

    const payment = parseX402Header(paymentHeader);
    if (!payment) {
      res.status(400).json({
        error: "INVALID_PAYMENT",
        message: "Could not parse x402 payment header",
      });
      return;
    }

    try {
      const expectedAmount = await expectedAmountGetter(req);
      const isValid = await verifyX402Payment(payment, expectedAmount);

      if (!isValid) {
        res.status(402).json({
          error: "PAYMENT_INVALID",
          message: "Payment verification failed",
        });
        return;
      }

      // Payment verified - attach to request for later use
      (req as Request & { x402Payment?: X402Payment }).x402Payment = payment;
      next();
    } catch (error) {
      logger.error("Payment verification error", { error });
      res.status(500).json({
        error: "PAYMENT_ERROR",
        message: "Payment verification failed",
      });
    }
  };
}
