# Platform-Funded Menu Markdown — Implementation Plan

> Status: in progress. Platform-funded, admin-controlled per-item price markdown shown
> as strike-through on the customer menu. Built by **extending the existing voucher /
> promotions system** (not a parallel system), isolated behind a `surface` field.

## Locked decisions
- Extend the voucher/promotions system; do **not** build a parallel entity.
- New `surface: "checkout" | "menu_markdown"` switches behaviour into a separate branch.
- Funding is always **platform** (Option A: the owner receives the **full** listed price,
  the platform absorbs the difference).
- Scope: restaurant / category / item. Targeting: **zone + cuisine**.
- Threshold (e.g. ৳250) is evaluated **per-variant**. Discount applies to **base + variant**
  price only — **add-ons excluded** (genuine extras + budget protection).
- Usage caps (`maxTotalUses`, `maxUsesPerUser`) + **total budget cap** + per-item cap.
- Precedence when multiple rules match one item: **item > category > restaurant**.
- Stacking with owner coupons: markdown changes the item price first, coupon then applies on
  the reduced subtotal at checkout. Controlled by a global flag (default: stackable).
- Caps/budget are **authoritative at cart/order**; menu display only applies global
  active/schedule/budget gating (per-user cap default off for markdown surface).

## Phase 1 — Data model (`backend/src/modules/customer/customer.model.ts`, voucherSchema)
Add: `surface` (default `checkout`, keeps existing vouchers compatible), `cuisineTypes: [String]`,
`minItemPrice: Number`, `maxTotalDiscountBudget: Number`, `consumedDiscountBudget: Number`
(atomically maintained like `redeemedCount`). New index on
`{ surface, status, archivedAt, startsAt, endsAt }`.
Reused as-is: `maxDiscountAmount`, `maxTotalUses`, `maxUsesPerUser`, `applicability`,
`categoryIds`, `itemIds`, `fundedBy`, `platformSharePercent`, `redeemedCount`.

## Phase 2 — Admin service/API (`backend/src/modules/promotions/promotions.service.ts`)
- Extend `VoucherMutationParams` with the new fields.
- Validator: `surface === "menu_markdown"` forces `fundedBy = platform`, `mode = auto`,
  `type ∈ {flat, percentage}`; validates `cuisineTypes` against restaurant cuisines.
- Owner cannot create markdown (guard alongside `assertOwnerVoucherType`).
- Add `surface` filter in `buildVoucherQuery`.

## Phase 3 — Core computation helper (new, single source of truth)
`resolveMenuMarkdown(menuItems, activeRules)` — pure function. For each item/variant: find the
applicable rule (item > category > restaurant), check the per-variant threshold, compute
flat/percentage with per-item cap, guard against negative prices. Returns per item:
`originalPrice`, `effectivePrice`, `discountLabel`, `appliedRuleId`, and for variant items a
per-option discounted map + `cheapestQualifies`. Reused by menu-serve, cart, and order.

## Phase 4 — Menu serve (`backend/src/modules/customer/customer.service.ts`, ~3035)
Load active `surface: menu_markdown` rules (zone/cuisine scoped), run the helper, attach
`effectivePrice` + `discountLabel` + per-variant info to each menu item. Compute
`lowestMenuPrice` from effective prices.

## Phase 5 — Cart/quote pricing (`backend/src/modules/customer/customer-cart.service.ts`, ~364) — Option A core
Per line, compute markdown on the (base+variant) portion, add-ons excluded. Track two numbers:
`ownerSubtotal` (full, drives owner commission/payout) and `customerPayable` (after markdown).
Difference rolls into `platformDiscountCost`. Voucher discount is computed on the post-markdown
subtotal so it never double-counts. Expose `menuMarkdownAmount` in pricing.

## Phase 6 — Order placement + settlement (`backend/src/modules/customer/customer.service.ts`, ~4040-4136) — Option A
`subtotal`/`commissionBase` use `ownerSubtotal` (full) so markdown never reduces owner net.
`platformDiscountCost` = voucher platform part + menu markdown cost. Reuse the atomic
`redeemedCount` guard for `maxTotalUses`; add an analogous atomic `consumedDiscountBudget` guard
for the budget cap. Snapshot applied rule id + markdown amount on each order line; record a
markdown redemption row.

## Phase 7 — Customer app UI
Types in `customer-app/src/types/restaurant.ts`. Strike-through + badge in MenuCard /
ConnectedPopularItemCard / SearchResultCard; "discount on select sizes" badge when the cheapest
variant does not qualify; per-option pricing in the variant sheet; discounted unit price +
"Item savings" line in cart/checkout.

## Phase 8 — Admin web UI (`admin-web/src/components/coupons-page.tsx`)
New "Platform Price Offers" section (surface filter). Form: scope picker, zone + cuisine,
threshold, discount type+value, per-item cap, usage caps, total budget, schedule, status.
Reuse existing voucher analytics (+ budget consumed).

## Phase 9 — Owner visibility (read-only, optional)
Owner sees a "Platform offer active" badge on affected items; cannot edit.

## Performance & guardrails
In-memory cache of active markdown rules (invalidate on change). Caps/budget authoritative at
cart/order. Precedence item > category > restaurant. Stacking flag. Negative-price guard. All
prices recomputed on the backend. Budget/total exhaustion stops markdown; past orders unchanged
via snapshot.

## Rollout order
1. Model + helper (1,3) → 2. Admin manage (2,8) → 3. Menu display (4,7-display) →
4. Cart+order pricing/settlement (5,6) → 5. Caps/budget/analytics → 6. Owner visibility.
Note: display and pricing must ship together (5+6 with 4) to avoid menu/cart price mismatch.
