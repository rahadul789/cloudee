import type { StatusTone } from "@/src/components/status-pill";
import type { TranslationKey } from "@/src/i18n/translations";
import type { OwnerOrder, OwnerOrderStatus } from "@/src/hooks/use-owner-api";

type OwnerTranslate = (key: TranslationKey) => string;

const statusTranslationKeys: Record<OwnerOrderStatus, TranslationKey> = {
  New: "orders.status.new",
  Accepted: "orders.status.accepted",
  Preparing: "orders.status.preparing",
  ReadyForPickup: "orders.status.ready",
  PickedUp: "orders.status.pickedUp",
  Delivered: "orders.status.delivered",
  Cancelled: "orders.status.cancelled",
  Rejected: "orders.status.rejected",
};

export function getOrderStatusLabel(status: OwnerOrderStatus) {
  if (status === "ReadyForPickup") return "Ready";
  if (status === "PickedUp") return "Picked up";
  return status;
}

export function getLocalizedOrderStatusLabel(
  status: OwnerOrderStatus,
  t: OwnerTranslate,
) {
  return t(statusTranslationKeys[status]);
}

export function getOrderStatusTone(status: OwnerOrderStatus): StatusTone {
  switch (status) {
    case "New":
      return "warning";
    case "Accepted":
      return "primary";
    case "Preparing":
      return "info";
    case "ReadyForPickup":
      return "purple";
    case "PickedUp":
      return "teal";
    case "Delivered":
      return "success";
    case "Rejected":
      return "rose";
    case "Cancelled":
      return "danger";
    default:
      return "neutral";
  }
}

export function isOrderHistoryStatus(status?: OwnerOrderStatus | "") {
  return status === "Delivered" || status === "Cancelled" || status === "Rejected";
}

export function canOwnerCancelOrder(status: OwnerOrderStatus) {
  return status === "Accepted" || status === "Preparing";
}

export function getAutoCancelRemainingSeconds(order: OwnerOrder, now = Date.now()) {
  if (order.status !== "New" || !order.autoCancel?.applies) return null;

  const autoCancelAt = order.autoCancel.autoCancelAt
    ? new Date(order.autoCancel.autoCancelAt).getTime()
    : 0;

  if (autoCancelAt > 0 && !Number.isNaN(autoCancelAt)) {
    return Math.max(0, Math.ceil((autoCancelAt - now) / 1000));
  }

  if (typeof order.autoCancel.remainingSeconds === "number") {
    return Math.max(0, order.autoCancel.remainingSeconds);
  }

  return null;
}

function getOwnerAcceptanceLateSeconds(order: OwnerOrder, now = Date.now()) {
  if (order.status !== "New") return 0;
  const thresholdMinutes = order.autoCancel?.ownerAcceptanceTimeoutMinutes;
  if (typeof thresholdMinutes !== "number" || thresholdMinutes <= 0) return 0;

  const createdAt = order.createdAt ? new Date(order.createdAt).getTime() : 0;
  if (createdAt <= 0 || Number.isNaN(createdAt)) return 0;

  return Math.max(0, Math.ceil((now - createdAt) / 1000) - thresholdMinutes * 60);
}

export function formatAutoCancelCountdown(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function getPreparationRemainingSeconds(order: OwnerOrder, now = Date.now()) {
  const timing = order.preparationTiming;
  if (!timing || order.status !== "Preparing") return null;

  const targetReadyAt = timing.targetReadyAt
    ? new Date(timing.targetReadyAt).getTime()
    : 0;

  if (targetReadyAt > 0 && !Number.isNaN(targetReadyAt)) {
    return Math.max(0, Math.ceil((targetReadyAt - now) / 1000));
  }

  return typeof timing.remainingSeconds === "number"
    ? Math.max(0, timing.remainingSeconds)
    : null;
}

export function getPreparationLateSeconds(order: OwnerOrder, now = Date.now()) {
  const timing = order.preparationTiming;
  if (!timing || order.status !== "Preparing") return 0;

  const targetReadyAt = timing.targetReadyAt
    ? new Date(timing.targetReadyAt).getTime()
    : 0;

  if (targetReadyAt > 0 && !Number.isNaN(targetReadyAt)) {
    return Math.max(0, Math.ceil((now - targetReadyAt) / 1000));
  }

  return Math.max(0, timing.lateBySeconds ?? 0);
}

export function getPrepStartRemainingSeconds(order: OwnerOrder, now = Date.now()) {
  const timing = order.preparationTiming;
  if (!timing || order.status !== "Accepted") return null;

  const targetStartAt = timing.targetStartAt
    ? new Date(timing.targetStartAt).getTime()
    : 0;

  if (targetStartAt > 0 && !Number.isNaN(targetStartAt)) {
    return Math.max(0, Math.ceil((targetStartAt - now) / 1000));
  }

  return typeof timing.remainingSeconds === "number"
    ? Math.max(0, timing.remainingSeconds)
    : null;
}

export function isOwnerOrderLate(order: OwnerOrder, now = Date.now()) {
  if (order.lateState?.isLate) return true;

  const ownerAcceptanceLateSeconds = getOwnerAcceptanceLateSeconds(order, now);
  const autoCancelSeconds = getAutoCancelRemainingSeconds(order, now);
  const prepStartSeconds = getPrepStartRemainingSeconds(order, now);
  const prepRemainingSeconds = getPreparationRemainingSeconds(order, now);
  const prepLateSeconds = getPreparationLateSeconds(order, now);

  return (
    ownerAcceptanceLateSeconds > 0 ||
    autoCancelSeconds === 0 ||
    prepStartSeconds === 0 ||
    (prepRemainingSeconds === 0 && prepLateSeconds > 0)
  );
}
