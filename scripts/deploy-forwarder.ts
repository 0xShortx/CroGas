/**
 * Deploy MinimalForwarder contract for meta-transactions
 * Based on EIP-2771 Trusted Forwarder pattern
 */

import { ethers, ContractFactory } from "ethers";
import { writeFileSync } from "fs";
import path from "path";
import solc from "solc";

const CRONOS_TESTNET_RPC = "https://evm-t3.cronos.org/";
const PRIVATE_KEY = "0xd6e09f02d1698fae4cc2f4a561ee62b06d15d895bb418da8c6a126118020b64e";

// Minimal Forwarder contract - executes calls on behalf of signer
const CONTRACT_SOURCE = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MinimalForwarder
 * @dev Executes meta-transactions on behalf of signers
 * Allows agents without native tokens to execute transactions
 */
contract MinimalForwarder {
    struct ForwardRequest {
        address from;      // Original signer (agent)
        address to;        // Target contract
        uint256 value;     // ETH/CRO value
        uint256 gas;       // Gas limit
        uint256 nonce;     // Replay protection
        uint256 deadline;  // Expiration timestamp
        bytes data;        // Calldata
    }

    bytes32 public constant TYPEHASH = keccak256(
        "ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,uint256 deadline,bytes data)"
    );

    bytes32 public DOMAIN_SEPARATOR;
    mapping(address => uint256) public nonces;

    event Executed(address indexed from, address indexed to, bool success, bytes result);

    constructor() {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("MinimalForwarder")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    function getNonce(address from) external view returns (uint256) {
        return nonces[from];
    }

    function verify(ForwardRequest calldata req, bytes calldata signature) public view returns (bool) {
        bytes32 structHash = keccak256(
            abi.encode(TYPEHASH, req.from, req.to, req.value, req.gas, req.nonce, req.deadline, keccak256(req.data))
        );
        bytes32 digest = keccak256(abi.encodePacked("\\x19\\x01", DOMAIN_SEPARATOR, structHash));

        (bytes32 r, bytes32 s, uint8 v) = splitSignature(signature);
        address signer = ecrecover(digest, v, r, s);

        return signer == req.from &&
               nonces[req.from] == req.nonce &&
               block.timestamp <= req.deadline;
    }

    function execute(ForwardRequest calldata req, bytes calldata signature)
        external
        payable
        returns (bool success, bytes memory result)
    {
        require(verify(req, signature), "Invalid signature or request");

        nonces[req.from]++;

        // Execute the call
        (success, result) = req.to.call{gas: req.gas, value: req.value}(
            abi.encodePacked(req.data, req.from) // Append original sender for EIP-2771
        );

        emit Executed(req.from, req.to, success, result);

        // Refund remaining gas value
        if (address(this).balance > 0) {
            payable(msg.sender).transfer(address(this).balance);
        }
    }

    function splitSignature(bytes memory sig) internal pure returns (bytes32 r, bytes32 s, uint8 v) {
        require(sig.length == 65, "Invalid signature length");
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
    }

    receive() external payable {}
}
`;

async function compile() {
  console.log("Compiling MinimalForwarder...");

  const input = {
    language: "Solidity",
    sources: { "MinimalForwarder.sol": { content: CONTRACT_SOURCE } },
    settings: {
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
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

  const contract = output.contracts["MinimalForwarder.sol"]["MinimalForwarder"];
  return { abi: contract.abi, bytecode: "0x" + contract.evm.bytecode.object };
}

async function deploy() {
  const { abi, bytecode } = await compile();
  console.log("Compilation successful!");

  const provider = new ethers.JsonRpcProvider(CRONOS_TESTNET_RPC);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log("Deployer:", wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "CRO");

  console.log("\nDeploying MinimalForwarder...");
  const factory = new ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy();

  console.log("Tx hash:", contract.deploymentTransaction()?.hash);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("\n" + "=".repeat(50));
  console.log("MinimalForwarder deployed to:", address);
  console.log("=".repeat(50));

  // Save ABI
  writeFileSync(
    path.join(process.cwd(), "src/config/Forwarder.abi.json"),
    JSON.stringify(abi, null, 2)
  );
  console.log("\nABI saved to src/config/Forwarder.abi.json");

  console.log("\n📋 Add to your .env:");
  console.log(`FORWARDER_ADDRESS=${address}`);

  return address;
}

deploy()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
