type OfferLike = {
  title?: string | null;
  voucherCode?: string | null;
  voucherLabel?: string | null;
  voucherExpiresAt?: string | null;
  voucherMinOrder?: number | null;
  // Real discount from the voucher (backend enrichment) — preferred over the label text.
  voucherDiscountType?: string | null;
  voucherDiscountValue?: number | null;
  voucherMaxDiscount?: number | null;
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function cleanLabel(value?: string | null) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

export function getOfferCodeLabel(offer?: OfferLike | null) {
  const code = cleanLabel(offer?.voucherCode).toUpperCase();
  return code || "Personal voucher";
}

/** "৳50 off" · "10% off · up to ৳50" · "Free delivery" from the voucher itself, or "". */
export function getOfferDiscountText(offer?: OfferLike | null) {
  const type = offer?.voucherDiscountType ?? "";
  const value = Number(offer?.voucherDiscountValue ?? 0);
  const max = Number(offer?.voucherMaxDiscount ?? 0);
  if (type === "free_delivery") return "Free delivery";
  if (type === "flat" && value > 0) return `৳${Math.round(value)} off`;
  if (type === "percentage" && value > 0) {
    return max > 0 ? `${Math.round(value)}% off · up to ৳${Math.round(max)}` : `${Math.round(value)}% off`;
  }
  return "";
}

export function getOfferAmountLabel(offer?: OfferLike | null) {
  const discount = getOfferDiscountText(offer);
  if (discount) return discount;
  const label = cleanLabel(offer?.voucherLabel) || cleanLabel(offer?.title);
  if (!label) return "Special discount";

  if (
    /^a\s+(personal|special)\s+voucher/i.test(label) ||
    /^a\s+special\s+offer/i.test(label)
  ) {
    return "Special discount";
  }

  return label;
}

export function formatOfferExpiry(value?: string | null) {
  if (!value) return "No expiry";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No expiry";

  const label = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  const currentYear = new Date().getFullYear();
  return `Expires ${date.getFullYear() === currentYear ? label : `${label} ${date.getFullYear()}`}`;
}

export function getOfferConditionLabel(offer?: OfferLike | null) {
  const minOrder = offer?.voucherMinOrder;
  if (typeof minOrder === "number" && Number.isFinite(minOrder) && minOrder > 0) {
    return `Min Tk ${Math.ceil(minOrder)}`;
  }

  return "No min order";
}
