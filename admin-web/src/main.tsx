import * as React from "react"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"

import "./index.css"
import App from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { queryClient } from "@/lib/query-client"

type AppErrorBoundaryProps = {
  children: ReactNode
}

type AppErrorBoundaryState = {
  error: Error | null
}

class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    error: null,
  }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error("admin-web runtime error", error)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-background px-4 py-10 text-foreground">
          <div className="mx-auto max-w-3xl rounded-3xl border bg-card p-6 shadow-sm">
            <h1 className="text-xl font-semibold">
              Admin app crashed while rendering
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              The screen was blank because a runtime error happened. The exact
              error is shown below so we can fix it properly.
            </p>
            <pre className="mt-4 overflow-auto rounded-2xl border bg-muted/30 p-4 text-sm whitespace-pre-wrap">
              {this.state.error.stack || this.state.error.message}
            </pre>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <TooltipProvider>
            <App />
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>
)
