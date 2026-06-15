export const DEFAULT_OTP_RESEND_SECONDS = 60

export function resolveOtpResendSeconds(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_OTP_RESEND_SECONDS
  }

  return Math.max(0, Math.ceil(value))
}
