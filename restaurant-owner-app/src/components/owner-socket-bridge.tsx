import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

import type {
  OwnerListResponse,
  OwnerNotification,
  OwnerOrder,
} from "@/src/hooks/use-owner-api";
import {
  connectOwnerSocket,
  disconnectOwnerSocket,
  getOwnerSocket,
} from "@/src/lib/socket-client";
import { patchOwnerOrderQueryCaches } from "@/src/lib/owner-order-cache";
import { playNewOrderSound } from "@/src/lib/new-order-sound";
import { useOwnerAuthStore } from "@/src/store/auth-store";

function isForegroundAppState(state: AppStateStatus) {
  return state === "active" || state === "unknown";
}

function findCachedOwnerOrder(queryClient: QueryClient, orderId: string) {
  const detail = queryClient.getQueryData<OwnerOrder>([
    "owner",
    "orders",
    "details",
    orderId,
  ]);
  if (detail) return detail;

  const queryCache = queryClient.getQueryCache();
  for (const query of queryCache.findAll({ queryKey: ["owner", "orders"] })) {
    const data = query.state.data;
    if (
      !data ||
      typeof data !== "object" ||
      !("items" in (data as Record<string, unknown>))
    ) {
      continue;
    }

    const result = data as OwnerListResponse<OwnerOrder>;
    const match = result.items?.find((order) => order._id === orderId);
    if (match) return match;
  }

  return null;
}

function shouldRefreshPayoutsForOrderChange(
  previousOrder: OwnerOrder | null,
  nextOrder: OwnerOrder,
) {
  return previousOrder?.status === "Delivered" || nextOrder.status === "Delivered";
}

export function OwnerSocketBridge() {
  const queryClient = useQueryClient();
  const owner = useOwnerAuthStore((state) => state.owner);
  const accessToken = useOwnerAuthStore((state) => state.accessToken);
  const joinedRef = useRef("");
  const tokenRef = useRef("");
  const appStateRef = useRef(AppState.currentState);
  const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Order ids we've already played the new-order sound for, so a socket reconnect that
  // re-emits `order.created` (or a duplicate emit) never double-chimes the same order.
  const soundedOrderIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!owner?.id || !accessToken) {
      joinedRef.current = "";
      tokenRef.current = "";
      disconnectOwnerSocket();
      return;
    }

    const connectIfActive = () => {
      if (!isForegroundAppState(appStateRef.current)) {
        joinedRef.current = "";
        tokenRef.current = "";
        disconnectOwnerSocket();
        return;
      }

      connectOwnerSocket(owner.id, accessToken);
      joinedRef.current = owner.id;
      tokenRef.current = accessToken;
    };

    if (
      isForegroundAppState(appStateRef.current) &&
      (joinedRef.current !== owner.id || tokenRef.current !== accessToken)
    ) {
      connectIfActive();
    }

    const socket = getOwnerSocket();
    const ensureJoined = () => socket.emit("owner:join", owner.id);
    const refreshOwnerRealtimeState = () => {
      void queryClient.refetchQueries({ queryKey: ["owner", "orders"], type: "active" });
      void queryClient.refetchQueries({
        queryKey: ["owner", "orders", "details"],
        type: "active",
      });
      void queryClient.invalidateQueries({ queryKey: ["owner", "dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["owner", "payouts"] });
      void queryClient.invalidateQueries({ queryKey: ["owner", "notifications"] });
    };
    const scheduleOwnerRealtimeRefresh = (options?: { includePayouts?: boolean }) => {
      if (realtimeRefreshTimerRef.current) {
        clearTimeout(realtimeRefreshTimerRef.current);
      }

      realtimeRefreshTimerRef.current = setTimeout(() => {
        realtimeRefreshTimerRef.current = null;
        void queryClient.invalidateQueries({ queryKey: ["owner", "orders"] });
        void queryClient.refetchQueries({ queryKey: ["owner", "orders"], type: "active" });
        void queryClient.refetchQueries({
          queryKey: ["owner", "orders", "details"],
          type: "active",
        });
        void queryClient.invalidateQueries({ queryKey: ["owner", "dashboard"] });
        void queryClient.invalidateQueries({ queryKey: ["owner", "notifications"] });
        if (options?.includePayouts) {
          void queryClient.invalidateQueries({ queryKey: ["owner", "payouts"] });
        }
      }, 180);
    };
    const handleConnected = () => {
      ensureJoined();
      refreshOwnerRealtimeState();
    };
    const handleOrderUpdated = (payload: OwnerOrder) => {
      const previousOrder = findCachedOwnerOrder(queryClient, payload._id);
      const shouldRefreshPayouts = shouldRefreshPayoutsForOrderChange(
        previousOrder,
        payload,
      );
      patchOwnerOrderQueryCaches(queryClient, payload);
      void queryClient.invalidateQueries({
        queryKey: ["owner", "orders", "details", payload._id],
      });
      scheduleOwnerRealtimeRefresh({ includePayouts: shouldRefreshPayouts });
    };
    // A brand-new order arrived while the app is open. Play the alert sound in-app FIRST
    // (top priority — never miss it), then run the normal cache update. The socket only
    // delivers while foreground, so receiving this event means the owner is in the app.
    const handleOrderCreated = (payload: OwnerOrder) => {
      // order.created fires once, only when a brand-new order is placed (New, or Accepted when
      // the restaurant auto-accepts) — either way the owner must hear it. Dedup by id so a
      // socket reconnect that re-emits it never double-chimes.
      const orderId = payload?._id;
      if (orderId && !soundedOrderIdsRef.current.has(orderId)) {
        soundedOrderIdsRef.current.add(orderId);
        void playNewOrderSound(orderId);
      }
      handleOrderUpdated(payload);
    };
    const handleNotificationCreated = (payload?: OwnerNotification) => {
      scheduleOwnerRealtimeRefresh({ includePayouts: payload?.type === "payout" });
      if (payload?.type === "review") {
        void queryClient.invalidateQueries({ queryKey: ["owner", "reviews"] });
      }
    };
    const handlePayoutMethodUpdated = () => {
      void queryClient.invalidateQueries({ queryKey: ["owner", "payouts"] });
      void queryClient.invalidateQueries({ queryKey: ["owner", "dashboard"] });
    };
    const handlePayoutUpdated = () => {
      void queryClient.invalidateQueries({ queryKey: ["owner", "payouts"] });
      void queryClient.invalidateQueries({ queryKey: ["owner", "dashboard"] });
    };
    const handleMenuUpdated = () => {
      void queryClient.invalidateQueries({ queryKey: ["owner", "menu-items"] });
    };
    const handleStoreUpdated = () => {
      void queryClient.invalidateQueries({ queryKey: ["owner", "store-settings"] });
      void queryClient.invalidateQueries({ queryKey: ["owner", "dashboard"] });
    };
    const handlePromotionUpdated = () => {
      void queryClient.invalidateQueries({ queryKey: ["owner", "vouchers"] });
      void queryClient.invalidateQueries({ queryKey: ["owner", "dashboard"] });
    };
    const handleReviewUpdated = () => {
      void queryClient.invalidateQueries({ queryKey: ["owner", "reviews"] });
      void queryClient.invalidateQueries({ queryKey: ["owner", "dashboard"] });
    };
    const handleAppStateChange = (nextState: AppStateStatus) => {
      appStateRef.current = nextState;

      if (isForegroundAppState(nextState)) {
        connectIfActive();
        ensureJoined();
        refreshOwnerRealtimeState();
        return;
      }

      joinedRef.current = "";
      tokenRef.current = "";
      disconnectOwnerSocket();
    };

    socket.on("connect", handleConnected);
    socket.on("order.created", handleOrderCreated);
    socket.on("order.updated", handleOrderUpdated);
    socket.on("notification.created", handleNotificationCreated);
    socket.on("payout.method.updated", handlePayoutMethodUpdated);
    socket.on("payout.updated", handlePayoutUpdated);
    socket.on("menu.updated", handleMenuUpdated);
    socket.on("store.updated", handleStoreUpdated);
    socket.on("promotion.updated", handlePromotionUpdated);
    socket.on("review.updated", handleReviewUpdated);
    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      if (realtimeRefreshTimerRef.current) {
        clearTimeout(realtimeRefreshTimerRef.current);
        realtimeRefreshTimerRef.current = null;
      }
      subscription.remove();
      socket.off("connect", handleConnected);
      socket.off("order.created", handleOrderCreated);
      socket.off("order.updated", handleOrderUpdated);
      socket.off("notification.created", handleNotificationCreated);
      socket.off("payout.method.updated", handlePayoutMethodUpdated);
      socket.off("payout.updated", handlePayoutUpdated);
      socket.off("menu.updated", handleMenuUpdated);
      socket.off("store.updated", handleStoreUpdated);
      socket.off("promotion.updated", handlePromotionUpdated);
      socket.off("review.updated", handleReviewUpdated);
      disconnectOwnerSocket();
    };
  }, [accessToken, owner?.id, queryClient]);

  return null;
}
