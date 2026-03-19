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

// Get explorer URL for the active network — accepts the full Network object
// so custom networks can return their own configured explorer_url.
export function getExplorerBaseForNetwork(networkOrId: { network_id?: NetworkId; explorer_url?: string; isCustom?: boolean } | NetworkId | undefined) {
  // If a full Network object is passed and it's a custom network with its own URL, use it
  if (networkOrId && typeof networkOrId === 'object') {
    if (networkOrId.isCustom && networkOrId.explorer_url) return networkOrId.explorer_url.replace(/\/+$/, '');
    const networkId = networkOrId.network_id;
    switch (networkId) {
      case NetworkId.Ethereum_Sepolia: return "https://sepolia.etherscan.io";
      case NetworkId.Arbitrum_Sepolia: return "https://sepolia.arbiscan.io";
      case NetworkId.Base_Sepolia: return "https://sepolia.basescan.org";
      case NetworkId.Monad_Testnet: return "https://testnet.monadexplorer.com";
      case NetworkId.Avalanche_Fuji: return "https://testnet.snowtrace.io";
      default:
        // For other built-in or unknown networks, fall back to their explorer_url if set
        if (networkOrId.explorer_url) return networkOrId.explorer_url.replace(/\/+$/, '');
        return "https://sepolia.etherscan.io";
    }
  }
  // Legacy: called with just a NetworkId enum value
  switch (networkOrId as NetworkId) {
    case NetworkId.Ethereum_Sepolia: return "https://sepolia.etherscan.io";
    case NetworkId.Arbitrum_Sepolia: return "https://sepolia.arbiscan.io";
    case NetworkId.Base_Sepolia: return "https://sepolia.basescan.org";
    case NetworkId.Monad_Testnet: return "https://testnet.monadexplorer.com";
    case NetworkId.Avalanche_Fuji: return "https://testnet.snowtrace.io";
    default: return "https://sepolia.etherscan.io";
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
