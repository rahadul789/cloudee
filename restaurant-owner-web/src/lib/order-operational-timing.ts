import { format } from "date-fns"

import type {
  Order,
  OrderOperationalTiming,
} from "@/components/orders/types"

export function getAutoCancelRemainingSeconds(
  order: Order,
  now = Date.now()
) {
  if (order.currentStatus !== "New" || !order.autoCancel?.applies) return null
  const autoCancelAt = order.autoCancel.autoCancelAt
    ? new Date(order.autoCancel.autoCancelAt).getTime()
    : 0

  if (autoCancelAt > 0 && !Number.isNaN(autoCancelAt)) {
    return Math.max(0, Math.ceil((autoCancelAt - now) / 1000))
  }

  return typeof order.autoCancel.remainingSeconds === "number"
    ? Math.max(0, order.autoCancel.remainingSeconds)
    : null
}

export function formatDurationFromSeconds(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "N/A"
  const seconds = Math.max(0, Math.ceil(value))
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const extraMinutes = minutes % 60
    return `${hours}h ${extraMinutes}m`
  }
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`
  return `${remainingSeconds}s`
}

export function getDelayState(order: Order, now = Date.now()) {
  if (order.currentStatus === "New") {
    const placed = new Date(order.timestamps.placedAt).getTime()
    const minutes = Math.floor((now - placed) / 60000)
    if (minutes >= 10)
      return { label: "Urgent", minutes, tone: "critical" as const }
    if (minutes >= 5)
      return { label: "Delayed", minutes, tone: "warning" as const }
  }

  if (order.currentStatus === "Accepted") {
    const acceptedAt = new Date(
      order.timestamps.acceptedAt ?? order.timestamps.placedAt
    ).getTime()
    const minutes = Math.floor((now - acceptedAt) / 60000)

    if (minutes >= 12)
      return { label: "Prep starting late", minutes, tone: "critical" as const }
    if (minutes >= 8)
      return { label: "Prep not started", minutes, tone: "warning" as const }
  }

  if (order.currentStatus === "Preparing") {
    const preparingAt = new Date(
      order.timestamps.preparingAt ??
        order.timestamps.acceptedAt ??
        order.timestamps.placedAt
    ).getTime()
    const minutes = Math.floor((now - preparingAt) / 60000)

    if (minutes >= 25)
      return { label: "Needs follow-up", minutes, tone: "critical" as const }
    if (minutes >= 18)
      return { label: "Taking longer", minutes, tone: "warning" as const }
  }

  return null
}

export function pluralizeMinutes(value: number) {
  return `${value} min${value === 1 ? "" : "s"}`
}

export function getOrderOperationalTiming(
  order: Order,
  averagePreparationMinutes: number,
  now = Date.now()
): OrderOperationalTiming {
  const prepTargetMinutes = Math.max(5, averagePreparationMinutes)

  if (order.currentStatus === "New") {
    const autoCancelSeconds = getAutoCancelRemainingSeconds(order, now)
    const placedMinutes = Math.max(
      0,
      Math.floor((now - new Date(order.timestamps.placedAt).getTime()) / 60000)
    )
    if (autoCancelSeconds !== null) {
      return {
        phaseLabel: "Awaiting acceptance",
        primaryLabel:
          autoCancelSeconds === 0
            ? "Auto-cancel due now"
            : `Accept in ${formatDurationFromSeconds(autoCancelSeconds)}`,
        secondaryLabel: `Auto-cancel after ${order.autoCancel?.autoCancelAfterMinutes ?? 0} min if not accepted.`,
        tone:
          autoCancelSeconds <= 60
            ? "critical"
            : autoCancelSeconds <= 180
              ? "warning"
              : "neutral",
        lateByMinutes: autoCancelSeconds === 0 ? placedMinutes : null,
        remainingMinutes: Math.ceil(autoCancelSeconds / 60),
        remainingSeconds: autoCancelSeconds,
      }
    }
    return {
      phaseLabel: "New order",
      primaryLabel: `${pluralizeMinutes(placedMinutes)} since placed`,
      secondaryLabel: "Accept soon to keep the kitchen on track.",
      tone:
        placedMinutes >= 10
          ? "critical"
          : placedMinutes >= 5
            ? "warning"
            : "neutral",
      lateByMinutes: placedMinutes >= 5 ? placedMinutes - 5 : null,
      remainingMinutes: placedMinutes < 5 ? 5 - placedMinutes : null,
      remainingSeconds: placedMinutes < 5 ? (5 - placedMinutes) * 60 : null,
    }
  }

  if (order.currentStatus === "Accepted") {
    const acceptedMinutes = Math.max(
      0,
      Math.floor(
        (now -
          new Date(
            order.timestamps.acceptedAt ?? order.timestamps.placedAt
          ).getTime()) /
          60000
      )
    )
    return {
      phaseLabel: "Prep not started",
      primaryLabel:
        acceptedMinutes >= 8
          ? `${pluralizeMinutes(acceptedMinutes - 8)} late to start`
          : `${pluralizeMinutes(8 - acceptedMinutes)} left to start`,
      secondaryLabel: `Average prep target is ${pluralizeMinutes(prepTargetMinutes)}.`,
      tone:
        acceptedMinutes >= 12
          ? "critical"
          : acceptedMinutes >= 8
            ? "warning"
            : "neutral",
      lateByMinutes: acceptedMinutes >= 8 ? acceptedMinutes - 8 : null,
      remainingMinutes: acceptedMinutes < 8 ? 8 - acceptedMinutes : null,
    }
  }

  if (order.currentStatus === "Preparing") {
    const preparingMinutes = Math.max(
      0,
      Math.floor(
        (now -
          new Date(
            order.timestamps.preparingAt ??
              order.timestamps.acceptedAt ??
              order.timestamps.placedAt
          ).getTime()) /
          60000
      )
    )
    return {
      phaseLabel: "Kitchen timing",
      primaryLabel:
        preparingMinutes > prepTargetMinutes
          ? `${pluralizeMinutes(preparingMinutes - prepTargetMinutes)} behind prep target`
          : `${pluralizeMinutes(prepTargetMinutes - preparingMinutes)} left on average`,
      secondaryLabel: `Average prep target is ${pluralizeMinutes(prepTargetMinutes)}.`,
      tone:
        preparingMinutes >= prepTargetMinutes + 10
          ? "critical"
          : preparingMinutes > prepTargetMinutes
            ? "warning"
            : "success",
      lateByMinutes:
        preparingMinutes > prepTargetMinutes
          ? preparingMinutes - prepTargetMinutes
          : null,
      remainingMinutes:
        preparingMinutes <= prepTargetMinutes
          ? prepTargetMinutes - preparingMinutes
          : null,
    }
  }

  if (order.currentStatus === "ReadyForPickup") {
    const readyMinutes = Math.max(
      0,
      Math.floor(
        (now -
          new Date(
            order.timestamps.readyForPickupAt ??
              order.timestamps.preparingAt ??
              order.timestamps.placedAt
          ).getTime()) /
          60000
      )
    )
    return {
      phaseLabel: "Ready for pickup",
      primaryLabel: `${pluralizeMinutes(readyMinutes)} waiting for pickup`,
      secondaryLabel: order.rider
        ? `${order.rider.name} is assigned for handoff.`
        : "Waiting for a rider handoff.",
      tone:
        readyMinutes >= 15
          ? "critical"
          : readyMinutes >= 8
            ? "warning"
            : "success",
      lateByMinutes: readyMinutes >= 8 ? readyMinutes - 8 : null,
      remainingMinutes: null,
    }
  }

  if (order.currentStatus === "PickedUp") {
    const pickedUpMinutes = Math.max(
      0,
      Math.floor(
        (now -
          new Date(
            order.timestamps.pickedUpAt ??
              order.timestamps.readyForPickupAt ??
              order.timestamps.placedAt
          ).getTime()) /
          60000
      )
    )
    return {
      phaseLabel: "Out for delivery",
      primaryLabel: `${pluralizeMinutes(pickedUpMinutes)} since handoff`,
      secondaryLabel: "The rider is completing the final delivery leg.",
      tone: "neutral",
      lateByMinutes: null,
      remainingMinutes: null,
    }
  }

  if (order.currentStatus === "Delivered") {
    return {
      phaseLabel: "Delivered",
      primaryLabel: order.timestamps.deliveredAt
        ? `Completed at ${format(new Date(order.timestamps.deliveredAt), "hh:mm a")}`
        : "Completed",
      secondaryLabel: `Average prep target was ${pluralizeMinutes(prepTargetMinutes)}.`,
      tone: "success",
      lateByMinutes: null,
      remainingMinutes: null,
    }
  }

  return {
    phaseLabel: order.currentStatus === "Rejected" ? "Rejected" : "Cancelled",
    primaryLabel: "Order closed",
    secondaryLabel: `Average prep target was ${pluralizeMinutes(prepTargetMinutes)}.`,
    tone: "neutral",
    lateByMinutes: null,
    remainingMinutes: null,
  }
}
