type OfferLike = {
  title?: string | null;
  voucherCode?: string | null;
  voucherLabel?: string | null;
  voucherExpiresAt?: string | null;
  voucherMinOrder?: number | null;
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

export function getOfferAmountLabel(offer?: OfferLike | null) {
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
