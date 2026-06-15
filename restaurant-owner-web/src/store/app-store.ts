import type { SetStateAction } from "react"
import { create } from "zustand"
import type { Category } from "@/components/categories/types"
import type { AppNotification } from "@/components/notifications/types"
import type { Order } from "@/components/orders/types"
import type { Voucher } from "@/components/promotions/types"
import type { Review } from "@/components/reviews/types"
import {
  type EarningTransaction,
  type Payout,
  type PayoutMethod,
} from "@/components/payouts/types"
import { type OpeningHoursSettings } from "@/components/hours/types"
import { type StoreSettings } from "@/components/store-settings/types"
import type { MenuItem } from "@/components/menu/types"
import { APP_FALLBACK_STATE } from "@/domain/frontend-source-of-truth"

export type OwnerAccount = {
  ownerName: string
  phone: string
  pendingPhone: string
  email: string
  profileImageUrl: string
  createdAt: string
  lastLoginAt: string | null
  isAuthenticated: boolean
  isPhoneVerified: boolean
}

export type RestaurantLifecycleStatus =
  | "account_created"
  | "phone_verified"
  | "onboarding_in_progress"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"

export type OnboardingStepId =
  | "basic_info"
  | "location"
  | "hours"
  | "payout_setup"
  | "review_submit"

export type ReviewIssueSection = Exclude<OnboardingStepId, "review_submit">

export type ReviewIssue = {
  section: ReviewIssueSection
  title: string
  fields: string[]
  note: string
}

export type OnboardingState = {
  currentStep: OnboardingStepId
  completedSteps: OnboardingStepId[]
  skippedSteps: OnboardingStepId[]
  draftSavedAt: string | null
  submittedAt: string | null
  reviewNote: string
  reviewIssues: ReviewIssue[]
  resubmissionCount: number
}

export type PasswordResetState = {
  identifier: string
  channel: "phone" | "email" | null
  verificationSessionId: string | null
  otpVerified: boolean
  requestedAt: string | null
  resendAvailableInSeconds?: number
}

export type VerificationRequest = {
  verificationSessionId: string | null
  purpose:
    | "owner_signup_verify"
    | "owner_phone_change"
    | "owner_payout_verify"
    | null
  phone: string
  referenceId: string | null
  pendingPassword: string
  resendAvailableInSeconds?: number
}

type AppStore = {
  authBootstrapped: boolean
  setAuthBootstrapped: (value: SetStateAction<boolean>) => void
  resetAppState: (options?: { preserveAuthBootstrapped?: boolean }) => void
  verificationModalOpen: boolean
  setVerificationModalOpen: (value: SetStateAction<boolean>) => void
  verificationRequest: VerificationRequest
  setVerificationRequest: (value: SetStateAction<VerificationRequest>) => void
  ownerAccount: OwnerAccount
  setOwnerAccount: (value: SetStateAction<OwnerAccount>) => void
  restaurantLifecycleStatus: RestaurantLifecycleStatus
  setRestaurantLifecycleStatus: (
    value: SetStateAction<RestaurantLifecycleStatus>
  ) => void
  onboardingState: OnboardingState
  setOnboardingState: (value: SetStateAction<OnboardingState>) => void
  passwordResetState: PasswordResetState
  setPasswordResetState: (value: SetStateAction<PasswordResetState>) => void
  categories: Category[]
  setCategories: (value: SetStateAction<Category[]>) => void
  menuItems: MenuItem[]
  setMenuItems: (value: SetStateAction<MenuItem[]>) => void
  orders: Order[]
  setOrders: (value: SetStateAction<Order[]>) => void
  notifications: AppNotification[]
  setNotifications: (value: SetStateAction<AppNotification[]>) => void
  vouchers: Voucher[]
  setVouchers: (value: SetStateAction<Voucher[]>) => void
  reviews: Review[]
  setReviews: (value: SetStateAction<Review[]>) => void
  payouts: Payout[]
  setPayouts: (value: SetStateAction<Payout[]>) => void
  payoutTransactions: EarningTransaction[]
  setPayoutTransactions: (value: SetStateAction<EarningTransaction[]>) => void
  payoutMethod: PayoutMethod
  setPayoutMethod: (value: SetStateAction<PayoutMethod>) => void
  openingHours: OpeningHoursSettings
  setOpeningHours: (value: SetStateAction<OpeningHoursSettings>) => void
  storeSettings: StoreSettings
  setStoreSettings: (value: SetStateAction<StoreSettings>) => void
  isRestaurantOnline: boolean
  setRestaurantOnline: (value: SetStateAction<boolean>) => void
}

function resolveState<T>(current: T, value: SetStateAction<T>) {
  return typeof value === "function"
    ? (value as (prevState: T) => T)(current)
    : value
}

export const useAppStore = create<AppStore>((set) => ({
  authBootstrapped: false,
  setAuthBootstrapped: (value) =>
    set((state) => ({
      authBootstrapped: resolveState(state.authBootstrapped, value),
    })),
  resetAppState: (options) =>
    set(() => ({
      authBootstrapped: options?.preserveAuthBootstrapped ? true : false,
      verificationModalOpen: false,
      verificationRequest: {
        verificationSessionId: null,
        purpose: null,
        phone: "",
        referenceId: null,
        pendingPassword: "",
        resendAvailableInSeconds: undefined,
      },
      ownerAccount: { ...APP_FALLBACK_STATE.ownerAccount },
      restaurantLifecycleStatus: APP_FALLBACK_STATE.restaurantLifecycleStatus,
      onboardingState: { ...APP_FALLBACK_STATE.onboardingState },
      passwordResetState: { ...APP_FALLBACK_STATE.passwordResetState },
      categories: [...APP_FALLBACK_STATE.catalog.categories],
      menuItems: [...APP_FALLBACK_STATE.catalog.menuItems],
      orders: [...APP_FALLBACK_STATE.operations.orders],
      notifications: [...APP_FALLBACK_STATE.operations.notifications],
      vouchers: [...APP_FALLBACK_STATE.commercial.vouchers],
      reviews: [...APP_FALLBACK_STATE.operations.reviews],
      payouts: [...APP_FALLBACK_STATE.finance.payouts],
      payoutTransactions: [...APP_FALLBACK_STATE.finance.payoutTransactions],
      payoutMethod: { ...APP_FALLBACK_STATE.finance.payoutMethod },
      openingHours: { ...APP_FALLBACK_STATE.restaurant.openingHours },
      storeSettings: { ...APP_FALLBACK_STATE.restaurant.storeSettings },
      isRestaurantOnline: APP_FALLBACK_STATE.restaurant.isRestaurantOnline,
    })),
  verificationModalOpen: false,
  setVerificationModalOpen: (value) =>
    set((state) => ({
      verificationModalOpen: resolveState(state.verificationModalOpen, value),
    })),
  verificationRequest: {
    verificationSessionId: null,
    purpose: null,
    phone: "",
    referenceId: null,
    pendingPassword: "",
    resendAvailableInSeconds: undefined,
  },
  setVerificationRequest: (value) =>
    set((state) => ({
      verificationRequest: resolveState(state.verificationRequest, value),
    })),
  ownerAccount: { ...APP_FALLBACK_STATE.ownerAccount },
  setOwnerAccount: (value) =>
    set((state) => ({
      ownerAccount: resolveState(state.ownerAccount, value),
    })),
  restaurantLifecycleStatus: APP_FALLBACK_STATE.restaurantLifecycleStatus,
  setRestaurantLifecycleStatus: (value) =>
    set((state) => ({
      restaurantLifecycleStatus: resolveState(
        state.restaurantLifecycleStatus,
        value
      ),
    })),
  onboardingState: { ...APP_FALLBACK_STATE.onboardingState },
  setOnboardingState: (value) =>
    set((state) => ({
      onboardingState: resolveState(state.onboardingState, value),
    })),
  passwordResetState: { ...APP_FALLBACK_STATE.passwordResetState },
  setPasswordResetState: (value) =>
    set((state) => ({
      passwordResetState: resolveState(state.passwordResetState, value),
    })),
  categories: [...APP_FALLBACK_STATE.catalog.categories],
  setCategories: (value) =>
    set((state) => ({
      categories: resolveState(state.categories, value),
    })),
  menuItems: [...APP_FALLBACK_STATE.catalog.menuItems],
  setMenuItems: (value) =>
    set((state) => ({
      menuItems: resolveState(state.menuItems, value),
    })),
  orders: [...APP_FALLBACK_STATE.operations.orders],
  setOrders: (value) =>
    set((state) => ({
      orders: resolveState(state.orders, value),
    })),
  notifications: [...APP_FALLBACK_STATE.operations.notifications],
  setNotifications: (value) =>
    set((state) => ({
      notifications: resolveState(state.notifications, value),
    })),
  vouchers: [...APP_FALLBACK_STATE.commercial.vouchers],
  setVouchers: (value) =>
    set((state) => ({
      vouchers: resolveState(state.vouchers, value),
    })),
  reviews: [...APP_FALLBACK_STATE.operations.reviews],
  setReviews: (value) =>
    set((state) => ({
      reviews: resolveState(state.reviews, value),
    })),
  payouts: [...APP_FALLBACK_STATE.finance.payouts],
  setPayouts: (value) =>
    set((state) => ({
      payouts: resolveState(state.payouts, value),
    })),
  payoutTransactions: [...APP_FALLBACK_STATE.finance.payoutTransactions],
  setPayoutTransactions: (value) =>
    set((state) => ({
      payoutTransactions: resolveState(state.payoutTransactions, value),
    })),
  payoutMethod: { ...APP_FALLBACK_STATE.finance.payoutMethod },
  setPayoutMethod: (value) =>
    set((state) => ({
      payoutMethod: resolveState(state.payoutMethod, value),
    })),
  openingHours: { ...APP_FALLBACK_STATE.restaurant.openingHours },
  setOpeningHours: (value) =>
    set((state) => ({
      openingHours: resolveState(state.openingHours, value),
    })),
  storeSettings: { ...APP_FALLBACK_STATE.restaurant.storeSettings },
  setStoreSettings: (value) =>
    set((state) => ({
      storeSettings: resolveState(state.storeSettings, value),
    })),
  isRestaurantOnline: APP_FALLBACK_STATE.restaurant.isRestaurantOnline,
  setRestaurantOnline: (value) =>
    set((state) => ({
      isRestaurantOnline: resolveState(state.isRestaurantOnline, value),
    })),
}))
