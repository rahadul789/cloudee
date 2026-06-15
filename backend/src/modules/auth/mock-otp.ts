import { env } from "../../config/env"

export function getMockOtpCode() {
  return env.MOCK_OTP_ENABLED ? env.MOCK_OTP_CODE : undefined
}
