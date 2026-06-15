import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined
          const normalizedId = id.replace(/\\/g, "/")
          if (
            normalizedId.includes("/node_modules/react/") ||
            normalizedId.includes("/node_modules/react-dom/") ||
            normalizedId.includes("/node_modules/scheduler/") ||
            normalizedId.includes("/node_modules/react-router/") ||
            normalizedId.includes("/node_modules/react-router-dom/")
          ) {
            return "react-vendor"
          }
          if (normalizedId.includes("/node_modules/@tanstack/")) {
            return "query-vendor"
          }
          if (normalizedId.includes("/node_modules/recharts/")) {
            return "charts-vendor"
          }
          if (
            normalizedId.includes("/node_modules/leaflet/") ||
            normalizedId.includes("/node_modules/react-leaflet/") ||
            normalizedId.includes("/node_modules/@react-leaflet/")
          ) {
            return "maps-vendor"
          }
          if (
            normalizedId.includes("/node_modules/radix-ui/") ||
            normalizedId.includes("/node_modules/@base-ui/") ||
            normalizedId.includes("/node_modules/lucide-react/") ||
            normalizedId.includes("/node_modules/class-variance-authority/") ||
            normalizedId.includes("/node_modules/tailwind-merge/") ||
            normalizedId.includes("/node_modules/clsx/") ||
            normalizedId.includes("/node_modules/sonner/")
          ) {
            return "ui-vendor"
          }
          return "vendor"
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
