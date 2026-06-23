export type PushPolicyPayload = {
  title: string
  body: string
  data?: Record<string, unknown>
  contentType?: "text" | "image" | "image_text"
  imageUrl?: string
}

export type PushPolicyResult<T extends PushPolicyPayload> = {
  payload: T
  suppressed: boolean
  type: string
  reason?: string
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeKey(value: unknown) {
  return stringValue(value).toLowerCase().replace(/[.\s-]+/g, "_")
}

function normalizeCopy(value: unknown) {
  return stringValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
}

function hasLatinText(value: string) {
  return /[A-Za-z]/.test(value)
}

function hasBanglaText(value: string) {
  return /[\u0980-\u09FF]/.test(value)
}

function mergedCopy(payload: PushPolicyPayload) {
  const data = payload.data ?? {}
  return [
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
}

function mergedType(payload: PushPolicyPayload) {
  const data = payload.data ?? {}
  return [
    data.type,
    data.eventType,
    data.alertType,
    data.notificationType,
    data.kind,
  ]
    .map(normalizeKey)
    .filter(Boolean)
    .join(" ")
}

export function isDeliveryEtaExceededPush(payload: PushPolicyPayload) {
  const raw = mergedCopy(payload)
  const type = mergedType(payload)
  const copy = normalizeCopy(raw)

  return (
    type.includes("delivery_eta_exceeded") ||
    copy.includes("delivery eta exceeded") ||
    copy.includes("delivery eta exceed") ||
    copy.includes("eta exceeded") ||
    copy.includes("eta baseline") ||
    (/\beta\b/i.test(raw) &&
      /(baseline|beyond|exceed|exceeded|exceeds|overdue|passed|late|ছাড়িয়ে|ছাড়িয়ে|চাড়িয়ে|চাড়িয়ে|পেরিয়ে|পেরিয়ে|বেশি\s+সময়|বেশি\s+সময়)/i.test(raw))
  )
}

function orderLabel(data: Record<string, unknown> | undefined) {
  const orderNumber = stringValue(data?.orderNumber)
  return orderNumber ? `অর্ডার ${orderNumber}` : "অর্ডারটি"
}

function classifyRiderPush(payload: PushPolicyPayload) {
  const type = mergedType(payload)
  const copy = normalizeCopy(mergedCopy(payload))

  if (isDeliveryEtaExceededPush(payload)) return "retired_delivery_eta_alert"
  if (
    type.includes("delivery_critical_after_pickup") ||
    copy.includes("delivery is critically late") ||
    copy.includes("delivery critically late") ||
    copy.includes("critical delivery delay") ||
    (copy.includes("delivery") && copy.includes("critical") && copy.includes("late"))
  ) {
    return "delivery_critical_after_pickup"
  }
  if (
    type.includes("delivery_late_after_pickup") ||
    copy.includes("delivery is late") ||
    copy.includes("delivery late")
  ) {
    return "delivery_late_after_pickup"
  }
  if (
    type.includes("delivery_watch_after_pickup") ||
    copy.includes("delivery needs attention") ||
    copy.includes("delivery watch")
  ) {
    return "delivery_watch_after_pickup"
  }
  if (
    type.includes("rider_pickup_late") ||
    copy.includes("pickup is late") ||
    copy.includes("pickup late")
  ) {
    return "rider_pickup_late"
  }
  if (
    type.includes("rider_response_late") ||
    copy.includes("pickup response needed") ||
    copy.includes("response late")
  ) {
    return "rider_response_late"
  }
  if (
    type.includes("rider_tracking_stale") ||
    type.includes("location_update_needed") ||
    ((copy.includes("location") || copy.includes("tracking")) &&
      (copy.includes("update") ||
        copy.includes("needed") ||
        copy.includes("required") ||
        copy.includes("stale") ||
        copy.includes("not updating")))
  ) {
    return "rider_tracking_stale"
  }
  if (
    type.includes("rider_assignment") ||
    copy.includes("new delivery assignment") ||
    copy.includes("auto assigned delivery") ||
    copy.includes("order reassigned") ||
    copy.includes("assignment updated") ||
    copy.includes("ready for pickup") ||
    copy.includes("assigned")
  ) {
    return "rider_assignment"
  }
  if (
    copy.includes("another rider") ||
    copy.includes("unassigned") ||
    copy.includes("removed")
  ) {
    return "rider_reassigned_away"
  }
  if (copy.includes("pickup")) return "pickup_update"
  if (copy.includes("delivery")) return "delivery_update"
  return "generic"
}

function riderBanglaCopy(type: string, payload: PushPolicyPayload) {
  const order = orderLabel(payload.data)

  switch (type) {
    case "rider_assignment":
      return {
        title: "নতুন ডেলিভারি দেওয়া হয়েছে",
        body: `${order} পিকআপের জন্য প্রস্তুত। দয়া করে রেস্টুরেন্টে যান।`,
      }
    case "rider_response_late":
      return {
        title: "পিকআপ নিশ্চিত করা দরকার",
        body: `${order} প্রস্তুত হয়ে অপেক্ষা করছে। দয়া করে পিকআপ নিশ্চিত করুন।`,
      }
    case "rider_pickup_late":
      return {
        title: "পিকআপে দেরি হচ্ছে",
        body: `${order} প্রস্তুত আছে। দয়া করে এখনই রেস্টুরেন্ট থেকে পিকআপ করুন।`,
      }
    case "rider_tracking_stale":
      return {
        title: "লোকেশন আপডেট দরকার",
        body: "লাইভ লোকেশন কিছুক্ষণ ধরে আপডেট হচ্ছে না। লোকেশন চালু রেখে অ্যাপটি খোলা রাখুন।",
      }
    case "delivery_watch_after_pickup":
      return {
        title: "ডেলিভারিতে নজর দিন",
        body: `${order} পিকআপের পর নির্ধারিত সময়ের কাছাকাছি চলে এসেছে। দয়া করে ডেলিভারি দ্রুত সম্পন্ন করুন।`,
      }
    case "delivery_late_after_pickup":
      return {
        title: "ডেলিভারিতে দেরি হচ্ছে",
        body: `${order} পিকআপের পর বেশি সময় নিচ্ছে। দ্রুত কাস্টমারের কাছে পৌঁছান।`,
      }
    case "delivery_critical_after_pickup":
      return {
        title: "ডেলিভারিতে অনেক দেরি হচ্ছে",
        body: `${order} পিকআপের পর অনেক সময় হয়ে গেছে। দ্রুত কাস্টমারের কাছে পৌঁছান অথবা সাপোর্টে জানান।`,
      }
    case "rider_reassigned_away":
      return {
        title: "অর্ডার অন্য রাইডারকে দেওয়া হয়েছে",
        body: `${order} এখন অন্য একজন রাইডারকে দেওয়া হয়েছে।`,
      }
    case "pickup_update":
      return {
        title: "পিকআপ আপডেট",
        body: `${order} সম্পর্কে পিকআপ আপডেট আছে। অ্যাপ খুলে বিস্তারিত দেখুন।`,
      }
    case "delivery_update":
      return {
        title: "ডেলিভারি আপডেট",
        body: `${order} সম্পর্কে ডেলিভারি আপডেট আছে। অ্যাপ খুলে বিস্তারিত দেখুন।`,
      }
    default:
      return {
        title: "নতুন নোটিফিকেশন",
        body: "আপনার জন্য নতুন নোটিফিকেশন আছে। অ্যাপ খুলে বিস্তারিত দেখুন।",
      }
  }
}

export function normalizeRiderPushForDeliveryApp<T extends PushPolicyPayload>(
  payload: T,
): PushPolicyResult<T> {
  const type = classifyRiderPush(payload)
  if (type === "retired_delivery_eta_alert") {
    return {
      payload: {
        ...payload,
        data: {
          ...(payload.data ?? {}),
          notificationSuppressed: true,
        },
      },
      suppressed: true,
      type,
      reason: "retired_delivery_eta_alert_removed",
    }
  }

  if (hasBanglaText(payload.title) && hasBanglaText(payload.body) && !hasLatinText(payload.title) && !hasLatinText(payload.body)) {
    return { payload, suppressed: false, type }
  }

  const copy = riderBanglaCopy(type, payload)
  return {
    payload: {
      ...payload,
      title: copy.title,
      body: copy.body,
      data: {
        ...(payload.data ?? {}),
        type: type === "generic" ? stringValue(payload.data?.type) || "system" : type,
      },
    },
    suppressed: false,
    type,
  }
}

export function normalizeOwnerPushForRestaurantOwnerApp<T extends PushPolicyPayload>(
  payload: T,
): PushPolicyResult<T> {
  const type = mergedType(payload)
  const copy = normalizeCopy(mergedCopy(payload))
  const blocked =
    isDeliveryEtaExceededPush(payload) ||
    type.includes("rider_") ||
    type.includes("delivery_watch_after_pickup") ||
    type.includes("delivery_late_after_pickup") ||
    type.includes("delivery_critical_after_pickup") ||
    copy.includes("delivery eta")

  return {
    payload,
    suppressed: blocked,
    type: blocked ? "owner_operational_delivery_removed" : stringValue(payload.data?.type) || "system",
    reason: blocked ? "owner_delivery_noise_removed" : undefined,
  }
}

export function normalizeCustomerPushForCustomerApp<T extends PushPolicyPayload>(
  payload: T,
): PushPolicyResult<T> {
  const type = mergedType(payload)
  if (!type.includes("rider_near")) {
    return {
      payload,
      suppressed: false,
      type: stringValue(payload.data?.type) || "system",
    }
  }

  return {
    payload: {
      ...payload,
      title: "Rider is nearby",
      body: "Your rider is almost there. Please be ready to receive your order.",
      data: {
        ...(payload.data ?? {}),
        type: "rider_near",
      },
    },
    suppressed: false,
    type: "rider_near",
  }
}
