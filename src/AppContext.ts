import React from "react";
import NetworkProvider from "./backend/NetworkProvider.js";
import AccountManager from "./backend/AccountManager.js";
import TokenCache from "./backend/TokenCache.js";

export const WalletContext = React.createContext<AppContext | undefined>(undefined);

export class AppContext {
  
  // accountsManager
  accountManager: AccountManager;
  // privateKey initialized from storageProvider.
  networkProvider: NetworkProvider;
  // token cache
  tokenCache: TokenCache;
  // storage_provider

  constructor() {
    this.accountManager = new AccountManager();
    this.networkProvider = new NetworkProvider();
    this.tokenCache = new TokenCache();
  }
}

