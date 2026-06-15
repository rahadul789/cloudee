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
    if (!(bootstrapQuery.error instanceof ApiError)) return

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
