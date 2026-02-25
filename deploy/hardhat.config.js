require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: "../.env" });

// Extract API keys from Alchemy URLs
const alchemyUrl = process.env.VITE_ALCHEMY_SEPOLIA_API_KEY || "";
const alchemyArbSepoliaUrl = process.env.VITE_ALCHEMY_ARBSEPOLIA_API_KEY || "";

// Private key for deployment - set this in .env as DEPLOYER_PRIVATE_KEY
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000001";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.25",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "cancun",
    },
  },
  networks: {
    sepolia: {
      url: alchemyUrl,
      accounts: [DEPLOYER_PRIVATE_KEY],
      chainId: 11155111,
    },
    arbitrumSepolia: {
      url: alchemyArbSepoliaUrl,
      accounts: [DEPLOYER_PRIVATE_KEY],
      chainId: 421614,
    },
  },
  paths: {
    sources: "./contracts",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
