import { ethers, Transaction, TransactionResponse, TransactionReceipt } from "ethers";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { TransactionError, TX_ERROR_CODES } from "../utils/errors.js";
import { walletService } from "./wallet.service.js";
import { pricingService, PriceQuote } from "./pricing.service.js";

export interface DecodedTransaction {
  from: string;
  to: string;
  data: string;
  value: bigint;
  nonce: number;
  gasLimit: bigint;
  chainId: number;
  hash: string;
}

export interface RelayResult {
  success: boolean;
  txHash: string;
  blockNumber?: number;
  gasUsed?: string;
  effectiveGasPrice?: string;
}

export interface RelayedTransaction {
  id: string;
  agentAddress: string;
  signedTx: string;
  txHash: string;
  status: "pending" | "confirmed" | "failed";
  gasEstimate: bigint;
  gasUsed?: bigint;
  gasPrice: bigint;
  paymentTxHash?: string;
  amountPaidUSDC?: string;
  createdAt: Date;
  confirmedAt?: Date;
}

export class TransactionService {
  private pendingTransactions: Map<string, RelayedTransaction> = new Map();

  decodeSignedTransaction(signedTx: string): DecodedTransaction {
    try {
      const tx = Transaction.from(signedTx);

      if (!tx.from) {
        throw new TransactionError(
          "Could not recover signer from transaction",
          TX_ERROR_CODES.INVALID_SIGNATURE
        );
      }

      return {
        from: tx.from,
        to: tx.to ?? "",
        data: tx.data,
        value: tx.value,
        nonce: tx.nonce,
        gasLimit: tx.gasLimit,
        chainId: Number(tx.chainId),
        hash: tx.hash ?? "",
      };
    } catch (error) {
      if (error instanceof TransactionError) throw error;

      throw new TransactionError(
        "Failed to decode transaction",
        TX_ERROR_CODES.INVALID_SIGNATURE,
        { error: String(error) }
      );
    }
  }

  validateTransaction(decoded: DecodedTransaction): void {
    // Check chain ID
    if (decoded.chainId !== env.CHAIN_ID) {
      throw new TransactionError(
        `Invalid chain ID: expected ${env.CHAIN_ID}, got ${decoded.chainId}`,
        TX_ERROR_CODES.WRONG_CHAIN,
        { expected: env.CHAIN_ID, received: decoded.chainId }
      );
    }

    // Check for valid destination
    if (!decoded.to && !decoded.data) {
      throw new TransactionError(
        "Transaction must have a destination or contract deployment data",
        TX_ERROR_CODES.WILL_REVERT
      );
    }

    logger.debug("Transaction validated", {
      from: decoded.from,
      to: decoded.to,
      chainId: decoded.chainId,
    });
  }

  async simulateTransaction(decoded: DecodedTransaction): Promise<void> {
    const provider = walletService.rpcProvider;

    try {
      // Use eth_call to simulate
      await provider.call({
        from: decoded.from,
        to: decoded.to,
        data: decoded.data,
        value: decoded.value,
      });

      logger.debug("Transaction simulation passed", {
        from: decoded.from,
        to: decoded.to,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Parse revert reason if available
      let reason = "Transaction will revert";
      if (errorMessage.includes("revert")) {
        reason = errorMessage;
      }

      throw new TransactionError(reason, TX_ERROR_CODES.SIMULATION_FAILED, {
        simulation: errorMessage,
      });
    }
  }

  async getQuoteForTransaction(signedTx: string): Promise<{
    decoded: DecodedTransaction;
    quote: PriceQuote;
  }> {
    // Decode
    const decoded = this.decodeSignedTransaction(signedTx);

    // Validate
    this.validateTransaction(decoded);

    // Simulate
    await this.simulateTransaction(decoded);

    // Get price quote
    const quote = await pricingService.getQuote(
      decoded.to,
      decoded.data,
      decoded.value
    );

    return { decoded, quote };
  }

  async relayTransaction(
    signedTx: string,
    waitForConfirmation: boolean = true,
    confirmations: number = 1
  ): Promise<RelayResult> {
    const { decoded } = await this.getQuoteForTransaction(signedTx);

    logger.info("Relaying transaction", {
      from: decoded.from,
      to: decoded.to,
      value: decoded.value.toString(),
    });

    // Broadcast the original signed transaction
    const provider = walletService.rpcProvider;
    let txResponse: TransactionResponse;

    try {
      txResponse = await provider.broadcastTransaction(signedTx);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes("nonce")) {
        throw new TransactionError(
          "Nonce too low - transaction may have already been sent",
          TX_ERROR_CODES.NONCE_TOO_LOW
        );
      }

      throw new TransactionError(
        `Failed to broadcast transaction: ${errorMessage}`,
        TX_ERROR_CODES.BROADCAST_FAILED
      );
    }

    logger.info("Transaction broadcast successful", {
      txHash: txResponse.hash,
    });

    // Store pending transaction
    const relayedTx: RelayedTransaction = {
      id: crypto.randomUUID(),
      agentAddress: decoded.from,
      signedTx,
      txHash: txResponse.hash,
      status: "pending",
      gasEstimate: decoded.gasLimit,
      gasPrice: await walletService.getGasPrice(),
      createdAt: new Date(),
    };
    this.pendingTransactions.set(txResponse.hash, relayedTx);

    // Wait for confirmation if requested
    if (waitForConfirmation) {
      try {
        const receipt = await txResponse.wait(confirmations);

        if (receipt) {
          relayedTx.status = receipt.status === 1 ? "confirmed" : "failed";
          relayedTx.gasUsed = receipt.gasUsed;
          relayedTx.confirmedAt = new Date();

          logger.info("Transaction confirmed", {
            txHash: receipt.hash,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed.toString(),
            status: receipt.status,
          });

          return {
            success: receipt.status === 1,
            txHash: receipt.hash,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed.toString(),
            effectiveGasPrice: receipt.gasPrice?.toString(),
          };
        }
      } catch (error) {
        relayedTx.status = "failed";
        throw error;
      }
    }

    return {
      success: true,
      txHash: txResponse.hash,
    };
  }

  getStats(): {
    totalRelayed: number;
    pending: number;
    confirmed: number;
    failed: number;
  } {
    let pending = 0;
    let confirmed = 0;
    let failed = 0;

    for (const tx of this.pendingTransactions.values()) {
      switch (tx.status) {
        case "pending":
          pending++;
          break;
        case "confirmed":
          confirmed++;
          break;
        case "failed":
          failed++;
          break;
      }
    }

    return {
      totalRelayed: this.pendingTransactions.size,
      pending,
      confirmed,
      failed,
    };
  }
}

// Singleton instance
export const transactionService = new TransactionService();
