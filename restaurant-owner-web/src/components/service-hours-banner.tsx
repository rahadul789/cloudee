import { Clock } from "lucide-react"

import { useOwnerStoreSettingsQuery } from "@/hooks/use-owner-api"
import type { OwnerStoreSettingsResponse } from "@/lib/backend-mappers"
import { useAppStore } from "@/store/app-store"
import { cn } from "@/lib/utils"

type OwnerServiceHours = NonNullable<OwnerStoreSettingsResponse["serviceHours"]>

/**
 * Reads the platform/zone service window from `/owner/store-settings` — the same
 * uncached source of truth the enforcement banner uses. Returns null when the
 * window is not enforced, so callers can render nothing.
 */
export function useOwnerServiceHours(): OwnerServiceHours | null {
  const ownerAccount = useAppStore((state) => state.ownerAccount)
  const storeSettingsQuery = useOwnerStoreSettingsQuery(
    ownerAccount.isAuthenticated
  )
  const serviceHours = (
    storeSettingsQuery.data as OwnerStoreSettingsResponse | undefined
  )?.serviceHours

  if (!serviceHours || !serviceHours.enabled) {
    return null
  }

  return serviceHours
}

/**
 * Explains why customers may see the restaurant as closed even while it is toggled
 * online — the platform/zone only serves orders inside a fixed daily window. This
 * never blocks the owner from going online; it is purely informational.
 */
export function ServiceHoursBanner({ className }: { className?: string }) {
  const serviceHours = useOwnerServiceHours()
  if (!serviceHours) return null

  const isClosed = !serviceHours.isOpenNow

  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        isClosed
          ? "border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30"
          : "border-border bg-muted/40",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md text-white",
            isClosed ? "bg-amber-500" : "bg-emerald-600"
          )}
        >
          <Clock className="size-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p
            className={cn(
              "font-semibold",
              isClosed
                ? "text-amber-700 dark:text-amber-300"
                : "text-foreground"
            )}
          >
            {isClosed
              ? "Customers can't order right now"
              : "Service hours are active"}
          </p>
          <p className="text-sm text-muted-foreground">
            {isClosed
              ? `Your area serves orders ${serviceHours.openLabel}–${serviceHours.closeLabel}. Outside these hours customers see your restaurant as closed even while you're online. Live orders keep going.`
              : `Customers can order from your restaurant ${serviceHours.openLabel}–${serviceHours.closeLabel}. Outside these hours it shows as closed even while you're online.`}
          </p>
        </div>
      </div>
    </div>
  )
}
