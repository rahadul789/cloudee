export const DEFAULT_MAX_PREPARATION_EXTRA_MINUTES = 20
export const PREPARATION_EXTENSION_OPTIONS = [5, 10] as const

type DateLike = Date | string | null | undefined

function dateValue(value: DateLike) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function maxExtraMinutesValue(value: unknown) {
  const parsed = numberValue(value, DEFAULT_MAX_PREPARATION_EXTRA_MINUTES)
  return Math.max(0, Math.round(parsed))
}

function serializeDate(value: DateLike) {
  const date = dateValue(value)
  return date ? date.toISOString() : null
}

function getOrderTimestamp(order: Record<string, any>, status: string) {
  const timestamps = order.timestamps ?? {}
  const aliases: Record<string, string[]> = {
    New: ["New", "placedAt", "createdAt"],
    Accepted: ["Accepted", "acceptedAt"],
    Preparing: ["Preparing", "preparingAt"],
    ReadyForPickup: ["ReadyForPickup", "readyForPickupAt"],
  }

  for (const key of aliases[status] ?? [status]) {
    const date = dateValue(timestamps[key])
    if (date) return date
  }

  if (status === "New") return dateValue(order.createdAt)
  return null
}

export function getRestaurantPreparationMinutes(restaurant?: Record<string, any> | null) {
  const value = Number(restaurant?.preparationTimeMinutes)
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 20
}

export function buildPreparationMetaForStart(params: {
  order: Record<string, any>
  restaurant?: Record<string, any> | null
  startedAt: Date
  autoStarted?: boolean
  maxExtraMinutes?: number
}) {
  const existingMeta =
    params.order.preparationMeta && typeof params.order.preparationMeta === "object"
      ? params.order.preparationMeta
      : {}
  const baseMinutes = getRestaurantPreparationMinutes(params.restaurant)
  const maxExtraMinutes = maxExtraMinutesValue(
    params.maxExtraMinutes ?? existingMeta.maxExtraMinutes,
  )
  const extraMinutes = Math.min(maxExtraMinutes, Math.max(0, numberValue(existingMeta.extraMinutes)))
  const totalMinutes = baseMinutes + extraMinutes

  return {
    ...existingMeta,
    startedAt: params.startedAt,
    baseMinutes,
    extraMinutes,
    targetReadyAt: new Date(params.startedAt.getTime() + totalMinutes * 60_000),
    autoStarted: Boolean(params.autoStarted),
    maxExtraMinutes,
  }
}

export function buildPreparationMetaForExtension(params: {
  order: Record<string, any>
  restaurant?: Record<string, any> | null
  minutesToAdd: number
  extendedAt: Date
  maxExtraMinutes?: number
}) {
  const existingMeta =
    params.order.preparationMeta && typeof params.order.preparationMeta === "object"
      ? params.order.preparationMeta
      : {}
  const startedAt =
    dateValue(existingMeta.startedAt) ??
    getOrderTimestamp(params.order, "Preparing") ??
    params.extendedAt
  const baseMinutes =
    numberValue(existingMeta.baseMinutes) || getRestaurantPreparationMinutes(params.restaurant)
  const currentExtraMinutes = Math.max(0, numberValue(existingMeta.extraMinutes))
  const maxExtraMinutes = maxExtraMinutesValue(
    params.maxExtraMinutes ?? existingMeta.maxExtraMinutes,
  )
  const nextExtraMinutes = Math.min(maxExtraMinutes, currentExtraMinutes + params.minutesToAdd)
  const totalMinutes = baseMinutes + nextExtraMinutes

  return {
    ...existingMeta,
    startedAt,
    baseMinutes,
    extraMinutes: nextExtraMinutes,
    targetReadyAt: new Date(startedAt.getTime() + totalMinutes * 60_000),
    lastExtendedAt: params.extendedAt,
    extensionCount: Math.max(0, numberValue(existingMeta.extensionCount)) + 1,
    maxExtraMinutes,
  }
}

export function buildOrderPreparationTiming(params: {
  order: Record<string, any>
  restaurant?: Record<string, any> | null
  prepStartGraceMinutes?: number
  maxExtraMinutes?: number
  now?: Date
}) {
  const order = params.order
  const now = params.now ?? new Date()
  const status = String(order.status ?? "")
  const acceptedAt = getOrderTimestamp(order, "Accepted")
  const preparingAt = getOrderTimestamp(order, "Preparing")
  const readyAt = getOrderTimestamp(order, "ReadyForPickup")
  const existingMeta =
    order.preparationMeta && typeof order.preparationMeta === "object"
      ? order.preparationMeta
      : {}
  const baseMinutes =
    numberValue(existingMeta.baseMinutes) || getRestaurantPreparationMinutes(params.restaurant)
  const maxExtraMinutes = maxExtraMinutesValue(
    params.maxExtraMinutes ?? existingMeta.maxExtraMinutes,
  )
  const extraMinutes = Math.min(maxExtraMinutes, Math.max(0, numberValue(existingMeta.extraMinutes)))
  const totalMinutes = baseMinutes + extraMinutes

  if (status === "Accepted") {
    const graceMinutes = params.prepStartGraceMinutes ?? 3
    const targetStartAt = acceptedAt
      ? new Date(acceptedAt.getTime() + graceMinutes * 60_000)
      : null
    const remainingSeconds = targetStartAt
      ? Math.max(0, Math.ceil((targetStartAt.getTime() - now.getTime()) / 1000))
      : null

    return {
      phase: "accepted",
      label: "Preparing starts soon",
      baseMinutes,
      extraMinutes,
      totalMinutes,
      maxExtraMinutes,
      startedAt: null,
      targetStartAt: serializeDate(targetStartAt),
      targetReadyAt: null,
      remainingSeconds,
      lateBySeconds:
        targetStartAt && remainingSeconds === 0
          ? Math.max(0, Math.ceil((now.getTime() - targetStartAt.getTime()) / 1000))
          : 0,
      canExtend: false,
      extensionOptions: [],
      autoStarted: false,
    }
  }

  if (status === "Preparing") {
    const startedAt = dateValue(existingMeta.startedAt) ?? preparingAt
    const targetReadyAt =
      dateValue(existingMeta.targetReadyAt) ??
      (startedAt ? new Date(startedAt.getTime() + totalMinutes * 60_000) : null)
    const remainingSeconds = targetReadyAt
      ? Math.max(0, Math.ceil((targetReadyAt.getTime() - now.getTime()) / 1000))
      : null
    const extraRemaining = Math.max(0, maxExtraMinutes - extraMinutes)

    return {
      phase: remainingSeconds === 0 ? "preparing_late" : "preparing",
      label: remainingSeconds === 0 ? "Running late" : "Preparing",
      baseMinutes,
      extraMinutes,
      totalMinutes,
      maxExtraMinutes,
      startedAt: serializeDate(startedAt),
      targetStartAt: null,
      targetReadyAt: serializeDate(targetReadyAt),
      remainingSeconds,
      lateBySeconds:
        targetReadyAt && remainingSeconds === 0
          ? Math.max(0, Math.ceil((now.getTime() - targetReadyAt.getTime()) / 1000))
          : 0,
      canExtend: extraRemaining > 0,
      extensionOptions: PREPARATION_EXTENSION_OPTIONS.filter(
        (minutes) => minutes <= extraRemaining,
      ),
      autoStarted: Boolean(existingMeta.autoStarted),
    }
  }

  if (["ReadyForPickup", "PickedUp", "Delivered"].includes(status)) {
    return {
      phase: "completed",
      label: "Food ready",
      baseMinutes,
      extraMinutes,
      totalMinutes,
      maxExtraMinutes,
      startedAt: serializeDate(dateValue(existingMeta.startedAt) ?? preparingAt),
      targetStartAt: null,
      targetReadyAt: serializeDate(dateValue(existingMeta.targetReadyAt) ?? readyAt),
      remainingSeconds: 0,
      lateBySeconds: 0,
      canExtend: false,
      extensionOptions: [],
      autoStarted: Boolean(existingMeta.autoStarted),
    }
  }

  return {
    phase: "not_started",
    label: "Preparation not started",
    baseMinutes,
    extraMinutes,
    totalMinutes,
    maxExtraMinutes,
    startedAt: null,
    targetStartAt: null,
    targetReadyAt: null,
    remainingSeconds: null,
    lateBySeconds: 0,
    canExtend: false,
    extensionOptions: [],
    autoStarted: false,
  }
}
