// Admin-set urgent/priority delivery add-on. The backend computes and prices it; the app
// DISPLAYS it and offers an opt-in toggle at checkout. Shape matches the backend
// `urgentDeliveryInfo` (quote) and `pricing.urgentDeliveryInfo` (placed order). Everything
// is optional so older orders / older backends degrade to "no urgent delivery".
export type CustomerUrgentDeliveryInfo = {
  enabled: boolean;
  label: string;
  note: string;
  // Charged amount when opted in; the SUGGESTED add-on before opting in.
  amount: number;
  charged: boolean;
};

const DEFAULT_URGENT_DELIVERY_LABEL = "Urgent delivery";

export function urgentDeliveryLabel(
  info: CustomerUrgentDeliveryInfo | null | undefined,
): string {
  const label = info?.label?.trim();
  return label && label.length > 0 ? label : DEFAULT_URGENT_DELIVERY_LABEL;
}

// The opt-in toggle is offered only when the add-on is enabled AND has a positive amount —
// otherwise there is nothing meaningful to opt into.
export function canOptIntoUrgentDelivery(
  info: CustomerUrgentDeliveryInfo | null | undefined,
): info is CustomerUrgentDeliveryInfo {
  return Boolean(info && info.enabled && Number(info.amount) > 0);
}

// Was THIS order actually placed with urgent/priority delivery? Checks every reliable
// signal: the top-level `isUrgent` flag (present on order detail) plus the pricing
// receipt (`urgentDeliveryInfo.charged` / `urgentDeliveryFee`), which is always returned
// on both the order list and detail. Used by the tracking banner and the live-order
// floating button so they agree.
export function isUrgentOrder(
  order:
    | {
        isUrgent?: boolean;
        pricing?: {
          urgentDeliveryFee?: number;
          urgentDeliveryInfo?: { charged?: boolean } | null;
        } | null;
      }
    | null
    | undefined,
): boolean {
  if (!order) return false;
  if (order.isUrgent === true) return true;
  if (order.pricing?.urgentDeliveryInfo?.charged === true) return true;
  return Number(order.pricing?.urgentDeliveryFee ?? 0) > 0;
}
