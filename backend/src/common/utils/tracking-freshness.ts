export const TRACKING_STALE_AFTER_MS = 2 * 60 * 1000

function isTrackingEligibleStatus(status?: string | null) {
  return status === "PickedUp"
}

export function getTrackingFreshnessMeta(params: {
  lastUpdatedAt?: string | Date | null
  status?: string | null
}) {
  const parsedLastUpdatedAt = params.lastUpdatedAt ? new Date(params.lastUpdatedAt) : null
  const safeLastUpdatedAt =
    parsedLastUpdatedAt && !Number.isNaN(parsedLastUpdatedAt.getTime())
      ? parsedLastUpdatedAt.toISOString()
      : null

  if (!isTrackingEligibleStatus(params.status)) {
    return {
      lastUpdatedAt: safeLastUpdatedAt,
      ageSeconds: null,
      isFresh: false,
      isStale: false,
      state: "unavailable" as const
    }
  }

  const { lastUpdatedAt } = params
  if (!lastUpdatedAt) {
    return {
      lastUpdatedAt: null,
      ageSeconds: null,
      isFresh: false,
      isStale: false,
      state: "unavailable" as const
    }
  }

  const parsedTime = new Date(lastUpdatedAt)
  const timestamp = parsedTime.getTime()

  if (Number.isNaN(timestamp)) {
    return {
      lastUpdatedAt: null,
      ageSeconds: null,
      isFresh: false,
      isStale: false,
      state: "unavailable" as const
    }
  }

  const ageMs = Math.max(0, Date.now() - timestamp)
  const isStale = ageMs > TRACKING_STALE_AFTER_MS

  return {
    lastUpdatedAt: parsedTime.toISOString(),
    ageSeconds: Math.round(ageMs / 1000),
    isFresh: !isStale,
    isStale,
    state: isStale ? ("stale" as const) : ("live" as const)
  }
}

export function decorateTrackingSnapshot<T extends Record<string, any> | null | undefined>(
  tracking: T,
  status?: string | null
) {
  const freshness = getTrackingFreshnessMeta({
    lastUpdatedAt: tracking?.lastUpdatedAt,
    status
  })

  return {
    ...(tracking ?? {}),
    freshness
  }
}
