import type { RiderOrder } from "@/src/hooks/use-rider-api";
import { palette } from "@/src/theme/palette";

export function getOrderStatusBadge(status?: string) {
  switch (status) {
    case "New":
      return {
        label: "New",
        backgroundColor: palette.infoSoft,
        borderColor: "#C8D4FF",
        color: palette.info,
      };
    case "Accepted":
      return {
        label: "Accepted",
        backgroundColor: palette.primarySoft,
        borderColor: "#FFD0C3",
        color: palette.primary,
      };
    case "Preparing":
      return {
        label: "Preparing",
        backgroundColor: palette.warningSoft,
        borderColor: "#F2D5A8",
        color: palette.warning,
      };
    case "ReadyForPickup":
      return {
        label: "Ready",
        backgroundColor: palette.successSoft,
        borderColor: "#BFE6D1",
        color: palette.success,
      };
    case "PickedUp":
      return {
        label: "Picked up",
        backgroundColor: "#F3E8FF",
        borderColor: "#D8B4FE",
        color: "#7E22CE",
      };
    case "Delivered":
      return {
        label: "Delivered",
        backgroundColor: palette.successSoft,
        borderColor: "#BFE6D1",
        color: palette.success,
      };
    case "Cancelled":
    case "Rejected":
      return {
        label: status === "Rejected" ? "Rejected" : "Cancelled",
        backgroundColor: palette.dangerSoft,
        borderColor: "#F5B8B0",
        color: palette.danger,
      };
    default:
      return {
        label: status || "Order",
        backgroundColor: palette.surfaceMuted,
        borderColor: palette.border,
        color: palette.mutedForeground,
      };
  }
}

export function getPaymentMethodBadge(value?: string | null) {
  const normalized = `${value ?? ""}`.trim().toLowerCase();

  // Cash on delivery — amber "collect cash" signal (the rider must take money).
  if (normalized.includes("cash") || normalized.includes("cod")) {
    return {
      label: "COD",
      backgroundColor: palette.warningSoft,
      borderColor: "#F2D5A8",
      color: palette.warning,
      icon: "cash-outline" as const,
    };
  }

  // Any prepaid / online method (bKash, card, nagad…) is already settled — the rider
  // collects nothing, so a calm green "Paid" instead of the brand name.
  if (normalized) {
    return {
      label: "Paid",
      backgroundColor: "#E4F7EE",
      borderColor: "#A7E3C6",
      color: "#047857",
      icon: "checkmark-circle-outline" as const,
    };
  }

  return {
    label: "--",
    backgroundColor: palette.surfaceMuted,
    borderColor: palette.border,
    color: palette.mutedForeground,
    icon: "card-outline" as const,
  };
}

// Badge for off-platform (Foodbela-delivery-only) orders so the rider knows the order
// came from the restaurant's own channel — they still collect the cash as usual.
export function getExternalDeliveryBadge() {
  return {
    label: "External",
    backgroundColor: "#EDE9FE",
    borderColor: "#C4B5FD",
    color: "#6D28D9",
    icon: "storefront-outline" as const,
  };
}

export function getOrderTimingInfo(order: Pick<RiderOrder, "status" | "createdAt" | "updatedAt" | "timestamps">) {
  const timestamps = order.timestamps ?? {};

  if (order.status === "PickedUp") {
    return {
      label: "Picked up",
      value: timestamps.PickedUp ?? order.updatedAt ?? order.createdAt,
    };
  }

  if (order.status === "ReadyForPickup") {
    return {
      label: "Ready since",
      value: timestamps.ReadyForPickup ?? order.updatedAt ?? order.createdAt,
    };
  }

  if (order.status === "Preparing") {
    return {
      label: "Preparing since",
      value: timestamps.Preparing ?? order.updatedAt ?? order.createdAt,
    };
  }

  if (order.status === "Accepted") {
    return {
      label: "Accepted",
      value: timestamps.Accepted ?? order.updatedAt ?? order.createdAt,
    };
  }

  if (order.status === "Delivered") {
    return {
      label: "Delivered",
      value: timestamps.Delivered ?? order.updatedAt ?? order.createdAt,
    };
  }

  if (order.status === "Cancelled") {
    return {
      label: "Cancelled",
      value: timestamps.Cancelled ?? order.updatedAt ?? order.createdAt,
    };
  }

  if (order.status === "Rejected") {
    return {
      label: "Rejected",
      value: timestamps.Rejected ?? order.updatedAt ?? order.createdAt,
    };
  }

  return {
    label: "Placed",
    value: timestamps.New ?? order.createdAt ?? order.updatedAt,
  };
}
