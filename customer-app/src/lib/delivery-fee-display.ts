// Card-level delivery fee copy. Cards never show a big exact fee: anything above the cap
// reads "৳20+" (the exact amount is shown at checkout), 0 reads "Free delivery".
export const DELIVERY_FEE_DISPLAY_CAP = 20;

export function formatCardDeliveryFee(
  fee: number | null | undefined,
): { label: string; isFree: boolean } | null {
  if (typeof fee !== "number" || !Number.isFinite(fee) || fee < 0) return null;
  if (fee === 0) return { label: "Free delivery", isFree: true };
  const rounded = Math.round(fee);
  return {
    label:
      rounded > DELIVERY_FEE_DISPLAY_CAP
        ? `৳${DELIVERY_FEE_DISPLAY_CAP}+`
        : `৳${rounded}`,
    isFree: false,
  };
}
