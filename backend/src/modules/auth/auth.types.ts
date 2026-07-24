import type { OtpPurpose } from "../../common/constants/lifecycle"

export type JwtPayload = {
  sub: string
  role: "owner" | "admin" | "customer" | "rider" | "system"
  restaurantId?: string
  tokenId?: string
  // Present only on admin-impersonation sessions: the admin acting as this user.
  // Surfaced on req.user so audit/guards can see the real actor behind the session.
  impersonatedByAdminId?: string
}

export type SendOtpParams = {
  phone: string
  purpose: OtpPurpose
  referenceId: string
  ownerId?: string
  ipAddress?: string
  userAgent?: string
}
