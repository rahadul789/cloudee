import type { PayoutMethod } from "@/components/payouts/types"
import { normalizeBangladeshPhone } from "@/lib/phone"

export type PayoutVerificationSource = "onboarding" | "settings" | "payouts"

export function normalizePayoutMethodDraft(method: PayoutMethod): PayoutMethod {
  if (method.type === "bank") {
    return {
      ...method,
      accountName: method.accountName.trim(),
      accountNumber: method.accountNumber.trim(),
      bankName: method.bankName?.trim() ?? "",
      branchName: method.branchName?.trim() ?? "",
    }
  }

  return {
    ...method,
    accountName: method.accountName.trim(),
    accountNumber: normalizeBangladeshPhone(method.accountNumber),
    bankName: "",
    branchName: "",
  }
}

export function resolvePayoutMethodSubmission(params: {
  currentMethod: PayoutMethod
  draftMethod: PayoutMethod
  ownerPhone: string
  source: PayoutVerificationSource
}) {
  const { currentMethod, draftMethod, ownerPhone, source } = params
  const now = new Date().toISOString()
  const normalizedMethod = normalizePayoutMethodDraft(draftMethod)

  if (normalizedMethod.type === "bank") {
    return {
      requiresOtp: false,
      nextMethod: {
        ...normalizedMethod,
        isVerified: true,
        verifiedAt: now,
        pendingAccountName: "",
        pendingAccountNumber: "",
        verificationSource: null,
      } satisfies PayoutMethod,
    }
  }

  const normalizedOwnerPhone = normalizeBangladeshPhone(ownerPhone)
  const normalizedCurrentNumber = normalizeBangladeshPhone(
    currentMethod.accountNumber
  )
  const normalizedNextNumber = normalizeBangladeshPhone(
    normalizedMethod.accountNumber
  )

  const sameAsOwnerPhone = normalizedNextNumber === normalizedOwnerPhone
  const unchangedVerifiedBkash =
    currentMethod.type === "bkash" &&
    currentMethod.isVerified &&
    !currentMethod.pendingAccountNumber &&
    normalizedCurrentNumber === normalizedNextNumber

  if (sameAsOwnerPhone || unchangedVerifiedBkash) {
    return {
      requiresOtp: false,
      nextMethod: {
        ...normalizedMethod,
        isVerified: true,
        verifiedAt: now,
        pendingAccountName: "",
        pendingAccountNumber: "",
        verificationSource: null,
      } satisfies PayoutMethod,
    }
  }

  return {
    requiresOtp: true,
    nextMethod: {
      ...currentMethod,
      pendingAccountNumber: normalizedNextNumber,
      pendingAccountName: normalizedMethod.accountName,
      verificationSource: source,
      isVerified: currentMethod.isVerified ?? false,
      verifiedAt: currentMethod.verifiedAt ?? null,
    } satisfies PayoutMethod,
  }
}
