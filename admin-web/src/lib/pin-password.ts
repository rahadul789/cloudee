export const PIN_PASSWORD_LENGTH = 6

export function generatePinPassword() {
  const minimum = 10 ** (PIN_PASSWORD_LENGTH - 1)
  const range = 9 * minimum

  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const values = new Uint32Array(1)
    globalThis.crypto.getRandomValues(values)
    return String(minimum + (values[0] % range))
  }

  return String(minimum + Math.floor(Math.random() * range))
}

export function isPinPassword(value: string) {
  return new RegExp(`^\\d{${PIN_PASSWORD_LENGTH}}$`).test(value.trim())
}
