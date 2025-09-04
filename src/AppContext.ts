import React from "react";
import { NetworkIds } from "./backend/Network.js";
import NetworkProvider from "./backend/NetworkProvider.js";
import AccountManager from "./backend/AccountManager.js";

export const WalletContext = React.createContext<AppContext | undefined>(undefined);

export class AppContext {
  
  // accountsManager
  accountManager: AccountManager;
  // privateKey initialized from storageProvider.
  networkProvider: NetworkProvider;
  // storage_provider

  constructor() {
    this.networkProvider = new NetworkProvider([
      NetworkIds.Ethereum
      // No other networks for now, at least 'til "NetworkProvider" stabilizes.
    ]);

    this.accountManager = new AccountManager();
  }
}

