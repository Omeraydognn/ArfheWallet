const hre = require("hardhat");

async function main() {
    // Arbitrum Sepolia WETH address (wrapped native ETH on Arb Sepolia)
    const WETH_ADDRESS = "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73";

    // Arbitrum Sepolia USDC address (Circle official testnet USDC)
    const USDC_ADDRESS = "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d";

    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying FHE contracts to Arbitrum Sepolia with account:", deployer.address);
    console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

    // Deploy WrappedETH_V4
    console.log("\n--- Deploying WrappedETH_V4 (cETH) for Arbitrum Sepolia ---");
    const WrappedETH = await hre.ethers.getContractFactory("WrappedETH_V4");
    const wrappedETH = await WrappedETH.deploy(WETH_ADDRESS);
    await wrappedETH.waitForDeployment();
    const ethAddress = await wrappedETH.getAddress();
    console.log("✅ WrappedETH_V4 deployed to:", ethAddress);

    // Deploy WrappedUSDC_V3
    console.log("\n--- Deploying WrappedUSDC_V3 (cUSDC) for Arbitrum Sepolia ---");
    const WrappedUSDC = await hre.ethers.getContractFactory("WrappedUSDC_V3");
    const wrappedUSDC = await WrappedUSDC.deploy(USDC_ADDRESS);
    await wrappedUSDC.waitForDeployment();
    const usdcAddress = await wrappedUSDC.getAddress();
    console.log("✅ WrappedUSDC_V3 deployed to:", usdcAddress);

    // Summary
    console.log("\n========================================");
    console.log("ARBITRUM SEPOLIA DEPLOYMENT COMPLETE!");
    console.log("========================================");
    console.log(`VITE_ARB_WRAPPED_ETH_ADDRESS=${ethAddress}`);
    console.log(`VITE_ARB_WRAPPED_USDC_ADDRESS=${usdcAddress}`);
    console.log(`VITE_ARB_SEPOLIA_WETH_ADDRESS=${WETH_ADDRESS}`);
    console.log(`VITE_ARB_SEPOLIA_USDC_ADDRESS=${USDC_ADDRESS}`);
    console.log("========================================");
    console.log("\nUpdate .env with these addresses!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
