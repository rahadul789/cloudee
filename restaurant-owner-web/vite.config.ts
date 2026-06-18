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

          if (normalizedId.includes("/node_modules/date-fns/")) {
            return "date"
          }

          if (
            normalizedId.includes("/node_modules/recharts/") ||
            normalizedId.includes("/node_modules/d3-") ||
            normalizedId.includes("/node_modules/victory-vendor/")
          ) {
            return "charts"
          }

          if (
            normalizedId.includes("/node_modules/@tanstack/react-table/") ||
            normalizedId.includes("/node_modules/@dnd-kit/") ||
            normalizedId.includes("/node_modules/sortable")
          ) {
            return "tables"
          }

          if (
            normalizedId.includes("/node_modules/radix-ui/") ||
            normalizedId.includes("/node_modules/@base-ui/") ||
            normalizedId.includes("/node_modules/vaul/") ||
            normalizedId.includes("/node_modules/cmdk/") ||
            normalizedId.includes("/node_modules/embla-carousel") ||
            normalizedId.includes("/node_modules/class-variance-authority/") ||
            normalizedId.includes("/node_modules/tailwind-merge/") ||
            normalizedId.includes("/node_modules/clsx/")
          ) {
            return "ui-vendor"
          }

          if (
            normalizedId.includes("/node_modules/leaflet/") ||
            normalizedId.includes("/node_modules/react-leaflet/") ||
            normalizedId.includes("/node_modules/@react-leaflet/")
          ) {
            return "maps-vendor"
          }

          if (
            normalizedId.includes("/node_modules/lucide-react/") ||
            normalizedId.includes("/node_modules/@tabler/icons-react/")
          ) {
            return "icons"
          }

          return "vendor"
        },
      },
    },
  },
})
