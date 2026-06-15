type QueryParamPrimitive = string | number | boolean

export function normalizeFilterSearch(value: string) {
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

export function buildQueryString(
  params?: Record<string, QueryParamPrimitive | null | undefined>
) {
  const searchParams = new URLSearchParams()

  if (!params) return searchParams.toString()

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return
    if (typeof value === "string" && value.trim().length === 0) return
    searchParams.set(key, String(value))
  })

  return searchParams.toString()
}

export function compactQueryParams<T extends Record<string, unknown> | undefined>(
  params?: T
) {
  if (!params) return {}

  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => {
      if (value === undefined || value === null) return false
      if (typeof value === "string") return value.trim().length > 0
      return true
    })
  ) as T extends Record<string, unknown> ? Partial<T> : Record<string, never>
}
