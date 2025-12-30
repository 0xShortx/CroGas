/**
 * Deploy TestUSDC with EIP-3009 support to Cronos Testnet
 * Uses ethers.js directly (no Hardhat required)
 */

import { ethers, ContractFactory } from "ethers";
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import solc from "solc";

const CRONOS_TESTNET_RPC = "https://evm-t3.cronos.org/";
const PRIVATE_KEY = "0xd6e09f02d1698fae4cc2f4a561ee62b06d15d895bb418da8c6a126118020b64e";

// Simplified TestUSDC contract (inline for easier deployment)
const CONTRACT_SOURCE = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract TestUSDC {
    string public name = "Test USDC";
    string public symbol = "tUSDC";
    uint8 public decimals = 6;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => mapping(bytes32 => bool)) public authorizationState;

    bytes32 public DOMAIN_SEPARATOR;
    bytes32 public constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH =
        keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);

    constructor() {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
        // Mint 1M to deployer
        _mint(msg.sender, 1_000_000 * 10**6);
    }

    function _mint(address to, uint256 amount) internal {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }

    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(block.timestamp > validAfter, "Not yet valid");
        require(block.timestamp < validBefore, "Expired");
        require(!authorizationState[from][nonce], "Already used");

        bytes32 structHash = keccak256(abi.encode(
            TRANSFER_WITH_AUTHORIZATION_TYPEHASH,
            from, to, value, validAfter, validBefore, nonce
        ));
        bytes32 digest = keccak256(abi.encodePacked("\\x19\\x01", DOMAIN_SEPARATOR, structHash));
        address signer = ecrecover(digest, v, r, s);
        require(signer == from, "Invalid signature");

        authorizationState[from][nonce] = true;
        emit AuthorizationUsed(from, nonce);

        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }
}
`;

async function compile() {
  console.log("Compiling TestUSDC...");

  const input = {
    language: "Solidity",
    sources: {
      "TestUSDC.sol": { content: CONTRACT_SOURCE }
    },
    settings: {
      outputSelection: {
        "*": { "*": ["abi", "evm.bytecode.object"] }
      },
      optimizer: { enabled: true, runs: 200 }
    }
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  if (output.errors) {
    const errors = output.errors.filter((e: any) => e.severity === "error");
    if (errors.length > 0) {
      console.error("Compilation errors:", errors);
      throw new Error("Compilation failed");
    }
  }

  const contract = output.contracts["TestUSDC.sol"]["TestUSDC"];
  return {
    abi: contract.abi,
    bytecode: "0x" + contract.evm.bytecode.object
  };
}

async function deploy() {
  // Compile
  const { abi, bytecode } = await compile();
  console.log("Compilation successful!");

  // Connect to Cronos Testnet
  const provider = new ethers.JsonRpcProvider(CRONOS_TESTNET_RPC);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log("Deployer:", wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "CRO");

  // Deploy
  console.log("\nDeploying TestUSDC...");
  const factory = new ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy();

  console.log("Tx hash:", contract.deploymentTransaction()?.hash);
  console.log("Waiting for confirmation...");

  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log("\n" + "=".repeat(50));
  console.log("TestUSDC deployed to:", address);
  console.log("=".repeat(50));

  // Verify
  const name = await contract.name();
  const symbol = await contract.symbol();
  const supply = await contract.totalSupply();
  console.log(`\nToken: ${name} (${symbol})`);
  console.log(`Total Supply: ${ethers.formatUnits(supply, 6)} ${symbol}`);

  // Save ABI for later use
  writeFileSync(
    path.join(process.cwd(), "src/config/TestUSDC.abi.json"),
    JSON.stringify(abi, null, 2)
  );
  console.log("\nABI saved to src/config/TestUSDC.abi.json");

  console.log("\n📋 Update your .env:");
  console.log(`USDC_ADDRESS=${address}`);

  return address;
}

deploy()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
