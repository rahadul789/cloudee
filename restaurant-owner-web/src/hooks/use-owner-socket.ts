import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"

import { getOwnerAuthSession, OWNER_ACCESS_TOKEN_UPDATED_EVENT } from "@/lib/auth-session"
import { connectOwnerSocket, disconnectOwnerSocket, getOwnerSocket } from "@/lib/socket-client"
import {
  mapOwnerNotification,
  mapOwnerOrder,
  type OwnerDashboardSummaryResponse,
  type OwnerListResponse,
  type OwnerNotificationResponse,
  type OwnerOrderResponse,
} from "@/lib/backend-mappers"
import { patchOwnerOrderQueryCaches } from "@/lib/owner-order-cache"
import { useAppStore } from "@/store/app-store"
import type { Order } from "@/components/orders/types"

function decodeJwtPayload(token: string) {
  try {
    const payload = token.split(".")[1]
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/")
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=")
    const decoded = atob(padded)
    return JSON.parse(decoded) as { sub?: string }
  } catch {
    return null
  }
}

function resolveOwnerSession() {
  const session = getOwnerAuthSession()
  if (!session?.accessToken) return null
  const payload = decodeJwtPayload(session.accessToken)
  if (!payload?.sub) return null
  return {
    ownerId: payload.sub,
    accessToken: session.accessToken,
  }
}

const activeOrderStatuses = new Set([
  "New",
  "Accepted",
  "Preparing",
  "ReadyForPickup",
  "PickedUp",
])

function isValidPlacedOrder(order: Order) {
  return order.currentStatus !== "Cancelled" && order.currentStatus !== "Rejected"
}

function isWithinSummaryRange(summary: OwnerDashboardSummaryResponse, isoDate?: string | null) {
  if (!isoDate) return false
  const value = new Date(isoDate).getTime()
  const from = new Date(summary.filter.from).getTime()
  const to = new Date(summary.filter.to).getTime()
  return Number.isFinite(value) && value >= from && value <= to
}

function applyOrderDeltaToDashboardSummary(
  summary: OwnerDashboardSummaryResponse,
  order: Order,
  direction: 1 | -1
) {
  const metrics = { ...summary.metrics }
  const placedInRange = isWithinSummaryRange(summary, order.timestamps.placedAt)
  const deliveredInRange = isWithinSummaryRange(summary, order.timestamps.deliveredAt)
  const cancelledInRange = isWithinSummaryRange(summary, order.timestamps.cancelledAt)
  const rejectedInRange = isWithinSummaryRange(summary, order.timestamps.rejectedAt)

  if (placedInRange && isValidPlacedOrder(order)) {
    metrics.totalOrders = Math.max(0, metrics.totalOrders + direction)
    metrics.placedOrderValue = Math.max(
      0,
      metrics.placedOrderValue + direction * order.total
    )
  }

  if (cancelledInRange && order.currentStatus === "Cancelled") {
    metrics.cancelledOrders = Math.max(0, metrics.cancelledOrders + direction)
    metrics.cancelledOrderValue = Math.max(
      0,
      metrics.cancelledOrderValue + direction * order.total
    )
  }

  if (rejectedInRange && order.currentStatus === "Rejected") {
    metrics.rejectedOrders = Math.max(0, metrics.rejectedOrders + direction)
    metrics.rejectedOrderValue = Math.max(
      0,
      (metrics.rejectedOrderValue ?? 0) + direction * order.total
    )
  }

  if (deliveredInRange && order.currentStatus === "Delivered") {
    metrics.completedOrders = Math.max(0, metrics.completedOrders + direction)
    metrics.deliveredOrderValue = Math.max(
      0,
      metrics.deliveredOrderValue + direction * order.total
    )
    metrics.totalRevenue = metrics.deliveredOrderValue
  }

  if (activeOrderStatuses.has(order.currentStatus)) {
    metrics.pendingOrders = Math.max(0, metrics.pendingOrders + direction)
  }

  return {
    ...summary,
    metrics,
  }
}

function patchDashboardSummaryForOrderChange(
  summary: OwnerDashboardSummaryResponse,
  previousOrder: Order | null,
  nextOrder: Order
) {
  let nextSummary = summary

  if (previousOrder) {
    nextSummary = applyOrderDeltaToDashboardSummary(nextSummary, previousOrder, -1)
  }

  if (!previousOrder && nextOrder.currentStatus !== "New") {
    return nextSummary
  }

  return applyOrderDeltaToDashboardSummary(nextSummary, nextOrder, 1)
}

export function useOwnerSocketBridge() {
  const ownerAccount = useAppStore((state) => state.ownerAccount)
  const setNotifications = useAppStore((state) => state.setNotifications)
  const setOrders = useAppStore((state) => state.setOrders)
  const queryClient = useQueryClient()
  const joinedRef = React.useRef<string | null>(null)
  const tokenRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (!ownerAccount.isAuthenticated) {
      joinedRef.current = null
      tokenRef.current = null
      disconnectOwnerSocket()
      return
    }

    const ownerSession = resolveOwnerSession()
    if (!ownerSession) return

    const { ownerId, accessToken } = ownerSession

    if (joinedRef.current !== ownerId || tokenRef.current !== accessToken) {
      connectOwnerSocket(ownerId, accessToken)
      joinedRef.current = ownerId
      tokenRef.current = accessToken
    }

    const socket = getOwnerSocket()
    const ensureJoined = () => socket.emit("owner:join", ownerId)
    const reconnectWithFreshToken = () => {
      const latestSession = resolveOwnerSession()
      if (!latestSession) {
        joinedRef.current = null
        tokenRef.current = null
        disconnectOwnerSocket()
        return
      }

      connectOwnerSocket(latestSession.ownerId, latestSession.accessToken)
      joinedRef.current = latestSession.ownerId
      tokenRef.current = latestSession.accessToken
    }
    socket.on("connect", ensureJoined)
    window.addEventListener(OWNER_ACCESS_TOKEN_UPDATED_EVENT, reconnectWithFreshToken)

    const handleNotification = (payload: OwnerNotificationResponse) => {
      const mapped = mapOwnerNotification(payload)
      setNotifications((current) => {
        if (current.some((item) => item.id === mapped.id)) return current
        return [mapped, ...current]
      })

      queryClient.setQueriesData(
        { queryKey: ["owner", "notifications"] },
        (current: unknown) => {
          if (!current || typeof current !== "object" || !("items" in (current as Record<string, unknown>))) {
            return current
          }

          const result = current as OwnerListResponse<OwnerNotificationResponse>
          if (result.items.some((item) => item._id === payload._id)) {
            return current
          }

          return {
            ...result,
            items: [payload, ...result.items],
            total: (result.total ?? result.items.length) + 1,
            unreadCount: (result.unreadCount ?? 0) + (payload.isRead ? 0 : 1),
          } satisfies OwnerListResponse<OwnerNotificationResponse>
        }
      )
      queryClient.invalidateQueries({ queryKey: ["owner", "notifications"] })

      if (mapped.type === "payout") {
        queryClient.invalidateQueries({ queryKey: ["owner", "payouts", "summary"] })
        queryClient.invalidateQueries({ queryKey: ["owner", "payouts", "history"] })
        queryClient.invalidateQueries({ queryKey: ["owner", "payouts", "transactions"] })
        queryClient.invalidateQueries({ queryKey: ["owner", "dashboard", "summary"] })
      }

      if (mapped.type === "review") {
        queryClient.invalidateQueries({ queryKey: ["owner", "reviews"] })
      }

      if (mapped.type === "promotion") {
        queryClient.invalidateQueries({ queryKey: ["owner", "vouchers"] })
      }

      if (mapped.type === "support") {
        queryClient.invalidateQueries({ queryKey: ["owner", "support-cases"] })
      }
    }

    const handleOrderUpdated = (payload: OwnerOrderResponse) => {
      const mapped = mapOwnerOrder(payload)
      let previousOrder: Order | null = null
      setOrders((current) => {
        previousOrder = current.find((order) => order.id === mapped.id) ?? null
        const exists = current.some((order) => order.id === mapped.id)
        return exists
          ? current.map((order) => (order.id === mapped.id ? mapped : order))
          : [mapped, ...current]
      })

      patchOwnerOrderQueryCaches(queryClient, payload)
      queryClient.setQueriesData(
        { queryKey: ["owner", "dashboard", "summary"] },
        (current: unknown) => {
          if (!current) return current
          return patchDashboardSummaryForOrderChange(
            current as OwnerDashboardSummaryResponse,
            previousOrder,
            mapped
          )
        }
      )
      void queryClient.invalidateQueries({ queryKey: ["owner", "dashboard", "summary"] })
      void queryClient.refetchQueries({ queryKey: ["owner", "orders"], type: "active" })
      void queryClient.invalidateQueries({ queryKey: ["owner", "payouts", "summary"] })
      void queryClient.invalidateQueries({ queryKey: ["owner", "payouts", "history"] })
      void queryClient.invalidateQueries({ queryKey: ["owner", "payouts", "transactions"] })
    }

    const handleMenuUpdated = () => {
      void queryClient.invalidateQueries({ queryKey: ["owner", "menu-items"] })
      void queryClient.invalidateQueries({ queryKey: ["owner", "dashboard", "summary"] })
    }
    const handleStoreUpdated = () => {
      void queryClient.invalidateQueries({ queryKey: ["owner", "store-settings"] })
      void queryClient.invalidateQueries({ queryKey: ["owner", "dashboard", "summary"] })
    }
    const handlePromotionUpdated = () => {
      void queryClient.invalidateQueries({ queryKey: ["owner", "vouchers"] })
      void queryClient.invalidateQueries({ queryKey: ["owner", "dashboard", "summary"] })
    }
    const handlePayoutMethodUpdated = () => {
      void queryClient.invalidateQueries({ queryKey: ["owner", "payouts", "summary"] })
      void queryClient.invalidateQueries({ queryKey: ["owner", "payouts", "history"] })
      void queryClient.invalidateQueries({ queryKey: ["owner", "payouts", "transactions"] })
      void queryClient.invalidateQueries({ queryKey: ["owner", "dashboard", "summary"] })
    }
    const handlePayoutUpdated = () => {
      void queryClient.invalidateQueries({ queryKey: ["owner", "payouts", "summary"] })
      void queryClient.invalidateQueries({ queryKey: ["owner", "payouts", "history"] })
      void queryClient.invalidateQueries({ queryKey: ["owner", "payouts", "transactions"] })
      void queryClient.invalidateQueries({ queryKey: ["owner", "dashboard", "summary"] })
    }

    socket.on("notification.created", handleNotification)
    socket.on("order.updated", handleOrderUpdated)
    socket.on("payout.method.updated", handlePayoutMethodUpdated)
    socket.on("payout.updated", handlePayoutUpdated)
    socket.on("menu.updated", handleMenuUpdated)
    socket.on("store.updated", handleStoreUpdated)
    socket.on("promotion.updated", handlePromotionUpdated)

    return () => {
      socket.off("notification.created", handleNotification)
      socket.off("order.updated", handleOrderUpdated)
      socket.off("payout.method.updated", handlePayoutMethodUpdated)
      socket.off("payout.updated", handlePayoutUpdated)
      socket.off("menu.updated", handleMenuUpdated)
      socket.off("store.updated", handleStoreUpdated)
      socket.off("promotion.updated", handlePromotionUpdated)
      socket.off("connect", ensureJoined)
      window.removeEventListener(OWNER_ACCESS_TOKEN_UPDATED_EVENT, reconnectWithFreshToken)
      disconnectOwnerSocket()
    }
  }, [ownerAccount.isAuthenticated, queryClient, setNotifications, setOrders])
}
