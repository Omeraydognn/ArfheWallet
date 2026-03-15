const hre = require("hardhat");

async function main() {
  // Sepolia WETH address
  const WETH_ADDRESS = "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9";
  
  // Sepolia USDC address
  const USDC_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

  // Deploy WrappedETH_V4
  console.log("\n--- Deploying WrappedETH_V4 (cETH) ---");
  const WrappedETH = await hre.ethers.getContractFactory("WrappedETH_V4");
  const wrappedETH = await WrappedETH.deploy(WETH_ADDRESS);
  await wrappedETH.waitForDeployment();
  const ethAddress = await wrappedETH.getAddress();
  console.log("✅ WrappedETH_V4 deployed to:", ethAddress);

  // Deploy WrappedUSDC_V3
  console.log("\n--- Deploying WrappedUSDC_V3 (cUSDC) ---");
  const WrappedUSDC = await hre.ethers.getContractFactory("WrappedUSDC_V3");
  const wrappedUSDC = await WrappedUSDC.deploy(USDC_ADDRESS);
  await wrappedUSDC.waitForDeployment();
  const usdcAddress = await wrappedUSDC.getAddress();
  console.log("✅ WrappedUSDC_V3 deployed to:", usdcAddress);

  // Summary
  console.log("\n========================================");
  console.log("DEPLOYMENT COMPLETE!");
  console.log("========================================");
  console.log(`VITE_WRAPPED_ETH_ADDRESS=${ethAddress}`);
  console.log(`VITE_WRAPPED_USDC_ADDRESS=${usdcAddress}`);
  console.log("========================================");
  console.log("\nUpdate .env with these addresses!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
