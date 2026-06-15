import * as React from "react"

import {
  mapOwnerNotification,
  type OwnerListResponse,
  type OwnerNotificationResponse,
} from "@/lib/backend-mappers"
import { useOwnerNotificationsQuery } from "@/hooks/use-owner-api"
import { useAppStore } from "@/store/app-store"

export function NotificationsProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const ownerAccount = useAppStore((state) => state.ownerAccount)
  const setNotifications = useAppStore((state) => state.setNotifications)
  const notificationsQuery = useOwnerNotificationsQuery(ownerAccount.isAuthenticated)

  React.useEffect(() => {
    if (!notificationsQuery.data) return

    const mapped = (
      notificationsQuery.data as OwnerListResponse<OwnerNotificationResponse>
    ).items.map(
      mapOwnerNotification
    )
    setNotifications(mapped)
  }, [notificationsQuery.data, setNotifications])

  return <>{children}</>
}

export function useNotifications() {
  const notifications = useAppStore((state) => state.notifications)
  const setNotifications = useAppStore((state) => state.setNotifications)

  return { notifications, setNotifications }
}
