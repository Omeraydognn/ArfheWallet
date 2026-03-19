declare module "*.css";
declare module "*.scss";
declare module "*.sass";
declare module "cytoscape-fcose";

// Chrome Extension API types (minimal declarations for extension context)
declare namespace chrome {
  namespace storage {
    namespace local {
      function get(keys: string | string[]): Promise<Record<string, unknown>>;
      function set(items: Record<string, unknown>): Promise<void>;
      function remove(keys: string | string[]): Promise<void>;
    }
    namespace session {
      function get(keys: string | string[]): Promise<Record<string, unknown>>;
      function set(items: Record<string, unknown>): Promise<void>;
    }
  }
  namespace runtime {
    function sendMessage(message: unknown): Promise<unknown>;
    const onMessage: {
      addListener(callback: (message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => void): void;
    };
    const onInstalled: {
      addListener(callback: (details: { reason: string; previousVersion?: string }) => void): void;
    };
    const onStartup: {
      addListener(callback: () => void): void;
    };
    interface MessageSender {
      tab?: { id?: number; url?: string };
      id?: string;
      url?: string;
    }
  }
  namespace action {
    function setBadgeText(details: { text: string }): void;
    function setBadgeBackgroundColor(details: { color: string }): void;
    function openPopup(): Promise<void>;
  }
  namespace notifications {
    function create(notificationId: string, options: {
      type: string;
      iconUrl: string;
      title: string;
      message: string;
      priority?: number;
    }): void;
    function clear(notificationId: string): void;
    const onClicked: {
      addListener(callback: (notificationId: string) => void): void;
    };
  }
  namespace alarms {
    interface Alarm {
      name: string;
      scheduledTime: number;
      periodInMinutes?: number;
    }
    function create(name: string, alarmInfo: { periodInMinutes?: number; delayInMinutes?: number }): void;
    function get(name: string): Promise<Alarm | undefined>;
    function clear(name: string): Promise<boolean>;
    function clearAll(): Promise<boolean>;
    function getAll(): Promise<Alarm[]>;
    const onAlarm: {
      addListener(callback: (alarm: Alarm) => void): void;
    };
  }
  namespace browsingData {
    function removeCache(options: { since?: number }): Promise<void>;
  }
}

interface ImportMetaEnv {
  // Alchemy RPC endpoints
  readonly VITE_ALCHEMY_API_KEY: string;
  readonly VITE_ALCHEMY_MAINNET_API_KEY: string;
  readonly VITE_ALCHEMY_SEPOLIA_API_KEY: string;
  readonly VITE_ALCHEMY_ARBMAINNET_API_KEY: string;
  readonly VITE_ALCHEMY_ARBSEPOLIA_API_KEY: string;
  readonly VITE_ALCHEMY_BASEMAINNET_API_KEY: string;
  readonly VITE_ALCHEMY_BASESEPOLIA_API_KEY: string;

  // WalletConnect
  readonly VITE_WALLETCONNECT_PROJECT_ID: string;

  // Web3Auth
  readonly VITE_WEB3AUTH_CLIENT_ID: string;

  // Sepolia FHE contracts
  readonly VITE_WRAPPED_ETH_ADDRESS: string;
  readonly VITE_WRAPPED_USDC_ADDRESS: string;
  readonly VITE_SEPOLIA_USDC_ADDRESS: string;
  readonly VITE_SEPOLIA_WETH_ADDRESS: string;

  // Arbitrum Sepolia FHE contracts
  readonly VITE_ARB_WRAPPED_ETH_ADDRESS: string;
  readonly VITE_ARB_WRAPPED_USDC_ADDRESS: string;
  readonly VITE_ARB_SEPOLIA_WETH_ADDRESS: string;
  readonly VITE_ARB_SEPOLIA_USDC_ADDRESS: string;

  // Base Sepolia FHE contracts
  readonly VITE_BASE_WRAPPED_ETH_ADDRESS: string;
  readonly VITE_BASE_WRAPPED_USDC_ADDRESS: string;
  readonly VITE_BASE_SEPOLIA_WETH_ADDRESS: string;
  readonly VITE_BASE_SEPOLIA_USDC_ADDRESS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// BarcodeDetector API (Chrome 83+)
interface BarcodeDetectorOptions {
  formats: string[];
}
interface DetectedBarcode {
  rawValue: string;
  format: string;
  boundingBox: DOMRectReadOnly;
}
declare class BarcodeDetector {
  constructor(options?: BarcodeDetectorOptions);
  detect(source: ImageBitmapSource): Promise<DetectedBarcode[]>;
  static getSupportedFormats(): Promise<string[]>;
}
