import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useNavigate } from "react-router-dom"

import {
  markAdminNotificationRead,
  type AdminNotificationCenterItem,
} from "@/lib/admin-api"
import {
  connectAdminSocket,
  disconnectAdminSocket,
  getAdminSocket,
} from "@/lib/socket-client"
import { getAdminZoneScopeQueryParams } from "@/lib/admin-zone-scope"
import { ADMIN_ACCESS_TOKEN_UPDATED_EVENT } from "@/lib/admin-session"

function invalidateAdminRealtimeQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  payload?: Partial<AdminNotificationCenterItem>
) {
  void queryClient.invalidateQueries({ queryKey: ["admin-notifications"] })
  void queryClient.invalidateQueries({ queryKey: ["admin-action-center"] })
  void queryClient.invalidateQueries({ queryKey: ["admin-dashboard-orders"] })

  if (payload?.entityType === "support_case" || payload?.path?.startsWith("/support")) {
    void queryClient.invalidateQueries({ queryKey: ["admin-support-cases"] })
  }
  if (payload?.entityType === "website_lead" || payload?.path?.startsWith("/website")) {
    void queryClient.invalidateQueries({ queryKey: ["admin-website-overview"] })
    void queryClient.invalidateQueries({ queryKey: ["admin-website-leads"] })
    void queryClient.invalidateQueries({ queryKey: ["admin-website-analytics"] })
  }
  if (payload?.entityType === "order" || payload?.path?.startsWith("/orders")) {
    void queryClient.invalidateQueries({ queryKey: ["admin-orders"] })
    void queryClient.invalidateQueries({ queryKey: ["admin-orders-monitor"] })
    void queryClient.invalidateQueries({ queryKey: ["admin-payments"] })
    void queryClient.invalidateQueries({ queryKey: ["admin-bkash-payment-attempts"] })
    void queryClient.invalidateQueries({ queryKey: ["admin-operational-health"] })
  }
  if (payload?.entityType === "bkash_payment_attempt" || payload?.path?.startsWith("/payments")) {
    void queryClient.invalidateQueries({ queryKey: ["admin-payments"] })
    void queryClient.invalidateQueries({ queryKey: ["admin-bkash-payment-attempts"] })
    void queryClient.invalidateQueries({ queryKey: ["admin-action-center"] })
  }
  if (payload?.entityType === "customer" || payload?.path?.startsWith("/users")) {
    void queryClient.invalidateQueries({ queryKey: ["admin-customers"] })
    if (payload.entityId) {
      void queryClient.invalidateQueries({ queryKey: ["admin-customer-details", payload.entityId] })
    }
    void queryClient.invalidateQueries({ queryKey: ["admin-action-center"] })
  }
  if (payload?.entityType === "payout_method" || payload?.path?.startsWith("/payouts")) {
    void queryClient.invalidateQueries({ queryKey: ["admin-payout-method-approvals"] })
    void queryClient.invalidateQueries({ queryKey: ["admin-finance-payouts"] })
    void queryClient.invalidateQueries({ queryKey: ["admin-action-center"] })
  }
}

function resolveAdminNotificationPath(payload: Partial<AdminNotificationCenterItem>) {
  if (
    payload.path?.startsWith("/orders") ||
    payload.path?.startsWith("/support") ||
    payload.path?.startsWith("/reviews") ||
    payload.path?.startsWith("/restaurants") ||
    payload.path?.startsWith("/users") ||
    payload.path?.startsWith("/riders") ||
    payload.path?.startsWith("/payments") ||
    payload.path?.startsWith("/payouts") ||
    payload.path?.startsWith("/ledger") ||
    payload.path?.startsWith("/refunds") ||
    payload.path?.startsWith("/reports") ||
    payload.path?.startsWith("/website")
  ) {
    return payload.path
  }
  return "/notifications"
}

function canMarkNotificationRead(payload: Partial<AdminNotificationCenterItem>) {
  return (
    payload.source === "customer" ||
    payload.source === "owner" ||
    payload.source === "rider" ||
    payload.source === "ops"
  )
}

function stringScope(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function notificationMatchesCurrentScope(payload: Partial<AdminNotificationCenterItem>) {
  const scope = getAdminZoneScopeQueryParams()
  const zoneId = stringScope(payload.zoneId) || stringScope(payload.metadata?.zoneId)
  const districtId =
    stringScope(payload.districtId) || stringScope(payload.metadata?.districtId)

  if ("zoneId" in scope && scope.zoneId) {
    return zoneId === scope.zoneId
  }

  if ("districtId" in scope && scope.districtId) {
    return districtId === scope.districtId
  }

  return true
}

export function useAdminSocketBridge(enabled: boolean) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  React.useEffect(() => {
    if (!enabled) {
      disconnectAdminSocket()
      return
    }

    const socket = connectAdminSocket()
    const ensureJoined = () => socket.emit("admin:join", "ops")
    const reconnectWithFreshToken = () => {
      if (socket.connected) {
        socket.disconnect()
      }
      connectAdminSocket()
    }
    const handleConnectError = (error: Error) => {
      if (/token|session|unauthorized/i.test(error.message)) {
        void queryClient.invalidateQueries()
      }
    }
    socket.on("connect", ensureJoined)
    socket.on("connect_error", handleConnectError)
    window.addEventListener(ADMIN_ACCESS_TOKEN_UPDATED_EVENT, reconnectWithFreshToken)

    const handleNotification = (payload: AdminNotificationCenterItem) => {
      if (!notificationMatchesCurrentScope(payload)) {
        return
      }

      invalidateAdminRealtimeQueries(queryClient, payload)
      toast(payload.title || "New admin alert", {
        description: payload.description,
        action: {
          label: "Open",
          onClick: () => {
            if (!payload.isRead && payload.id && canMarkNotificationRead(payload)) {
              void markAdminNotificationRead({
                source: payload.source as "customer" | "owner" | "rider" | "ops",
                id: payload.id,
              }).finally(() => {
                void queryClient.invalidateQueries({ queryKey: ["admin-notifications"] })
              })
            }
            navigate(resolveAdminNotificationPath(payload))
          },
        },
      })
    }

    const handleOrderUpdated = (payload: { orderId?: string; path?: string }) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-orders"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-orders-monitor"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-payments"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-operational-health"] })
      void queryClient.refetchQueries({ queryKey: ["admin-orders"], type: "active" })
      void queryClient.refetchQueries({ queryKey: ["admin-orders-monitor"], type: "active" })
      void queryClient.refetchQueries({ queryKey: ["admin-dashboard-orders"], type: "active" })
      if (payload.orderId) {
        void queryClient.invalidateQueries({ queryKey: ["admin-order", payload.orderId] })
        void queryClient.refetchQueries({ queryKey: ["admin-order", payload.orderId], type: "active" })
      }
    }

    const handlePlatformContentUpdated = () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-cms"] })
      void queryClient.invalidateQueries({ queryKey: ["platform-content"] })
      void queryClient.refetchQueries({ queryKey: ["admin-cms"], type: "active" })
    }

    socket.on("admin.notification.created", handleNotification)
    socket.on("admin.order.updated", handleOrderUpdated)
    socket.on("admin.platform-content.updated", handlePlatformContentUpdated)

    return () => {
      socket.off("admin.notification.created", handleNotification)
      socket.off("admin.order.updated", handleOrderUpdated)
      socket.off("admin.platform-content.updated", handlePlatformContentUpdated)
      socket.off("connect", ensureJoined)
      socket.off("connect_error", handleConnectError)
      window.removeEventListener(
        ADMIN_ACCESS_TOKEN_UPDATED_EVENT,
        reconnectWithFreshToken
      )
      disconnectAdminSocket()
    }
  }, [enabled, navigate, queryClient])

  React.useEffect(() => {
    return () => {
      const socket = getAdminSocket()
      socket.off("admin.notification.created")
      socket.off("admin.order.updated")
      socket.off("admin.platform-content.updated")
    }
  }, [])
}
