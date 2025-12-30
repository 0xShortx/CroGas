/**
 * @crogas/sdk - Agent Gas Station SDK
 *
 * Pay Cronos gas fees with USDC via x402 protocol.
 * No CRO required for your AI agents!
 *
 * @example
 * ```typescript
 * import { GasStation } from "@crogas/sdk";
 *
 * const gas = new GasStation({
 *   apiUrl: "https://gas.crogas.io",
 *   wallet: myAgentWallet,
 *   chainId: 25,
 * });
 *
 * const result = await gas.execute({
 *   to: "0x...",
 *   data: "0x...",
 * });
 * ```
 */

import { ethers, Wallet, JsonRpcProvider } from "ethers";

// ============================================================================
// Types
// ============================================================================

export interface GasStationConfig {
  /** Gas Station API URL (e.g., https://gas.crogas.io) */
  apiUrl: string;
  /** Agent's wallet with USDC */
  wallet: Wallet;
  /** Chain ID (25 for Cronos mainnet, 338 for testnet) */
  chainId: number;
  /** USDC contract address (optional, defaults based on chainId) */
  usdcAddress?: string;
}

export interface ExecuteParams {
  /** Target contract address */
  to: string;
  /** Calldata */
  data?: string;
  /** Value in wei (for payable functions) */
  value?: bigint;
  /** Gas limit (default: 100000) */
  gasLimit?: bigint;
}

export interface ExecuteResult {
  /** Whether the inner call succeeded */
  success: boolean;
  /** Forwarder transaction hash */
  txHash: string;
  /** USDC payment transaction hash */
  paymentTxHash?: string;
  /** Return data from the call */
  result?: string;
}

export interface Estimate {
  /** Estimated gas units */
  gasEstimate: string;
  /** Gas price in gwei */
  gasPriceGwei: string;
  /** CRO/USD price */
  croPrice: number;
  /** Final price in USDC */
  priceUSDC: string;
}

// ============================================================================
// Constants
// ============================================================================

const USDC_ADDRESSES: Record<number, string> = {
  25: "0xc21223249CA28397B4B6541dfFaEcC539BfF0c59", // Cronos mainnet
  338: "0x38Bf87D7281A2F84c8ed5aF1410295f7BD4E20a1", // Cronos testnet
};

// ============================================================================
// GasStation Class
// ============================================================================

export class GasStation {
  private config: Required<GasStationConfig>;
  private metaDomain: any = null;

  constructor(config: GasStationConfig) {
    const usdcAddress = config.usdcAddress || USDC_ADDRESSES[config.chainId];
    if (!usdcAddress) {
      throw new Error(`No USDC address for chainId ${config.chainId}. Please provide usdcAddress.`);
    }

    this.config = {
      ...config,
      usdcAddress,
    };
  }

  /**
   * Get estimated price for a transaction
   */
  async estimate(to: string, data: string = "0x"): Promise<Estimate> {
    const url = new URL("/estimate", this.config.apiUrl);
    url.searchParams.set("to", to);
    url.searchParams.set("data", data);

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Estimate failed: ${response.statusText}`);
    }
    return response.json() as Promise<Estimate>;
  }

  /**
   * Execute a transaction through the Gas Station
   * Agent signs meta-transaction and pays with USDC
   */
  async execute(params: ExecuteParams): Promise<ExecuteResult> {
    const request = await this.buildRequest(params);
    const signature = await this.signRequest(request);
    return this.submitWithPayment(request, signature);
  }

  /**
   * Get current nonce for meta-transactions
   */
  async getNonce(): Promise<string> {
    const response = await fetch(
      `${this.config.apiUrl}/meta/nonce/${this.config.wallet.address}`
    );
    if (!response.ok) throw new Error("Failed to fetch nonce");
    const data = await response.json() as { nonce: string };
    return data.nonce;
  }

  // Private methods

  private async getMetaDomain() {
    if (!this.metaDomain) {
      const response = await fetch(`${this.config.apiUrl}/meta/domain`);
      if (!response.ok) throw new Error("Failed to fetch domain");
      this.metaDomain = await response.json();
    }
    return this.metaDomain;
  }

  private async buildRequest(params: ExecuteParams) {
    const nonce = await this.getNonce();
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    return {
      from: this.config.wallet.address,
      to: params.to,
      value: (params.value ?? 0n).toString(),
      gas: (params.gasLimit ?? 100000n).toString(),
      nonce,
      deadline: deadline.toString(),
      data: params.data ?? "0x",
    };
  }

  private async signRequest(request: any): Promise<string> {
    const { domain, types } = await this.getMetaDomain();
    const value = {
      from: request.from,
      to: request.to,
      value: BigInt(request.value),
      gas: BigInt(request.gas),
      nonce: BigInt(request.nonce),
      deadline: BigInt(request.deadline),
      data: request.data,
    };
    return this.config.wallet.signTypedData(domain, types, value);
  }

  private async submitWithPayment(request: any, signature: string): Promise<ExecuteResult> {
    // First request to get 402
    const initialResponse = await fetch(`${this.config.apiUrl}/meta/relay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request, signature }),
    });

    if (initialResponse.status !== 402) {
      if (initialResponse.ok) return initialResponse.json() as Promise<ExecuteResult>;
      const error = await initialResponse.json() as { message?: string; error?: string };
      throw new Error(error.message || error.error || "Unknown error");
    }

    // Parse 402 and prepare payment
    const x402Response = await initialResponse.json() as {
      x402: { accepts: Array<{ payTo: string; maxAmountRequired: string; network: string }> };
    };
    const paymentInfo = x402Response.x402.accepts[0];

    // Create and sign USDC authorization
    const authorization = this.createUsdcAuth(paymentInfo.payTo, BigInt(paymentInfo.maxAmountRequired));
    const usdcSig = await this.signUsdcAuth(authorization);
    const paymentHeader = this.encodePayment(authorization, usdcSig, paymentInfo.network);

    // Retry with payment
    const paidResponse = await fetch(`${this.config.apiUrl}/meta/relay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Payment": paymentHeader,
      },
      body: JSON.stringify({ request, signature }),
    });

    if (!paidResponse.ok) {
      const error = await paidResponse.json() as { message?: string; error?: string };
      throw new Error(error.message || error.error || "Unknown error");
    }

    return paidResponse.json() as Promise<ExecuteResult>;
  }

  private createUsdcAuth(to: string, value: bigint) {
    return {
      from: this.config.wallet.address,
      to,
      value: value.toString(),
      validAfter: (Math.floor(Date.now() / 1000) - 60).toString(),
      validBefore: (Math.floor(Date.now() / 1000) + 3600).toString(),
      nonce: ethers.hexlify(ethers.randomBytes(32)),
    };
  }

  private async signUsdcAuth(auth: any): Promise<string> {
    const domain = {
      name: "Test USDC",
      version: "1",
      chainId: this.config.chainId,
      verifyingContract: this.config.usdcAddress,
    };
    const types = {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    };
    const value = {
      from: auth.from,
      to: auth.to,
      value: BigInt(auth.value),
      validAfter: BigInt(auth.validAfter),
      validBefore: BigInt(auth.validBefore),
      nonce: auth.nonce,
    };
    return this.config.wallet.signTypedData(domain, types, value);
  }

  private encodePayment(auth: any, sig: string, network: string): string {
    return Buffer.from(JSON.stringify({
      version: 1,
      scheme: "exact",
      network,
      payload: { signature: sig, authorization: auth },
    })).toString("base64");
  }
}

// Default export
export default GasStation;
