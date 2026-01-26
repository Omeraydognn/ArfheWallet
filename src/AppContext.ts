import { createContext } from "react";
import NetworkProvider from "./backend/NetworkProvider.js";
import AccountManager from "./backend/AccountManager.js";
import TokenCache from "./backend/TokenCache.js";
import StorageManager from "./backend/StorageManager.js";

import { WalletConnectService } from "./backend/WalletConnectService";

export const WalletContext = createContext<AppContext | undefined>(undefined);

export class AppContext {

  storageManager: StorageManager;
  // accountsManager
  accountManager: AccountManager;
  // privateKey initialized from storageProvider.
  networkProvider: NetworkProvider;
  // token cache
  tokenCache: TokenCache;
  // wallet connect
  walletConnectService: WalletConnectService;

  constructor() {
    this.storageManager = new StorageManager();
    this.accountManager = new AccountManager(this.storageManager);
    this.networkProvider = new NetworkProvider();
    this.tokenCache = new TokenCache();
    this.walletConnectService = new WalletConnectService(this.accountManager);
  }
}

