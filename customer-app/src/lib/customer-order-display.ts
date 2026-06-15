import { palette } from "@/src/theme/palette";

export const CUSTOMER_ORDER_STATUS_STEPS = [
  "New",
  "Accepted",
  "Preparing",
  "ReadyForPickup",
  "PickedUp",
  "Delivered",
] as const;

export function isActiveCustomerOrderStatus(status: string) {
  return CUSTOMER_ORDER_STATUS_STEPS.slice(0, 5).includes(
    status as (typeof CUSTOMER_ORDER_STATUS_STEPS)[number],
  );
}

export function isCancelledCustomerOrderStatus(status: string) {
  return ["Cancelled", "Rejected"].includes(status);
}

export function canCancelCustomerOrder(status: string) {
  return status === "New";
}

export function getCustomerOrderStatusMeta(status: string) {
  switch (status) {
    case "Delivered":
      return {
        label: "Delivered",
        color: palette.successText,
        background: palette.successSurface,
        icon: "checkmark-circle" as const,
      };
    case "Cancelled":
      return {
        label: "Cancelled",
        color: palette.foreground,
        background: "#F5F5F5",
        icon: "close-circle-outline" as const,
      };
    case "Rejected":
      return {
        label: "Rejected",
        color: palette.primary,
        background: "#FFF0F6",
        icon: "storefront-outline" as const,
      };
    case "PickedUp":
      return {
        label: "On the way",
        color: palette.sky,
        background: "#EAF2FF",
        icon: "bicycle-outline" as const,
      };
    case "Preparing":
      return {
        label: "Preparing",
        color: "#9A4F00",
        background: "#FFF3D6",
        icon: "restaurant-outline" as const,
      };
    case "ReadyForPickup":
      return {
        label: "Ready for pickup",
        color: palette.secondary,
        background: "#FFE8F0",
        icon: "bag-handle-outline" as const,
      };
    case "Accepted":
      return {
        label: "Accepted",
        color: palette.sky,
        background: "#EAF2FF",
        icon: "checkmark-done-circle-outline" as const,
      };
    default:
      return {
        label: "Order placed",
        color: palette.secondary,
        background: "#FFE8F0",
        icon: "receipt-outline" as const,
      };
  }
}

export function getCustomerTrackingBanner(order: {
  status: string;
  paymentMethod?: string;
  paymentStatus?: string;
  terminalReason?: string;
  cancelledBy?: string;
  history?: { note?: string }[];
}) {
  switch (order.status) {
    case "New":
      return {
        title: "Order placed successfully",
        subtitle:
          "The restaurant received your order. Rider assignment starts after food is ready.",
        icon: "receipt-outline" as const,
        tint: "#FFE8F0",
        accent: palette.secondary,
      };
    case "Accepted":
      return {
        title: "Restaurant confirmed your order",
        subtitle:
          "The kitchen is getting things ready. We will assign a rider after the food is ready.",
        icon: "checkmark-done-circle-outline" as const,
        tint: "#EAF2FF",
        accent: palette.sky,
      };
    case "Preparing":
      return {
        title: "Your food is being prepared",
        subtitle: "Rider assignment starts after the food is ready for pickup.",
        icon: "restaurant-outline" as const,
        tint: "#FFF3D6",
        accent: "#9A4F00",
      };
    case "ReadyForPickup":
      return {
        title: "Ready for rider pickup",
        subtitle: "Your order is packed and waiting to be collected.",
        icon: "bag-handle-outline" as const,
        tint: "#FFF0F7",
        accent: palette.amber,
      };
    case "Delivered":
      return {
        title: "Delivered successfully",
        subtitle: "This order already reached your address.",
        icon: "checkmark-circle" as const,
        tint: palette.successSurface,
        accent: palette.successText,
      };
    case "Cancelled":
      if (order.cancelledBy === "customer") {
        const isBkashPaidOrder =
          order.paymentMethod === "Bkash" &&
          ["paid", "refund_pending"].includes(order.paymentStatus ?? "");
        return {
          title: "You cancelled this order",
          subtitle: isBkashPaidOrder
            ? "This order was cancelled before the restaurant accepted it. Your bKash refund is now in review."
            : "This order was cancelled before the restaurant accepted it. Cash on delivery orders do not need a refund.",
          icon: "close-circle-outline" as const,
          tint: "#F5F5F5",
          accent: palette.foreground,
        };
      }
      if (
        order.cancelledBy === "system" ||
        order.terminalReason === "system_auto_cancel_unaccepted" ||
        order.terminalReason?.toLowerCase().includes("auto-cancel")
      ) {
        return {
          title: "Order auto-cancelled",
          subtitle:
            "The restaurant did not accept this order in time, so the system cancelled it automatically.",
          icon: "timer-outline" as const,
          tint: "#FFF7E8",
          accent: palette.amber,
        };
      }
      if (order.cancelledBy === "owner" || order.cancelledBy === "restaurant") {
        return {
          title: "Restaurant cancelled this order",
          subtitle:
            "The restaurant could not continue with this order. If you paid online, support can help with the refund flow.",
          icon: "storefront-outline" as const,
          tint: "#FFF0F6",
          accent: palette.primary,
        };
      }
      return {
        title: "This order was cancelled",
        subtitle:
          "This order is no longer active. If you paid online, support can help with the refund flow.",
        icon: "close-circle-outline" as const,
        tint: "#F5F5F5",
        accent: palette.foreground,
      };
    case "Rejected":
      return {
        title: "Order not accepted",
        subtitle:
          "The restaurant could not accept this order. Please try another restaurant.",
        icon: "storefront-outline" as const,
        tint: "#FFF0F6",
        accent: palette.primary,
      };
    default:
      return null;
  }
}

export const LIVE_ORDER_JOURNEY_STEPS = [
  { key: "New", label: "Order placed" },
  { key: "Accepted", label: "Accepted" },
  { key: "Preparing", label: "Preparing" },
  { key: "ReadyForPickup", label: "Ready for pickup" },
  { key: "PickedUp", label: "On the way" },
  { key: "Delivered", label: "Delivered" },
] as const;

export function getLiveOrderProgress(status: string) {
  switch (status) {
    case "New":
      return 0.12;
    case "Accepted":
      return 0.28;
    case "Preparing":
      return 0.52;
    case "ReadyForPickup":
      return 0.68;
    case "PickedUp":
      return 0.88;
    case "Delivered":
      return 1;
    default:
      return 0.1;
  }
}

export function getLiveOrderJourneyIndex(status: string) {
  switch (status) {
    case "New":
      return 0;
    case "Accepted":
      return 1;
    case "Preparing":
      return 2;
    case "ReadyForPickup":
      return 3;
    case "PickedUp":
      return 4;
    case "Delivered":
      return 5;
    case "Cancelled":
    case "Rejected":
      return -1;
    default:
      return 0;
  }
}

export function getLiveOrderTrackingState(order: {
  status: string;
  terminalReason?: string | null;
}) {
  const terminalReason = order.terminalReason ?? "";
  const normalizedReason = terminalReason.replace(/[_-]/g, " ").toLowerCase();

  switch (order.status) {
    case "New":
      return {
        title: "Order placed",
        subtitle: "Waiting for restaurant confirmation.",
        icon: "receipt-outline" as const,
        tint: "#F3F7FF",
        accent: palette.sky,
      };
    case "Accepted":
      return {
        title: "Restaurant confirmed",
        subtitle: "Cooking will begin shortly.",
        icon: "checkmark-done-circle-outline" as const,
        tint: "#EEF4FF",
        accent: palette.sky,
      };
    case "Preparing":
      return {
        title: "Preparing your food",
        subtitle: "Live rider updates start after pickup.",
        icon: "restaurant-outline" as const,
        tint: "#FFF3D6",
        accent: "#9A4F00",
      };
    case "ReadyForPickup":
      return {
        title: "Ready for pickup",
        subtitle: "Waiting for rider pickup.",
        icon: "bag-handle-outline" as const,
        tint: "#FFF0F7",
        accent: palette.amber,
      };
    case "Delivered":
      return {
        title: "Delivered successfully",
        subtitle: "Delivered to your address.",
        icon: "checkmark-circle" as const,
        tint: palette.successSurface,
        accent: palette.successText,
      };
    case "Cancelled":
      return {
        title: "Order cancelled",
        subtitle:
          normalizedReason.includes("auto cancel") ||
          normalizedReason.includes("unaccepted")
            ? "The restaurant did not accept this order in time, so it was cancelled automatically."
            : "This order is no longer active. You can place another order any time.",
        icon: "close-circle-outline" as const,
        tint: "#F5F5F5",
        accent: palette.foreground,
      };
    case "Rejected":
      return {
        title: "Restaurant could not accept this order",
        subtitle: "Please try another restaurant.",
        icon: "storefront-outline" as const,
        tint: "#FFF0F6",
        accent: palette.primary,
      };
    default:
      return null;
  }
}
