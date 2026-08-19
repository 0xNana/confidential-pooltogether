/// <reference types="vitest/config" />
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  // The app is a client-side route at the domain root. Root-relative assets
  // keep the relayer WASM valid for both /app and /app/.
  base: "/",
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
