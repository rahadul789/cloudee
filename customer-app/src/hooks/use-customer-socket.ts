import * as React from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { useCustomerActiveOrderQuery } from "@/src/hooks/use-customer-api";
import {
  connectCustomerSocket,
  disconnectCustomerSocket,
  getCustomerSocket,
} from "@/src/lib/socket-client";
import { getFreshCustomerAccessToken } from "@/src/lib/api";
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
  preparationTiming?: {
    phase?: string;
    baseMinutes?: number;
    extraMinutes?: number;
    totalMinutes?: number;
    targetStartAt?: string | null;
    targetReadyAt?: string | null;
    remainingSeconds?: number | null;
    lateBySeconds?: number | null;
  } | null;
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
  routeToCustomer?: {
    distanceKm: number;
    durationMinutes: number;
    polyline: string;
    provider: "google" | "haversine";
    trafficAware: boolean;
  } | null;
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
  hasCustomerReview?: boolean;
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
  voucherId?: string;
  voucherCode?: string;
  personalOffer?: boolean;
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
const LIVE_ROUTE_REFRESH_THROTTLE_MS = 30_000;

function isLiveOrderStatus(status: string) {
  return LIVE_ORDER_STATUSES.includes(status);
}

function mergeOrderPayload(
  current: CustomerOrderPayload | null | undefined,
  nextOrder: CustomerOrderPayload,
) {
  if (!current) return nextOrder;

  return {
    ...current,
    ...nextOrder,
    routeToCustomer:
      nextOrder.routeToCustomer ?? current.routeToCustomer ?? null,
  };
}

function getOrderSummarySignature(
  order: CustomerOrderPayload | null | undefined,
) {
  if (!order) return "";

  return JSON.stringify({
    id: order._id,
    restaurantId: order.restaurantId ?? "",
    orderNumber: order.orderNumber,
    status: order.status,
    paymentMethod: order.paymentMethod,
    terminalReason: order.terminalReason ?? "",
    cancelledBy: order.cancelledBy ?? "",
    createdAt: order.createdAt,
    addressLine: order.customerSnapshot?.deliveryAddress?.addressLine ?? "",
    pricingTotal: order.pricing?.total ?? null,
    riderName: order.riderSnapshot?.name ?? "",
    riderPhone: order.riderSnapshot?.phone ?? "",
    hasCustomerReview: order.hasCustomerReview ?? false,
    preparationTiming: {
      phase: order.preparationTiming?.phase ?? "",
      totalMinutes: order.preparationTiming?.totalMinutes ?? null,
      targetStartAt: order.preparationTiming?.targetStartAt ?? null,
      targetReadyAt: order.preparationTiming?.targetReadyAt ?? null,
    },
    timestamps: {
      placedAt: order.timestamps?.placedAt ?? "",
      acceptedAt: order.timestamps?.acceptedAt ?? "",
      preparingAt: order.timestamps?.preparingAt ?? "",
      readyForPickupAt: order.timestamps?.readyForPickupAt ?? "",
      pickedUpAt: order.timestamps?.pickedUpAt ?? "",
      deliveredAt: order.timestamps?.deliveredAt ?? "",
      cancelledAt: order.timestamps?.cancelledAt ?? "",
    },
    items: (order.itemsSnapshot ?? []).map((item) => ({
      itemId: item.itemId ?? "",
      name: item.name ?? "",
      quantity: item.quantity ?? 0,
      unitPrice: item.unitPrice ?? 0,
    })),
  });
}

function hasOrderSummaryChanged(
  current: CustomerOrderPayload | null | undefined,
  nextOrder: CustomerOrderPayload,
) {
  return (
    getOrderSummarySignature(current) !== getOrderSummarySignature(nextOrder)
  );
}

function upsertOrderList(
  current: CustomerOrderPayload[] | undefined,
  nextOrder: CustomerOrderPayload,
) {
  const list = current ?? [];
  const existing = list.find((order) => order._id === nextOrder._id);

  if (existing && !hasOrderSummaryChanged(existing, nextOrder)) {
    return current ?? list;
  }

  const updated = existing
    ? list.map((order) =>
        order._id === nextOrder._id
          ? mergeOrderPayload(order, nextOrder)
          : order,
      )
    : [nextOrder, ...list];

  return [...updated].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

function upsertLiveOrderList(
  current: CustomerOrderPayload[] | undefined,
  nextOrder: CustomerOrderPayload,
) {
  if (!isLiveOrderStatus(nextOrder.status)) {
    return (current ?? []).filter((order) => order._id !== nextOrder._id);
  }

  return upsertOrderList(current, nextOrder);
}

function getOrderBanner(status: string, cancelledBy?: string) {
  // A customer-initiated cancel must never read as "restaurant didn't accept".
  if (status === "Rejected" && cancelledBy === "customer") {
    return {
      tone: "warning" as const,
      emoji: "⚠️",
      title: "Order cancelled",
      description: "Your order was cancelled.",
    };
  }
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
        description: "Your food has arrived. Enjoy your food!",
      };
    case "Rejected":
      return {
        tone: "warning" as const,
        emoji: "😕",
        title: "Order not accepted",
        description:
          "The restaurant could not accept your order. Please try another restaurant.",
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
  const { data: activeOrder, refetch: refetchActiveOrder } =
    useCustomerActiveOrderQuery(Boolean(customer?.id && accessToken));
  const hasLiveOrder = Boolean(
    activeOrder && isLiveOrderStatus(activeOrder.status),
  );
  const joinedRef = React.useRef<string | null>(null);
  const appStateRef = React.useRef(AppState.currentState);
  // Tracks the last status we surfaced an in-app banner for, per order. Rider
  // location pings re-emit `order.updated` with an unchanged status many times a
  // minute; without this guard the store's 8s dedupe lets a fresh "On the way"
  // banner through every 8 seconds, which reads as spam.
  const banneredStatusRef = React.useRef<Map<string, string>>(new Map());
  // Orders that already showed a Cancelled/Rejected banner — prevents a second
  // contradictory "ended without delivery" banner for the same order.
  const cancelBanneredRef = React.useRef<Set<string>>(new Set());
  // Socket payloads keep the rider marker moving. A full detail refetch is only
  // needed occasionally to refresh the backend-calculated route and ETA.
  const routeRefreshedAtRef = React.useRef<Map<string, number>>(new Map());

  React.useEffect(() => {
    if (!customer?.id || !accessToken) {
      joinedRef.current = null;
      disconnectCustomerSocket();
      return;
    }

    const socket = getCustomerSocket();
    const connectIfNeeded = async () => {
      if (!hasLiveOrder) {
        joinedRef.current = null;
        disconnectCustomerSocket();
        return null;
      }

      const freshAccessToken = await getFreshCustomerAccessToken();
      if (!freshAccessToken) {
        joinedRef.current = null;
        disconnectCustomerSocket();
        return null;
      }

      connectCustomerSocket(customer.id, freshAccessToken);
      joinedRef.current = customer.id;
      return socket;
    };

    if (appStateRef.current === "active") {
      void connectIfNeeded();
    }

    const ensureJoined = () => socket.emit("customer:join", customer.id);

    const handleOrderEvent = (payload: CustomerOrderPayload) => {
      queryClient.setQueryData<CustomerOrderPayload | null>(
        ["customer", "orders", payload._id],
        (current) => mergeOrderPayload(current, payload),
      );
      const previousBanneredStatus = banneredStatusRef.current.get(payload._id);
      const isStatusTransition = previousBanneredStatus !== payload.status;
      banneredStatusRef.current.set(payload._id, payload.status);

      const shouldPatchSummaryCaches =
        isStatusTransition ||
        hasOrderSummaryChanged(
          queryClient.getQueryData<CustomerOrderPayload>([
            "customer",
            "orders",
            "active",
          ]),
          payload,
        );

      if (shouldPatchSummaryCaches) {
        queryClient.setQueryData<CustomerOrderPayload[]>(
          ["customer", "orders"],
          (current) => upsertOrderList(current, payload),
        );
        queryClient.setQueryData<CustomerOrderPayload[]>(
          ["customer", "orders", "live"],
          (current) => upsertLiveOrderList(current, payload),
        );
        queryClient.setQueryData<CustomerOrderPayload | null>(
          ["customer", "orders", "active"],
          (current) =>
            isLiveOrderStatus(payload.status)
              ? mergeOrderPayload(current, payload)
              : current?._id === payload._id
                ? null
                : (current ?? null),
        );
      }

      if (
        payload.status === "PickedUp" &&
        payload.riderTracking?.currentLocation
      ) {
        const now = Date.now();
        const lastRouteRefreshAt =
          routeRefreshedAtRef.current.get(payload._id) ?? 0;
        if (now - lastRouteRefreshAt >= LIVE_ROUTE_REFRESH_THROTTLE_MS) {
          routeRefreshedAtRef.current.set(payload._id, now);
          void queryClient.invalidateQueries({
            queryKey: ["customer", "orders", payload._id],
            exact: true,
          });
        }
      } else if (!isLiveOrderStatus(payload.status)) {
        routeRefreshedAtRef.current.delete(payload._id);
      }
      // History/presence only change on a real status transition. Rider location
      // pings re-emit the same status many times a minute — gating here prevents
      // an app-wide invalidate/refetch storm that made the app sluggish during
      // live deliveries.
      if (isStatusTransition) {
        if (HISTORY_ORDER_STATUSES.includes(payload.status)) {
          queryClient.invalidateQueries({
            queryKey: ["customer", "orders", "history"],
          });
        }
        if (payload.status === "Delivered") {
          queryClient.invalidateQueries({
            queryKey: ["customer", "offers", "custom-summary"],
          });
          queryClient.invalidateQueries({
            queryKey: ["customer", "notifications", "infinite"],
          });
        }
        queryClient.invalidateQueries({
          queryKey: ["customer", "orders", "presence"],
        });
      }

      // Keep the bannered status for finished orders (order ids are unique
      // ObjectIds and never reused) so a duplicate terminal event cannot re-fire a
      // banner.
      let banner = isStatusTransition
        ? getOrderBanner(payload.status, payload.cancelledBy)
        : null;
      // Cancelled and Rejected both mean "ended without delivery". Show at most one
      // such banner per order, so a customer cancel never also pops a contradictory
      // "restaurant did not accept your order" banner right after.
      if (
        banner &&
        (payload.status === "Cancelled" || payload.status === "Rejected")
      ) {
        if (cancelBanneredRef.current.has(payload._id)) {
          banner = null;
        } else {
          cancelBanneredRef.current.add(payload._id);
        }
      }
      if (banner) {
        showBanner({
          ...banner,
          path: `/orders/${payload._id}/tracking`,
          actionLabel:
            payload.status === "Delivered" ? "Rate order" : "View order",
          dedupeKey: `order:${payload._id}:${payload.status}`,
        });
      }
    };

    const handleNotificationCreated = (
      notification?: CustomerNotificationPayload,
    ) => {
      queryClient.invalidateQueries({
        queryKey: ["customer", "notifications"],
      });
      queryClient.invalidateQueries({ queryKey: ["customer", "profile"] });

      if (
        notification?.type === "custom_offer_qualified" ||
        notification?.personalOffer === true ||
        Boolean(notification?.voucherId || notification?.voucherCode)
      ) {
        queryClient.invalidateQueries({
          queryKey: ["customer", "offers", "custom-summary"],
        });
        queryClient.invalidateQueries({
          queryKey: ["customer", "notifications", "infinite"],
        });
      }

      const orderId = extractOrderIdFromPath(notification?.path);
      if (orderId) {
        queryClient.invalidateQueries({
          queryKey: ["customer", "orders", orderId],
        });
        queryClient.invalidateQueries({
          queryKey: ["customer", "orders", "active"],
        });
        queryClient.invalidateQueries({
          queryKey: ["customer", "orders", "live"],
        });
      }

      if (
        typeof notification?.path === "string" &&
        notification.path.includes("/support-chat")
      ) {
        queryClient.invalidateQueries({
          queryKey: ["customer", "support-case"],
        });
      }
    };

    const handleSupportUpdated = (payload: CustomerSupportPayload) => {
      queryClient.setQueryData(["customer", "support-case", "latest"], payload);
      queryClient.setQueryData(
        ["customer", "support-case", payload.id],
        payload,
      );
    };

    const handleAppStateChange = (nextState: AppStateStatus) => {
      appStateRef.current = nextState;

      if (nextState === "active") {
        void refetchActiveOrder();
        void connectIfNeeded().then((activeSocket) => {
          activeSocket?.emit("customer:join", customer.id);
        });
        queryClient.invalidateQueries({
          queryKey: ["customer", "orders", "active"],
        });
        queryClient.invalidateQueries({
          queryKey: ["customer", "orders", "live"],
        });
        queryClient.invalidateQueries({
          queryKey: ["customer", "offers", "custom-summary"],
        });
        queryClient.invalidateQueries({
          queryKey: ["customer", "support-case"],
        });
        return;
      }

      joinedRef.current = null;
      disconnectCustomerSocket();
    };

    socket.on("connect", ensureJoined);
    socket.on("customer.order.created", handleOrderEvent);
    socket.on("customer.order.updated", handleOrderEvent);
    socket.on("customer.notification.created", handleNotificationCreated);
    socket.on("customer.support.updated", handleSupportUpdated);
    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    return () => {
      subscription.remove();
      socket.off("connect", ensureJoined);
      socket.off("customer.order.created", handleOrderEvent);
      socket.off("customer.order.updated", handleOrderEvent);
      socket.off("customer.notification.created", handleNotificationCreated);
      socket.off("customer.support.updated", handleSupportUpdated);
    };
  }, [
    accessToken,
    customer?.id,
    hasLiveOrder,
    queryClient,
    refetchActiveOrder,
    showBanner,
  ]);
}
