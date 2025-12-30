import { ethers, Contract } from "ethers";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { walletService } from "./wallet.service.js";

// EIP-3009 ABI for transferWithAuthorization
const USDC_ABI = [
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
  "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
];

export interface X402Authorization {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
}

export interface X402Payment {
  version: number;
  scheme: string;
  network: string;
  payload: {
    signature: string; // 0x + r + s + v (65 bytes hex)
    authorization: X402Authorization;
  };
}

export class PaymentService {
  private usdcContract: Contract;

  constructor() {
    this.usdcContract = new Contract(
      env.USDC_ADDRESS,
      USDC_ABI,
      walletService.wallet
    );
  }

  /**
   * Parse x402 payment header (base64 encoded JSON)
   */
  parsePaymentHeader(header: string): X402Payment | null {
    try {
      const decoded = Buffer.from(header, "base64").toString("utf-8");
      return JSON.parse(decoded) as X402Payment;
    } catch (error) {
      logger.warn("Failed to parse x402 header", { error });
      return null;
    }
  }

  /**
   * Verify payment meets requirements without executing
   */
  async verifyPayment(
    payment: X402Payment,
    expectedAmount: bigint
  ): Promise<{ valid: boolean; reason?: string }> {
    const auth = payment.payload.authorization;

    // Check recipient
    if (auth.to.toLowerCase() !== env.RECEIVING_WALLET.toLowerCase()) {
      return { valid: false, reason: "Wrong recipient address" };
    }

    // Check amount
    const paymentAmount = BigInt(auth.value);
    if (paymentAmount < expectedAmount) {
      return {
        valid: false,
        reason: `Insufficient amount: got ${auth.value}, need ${expectedAmount}`,
      };
    }

    // Check timing
    const now = Math.floor(Date.now() / 1000);
    if (now <= Number(auth.validAfter)) {
      return { valid: false, reason: "Authorization not yet valid" };
    }
    if (now >= Number(auth.validBefore)) {
      return { valid: false, reason: "Authorization expired" };
    }

    // Check nonce hasn't been used
    try {
      const used = await this.usdcContract.authorizationState(auth.from, auth.nonce);
      if (used) {
        return { valid: false, reason: "Authorization nonce already used" };
      }
    } catch (error) {
      logger.warn("Failed to check nonce state", { error });
    }

    // Check payer has sufficient balance
    try {
      const balance = await this.usdcContract.balanceOf(auth.from);
      if (balance < paymentAmount) {
        return {
          valid: false,
          reason: `Payer has insufficient USDC: ${balance} < ${paymentAmount}`,
        };
      }
    } catch (error) {
      logger.warn("Failed to check payer balance", { error });
    }

    return { valid: true };
  }

  /**
   * Execute the EIP-3009 transferWithAuthorization
   */
  async executePayment(payment: X402Payment): Promise<string> {
    const auth = payment.payload.authorization;
    const sig = payment.payload.signature;

    // Parse signature (0x + 64 bytes r + 64 bytes s + 2 bytes v)
    const r = "0x" + sig.slice(2, 66);
    const s = "0x" + sig.slice(66, 130);
    const v = parseInt(sig.slice(130, 132), 16);

    logger.info("Executing x402 payment", {
      from: auth.from,
      to: auth.to,
      value: auth.value,
    });

    try {
      const tx = await this.usdcContract.transferWithAuthorization(
        auth.from,
        auth.to,
        BigInt(auth.value),
        BigInt(auth.validAfter),
        BigInt(auth.validBefore),
        auth.nonce,
        v,
        r,
        s
      );

      logger.info("Payment transaction sent", { txHash: tx.hash });

      const receipt = await tx.wait();

      if (receipt.status !== 1) {
        throw new Error("Payment transaction failed");
      }

      logger.info("Payment confirmed", {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      });

      return receipt.hash;
    } catch (error) {
      logger.error("Payment execution failed", { error });
      throw error;
    }
  }
}

// Singleton
export const paymentService = new PaymentService();
