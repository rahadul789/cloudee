import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View, type AppStateStatus } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import NetInfo from "@react-native-community/netinfo";

import { connectRiderSocket, disconnectRiderSocket, getRiderSocket } from "@/src/lib/socket-client";
import { playHeadsUpSound } from "@/src/lib/new-order-sound";
import { useDeliveryCopy } from "@/src/lib/copy";
import { getFreshRiderAccessToken } from "@/src/lib/api";
import { patchRiderOrderCaches, type RiderOrder } from "@/src/hooks/use-rider-api";
import { useRiderAuthStore, type RiderProfile } from "@/src/store/auth-store";
import { setDeliveryNetworkOnline, useNetworkStore } from "@/src/store/network-store";
import { palette } from "@/src/theme/palette";

type RiderSocketOrderPayload = RiderOrder & {
  _id?: string;
  id?: string;
};

type RiderAssignmentPayload = {
  orderId?: string;
  orderNumber?: string;
  message?: string;
  assignmentAction?: "assigned" | "reassigned" | "unassigned" | "cancelled";
};

type RiderRestaurantUpdatedPayload = {
  orderId?: string;
};

type RiderHeadsUpPayload = {
  orderId?: string;
  orderNumber?: string;
  restaurantName?: string;
  area?: string;
  readyInMinutes?: number;
};

type AssignmentNotice = {
  title: string;
  message: string;
  orderId?: string;
};

async function markSocketConnectionProblem() {
  const state = await NetInfo.fetch();
  const hasInternet = Boolean(state.isConnected) && state.isInternetReachable !== false;

  if (hasInternet) {
    useNetworkStore
      .getState()
      .markServerIssue("Realtime connection lost. Orders will sync when server reconnects.");
    return;
  }

  setDeliveryNetworkOnline(false);
}

export function RiderSocketBridge() {
  const riderId = useRiderAuthStore((state: { rider: { id?: string } | null }) => state.rider?.id ?? "");
  const accessToken = useRiderAuthStore((state: { accessToken: string }) => state.accessToken);
  const refreshToken = useRiderAuthStore((state: { refreshToken: string }) => state.refreshToken);
  const setSession = useRiderAuthStore((state) => state.setSession);
  const queryClient = useQueryClient();
  const { copy, language } = useDeliveryCopy();
  const [assignmentNotice, setAssignmentNotice] = useState<AssignmentNotice | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appStateRef = useRef(AppState.currentState);
  // Auth token values are read through refs inside the socket effect so that a routine
  // access-token refresh does NOT re-run the effect (which tore the socket down and
  // reconnected + refetched on every refresh — the rider rate-limit storm). The effect
  // only re-runs when auth appears/disappears (hasAuth) or the rider changes.
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;
  const refreshTokenRef = useRef(refreshToken);
  refreshTokenRef.current = refreshToken;
  const lastRealtimeRefetchAtRef = useRef(0);
  // Throttles the map-heavy order-cache update from routine location echoes. The backend
  // re-emits rider.order.updated (with a freshly recomputed route) every ~10s while a
  // delivery is live; applying each one re-rendered the order screen + re-projected the
  // route + animated the follow-camera, which made the app sluggish after pickup. The
  // rider's own position is the native map dot, so the route/ETA only needs a slower
  // refresh — status/assignment changes still apply immediately (see handleOrderUpdated).
  const lastOrderLocationPatchRef = useRef(new Map<string, number>());
  const hasAuth = Boolean(riderId && accessToken);
  const riderSocketCopy = useMemo(() => {
    const riderSocketText = (copy as Record<string, unknown>).riderSocket as Record<string, unknown> | undefined;

    return {
      assignmentUpdated:
        typeof riderSocketText?.assignmentUpdated === "string"
          ? riderSocketText.assignmentUpdated
          : language === "bn"
            ? "অ্যাসাইনমেন্ট আপডেট"
            : "Assignment updated",
      orderCancelled:
        typeof riderSocketText?.orderCancelled === "string"
          ? riderSocketText.orderCancelled
          : language === "bn"
            ? "❌ ডেলিভারি বাতিল হয়েছে"
            : "❌ Delivery cancelled",
      newAssignment:
        typeof riderSocketText?.newAssignment === "string"
          ? riderSocketText.newAssignment
          : language === "bn"
            ? "নতুন অ্যাসাইনমেন্ট"
            : "New assignment",
      assignmentChanged:
        typeof riderSocketText?.assignmentChanged === "string"
          ? riderSocketText.assignmentChanged
          : language === "bn"
            ? "আপনার ডেলিভারি অ্যাসাইনমেন্ট পরিবর্তন হয়েছে।"
            : "Your delivery assignment has changed.",
      viewOrder:
        typeof riderSocketText?.viewOrder === "string"
          ? riderSocketText.viewOrder
          : language === "bn"
            ? "অর্ডার দেখুন"
            : "View order",
      okay:
        typeof riderSocketText?.okay === "string"
          ? riderSocketText.okay
          : language === "bn"
            ? "ঠিক আছে"
            : "Okay",
    };
  }, [copy, language]);

  const showAssignmentNotice = useCallback((notice: AssignmentNotice) => {
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
    }

    setAssignmentNotice(notice);
    noticeTimerRef.current = setTimeout(() => {
      setAssignmentNotice(null);
      noticeTimerRef.current = null;
    }, 7000);
  }, []);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!riderId || !hasAuth) {
      disconnectRiderSocket();
      return;
    }

    const socket = getRiderSocket();
    // Debounced catch-up refetch: socket (re)connects and app-resumes can fire in quick
    // succession, and refetching the order lists on every one is what flooded the rate
    // limiter. One catch-up per window is enough; live-map is left to its own polling.
    const refetchRiderRealtimeState = () => {
      const now = Date.now();
      if (now - lastRealtimeRefetchAtRef.current < 20_000) return;
      lastRealtimeRefetchAtRef.current = now;
      void queryClient.refetchQueries({ queryKey: ["rider", "orders", "available"], type: "active" });
      void queryClient.refetchQueries({ queryKey: ["rider", "orders", "active"], type: "active" });
    };
    const connectIfActive = async () => {
      if (appStateRef.current !== "active") {
        disconnectRiderSocket();
        return;
      }

      const freshAccessToken = await getFreshRiderAccessToken();
      if (!freshAccessToken) {
        disconnectRiderSocket();
        return;
      }

      connectRiderSocket(riderId, freshAccessToken);
    };

    void connectIfActive();
    const handleSocketConnected = () => {
      setDeliveryNetworkOnline(true);
      // Re-join the rider room on every (re)connect. socket.io reconnects the
      // transport but does NOT restore server-side room membership, and the
      // backend only joins on an explicit "rider:join" — without this, a rider
      // silently stops receiving assignment/order events after a network blip
      // until the next poll or app foreground.
      socket.emit("rider:join", riderId);
      refetchRiderRealtimeState();
    };
    const handleSocketDisconnected = (reason: string) => {
      if (reason !== "io client disconnect") {
        void markSocketConnectionProblem();
      }
    };
    const handleConnectError = () => {
      void markSocketConnectionProblem();
    };
    const handleOrderUpdated = (payload: RiderSocketOrderPayload) => {
      const orderId = payload.id ?? payload._id ?? "";
      const activeOrders = queryClient.getQueryData<RiderOrder[]>(["rider", "orders", "active"]) ?? [];
      const availableOrders = queryClient.getQueryData<RiderOrder[]>(["rider", "orders", "available"]) ?? [];
      const cachedOrder = orderId
        ? queryClient.getQueryData<RiderOrder>(["rider", "order", orderId])
        : undefined;
      const shouldBeActive =
        payload.status === "ReadyForPickup" || payload.status === "PickedUp";
      const shouldBeAvailable =
        payload.status === "ReadyForPickup" && payload.assignmentState !== "assigned_to_other";
      const shouldRefetchLists =
        Boolean(orderId) &&
        (!cachedOrder ||
          cachedOrder.status !== payload.status ||
          cachedOrder.assignmentState !== payload.assignmentState ||
          (shouldBeActive && !activeOrders.some((order) => order.id === orderId)) ||
          (shouldBeAvailable && !availableOrders.some((order) => order.id === orderId)));

      // A routine location echo = same order, unchanged status/assignment. Apply at most
      // once per window so the heavy map re-render doesn't fire every ~10s. Anything that
      // actually changes (status/assignment) skips the throttle and applies immediately.
      const isLocationOnlyEcho =
        Boolean(orderId) &&
        Boolean(cachedOrder) &&
        cachedOrder?.status === payload.status &&
        cachedOrder?.assignmentState === payload.assignmentState;
      if (isLocationOnlyEcho) {
        const lastAt = lastOrderLocationPatchRef.current.get(orderId) ?? 0;
        if (Date.now() - lastAt < 20_000) {
          return;
        }
        lastOrderLocationPatchRef.current.set(orderId, Date.now());
      }

      // Do NOT invalidate live-map here: rider.order.updated fires on every location
      // echo while a delivery is live, and refetching /rider/live-map on each one was a
      // per-fix network + re-render storm. The live-map query already polls every 15s.
      patchRiderOrderCaches(queryClient, payload, {
        invalidateLiveMap: false,
        // A location-only echo never changes list membership → skip the 4 list-cache
        // writes (and their subscribers' re-renders); only the order detail needs it.
        patchScopedLists: !isLocationOnlyEcho,
      });

      if (shouldRefetchLists) {
        void queryClient.refetchQueries({ queryKey: ["rider", "orders", "available"], type: "active" });
        void queryClient.refetchQueries({ queryKey: ["rider", "orders", "active"], type: "active" });
      }
    };

    const handleAssignmentUpdated = (payload: RiderAssignmentPayload) => {
      void queryClient.invalidateQueries({ queryKey: ["rider", "orders"] });
      void queryClient.invalidateQueries({ queryKey: ["rider", "profile"] });
      void queryClient.invalidateQueries({ queryKey: ["rider", "live-map"] });
      void queryClient.refetchQueries({ queryKey: ["rider", "orders", "available"], type: "active" });
      void queryClient.refetchQueries({ queryKey: ["rider", "orders", "active"], type: "active" });

      const orderId = payload.orderId;
      if (orderId) {
        queryClient.invalidateQueries({ queryKey: ["rider", "order", orderId] });
      }

      showAssignmentNotice({
        title:
          payload.assignmentAction === "cancelled"
            ? riderSocketCopy.orderCancelled
            : payload.assignmentAction === "unassigned"
              ? riderSocketCopy.assignmentUpdated
              : riderSocketCopy.newAssignment,
        message: payload.message ?? riderSocketCopy.assignmentChanged,
        orderId,
      });
    };

    // Advisory "new order coming" heads-up (Approach A) — not an assignment. Play the sound
    // in-app (foreground) + show a banner so the rider can start heading to the restaurant.
    const handleHeadsUp = (payload: RiderHeadsUpPayload) => {
      void playHeadsUpSound(payload.orderId);
      const restaurantName = payload.restaurantName?.trim();
      const minutes =
        typeof payload.readyInMinutes === "number" && payload.readyInMinutes > 0
          ? payload.readyInMinutes
          : null;
      const title = language === "bn" ? "🛵 নতুন অর্ডার আসছে" : "🛵 Incoming order";
      const message = restaurantName
        ? minutes
          ? language === "bn"
            ? `${restaurantName} — প্রায় ${minutes} মিনিটে রেডি। আগেভাগে রওনা দিন।`
            : `${restaurantName} — ready in ~${minutes} min. Head over early.`
          : language === "bn"
            ? `${restaurantName} — শীঘ্রই পিকআপের জন্য রেডি হবে।`
            : `${restaurantName} — will be ready for pickup soon.`
        : language === "bn"
          ? "কাছাকাছি একটি নতুন অর্ডার আসছে।"
          : "A new order is coming nearby.";
      // Info-only banner (no orderId → not tappable to an order the rider isn't assigned to).
      showAssignmentNotice({ title, message });
    };

    const handleHeadsUpCancelled = (_payload: RiderHeadsUpPayload) => {
      showAssignmentNotice({
        title: language === "bn" ? "অর্ডার বাতিল" : "Order cancelled",
        message:
          language === "bn"
            ? "যে অর্ডারের জন্য প্রস্তুত হচ্ছিলেন সেটি বাতিল হয়েছে।"
            : "The order you were heading for has been cancelled.",
      });
    };

    const handleProfileUpdated = (payload?: RiderProfile) => {
      // Profile events now represent rider state changes (availability/focused trip),
      // not every location ping, so patch auth/profile cache without a refetch.
      if (payload?.id) {
        queryClient.setQueryData(["rider", "profile"], payload);
        if (accessTokenRef.current && refreshTokenRef.current) {
          setSession({
            rider: payload,
            accessToken: accessTokenRef.current,
            refreshToken: refreshTokenRef.current,
          });
        }
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["rider", "profile"] });
    };
    const handleRestaurantUpdated = (payload: RiderRestaurantUpdatedPayload) => {
      queryClient.invalidateQueries({ queryKey: ["rider", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["rider", "live-map"] });
      if (payload.orderId) {
        queryClient.invalidateQueries({ queryKey: ["rider", "order", payload.orderId] });
      }
    };
    const handleNotificationCreated = () => {
      queryClient.invalidateQueries({ queryKey: ["rider", "notifications"] });
    };
    const handleAppStateChange = (nextState: AppStateStatus) => {
      appStateRef.current = nextState;

      if (nextState === "active") {
        void connectIfActive();
        refetchRiderRealtimeState();
        return;
      }

      disconnectRiderSocket();
    };

    socket.on("connect", handleSocketConnected);
    socket.on("disconnect", handleSocketDisconnected);
    socket.on("connect_error", handleConnectError);
    socket.on("rider.order.updated", handleOrderUpdated);
    socket.on("rider.assignment.updated", handleAssignmentUpdated);
    socket.on("rider.profile.updated", handleProfileUpdated);
    socket.on("rider.restaurant.updated", handleRestaurantUpdated);
    socket.on("rider.notification.created", handleNotificationCreated);
    socket.on("rider.order.headsup", handleHeadsUp);
    socket.on("rider.order.headsup.cancelled", handleHeadsUpCancelled);
    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      subscription.remove();
      socket.off("connect", handleSocketConnected);
      socket.off("disconnect", handleSocketDisconnected);
      socket.off("connect_error", handleConnectError);
      socket.off("rider.order.updated", handleOrderUpdated);
      socket.off("rider.assignment.updated", handleAssignmentUpdated);
      socket.off("rider.profile.updated", handleProfileUpdated);
      socket.off("rider.restaurant.updated", handleRestaurantUpdated);
      socket.off("rider.notification.created", handleNotificationCreated);
      socket.off("rider.order.headsup", handleHeadsUp);
      socket.off("rider.order.headsup.cancelled", handleHeadsUpCancelled);
      disconnectRiderSocket();
    };
  }, [hasAuth, queryClient, riderId, riderSocketCopy, setSession, showAssignmentNotice]);

  // Keep the socket's auth token current so an internal reconnect (a network blip) uses a
  // fresh token — without tearing the whole effect down + refetching on every refresh.
  useEffect(() => {
    if (!hasAuth) return;
    getRiderSocket().auth = { token: accessToken };
  }, [accessToken, hasAuth]);

  if (!assignmentNotice) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={styles.noticeHost}>
      <Pressable
        accessibilityRole={assignmentNotice.orderId ? "button" : undefined}
        onPress={() => {
          if (!assignmentNotice.orderId) return;
          setAssignmentNotice(null);
          router.push(`/orders/${assignmentNotice.orderId}`);
        }}
        style={({ pressed }) => [styles.noticeCard, pressed ? styles.noticePressed : null]}
      >
        <View style={styles.noticeIcon}>
          <Text style={styles.noticeIconText}>!</Text>
        </View>
        <View style={styles.noticeCopy}>
          <Text style={styles.noticeTitle}>{assignmentNotice.title}</Text>
          <Text numberOfLines={2} style={styles.noticeMessage}>
            {assignmentNotice.message}
          </Text>
        </View>
        {assignmentNotice.orderId ? (
          <Text style={styles.noticeAction}>{riderSocketCopy.viewOrder}</Text>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  noticeHost: {
    position: "absolute",
    left: 14,
    right: 14,
    top: 58,
    zIndex: 80,
  },
  noticeCard: {
    minHeight: 72,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: "#FFCEE0",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 9,
  },
  noticePressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },
  noticeIcon: {
    width: 36,
    height: 36,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFEAF2",
  },
  noticeIconText: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "900",
    color: palette.secondary,
  },
  noticeCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  noticeTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: palette.foreground,
  },
  noticeMessage: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  noticeAction: {
    fontSize: 12,
    fontWeight: "900",
    color: palette.secondary,
  },
});
