// Shared pricing helpers for the zero-commission "markup" model.
//
// A restaurant runs in one of two commercial models (auth.model commercial.pricingModel):
//   - "commission" (default): the customer sees the owner's real menu price; the platform
//     keeps commissionRate% of the subtotal.
//   - "markup": zero commission. Every customer-facing price has platformMarkupPercent%
//     added on top (per component, rounded). The owner keeps seeing the REAL price; the
//     platform's income is the markup. Commission is forced to 0 for these orders.
//
// Everything here is additive + backward-compatible: an order/restaurant WITHOUT the new
// fields is treated as "commission" with 0 markup, so all existing data (and the published
// customer app, which just renders backend numbers) behaves exactly as before.

function roundTaka(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

export function isMarkupRestaurant(
  restaurant: Record<string, any> | null | undefined,
): boolean {
  return (restaurant as any)?.commercial?.pricingModel === "markup";
}

export function isHybridRestaurant(
  restaurant: Record<string, any> | null | undefined,
): boolean {
  return (restaurant as any)?.commercial?.pricingModel === "hybrid";
}

function clampPercent(value: unknown): number {
  const pct = Number(value);
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  return Math.min(pct, 100);
}

// The commission rate (%) the restaurant gives on the REAL subtotal. 0 for pure "markup"
// restaurants; the configured rate for "commission" and "hybrid". This is the value stamped
// onto each order so settlement stays immutable regardless of later restaurant changes.
export function resolveRestaurantCommissionRatePercent(
  restaurant: Record<string, any> | null | undefined,
): number {
  if (isMarkupRestaurant(restaurant)) return 0;
  return clampPercent((restaurant as any)?.commercial?.commissionRate);
}

// The customer-facing markup percentage to add on top of prices for this restaurant.
//   - "commission": 0 (no markup; every markup helper is a byte-for-byte no-op).
//   - "markup": the configured platformMarkupPercent.
//   - "hybrid": max(0, targetTakeRatePercent − commissionRate) — the platform tops the
//     customer price up only for the part the restaurant's commission doesn't already cover,
//     so commission + markup == target% of the real price.
export function resolveRestaurantMarkupPercent(
  restaurant: Record<string, any> | null | undefined,
): number {
  if (isHybridRestaurant(restaurant)) {
    const target = clampPercent(
      (restaurant as any)?.commercial?.targetTakeRatePercent,
    );
    const commission = clampPercent(
      (restaurant as any)?.commercial?.commissionRate,
    );
    return Math.max(0, target - commission);
  }
  if (!isMarkupRestaurant(restaurant)) return 0;
  return clampPercent((restaurant as any)?.commercial?.platformMarkupPercent);
}

// Marks up a single customer-facing price component and rounds to whole taka. Applied
// per-component (not on the summed unit price) so the menu display and the cart quote —
// which add the same pieces — always agree to the taka.
//   - percent 0 (every commission restaurant): pure identity, no rounding, so existing
//     flows are byte-for-byte unchanged.
//   - a non-positive component (zero base, a negative "small size" delta) is returned
//     untouched: a discount option is never marked up, so the markup can never be negative.
export function markupComponentPrice(price: number, percent: number): number {
  if (!Number.isFinite(price)) return 0;
  if (!percent) return price;
  if (price <= 0) return price;
  return roundTaka(price * (1 + percent / 100));
}

// ---- Order-snapshot readers (used by owner + admin finance + ledger backfills) ----

// The REAL restaurant subtotal an order settles on. Prefers the explicit restaurantSubtotal
// snapshot (markup orders); falls back to pricing.subtotal, which for commission/legacy
// orders already IS the real subtotal. Returns null only when neither is present, so callers
// can keep their own legacy (total − delivery + discount) fallback.
export function getOrderRestaurantSubtotal(
  order: Record<string, any>,
): number | null {
  const pricing = order?.pricing ?? {};
  if (
    typeof pricing.restaurantSubtotal === "number" &&
    Number.isFinite(pricing.restaurantSubtotal)
  ) {
    return Math.max(0, pricing.restaurantSubtotal);
  }
  if (typeof pricing.subtotal === "number" && Number.isFinite(pricing.subtotal)) {
    return Math.max(0, pricing.subtotal);
  }
  return null;
}

// True when this specific order was PLACED under the markup model (snapshot stored on the
// order), so commission stays 0 even if the restaurant later switches models. Snapshot-based
// on purpose: it keeps historical finance immutable and 100% reconcilable.
export function isMarkupOrder(order: Record<string, any>): boolean {
  return order?.pricing?.pricingModel === "markup";
}

// True when the order was placed under the "hybrid" model (partial commission + top-up
// markup). Snapshot-based so historical finance is immutable.
export function isHybridOrder(order: Record<string, any>): boolean {
  return order?.pricing?.pricingModel === "hybrid";
}

// The commission rate (%) snapshotted on the order at placement, or null for orders that
// never carried one (legacy) — callers then fall back to the restaurant's dated rate.
export function getOrderCommissionRatePercent(
  order: Record<string, any>,
): number | null {
  const value = Number(order?.pricing?.commissionRatePercent);
  return Number.isFinite(value) ? Math.max(0, Math.min(value, 100)) : null;
}

// Platform markup income captured on the order (customer subtotal − restaurant subtotal).
export function getOrderPlatformMarkup(order: Record<string, any>): number {
  const value = Number(order?.pricing?.platformMarkup ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

// Aggregation expression that yields an order item's OWNER-REAL line revenue (item sales
// reports show the owner their own price, never the customer markup). Precedence:
//   1. itemsSnapshot.restaurantLineTotal — exact, stored on new markup orders.
//   2. Older markup orders lack it, but the order pricing snapshot still records
//      pricingModel + platformMarkupPercent, so remove the markup from the marked-up line
//      total: round(markedLineTotal / (1 + pct/100)).
//   3. Commission/legacy orders — the marked-up line total already IS the real price.
//
// `markedLineTotalExpr` is the customer-facing line-total expression the caller already uses
// (its own lineTotal/unitPrice fallback chain). `restaurantLineTotalPath` and `pricingPrefix`
// are field-path strings (e.g. "$itemsSnapshot.restaurantLineTotal" and "$pricing", or the
// "$order."-prefixed variants when itemsSnapshot is unwound from a joined order).
export function ownerRealLineTotalAggExpr(
  markedLineTotalExpr: unknown,
  restaurantLineTotalPath: string,
  pricingPrefix: string,
) {
  return {
    $ifNull: [
      restaurantLineTotalPath,
      {
        $let: {
          vars: {
            markupPct: {
              $cond: [
                {
                  $in: [
                    `${pricingPrefix}.pricingModel`,
                    ["markup", "hybrid"],
                  ],
                },
                { $ifNull: [`${pricingPrefix}.platformMarkupPercent`, 0] },
                0,
              ],
            },
            markedLineTotal: markedLineTotalExpr,
          },
          in: {
            $cond: [
              { $gt: ["$$markupPct", 0] },
              {
                $round: [
                  {
                    $divide: [
                      "$$markedLineTotal",
                      { $add: [1, { $divide: ["$$markupPct", 100] }] },
                    ],
                  },
                  0,
                ],
              },
              "$$markedLineTotal",
            ],
          },
        },
      },
    ],
  };
}
