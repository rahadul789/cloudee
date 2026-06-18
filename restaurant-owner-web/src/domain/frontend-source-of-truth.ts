import { weekdayOrder } from "@/components/hours/types"
import type {
  OnboardingState,
  OwnerAccount,
  PasswordResetState,
  RestaurantLifecycleStatus,
} from "@/store/app-store"
import type { OpeningHoursSettings } from "@/components/hours/types"
import type { StoreSettings } from "@/components/store-settings/types"
import type { PayoutMethod } from "@/components/payouts/types"

export const APP_FALLBACK_STATE = {
  authBootstrapped: false,
  ownerAccount: {
    ownerName: "",
    phone: "",
    pendingPhone: "",
    email: "",
    profileImageUrl: "",
    createdAt: "",
    lastLoginAt: null,
    isAuthenticated: false,
    isPhoneVerified: false,
  } satisfies OwnerAccount,
  restaurantLifecycleStatus: "account_created" satisfies RestaurantLifecycleStatus,
  onboardingState: {
    currentStep: "basic_info",
    completedSteps: [],
    skippedSteps: [],
    draftSavedAt: null,
    submittedAt: null,
    reviewNote: "",
    reviewIssues: [],
    resubmissionCount: 0,
  } satisfies OnboardingState,
  passwordResetState: {
    identifier: "",
    channel: null,
    verificationSessionId: null,
    otpVerified: false,
    requestedAt: null,
    resendAvailableInSeconds: undefined,
  } satisfies PasswordResetState,
  restaurant: {
    storeSettings: {
      name: "",
      logoUrl: "",
      coverImageUrl: "",
      description: "",
      cuisineType: "",
      tags: [],
      documents: [],
      phone: "",
      email: "",
      supportContact: "",
      address: "",
      location: {
        city: "",
        latitude: null,
        longitude: null,
      },
      orderSettings: {
        autoAcceptOrders: false,
        preparationTimeMinutes: 0,
      },
      paymentSettings: {
        cashOnDelivery: true,
        bkashEnabled: true,
      },
      notifications: {
        newOrder: true,
        cancellation: true,
      },
      offlineReason: "",
      enforcement: {
        status: "active",
        effectiveStatus: "active",
        isRestricted: false,
        reason: "",
        ownerNote: "",
        customerMessage: "",
        startsAt: null,
        expiresAt: null,
      },
      updatedAt: "",
    } satisfies StoreSettings,
    openingHours: {
      timezone: "Asia/Dhaka",
      weeklySchedule: weekdayOrder.map((day) => ({
        day,
        isOpen: false,
        is24Hours: false,
        timeSlots: [],
      })),
      exceptions: [],
      temporaryClosure: {
        isPaused: false,
        mode: null,
        resumeAt: null,
        reason: "",
      },
      updatedAt: "",
    } satisfies OpeningHoursSettings,
    isRestaurantOnline: false,
  },
  catalog: {
    categories: [],
    menuItems: [],
  },
  operations: {
    orders: [],
    notifications: [],
    reviews: [],
    supportCases: [],
  },
  commercial: {
    vouchers: [],
  },
  finance: {
    payouts: [],
    payoutTransactions: [],
    payoutMethod: {
      id: "",
      type: "bkash",
      accountName: "",
      accountNumber: "",
      bankName: "",
      branchName: "",
      isVerified: false,
      verifiedAt: null,
      pendingAccountName: "",
      pendingAccountNumber: "",
      pendingVerificationStatus: null,
      pendingVerifiedAt: null,
      pendingAdminNote: "",
      verificationSource: null,
    } satisfies PayoutMethod,
  },
} as const

export const APP_DOMAIN_RULES = {
  auth: {
    identifier: "phone_only",
    phoneChangeRequiresOtp: true,
  },
  onboarding: {
    requiredSteps: ["basic_info", "location", "hours", "payout_setup"],
    gatedUntilApproved: true,
  },
  orders: {
    liveStatuses: ["New", "Accepted", "Preparing", "ReadyForPickup", "PickedUp"],
    historyStatuses: ["Delivered", "Rejected", "Cancelled"],
  },
  payouts: {
    primaryMethod: "bkash",
    settlementDelayDays: 3,
  },
  support: {
    userFacingLabel: "Report Issue",
    backendEntity: "support_case",
  },
} as const

export const FRONTEND_SOURCE_OF_TRUTH = APP_FALLBACK_STATE
export const SOURCE_OF_TRUTH_RULES = APP_DOMAIN_RULES
