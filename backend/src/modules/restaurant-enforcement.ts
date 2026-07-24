export type RestaurantEnforcementStatus =
  | "active"
  | "under_review"
  | "quality_hold"
  | "temporarily_suspended"
  | "permanently_disabled";

const BLOCKING_STATUSES = new Set<RestaurantEnforcementStatus>([
  "quality_hold",
  "temporarily_suspended",
  "permanently_disabled",
]);

export function getRestaurantEnforcement(restaurant: Record<string, any> | null | undefined) {
  const enforcement = restaurant?.enforcement ?? {};
  const rawStatus =
    typeof enforcement.status === "string" ? enforcement.status : "active";
  const status: RestaurantEnforcementStatus =
    rawStatus === "under_review" ||
    rawStatus === "quality_hold" ||
    rawStatus === "temporarily_suspended" ||
    rawStatus === "permanently_disabled"
      ? rawStatus
      : "active";
  const expiresAt = enforcement.expiresAt ? new Date(enforcement.expiresAt) : null;
  const isExpired = Boolean(expiresAt && expiresAt.getTime() <= Date.now());
  const effectiveStatus = isExpired ? "active" : status;

  return {
    status,
    effectiveStatus,
    isExpired,
    isRestricted: BLOCKING_STATUSES.has(effectiveStatus),
    reason: String(enforcement.reason ?? ""),
    ownerNote: String(enforcement.ownerNote ?? ""),
    customerMessage:
      String(enforcement.customerMessage ?? "").trim() ||
      "This restaurant is temporarily unavailable.",
    internalNote: String(enforcement.internalNote ?? ""),
    startsAt: enforcement.startsAt ?? null,
    expiresAt: enforcement.expiresAt ?? null,
    updatedAt: enforcement.updatedAt ?? null,
    updatedByAdminId: String(enforcement.updatedByAdminId ?? ""),
    history: Array.isArray(enforcement.history) ? enforcement.history : [],
  };
}

export function isRestaurantOrderingRestricted(
  restaurant: Record<string, any> | null | undefined,
) {
  return getRestaurantEnforcement(restaurant).isRestricted;
}

/**
 * Customer-facing view. Customers must only ever see the message written for them —
 * never the admin's `internalNote`/`reason`/`history` or the note meant for the owner.
 */
export function getCustomerRestaurantEnforcement(
  restaurant: Record<string, any> | null | undefined,
) {
  const enforcement = getRestaurantEnforcement(restaurant);

  return {
    isRestricted: enforcement.isRestricted,
    customerMessage: enforcement.customerMessage,
  };
}

/**
 * Owner-facing view of the enforcement record. `internalNote`, `reason`, `history`
 * and `updatedByAdminId` are admin-only bookkeeping and must never reach the owner
 * app/web payload — only `ownerNote` (the admin's "Owner-visible note") and the
 * customer-facing message are shared.
 */
export function getOwnerRestaurantEnforcement(
  restaurant: Record<string, any> | null | undefined,
) {
  const enforcement = getRestaurantEnforcement(restaurant);

  return {
    status: enforcement.status,
    effectiveStatus: enforcement.effectiveStatus,
    isRestricted: enforcement.isRestricted,
    isExpired: enforcement.isExpired,
    ownerNote: enforcement.ownerNote,
    customerMessage: enforcement.customerMessage,
    startsAt: enforcement.startsAt,
    expiresAt: enforcement.expiresAt,
    updatedAt: enforcement.updatedAt,
  };
}
