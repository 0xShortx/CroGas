import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { pricingService, PRIORITY_CONFIGS, Priority } from "../services/pricing.service.js";
import { logger } from "../utils/logger.js";

const estimateQuerySchema = z.object({
  to: z.string().startsWith("0x").length(42),
  data: z.string().startsWith("0x").optional().default("0x"),
  value: z.string().optional().default("0"),
  priority: z.enum(["slow", "normal", "fast"]).optional(),
});

export async function estimateController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Validate query params
    const parsed = estimateQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid request",
        details: parsed.error.format(),
      });
      return;
    }

    const { to, data, value, priority } = parsed.data;
    const valueBigInt = BigInt(value);

    logger.debug("Estimating gas", { to, dataLength: data.length, value, priority });

    // If specific priority requested, return single quote
    if (priority) {
      const quote = await pricingService.getQuote(to, data, valueBigInt, priority);
      res.status(200).json({
        gasEstimate: quote.gasEstimate.toString(),
        gasPriceGwei: quote.gasPriceGwei,
        croPrice: quote.croUsdPrice,
        priceUSDC: quote.finalPriceUSDC,
        priority: quote.priority,
        estimatedTime: quote.priorityConfig.estimatedTime,
        validFor: 60,
      });
      return;
    }

    // Return all priority tiers
    const quotes = await pricingService.getQuoteAllPriorities(to, data, valueBigInt);

    res.status(200).json({
      gasEstimate: quotes.normal.gasEstimate.toString(),
      croPrice: quotes.normal.croUsdPrice,
      recommended: quotes.recommended,
      pricing: {
        slow: {
          emoji: PRIORITY_CONFIGS.slow.emoji,
          label: PRIORITY_CONFIGS.slow.label,
          priceUSDC: quotes.slow.finalPriceUSDC,
          estimatedTime: PRIORITY_CONFIGS.slow.estimatedTime,
        },
        normal: {
          emoji: PRIORITY_CONFIGS.normal.emoji,
          label: PRIORITY_CONFIGS.normal.label,
          priceUSDC: quotes.normal.finalPriceUSDC,
          estimatedTime: PRIORITY_CONFIGS.normal.estimatedTime,
        },
        fast: {
          emoji: PRIORITY_CONFIGS.fast.emoji,
          label: PRIORITY_CONFIGS.fast.label,
          priceUSDC: quotes.fast.finalPriceUSDC,
          estimatedTime: PRIORITY_CONFIGS.fast.estimatedTime,
        },
      },
      validFor: 60,
    });
  } catch (error) {
    next(error);
  }
}
