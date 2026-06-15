import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider } from "react-router-dom"

import "./index.css"
import { router } from "./App.tsx"
import { AuthBootstrap } from "@/components/auth/auth-bootstrap.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { TooltipProvider } from "@/components/ui/tooltip.tsx"
import { queryClient } from "@/lib/query-client.ts"
import { getOwnerAuthSession } from "@/lib/auth-session"

const session = getOwnerAuthSession()
const lastPath = sessionStorage.getItem("owner:lastPath")
if (session?.accessToken && window.location.pathname === "/" && lastPath && lastPath !== "/") {
  window.history.replaceState(null, "", lastPath)
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AuthBootstrap>
            <RouterProvider router={router} />
          </AuthBootstrap>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
)
