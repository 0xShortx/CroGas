import { formatUnits, parseUnits } from "ethers";
import { env } from "../config/env.js";
import { PRICING } from "../config/constants.js";
import { logger } from "../utils/logger.js";
import { walletService } from "./wallet.service.js";

// Priority tiers for smart gas pricing
export type Priority = "slow" | "normal" | "fast";

export interface PriorityConfig {
  label: string;
  emoji: string;
  markupMultiplier: number;  // Multiplier on base markup
  gasPriceMultiplier: number; // Multiplier on gas price
  estimatedTime: string;
}

export const PRIORITY_CONFIGS: Record<Priority, PriorityConfig> = {
  slow: {
    label: "Slow",
    emoji: "🐢",
    markupMultiplier: 0.5,   // 50% of normal markup
    gasPriceMultiplier: 0.8, // 80% gas price
    estimatedTime: "~30 sec",
  },
  normal: {
    label: "Normal",
    emoji: "🚗",
    markupMultiplier: 1.0,   // Standard markup
    gasPriceMultiplier: 1.0, // Standard gas price
    estimatedTime: "~10 sec",
  },
  fast: {
    label: "Fast",
    emoji: "🚀",
    markupMultiplier: 2.0,   // 2x markup
    gasPriceMultiplier: 1.5, // 1.5x gas price
    estimatedTime: "~3 sec",
  },
};

export interface PriceQuote {
  gasEstimate: bigint;
  gasPriceGwei: string;
  croUsdPrice: number;
  baseCostUSD: number;
  markup: number;
  finalPriceUSDC: string;
  finalPriceRaw: bigint; // In USDC smallest units (6 decimals)
  validUntil: Date;
  nonce: string;
  priority: Priority;
  priorityConfig: PriorityConfig;
}

export interface AllPriceQuotes {
  slow: PriceQuote;
  normal: PriceQuote;
  fast: PriceQuote;
  recommended: Priority;
}

export class PricingService {
  private croUsdPrice: number = 0.15; // Default fallback
  private lastPriceUpdate: Date = new Date(0);
  private priceUpdateInterval = 60000; // 1 minute

  constructor() {
    // Start price updates
    this.updateCroPrice();
    setInterval(() => this.updateCroPrice(), this.priceUpdateInterval);
  }

  private async updateCroPrice(): Promise<void> {
    try {
      // TODO: Integrate with Crypto.com API or price oracle
      // For now, use a fallback price
      // In production, fetch from: https://api.crypto.com/v2/public/get-ticker?instrument_name=CRO_USD

      // Simulated price fetch - replace with real API call
      const response = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=crypto-com-chain&vs_currencies=usd"
      ).catch(() => null);

      if (response?.ok) {
        const data = await response.json() as Record<string, { usd?: number }>;
        this.croUsdPrice = data["crypto-com-chain"]?.usd ?? this.croUsdPrice;
      }

      this.lastPriceUpdate = new Date();
      logger.debug("CRO price updated", { price: this.croUsdPrice });
    } catch (error) {
      logger.warn("Failed to update CRO price, using fallback", {
        fallback: this.croUsdPrice,
      });
    }
  }

  getCroUsdPrice(): number {
    return this.croUsdPrice;
  }

  async estimateGas(to: string, data: string, value: bigint = 0n): Promise<bigint> {
    const provider = walletService.rpcProvider;

    try {
      const estimate = await provider.estimateGas({
        to,
        data,
        value,
        from: walletService.address,
      });

      // Add 20% buffer for safety
      return (estimate * 120n) / 100n;
    } catch (error) {
      logger.warn("Gas estimation failed, using default", { error });
      return 100000n; // Default fallback
    }
  }

  async calculatePrice(gasEstimate: bigint, priority: Priority = "normal"): Promise<PriceQuote> {
    const baseGasPrice = await walletService.getGasPrice();
    const priorityConfig = PRIORITY_CONFIGS[priority];

    // Apply priority multiplier to gas price
    const adjustedGasPrice = BigInt(Math.floor(Number(baseGasPrice) * priorityConfig.gasPriceMultiplier));
    const gasPriceGwei = formatUnits(adjustedGasPrice, "gwei");

    // Calculate base cost in CRO
    const gasCostWei = gasEstimate * adjustedGasPrice;
    const gasCostCro = Number(formatUnits(gasCostWei, 18));

    // Convert to USD
    const baseCostUSD = gasCostCro * this.croUsdPrice;

    // Apply markup with priority multiplier
    const baseMarkup = 1 + env.MARKUP_PERCENTAGE / 100;
    const markup = 1 + (baseMarkup - 1) * priorityConfig.markupMultiplier;
    let finalPriceUSD = baseCostUSD * markup;

    // Ensure minimum price (adjusted by priority)
    const minPrice = env.MIN_PRICE_USDC * priorityConfig.markupMultiplier;
    finalPriceUSD = Math.max(finalPriceUSD, Math.max(minPrice, 0.005)); // At least $0.005

    // Ensure maximum price
    finalPriceUSD = Math.min(finalPriceUSD, PRICING.MAX_PRICE_USDC);

    // Convert to USDC (6 decimals)
    const finalPriceRaw = parseUnits(finalPriceUSD.toFixed(6), 6);

    // Generate quote nonce
    const nonce = `0x${Buffer.from(crypto.randomUUID().replace(/-/g, ""), "hex").toString("hex").slice(0, 64)}`;

    return {
      gasEstimate,
      gasPriceGwei,
      croUsdPrice: this.croUsdPrice,
      baseCostUSD,
      markup,
      finalPriceUSDC: finalPriceUSD.toFixed(6),
      finalPriceRaw,
      validUntil: new Date(Date.now() + PRICING.QUOTE_VALIDITY_SECONDS * 1000),
      nonce,
      priority,
      priorityConfig,
    };
  }

  /**
   * Get quotes for all priority tiers
   */
  async getAllQuotes(gasEstimate: bigint): Promise<AllPriceQuotes> {
    const [slow, normal, fast] = await Promise.all([
      this.calculatePrice(gasEstimate, "slow"),
      this.calculatePrice(gasEstimate, "normal"),
      this.calculatePrice(gasEstimate, "fast"),
    ]);

    return {
      slow,
      normal,
      fast,
      recommended: "normal",
    };
  }

  async getQuote(to: string, data: string, value: bigint = 0n, priority: Priority = "normal"): Promise<PriceQuote> {
    const gasEstimate = await this.estimateGas(to, data, value);
    return this.calculatePrice(gasEstimate, priority);
  }

  async getQuoteAllPriorities(to: string, data: string, value: bigint = 0n): Promise<AllPriceQuotes> {
    const gasEstimate = await this.estimateGas(to, data, value);
    return this.getAllQuotes(gasEstimate);
  }
}

// Singleton instance
export const pricingService = new PricingService();
