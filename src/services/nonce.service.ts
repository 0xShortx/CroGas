import { logger } from "../utils/logger.js";
import { walletService } from "./wallet.service.js";

/**
 * Nonce manager to handle concurrent transactions
 * Prevents nonce conflicts when multiple relays happen simultaneously
 */
export class NonceService {
  private currentNonce: number | null = null;
  private pendingNonces: Set<number> = new Set();
  private lock: Promise<void> = Promise.resolve();

  async initialize(): Promise<void> {
    this.currentNonce = await walletService.rpcProvider.getTransactionCount(
      walletService.address,
      "pending"
    );
    logger.info("Nonce service initialized", { nonce: this.currentNonce });
  }

  async getNextNonce(): Promise<number> {
    // Wait for any pending nonce operations
    await this.lock;

    let resolveNext: () => void;
    this.lock = new Promise((resolve) => {
      resolveNext = resolve;
    });

    try {
      // Refresh nonce from chain if we don't have one
      if (this.currentNonce === null) {
        await this.initialize();
      }

      // Get the next available nonce
      let nonce = this.currentNonce!;

      // Skip any pending nonces
      while (this.pendingNonces.has(nonce)) {
        nonce++;
      }

      // Mark this nonce as pending
      this.pendingNonces.add(nonce);
      this.currentNonce = nonce + 1;

      logger.debug("Allocated nonce", { nonce, pending: [...this.pendingNonces] });

      return nonce;
    } finally {
      resolveNext!();
    }
  }

  confirmNonce(nonce: number): void {
    this.pendingNonces.delete(nonce);
    logger.debug("Confirmed nonce", { nonce });
  }

  releaseNonce(nonce: number): void {
    this.pendingNonces.delete(nonce);
    logger.debug("Released nonce", { nonce });
  }

  async resync(): Promise<void> {
    this.currentNonce = null;
    this.pendingNonces.clear();
    await this.initialize();
  }
}

// Singleton instance
export const nonceService = new NonceService();
