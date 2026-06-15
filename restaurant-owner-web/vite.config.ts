import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return

          if (
            id.includes("@tanstack/react-query") ||
            id.includes("socket.io-client") ||
            id.includes("zustand") ||
            id.includes("sonner")
          ) {
            return "app-vendor"
          }

          if (id.includes("date-fns")) {
            return "date"
          }

          if (
            id.includes("recharts") ||
            id.includes("d3-") ||
            id.includes("victory-vendor")
          ) {
            return "charts"
          }

          if (
            id.includes("@tanstack/react-table") ||
            id.includes("@dnd-kit") ||
            id.includes("sortable")
          ) {
            return "tables"
          }

          if (
            id.includes("radix-ui") ||
            id.includes("@base-ui") ||
            id.includes("vaul") ||
            id.includes("cmdk") ||
            id.includes("embla-carousel")
          ) {
            return "ui-vendor"
          }

          if (
            id.includes("react-router") ||
            id.includes("@remix-run") ||
            id.includes("history")
          ) {
            return "router"
          }

          if (id.includes("lucide-react") || id.includes("@tabler/icons-react")) {
            return "icons"
          }

          return "vendor"
        },
      },
    },
  },
})
