import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View, type AppStateStatus } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import NetInfo from "@react-native-community/netinfo";

import { connectRiderSocket, disconnectRiderSocket, getRiderSocket } from "@/src/lib/socket-client";
import { useDeliveryCopy } from "@/src/lib/copy";
import { getFreshRiderAccessToken } from "@/src/lib/api";
import { patchRiderOrderCaches, type RiderOrder } from "@/src/hooks/use-rider-api";
import { useRiderAuthStore } from "@/src/store/auth-store";
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
  assignmentAction?: "assigned" | "reassigned" | "unassigned";
};

type RiderRestaurantUpdatedPayload = {
  orderId?: string;
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
  const queryClient = useQueryClient();
  const { copy, language } = useDeliveryCopy();
  const [assignmentNotice, setAssignmentNotice] = useState<AssignmentNotice | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const riderSocketCopy = useMemo(() => {
    const riderSocketText = (copy as Record<string, unknown>).riderSocket as Record<string, unknown> | undefined;

    return {
      assignmentUpdated:
        typeof riderSocketText?.assignmentUpdated === "string"
          ? riderSocketText.assignmentUpdated
          : language === "bn"
            ? "অ্যাসাইনমেন্ট আপডেট"
            : "Assignment updated",
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
    if (!riderId || !accessToken) {
      disconnectRiderSocket();
      return;
    }

    const socket = getRiderSocket();
    const refetchRiderRealtimeState = () => {
      void queryClient.refetchQueries({ queryKey: ["rider", "orders", "available"], type: "active" });
      void queryClient.refetchQueries({ queryKey: ["rider", "orders", "active"], type: "active" });
      void queryClient.invalidateQueries({ queryKey: ["rider", "live-map"] });
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

      patchRiderOrderCaches(queryClient, payload, { invalidateLiveMap: true });

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
          payload.assignmentAction === "unassigned"
            ? riderSocketCopy.assignmentUpdated
            : riderSocketCopy.newAssignment,
        message: payload.message ?? riderSocketCopy.assignmentChanged,
        orderId,
      });
    };

    const handleProfileUpdated = () => {
      queryClient.invalidateQueries({ queryKey: ["rider", "profile"] });
      queryClient.invalidateQueries({ queryKey: ["rider", "live-map"] });
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
      disconnectRiderSocket();
    };
  }, [accessToken, queryClient, riderId, riderSocketCopy, showAssignmentNotice]);

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
