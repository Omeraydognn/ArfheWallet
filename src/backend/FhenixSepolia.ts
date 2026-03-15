import { Network } from "./Network.js";
import { NetworkId } from "./NetworkTypes.js";

/**
 * Fhenix Helium Testnet Network
 * 
 * Chain ID: 8008135
 * RPC: https://api.helium.fhenix.zone (from Chainlist)
 * Explorer: https://explorer.helium.fhenix.zone
 * Native Token: tFHE (testnet FHE)
 * Faucet: https://get-helium.fhenix.zone
 * 
 * Official Fhenix Helium testnet for CoFHE (Confidential FHE) testing
 */
export default class FhenixSepoliaNetwork extends Network {
  constructor() {
    super(
      NetworkId.Fhenix_Sepolia,
      "Fhenix Helium",
      undefined, // No base URL needed
      "https://api.helium.fhenix.zone" // Full RPC URL from Chainlist
    );
  }
}
