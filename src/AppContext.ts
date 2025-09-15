import { createContext } from "react";
import NetworkProvider from "./backend/NetworkProvider.js";
import AccountManager from "./backend/AccountManager.js";
import TokenCache from "./backend/TokenCache.js";
import StorageManager from "./backend/StorageManager.js";

export const WalletContext = createContext<AppContext | undefined>(undefined);

export class AppContext {
  
  storageManager: StorageManager;
  // accountsManager
  accountManager: AccountManager;
  // privateKey initialized from storageProvider.
  networkProvider: NetworkProvider;
  // token cache
  tokenCache: TokenCache;
  // storage_provider

  constructor() {
    this.storageManager = new StorageManager();
    this.accountManager = new AccountManager(this.storageManager);
    this.networkProvider = new NetworkProvider();
    this.tokenCache = new TokenCache();
  }
}

