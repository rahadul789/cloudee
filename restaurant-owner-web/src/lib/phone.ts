export function normalizeBangladeshPhone(value: string) {
  return value.replace(/\D/g, "")
}

export function sanitizeBangladeshPhoneInput(value: string) {
  return normalizeBangladeshPhone(value).slice(0, 11)
}

export function isValidBangladeshPhone(value: string) {
  const normalized = normalizeBangladeshPhone(value)
  return /^01\d{9}$/.test(normalized)
}

export function formatBangladeshPhonePlaceholder() {
  return "01XXXXXXXXX"
}
