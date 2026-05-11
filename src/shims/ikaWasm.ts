/**
 * @ika.xyz/sdk wasm-loader expects `import("@ika.xyz/ika-wasm")` to expose
 * `default` / `init` as an async init function (wasm-pack "web" target).
 * The package.json "browser" field points at that web build, which loads WASM via
 * fetch(new URL("dwallet_mpc_wasm_bg.wasm", import.meta.url)) — in Vite dev /
 * some extension setups that fetch returns index.html (magic bytes 3c 21 44 4f).
 *
 * The wasm-pack "bundler" target uses `import ... from "*.wasm"` so Vite/Rollup
 * emit correct assets without that fetch. We load the bundler entry for side effects,
 * re-export the wasm-bindgen surface, and provide a no-op async default for the SDK.
 */
import "@ika-wasm-bundler-entry";
export * from "@ika-wasm-bundler-bg";

export default async function init(): Promise<void> {
  /* Synchronous init already ran in bundler entry */
}
