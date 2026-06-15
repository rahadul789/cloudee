export function maskPhoneForDisplay(phone?: string | null) {
  const digits = String(phone ?? "").replace(/\D/g, "");

  if (digits.length < 8) {
    return phone ? String(phone) : "";
  }

  return `${digits.slice(0, 5)}***${digits.slice(-3)}`;
}
