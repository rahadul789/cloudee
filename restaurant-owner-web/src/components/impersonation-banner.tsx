import { useSyncExternalStore } from "react"
import { LogOut, ShieldCheck } from "lucide-react"

import { api } from "@/lib/api"
import {
  clearOwnerAuthSession,
  getOwnerImpersonation,
  OWNER_ACCESS_TOKEN_UPDATED_EVENT,
} from "@/lib/auth-session"

function subscribe(callback: () => void) {
  window.addEventListener(OWNER_ACCESS_TOKEN_UPDATED_EVENT, callback)
  return () => window.removeEventListener(OWNER_ACCESS_TOKEN_UPDATED_EVENT, callback)
}

/**
 * Persistent banner shown whenever an admin is signed in as this owner. Makes the
 * impersonation obvious and offers a one-click exit that revokes the session server
 * side. Renders nothing for a normal owner session.
 */
export function ImpersonationBanner() {
  const impersonation = useSyncExternalStore(
    subscribe,
    getOwnerImpersonation,
    () => null
  )

  if (!impersonation) return null

  async function handleExit() {
    try {
      await api.post("/owner/impersonation/end", {})
    } catch {
      // Best-effort revoke — clear the local session regardless.
    }
    clearOwnerAuthSession()
    window.location.href = "/auth/signin"
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-300 bg-amber-100 px-4 py-2 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <ShieldCheck className="size-4 shrink-0" />
        <span className="truncate">
          Admin support session — acting as{" "}
          <span className="font-semibold">
            {impersonation.ownerName || "this owner"}
          </span>{" "}
          <span className="opacity-80">(by {impersonation.adminName})</span>.
          Password changes are disabled.
        </span>
      </div>
      <button
        type="button"
        onClick={() => void handleExit()}
        className="inline-flex items-center gap-1.5 rounded-md bg-amber-900 px-2.5 py-1 text-xs font-semibold text-amber-50 hover:bg-amber-800"
      >
        <LogOut className="size-3.5" />
        Exit
      </button>
    </div>
  )
}
