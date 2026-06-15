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

  if (normalized.includes("bkash")) {
    return {
      label: "bKash",
      backgroundColor: "#FFE4F1",
      borderColor: "#F9A8D4",
      color: "#BE185D",
      icon: "wallet-outline" as const,
    };
  }

  if (normalized.includes("cash") || normalized.includes("cod")) {
    return {
      label: "COD",
      backgroundColor: palette.warningSoft,
      borderColor: "#F2D5A8",
      color: palette.warning,
      icon: "cash-outline" as const,
    };
  }

  return {
    label: value ? `${value}`.trim() : "--",
    backgroundColor: palette.surfaceMuted,
    borderColor: palette.border,
    color: palette.mutedForeground,
    icon: "card-outline" as const,
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
