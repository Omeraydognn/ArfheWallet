import React from "react";
import { Box } from "@mui/material";
import { getAddress } from "ethers";
import { NetworkId } from "../../backend/NetworkTypes.js";

// --- Tab Panel Wrapper ---
export function CustomTabPanel(props: { children: React.ReactNode; index: number; value: number }) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`action-tabpanel-${index}`}
      aria-labelledby={`action-tab-${index}`}
      {...other}
      style={{ width: '100%' }}
    >
      {value === index && <Box sx={{ pt: 1 }}>{children}</Box>}
    </div>
  );
}

// ArfheWallet - Wrapped Token Addresses (Ethereum Sepolia)
export const CONTRACTS_SEPOLIA = {
  "USDC": {
    public: getAddress("0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"),
    shielded: getAddress(import.meta.env.VITE_WRAPPED_USDC_ADDRESS || "0x730Bb4ee9EA1cdB0B45C1DB01cA67a616D2D3C88")
  },
  "ETH": {
    public: getAddress(import.meta.env.VITE_SEPOLIA_WETH_ADDRESS || "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9"),
    shielded: getAddress(import.meta.env.VITE_WRAPPED_ETH_ADDRESS || "0x17CecF8090B945932e2F592168B636F7A0c986e8")
  },
  "LINK": {
    public: getAddress("0x779877A7B0D9E8603169DdbD7836e478b4624789"),
    shielded: getAddress("0x0000000000000000000000000000000000000000")
  }
};

// ArfheWallet - Wrapped Token Addresses (Arbitrum Sepolia)
export const CONTRACTS_ARB_SEPOLIA: Record<string, { public: string; shielded: string }> = {
  "ETH": {
    public: getAddress(import.meta.env.VITE_ARB_SEPOLIA_WETH_ADDRESS || "0x0000000000000000000000000000000000000000"),
    shielded: getAddress(import.meta.env.VITE_ARB_WRAPPED_ETH_ADDRESS || "0x0000000000000000000000000000000000000000")
  },
  "USDC": {
    public: getAddress(import.meta.env.VITE_ARB_SEPOLIA_USDC_ADDRESS || "0x0000000000000000000000000000000000000000"),
    shielded: getAddress(import.meta.env.VITE_ARB_WRAPPED_USDC_ADDRESS || "0x0000000000000000000000000000000000000000")
  }
};

// ArfheWallet - Wrapped Token Addresses (Base Sepolia)
export const CONTRACTS_BASE_SEPOLIA: Record<string, { public: string; shielded: string }> = {
  "ETH": {
    public: getAddress(import.meta.env.VITE_BASE_SEPOLIA_WETH_ADDRESS || "0x0000000000000000000000000000000000000000"),
    shielded: getAddress(import.meta.env.VITE_BASE_WRAPPED_ETH_ADDRESS || "0x0000000000000000000000000000000000000000")
  },
  "USDC": {
    public: getAddress(import.meta.env.VITE_BASE_SEPOLIA_USDC_ADDRESS || "0x0000000000000000000000000000000000000000"),
    shielded: getAddress(import.meta.env.VITE_BASE_WRAPPED_USDC_ADDRESS || "0x0000000000000000000000000000000000000000")
  }
};

// Backward compatible alias
export const CONTRACTS = CONTRACTS_SEPOLIA;

// Get contracts for the active network
export function getContractsForNetwork(networkId: NetworkId) {
  if (networkId === NetworkId.Arbitrum_Sepolia) return CONTRACTS_ARB_SEPOLIA;
  if (networkId === NetworkId.Base_Sepolia) return CONTRACTS_BASE_SEPOLIA;
  return CONTRACTS_SEPOLIA;
}

// Get explorer URL for the active network
export function getExplorerBaseForNetwork(networkId: NetworkId | undefined) {
  switch (networkId) {
    case NetworkId.Ethereum_Mainnet: return "https://etherscan.io";
    case NetworkId.Ethereum_Sepolia: return "https://sepolia.etherscan.io";
    case NetworkId.Arbitrum_One: return "https://arbiscan.io";
    case NetworkId.Arbitrum_Sepolia: return "https://sepolia.arbiscan.io";
    case NetworkId.Base_Mainnet: return "https://basescan.org";
    case NetworkId.Base_Sepolia: return "https://sepolia.basescan.org";
    case NetworkId.Fhenix_Sepolia: return "https://explorer.helium.fhenix.zone";
    default: return "https://etherscan.io";
  }
}

// Shared input card style
export const inputCardSx = {
  p: 1.5,
  borderRadius: 3,
  border: '1px solid',
  borderColor: 'divider',
  bgcolor: 'action.hover',
  transition: 'border-color 0.2s',
  '&:hover': { borderColor: 'primary.main' }
};

// Shared CTA button sx
export const ctaButtonSx = {
  borderRadius: 3,
  height: 42,
  fontWeight: 700,
  fontSize: '0.82rem',
  letterSpacing: '0.02em',
  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)',
  '&:hover': {
    boxShadow: '0 6px 20px rgba(37, 99, 235, 0.4)',
    transform: 'translateY(-1px)',
  },
  transition: 'all 0.2s ease',
};
