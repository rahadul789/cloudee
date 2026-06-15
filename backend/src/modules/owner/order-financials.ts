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
  if (typeof order.pricing?.subtotal === "number" && Number.isFinite(order.pricing.subtotal)) {
    return Math.max(0, order.pricing.subtotal)
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
    appliedVouchers: filterOwnerVisibleAppliedVouchers(order)
  }
}
