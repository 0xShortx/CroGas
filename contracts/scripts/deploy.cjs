const hre = require("hardhat");

async function main() {
  console.log("Deploying TestUSDC to Cronos Testnet...");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "CRO");

  const TestUSDC = await hre.ethers.getContractFactory("TestUSDC");
  const usdc = await TestUSDC.deploy();
  await usdc.waitForDeployment();

  const address = await usdc.getAddress();
  console.log("\n=================================");
  console.log("TestUSDC deployed to:", address);
  console.log("=================================\n");

  // Verify deployment
  const name = await usdc.name();
  const symbol = await usdc.symbol();
  const decimals = await usdc.decimals();
  const totalSupply = await usdc.totalSupply();

  console.log("Token Name:", name);
  console.log("Token Symbol:", symbol);
  console.log("Decimals:", decimals);
  console.log("Total Supply:", hre.ethers.formatUnits(totalSupply, decimals), symbol);

  // Output for .env update
  console.log("\n📋 Add to your .env:");
  console.log(`USDC_ADDRESS=${address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
