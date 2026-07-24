import { useOwnerLanguageStore } from "@/src/i18n/language-store";

const BENGALI_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

function getOwnerLanguage() {
  return useOwnerLanguageStore.getState().language;
}

// Converts ASCII digits in a string to Bengali numerals. Used so numbers shown
// in the owner app match the chosen interface language.
export function localizeDigits(value: string, language = getOwnerLanguage()) {
  if (language !== "bn") return value;
  return value.replace(/[0-9]/g, (digit) => BENGALI_DIGITS[Number(digit)]);
}

export function formatCurrency(value?: number | null) {
  const amount = Number.isFinite(value ?? NaN) ? Number(value) : 0;
  const language = getOwnerLanguage();
  const formatted = Math.round(amount).toLocaleString("en-BD");
  if (language === "bn") {
    return `৳ ${localizeDigits(formatted, language)}`;
  }
  return `Tk ${formatted}`;
}

export function formatTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const formatted = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);

  const language = getOwnerLanguage();
  if (language === "bn") {
    return localizeDigits(formatted, language)
      .replace(/\bAM\b/g, "AM")
      .replace(/\bPM\b/g, "PM");
  }
  return formatted;
}

// "12 Jul, 4:30 PM" — used where a date alone is ambiguous (e.g. an enforcement
// window that ends later today vs next week).
export function formatDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const formatted = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);

  return localizeDigits(formatted);
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
