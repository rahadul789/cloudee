export function formatCurrency(value?: number | null) {
  const amount = Number.isFinite(value ?? NaN) ? Number(value) : 0;
  return `Tk ${Math.round(amount).toLocaleString("en-BD")}`;
}

export function formatTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function getOrderPlacedAt(order: {
  timestamps?: Record<string, string | undefined>;
  createdAt?: string | null;
}) {
  return (
    order.timestamps?.createdAt ??
    order.timestamps?.placedAt ??
    order.timestamps?.New ??
    order.createdAt ??
    ""
  );
}

type OwnerPricingLike = {
  subtotal?: number;
  deliveryFee?: number;
  discountAmount?: number;
  ownerDiscountCost?: number;
  restaurantSubtotal?: number;
  restaurantNetSales?: number;
  customerPaidTotal?: number;
  ownerVisibleDiscount?: number;
  total?: number;
};

export function getOwnerOrderSubtotal(order: { pricing?: OwnerPricingLike }) {
  if (typeof order.pricing?.restaurantSubtotal === "number") {
    return order.pricing.restaurantSubtotal;
  }
  if (typeof order.pricing?.subtotal === "number") {
    return order.pricing.subtotal;
  }
  return Math.max(
    0,
    (order.pricing?.total ?? 0) -
      (order.pricing?.deliveryFee ?? 0) +
      (order.pricing?.discountAmount ?? getOwnerOrderDiscount(order))
  );
}

export function getOwnerOrderDiscount(order: { pricing?: OwnerPricingLike }) {
  return (
    order.pricing?.ownerDiscountCost ??
    order.pricing?.ownerVisibleDiscount ??
    order.pricing?.discountAmount ??
    0
  );
}

export function getOwnerOrderNetSales(order: { pricing?: OwnerPricingLike }) {
  return (
    order.pricing?.restaurantNetSales ??
    Math.max(0, getOwnerOrderSubtotal(order) - getOwnerOrderDiscount(order))
  );
}

export function getOwnerOrderCustomerPaidTotal(order: { pricing?: OwnerPricingLike }) {
  return (
    order.pricing?.customerPaidTotal ??
    order.pricing?.total ??
    Math.max(
      0,
      (order.pricing?.subtotal ?? 0) +
        (order.pricing?.deliveryFee ?? 0) -
        (order.pricing?.discountAmount ?? getOwnerOrderDiscount(order))
    )
  );
}
