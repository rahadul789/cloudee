// Admin-set customer platform fee ("App / Platform fee"). The backend computes and prices
// it; the app only DISPLAYS it and, for the "optional" mode, offers an opt-in toggle at
// checkout. Shape matches the backend `platformFeeInfo` (quote) and `pricing.platformFeeInfo`
// (placed order). Everything is optional so older orders / older backends degrade to "no fee".
export type CustomerPlatformFeeInfo = {
  enabled: boolean;
  mode: "flat" | "percentage" | "optional";
  label: string;
  note: string;
  // Charged amount for flat/percentage; the SUGGESTED add-on for the optional mode.
  amount: number;
  percentage: number;
  optional: boolean;
  charged: boolean;
};

const DEFAULT_PLATFORM_FEE_LABEL = "Platform fee";

export function platformFeeLabel(
  info: CustomerPlatformFeeInfo | null | undefined,
): string {
  const label = info?.label?.trim();
  return label && label.length > 0 ? label : DEFAULT_PLATFORM_FEE_LABEL;
}

// The optional-mode opt-in toggle is offered only when the fee is enabled AND optional AND
// has a positive suggested amount — otherwise there is nothing meaningful to opt into.
export function canOptIntoPlatformFee(
  info: CustomerPlatformFeeInfo | null | undefined,
): info is CustomerPlatformFeeInfo {
  return Boolean(
    info && info.enabled && info.optional && Number(info.amount) > 0,
  );
}
