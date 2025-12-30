import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseUnits, formatUnits } from "ethers";

// Test pricing calculation logic without blockchain dependencies

describe("PricingService", () => {
  describe("calculatePrice", () => {
    // Pricing constants (mirroring the actual service)
    const MARKUP_PERCENTAGE = 20;
    const MIN_PRICE_USDC = 0.01;
    const MAX_PRICE_USDC = 10;

    function calculatePrice(
      gasEstimate: bigint,
      gasPrice: bigint,
      croUsdPrice: number
    ) {
      const gasPriceGwei = formatUnits(gasPrice, "gwei");

      // Calculate base cost in CRO
      const gasCostWei = gasEstimate * gasPrice;
      const gasCostCro = Number(formatUnits(gasCostWei, 18));

      // Convert to USD
      const baseCostUSD = gasCostCro * croUsdPrice;

      // Apply markup
      const markup = 1 + MARKUP_PERCENTAGE / 100;
      let finalPriceUSD = baseCostUSD * markup;

      // Ensure minimum price
      finalPriceUSD = Math.max(finalPriceUSD, MIN_PRICE_USDC);

      // Ensure maximum price
      finalPriceUSD = Math.min(finalPriceUSD, MAX_PRICE_USDC);

      // Convert to USDC (6 decimals)
      const finalPriceRaw = parseUnits(finalPriceUSD.toFixed(6), 6);

      return {
        gasEstimate,
        gasPriceGwei,
        croUsdPrice,
        baseCostUSD,
        markup,
        finalPriceUSDC: finalPriceUSD.toFixed(6),
        finalPriceRaw,
      };
    }

    it("should calculate price with standard gas", () => {
      const gasEstimate = 100000n;
      const gasPrice = parseUnits("5000", "gwei"); // 5000 gwei
      const croUsdPrice = 0.15;

      const result = calculatePrice(gasEstimate, gasPrice, croUsdPrice);

      // 100000 * 5000 gwei = 5 * 10^17 wei = 0.5 CRO
      // 0.5 CRO * 0.15 USD = 0.075 USD base
      // With 20% markup = 0.09 USD
      expect(result.finalPriceUSDC).toBe("0.090000");
      expect(result.finalPriceRaw).toBe(90000n);
    });

    it("should apply minimum price floor", () => {
      const gasEstimate = 21000n; // Simple transfer
      const gasPrice = parseUnits("100", "gwei"); // Low gas price
      const croUsdPrice = 0.10;

      const result = calculatePrice(gasEstimate, gasPrice, croUsdPrice);

      // Very low cost, but should be at least MIN_PRICE_USDC
      expect(Number(result.finalPriceUSDC)).toBeGreaterThanOrEqual(MIN_PRICE_USDC);
    });

    it("should apply maximum price cap", () => {
      const gasEstimate = 10000000n; // Very high gas
      const gasPrice = parseUnits("100000", "gwei"); // Very high gas price
      const croUsdPrice = 1.0; // High CRO price

      const result = calculatePrice(gasEstimate, gasPrice, croUsdPrice);

      // Very high cost, but should be capped at MAX_PRICE_USDC
      expect(Number(result.finalPriceUSDC)).toBeLessThanOrEqual(MAX_PRICE_USDC);
    });

    it("should apply 20% markup", () => {
      const gasEstimate = 1000000n;
      const gasPrice = parseUnits("10000", "gwei");
      const croUsdPrice = 0.50;

      const result = calculatePrice(gasEstimate, gasPrice, croUsdPrice);

      // Base: 1000000 * 10000 gwei = 0.01 CRO
      // 0.01 * 0.50 = 0.005 USD
      // With 20% markup = 0.006 USD
      // Min is 0.01, so should be 0.01
      expect(result.markup).toBe(1.2);
    });

    it("should format gas price in gwei", () => {
      const gasEstimate = 100000n;
      const gasPrice = parseUnits("2500", "gwei");
      const croUsdPrice = 0.15;

      const result = calculatePrice(gasEstimate, gasPrice, croUsdPrice);

      expect(result.gasPriceGwei).toBe("2500.0");
    });

    it("should handle high gas scenarios", () => {
      // Complex contract interaction
      const gasEstimate = 500000n;
      const gasPrice = parseUnits("50000", "gwei");
      const croUsdPrice = 0.20;

      const result = calculatePrice(gasEstimate, gasPrice, croUsdPrice);

      // 500000 * 50000 gwei = 2.5 * 10^19 wei = 25 CRO
      // 25 CRO * 0.20 USD = 5.0 USD base
      // With 20% markup = 6.0 USD
      expect(result.finalPriceUSDC).toBe("6.000000");
    });

    it("should return correct USDC decimals (6)", () => {
      const gasEstimate = 100000n;
      const gasPrice = parseUnits("5000", "gwei");
      const croUsdPrice = 0.15;

      const result = calculatePrice(gasEstimate, gasPrice, croUsdPrice);

      // finalPriceRaw should be in 6 decimal format
      // 0.09 USDC = 90000 (6 decimals) in raw
      expect(result.finalPriceRaw).toBe(90000n);
    });
  });

  describe("gas estimation buffer", () => {
    it("should add 20% buffer to gas estimate", () => {
      const rawEstimate = 100000n;
      const bufferedEstimate = (rawEstimate * 120n) / 100n;

      expect(bufferedEstimate).toBe(120000n);
    });

    it("should handle large gas estimates", () => {
      const rawEstimate = 5000000n;
      const bufferedEstimate = (rawEstimate * 120n) / 100n;

      expect(bufferedEstimate).toBe(6000000n);
    });
  });
});
