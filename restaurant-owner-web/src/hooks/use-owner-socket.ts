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
  type OwnerSidebarSummaryResponse,
} from "@/lib/backend-mappers"
import { patchOwnerOrderQueryCaches } from "@/lib/owner-order-cache"
import { dispatchOwnerNewOrderEvent } from "@/lib/owner-realtime-events"
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

function isLiveOrder(order: Order | null | undefined) {
  return Boolean(order && activeOrderStatuses.has(order.currentStatus))
}

function isValidPlacedOrder(order: Order) {
  return order.currentStatus !== "Cancelled" && order.currentStatus !== "Rejected"
}

function patchSidebarSummaryForOrderChange(
  summary: OwnerSidebarSummaryResponse,
  previousOrder: Order | null,
  nextOrder: Order,
  eventType: "created" | "updated"
) {
  const previousLive = isLiveOrder(previousOrder)
  const nextLive = isLiveOrder(nextOrder)
  const liveDelta =
    eventType === "created"
      ? nextLive
        ? 1
        : 0
      : previousOrder
        ? Number(nextLive) - Number(previousLive)
        : 0

  if (liveDelta === 0) return summary

  return {
    ...summary,
    liveOrders: Math.max(0, summary.liveOrders + liveDelta),
  }
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

function shouldRefreshPayoutsForOrderChange(
  previousOrder: Order | null,
  nextOrder: Order
) {
  return (
    previousOrder?.currentStatus === "Delivered" ||
    nextOrder.currentStatus === "Delivered"
  )
}

export function useOwnerSocketBridge() {
  const ownerAccount = useAppStore((state) => state.ownerAccount)
  const setNotifications = useAppStore((state) => state.setNotifications)
  const setOrders = useAppStore((state) => state.setOrders)
  const queryClient = useQueryClient()
  const joinedRef = React.useRef<string | null>(null)
  const tokenRef = React.useRef<string | null>(null)
  const alertedNewOrderIdsRef = React.useRef<Set<string>>(new Set())
  const realtimeRefreshTimerRef = React.useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const disconnectedRefreshTimerRef = React.useRef<ReturnType<typeof window.setInterval> | null>(null)

  React.useEffect(() => {
    if (!ownerAccount.isAuthenticated) {
      joinedRef.current = null
      tokenRef.current = null
      alertedNewOrderIdsRef.current.clear()
      if (disconnectedRefreshTimerRef.current) {
        window.clearInterval(disconnectedRefreshTimerRef.current)
        disconnectedRefreshTimerRef.current = null
      }
      disconnectOwnerSocket()
      return
    }

    const ownerSession = resolveOwnerSession()
    if (!ownerSession) return

    const { ownerId, accessToken } = ownerSession

    if (joinedRef.current !== ownerId || tokenRef.current !== accessToken) {
      connectOwnerSocket(ownerId, accessToken)
      alertedNewOrderIdsRef.current.clear()
      joinedRef.current = ownerId
      tokenRef.current = accessToken
    }

    const socket = getOwnerSocket()
    const ensureJoined = () => socket.emit("owner:join", ownerId)
    const refreshOwnerRealtimeState = () => {
      void queryClient.invalidateQueries({ queryKey: ["owner", "sidebar-summary"] })
      void queryClient.refetchQueries({ queryKey: ["owner", "sidebar-summary"], type: "active" })
      void queryClient.refetchQueries({ queryKey: ["owner", "orders"], type: "active" })
      void queryClient.invalidateQueries({ queryKey: ["owner", "dashboard"] })
      void queryClient.invalidateQueries({ queryKey: ["owner", "payouts"] })
      void queryClient.invalidateQueries({ queryKey: ["owner", "notifications"] })
    }
    const refreshOwnerDisconnectedFallbackState = () => {
      void queryClient.invalidateQueries({ queryKey: ["owner", "sidebar-summary"] })
      void queryClient.refetchQueries({ queryKey: ["owner", "sidebar-summary"], type: "active" })
      void queryClient.refetchQueries({ queryKey: ["owner", "orders"], type: "active" })
    }
    const stopDisconnectedRefresh = () => {
      if (!disconnectedRefreshTimerRef.current) return
      window.clearInterval(disconnectedRefreshTimerRef.current)
      disconnectedRefreshTimerRef.current = null
    }
    const startDisconnectedRefresh = () => {
      if (disconnectedRefreshTimerRef.current) return
      refreshOwnerDisconnectedFallbackState()
      disconnectedRefreshTimerRef.current = window.setInterval(
        refreshOwnerDisconnectedFallbackState,
        15_000
      )
    }
    const scheduleOwnerRealtimeRefresh = (options?: { includePayouts?: boolean }) => {
      if (realtimeRefreshTimerRef.current) {
        window.clearTimeout(realtimeRefreshTimerRef.current)
      }

      realtimeRefreshTimerRef.current = window.setTimeout(() => {
        realtimeRefreshTimerRef.current = null
        void queryClient.invalidateQueries({ queryKey: ["owner", "sidebar-summary"] })
        void queryClient.refetchQueries({ queryKey: ["owner", "sidebar-summary"], type: "active" })
        void queryClient.invalidateQueries({ queryKey: ["owner", "orders"] })
        void queryClient.refetchQueries({ queryKey: ["owner", "orders"], type: "active" })
        void queryClient.invalidateQueries({ queryKey: ["owner", "dashboard"] })
        void queryClient.invalidateQueries({ queryKey: ["owner", "notifications"] })
        if (options?.includePayouts) {
          void queryClient.invalidateQueries({ queryKey: ["owner", "payouts"] })
        }
      }, 180)
    }
    const handleConnected = () => {
      stopDisconnectedRefresh()
      ensureJoined()
      refreshOwnerRealtimeState()
    }
    const handleDisconnected = () => {
      startDisconnectedRefresh()
    }
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
      socket.emit("owner:join", latestSession.ownerId)
      refreshOwnerRealtimeState()
    }
    socket.on("connect", handleConnected)
    socket.on("disconnect", handleDisconnected)
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
      queryClient.setQueryData(
        ["owner", "sidebar-summary"],
        (current: OwnerSidebarSummaryResponse | undefined) =>
          current
            ? {
                ...current,
                unreadNotifications:
                  current.unreadNotifications + (payload.isRead ? 0 : 1),
              }
            : current
      )
      queryClient.invalidateQueries({ queryKey: ["owner", "sidebar-summary"] })
      scheduleOwnerRealtimeRefresh({ includePayouts: mapped.type === "payout" })

      if (mapped.type === "payout") {
        queryClient.invalidateQueries({ queryKey: ["owner", "payouts", "summary"] })
        queryClient.invalidateQueries({ queryKey: ["owner", "payouts", "history"] })
        queryClient.invalidateQueries({ queryKey: ["owner", "payouts", "transactions"] })
        queryClient.invalidateQueries({ queryKey: ["owner", "dashboard", "summary"] })
      }

      if (mapped.type === "review") {
        queryClient.invalidateQueries({ queryKey: ["owner", "reviews"] })
        queryClient.invalidateQueries({ queryKey: ["owner", "sidebar-summary"] })
      }

      if (mapped.type === "promotion") {
        queryClient.invalidateQueries({ queryKey: ["owner", "vouchers"] })
        queryClient.invalidateQueries({ queryKey: ["owner", "sidebar-summary"] })
      }

      if (mapped.type === "support") {
        queryClient.invalidateQueries({ queryKey: ["owner", "support-cases"] })
      }
    }

    const handleOrderRealtime = (
      payload: OwnerOrderResponse,
      eventType: "created" | "updated"
    ) => {
      const mapped = mapOwnerOrder(payload)
      const previousOrder =
        useAppStore
          .getState()
          .orders.find((order) => order.id === mapped.id) ?? null
      const shouldShowNewOrderModal =
        mapped.currentStatus === "New" &&
        !alertedNewOrderIdsRef.current.has(mapped.id) &&
        (eventType === "created" || !previousOrder)

      if (shouldShowNewOrderModal) {
        alertedNewOrderIdsRef.current.add(mapped.id)
      }

      setOrders((current) => {
        const exists = current.some((order) => order.id === mapped.id)
        return exists
          ? current.map((order) => (order.id === mapped.id ? mapped : order))
          : [mapped, ...current]
      })

      patchOwnerOrderQueryCaches(queryClient, payload)
      queryClient.setQueryData(
        ["owner", "sidebar-summary"],
        (current: OwnerSidebarSummaryResponse | undefined) =>
          current
            ? patchSidebarSummaryForOrderChange(
                current,
                previousOrder,
                mapped,
                eventType
              )
            : current
      )
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
      if (shouldRefreshPayoutsForOrderChange(previousOrder, mapped)) {
        scheduleOwnerRealtimeRefresh({ includePayouts: true })
        void queryClient.invalidateQueries({ queryKey: ["owner", "payouts", "summary"] })
        void queryClient.invalidateQueries({ queryKey: ["owner", "payouts", "history"] })
        void queryClient.invalidateQueries({ queryKey: ["owner", "payouts", "transactions"] })
      } else {
        scheduleOwnerRealtimeRefresh()
      }

      if (shouldShowNewOrderModal) {
        window.setTimeout(() => dispatchOwnerNewOrderEvent(mapped.id), 0)
      }
    }

    const handleMenuUpdated = () => {
      void queryClient.invalidateQueries({ queryKey: ["owner", "menu-items"] })
      void queryClient.invalidateQueries({ queryKey: ["owner", "menu-approval-requests"] })
      void queryClient.invalidateQueries({ queryKey: ["owner", "categories"] })
      void queryClient.invalidateQueries({ queryKey: ["owner", "sidebar-summary"] })
      void queryClient.invalidateQueries({ queryKey: ["owner", "dashboard", "summary"] })
    }
    const handleMenuApprovalUpdated = () => {
      void queryClient.invalidateQueries({ queryKey: ["owner", "menu-approval-requests"] })
      void queryClient.invalidateQueries({ queryKey: ["owner", "menu-items"] })
    }
    const handleStoreUpdated = () => {
      void queryClient.invalidateQueries({ queryKey: ["owner", "store-settings"] })
      void queryClient.invalidateQueries({ queryKey: ["owner", "dashboard", "summary"] })
    }
    const handlePromotionUpdated = () => {
      void queryClient.invalidateQueries({ queryKey: ["owner", "vouchers"] })
      void queryClient.invalidateQueries({ queryKey: ["owner", "sidebar-summary"] })
      void queryClient.refetchQueries({ queryKey: ["owner", "sidebar-summary"], type: "active" })
      void queryClient.invalidateQueries({ queryKey: ["owner", "dashboard", "summary"] })
    }
    const handleReviewUpdated = () => {
      void queryClient.invalidateQueries({ queryKey: ["owner", "reviews"] })
      void queryClient.invalidateQueries({ queryKey: ["owner", "sidebar-summary"] })
      void queryClient.refetchQueries({ queryKey: ["owner", "sidebar-summary"], type: "active" })
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
    const handleOrderCreated = (payload: OwnerOrderResponse) =>
      handleOrderRealtime(payload, "created")
    const handleOrderUpdated = (payload: OwnerOrderResponse) =>
      handleOrderRealtime(payload, "updated")
    socket.on("order.created", handleOrderCreated)
    socket.on("order.updated", handleOrderUpdated)
    socket.on("payout.method.updated", handlePayoutMethodUpdated)
    socket.on("payout.updated", handlePayoutUpdated)
    socket.on("menu.updated", handleMenuUpdated)
    socket.on("menu.approval.updated", handleMenuApprovalUpdated)
    socket.on("store.updated", handleStoreUpdated)
    socket.on("promotion.updated", handlePromotionUpdated)
    socket.on("review.updated", handleReviewUpdated)

    if (!socket.connected) {
      startDisconnectedRefresh()
    }

    return () => {
      if (realtimeRefreshTimerRef.current) {
        window.clearTimeout(realtimeRefreshTimerRef.current)
        realtimeRefreshTimerRef.current = null
      }
      stopDisconnectedRefresh()
      socket.off("notification.created", handleNotification)
      socket.off("order.created", handleOrderCreated)
      socket.off("order.updated", handleOrderUpdated)
      socket.off("payout.method.updated", handlePayoutMethodUpdated)
      socket.off("payout.updated", handlePayoutUpdated)
      socket.off("menu.updated", handleMenuUpdated)
      socket.off("menu.approval.updated", handleMenuApprovalUpdated)
      socket.off("store.updated", handleStoreUpdated)
      socket.off("promotion.updated", handlePromotionUpdated)
      socket.off("review.updated", handleReviewUpdated)
      socket.off("connect", handleConnected)
      socket.off("disconnect", handleDisconnected)
      window.removeEventListener(OWNER_ACCESS_TOKEN_UPDATED_EVENT, reconnectWithFreshToken)
      disconnectOwnerSocket()
    }
  }, [ownerAccount.isAuthenticated, queryClient, setNotifications, setOrders])
}
