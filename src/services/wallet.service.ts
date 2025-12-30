import { ethers, JsonRpcProvider, Wallet, formatEther, formatUnits } from "ethers";
import { env } from "../config/env.js";
import { ERC20_ABI } from "../config/constants.js";
import { logger } from "../utils/logger.js";
import { InsufficientFundsError } from "../utils/errors.js";

export interface WalletBalances {
  cro: string;
  croWei: bigint;
  usdc: string;
  usdcRaw: bigint;
}

export class WalletService {
  private provider: JsonRpcProvider;
  private relayerWallet: Wallet;
  private usdcContract: ethers.Contract;

  constructor() {
    this.provider = new JsonRpcProvider(env.CRONOS_RPC_URL);
    this.relayerWallet = new Wallet(env.RELAYER_PRIVATE_KEY, this.provider);
    this.usdcContract = new ethers.Contract(
      env.USDC_ADDRESS,
      ERC20_ABI,
      this.relayerWallet
    );

    logger.info("Wallet service initialized", {
      relayerAddress: this.relayerWallet.address,
      network: env.CHAIN_ID,
    });
  }

  get address(): string {
    return this.relayerWallet.address;
  }

  get wallet(): Wallet {
    return this.relayerWallet;
  }

  get rpcProvider(): JsonRpcProvider {
    return this.provider;
  }

  async getBalances(): Promise<WalletBalances> {
    const croWei = await this.provider.getBalance(this.relayerWallet.address);

    // Try to get USDC balance, but handle missing contract gracefully
    let usdcRaw = 0n;
    try {
      usdcRaw = await this.usdcContract.balanceOf(this.relayerWallet.address) as bigint;
    } catch (error) {
      logger.debug("Could not fetch USDC balance (contract may not exist on this network)");
    }

    return {
      cro: formatEther(croWei),
      croWei,
      usdc: formatUnits(usdcRaw, 6), // USDC has 6 decimals
      usdcRaw,
    };
  }

  async ensureSufficientCro(requiredWei: bigint): Promise<void> {
    const balance = await this.provider.getBalance(this.relayerWallet.address);

    if (balance < requiredWei) {
      throw new InsufficientFundsError(
        formatEther(requiredWei),
        formatEther(balance)
      );
    }
  }

  async getGasPrice(): Promise<bigint> {
    const feeData = await this.provider.getFeeData();
    return feeData.gasPrice ?? 5000000000000n; // Default 5000 gwei
  }

  async getNonce(): Promise<number> {
    return this.provider.getTransactionCount(this.relayerWallet.address, "pending");
  }

  async sendTransaction(tx: ethers.TransactionRequest): Promise<ethers.TransactionResponse> {
    // Get current nonce
    const nonce = await this.getNonce();

    // Get gas price
    const gasPrice = await this.getGasPrice();

    // Prepare transaction
    const fullTx: ethers.TransactionRequest = {
      ...tx,
      nonce,
      gasPrice,
      chainId: env.CHAIN_ID,
    };

    logger.debug("Sending transaction", {
      to: fullTx.to,
      value: fullTx.value?.toString(),
      gasLimit: fullTx.gasLimit?.toString(),
      nonce,
    });

    // Sign and send
    const response = await this.relayerWallet.sendTransaction(fullTx);

    logger.info("Transaction sent", {
      txHash: response.hash,
      nonce,
    });

    return response;
  }

  async broadcastRawTransaction(signedTx: string): Promise<ethers.TransactionResponse> {
    logger.debug("Broadcasting raw transaction");
    return this.provider.broadcastTransaction(signedTx);
  }
}

// Singleton instance
export const walletService = new WalletService();
