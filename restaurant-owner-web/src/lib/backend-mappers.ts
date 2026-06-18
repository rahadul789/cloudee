import { APP_FALLBACK_STATE } from "@/domain/frontend-source-of-truth"
import {
  createTimeSlot,
  weekdayOrder,
  type OpeningHoursSettings,
  type DaySchedule,
  type ScheduleException,
  type TimeSlot,
} from "@/components/hours/types"
import type { StoreSettings } from "@/components/store-settings/types"
import type {
  OnboardingState,
  OwnerAccount,
  RestaurantLifecycleStatus,
  ReviewIssue,
} from "@/store/app-store"
import type { AppNotification, AppNotificationType } from "@/components/notifications/types"
import type { Category } from "@/components/categories/types"
import type { MenuItem, MenuItemKind, MenuVariant, AddOnGroup } from "@/components/menu/types"
import type { PayoutMethod, Payout, EarningTransaction } from "@/components/payouts/types"
import type { Review } from "@/components/reviews/types"
import type { SupportTicket } from "@/components/help-center/types"
import type { Order, OrderLineItemAddOn, OrderStatus, OrderStatusHistoryItem, OrderStatusTimestamps } from "@/components/orders/types"
import type { Voucher, VoucherType } from "@/components/promotions/types"

export type OwnerProfileResponse = {
  id: string
  fullName: string
  phone: string
  pendingPhone: string | null
  email: string
  profileImage: {
    url?: string
  }
  isPhoneVerified: boolean
  createdAt: string
  lastLoginAt: string | null
  restaurantLifecycleStatus: RestaurantLifecycleStatus
}

export type OnboardingDraftResponse = {
  lifecycleStatus: RestaurantLifecycleStatus
  draft: {
    currentStep?: string
    completedSteps?: string[]
    skippedSteps?: string[]
    basicInfo?: {
      restaurantName?: string
      fullName?: string
      phone?: string
      email?: string
      description?: string
      preparationTimeMinutes?: number
      cuisineTypes?: string[]
      tags?: string[]
      logo?: { url?: string }
      coverImage?: { url?: string }
    }
    location?: {
      address?: string
      city?: string
      latitude?: number | null
      longitude?: number | null
    }
    openingHours?: Partial<OpeningHoursSettings>
    payoutSetup?: {
      type?: "bkash" | "bank"
      accountName?: string
      accountNumber?: string
      isVerified?: boolean
    }
    draftSavedAt?: string | null
    submittedAt?: string | null
    resubmissionCount?: number
  }
}

export type ReviewStatusResponse = {
  restaurantLifecycleStatus: RestaurantLifecycleStatus
  submittedAt: string | null
  estimatedReviewTimeHours: number
  reviewNote: string
  reviewIssues: ReviewIssue[]
  resubmissionCount: number
  draft: OnboardingDraftResponse["draft"] | null
}

export type OnboardingDraftPayload = {
  currentStep: string
  completedSteps: string[]
  skippedSteps: string[]
  basicInfo: {
    restaurantName: string
    fullName: string
    phone: string
    email: string
    description: string
    preparationTimeMinutes: number
    cuisineTypes: string[]
    tags: string[]
    logo: { url: string }
    coverImage: { url: string }
  }
  location: {
    address: string
    city: string
    latitude: number | null
    longitude: number | null
  }
  openingHours: OpeningHoursSettings
  payoutSetup: {
    type: "bkash" | "bank"
    accountName: string
    accountNumber: string
    isVerified: boolean
  }
}

export type OwnerNotificationResponse = {
  _id: string
  type: "order" | "payout" | "system" | "promotion" | "support" | "review"
  eventType: string
  entityType: string
  entityId: string
  title: string
  description: string
  actionPath: string
  isRead: boolean
  createdAt: string
}

export type OwnerListResponse<T> = {
  items: T[]
  total: number
  unreadCount?: number
}

export type OwnerOrderResponse = {
  _id: string
  orderNumber: string
  status: OrderStatus
  paymentMethod: string
  cancelledBy?: string
  terminalReason?: string
  pricing?: {
    subtotal?: number
    deliveryFee?: number
    discountAmount?: number
    ownerDiscountCost?: number
    platformDiscountCost?: number
    restaurantSubtotal?: number
    restaurantNetSales?: number
    customerPaidTotal?: number
    ownerVisibleDiscount?: number
    total?: number
  }
  appliedVouchers?: Array<{
    id?: string
    code?: string
    name?: string
    type?: string
    fundedBy?: string
    discountAmount?: number
    totalDiscountAmount?: number
    ownerDiscountCost?: number
  }>
  customerSnapshot?: {
    fullName?: string
    phone?: string
    deliveryAddress?: {
      addressLine?: string
      label?: string
    }
  }
  riderId?: string
  riderSnapshot?: {
    name?: string
    phone?: string
  }
  itemsSnapshot?: Array<{
    itemId?: string
    name?: string
    quantity?: number
    unitPrice?: number
    selectedVariantOptions?: Array<{ groupName: string; optionLabel: string }>
    selectedAddOnOptions?: Array<{ groupName: string; optionLabel: string }>
  }>
  timestamps?: Partial<Record<string, string>>
  autoCancel?: {
    enabled: boolean
    applies: boolean
    autoCancelAfterMinutes: number
    notifyBeforeMinutes: number
    autoCancelAt: string | null
    remainingSeconds: number | null
  }
  preparationTiming?: {
    phase: "not_started" | "accepted" | "preparing" | "preparing_late" | "completed" | string
    label: string
    baseMinutes: number
    extraMinutes: number
    totalMinutes: number
    maxExtraMinutes: number
    startedAt: string | null
    targetStartAt: string | null
    targetReadyAt: string | null
    remainingSeconds: number | null
    lateBySeconds: number
    canExtend: boolean
    extensionOptions: number[]
    autoStarted: boolean
  }
  history?: Array<{
    status: OrderStatus
    actor: "owner" | "customer" | "system" | "rider"
    note?: string
    createdAt: string
  }>
}

export type OwnerRiderAssignmentOptionResponse = {
  id: string
  fullName: string
  phone: string
  vehicleType?: string
  isAvailableForAssignments: boolean
  activeOrders: number
}

export type OwnerStoreSettingsResponse = {
  id: string
  name: string
  description?: string
  preparationTimeMinutes?: number | null
  cuisineTypes?: string[]
  tags?: string[]
  documents?: Array<{
    type?: string
    label?: string
    url?: string
    publicId?: string
    fileName?: string
    fileType?: string
    resourceType?: string
    uploadedAt?: string | null
  }>
  logo?: { url?: string }
  coverImage?: { url?: string }
  contact?: {
    phone?: string
    email?: string
  }
  address?: {
    address?: string
    city?: string
  }
  location?: {
    latitude?: number | null
    longitude?: number | null
  }
  runtime?: {
    isOnline?: boolean
    isVisible?: boolean
    currentOperationalStatus?: string
  }
  enforcement?: {
    status?: string
    effectiveStatus?: string
    isRestricted?: boolean
    reason?: string
    ownerNote?: string
    customerMessage?: string
    startsAt?: string | null
    expiresAt?: string | null
  }
  settings?: {
    orderSettings?: {
      autoAcceptOrders?: boolean
    }
    notifications?: {
      newOrder?: boolean
      cancellation?: boolean
      payouts?: boolean
      support?: boolean
    }
  }
  updatedAt?: string
}

export type OwnerCategoryResponse = {
  _id: string
  name: string
  slug: string
  description?: string
  status: "active" | "archived"
  displayOrder: number
  totalItems?: number
  createdAt: string
  updatedAt: string
}

export type OwnerMenuItemResponse = {
  _id: string
  categoryId: string
  name: string
  slug: string
  description?: string
  images?: Array<{ url?: string }>
  status: "active" | "archived"
  availability?: "available" | "unavailable"
  kind?: "simple" | "variant"
  basePrice: number
  variants?: Array<{
    name?: string
    minSelect?: number
    maxSelect?: number
    options?: Array<{
      label?: string
      priceDelta?: number
    }>
  }>
  addOnGroups?: Array<{
    name?: string
    minSelect?: number
    maxSelect?: number
    options?: Array<{
      label?: string
      price?: number
    }>
  }>
  isPopular?: boolean
  recommendedItemIds?: string[]
  createdAt: string
  updatedAt: string
}

export type OwnerPayoutMethodResponse = {
  payoutMethod: {
    _id: string
    type: "bkash" | "bank"
    accountName: string
    accountNumber: string
    bankName?: string
    branchName?: string
    isVerified?: boolean
    pendingAccountNumber?: string | null
    pendingAccountName?: string | null
    pendingVerificationStatus?: "otp_pending" | "admin_pending" | "rejected" | null
    pendingVerifiedAt?: string | null
    pendingAdminNote?: string | null
    verificationSource?: string | null
    verifiedAt?: string | null
  }
  verificationSessionId: string | null
  expiresInSeconds?: number
  resendAvailableInSeconds?: number
}

export type OwnerPayoutSummaryResponse = {
  pendingBalance: number
  availableBalance: number
  paidOutBalance: number
  requestedPayoutBalance: number
  lifetimeGrossAmount: number
  lifetimeNetEarnings: number
  lifetimeCommission: number
  lifetimeDiscountCost: number
  lifetimeDeliveryCost: number
  nextSettlementAvailableAt: string | null
  settlementDelayDays: number
  minimumPayoutAmountTaka: number
  oneActivePayoutRequest: boolean
  hasActivePayoutRequest?: boolean
  lastPayout?: {
    _id: string
    amount: number
    status: "pending" | "processing" | "completed" | "failed"
    batchReference?: string
    failureReason?: string
    providerReference?: string
    providerPayoutId?: string
    providerTransactionId?: string
    paymentProofUrl?: string
    processingNote?: string
    requestedAt: string
    processedAt?: string | null
  } | null
  payoutMethod?: OwnerPayoutMethodResponse["payoutMethod"] | null
}

export type OwnerPayoutHistoryResponse = {
  _id: string
  amount: number
  status: "pending" | "processing" | "completed" | "failed"
  batchReference?: string
  failureReason?: string
  providerReference?: string
  providerPayoutId?: string
  providerTransactionId?: string
  paymentProofUrl?: string
  processingNote?: string
  requestedAt: string
  processedAt?: string | null
  createdAt: string
  updatedAt: string
}

export type OwnerPayoutTransactionResponse = {
  _id: string
  orderId?: string | null
  payoutBatchId?: string | null
  entryType: "earning" | "refund" | "payout" | "adjustment"
  grossAmount?: number
  commission?: number
  discountCost?: number
  deliveryCost?: number
  netAmount: number
  settlementStatus: "pending" | "available" | "paid_out"
  availableAt?: string | null
  createdAt: string
}

export type OwnerDashboardSummaryResponse = {
  restaurant: {
    id: string
    name: string
    isOnline: boolean
    isVisible: boolean
    currentOperationalStatus: string
  }
  filter: {
    preset: string
    from: string
    to: string
  }
  metrics: {
    totalOrders: number
    previousTotalOrders: number
    totalRevenue: number
    previousTotalRevenue: number
    placedOrderValue: number
    previousPlacedOrderValue: number
    deliveredOrderValue: number
    previousDeliveredOrderValue: number
    totalNetEarnings: number
    previousTotalNetEarnings: number
    cancelledOrders: number
    previousCancelledOrders: number
    cancelledOrderValue: number
    previousCancelledOrderValue: number
    rejectedOrders: number
    previousRejectedOrders: number
    rejectedOrderValue: number
    previousRejectedOrderValue: number
    averageOrderValue: number
    previousAverageOrderValue: number
    pendingOrders: number
    previousPendingOrders: number
    completedOrders: number
    previousCompletedOrders: number
    uniqueCustomers: number
    nextEstimatedPayoutAt: string | null
  }
  salesTrend?: Array<{
    date: string
    label: string
    orders: number
    revenue: number
    placedValue?: number
    deliveredValue?: number
    netEarnings?: number
    activeOrders?: number
    failedOrders?: number
    failedValue?: number
    cancelledOrders?: number
    rejectedOrders?: number
  }>
  topItems?: Array<{ id: string; name: string; quantity: number; revenue: number }>
  liveOrders?: Array<{
    id: string
    orderNumber: string
    customerName: string
    status: string
    placedAt: string
    value: number
  }>
  recentReviews?: Array<{
    id: string
    customerName: string
    rating: number
    comment: string
    createdAt: string
  }>
}

export type OwnerAnalyticsOverviewResponse = {
  filter: {
    current: {
      from: string
      to: string
    }
    previous: {
      from: string
      to: string
    }
  }
  metrics: {
    totalOrders: number
    previousTotalOrders: number
    deliveredRevenue: number
    previousDeliveredRevenue: number
    netEarnings: number
    previousNetEarnings: number
    deliveredCount: number
    previousDeliveredCount: number
    averageOrderValue: number
    previousAverageOrderValue: number
    uniqueCustomers: number
    previousUniqueCustomers: number
    repeatCustomers: number
    previousRepeatCustomers: number
    discountedOrdersCount: number
    discountedRevenue: number
    discountGiven: number
  }
  statusCounts: Record<string, number>
  weekdayOrders: Array<{ label: string; orders: number }>
  peakHours: Array<{ label: string; orders: number }>
  orderSeries: Array<{ date: string; label: string; orders: number }>
  customerInsights: {
    unique: number
    repeat: number
    repeatRate: number
    rows: Array<{ name: string; orders: number; revenue: number }>
    donut: Array<{ name: string; value: number; color: string }>
  }
  menuPerformance: {
    rows: Array<{ name: string; categoryName: string; quantitySold: number; revenue: number }>
    lowPerformers: Array<{ name: string; categoryName: string; quantitySold: number; revenue: number }>
    categories: Array<{ name: string; revenue: number }>
  }
  payoutInsights: {
    gross: number
    net: number
    commission: number
    discountCost: number
    deliveryCost: number
    available: number
    pending: number
    paidOutBalance: number
    totalPayouts: number
    lifetimeEarnings: number
    availableSoon: number
  }
}

export type OwnerReviewResponse = {
  _id: string
  customerId?: string
  orderId?: string | null
  rating: number
  comment: string
  ownerReply?: {
    message?: string
    createdAt?: string | null
    updatedAt?: string | null
  }
  moderationStatus?: "visible" | "hidden" | "flagged"
  isHidden?: boolean
  createdAt: string
}

export type OwnerSupportCaseResponse = {
  _id: string
  kind: "report" | "question"
  subject: string
  categoryId: string
  message: string
  status: "open" | "in_progress" | "resolved" | "closed"
  priority: "low" | "medium" | "high"
  attachments?: Array<{
    url?: string
    publicId?: string
    fileName?: string
    fileType?: string
  }>
  replies?: Array<{
    message: string
    adminId?: string
    adminName?: string
    createdAt: string
  }>
  createdAt: string
  updatedAt: string
}

export type OwnerOpeningHoursResponse = {
  timezone?: string
  weeklySchedule?: Array<Partial<DaySchedule>>
  exceptions?: Array<Partial<ScheduleException>>
  temporaryClosure?: Partial<OpeningHoursSettings["temporaryClosure"]>
  updatedAt?: string
}

export type OwnerVoucherResponse = {
  _id: string
  createdByType: "owner" | "admin" | "system"
  createdById: string
  fundedBy: "owner" | "platform" | "shared"
  stackingRule: "exclusive" | "stackable"
  priority: number
  mode: "auto" | "coupon"
  type: "flat" | "percentage" | "free_delivery"
  name: string
  code: string
  discountValue: number
  minimumOrderAmount: number
  maxTotalUses: number
  maxUsesPerUser: number
  allowRepeatUsage: boolean
  status: "Draft" | "Active"
  applicability: "all" | "categories" | "items"
  categoryIds: string[]
  itemIds: string[]
  startsAt: string
  endsAt: string
  createdAt: string
  updatedAt: string
  analytics?: Voucher["analytics"]
}

export type PlatformContentResponse = {
  branding: {
    platformName: string
    tagline: string
  }
  supportContact: {
    email: string
    phone: string
    supportHours: string
    reportLabel: string
    directHelpNote: string
  }
  helpCenter: {
    categories: Array<{
      id: string
      name: string
      description: string
      iconKey: string
    }>
    articles: Array<{
      id: string
      categoryId: string
      title: string
      excerpt: string
      readTime: string
      sections: Array<{
        title: string
        paragraphs?: string[]
        bullets?: string[]
        steps?: string[]
      }>
    }>
    faqs: Array<{
      id: string
      categoryId: string
      question: string
      answer: string
    }>
  }
  legal: {
    privacyPolicy: {
      title: string
      label: string
      description: string
      lastUpdated: string
      effectiveDate: string
      overviewTitle: string
      overviewDescription: string
      trustTitle: string
      trustDescription: string
      sections: Array<{
        id: string
        title: string
        body: string[]
      }>
    }
    termsAndConditions: {
      title: string
      label: string
      description: string
      noticeTitle: string
      noticeDescription: string
      sections: Array<{
        id: string
        title: string
        body: string[]
      }>
    }
  }
}

export function buildOwnerAccountFromProfile(
  profile: OwnerProfileResponse
): OwnerAccount {
  return {
    ownerName: profile.fullName,
    phone: profile.phone,
    pendingPhone: profile.pendingPhone ?? "",
    email: profile.email || "",
    profileImageUrl: profile.profileImage?.url || "",
    createdAt: profile.createdAt,
    lastLoginAt: profile.lastLoginAt,
    isAuthenticated: true,
    isPhoneVerified: profile.isPhoneVerified,
  }
}

export function buildStoreSettingsFromDraft(
  draft: OnboardingDraftResponse["draft"],
  current: StoreSettings
): StoreSettings {
  return {
    ...current,
    name: draft.basicInfo?.restaurantName ?? current.name,
    logoUrl: draft.basicInfo?.logo?.url ?? current.logoUrl,
    coverImageUrl: draft.basicInfo?.coverImage?.url ?? current.coverImageUrl,
    description: draft.basicInfo?.description ?? current.description,
    orderSettings: {
      ...current.orderSettings,
      preparationTimeMinutes:
        draft.basicInfo?.preparationTimeMinutes ??
        current.orderSettings.preparationTimeMinutes,
    },
    cuisineType: draft.basicInfo?.cuisineTypes?.join(", ") ?? current.cuisineType,
    tags: draft.basicInfo?.tags ?? current.tags,
    phone: draft.basicInfo?.phone ?? current.phone,
    email: draft.basicInfo?.email ?? current.email,
    address: draft.location?.address ?? current.address,
    location: {
      city: draft.location?.city ?? current.location.city,
      latitude:
        draft.location?.latitude !== undefined
          ? draft.location.latitude
          : current.location.latitude,
      longitude:
        draft.location?.longitude !== undefined
          ? draft.location.longitude
          : current.location.longitude,
    },
    updatedAt: draft.draftSavedAt ?? current.updatedAt,
  }
}

export function buildOpeningHoursFromDraft(
  draft: OnboardingDraftResponse["draft"],
  current: OpeningHoursSettings
): OpeningHoursSettings {
  if (!draft.openingHours || Object.keys(draft.openingHours).length === 0) {
    return current
  }

  const normalizedWeeklySchedule =
    draft.openingHours.weeklySchedule?.length
      ? weekdayOrder.map((day) => {
          const entry =
            draft.openingHours?.weeklySchedule?.find((item) => item.day === day)
          const fallback =
            current.weeklySchedule.find((item) => item.day === day) ?? {
              day,
              isOpen: true,
              is24Hours: false,
              timeSlots: [createTimeSlot()],
            }

          if (!entry) return fallback

          return {
            ...fallback,
            ...entry,
            isOpen: entry.isOpen ?? fallback.isOpen,
            is24Hours: entry.is24Hours ?? fallback.is24Hours,
            timeSlots:
              (entry.isOpen ?? fallback.isOpen) &&
              !(entry.is24Hours ?? fallback.is24Hours)
                ? mapTimeSlots(entry.timeSlots as Partial<TimeSlot>[] | undefined)
                : [],
          }
        })
      : current.weeklySchedule

  return {
    ...current,
    ...draft.openingHours,
    weeklySchedule: normalizedWeeklySchedule,
    updatedAt: draft.draftSavedAt ?? current.updatedAt,
  }
}

export function buildPayoutMethodFromDraft(
  draft: OnboardingDraftResponse["draft"],
  current: PayoutMethod
): PayoutMethod {
  return {
    ...current,
    type: draft.payoutSetup?.type ?? current.type,
    accountName: draft.payoutSetup?.accountName ?? current.accountName,
    accountNumber: draft.payoutSetup?.accountNumber ?? current.accountNumber,
    isVerified: draft.payoutSetup?.isVerified ?? current.isVerified,
  }
}

export function buildOnboardingStateFromDraft(
  draft: OnboardingDraftResponse["draft"],
  current: OnboardingState
): OnboardingState {
  return {
    ...current,
    currentStep:
      (draft.currentStep as OnboardingState["currentStep"]) ?? current.currentStep,
    completedSteps:
      (draft.completedSteps as OnboardingState["completedSteps"]) ??
      current.completedSteps,
    skippedSteps:
      (draft.skippedSteps as OnboardingState["skippedSteps"]) ?? current.skippedSteps,
    draftSavedAt: draft.draftSavedAt ?? current.draftSavedAt,
    submittedAt: draft.submittedAt ?? current.submittedAt,
    resubmissionCount: draft.resubmissionCount ?? current.resubmissionCount,
  }
}

export function buildOnboardingStateFromReviewStatus(
  reviewStatus: ReviewStatusResponse,
  current: OnboardingState
): OnboardingState {
  return {
    ...current,
    submittedAt: reviewStatus.submittedAt,
    reviewNote: reviewStatus.reviewNote,
    reviewIssues: reviewStatus.reviewIssues,
    resubmissionCount: reviewStatus.resubmissionCount,
  }
}

export function getDefaultSignedOutOwnerAccount(): OwnerAccount {
  return { ...APP_FALLBACK_STATE.ownerAccount }
}

export function getDefaultPasswordResetState() {
  return { ...APP_FALLBACK_STATE.passwordResetState }
}

function mapNotificationType(type: OwnerNotificationResponse["type"]): AppNotificationType {
  if (type === "order") return "order-update"
  if (type === "payout") return "payout"
  if (type === "promotion") return "promotion"
  if (type === "support") return "support"
  if (type === "review") return "review"
  return "system"
}

function normalizeNotificationPath(path: string) {
  if (!path) return ""
  const normalizedPath = path
    .replace("orderId=", "order=")
    .replace("reviewId=", "review=")
  const orderDetailMatch = normalizedPath.match(/^\/orders\/([^/?#]+)/)
  if (orderDetailMatch?.[1]) {
    return `/orders?order=${orderDetailMatch[1]}`
  }
  return normalizedPath
}

export function mapOwnerNotification(
  notification: OwnerNotificationResponse
): AppNotification {
  return {
    id: notification._id,
    type: mapNotificationType(notification.type),
    eventType: notification.eventType,
    entityType: notification.entityType as AppNotification["entityType"],
    entityId: notification.entityId,
    title: notification.title,
    description: notification.description,
    createdAt: notification.createdAt,
    read: notification.isRead,
    actionPath: normalizeNotificationPath(notification.actionPath),
  }
}

export function mapOwnerStoreSettings(
  response: OwnerStoreSettingsResponse,
  current: StoreSettings
): StoreSettings {
  const cuisineTypes = response.cuisineTypes?.filter(Boolean) ?? []
  const notificationSettings = response.settings?.notifications ?? {}
  const documentTypes = new Set(["nid", "trade_license", "tin", "bin_vat"])
  const documents = Array.isArray(response.documents)
    ? response.documents
        .filter(
          (document) =>
            documentTypes.has(String(document.type ?? "")) &&
            Boolean(document.url?.trim())
        )
        .map((document) => ({
          type: document.type as StoreSettings["documents"][number]["type"],
          label: document.label ?? "",
          url: document.url ?? "",
          publicId: document.publicId ?? "",
          fileName: document.fileName ?? "",
          fileType: document.fileType ?? "",
          resourceType: document.resourceType ?? "auto",
          uploadedAt: document.uploadedAt ?? null,
        }))
    : current.documents

  return {
    ...current,
    name: response.name ?? current.name,
    description: response.description ?? current.description,
    cuisineType: cuisineTypes.length > 0 ? cuisineTypes.join(", ") : current.cuisineType,
    tags: response.tags ?? current.tags,
    documents,
    logoUrl: response.logo?.url ?? current.logoUrl,
    coverImageUrl: response.coverImage?.url ?? current.coverImageUrl,
    phone: response.contact?.phone ?? current.phone,
    email: response.contact?.email ?? current.email,
    address: response.address?.address ?? current.address,
    location: {
      city: response.address?.city ?? current.location.city,
      latitude:
        response.location?.latitude !== undefined
          ? response.location.latitude ?? null
          : current.location.latitude,
      longitude:
        response.location?.longitude !== undefined
          ? response.location.longitude ?? null
          : current.location.longitude,
    },
    orderSettings: {
      ...current.orderSettings,
      autoAcceptOrders: false,
      preparationTimeMinutes:
        response.preparationTimeMinutes ??
        current.orderSettings.preparationTimeMinutes ??
        20,
    },
    notifications: {
      ...current.notifications,
      newOrder: notificationSettings.newOrder ?? current.notifications.newOrder,
      cancellation:
        notificationSettings.cancellation ?? current.notifications.cancellation,
    },
    enforcement: {
      ...current.enforcement,
      status: response.enforcement?.status ?? current.enforcement.status,
      effectiveStatus:
        response.enforcement?.effectiveStatus ??
        current.enforcement.effectiveStatus,
      isRestricted:
        response.enforcement?.isRestricted ?? current.enforcement.isRestricted,
      reason: response.enforcement?.reason ?? current.enforcement.reason,
      ownerNote: response.enforcement?.ownerNote ?? current.enforcement.ownerNote,
      customerMessage:
        response.enforcement?.customerMessage ??
        current.enforcement.customerMessage,
      startsAt: response.enforcement?.startsAt ?? current.enforcement.startsAt,
      expiresAt: response.enforcement?.expiresAt ?? current.enforcement.expiresAt,
    },
    updatedAt: response.updatedAt ?? current.updatedAt,
  }
}

export function resolveRestaurantOnline(
  response: OwnerStoreSettingsResponse,
  current: boolean
) {
  const runtime = response.runtime as { isOnline?: boolean } | undefined
  if (runtime && typeof runtime.isOnline === "boolean") {
    return runtime.isOnline
  }

  return current
}

export function mapOwnerCategory(category: OwnerCategoryResponse): Category {
  return {
    id: category._id,
    name: category.name,
    slug: category.slug,
    totalItems: category.totalItems ?? 0,
    displayOrder: category.displayOrder ?? 0,
    status: category.status === "active" ? "Active" : "Hidden",
    description: category.description ?? "",
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  }
}

function resolveMenuItemKind(
  variants: MenuVariant[],
  addOnGroups: AddOnGroup[]
): MenuItemKind {
  if (variants.length > 0 && addOnGroups.length > 0) return "variants-addons"
  if (variants.length > 0) return "variants-only"
  if (addOnGroups.length > 0) return "addons-only"
  return "simple"
}

export function mapOwnerMenuItem(item: OwnerMenuItemResponse): MenuItem {
  const fallbackImage =
    "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=160&q=80"
  const basePrice = item.basePrice ?? 0
  const variants: MenuVariant[] =
    item.variants?.flatMap((group, groupIndex) =>
      (group.options ?? []).map((option, optionIndex) => ({
        id: `variant-${groupIndex}-${optionIndex}`,
        name: option.label ?? "Variant",
        price: basePrice + (option.priceDelta ?? 0),
      }))
    ) ?? []

  const addOnGroups: AddOnGroup[] =
    item.addOnGroups?.map((group, groupIndex) => ({
      id: `addon-group-${groupIndex}`,
      name: group.name ?? "Add-ons",
      selectionType: (group.maxSelect ?? 1) <= 1 ? "single" : "multiple",
      required: (group.minSelect ?? 0) >= 1,
      options:
        group.options?.map((option, optionIndex) => ({
          id: `addon-option-${groupIndex}-${optionIndex}`,
          name: option.label ?? "Option",
          price: option.price ?? 0,
        })) ?? [],
    })) ?? []

  return {
    id: item._id,
    name: item.name,
    slug: item.slug,
    imageUrl: item.images?.[0]?.url ?? fallbackImage,
    isPopular: Boolean(item.isPopular),
    categoryId: item.categoryId,
    categoryName: "",
    description: item.description ?? "",
    status:
      item.status === "active" && item.availability !== "unavailable"
        ? "Active"
        : "Hidden",
    kind: resolveMenuItemKind(variants, addOnGroups),
    basePrice: item.kind === "variant" ? null : basePrice,
    variants,
    addOnGroups,
    recommendedItemIds: (item.recommendedItemIds ?? []).map((id) => String(id)),
    updatedAt: item.updatedAt,
  }
}

export function mapOwnerPayoutMethod(
  response: OwnerPayoutMethodResponse["payoutMethod"],
  current: PayoutMethod
): PayoutMethod {
  const allowedSources = new Set(["onboarding", "settings", "payouts"])
  const nextSource = allowedSources.has(response.verificationSource ?? "")
    ? (response.verificationSource as PayoutMethod["verificationSource"])
    : null

  return {
    ...current,
    id: response._id,
    type: response.type,
    accountName: response.accountName,
    accountNumber: response.accountNumber || current.accountNumber,
    bankName: response.bankName ?? "",
    branchName: response.branchName ?? "",
    isVerified: response.isVerified ?? false,
    verifiedAt: response.verifiedAt ?? null,
    pendingAccountNumber: response.pendingAccountNumber ?? "",
    pendingAccountName: response.pendingAccountName ?? "",
    pendingVerificationStatus: response.pendingVerificationStatus ?? null,
    pendingVerifiedAt: response.pendingVerifiedAt ?? null,
    pendingAdminNote: response.pendingAdminNote ?? "",
    verificationSource: nextSource,
  }
}

export function mapOwnerPayout(
  payout: OwnerPayoutHistoryResponse,
  payoutMethodType: PayoutMethod["type"]
): Payout {
  return {
    id: payout._id,
    amount: payout.amount,
    status: payout.status,
    method: payoutMethodType,
    batchReference: payout.batchReference ?? "",
    transactionId:
      payout.providerTransactionId ??
      payout.providerReference ??
      payout.batchReference ??
      payout._id,
    providerReference: payout.providerReference ?? "",
    providerPayoutId: payout.providerPayoutId ?? "",
    paymentProofUrl: payout.paymentProofUrl ?? "",
    processingNote: payout.processingNote ?? "",
    createdAt: payout.requestedAt ?? payout.createdAt,
    processedAt: payout.processedAt ?? null,
    failureReason: payout.failureReason ?? null,
  }
}

export function mapOwnerPayoutTransaction(
  entry: OwnerPayoutTransactionResponse
): EarningTransaction {
  return {
    id: entry._id,
    orderId: entry.orderId ?? entry.payoutBatchId ?? entry._id,
    orderNumber: entry.orderId ?? entry.payoutBatchId ?? entry._id,
    type:
      entry.entryType === "payout"
        ? "payout"
        : entry.entryType === "refund"
          ? "refund"
          : "earning",
    payoutId: entry.payoutBatchId ?? null,
    ledgerGroupId: entry._id,
    grossAmount: entry.grossAmount ?? Math.max(entry.netAmount, 0),
    commission: entry.commission ?? 0,
    discountCost: entry.discountCost ?? 0,
    deliveryCost: entry.deliveryCost ?? 0,
    netAmount: entry.netAmount,
    status: entry.settlementStatus,
    adjustmentType:
      entry.entryType === "payout"
        ? "payout"
        : entry.entryType === "refund"
          ? "refund"
          : "earning",
    createdAt: entry.createdAt,
    settlementAvailableAt: entry.availableAt ?? entry.createdAt,
  }
}

export function mapOwnerReview(review: OwnerReviewResponse): Review {
  const replyMessage = review.ownerReply?.message?.trim() ?? ""
  const hasReply = replyMessage.length > 0
  const status =
    review.moderationStatus === "flagged"
      ? "flagged"
      : hasReply
        ? "replied"
        : "new"

  return {
    id: review._id,
    rating: Math.min(Math.max(review.rating, 1), 5) as Review["rating"],
    comment: review.comment ?? "",
    createdAt: review.createdAt,
    user: {
      name: review.customerId ? `Customer ${review.customerId.slice(-4)}` : "Customer",
      isAnonymous: !review.customerId,
    },
    orderInfo: review.orderId
      ? {
          id: review.orderId,
          orderNumber: review.orderId,
          items: [],
        }
      : null,
    source: "App",
    reply: hasReply
      ? {
          message: replyMessage,
          createdAt: review.ownerReply?.createdAt ?? review.createdAt,
          updatedAt: review.ownerReply?.updatedAt ?? null,
        }
      : null,
    status,
  }
}

export function mapOwnerSupportCase(
  supportCase: OwnerSupportCaseResponse
): SupportTicket {
  return {
    id: supportCase._id,
    kind: supportCase.kind,
    subject: supportCase.subject,
    categoryId: supportCase.categoryId,
    message: supportCase.message,
    status: supportCase.status,
    priority: supportCase.priority,
    createdAt: supportCase.createdAt,
    updatedAt: supportCase.updatedAt,
    attachments:
      supportCase.attachments?.map((attachment) => ({
        url: attachment.url ?? "",
        publicId: attachment.publicId ?? "",
        fileName: attachment.fileName ?? "",
        fileType: attachment.fileType ?? ""
      })) ?? [],
    replies:
      supportCase.replies?.map((reply) => ({
        message: reply.message,
        adminName: reply.adminName ?? "Support Team",
        createdAt: reply.createdAt
      })) ?? [],
  }
}

function mapTimeSlots(slots: Partial<TimeSlot>[] | undefined) {
  if (!slots || slots.length === 0) return [createTimeSlot()]
  return slots.map((slot, index) => {
    const startTime = slot.startTime ?? "10:00"
    const endTime = slot.endTime ?? "23:00"
    const stableId = `slot-${index}-${startTime}-${endTime}`
    return {
      id: slot.id ?? stableId,
      startTime,
      endTime,
    }
  })
}

function normalizeOpeningHoursDateKey(value: unknown) {
  if (!value) return ""
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10)
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10)
  }
  return ""
}

function normalizeOpeningHoursTimestamp(value: unknown, fallback: string) {
  if (typeof value === "string") {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString()
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? fallback : value.toISOString()
  }
  return fallback
}

function mapScheduleExceptions(
  entries: OwnerOpeningHoursResponse["exceptions"] | undefined
): ScheduleException[] {
  if (!entries || entries.length === 0) return []
  return entries.map((entry, index) => {
    const dateKey = normalizeOpeningHoursDateKey(entry.date)
    return {
      id: entry.id ?? `exception-${dateKey || index}`,
      date: dateKey,
      label: entry.label ?? "",
      isOpen: entry.isOpen ?? false,
      is24Hours: entry.is24Hours ?? false,
      timeSlots:
        entry.isOpen && !entry.is24Hours
          ? mapTimeSlots(entry.timeSlots as Partial<TimeSlot>[] | undefined)
          : [],
      note: entry.note ?? "",
    }
  })
}

export function mapOwnerOpeningHours(
  response: OwnerOpeningHoursResponse,
  current: OpeningHoursSettings
): OpeningHoursSettings {
  const schedule =
    response.weeklySchedule && response.weeklySchedule.length > 0
      ? weekdayOrder.map((day) => {
          const entry =
            response.weeklySchedule?.find((item) => item.day === day) ?? null
          const fallback =
            current.weeklySchedule.find((item) => item.day === day) ??
            ({
              day,
              isOpen: true,
              is24Hours: false,
              timeSlots: [createTimeSlot("10:00", "23:00")],
            } as DaySchedule)
          if (!entry) return fallback
          return {
            day,
            isOpen: entry.isOpen ?? fallback.isOpen,
            is24Hours: entry.is24Hours ?? fallback.is24Hours,
            timeSlots:
              entry.isOpen && !entry.is24Hours
                ? mapTimeSlots(entry.timeSlots as Partial<TimeSlot>[] | undefined)
                : [],
          }
        })
      : current.weeklySchedule

  return {
    ...current,
    timezone: response.timezone ?? current.timezone,
    weeklySchedule: schedule,
    exceptions: mapScheduleExceptions(response.exceptions),
    temporaryClosure: {
      ...current.temporaryClosure,
      ...(response.temporaryClosure ?? {}),
      resumeAt:
        response.temporaryClosure?.resumeAt === null
          ? null
          : normalizeOpeningHoursTimestamp(
              response.temporaryClosure?.resumeAt,
              current.temporaryClosure.resumeAt ?? ""
            ) || null,
    },
    updatedAt: normalizeOpeningHoursTimestamp(response.updatedAt, current.updatedAt),
  }
}

function mapBackendVoucherType(type: OwnerVoucherResponse["type"]): VoucherType {
  if (type === "free_delivery") return "free-delivery"
  if (type === "percentage") return "percentage"
  return "flat"
}

export function mapOwnerVoucher(voucher: OwnerVoucherResponse): Voucher {
  const maxTotalUses = voucher.maxTotalUses ?? 0
  const remainingUsage = maxTotalUses > 0 ? maxTotalUses : null
  const mappedType = mapBackendVoucherType(voucher.type)
  const fallbackAnalytics = {
    totalUses: 0,
    uniqueUsers: 0,
    repeatUsage: 0,
    totalDiscountGiven: 0,
    totalOrdersUsingVoucher: 0,
    revenueGenerated: 0,
    remainingUsage,
    totalDeliveryCostCovered: 0,
    points: [
      { label: "Mon", uses: 0, discount: 0 },
      { label: "Tue", uses: 0, discount: 0 },
      { label: "Wed", uses: 0, discount: 0 },
      { label: "Thu", uses: 0, discount: 0 },
      { label: "Fri", uses: 0, discount: 0 },
      { label: "Sat", uses: 0, discount: 0 },
      { label: "Sun", uses: 0, discount: 0 },
    ],
  }

  return {
    id: voucher._id,
    name: voucher.name,
    code: voucher.code ?? "",
    createdByType: voucher.createdByType ?? "owner",
    createdById: voucher.createdById ?? "",
    fundedBy: voucher.fundedBy ?? "owner",
    stackingRule: voucher.stackingRule ?? "exclusive",
    priority: voucher.priority ?? 0,
    mode: voucher.mode ?? "auto",
    type: mappedType,
    discountValue: mappedType === "free-delivery" ? null : voucher.discountValue ?? 0,
    minimumOrderAmount: voucher.minimumOrderAmount ?? 0,
    maxTotalUses: maxTotalUses > 0 ? maxTotalUses : null,
    maxUsesPerUser: voucher.maxUsesPerUser > 0 ? voucher.maxUsesPerUser : 1,
    allowRepeatUsage: voucher.allowRepeatUsage ?? false,
    status: voucher.status ?? "Draft",
    applicability: voucher.applicability ?? "all",
    categoryIds: (voucher.categoryIds ?? []).map((id) => `${id}`),
    itemIds: (voucher.itemIds ?? []).map((id) => `${id}`),
    startsAt: voucher.startsAt,
    endsAt: voucher.endsAt,
    createdAt: voucher.createdAt,
    updatedAt: voucher.updatedAt,
    analytics: voucher.analytics ?? fallbackAnalytics,
  }
}

function buildOrderTimestamps(source?: Partial<Record<string, string>>): OrderStatusTimestamps {
  return {
    placedAt: source?.placedAt ?? new Date().toISOString(),
    acceptedAt: source?.Accepted ?? source?.acceptedAt ?? null,
    preparingAt: source?.Preparing ?? source?.preparingAt ?? null,
    readyForPickupAt: source?.ReadyForPickup ?? source?.readyForPickupAt ?? null,
    pickedUpAt: source?.PickedUp ?? source?.pickedUpAt ?? null,
    deliveredAt: source?.Delivered ?? source?.deliveredAt ?? null,
    rejectedAt: source?.Rejected ?? source?.rejectedAt ?? null,
    cancelledAt: source?.Cancelled ?? source?.cancelledAt ?? null,
  }
}

function mapVariantLabel(
  options?: Array<{ groupName: string; optionLabel: string }>
) {
  if (!options?.length) return null
  return options.map((item) => `${item.groupName}: ${item.optionLabel}`).join(", ")
}

function mapAddOns(
  options?: Array<{ groupName: string; optionLabel: string }>
): OrderLineItemAddOn[] {
  if (!options?.length) return []
  return options.map((item, index) => ({
    id: `${item.groupName}-${item.optionLabel}-${index}`,
    name: `${item.groupName}: ${item.optionLabel}`,
    price: 0,
  }))
}

function mapHistory(history?: OwnerOrderResponse["history"]): OrderStatusHistoryItem[] {
  if (!history?.length) return []
  return history.map((entry, index) => ({
    id: `${entry.status}-${index}`,
    status: entry.status,
    updatedAt: entry.createdAt,
    updatedBy: entry.actor,
    note: entry.note ?? "",
  }))
}

export function mapOwnerOrder(order: OwnerOrderResponse): Order {
  const pricing = order.pricing ?? {}
  const deliveryFee = pricing.deliveryFee ?? 0
  const rawCustomerTotal = pricing.total ?? 0
  const discountAmount = pricing.discountAmount ?? pricing.ownerDiscountCost ?? 0
  const subtotal =
    pricing.subtotal ??
    pricing.restaurantSubtotal ??
    Math.max(rawCustomerTotal - deliveryFee + discountAmount, 0)
  const ownerDiscountCost = pricing.ownerDiscountCost ?? pricing.ownerVisibleDiscount ?? pricing.discountAmount ?? 0
  const platformDiscountCost = pricing.platformDiscountCost ?? 0
  const restaurantSubtotal = pricing.restaurantSubtotal ?? subtotal
  const restaurantNetSales = pricing.restaurantNetSales ?? Math.max(restaurantSubtotal - ownerDiscountCost, 0)
  const customerPaidTotal =
    pricing.customerPaidTotal ??
    pricing.total ??
    Math.max(subtotal + deliveryFee - discountAmount, 0)

  return {
    id: order._id,
    orderNumber: order.orderNumber,
    customer: {
      name: order.customerSnapshot?.fullName ?? "Customer",
      phone: order.customerSnapshot?.phone ?? "",
      address:
        order.customerSnapshot?.deliveryAddress?.addressLine ??
        order.customerSnapshot?.deliveryAddress?.label ??
        "",
    },
    rider:
      order.riderId || order.riderSnapshot?.name || order.riderSnapshot?.phone
        ? {
            id: order.riderId ?? "",
            name: order.riderSnapshot?.name ?? "Assigned rider",
            phone: order.riderSnapshot?.phone ?? "",
          }
        : null,
    items:
      order.itemsSnapshot?.map((item, index) => ({
        id: item.itemId ?? `item-${index}`,
        name: item.name ?? "Item",
        quantity: item.quantity ?? 1,
        unitPrice: item.unitPrice ?? 0,
        variantLabel: mapVariantLabel(item.selectedVariantOptions),
        addOns: mapAddOns(item.selectedAddOnOptions),
      })) ?? [],
    subtotal,
    deliveryFee,
    discount: ownerDiscountCost,
    total: restaurantNetSales,
    restaurantSubtotal,
    ownerDiscountCost,
    platformDiscountCost,
    restaurantNetSales,
    customerPaidTotal,
    paymentMethod: order.paymentMethod?.toLowerCase() === "bkash" ? "Bkash" : "Cash",
    currentStatus: order.status,
    cancelledBy: order.cancelledBy,
    terminalReason: order.terminalReason,
    kitchenNote: "",
    timestamps: buildOrderTimestamps(order.timestamps),
    autoCancel: order.autoCancel,
    preparationTiming: order.preparationTiming,
    appliedVouchers: order.appliedVouchers ?? [],
    history: mapHistory(order.history),
  }
}

export function buildOnboardingDraftPayload(params: {
  onboardingState: OnboardingState
  storeSettings: StoreSettings
  openingHours: OpeningHoursSettings
  payoutMethod: PayoutMethod
  ownerName: string
}): OnboardingDraftPayload {
  const cuisineTypes = params.storeSettings.cuisineType
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)

  return {
    currentStep: params.onboardingState.currentStep,
    completedSteps: params.onboardingState.completedSteps,
    skippedSteps: params.onboardingState.skippedSteps,
    basicInfo: {
      restaurantName: params.storeSettings.name,
      fullName: params.ownerName,
      phone: params.storeSettings.phone,
      email: params.storeSettings.email,
      description: params.storeSettings.description,
      preparationTimeMinutes:
        params.storeSettings.orderSettings.preparationTimeMinutes,
      cuisineTypes,
      tags: params.storeSettings.tags,
      logo: { url: params.storeSettings.logoUrl },
      coverImage: { url: params.storeSettings.coverImageUrl },
    },
    location: {
      address: params.storeSettings.address,
      city: params.storeSettings.location.city,
      latitude: params.storeSettings.location.latitude,
      longitude: params.storeSettings.location.longitude,
    },
    openingHours: params.openingHours,
    payoutSetup: {
      type: params.payoutMethod.type,
      accountName: params.payoutMethod.accountName,
      accountNumber: params.payoutMethod.accountNumber,
      isVerified: Boolean(params.payoutMethod.isVerified),
    },
  }
}
