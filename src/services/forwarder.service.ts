import { ethers, Contract } from "ethers";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { walletService } from "./wallet.service.js";
import ForwarderABI from "../config/Forwarder.abi.json" with { type: "json" };

export interface ForwardRequest {
  from: string;
  to: string;
  value: string;
  gas: string;
  nonce: string;
  deadline: string;
  data: string;
}

export interface MetaTransaction {
  request: ForwardRequest;
  signature: string;
}

export class ForwarderService {
  private forwarderContract: Contract;

  constructor() {
    this.forwarderContract = new Contract(
      env.FORWARDER_ADDRESS,
      ForwarderABI,
      walletService.wallet
    );
    logger.info("Forwarder service initialized", {
      forwarderAddress: env.FORWARDER_ADDRESS,
    });
  }

  /**
   * Get current nonce for an address
   */
  async getNonce(address: string): Promise<bigint> {
    return this.forwarderContract.getNonce(address);
  }

  /**
   * Verify a meta-transaction signature
   */
  async verify(request: ForwardRequest, signature: string): Promise<boolean> {
    try {
      const reqTuple = [
        request.from,
        request.to,
        BigInt(request.value),
        BigInt(request.gas),
        BigInt(request.nonce),
        BigInt(request.deadline),
        request.data,
      ];
      return await this.forwarderContract.verify(reqTuple, signature);
    } catch (error) {
      logger.error("Verification failed", { error });
      return false;
    }
  }

  /**
   * Execute a meta-transaction through the forwarder
   */
  async execute(
    request: ForwardRequest,
    signature: string
  ): Promise<{ txHash: string; success: boolean; result: string }> {
    logger.info("Executing meta-transaction", {
      from: request.from,
      to: request.to,
      data: request.data.slice(0, 20) + "...",
    });

    const reqTuple = [
      request.from,
      request.to,
      BigInt(request.value),
      BigInt(request.gas),
      BigInt(request.nonce),
      BigInt(request.deadline),
      request.data,
    ];

    // Estimate gas for the forwarder call
    const gasEstimate = await this.forwarderContract.execute.estimateGas(
      reqTuple,
      signature,
      { value: BigInt(request.value) }
    );

    // Execute with 20% buffer
    const tx = await this.forwarderContract.execute(reqTuple, signature, {
      value: BigInt(request.value),
      gasLimit: (gasEstimate * 120n) / 100n,
    });

    logger.info("Meta-transaction sent", { txHash: tx.hash });

    const receipt = await tx.wait();

    // Parse the Executed event
    const executedEvent = receipt.logs.find((log: any) => {
      try {
        const parsed = this.forwarderContract.interface.parseLog(log);
        return parsed?.name === "Executed";
      } catch {
        return false;
      }
    });

    let success = true;
    let result = "0x";

    if (executedEvent) {
      const parsed = this.forwarderContract.interface.parseLog(executedEvent);
      if (parsed) {
        success = parsed.args[2]; // success boolean
        result = parsed.args[3]; // result bytes
      }
    }

    logger.info("Meta-transaction executed", {
      txHash: receipt.hash,
      success,
      blockNumber: receipt.blockNumber,
    });

    return {
      txHash: receipt.hash,
      success,
      result,
    };
  }

  /**
   * Get the EIP-712 domain for signing
   */
  getDomain() {
    return {
      name: "MinimalForwarder",
      version: "1",
      chainId: env.CHAIN_ID,
      verifyingContract: env.FORWARDER_ADDRESS,
    };
  }

  /**
   * Get the EIP-712 types for ForwardRequest
   */
  getTypes() {
    return {
      ForwardRequest: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "gas", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
        { name: "data", type: "bytes" },
      ],
    };
  }
}

// Singleton
export const forwarderService = new ForwarderService();
