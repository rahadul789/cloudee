import { AlertTriangle, Clock, MessageSquare } from "lucide-react"

import { useOwnerStoreSettingsQuery } from "@/hooks/use-owner-api"
import type {
  OwnerEnforcement,
  OwnerEnforcementStatus,
  OwnerStoreSettingsResponse,
} from "@/lib/backend-mappers"
import { useAppStore } from "@/store/app-store"
import { cn } from "@/lib/utils"

type EnforcementCopy = {
  title: string
  body: string
  tone: "warning" | "danger"
}

const ENFORCEMENT_COPY: Record<
  Exclude<OwnerEnforcementStatus, "active">,
  EnforcementCopy
> = {
  // `under_review` does NOT block ordering or going online — it is informational,
  // so it must not be worded or coloured like a suspension.
  under_review: {
    title: "Your restaurant is under review",
    body: "Foodbela is reviewing your service quality. You can still go online and take orders.",
    tone: "warning",
  },
  quality_hold: {
    title: "Quality hold in effect",
    body: "You cannot go online and customers cannot order until this quality review is cleared.",
    tone: "danger",
  },
  temporarily_suspended: {
    title: "Restaurant temporarily suspended",
    body: "Foodbela has temporarily suspended your restaurant. You cannot go online or take orders during this time.",
    tone: "danger",
  },
  permanently_disabled: {
    title: "Restaurant permanently disabled",
    body: "Your restaurant has been permanently disabled on Foodbela. Contact support for details.",
    tone: "danger",
  },
}

function formatEndsAt(value?: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date)
}

/**
 * Reads enforcement from `/owner/store-settings` — the single (uncached) source of
 * truth. Returns null while active, so callers can render nothing.
 */
export function useOwnerEnforcement(): OwnerEnforcement | null {
  const ownerAccount = useAppStore((state) => state.ownerAccount)
  const storeSettingsQuery = useOwnerStoreSettingsQuery(
    ownerAccount.isAuthenticated
  )
  const enforcement = (
    storeSettingsQuery.data as OwnerStoreSettingsResponse | undefined
  )?.enforcement

  if (!enforcement || enforcement.effectiveStatus === "active") {
    return null
  }

  return enforcement
}

export function EnforcementBanner({ className }: { className?: string }) {
  const enforcement = useOwnerEnforcement()
  if (!enforcement) return null

  const status = enforcement.effectiveStatus as Exclude<
    OwnerEnforcementStatus,
    "active"
  >
  const copy = ENFORCEMENT_COPY[status]
  if (!copy) return null

  const isDanger = copy.tone === "danger"
  const endsAt = formatEndsAt(enforcement.expiresAt)

  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        isDanger
          ? "border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/30"
          : "border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md text-white",
            isDanger ? "bg-rose-600" : "bg-amber-500"
          )}
        >
          <AlertTriangle className="size-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p
              className={cn(
                "font-semibold",
                isDanger
                  ? "text-rose-700 dark:text-rose-300"
                  : "text-amber-700 dark:text-amber-300"
              )}
            >
              {copy.title}
            </p>
            <p className="text-sm text-muted-foreground">{copy.body}</p>
          </div>

          {enforcement.ownerNote ? (
            <div className="flex items-start gap-2 rounded-md bg-background/70 p-2.5">
              <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <p className="text-sm font-medium">{enforcement.ownerNote}</p>
            </div>
          ) : null}

          {endsAt ? (
            <div
              className={cn(
                "flex items-center gap-1.5 text-xs font-semibold",
                isDanger
                  ? "text-rose-700 dark:text-rose-300"
                  : "text-amber-700 dark:text-amber-300"
              )}
            >
              <Clock className="size-3.5" />
              <span>Until {endsAt}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
