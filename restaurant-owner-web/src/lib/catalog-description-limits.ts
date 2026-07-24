export const DEFAULT_CATALOG_DESCRIPTION_LIMITS = {
  menuItem: 120,
  category: 90,
} as const

export const MIN_CATALOG_DESCRIPTION_LIMIT = 20
export const MAX_CATALOG_DESCRIPTION_LIMIT = 1000

export type CatalogDescriptionLimits = {
  menuItem: number
  category: number
}

type PlatformContentWithCatalogLimits = {
  operations?: {
    ownerApp?: {
      catalogDescriptionLimits?: Partial<CatalogDescriptionLimits> | null
    } | null
  } | null
}

function integerInRange(value: unknown, fallback: number) {
  const numeric = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(numeric)) return fallback

  return Math.min(
    MAX_CATALOG_DESCRIPTION_LIMIT,
    Math.max(MIN_CATALOG_DESCRIPTION_LIMIT, Math.round(numeric))
  )
}

export function normalizeCatalogDescriptionLimits(
  value?: Partial<CatalogDescriptionLimits> | null
): CatalogDescriptionLimits {
  return {
    menuItem: integerInRange(
      value?.menuItem,
      DEFAULT_CATALOG_DESCRIPTION_LIMITS.menuItem
    ),
    category: integerInRange(
      value?.category,
      DEFAULT_CATALOG_DESCRIPTION_LIMITS.category
    ),
  }
}

export function resolveCatalogDescriptionLimits(
  content?: PlatformContentWithCatalogLimits | null
): CatalogDescriptionLimits {
  return normalizeCatalogDescriptionLimits(
    content?.operations?.ownerApp?.catalogDescriptionLimits
  )
}

export function clampCatalogDescription(value: string, maxLength: number) {
  return value.slice(0, maxLength)
}

export function getRemainingCatalogDescriptionChars(
  value: string,
  maxLength: number
) {
  return Math.max(0, maxLength - value.length)
}
