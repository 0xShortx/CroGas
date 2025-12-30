# CroGas - Agent Gas Station

> Pay Cronos gas fees with USDC. No CRO required.

**Cronos x x402 Hackathon 2025** | Bringing x402 to Cronos

**Features:** Smart Gas Pricing | Batch Transactions | Auto-Rebalancing | Horizontal Scaling | Web Dashboard

---

## For Judges: Quick Start Guide

### Prerequisites

- Node.js 20+ installed
- Terminal/Command line access

### Step 1: Clone and Install (2 minutes)

```bash
# Clone the repository
git clone https://github.com/0xShortx/CroGas.git
cd CroGas

# Install dependencies
npm install
```

### Step 2: Start the Gas Station Server (30 seconds)

```bash
npm run dev
```

You should see:
```
[info] Agent Gas Station started on port 3000
[info] Relayer wallet: 0xF40B9a42...
[info] CRO Balance: 49.10 CRO
```

**Keep this terminal running!**

### Step 3: Try It - Choose Your Method

#### Option A: Web Dashboard (Recommended for Judges)

Open your browser to **http://localhost:3000**

The interactive dashboard lets you:
1. **Generate a wallet** - Creates a new wallet with 0 CRO
2. **Get 100 USDC** - One-click faucet
3. **Send 1 USDC** - Execute a real gasless transaction!

You'll see the transaction execute on-chain with **0 CRO spent** - proof that the agent paid gas with USDC only.

#### Option B: Quick Demo Script

```bash
npm run demo
```

Automated demo that creates a wallet, gets USDC, and executes a gasless transfer in ~15 seconds.

**Output:**
```
🔥 CroGas Quick Demo

📱 Agent Wallet: 0x7906...
📊 Agent Balances:
   CRO:  0.0 (ZERO!)
   USDC: 100.0

🚀 Sending 1 USDC via CroGas (0 CRO needed!)...

✅ SUCCESS!
   Transaction: 0x058d...
   Explorer: https://explorer.cronos.org/testnet/tx/0x...

📊 Final Balances:
   CRO:  0.0 (STILL ZERO!)
   USDC: 99.99 (paid ~0.01 gas + 1 transfer)

🎉 Demo complete! Agent transacted without CRO!
```

#### Option C: Interactive CLI

```bash
npm run try
```

Step-by-step interactive terminal experience.

### Alternative: Manual Testing with curl

```bash
# 1. Check the server is running
curl http://localhost:3000/health

# 2. Get TestUSDC for any address
curl http://localhost:3000/faucet/0xYourAddressHere

# 3. Check balance
curl http://localhost:3000/faucet/balance/0xYourAddressHere
```

### What's Happening Behind the Scenes?

1. Your agent wallet has **0 CRO** (can't pay gas)
2. Your agent signs a meta-transaction (costs nothing)
3. Gas Station returns HTTP **402 Payment Required**
4. Your agent signs USDC authorization (EIP-3009, costs nothing)
5. Gas Station executes on-chain (pays CRO gas)
6. Gas Station collects USDC payment from your agent
7. Transaction complete - **agent never needed CRO!**

---

## The Problem

AI agents earn revenue in USDC but need CRO to pay gas fees on Cronos:

```
Agent has:  100 USDC
Agent needs: CRO for gas
Agent can't: Swap USDC -> CRO (requires gas!)
Agent is:   STUCK
```

This is the **cold-start problem**. Agents can't do anything without first acquiring native tokens.

## The Solution

Agent Gas Station uses **x402 protocol** and **meta-transactions** to let agents pay gas with USDC:

```
Agent has:     100 USDC
Agent calls:   Gas Station API
Gas Station:   Pays CRO gas, charges USDC
Agent gets:    Transaction executed!
```

**No CRO required. Ever.**

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AGENT GAS STATION FLOW                            │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐         ┌──────────────────┐         ┌──────────────────────┐
│              │         │                  │         │                      │
│   AI Agent   │         │   Gas Station    │         │   Cronos Blockchain  │
│              │         │     Server       │         │                      │
│  ┌────────┐  │         │  ┌────────────┐  │         │  ┌────────────────┐  │
│  │ USDC   │  │         │  │ Relayer    │  │         │  │ MinimalForward │  │
│  │ Wallet │  │         │  │ Wallet     │  │         │  │ er Contract    │  │
│  │ (0 CRO)│  │         │  │ (has CRO)  │  │         │  │ (EIP-2771)     │  │
│  └────────┘  │         │  └────────────┘  │         │  └────────────────┘  │
│              │         │                  │         │                      │
└──────┬───────┘         └────────┬─────────┘         └──────────┬───────────┘
       │                          │                              │
       │  1. Sign meta-tx         │                              │
       │  ─────────────────────►  │                              │
       │                          │                              │
       │  2. HTTP 402 +           │                              │
       │     payment request      │                              │
       │  ◄─────────────────────  │                              │
       │                          │                              │
       │  3. Sign USDC auth       │                              │
       │     (EIP-3009)           │                              │
       │  ─────────────────────►  │                              │
       │                          │                              │
       │                          │  4. Execute meta-tx          │
       │                          │  ─────────────────────────►  │
       │                          │                              │
       │                          │  5. Collect USDC payment     │
       │                          │  ─────────────────────────►  │
       │                          │                              │
       │  6. Return tx hash       │                              │
       │  ◄─────────────────────  │                              │
       │                          │                              │

┌─────────────────────────────────────────────────────────────────────────────┐
│                              PROTOCOLS USED                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  x402       HTTP 402 "Payment Required" for machine-to-machine payments     │
│  EIP-2771   Meta-transactions via trusted forwarder                         │
│  EIP-3009   USDC transferWithAuthorization (gasless transfers)              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Demo

![CroGas Demo](./CroGas-Demo.gif)

*Agent with 0 CRO executes transaction, pays 0.01 USDC*

---

## Features

### Smart Gas Pricing

Choose your transaction speed with three priority tiers:

| Tier | Speed | Price | Best For |
|------|-------|-------|----------|
| Slow | ~30 sec | Lowest | Non-urgent batch jobs |
| Normal | ~10 sec | Standard | Most transactions |
| Fast | ~3 sec | Premium | Time-sensitive trades |

```typescript
// Specify priority in your request
const result = await gas.execute({
  to: "0x...",
  data: "0x...",
  priority: "fast"  // "slow" | "normal" | "fast"
});
```

### Batch Transactions

Execute multiple transactions in a single request and get a **10% discount**:

```typescript
// POST /meta/batch
{
  "requests": [
    { "request": {...}, "signature": "0x..." },
    { "request": {...}, "signature": "0x..." },
    { "request": {...}, "signature": "0x..." }
  ],
  "priority": "normal"
}
```

Perfect for:
- Bulk token approvals
- Multi-step DeFi operations
- Batch NFT mints

### Auto-Rebalancing

The Gas Station automatically maintains its CRO balance by swapping USDC → CRO when needed:

```
┌─────────────────────────────────────────────────────────────┐
│  AUTO-REBALANCE: Self-Sustaining Gas Station                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Agent pays USDC ──► Gas Station collects fees              │
│                              │                              │
│                              ▼                              │
│                    CRO balance < 10?                        │
│                       │          │                          │
│                      YES         NO                         │
│                       │          │                          │
│                       ▼          ▼                          │
│            Swap USDC→CRO    Continue normal                 │
│            via VVS DEX      operations                      │
│                              │                              │
│                              ▼                              │
│                    Gas Station pays CRO                     │
│                    for next transaction                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Configuration:**
- Trigger: CRO balance falls below 10 CRO
- Target: Restore to 50 CRO
- DEX: VVS Finance on Cronos
- Check interval: Every 5 minutes

This makes the Gas Station **fully autonomous** - it never runs out of gas as long as agents keep paying USDC fees!

### Horizontal Scaling (Relayer Pool)

CroGas supports multiple relayer wallets for high-throughput scenarios (1000+ agents):

```
┌─────────────────────────────────────────────────────────────┐
│  RELAYER POOL: Horizontal Scaling                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Agent 1 ────┐                                              │
│  Agent 2 ────┼──► Load Balancer ──┬──► Relayer 1 ──┐        │
│  Agent 3 ────┤   (least-busy)     ├──► Relayer 2 ──┼──► Chain│
│    ...       │                    ├──► Relayer 3 ──┤        │
│  Agent 1000 ─┘                    └──► Relayer N ──┘        │
│                                                             │
│  Each relayer:                                              │
│  • Independent nonce tracking                               │
│  • Parallel transaction submission                          │
│  • Auto-recovery on errors                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Configuration:**
```bash
# Single relayer (default)
RELAYER_PRIVATE_KEY=0x...

# Multiple relayers (comma-separated)
RELAYER_PRIVATE_KEYS=0xkey1...,0xkey2...,0xkey3...
```

**Throughput:**
| Relayers | Transactions/sec | Agents Supported |
|----------|------------------|------------------|
| 1        | ~2 tx/sec        | ~100 agents      |
| 5        | ~10 tx/sec       | ~500 agents      |
| 10       | ~20 tx/sec       | ~1000 agents     |

Pool stats available at `/health` endpoint.

### Web Dashboard

Monitor your Gas Station at `http://localhost:3000/`:

- Relayer CRO balance and USDC earnings
- Live CRO/USD pricing
- Smart pricing display for all tiers
- TestUSDC faucet for testing
- Recent transaction history

---

## For Developers: SDK Integration

### Installation

```bash
npm install @crogas/sdk ethers
```

### Basic Usage

```typescript
import { GasStation } from "@crogas/sdk";
import { Wallet, JsonRpcProvider } from "ethers";

// Your agent's wallet - only needs USDC, no CRO!
const provider = new JsonRpcProvider("https://evm-t3.cronos.org");
const wallet = new Wallet(process.env.AGENT_PRIVATE_KEY, provider);

// Connect to Gas Station
const gas = new GasStation({
  apiUrl: "http://localhost:3000",  // or your deployed URL
  wallet,
  chainId: 338,  // Cronos testnet
});

// Execute ANY transaction - pay with USDC
const result = await gas.execute({
  to: "0x...",       // Target contract address
  data: "0x...",     // Encoded function call
  gasLimit: 100000n,
});

console.log("Transaction:", result.txHash);
console.log("Success:", result.success);
// Your agent paid ~$0.01 USDC, Gas Station paid CRO!
```

### Real-World Example: Token Swap

```typescript
import { Interface, parseUnits } from "ethers";

// VVS Finance Router on Cronos
const VVS_ROUTER = "0x145863Eb42Cf62847A6Ca784e6416C1682b1b2Ae";

// Encode a swap call
const routerInterface = new Interface([
  "function swapExactTokensForTokens(uint256,uint256,address[],address,uint256)"
]);

const swapData = routerInterface.encodeFunctionData("swapExactTokensForTokens", [
  parseUnits("10", 6),           // 10 USDC in
  0,                              // min tokens out
  [USDC_ADDRESS, WCRO_ADDRESS],  // swap path
  wallet.address,                 // recipient
  Date.now() + 3600000           // deadline
]);

// Execute via Gas Station - agent has 0 CRO!
const result = await gas.execute({
  to: VVS_ROUTER,
  data: swapData,
  gasLimit: 300000n,
});

console.log("Swap executed:", result.txHash);
```

---

## API Reference

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Web dashboard |
| `/health` | GET | Health check with wallet balances |
| `/meta/relay` | POST | Execute single meta-transaction |
| `/meta/batch` | POST | Execute multiple meta-transactions (10% discount) |
| `/meta/nonce/:address` | GET | Get signing nonce for address |
| `/meta/domain` | GET | Get EIP-712 domain for signing |
| `/estimate` | GET | Estimate USDC cost (returns all priority tiers) |
| `/faucet/:address` | GET | Get 100 TestUSDC (testnet only) |
| `/faucet/balance/:address` | GET | Check TestUSDC balance |

### POST /meta/relay

Execute a single meta-transaction with optional priority.

**Request:**
```json
{
  "request": {
    "from": "0xAgentAddress",
    "to": "0xTargetContract",
    "value": "0",
    "gas": "100000",
    "nonce": "0",
    "deadline": "1735500000",
    "data": "0x..."
  },
  "signature": "0x...",
  "priority": "normal"  // optional: "slow" | "normal" | "fast"
}
```

**Response (402 Payment Required):**
```json
{
  "error": "Payment Required",
  "x402": {
    "version": "1",
    "accepts": [{
      "scheme": "exact",
      "network": "eip155:338",
      "asset": "0x38Bf87D7281A2F84c8ed5aF1410295f7BD4E20a1",
      "payTo": "0xF40B9a42cD26166051455c23508C2EbA997da7e2",
      "maxAmountRequired": "10000"
    }]
  },
  "quote": {
    "gasEstimate": "100000",
    "priceUSDC": "0.010000",
    "priority": "normal",
    "priorityEmoji": "🚗",
    "estimatedTime": "~10 sec"
  }
}
```

**Success Response (with X-Payment header):**
```json
{
  "success": true,
  "txHash": "0x...",
  "paymentTxHash": "0x...",
  "priority": "normal"
}
```

### POST /meta/batch

Execute multiple meta-transactions with a 10% discount.

**Request:**
```json
{
  "requests": [
    { "request": {...}, "signature": "0x..." },
    { "request": {...}, "signature": "0x..." }
  ],
  "priority": "normal"
}
```

**Response (402 Payment Required):**
```json
{
  "error": "Payment Required",
  "x402": {...},
  "quote": {
    "transactionCount": 2,
    "totalGas": "200000",
    "originalPriceUSDC": "0.020000",
    "discountPercent": 10,
    "priceUSDC": "0.018000"
  }
}
```

### GET /estimate

Get pricing for all priority tiers.

**Response:**
```json
{
  "gasEstimate": "100000",
  "croPrice": 0.15,
  "recommended": "normal",
  "pricing": {
    "slow": { "emoji": "🐢", "label": "Slow", "priceUSDC": "0.005000", "estimatedTime": "~30 sec" },
    "normal": { "emoji": "🚗", "label": "Normal", "priceUSDC": "0.010000", "estimatedTime": "~10 sec" },
    "fast": { "emoji": "🚀", "label": "Fast", "priceUSDC": "0.020000", "estimatedTime": "~3 sec" }
  }
}
```

---

## Deployed Contracts (Cronos Testnet)

| Contract | Address | Purpose |
|----------|---------|---------|
| MinimalForwarder | `0x523D5F604788a9cFC74CcF81F0DE5B3b5623635F` | EIP-2771 meta-tx execution |
| TestUSDC | `0x38Bf87D7281A2F84c8ed5aF1410295f7BD4E20a1` | EIP-3009 gasless transfers |
| Relayer Wallet | `0xF40B9a42cD26166051455c23508C2EbA997da7e2` | Pays CRO gas fees |

---

## Project Structure

```
crogas/
├── src/
│   ├── api/                      # Express route controllers
│   │   ├── meta.controller.ts    # Meta-transaction relay + batch
│   │   ├── faucet.controller.ts  # TestUSDC faucet
│   │   ├── health.controller.ts  # Health checks
│   │   └── estimate.controller.ts # Smart pricing tiers
│   ├── services/
│   │   ├── forwarder.service.ts  # EIP-2771 execution
│   │   ├── payment.service.ts    # x402 + EIP-3009
│   │   ├── pricing.service.ts    # Smart gas pricing
│   │   └── wallet.service.ts     # Relayer wallet
│   ├── middleware/
│   │   └── x402.middleware.ts    # Payment verification
│   ├── client/
│   │   └── GasStationClient.ts   # TypeScript SDK
│   └── config/
│       └── env.ts                # Environment config
├── public/
│   └── index.html                # Web dashboard
├── contracts/                    # Solidity contracts
├── cli/
│   ├── demo.ts                   # Full interactive demo
│   └── try-it.ts                 # Quick judge demo
├── scripts/
│   ├── deploy-forwarder.ts       # Deploy Forwarder
│   ├── deploy-usdc.ts            # Deploy TestUSDC
│   └── test-e2e.ts               # End-to-end test
└── src/__tests__/                # Unit tests (40 tests)
```

---

## Scripts Reference

| Command | Description |
|---------|-------------|
| `npm run dev` | Start server + dashboard at http://localhost:3000 |
| `npm run demo` | Quick automated demo (~15 sec) |
| `npm run try` | Interactive CLI demo |
| `npm run test:e2e` | Full end-to-end SDK test |
| `npm run test` | Run unit tests |
| `npm run build` | Build for production |

---

## Why x402 Protocol?

The [x402 protocol](https://www.x402.org/) enables machine-to-machine payments using HTTP 402 "Payment Required":

- **No accounts needed** - Just a crypto wallet
- **No prepayment** - Pay per transaction
- **Programmable** - Agents decide when/what to pay
- **Interoperable** - Standard HTTP protocol

Perfect for AI agents that need to pay for services autonomously.

### x402 on Cronos (Our Contribution)

The official `@coinbase/x402` SDK only supports Base, Ethereum, Solana, and Arbitrum.

**CroGas brings x402 to Cronos** by implementing:
- x402 protocol flow (HTTP 402 → payment → fulfillment)
- EIP-3009 `transferWithAuthorization` for gasless USDC transfers
- EIP-2771 meta-transactions via MinimalForwarder
- Custom payment verification for Cronos chain

This is the **first x402-compatible service on Cronos**.

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Server | Express.js + TypeScript |
| Blockchain | ethers.js v6 |
| Contracts | Solidity 0.8.20 |
| Meta-tx | EIP-2771 (MinimalForwarder) |
| Payments | EIP-3009 (transferWithAuthorization) |
| Protocol | x402 (HTTP 402) |
| Chain | Cronos (EVM-compatible) |
| Testing | Vitest (40 unit tests) |

---

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Required
RELAYER_PRIVATE_KEY=0x...     # Wallet that pays CRO gas (needs CRO!)

# Pre-configured for Cronos Testnet
CRONOS_RPC_URL=https://evm-t3.cronos.org/
CHAIN_ID=338
USDC_ADDRESS=0x38Bf87D7281A2F84c8ed5aF1410295f7BD4E20a1
FORWARDER_ADDRESS=0x523D5F604788a9cFC74CcF81F0DE5B3b5623635F
```

---

## Links

- [x402 Protocol](https://x402.org) - HTTP 402 payment standard
- [Cronos Docs](https://docs.cronos.org) - Cronos blockchain
- [EIP-3009](https://eips.ethereum.org/EIPS/eip-3009) - Transfer With Authorization
- [EIP-2771](https://eips.ethereum.org/EIPS/eip-2771) - Meta Transactions

---

## License

MIT

---

Built by **Klyntos** for Cronos x x402 Hackathon 2025
