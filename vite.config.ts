import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Two build modes:
//   `vite build`          -> normal static site in dist/ (host on Vercel / GitHub Pages)
//   `vite build --mode single` -> one self-contained roland.html you can double-click (file://)
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: mode === "single" ? [viteSingleFile()] : [],
  build: {
    target: "es2022",
    cssCodeSplit: mode !== "single",
    assetsInlineLimit: mode === "single" ? 100_000_000 : 4096,
    outDir: "dist",
  },
}));
