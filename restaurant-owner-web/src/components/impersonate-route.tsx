import { useEffect, useRef, useState } from "react"
import { Loader2, ShieldAlert } from "lucide-react"
import { useNavigate, useSearchParams } from "react-router-dom"

import { api } from "@/lib/api"
import {
  setOwnerAuthSession,
  type OwnerImpersonation,
} from "@/lib/auth-session"
import { useAppStore } from "@/store/app-store"
import type { RestaurantLifecycleStatus } from "@/store/app-store"

type RedeemResponse = {
  accessToken: string
  owner: {
    id: string
    fullName: string
    phone: string
    isPhoneVerified: boolean
  }
  restaurantLifecycleStatus: RestaurantLifecycleStatus
  impersonation: OwnerImpersonation
}

/**
 * Landing page for the admin "Login as owner" handoff. It exchanges the one-time
 * code for a short-lived impersonation session, then drops the admin into the owner
 * dashboard. There is no password and no refresh token — the session is ephemeral.
 */
export function ImpersonateRoute() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const setOwnerAccount = useAppStore((state) => state.setOwnerAccount)
  const setRestaurantLifecycleStatus = useAppStore(
    (state) => state.setRestaurantLifecycleStatus
  )
  const [error, setError] = useState<string | null>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    const code = params.get("code")?.trim()
    if (!code) {
      setError("This login link is missing its code.")
      return
    }

    void (async () => {
      try {
        const data = await api.post<RedeemResponse>(
          "/auth/owner/impersonation/redeem",
          { code },
          false
        )

        setOwnerAuthSession({
          accessToken: data.accessToken,
          impersonation: data.impersonation,
        })
        setOwnerAccount((current) => ({
          ...current,
          ownerName: data.owner.fullName,
          phone: data.owner.phone,
          pendingPhone: "",
          isAuthenticated: true,
          isPhoneVerified: data.owner.isPhoneVerified,
          lastLoginAt: new Date().toISOString(),
        }))
        setRestaurantLifecycleStatus(data.restaurantLifecycleStatus)
        navigate("/", { replace: true })
      } catch (redeemError) {
        setError(
          redeemError instanceof Error
            ? redeemError.message
            : "This login link is invalid or has expired."
        )
      }
    })()
  }, [navigate, params, setOwnerAccount, setRestaurantLifecycleStatus])

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 text-center shadow-sm">
        {error ? (
          <>
            <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950/40">
              <ShieldAlert className="size-5" />
            </div>
            <p className="font-semibold">Login link unavailable</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            <p className="mt-4 text-xs text-muted-foreground">
              Ask an admin to start a new &ldquo;Login as owner&rdquo; session.
            </p>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto mb-3 size-6 animate-spin text-muted-foreground" />
            <p className="font-semibold">Signing you in as the owner…</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Setting up a secure admin support session.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
