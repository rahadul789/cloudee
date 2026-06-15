import * as React from "react"

import {
  useOwnerStoreSettingsQuery,
  useUpdateOwnerRestaurantStatusMutation,
} from "@/hooks/use-owner-api"
import {
  mapOwnerStoreSettings,
  resolveRestaurantOnline,
  type OwnerStoreSettingsResponse,
} from "@/lib/backend-mappers"
import { useAppStore } from "@/store/app-store"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"

export function RestaurantStatusProvider({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}

export function useRestaurantStatus() {
  const isOnline = useAppStore((state) => state.isRestaurantOnline)
  const setIsOnline = useAppStore((state) => state.setRestaurantOnline)
  const setStoreSettings = useAppStore((state) => state.setStoreSettings)
  const ownerAccount = useAppStore((state) => state.ownerAccount)
  const storeSettingsQuery = useOwnerStoreSettingsQuery(ownerAccount.isAuthenticated)
  const updateStatusMutation = useUpdateOwnerRestaurantStatusMutation()
  const queryClient = useQueryClient()
  const optimisticLockRef = React.useRef(false)

  const setOnline = React.useCallback(
    async (nextValue: boolean) => {
      if (optimisticLockRef.current || updateStatusMutation.isPending) {
        return
      }

      optimisticLockRef.current = true
      const previous = isOnline
      setIsOnline(nextValue)

      try {
        const updated = await updateStatusMutation.mutateAsync({
          isOnline: nextValue
        })
        setIsOnline(Boolean(updated.runtime?.isOnline))
        queryClient.invalidateQueries({ queryKey: ["owner", "store-settings"] })
        toast.success(nextValue ? "Restaurant is online" : "Restaurant is offline")
      } catch (error) {
        setIsOnline(previous)
        const message =
          error instanceof Error ? error.message : "Unable to update status."
        toast.error("Update failed", { description: message })
      } finally {
        optimisticLockRef.current = false
      }
    },
    [isOnline, queryClient, setIsOnline, updateStatusMutation]
  )

  React.useEffect(() => {
    if (!storeSettingsQuery.data) return
    setStoreSettings((current) =>
      mapOwnerStoreSettings(
        storeSettingsQuery.data as OwnerStoreSettingsResponse,
        current
      )
    )
  }, [setStoreSettings, storeSettingsQuery.data])

  React.useEffect(() => {
    if (!storeSettingsQuery.data) return
    if (updateStatusMutation.isPending || optimisticLockRef.current) return
    const resolved = resolveRestaurantOnline(
      storeSettingsQuery.data as OwnerStoreSettingsResponse,
      isOnline
    )
    if (resolved !== isOnline) {
      setIsOnline(resolved)
    }
  }, [isOnline, setIsOnline, storeSettingsQuery.data, updateStatusMutation.isPending])

  return {
    isOnline,
    setIsOnline: setOnline,
    isUpdating: updateStatusMutation.isPending || optimisticLockRef.current,
  }
}
