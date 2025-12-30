/**
 * Relayer Pool Service
 *
 * Manages multiple relayer wallets for horizontal scaling.
 * Each relayer has independent nonce tracking and balance monitoring.
 * Supports 1000+ concurrent agents.
 */

import { ethers, Wallet, JsonRpcProvider } from "ethers";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

interface RelayerState {
  wallet: Wallet;
  address: string;
  pendingTxCount: number;
  lastUsed: number;
  nonce: number;
}

class RelayerPoolService {
  private relayers: RelayerState[] = [];
  private provider: JsonRpcProvider;
  private currentIndex = 0;
  private initialized = false;

  constructor() {
    this.provider = new JsonRpcProvider(env.CRONOS_RPC_URL);
  }

  /**
   * Initialize the relayer pool from environment
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Parse relayer keys (comma-separated or single key)
    const keys = this.parseRelayerKeys();

    if (keys.length === 0) {
      throw new Error("No relayer private keys configured");
    }

    // Initialize each relayer
    for (const key of keys) {
      const wallet = new Wallet(key, this.provider);
      const nonce = await this.provider.getTransactionCount(wallet.address, "pending");

      this.relayers.push({
        wallet,
        address: wallet.address,
        pendingTxCount: 0,
        lastUsed: 0,
        nonce,
      });

      logger.info("Relayer added to pool", {
        address: wallet.address,
        nonce,
      });
    }

    this.initialized = true;
    logger.info("Relayer pool initialized", {
      relayerCount: this.relayers.length,
      addresses: this.relayers.map((r) => r.address),
    });
  }

  /**
   * Parse relayer keys from environment
   * Supports: RELAYER_PRIVATE_KEY (single) or RELAYER_PRIVATE_KEYS (comma-separated)
   */
  private parseRelayerKeys(): string[] {
    const keys: string[] = [];

    // Check for multiple keys first
    const multipleKeys = process.env.RELAYER_PRIVATE_KEYS;
    if (multipleKeys) {
      keys.push(...multipleKeys.split(",").map((k) => k.trim()).filter(Boolean));
    }

    // Fall back to single key
    if (keys.length === 0 && env.RELAYER_PRIVATE_KEY) {
      keys.push(env.RELAYER_PRIVATE_KEY);
    }

    return keys;
  }

  /**
   * Get the next available relayer (least-busy strategy)
   */
  getRelayer(): RelayerState {
    if (!this.initialized || this.relayers.length === 0) {
      throw new Error("Relayer pool not initialized");
    }

    // Find relayer with least pending transactions
    let bestRelayer = this.relayers[0];
    for (const relayer of this.relayers) {
      if (relayer.pendingTxCount < bestRelayer.pendingTxCount) {
        bestRelayer = relayer;
      }
    }

    return bestRelayer;
  }

  /**
   * Get a relayer using round-robin (for even distribution)
   */
  getRelayerRoundRobin(): RelayerState {
    if (!this.initialized || this.relayers.length === 0) {
      throw new Error("Relayer pool not initialized");
    }

    const relayer = this.relayers[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.relayers.length;
    return relayer;
  }

  /**
   * Get next nonce for a relayer and increment
   */
  async getAndIncrementNonce(relayer: RelayerState): Promise<number> {
    const nonce = relayer.nonce;
    relayer.nonce++;
    relayer.pendingTxCount++;
    relayer.lastUsed = Date.now();
    return nonce;
  }

  /**
   * Mark transaction as complete (reduce pending count)
   */
  markComplete(relayer: RelayerState): void {
    relayer.pendingTxCount = Math.max(0, relayer.pendingTxCount - 1);
  }

  /**
   * Sync nonce from chain (for recovery after errors)
   */
  async syncNonce(relayer: RelayerState): Promise<void> {
    relayer.nonce = await this.provider.getTransactionCount(relayer.address, "pending");
    logger.debug("Nonce synced", { address: relayer.address, nonce: relayer.nonce });
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    totalRelayers: number;
    relayers: Array<{
      address: string;
      pendingTxCount: number;
      nonce: number;
    }>;
  } {
    return {
      totalRelayers: this.relayers.length,
      relayers: this.relayers.map((r) => ({
        address: r.address,
        pendingTxCount: r.pendingTxCount,
        nonce: r.nonce,
      })),
    };
  }

  /**
   * Get all relayer addresses (for balance checking)
   */
  getAddresses(): string[] {
    return this.relayers.map((r) => r.address);
  }

  /**
   * Get primary relayer (for backwards compatibility)
   */
  getPrimaryRelayer(): RelayerState {
    return this.relayers[0];
  }

  /**
   * Get provider
   */
  getProvider(): JsonRpcProvider {
    return this.provider;
  }

  /**
   * Pool size
   */
  get size(): number {
    return this.relayers.length;
  }
}

// Singleton
export const relayerPool = new RelayerPoolService();
