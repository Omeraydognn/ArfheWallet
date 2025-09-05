import React from "react";
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
    this.networkProvider = new NetworkProvider();

    this.accountManager = new AccountManager();
  }
}

