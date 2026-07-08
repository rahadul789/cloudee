// Shared "unlock the next offer" progress model used by the restaurant-details cart
// footer and the cart screen. It merges every candidate offer the customer could get on
// this cart — tiered auto vouchers AND the per-customer first-order (welcome) discount —
// and, because only ONE discount ever applies, reports the single best deal currently
// active plus the nearest threshold that would unlock a bigger one.

export type OfferTier = {
  minimumOrderAmount: number;
  discount: number; // taka value, for picking the best tier
  label: string; // short, e.g. "৳50 off", "10% off", "free delivery"
  context?: string; // optional suffix for the subtitle, e.g. "your first order"
};

export type OfferProgress = {
  target: number;
  remaining: number;
  ratio: number;
  hasCurrent: boolean; // a discount is active on the current subtotal
  unlocked: boolean; // no bigger tier left to chase
  currentLabel: string;
  currentContext: string;
  nextLabel: string;
  nextContext: string;
};

export function computeOfferProgress(
  tiers: OfferTier[],
  subtotal: number,
): OfferProgress | null {
  const valid = tiers.filter(
    (tier) => tier.minimumOrderAmount > 0 && tier.discount > 0,
  );
  if (!valid.length) return null;

  // Best discount already unlocked at the current subtotal.
  let current: OfferTier | null = null;
  for (const tier of valid) {
    if (
      tier.minimumOrderAmount <= subtotal &&
      (!current || tier.discount > current.discount)
    ) {
      current = tier;
    }
  }
  const currentDiscount = current?.discount ?? 0;

  // Nearest not-yet-reached threshold that beats what's already unlocked.
  let next: OfferTier | null = null;
  for (const tier of valid) {
    if (tier.minimumOrderAmount > subtotal && tier.discount > currentDiscount) {
      if (!next || tier.minimumOrderAmount < next.minimumOrderAmount) {
        next = tier;
      }
    }
  }

  const barTier = next ?? current ?? valid[valid.length - 1];
  const target = Math.max(barTier.minimumOrderAmount, 1);
  const remaining = Math.max(0, target - subtotal);
  const ratio = Math.max(0, Math.min(1, subtotal / target));

  return {
    target,
    remaining,
    ratio,
    hasCurrent: Boolean(current),
    unlocked: !next,
    currentLabel: current?.label ?? "",
    currentContext: current?.context ?? "",
    nextLabel: next?.label ?? "",
    nextContext: next?.context ?? "",
  };
}
