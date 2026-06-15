import * as React from "react"
import { useIsFetching, useIsMutating } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

function shouldIgnoreQuery(queryKey: readonly unknown[]) {
  const root = queryKey[0]
  const scope = queryKey[1]

  if (root === "admin-notifications" && scope === "top-nav") return true
  if (root === "admin-live-map") return true

  return false
}

function useDelayedVisibility(isBusy: boolean) {
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    const delay = isBusy ? 250 : 180
    const timer = window.setTimeout(() => setVisible(isBusy), delay)
    return () => window.clearTimeout(timer)
  }, [isBusy])

  return visible
}

export function DataActivityIndicator({
  className,
}: {
  className?: string
}) {
  const fetchingCount = useIsFetching({
    predicate: (query) => !shouldIgnoreQuery(query.queryKey),
  })
  const mutatingCount = useIsMutating()
  const visible = useDelayedVisibility(fetchingCount + mutatingCount > 0)

  if (!visible) return null

  const label = mutatingCount > 0 ? "Saving changes" : "Updating data"

  return (
    <div
      className={cn(
        "pointer-events-none fixed top-[4.25rem] left-1/2 z-[80] -translate-x-1/2",
        className
      )}
      aria-live="polite"
      aria-label={label}
    >
      <div className="overflow-hidden rounded-full border bg-background/95 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-lg shadow-black/5 backdrop-blur">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="size-3.5 animate-spin text-primary" />
          {label}
        </span>
      </div>
    </div>
  )
}
