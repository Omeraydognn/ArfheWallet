interface ImportMetaEnv {
  readonly VITE_ALCHEMY_API_KEY: string;
  // add more env vars here as you need
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}