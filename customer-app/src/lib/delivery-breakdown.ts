import { formatCurrency } from "@/src/lib/currency";

// Backend-supplied split of HOW the delivery fee was reached. The cart/checkout read
// it from the live quote (`quote.deliveryBreakdown`); placed orders carry the same
// shape under `order.pricing.deliveryBreakdown` (persisted at order creation). Older
// orders placed before that change simply lack it, so every consumer treats it as
// optional and falls back to the flat delivery fee.
export type CustomerDeliveryBreakdown = {
  distanceKm: number | null;
  baseFee: number;
  baseCoversKm: number;
  distanceSurchargeEnabled: boolean;
  extraDistanceKm: number;
  extraDistanceFee: number;
  surchargeStepMeters: number;
  surchargeAmountTaka: number;
  totalFee: number;
};

// True when a distance surcharge was actually charged on top of the base fee — the
// only case where the fee should be shown as base + "+extra" instead of a flat value.
export function hasDeliveryDistanceSurcharge(
  breakdown: CustomerDeliveryBreakdown | null | undefined,
): breakdown is CustomerDeliveryBreakdown {
  return Boolean(breakdown && breakdown.extraDistanceFee > 0);
}

// One-line "why this fee" note, identical wording across cart, checkout, and every
// placed-order screen so the delivery fee never reads as arbitrary. Returns null when
// there is nothing meaningful to say (no breakdown / no distance).
export function buildDeliveryWhyText(
  breakdown: CustomerDeliveryBreakdown | null | undefined,
): string | null {
  if (!breakdown) return null;
  const { distanceKm, baseFee, extraDistanceFee, extraDistanceKm } = breakdown;
  const distanceLabel =
    typeof distanceKm === "number" ? `${distanceKm} km` : null;
  // Only explain the fee when a distance surcharge was actually charged on top of the
  // base — spell out base + extra. A plain flat fee is self-explanatory, so we show NO
  // note for it (keeps the delivery-fee row clean).
  if (extraDistanceFee > 0) {
    const extra =
      extraDistanceKm > 0
        ? `${extraDistanceKm} km extra ${formatCurrency(extraDistanceFee)}`
        : `distance ${formatCurrency(extraDistanceFee)}`;
    const base = `Base ${formatCurrency(baseFee)}`;
    return distanceLabel
      ? `${distanceLabel} · ${base} + ${extra}`
      : `${base} + ${extra}`;
  }
  return null;
}
