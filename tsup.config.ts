import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    spot: "src/spot/index.ts",
    perps: "src/perps/index.ts",
    signer: "src/signer/index.ts",
    evm: "src/evm/index.ts",
    ws: "src/ws/index.ts",
  },
  format: ["esm", "cjs"],
  outExtension({ format }) {
    return { js: format === "esm" ? ".mjs" : ".cjs" };
  },
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
  splitting: false,
  treeshake: true,
  external: ["viem"],
});
