import type { OtpPurpose } from "../../common/constants/lifecycle"

export type JwtPayload = {
  sub: string
  role: "owner" | "admin" | "customer" | "rider" | "system"
  restaurantId?: string
  tokenId?: string
}

export type SendOtpParams = {
  phone: string
  purpose: OtpPurpose
  referenceId: string
  ownerId?: string
  ipAddress?: string
  userAgent?: string
}
