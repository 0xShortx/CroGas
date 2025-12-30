/**
 * Agent Gas Station Client SDK
 *
 * Enables AI agents to relay transactions on Cronos
 * by paying gas fees with USDC via x402 protocol.
 *
 * Uses meta-transactions (EIP-2771) so agents don't need native tokens.
 */

import { ethers, Wallet } from "ethers";

export interface GasStationConfig {
  apiUrl: string;
  wallet: Wallet;
  usdcAddress: string;
  chainId: number;
}

export interface RelayResult {
  success: boolean;
  txHash: string;
  paymentTxHash?: string;
  result?: string;
}

export interface PriceQuote {
  gasEstimate: string;
  gasPriceGwei: string;
  croPrice: number;
  priceUSDC: string;
  validUntil: string;
}

interface ForwardRequest {
  from: string;
  to: string;
  value: string;
  gas: string;
  nonce: string;
  deadline: string;
  data: string;
}

interface MetaDomain {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  };
  types: {
    ForwardRequest: Array<{ name: string; type: string }>;
  };
  forwarderAddress: string;
}

interface X402Response {
  error: string;
  x402: {
    version: number;
    accepts: Array<{
      scheme: string;
      network: string;
      asset: string;
      payTo: string;
      maxAmountRequired: string;
    }>;
  };
  quote: PriceQuote;
}

export class GasStationClient {
  private config: GasStationConfig;
  private metaDomain: MetaDomain | null = null;

  constructor(config: GasStationConfig) {
    this.config = config;
  }

  /**
   * Get meta-transaction domain info (cached)
   */
  private async getMetaDomain(): Promise<MetaDomain> {
    if (!this.metaDomain) {
      const response = await fetch(`${this.config.apiUrl}/meta/domain`);
      if (!response.ok) throw new Error("Failed to fetch meta domain");
      this.metaDomain = (await response.json()) as MetaDomain;
    }
    return this.metaDomain!;
  }

  /**
   * Get current nonce for meta-transactions
   */
  async getNonce(): Promise<string> {
    const response = await fetch(
      `${this.config.apiUrl}/meta/nonce/${this.config.wallet.address}`
    );
    if (!response.ok) throw new Error("Failed to fetch nonce");
    const data = (await response.json()) as { nonce: string };
    return data.nonce;
  }

  /**
   * Get estimated price for a transaction
   */
  async estimate(to: string, data: string = "0x", value: string = "0"): Promise<PriceQuote> {
    const url = new URL("/estimate", this.config.apiUrl);
    url.searchParams.set("to", to);
    url.searchParams.set("data", data);
    url.searchParams.set("value", value);

    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`Estimate failed: ${response.statusText}`);
    return (await response.json()) as PriceQuote;
  }

  /**
   * Execute a transaction through the Gas Station
   * Agent signs a meta-transaction, pays with USDC
   */
  async execute(params: {
    to: string;
    data?: string;
    value?: bigint;
    gasLimit?: bigint;
  }): Promise<RelayResult> {
    // Build meta-transaction request
    const request = await this.buildRequest(params);

    // Sign it
    const signature = await this.signRequest(request);

    // Submit to gas station
    return this.submitMetaTransaction(request, signature);
  }

  /**
   * Build a ForwardRequest
   */
  private async buildRequest(params: {
    to: string;
    data?: string;
    value?: bigint;
    gasLimit?: bigint;
  }): Promise<ForwardRequest> {
    const nonce = await this.getNonce();
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour

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

  /**
   * Sign a ForwardRequest using EIP-712
   */
  private async signRequest(request: ForwardRequest): Promise<string> {
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

  /**
   * Submit meta-transaction with x402 payment
   */
  private async submitMetaTransaction(
    request: ForwardRequest,
    signature: string
  ): Promise<RelayResult> {
    // Step 1: Submit to get 402 response
    const initialResponse = await fetch(`${this.config.apiUrl}/meta/relay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request, signature }),
    });

    if (initialResponse.status !== 402) {
      if (initialResponse.ok) return (await initialResponse.json()) as RelayResult;
      const error = (await initialResponse.json()) as { message?: string; error?: string };
      throw new Error(error.message || error.error || "Unknown error");
    }

    // Step 2: Parse 402 and prepare payment
    const x402Response = (await initialResponse.json()) as X402Response;
    const paymentInfo = x402Response.x402.accepts[0];

    console.log(`Payment required: ${x402Response.quote.priceUSDC} USDC`);

    // Step 3: Create USDC authorization (EIP-3009)
    const authorization = this.createUsdcAuthorization(
      paymentInfo.payTo,
      BigInt(paymentInfo.maxAmountRequired)
    );

    // Step 4: Sign USDC authorization
    const usdcSignature = await this.signUsdcAuthorization(authorization);

    // Step 5: Create x402 payment header
    const paymentHeader = this.createPaymentHeader(authorization, usdcSignature, paymentInfo);

    // Step 6: Retry with payment
    const paidResponse = await fetch(`${this.config.apiUrl}/meta/relay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Payment": paymentHeader,
      },
      body: JSON.stringify({ request, signature }),
    });

    if (!paidResponse.ok) {
      const error = (await paidResponse.json()) as { message?: string; error?: string };
      throw new Error(error.message || error.error || "Unknown error");
    }

    return (await paidResponse.json()) as RelayResult;
  }

  /**
   * Create EIP-3009 USDC transfer authorization
   */
  private createUsdcAuthorization(to: string, value: bigint) {
    const validAfter = Math.floor(Date.now() / 1000) - 60;
    const validBefore = Math.floor(Date.now() / 1000) + 3600;
    const nonce = ethers.hexlify(ethers.randomBytes(32));

    return {
      from: this.config.wallet.address,
      to,
      value: value.toString(),
      validAfter: validAfter.toString(),
      validBefore: validBefore.toString(),
      nonce,
    };
  }

  /**
   * Sign USDC authorization using EIP-712
   */
  private async signUsdcAuthorization(authorization: {
    from: string;
    to: string;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: string;
  }): Promise<string> {
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
      from: authorization.from,
      to: authorization.to,
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
      nonce: authorization.nonce,
    };

    return this.config.wallet.signTypedData(domain, types, value);
  }

  /**
   * Create base64-encoded x402 payment header
   */
  private createPaymentHeader(
    authorization: {
      from: string;
      to: string;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: string;
    },
    signature: string,
    paymentInfo: { network: string }
  ): string {
    const payment = {
      version: 1,
      scheme: "exact",
      network: paymentInfo.network,
      payload: { signature, authorization },
    };
    return Buffer.from(JSON.stringify(payment)).toString("base64");
  }
}

export function createGasStationClient(config: GasStationConfig): GasStationClient {
  return new GasStationClient(config);
}
