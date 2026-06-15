import type { PayoutMethod } from "@/components/payouts/types"
import type { OpeningHoursSettings } from "@/components/hours/types"
import type { StoreSettings } from "@/components/store-settings/types"
import { isValidBangladeshPhone } from "@/lib/phone"

function svgToDataUri(svg: string) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

export const DEFAULT_STORE_LOGO_PLACEHOLDER = svgToDataUri(`
  <svg width="240" height="240" viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="240" height="240" rx="48" fill="#ECFDF5"/>
    <rect x="36" y="36" width="168" height="168" rx="38" fill="#D1FAE5"/>
    <circle cx="120" cy="120" r="42" fill="#10B981"/>
    <path d="M94 121C94 106.64 105.64 95 120 95C134.36 95 146 106.64 146 121V147H94V121Z" fill="white"/>
    <rect x="107" y="78" width="26" height="22" rx="8" fill="white"/>
  </svg>
`)

export const DEFAULT_STORE_COVER_PLACEHOLDER = svgToDataUri(`
  <svg width="1200" height="560" viewBox="0 0 1200 560" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="1200" height="560" rx="44" fill="#F0FDFA"/>
    <path d="M0 420C130 370 210 318 340 326C470 334 554 440 690 446C826 452 911 349 1018 330C1095 316 1146 332 1200 358V560H0V420Z" fill="#CCFBF1"/>
    <circle cx="1000" cy="140" r="92" fill="#99F6E4"/>
    <circle cx="986" cy="126" r="54" fill="#14B8A6"/>
    <rect x="96" y="96" width="264" height="36" rx="18" fill="#99F6E4"/>
    <rect x="96" y="152" width="420" height="54" rx="22" fill="#0F766E"/>
    <rect x="96" y="224" width="318" height="26" rx="13" fill="#5EEAD4"/>
    <rect x="96" y="270" width="250" height="26" rx="13" fill="#99F6E4"/>
  </svg>
`)

export function getStoreLogoSrc(url?: string | null) {
  return url?.trim() || DEFAULT_STORE_LOGO_PLACEHOLDER
}

export function getStoreCoverSrc(url?: string | null) {
  return url?.trim() || DEFAULT_STORE_COVER_PLACEHOLDER
}

export const PROFILE_COMPLETION_WEIGHTS = {
  basicInfo: 20,
  contactInfo: 15,
  address: 15,
  logo: 10,
  coverImage: 10,
  openingHours: 15,
  payoutSetup: 15,
} as const

export type ProfileCompletionSectionId =
  | "basicInfo"
  | "contactInfo"
  | "address"
  | "logo"
  | "coverImage"
  | "openingHours"
  | "payoutSetup"

export type ProfileCompletionSection = {
  id: ProfileCompletionSectionId
  label: string
  weight: number
  isComplete: boolean
  hint: string
  benefit: string
}

export type ProfileCompletionResult = {
  percentage: number
  completedWeight: number
  sections: ProfileCompletionSection[]
  incompleteSections: ProfileCompletionSection[]
}

function hasValidOpeningHours(openingHours: OpeningHoursSettings) {
  return openingHours.weeklySchedule.some(
    (day) =>
      day.isOpen &&
      day.timeSlots.some(
        (slot) =>
          slot.startTime.trim() &&
          slot.endTime.trim() &&
          slot.startTime !== slot.endTime
      )
  )
}

function hasValidPayoutMethod(payoutMethod: PayoutMethod) {
  if (!payoutMethod.accountName.trim() || !payoutMethod.accountNumber.trim()) {
    return false
  }

  if (payoutMethod.type === "bkash") {
    return (
      isValidBangladeshPhone(payoutMethod.accountNumber) &&
      payoutMethod.isVerified === true
    )
  }

  return Boolean(
    payoutMethod.bankName?.trim() && payoutMethod.branchName?.trim()
  )
}

export function calculateProfileCompletion(params: {
  storeSettings: StoreSettings
  openingHours: OpeningHoursSettings
  payoutMethod: PayoutMethod
}) {
  const { storeSettings, openingHours, payoutMethod } = params

  const sections: ProfileCompletionSection[] = [
    {
      id: "basicInfo",
      label: "Basic Info",
      weight: PROFILE_COMPLETION_WEIGHTS.basicInfo,
      isComplete:
        Boolean(storeSettings.name.trim()) &&
        Boolean(storeSettings.cuisineType.trim()) &&
        storeSettings.tags.length > 0,
      hint: "Complete your restaurant basics",
      benefit: "Customers understand your store faster.",
    },
    {
      id: "contactInfo",
      label: "Contact Info",
      weight: PROFILE_COMPLETION_WEIGHTS.contactInfo,
      isComplete: isValidBangladeshPhone(storeSettings.phone),
      hint: "Confirm your contact number",
      benefit: "Support and critical updates reach you reliably.",
    },
    {
      id: "address",
      label: "Address",
      weight: PROFILE_COMPLETION_WEIGHTS.address,
      isComplete:
        Boolean(storeSettings.address.trim()) &&
        Boolean(storeSettings.location.city.trim()) &&
        storeSettings.location.latitude !== null &&
        storeSettings.location.longitude !== null,
      hint: "Finish address and coordinates",
      benefit: "Admins and customers can locate your store correctly.",
    },
    {
      id: "logo",
      label: "Logo",
      weight: PROFILE_COMPLETION_WEIGHTS.logo,
      isComplete: Boolean(storeSettings.logoUrl.trim()),
      hint: "Add your logo to build trust",
      benefit: "A recognizable logo improves brand confidence.",
    },
    {
      id: "coverImage",
      label: "Cover Image",
      weight: PROFILE_COMPLETION_WEIGHTS.coverImage,
      isComplete: Boolean(storeSettings.coverImageUrl.trim()),
      hint: "Upload a cover image to attract more customers",
      benefit: "A polished cover helps your storefront stand out.",
    },
    {
      id: "openingHours",
      label: "Opening Hours",
      weight: PROFILE_COMPLETION_WEIGHTS.openingHours,
      isComplete: hasValidOpeningHours(openingHours),
      hint: "Set your opening hours",
      benefit: "Customers can plan orders around your schedule.",
    },
    {
      id: "payoutSetup",
      label: "Payout Setup",
      weight: PROFILE_COMPLETION_WEIGHTS.payoutSetup,
      isComplete: hasValidPayoutMethod(payoutMethod),
      hint: "Finish your payout setup",
      benefit: "Settlements can be processed without extra follow-up.",
    },
  ]

  const completedWeight = sections.reduce(
    (sum, section) => sum + (section.isComplete ? section.weight : 0),
    0
  )

  return {
    percentage: completedWeight,
    completedWeight,
    sections,
    incompleteSections: sections.filter((section) => !section.isComplete),
  } satisfies ProfileCompletionResult
}
