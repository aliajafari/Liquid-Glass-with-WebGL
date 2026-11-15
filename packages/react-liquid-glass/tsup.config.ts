import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", core: "src/core/index.ts" },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2020",
  external: ["react", "react/jsx-runtime", "html2canvas"],
  // Components use hooks; mark the bundle as a client module for React Server Components (Next.js App Router).
  banner: { js: '"use client";' }
});
