import type { RiderDeliveryThresholds, RiderOrder } from "@/src/hooks/use-rider-api";

export type RiderDelayTone = "watch" | "late" | "critical";
export type RiderDelayIcon =
  | "alert-circle-outline"
  | "bag-handle-outline"
  | "location-outline"
  | "navigate-circle-outline"
  | "time-outline"
  | "timer-outline";

export type RiderDelaySignal = {
  tone: RiderDelayTone;
  icon: RiderDelayIcon;
  label: string;
  detail: string;
  elapsedLabel: string;
};

export function getRiderDelayPriority(signal: RiderDelaySignal | null) {
  if (!signal) return 0;
  if (signal.tone === "critical") return 3;
  if (signal.tone === "late") return 2;
  return 1;
}

const DEFAULT_THRESHOLDS: RiderDeliveryThresholds = {
  assignmentTimeoutMinutes: 8,
  pickupLateGraceMinutes: 10,
  deliveryWatchAfterPickupMinutes: 20,
  deliveryLateAfterPickupMinutes: 25,
  deliveryCriticalAfterPickupMinutes: 30,
  riderEtaSpeedKmph: 24,
  riderEtaRouteFactor: 1.1,
};

function getTimestamp(order: RiderOrder, status: string) {
  const timestamps = order.timestamps ?? {};
  const value =
    timestamps[status] ??
    (status === "ReadyForPickup" ? timestamps.readyForPickupAt : null) ??
    (status === "PickedUp" ? timestamps.pickedUpAt : null) ??
    null;

  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function minutesSince(timestamp: number | null, nowMs: number) {
  if (!timestamp) return null;
  return Math.max(0, Math.floor((nowMs - timestamp) / 60000));
}

function getThresholds(thresholds?: Partial<RiderDeliveryThresholds> | null) {
  const assignmentTimeoutMinutes =
    typeof thresholds?.assignmentTimeoutMinutes === "number"
      ? thresholds.assignmentTimeoutMinutes
      : DEFAULT_THRESHOLDS.assignmentTimeoutMinutes;
  const pickupLateGraceMinutes =
    typeof thresholds?.pickupLateGraceMinutes === "number"
      ? thresholds.pickupLateGraceMinutes
      : DEFAULT_THRESHOLDS.pickupLateGraceMinutes;
  const watch =
    typeof thresholds?.deliveryWatchAfterPickupMinutes === "number"
      ? thresholds.deliveryWatchAfterPickupMinutes
      : DEFAULT_THRESHOLDS.deliveryWatchAfterPickupMinutes;
  const late = Math.max(
    watch,
    typeof thresholds?.deliveryLateAfterPickupMinutes === "number"
      ? thresholds.deliveryLateAfterPickupMinutes
      : DEFAULT_THRESHOLDS.deliveryLateAfterPickupMinutes
  );
  const critical = Math.max(
    late,
    typeof thresholds?.deliveryCriticalAfterPickupMinutes === "number"
      ? thresholds.deliveryCriticalAfterPickupMinutes
      : DEFAULT_THRESHOLDS.deliveryCriticalAfterPickupMinutes
  );

  return {
    assignmentTimeoutMinutes,
    pickupLateGraceMinutes,
    deliveryWatchAfterPickupMinutes: watch,
    deliveryLateAfterPickupMinutes: late,
    deliveryCriticalAfterPickupMinutes: critical,
    riderEtaSpeedKmph:
      typeof thresholds?.riderEtaSpeedKmph === "number"
        ? thresholds.riderEtaSpeedKmph
        : DEFAULT_THRESHOLDS.riderEtaSpeedKmph,
    riderEtaRouteFactor:
      typeof thresholds?.riderEtaRouteFactor === "number"
        ? thresholds.riderEtaRouteFactor
        : DEFAULT_THRESHOLDS.riderEtaRouteFactor,
  };
}

export function getRiderDelaySignal(
  order: RiderOrder,
  thresholds?: Partial<RiderDeliveryThresholds> | null,
  nowMs = Date.now()
): RiderDelaySignal | null {
  const normalized = getThresholds(thresholds);

  if (order.status === "PickedUp") {
    const freshness = order.riderTracking?.freshness;
    if (freshness?.state === "stale" || freshness?.isStale) {
      const staleMinutes =
        typeof freshness.ageSeconds === "number"
          ? Math.max(1, Math.round(freshness.ageSeconds / 60))
          : null;

      return {
        tone: "critical",
        icon: "location-outline",
        label: "Tracking stale",
        detail: "Location has not synced recently.",
        elapsedLabel: staleMinutes ? `${staleMinutes} min` : "Check",
      };
    }

    const pickedUpMinutes = minutesSince(getTimestamp(order, "PickedUp"), nowMs);
    if (pickedUpMinutes === null) return null;

    if (pickedUpMinutes >= normalized.deliveryCriticalAfterPickupMinutes) {
      return {
        tone: "critical",
        icon: "alert-circle-outline",
        label: "Critical delay",
        detail: "Admin follow-up may be needed.",
        elapsedLabel: `${pickedUpMinutes} min`,
      };
    }

    if (pickedUpMinutes >= normalized.deliveryLateAfterPickupMinutes) {
      return {
        tone: "late",
        icon: "time-outline",
        label: "Delivery late",
        detail: "Customer ETA may be affected.",
        elapsedLabel: `${pickedUpMinutes} min`,
      };
    }

    if (pickedUpMinutes >= normalized.deliveryWatchAfterPickupMinutes) {
      return {
        tone: "watch",
        icon: "timer-outline",
        label: "Delivery watch",
        detail: "Close to delivery target.",
        elapsedLabel: `${pickedUpMinutes} min`,
      };
    }
  }

  if (order.status === "ReadyForPickup") {
    const readyMinutes = minutesSince(getTimestamp(order, "ReadyForPickup"), nowMs);
    if (readyMinutes === null) return null;

    if (order.assignmentState === "assigned_to_you") {
      const warnAt = Math.max(1, normalized.pickupLateGraceMinutes - 3);
      if (readyMinutes >= normalized.pickupLateGraceMinutes) {
        return {
          tone: "late",
          icon: "bag-handle-outline",
          label: "Pickup late",
          detail: "Order has been ready for pickup.",
          elapsedLabel: `${readyMinutes} min`,
        };
      }
      if (readyMinutes >= warnAt) {
        return {
          tone: "watch",
          icon: "bag-handle-outline",
          label: "Pickup soon",
          detail: "Pickup window is almost over.",
          elapsedLabel: `${Math.max(0, normalized.pickupLateGraceMinutes - readyMinutes)} min left`,
        };
      }
    }

    if (order.assignmentState === "unassigned") {
      const warnAt = Math.max(1, normalized.assignmentTimeoutMinutes - 3);
      if (readyMinutes >= normalized.assignmentTimeoutMinutes) {
        return {
          tone: "late",
          icon: "navigate-circle-outline",
          label: "Needs rider now",
          detail: "Pickup request has waited too long.",
          elapsedLabel: `${readyMinutes} min`,
        };
      }
      if (readyMinutes >= warnAt) {
        return {
          tone: "watch",
          icon: "timer-outline",
          label: "Assignment watch",
          detail: "This pickup is close to timeout.",
          elapsedLabel: `${readyMinutes} min`,
        };
      }
    }
  }

  return null;
}
