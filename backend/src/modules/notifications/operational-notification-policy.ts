type NotificationAudience = "customer" | "owner" | "rider"

export type OperationalPushPayload = {
  title: string
  body: string
  data?: Record<string, unknown>
}

type OperationalNotificationType =
  | "rider_assignment"
  | "rider_response_late"
  | "rider_pickup_late"
  | "rider_tracking_stale"
  | "location_update_needed"
  | "delivery_watch_after_pickup"
  | "delivery_late_after_pickup"
  | "delivery_critical_after_pickup"

type OperationalCopy = {
  title: string
  body: string
}

export const ownerSuppressedOperationalEventTypes = [
  "order.rider_assignment_late",
  "order.rider_response_late",
  "order.rider_pickup_late",
  "order.rider_tracking_stale",
  "order.delivery_watch_after_pickup",
  "order.delivery_late_after_pickup",
  "order.delivery_critical_after_pickup",
]

const riderOnlyOperationalTypes = new Set<OperationalNotificationType>([
  "rider_assignment",
  "rider_response_late",
  "rider_pickup_late",
  "rider_tracking_stale",
  "location_update_needed",
])

const riderSuppressedOperationalTypes = new Set<OperationalNotificationType>()

const ownerSuppressedOperationalTypes = new Set<OperationalNotificationType>([
  "rider_assignment",
  "rider_response_late",
  "rider_pickup_late",
  "rider_tracking_stale",
  "location_update_needed",
  "delivery_watch_after_pickup",
  "delivery_late_after_pickup",
  "delivery_critical_after_pickup",
])

const operationalTypes = new Set<OperationalNotificationType>([
  "rider_assignment",
  "rider_response_late",
  "rider_pickup_late",
  "rider_tracking_stale",
  "location_update_needed",
  "delivery_watch_after_pickup",
  "delivery_late_after_pickup",
  "delivery_critical_after_pickup",
])

const englishTitleAliases: Record<string, OperationalNotificationType> = {
  "delivery is critically late": "delivery_critical_after_pickup",
  "delivery critically late": "delivery_critical_after_pickup",
  "critical delivery delay": "delivery_critical_after_pickup",
  "pickup is late": "rider_pickup_late",
  "pickup late": "rider_pickup_late",
  "location update needed": "rider_tracking_stale",
  "location update required": "rider_tracking_stale",
  "update location": "location_update_needed",
  "please update location": "location_update_needed",
  "live location update needed": "rider_tracking_stale",
  "live location update required": "rider_tracking_stale",
  "live location stale": "rider_tracking_stale",
  "tracking stale": "rider_tracking_stale",
  "rider location stale": "rider_tracking_stale",
  "rider tracking stale": "rider_tracking_stale",
  "delivery is late": "delivery_late_after_pickup",
  "delivery needs attention": "delivery_watch_after_pickup",
  "pickup response needed": "rider_response_late",
  "new delivery assignment": "rider_assignment",
  "auto assigned delivery": "rider_assignment",
  "order reassigned": "rider_assignment",
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function numberValue(data: Record<string, unknown> | undefined, key: string) {
  const value = data?.[key]
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function normalizeType(value: unknown) {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/[.\s-]+/g, "_")
    : ""
}

function normalizeTitleAlias(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
}

function hasBanglaText(value: string) {
  return /[\u0980-\u09FF]/.test(value)
}

function hasEnglishOperationalWords(value: string) {
  return /\b(?:assignment|assigned|baseline|complete|critical|delivery|eta|late|location|order|pickup|please|ready|reassigned|rider|support|tracking|update)\b/i.test(value)
}

function hasBanglaEtaExceededWords(value: string) {
  return /\beta\b/i.test(value) && /(ছাড়িয়ে|ছাড়িয়ে|চাড়িয়ে|চাড়িয়ে|পেরিয়ে|পেরিয়ে|বেশি\s+সময়|বেশি\s+সময়)/.test(value)
}

function hasEtaExceededSignal(rawCopy: string, normalizedCopy = normalizeTitleAlias(rawCopy)) {
  return (
    hasBanglaEtaExceededWords(rawCopy) ||
    ((/\beta\b/i.test(rawCopy) || normalizedCopy.includes("estimated arrival")) &&
      /\b(?:baseline|beyond|exceed|exceeded|exceeds|late|overdue|passed)\b/.test(normalizedCopy))
  )
}

function matchOperationalType(value: unknown): OperationalNotificationType | null {
  const normalized = normalizeType(value)
  if (!normalized) return null

  for (const type of operationalTypes) {
    if (normalized === type || normalized.endsWith(`_${type}`)) {
      return type
    }
  }

  if (normalized === "rider_assignment_late") return "rider_response_late"
  return null
}

function inferOperationalTypeFromCopy(payload: OperationalPushPayload): OperationalNotificationType | null {
  const titleAlias = englishTitleAliases[normalizeTitleAlias(payload.title)]
  if (titleAlias) return titleAlias

  const rawCopy = `${payload.title} ${payload.body}`
  const copy = normalizeTitleAlias(rawCopy)

  if (
    copy.includes("delivery is critically late") ||
    copy.includes("delivery critically late") ||
    copy.includes("critical delivery delay") ||
    (copy.includes("delivery") && copy.includes("critical") && copy.includes("late"))
  ) {
    return "delivery_critical_after_pickup"
  }

  if (
    copy.includes("delivery is late") ||
    copy.includes("delivery late") ||
    (copy.includes("delivery") && copy.includes("late"))
  ) {
    return "delivery_late_after_pickup"
  }

  if (
    copy.includes("delivery needs attention") ||
    copy.includes("delivery watch") ||
    (copy.includes("delivery") && copy.includes("attention"))
  ) {
    return "delivery_watch_after_pickup"
  }

  const looksLikeLocationUpdate =
    (copy.includes("location") || copy.includes("tracking")) &&
    (copy.includes("update") ||
      copy.includes("stale") ||
      copy.includes("required") ||
      copy.includes("needed") ||
      copy.includes("not updating") ||
      copy.includes("not updated"))

  if (looksLikeLocationUpdate) return "rider_tracking_stale"

  return null
}

function isEtaExceededPayload(payload: OperationalPushPayload) {
  const data = payload.data ?? {}
  const rawCopy = [
    data.type,
    data.eventType,
    data.alertType,
    data.notificationType,
    data.kind,
    payload.title,
    payload.body,
  ]
    .map((value) => (typeof value === "string" ? value : ""))
    .join(" ")
  return normalizeType(rawCopy).includes("delivery_eta_exceeded") || hasEtaExceededSignal(rawCopy)
}

export function resolveOperationalNotificationType(payload: OperationalPushPayload) {
  const data = payload.data ?? {}
  const candidates = [
    data.type,
    data.eventType,
    data.alertType,
    data.notificationType,
    data.kind,
  ]

  for (const candidate of candidates) {
    const type = matchOperationalType(candidate)
    if (type) return type
  }

  return inferOperationalTypeFromCopy(payload)
}

export function isOwnerSuppressedOperationalNotification(input: {
  eventType?: string
  payload?: OperationalPushPayload
  title?: string
}) {
  if (input.eventType && ownerSuppressedOperationalEventTypes.includes(input.eventType)) {
    return true
  }

  const payload =
    input.payload ??
    (input.title
      ? {
          title: input.title,
          body: "",
          data: input.eventType ? { eventType: input.eventType } : undefined,
        }
      : null)
  if (payload && isEtaExceededPayload(payload)) return true
  const type = payload ? resolveOperationalNotificationType(payload) : null
  return Boolean(type && ownerSuppressedOperationalTypes.has(type))
}

function orderLabel(data: Record<string, unknown> | undefined) {
  const orderNumber = stringValue(data?.orderNumber)
  return orderNumber ? `অর্ডার ${orderNumber}` : "অর্ডারটি"
}

function lateByMinutes(data: Record<string, unknown> | undefined) {
  return Math.max(1, Math.round(numberValue(data, "lateByMinutes") ?? 1))
}

function pickupMinutes(data: Record<string, unknown> | undefined) {
  return Math.max(
    1,
    Math.round(numberValue(data, "pickupMinutes") ?? numberValue(data, "elapsedMinutes") ?? lateByMinutes(data)),
  )
}

function assignedMinutes(data: Record<string, unknown> | undefined) {
  return Math.max(
    1,
    Math.round(numberValue(data, "assignedMinutes") ?? numberValue(data, "readyMinutes") ?? lateByMinutes(data)),
  )
}

function riderCopy(type: OperationalNotificationType, data: Record<string, unknown> | undefined): OperationalCopy {
  const order = orderLabel(data)
  const pickup = pickupMinutes(data)
  const assigned = assignedMinutes(data)

  switch (type) {
    case "rider_assignment":
      return {
        title: "নতুন ডেলিভারি দেওয়া হয়েছে",
        body: `${order} পিকআপের জন্য প্রস্তুত। দয়া করে রেস্টুরেন্টে যান।`,
      }
    case "rider_response_late":
      return {
        title: "পিকআপ নিশ্চিত করা দরকার",
        body: `${order} ${assigned} মিনিট ধরে অপেক্ষা করছে। দয়া করে পিকআপ নিশ্চিত করুন।`,
      }
    case "rider_pickup_late":
      return {
        title: "পিকআপে দেরি হচ্ছে",
        body: `${order} প্রস্তুত আছে। দয়া করে এখনই রেস্টুরেন্ট থেকে পিকআপ করুন।`,
      }
    case "rider_tracking_stale":
    case "location_update_needed":
      return {
        title: "লোকেশন আপডেট দরকার",
        body: "লাইভ লোকেশন কিছুক্ষণ ধরে আপডেট হচ্ছে না। লোকেশন চালু রেখে অ্যাপটি খোলা রাখুন।",
      }
    case "delivery_watch_after_pickup":
      return {
        title: "ডেলিভারিতে নজর দিন",
        body: `${order} পিকআপের পর ${pickup} মিনিট হয়ে গেছে। দয়া করে ডেলিভারি দ্রুত সম্পন্ন করুন।`,
      }
    case "delivery_late_after_pickup":
      return {
        title: "ডেলিভারিতে দেরি হচ্ছে",
        body: `${order} পিকআপের পর ${pickup} মিনিট হয়ে গেছে। দ্রুত কাস্টমারের কাছে পৌঁছান।`,
      }
    case "delivery_critical_after_pickup":
      return {
        title: "ডেলিভারিতে অনেক দেরি হচ্ছে",
        body: `${order} পিকআপের পর অনেক সময় হয়ে গেছে। দ্রুত কাস্টমারের কাছে পৌঁছান অথবা সাপোর্টে জানান।`,
      }
  }
}

function customerCopy(type: OperationalNotificationType, data: Record<string, unknown> | undefined): OperationalCopy | null {
  if (riderOnlyOperationalTypes.has(type)) return null

  const order = orderLabel(data)
  const pickup = pickupMinutes(data)

  switch (type) {
    case "delivery_watch_after_pickup":
      return {
        title: "ডেলিভারিতে একটু সময় লাগছে",
        body: `${order} পথে আছে। রাইডার ডেলিভারি সম্পন্ন করার চেষ্টা করছে।`,
      }
    case "delivery_late_after_pickup":
      return {
        title: "ডেলিভারিতে দেরি হচ্ছে",
        body: `${order} পিকআপের পর ${pickup} মিনিট হয়ে গেছে। রাইডার পথে আছে, আমরা নজর রাখছি।`,
      }
    case "delivery_critical_after_pickup":
      return {
        title: "ডেলিভারিতে বেশি দেরি হচ্ছে",
        body: `${order} পৌঁছাতে স্বাভাবিকের চেয়ে বেশি সময় নিচ্ছে। সাপোর্ট টিম নজর রাখছে।`,
      }
    default:
      return null
  }
}

function audienceCopy(
  audience: NotificationAudience,
  type: OperationalNotificationType,
  data: Record<string, unknown> | undefined,
) {
  if (audience === "owner") return null
  if (audience === "customer") return customerCopy(type, data)
  return riderCopy(type, data)
}

export function normalizeOperationalPushPayload<T extends OperationalPushPayload>(
  audience: NotificationAudience,
  payload: T,
): { payload: T; matched: boolean; suppressed: boolean; type: OperationalNotificationType | null } {
  if (isEtaExceededPayload(payload)) {
    return {
      payload: {
        ...payload,
        data: {
          ...(payload.data ?? {}),
          notificationSuppressed: true,
        },
      },
      matched: true,
      suppressed: true,
      type: null,
    }
  }

  const type = resolveOperationalNotificationType(payload)
  if (!type) {
    return { payload, matched: false, suppressed: false, type: null }
  }

  const data = {
    ...(payload.data ?? {}),
    type,
  }

  if (audience === "owner" && ownerSuppressedOperationalTypes.has(type)) {
    return {
      payload: {
        ...payload,
        data,
      },
      matched: true,
      suppressed: true,
      type,
    }
  }

  if (audience === "rider" && riderSuppressedOperationalTypes.has(type)) {
    return {
      payload: {
        ...payload,
        data,
      },
      matched: true,
      suppressed: true,
      type,
    }
  }

  if (audience === "customer" && riderOnlyOperationalTypes.has(type)) {
    return {
      payload: {
        ...payload,
        data,
      },
      matched: true,
      suppressed: true,
      type,
    }
  }

  if (
    audience === "rider" &&
    hasBanglaText(payload.title) &&
    !hasEnglishOperationalWords(payload.title) &&
    !hasEnglishOperationalWords(payload.body)
  ) {
    return {
      payload: {
        ...payload,
        data,
      },
      matched: true,
      suppressed: false,
      type,
    }
  }

  const copy = audienceCopy(audience, type, data)
  if (!copy) {
    return {
      payload: {
        ...payload,
        data,
      },
      matched: true,
      suppressed: false,
      type,
    }
  }

  return {
    payload: {
      ...payload,
      title: copy.title,
      body: copy.body,
      data,
    },
    matched: true,
    suppressed: false,
    type,
  }
}
