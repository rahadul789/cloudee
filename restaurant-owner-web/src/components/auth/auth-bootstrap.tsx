import * as React from "react"
import { useQuery } from "@tanstack/react-query"

import { api, ApiError, refreshOwnerSession } from "@/lib/api"
import { clearOwnerAuthSession, getOwnerAuthSession } from "@/lib/auth-session"
import {
  buildOwnerAccountFromProfile,
  getDefaultSignedOutOwnerAccount,
  type OwnerProfileResponse,
} from "@/lib/backend-mappers"
import { useAppStore } from "@/store/app-store"

export function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const setOwnerAccount = useAppStore((state) => state.setOwnerAccount)
  const setRestaurantLifecycleStatus = useAppStore(
    (state) => state.setRestaurantLifecycleStatus
  )
  const setAuthBootstrapped = useAppStore((state) => state.setAuthBootstrapped)

  const bootstrapQuery = useQuery({
    queryKey: ["owner", "session-bootstrap"],
    retry: false,
    queryFn: async ({ signal }) => {
      let session = getOwnerAuthSession()

      if (!session?.accessToken) {
        session = await refreshOwnerSession()
      }

      if (!session?.accessToken) {
        return null
      }

      return api.get<OwnerProfileResponse>("/owner/me", signal)
    },
  })

  React.useEffect(() => {
    if (bootstrapQuery.isPending) return

    if (!bootstrapQuery.data) {
      // The admin "Login as owner" handoff sets an in-memory session token AFTER this
      // one-time query has already resolved null. Never clobber that impersonation
      // session with a signed-out account — just mark bootstrap complete and let the
      // /impersonate route's session stand (it also sets the owner account itself).
      if (getOwnerAuthSession()?.accessToken) {
        setAuthBootstrapped(true)
        return
      }
      setOwnerAccount(getDefaultSignedOutOwnerAccount())
      setRestaurantLifecycleStatus("account_created")
      setAuthBootstrapped(true)
      return
    }

    const ownerAccount = buildOwnerAccountFromProfile(bootstrapQuery.data)
    setOwnerAccount(ownerAccount)
    setRestaurantLifecycleStatus(bootstrapQuery.data.restaurantLifecycleStatus)
    setAuthBootstrapped(true)
  }, [
    bootstrapQuery.data,
    bootstrapQuery.isPending,
    setOwnerAccount,
    setAuthBootstrapped,
    setRestaurantLifecycleStatus,
  ])

  React.useEffect(() => {
    if (!(bootstrapQuery.error instanceof ApiError)) {
      // Network / unknown error while bootstrapping — do NOT log out. Just let the
      // app render; the session is untouched and requests will retry.
      if (bootstrapQuery.error) setAuthBootstrapped(true)
      return
    }

    // Only a genuine auth failure (401/403) ends the session. A transient 5xx/429 on
    // /owner/me must never log a valid owner out — keep the session and mark bootstrap
    // done so the app renders and retries.
    if (bootstrapQuery.error.status !== 401 && bootstrapQuery.error.status !== 403) {
      setAuthBootstrapped(true)
      return
    }

    clearOwnerAuthSession()
    setOwnerAccount(getDefaultSignedOutOwnerAccount())
    setRestaurantLifecycleStatus("account_created")
    setAuthBootstrapped(true)
  }, [bootstrapQuery.error, setOwnerAccount, setRestaurantLifecycleStatus, setAuthBootstrapped])

  if (bootstrapQuery.isPending) {
    return <div className="min-h-screen bg-background" />
  }

  return <>{children}</>
}
