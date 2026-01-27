declare module "*.css";
declare module "*.scss";
declare module "*.sass";

interface ImportMetaEnv {
  readonly VITE_WRAPPED_USDC_ADDRESS: string;
  readonly VITE_SEPOLIA_USDC_ADDRESS: string;
  readonly VITE_ALCHEMY_API_KEY: string;
  readonly VITE_WALLETCONNECT_PROJECT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
