import mongoose from "mongoose"

/**
 * Platform-funded menu markdown resolution — the single source of truth shared by the
 * customer menu-serve endpoint, the cart quote, and order placement. Keeping the maths in
 * one pure module guarantees the strike-through price the customer sees, the price they pay,
 * and the platform cost recorded at settlement can never drift apart.
 *
 * Funding model (Option A): the owner is always paid the full listed price; the platform
 * absorbs the markdown. Discounts apply to the (base + variant) price only — add-ons are
 * excluded so customers cannot inflate the platform subsidy by piling on extras.
 */

export type MarkdownRule = {
  _id: unknown
  scopeType?: "restaurant" | "selected_restaurants" | "all_restaurants"
  restaurantId?: unknown
  selectedRestaurantIds?: unknown[]
  applicability?: "all" | "categories" | "items"
  categoryIds?: unknown[]
  itemIds?: unknown[]
  type?: "flat" | "percentage" | "free_delivery"
  discountValue?: number
  maxDiscountAmount?: number
  minItemPrice?: number
  priority?: number
}

export type MarkdownMenuItem = {
  _id: unknown
  categoryId: unknown
  basePrice: number
  variants?: Array<{ options?: Array<{ priceDelta?: number }> }>
}

export type ItemMarkdownDisplay = {
  ruleId: string
  discountType: "flat" | "percentage"
  discountValue: number
  /** Threshold + cap echoed so the app can recompute the exact markdown per selected variant. */
  minItemPrice: number
  maxDiscountAmount: number
  /** Full (pre-markdown) starting price shown struck-through. */
  originalPrice: number
  /** Discounted starting price the card shows. Equals originalPrice when partialVariants. */
  effectivePrice: number
  /** True when the markdown actually lowers the displayed starting price. */
  hasMarkdown: boolean
  /**
   * True for variant items whose cheapest option is below the threshold but a pricier one
   * qualifies — the UI shows a "discount on select sizes" badge instead of a struck price.
   */
  partialVariants: boolean
  discountLabel: string
}

function idString(value: unknown) {
  if (!value) return ""
  if (typeof value === "string") return value
  if (value instanceof mongoose.Types.ObjectId) return value.toString()
  return String(value)
}

function num(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function ruleMatchesRestaurant(rule: MarkdownRule, restaurantId: string) {
  const scopeType = rule.scopeType ?? "restaurant"
  if (scopeType === "all_restaurants") return true
  if (scopeType === "selected_restaurants") {
    return (rule.selectedRestaurantIds ?? []).map(idString).includes(restaurantId)
  }
  return idString(rule.restaurantId) === restaurantId
}

function ruleMatchesItem(rule: MarkdownRule, item: MarkdownMenuItem) {
  const applicability = rule.applicability ?? "all"
  if (applicability === "all") return true
  if (applicability === "categories") {
    return (rule.categoryIds ?? []).map(idString).includes(idString(item.categoryId))
  }
  if (applicability === "items") {
    return (rule.itemIds ?? []).map(idString).includes(idString(item._id))
  }
  return false
}

function ruleSpecificity(rule: MarkdownRule) {
  if (rule.applicability === "items") return 3
  if (rule.applicability === "categories") return 2
  return 1
}

/**
 * Pick the best markdown rule for a single item. Precedence: most specific applicability
 * (item > category > restaurant-wide), then admin priority, then higher discountValue.
 * Rules passed in must already be active (status/schedule/zone/cuisine filtered upstream).
 */
export function pickRuleForItem(
  item: MarkdownMenuItem,
  rules: MarkdownRule[],
  restaurantId: string,
): MarkdownRule | null {
  const matches = rules.filter(
    (rule) =>
      (rule.type === "flat" || rule.type === "percentage") &&
      ruleMatchesRestaurant(rule, restaurantId) &&
      ruleMatchesItem(rule, item),
  )
  if (!matches.length) return null

  return matches.sort((left, right) => {
    const specificity = ruleSpecificity(right) - ruleSpecificity(left)
    if (specificity !== 0) return specificity
    const priority = num(right.priority) - num(left.priority)
    if (priority !== 0) return priority
    return num(right.discountValue) - num(left.discountValue)
  })[0]
}

/**
 * Compute the platform-funded discount (in taka, rounded) for an exact (base + variant)
 * price under a rule. Returns 0 when the price is below the rule's threshold. Never returns
 * more than the price itself, so the effective price can never go negative.
 */
export function computeMarkdownAmount(basePlusVariant: number, rule: MarkdownRule): number {
  const price = num(basePlusVariant)
  if (price <= 0) return 0
  const threshold = num(rule.minItemPrice)
  if (threshold > 0 && price < threshold) return 0

  let raw =
    rule.type === "percentage"
      ? (price * num(rule.discountValue)) / 100
      : num(rule.discountValue)

  const cap = num(rule.maxDiscountAmount)
  if (cap > 0) raw = Math.min(raw, cap)
  raw = Math.min(raw, price)
  return Math.max(0, Math.round(raw))
}

function lowestVariantDelta(item: MarkdownMenuItem) {
  const deltas = (item.variants ?? [])
    .flatMap((group) => group.options ?? [])
    .map((option) => num(option.priceDelta))
  if (!deltas.length) return 0
  return Math.max(0, Math.min(...deltas))
}

function highestVariantDelta(item: MarkdownMenuItem) {
  const deltas = (item.variants ?? [])
    .flatMap((group) => group.options ?? [])
    .map((option) => num(option.priceDelta))
  if (!deltas.length) return 0
  return Math.max(0, ...deltas)
}

function buildLabel(rule: MarkdownRule) {
  if (rule.type === "percentage") return `${num(rule.discountValue)}% OFF`
  return `৳${num(rule.discountValue)} OFF`
}

/**
 * Build the display markdown for a menu item (used by menu-serve). Mirrors the customer
 * app's "starts from" price using the lowest variant delta. Because the threshold is a
 * minimum price, qualification is monotonic: if the cheapest variant qualifies every
 * variant does (clean struck price); if only pricier ones qualify we flag partialVariants
 * so the UI shows a "select sizes" badge instead of a misleading struck price.
 */
export function buildItemMarkdownDisplay(
  item: MarkdownMenuItem,
  rule: MarkdownRule | null,
): ItemMarkdownDisplay | null {
  if (!rule || (rule.type !== "flat" && rule.type !== "percentage")) return null

  const startingPrice = num(item.basePrice) + lowestVariantDelta(item)
  const maxPrice = num(item.basePrice) + highestVariantDelta(item)
  const startingDiscount = computeMarkdownAmount(startingPrice, rule)

  if (startingDiscount > 0) {
    return {
      ruleId: idString(rule._id),
      discountType: rule.type,
      discountValue: num(rule.discountValue),
      minItemPrice: num(rule.minItemPrice),
      maxDiscountAmount: num(rule.maxDiscountAmount),
      originalPrice: startingPrice,
      effectivePrice: startingPrice - startingDiscount,
      hasMarkdown: true,
      partialVariants: false,
      discountLabel: buildLabel(rule),
    }
  }

  if (computeMarkdownAmount(maxPrice, rule) > 0) {
    return {
      ruleId: idString(rule._id),
      discountType: rule.type,
      discountValue: num(rule.discountValue),
      minItemPrice: num(rule.minItemPrice),
      maxDiscountAmount: num(rule.maxDiscountAmount),
      originalPrice: startingPrice,
      effectivePrice: startingPrice,
      hasMarkdown: false,
      partialVariants: true,
      discountLabel: buildLabel(rule),
    }
  }

  return null
}

/**
 * Resolve display markdown for a batch of menu items. Returns a Map keyed by item id so the
 * menu-serve endpoint can attach `markdown` to each item it returns.
 */
export function resolveMenuMarkdownForDisplay(
  items: MarkdownMenuItem[],
  rules: MarkdownRule[],
  restaurantId: string,
): Map<string, ItemMarkdownDisplay> {
  const result = new Map<string, ItemMarkdownDisplay>()
  if (!rules.length) return result
  for (const item of items) {
    const display = buildItemMarkdownDisplay(item, pickRuleForItem(item, rules, restaurantId))
    if (display) result.set(idString(item._id), display)
  }
  return result
}
