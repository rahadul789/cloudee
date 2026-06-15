import * as React from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { useCustomerActiveOrderQuery } from "@/src/hooks/use-customer-api";
import { connectCustomerSocket, disconnectCustomerSocket, getCustomerSocket } from "@/src/lib/socket-client";
import { useCustomerAuthStore } from "@/src/store/auth-store";
import { useAppBannerStore } from "@/src/store/app-banner-store";

type CustomerOrderPayload = {
  _id: string;
  restaurantId?: string;
  orderNumber: string;
  status: string;
  paymentMethod: string;
  terminalReason?: string;
  cancelledBy?: string;
  customerSnapshot?: {
    id?: string;
    fullName?: string;
    phone?: string;
    deliveryAddress?: {
      label?: string;
      addressLine?: string;
      addressDetails?: string;
      latitude?: number | null;
      longitude?: number | null;
    };
  };
  pricing?: {
    subtotal?: number;
    deliveryFee?: number;
    discountAmount?: number;
    total?: number;
  };
  riderSnapshot?: {
    id?: string;
    name?: string;
    phone?: string;
    vehicleType?: string;
  };
  riderTracking?: {
    isActive?: boolean;
    startedAt?: string;
    lastUpdatedAt?: string;
    freshness?: {
      lastUpdatedAt?: string | null;
      ageSeconds?: number | null;
      isFresh?: boolean;
      isStale?: boolean;
      state?: "live" | "stale" | "unavailable";
    };
    remainingDistanceKm?: number;
    directDistanceKm?: number;
    remainingDurationMinutes?: number;
    speedKmph?: number;
    isNearCustomer?: boolean;
    nearCustomerNotifiedAt?: string | null;
    currentLocation?: {
      latitude?: number;
      longitude?: number;
      heading?: number | null;
      accuracyMeters?: number | null;
    };
  };
  itemsSnapshot?: {
    itemId?: string;
    name?: string;
    quantity?: number;
    unitPrice?: number;
  }[];
  history?: {
    status: string;
    actor: string;
    note?: string;
    createdAt: string;
  }[];
  timestamps?: {
    placedAt?: string;
    acceptedAt?: string;
    preparingAt?: string;
    readyForPickupAt?: string;
    pickedUpAt?: string;
    deliveredAt?: string;
    cancelledAt?: string;
  };
  createdAt: string;
};

type CustomerNotificationPayload = {
  id: string;
  type: string;
  title: string;
  description: string;
  path: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
};

type CustomerSupportPayload = {
  id: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  subject: string;
  createdAt: string;
  updatedAt: string;
  messages: {
    id: string;
    senderType: "customer" | "admin";
    senderName: string;
    message: string;
    createdAt: string;
    attachments: {
      url: string;
      publicId?: string;
      fileName?: string;
      fileType?: string;
    }[];
  }[];
};

const LIVE_ORDER_STATUSES = [
  "New",
  "Accepted",
  "Preparing",
  "ReadyForPickup",
  "PickedUp",
];

const HISTORY_ORDER_STATUSES = ["Delivered", "Rejected", "Cancelled"];

function isLiveOrderStatus(status: string) {
  return LIVE_ORDER_STATUSES.includes(status);
}

function upsertOrderList(
  current: CustomerOrderPayload[] | undefined,
  nextOrder: CustomerOrderPayload
) {
  const list = current ?? [];
  const exists = list.some((order) => order._id === nextOrder._id);

  const updated = exists
    ? list.map((order) => (order._id === nextOrder._id ? nextOrder : order))
    : [nextOrder, ...list];

  return [...updated].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
}

function upsertLiveOrderList(
  current: CustomerOrderPayload[] | undefined,
  nextOrder: CustomerOrderPayload
) {
  if (!isLiveOrderStatus(nextOrder.status)) {
    return (current ?? []).filter((order) => order._id !== nextOrder._id);
  }

  return upsertOrderList(current, nextOrder);
}

function getOrderBanner(status: string) {
  switch (status) {
    case "New":
      return null;
    case "Accepted":
      return {
        tone: "success" as const,
        emoji: "✅",
        title: "Order accepted",
        description: "The restaurant has accepted your order.",
      };
    case "Preparing":
      return {
        tone: "info" as const,
        emoji: "👨‍🍳",
        title: "Food is preparing",
        description: "Your food is being prepared now.",
      };
    case "ReadyForPickup":
      return {
        tone: "info" as const,
        emoji: "🛍️",
        title: "Ready for pickup",
        description: "Your order is packed and waiting for the rider.",
      };
    case "PickedUp":
      return {
        tone: "info" as const,
        emoji: "🛵",
        title: "On the way",
        description: "Your rider picked up the order and is heading to you.",
      };
    case "Delivered":
      return {
        tone: "success" as const,
        emoji: "🎉",
        title: "Delivered",
        description: "Your food has arrived. Tap to rate your order.",
      };
    case "Rejected":
      return {
        tone: "warning" as const,
        emoji: "😕",
        title: "Order not accepted",
        description: "The restaurant could not accept your order. Please try another restaurant.",
      };
    case "Cancelled":
      return {
        tone: "warning" as const,
        emoji: "⚠️",
        title: "Order cancelled",
        description: "Your order was cancelled.",
      };
    default:
      return null;
  }
}

function extractOrderIdFromPath(path?: string) {
  if (!path) return null;
  const match = path.match(/\/orders\/([^/?#]+)/);
  return match?.[1] ?? null;
}

export function useCustomerSocketBridge() {
  const queryClient = useQueryClient();
  const customer = useCustomerAuthStore((state) => state.customer);
  const accessToken = useCustomerAuthStore((state) => state.accessToken);
  const showBanner = useAppBannerStore((state) => state.showBanner);
  const { data: activeOrder, refetch: refetchActiveOrder } = useCustomerActiveOrderQuery(
    Boolean(customer?.id && accessToken)
  );
  const hasLiveOrder = Boolean(
    activeOrder && isLiveOrderStatus(activeOrder.status)
  );
  const joinedRef = React.useRef<string | null>(null);
  const appStateRef = React.useRef(AppState.currentState);

  React.useEffect(() => {
    if (!customer?.id || !accessToken) {
      joinedRef.current = null;
      disconnectCustomerSocket();
      return;
    }

    const connectIfNeeded = () => {
      if (!hasLiveOrder) {
        joinedRef.current = null;
        disconnectCustomerSocket();
        return null;
      }

      connectCustomerSocket(customer.id, accessToken);
      joinedRef.current = customer.id;
      return getCustomerSocket();
    };

    const socket = appStateRef.current === "active" ? connectIfNeeded() : null;
    const ensureJoined = () => socket?.emit("customer:join", customer.id);

    const handleOrderEvent = (payload: CustomerOrderPayload) => {
      queryClient.setQueryData<CustomerOrderPayload[]>(["customer", "orders"], (current) =>
        upsertOrderList(current, payload)
      );
      queryClient.setQueryData<CustomerOrderPayload[]>(["customer", "orders", "live"], (current) =>
        upsertLiveOrderList(current, payload)
      );
      queryClient.setQueryData(["customer", "orders", payload._id], payload);
      queryClient.setQueryData<CustomerOrderPayload | null>(
        ["customer", "orders", "active"],
        (current) =>
          isLiveOrderStatus(payload.status)
            ? payload
            : current?._id === payload._id
              ? null
              : current ?? null,
      );
      if (HISTORY_ORDER_STATUSES.includes(payload.status)) {
        queryClient.invalidateQueries({ queryKey: ["customer", "orders", "history"] });
      }
      queryClient.invalidateQueries({ queryKey: ["customer", "orders", "presence"] });

      const banner = getOrderBanner(payload.status);
      if (banner) {
        showBanner({
          ...banner,
          path: `/orders/${payload._id}/tracking`,
          actionLabel: payload.status === "Delivered" ? "Rate order" : "View order",
          dedupeKey: `order:${payload._id}:${payload.status}`,
        });
      }
    };

    const handleNotificationCreated = (notification?: CustomerNotificationPayload) => {
      queryClient.invalidateQueries({ queryKey: ["customer", "notifications"] });
      queryClient.invalidateQueries({ queryKey: ["customer", "profile"] });

      const orderId = extractOrderIdFromPath(notification?.path);
      if (orderId) {
        queryClient.invalidateQueries({ queryKey: ["customer", "orders", orderId] });
        queryClient.invalidateQueries({ queryKey: ["customer", "orders", "active"] });
        queryClient.invalidateQueries({ queryKey: ["customer", "orders", "live"] });
      }

      if (typeof notification?.path === "string" && notification.path.includes("/support-chat")) {
        queryClient.invalidateQueries({ queryKey: ["customer", "support-case"] });
      }
    };

    const handleSupportUpdated = (payload: CustomerSupportPayload) => {
      queryClient.setQueryData(["customer", "support-case", "latest"], payload);
      queryClient.setQueryData(["customer", "support-case", payload.id], payload);
    };

    const handleAppStateChange = (nextState: AppStateStatus) => {
      appStateRef.current = nextState;

      if (nextState === "active") {
        void refetchActiveOrder();
        const activeSocket = connectIfNeeded();
        activeSocket?.emit("customer:join", customer.id);
        queryClient.invalidateQueries({ queryKey: ["customer", "orders", "active"] });
        queryClient.invalidateQueries({ queryKey: ["customer", "orders", "live"] });
        queryClient.invalidateQueries({ queryKey: ["customer", "support-case"] });
        return;
      }

      joinedRef.current = null;
      disconnectCustomerSocket();
    };

    socket?.on("connect", ensureJoined);
    socket?.on("customer.order.created", handleOrderEvent);
    socket?.on("customer.order.updated", handleOrderEvent);
    socket?.on("customer.notification.created", handleNotificationCreated);
    socket?.on("customer.support.updated", handleSupportUpdated);
    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      subscription.remove();
      socket?.off("connect", ensureJoined);
      socket?.off("customer.order.created", handleOrderEvent);
      socket?.off("customer.order.updated", handleOrderEvent);
      socket?.off("customer.notification.created", handleNotificationCreated);
      socket?.off("customer.support.updated", handleSupportUpdated);
    };
  }, [accessToken, customer?.id, hasLiveOrder, queryClient, refetchActiveOrder, showBanner]);
}
