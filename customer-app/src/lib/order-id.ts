export function formatShortOrderId(value?: string | null, length = 8) {
  const orderId = String(value ?? "").trim().replace(/\s+/g, "");

  if (!orderId) {
    return "ORDER";
  }

  return orderId.slice(-length).toUpperCase();
}

export function formatShortOrderIdLabel(value?: string | null, length = 8) {
  return `ID #${formatShortOrderId(value, length)}`;
}
