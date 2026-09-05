import { getOrderRestaurantSubtotal } from "../../common/utils/order-pricing"

type VoucherSnapshot = Record<string, any>

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function getDiscountAmount(order: Record<string, any>) {
  return numberValue(
    order.pricing?.discountAmount,
    numberValue(order.pricing?.discount)
  )
}

function getAppliedVoucherDiscountSplit(order: Record<string, any>) {
  const vouchers = Array.isArray(order.appliedVouchers) ? order.appliedVouchers : []

  if (!vouchers.length) {
    return null
  }

  return vouchers.reduce(
    (summary, voucher) => {
      const discountAmount = numberValue(voucher?.discountAmount)
      const fundedBy = String(voucher?.fundedBy ?? "owner").toLowerCase()
      const ownerSharePercent =
        fundedBy === "platform"
          ? 0
          : fundedBy === "owner"
            ? 100
            : Math.min(100, Math.max(0, numberValue(voucher?.ownerSharePercent)))
      const ownerDiscountCost = numberValue(
        voucher?.ownerDiscountCost,
        Math.round(discountAmount * (ownerSharePercent / 100))
      )
      const platformDiscountCost = numberValue(
        voucher?.platformDiscountCost,
        Math.max(0, discountAmount - ownerDiscountCost)
      )

      summary.ownerDiscountCost += ownerDiscountCost
      summary.platformDiscountCost += platformDiscountCost
      return summary
    },
    { ownerDiscountCost: 0, platformDiscountCost: 0 }
  )
}

export function getOrderSubtotalForOwner(order: Record<string, any>) {
  // Owner always sees the REAL restaurant subtotal, never the customer-facing marked-up one.
  // For commission/legacy orders restaurantSubtotal === pricing.subtotal.
  const restaurantSubtotal = getOrderRestaurantSubtotal(order)
  if (restaurantSubtotal !== null) {
    return restaurantSubtotal
  }

  const total = numberValue(order.pricing?.total)
  const deliveryFee = numberValue(order.pricing?.deliveryFee)
  return Math.max(0, total - deliveryFee + getDiscountAmount(order))
}

export function getOrderOwnerDiscountCost(order: Record<string, any>) {
  const voucherSplit = getAppliedVoucherDiscountSplit(order)
  return numberValue(
    order.pricing?.ownerDiscountCost,
    voucherSplit?.ownerDiscountCost ?? getDiscountAmount(order)
  )
}

export function getOrderPlatformDiscountCost(order: Record<string, any>) {
  const voucherSplit = getAppliedVoucherDiscountSplit(order)
  return numberValue(
    order.pricing?.platformDiscountCost,
    voucherSplit?.platformDiscountCost ?? 0
  )
}

export function getOrderCustomerPaidTotal(order: Record<string, any>) {
  const subtotal = getOrderSubtotalForOwner(order)
  const deliveryFee = numberValue(order.pricing?.deliveryFee)
  const discountAmount = getDiscountAmount(order)
  return numberValue(order.pricing?.total, Math.max(0, subtotal + deliveryFee - discountAmount))
}

function getVoucherOwnerSharePercent(voucher: VoucherSnapshot) {
  const fundedBy = String(voucher.fundedBy ?? "owner").toLowerCase()

  if (fundedBy === "platform") return 0
  if (fundedBy === "owner") return 100

  return Math.min(100, Math.max(0, numberValue(voucher.ownerSharePercent, 0)))
}

function buildOwnerVisibleVoucher(voucher: VoucherSnapshot) {
  const discountAmount = numberValue(voucher.discountAmount)
  const ownerSharePercent = getVoucherOwnerSharePercent(voucher)
  const ownerDiscountCost = Math.round(discountAmount * (ownerSharePercent / 100))

  if (ownerDiscountCost <= 0) return null

  return {
    ...voucher,
    discountAmount: ownerDiscountCost,
    totalDiscountAmount: discountAmount,
    ownerDiscountCost,
    platformDiscountCost: Math.max(0, discountAmount - ownerDiscountCost),
    ownerSharePercent
  }
}

export function filterOwnerVisibleAppliedVouchers(order: Record<string, any>) {
  const vouchers = Array.isArray(order.appliedVouchers) ? order.appliedVouchers : []
  return vouchers
    .map((voucher) => buildOwnerVisibleVoucher(voucher as VoucherSnapshot))
    .filter(Boolean)
}

// Owner must see the REAL per-item price, never the customer-facing marked-up one. Every owner
// order view (app + web) renders itemsSnapshot.unitPrice, so we overwrite it here with the
// owner's actual price:
//   - New markup orders carry per-item restaurantUnitPrice/restaurantLineTotal → use those.
//   - Older markup orders (placed before those fields existed) don't, but the order pricing
//     snapshot still records pricingModel + platformMarkupPercent, so we remove the markup:
//     realUnit = round(unitPrice / (1 + pct/100)). Matches the ৳209 → ৳180 the owner expects.
//   - Commission/legacy orders are already real → left untouched.
function decorateOwnerVisibleItems(order: Record<string, any>) {
  const items = Array.isArray(order.itemsSnapshot) ? order.itemsSnapshot : null
  if (!items) return order.itemsSnapshot

  const pricing = order?.pricing ?? {}
  const fallbackMarkupPercent =
    pricing.pricingModel === "markup" &&
    numberValue(pricing.platformMarkupPercent) > 0
      ? numberValue(pricing.platformMarkupPercent)
      : 0

  return items.map((item: Record<string, any>) => {
    const quantity = numberValue(item?.quantity, 1)

    let realUnitPrice: number | null = null
    if (
      typeof item?.restaurantUnitPrice === "number" &&
      Number.isFinite(item.restaurantUnitPrice)
    ) {
      realUnitPrice = item.restaurantUnitPrice
    } else if (
      fallbackMarkupPercent > 0 &&
      typeof item?.unitPrice === "number" &&
      Number.isFinite(item.unitPrice)
    ) {
      realUnitPrice = Math.round(
        item.unitPrice / (1 + fallbackMarkupPercent / 100)
      )
    }

    // Commission / legacy item — unitPrice is already the owner's real price.
    if (realUnitPrice === null) return item

    const realLineTotal = numberValue(
      item.restaurantLineTotal,
      realUnitPrice * quantity
    )
    return {
      ...item,
      unitPrice: realUnitPrice,
      lineTotal: realLineTotal,
      // Owner is paid the full real price; there is no customer markdown from their side.
      effectiveUnitPrice: realUnitPrice,
      effectiveLineTotal: realLineTotal,
      markdownPerUnit: 0
    }
  })
}

export function decorateOwnerFinancials<T extends Record<string, any>>(order: T) {
  const subtotal = getOrderSubtotalForOwner(order)
  const ownerDiscountCost = getOrderOwnerDiscountCost(order)
  const platformDiscountCost = getOrderPlatformDiscountCost(order)
  const customerPaidTotal = getOrderCustomerPaidTotal(order)
  const restaurantNetSales = Math.max(0, subtotal - ownerDiscountCost)

  return {
    ...order,
    pricing: {
      ...(order.pricing ?? {}),
      subtotal,
      restaurantSubtotal: subtotal,
      ownerDiscountCost,
      platformDiscountCost,
      restaurantNetSales,
      customerPaidTotal,
      ownerVisibleDiscount: ownerDiscountCost
    },
    itemsSnapshot: decorateOwnerVisibleItems(order),
    appliedVouchers: filterOwnerVisibleAppliedVouchers(order)
  }
}
