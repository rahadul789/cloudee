export const restaurantLifecycleStatuses = [
  "account_created",
  "phone_verified",
  "onboarding_in_progress",
  "submitted",
  "under_review",
  "approved",
  "rejected"
] as const

export type RestaurantLifecycleStatus = (typeof restaurantLifecycleStatuses)[number]

export const ownerStatuses = ["active", "suspended", "locked"] as const

export type OwnerStatus = (typeof ownerStatuses)[number]

export const reviewCaseStatuses = [
  "submitted",
  "under_review",
  "approved",
  "rejected"
] as const

export type ReviewCaseStatus = (typeof reviewCaseStatuses)[number]

export const otpPurposes = [
  "owner_signup_verify",
  "owner_phone_change",
  "owner_payout_verify",
  "owner_phone_signin",
  "owner_password_reset",
  "password_reset",
  "customer_phone_signin",
  "customer_phone_change",
  "customer_password_reset",
  "rider_phone_signin",
  "rider_password_reset"
] as const

export type OtpPurpose = (typeof otpPurposes)[number]

export const otpSessionStatuses = ["pending", "verified", "expired", "consumed"] as const

export type OtpSessionStatus = (typeof otpSessionStatuses)[number]
