export const DEFAULT_OTP_RESEND_SECONDS = 60;
export const OTP_REQUEST_RATE_LIMIT_SECONDS = 10 * 60;
export const OTP_VERIFY_LOCK_SECONDS = 15 * 60;

export function resolveOtpResendSeconds(value?: number | string | null) {
  const numericValue = typeof value === "string" ? Number(value) : value;

  if (typeof numericValue !== "number" || !Number.isFinite(numericValue)) {
    return DEFAULT_OTP_RESEND_SECONDS;
  }

  return Math.max(0, Math.ceil(numericValue));
}

export function formatOtpCountdown(seconds: number) {
  const safeSeconds = Math.max(0, Math.ceil(seconds));

  if (safeSeconds < 60) {
    return `${safeSeconds}s`;
  }

  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}
