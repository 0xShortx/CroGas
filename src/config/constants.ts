// Cronos Network Constants

export const CRONOS_MAINNET = {
  chainId: 25,
  name: "Cronos Mainnet",
  rpcUrl: "https://evm.cronos.org/",
  explorer: "https://cronoscan.com/",
  blockTime: 5000, // ~5 seconds
  usdc: "0xc21223249CA28397B4B6541dfFaEcC539BfF0c59", // Native USDC
  wcro: "0x5C7F8A570d578ED84E63fdFA7b1eE72dEae1AE23",
  vvsRouter: "0x145863Eb42Cf62847A6Ca784e6416C1682b1b2Ae",
} as const;

export const CRONOS_TESTNET = {
  chainId: 338,
  name: "Cronos Testnet",
  rpcUrl: "https://evm-t3.cronos.org/",
  explorer: "https://explorer.cronos.org/testnet/",
  blockTime: 5000,
  usdc: "0x...", // Bridged USDC (Stargate) - TBD
  wcro: "0x6a3173618859C7cd40fAF6921b5E9eB6A76f1fD4",
  vvsRouter: "0x145677FC4d9b8F19B5D56d1820c48e0443049a30",
} as const;

export type NetworkConfig = typeof CRONOS_MAINNET | typeof CRONOS_TESTNET;

export const NETWORKS: Record<number, NetworkConfig> = {
  25: CRONOS_MAINNET,
  338: CRONOS_TESTNET,
};

// Gas Constants
export const GAS_LIMITS = {
  SIMPLE_TRANSFER: 21000n,
  ERC20_TRANSFER: 65000n,
  SWAP: 250000n,
  CONTRACT_DEPLOY: 1000000n,
  DEFAULT_MAX: 500000n,
} as const;

// Pricing Constants
export const PRICING = {
  DEFAULT_MARKUP: 1.2, // 20% markup
  MIN_PRICE_USDC: 0.01,
  MAX_PRICE_USDC: 10.0,
  QUOTE_VALIDITY_SECONDS: 60,
} as const;

// x402 Constants
export const X402 = {
  VERSION: 1,
  SCHEME: "exact",
  NETWORK_PREFIX: "eip155",
} as const;

// ERC20 ABI (minimal for transfers)
export const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
] as const;

// USDC with EIP-3009 support
export const USDC_EIP3009_ABI = [
  ...ERC20_ABI,
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
  "function receiveWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
  "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
] as const;
