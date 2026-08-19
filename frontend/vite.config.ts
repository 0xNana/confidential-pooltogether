/// <reference types="vitest/config" />
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  // Keep SDK workers and WASM relative to their emitted chunk so static hosts
  // mounted below the domain root do not fall through to the SPA document.
  base: "./",
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/ethers")) return "ethers"
          if (id.includes("node_modules/react")) return "react"
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  preview: {
    host: "127.0.0.1",
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  test: {
    api: false,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
})
