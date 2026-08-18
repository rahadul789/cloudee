import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "@/lib/api"
import { buildQueryString, compactQueryParams } from "@/lib/filtering"
import type {
  OnboardingDraftResponse,
  OwnerOrderResponse,
  OwnerRiderAssignmentOptionResponse,
  OwnerProfileResponse,
  OwnerNotificationResponse,
  OwnerListResponse,
  ReviewStatusResponse,
  OwnerStoreSettingsResponse,
  OwnerCategoryResponse,
  OwnerMenuApprovalSummary,
  OwnerMenuItemResponse,
  OwnerMenuMutationResponse,
  OwnerVoucherResponse,
  OwnerPayoutMethodResponse,
  OwnerPayoutSummaryResponse,
  OwnerPayoutHistoryResponse,
  OwnerPayoutTransactionResponse,
  OwnerDashboardSummaryResponse,
  OwnerAnalyticsOverviewResponse,
  OwnerReviewResponse,
  OwnerOpeningHoursResponse,
  OwnerSupportCaseResponse,
  OwnerSidebarSummaryResponse,
  PlatformContentResponse,
} from "@/lib/backend-mappers"

export type OwnerSigninResponse = {
  accessToken: string
  owner: {
    id: string
    fullName: string
    phone: string
    isPhoneVerified: boolean
  }
  restaurantLifecycleStatus:
    | "account_created"
    | "phone_verified"
    | "onboarding_in_progress"
    | "submitted"
    | "under_review"
    | "approved"
    | "rejected"
}

type MockOtpDebugData = {
  mockCode?: string
}

type OtpTimingData = {
  expiresInSeconds: number
  resendAvailableInSeconds?: number
}

export type OtpVerifyResponse = {
  verified: boolean
  purpose: "owner_signup_verify" | "owner_phone_change" | "owner_payout_verify" | "password_reset"
  nextStatus?: string
}

export type PasswordResetRequestResponse = MockOtpDebugData & OtpTimingData & {
  verificationSessionId: string
}

export type OwnerProfileUpdateResponse = MockOtpDebugData & {
  owner: {
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
  }
  verificationSessionId: string | null
  expiresInSeconds?: number
  resendAvailableInSeconds?: number
}

export function useOwnerSigninMutation() {
  return useMutation({
    mutationFn: (payload: { phone: string; password: string }) =>
      api.post<OwnerSigninResponse>("/auth/owner/signin", payload, false),
  })
}

export function useVerifyOtpMutation() {
  return useMutation({
    mutationFn: (payload: {
      verificationSessionId: string
      otpCode: string
    }) => api.post<OtpVerifyResponse>("/auth/otp/verify", payload, false),
  })
}

export function useForgotPasswordMutation() {
  return useMutation({
    mutationFn: (payload: { phone: string }) =>
      api.post<PasswordResetRequestResponse>("/auth/password/forgot", payload, false),
  })
}

export function useResetPasswordMutation() {
  return useMutation({
    mutationFn: (payload: {
      verificationSessionId: string
      newPassword: string
    }) => api.post<{ reset: true }>("/auth/password/reset", payload, false),
  })
}

export function useUpdateOwnerProfileMutation() {
  return useMutation({
    mutationFn: (payload: { fullName?: string; email?: string; phone?: string }) =>
      api.patch<OwnerProfileUpdateResponse>("/owner/me", payload),
  })
}

export function useUpdateOwnerPasswordMutation() {
  return useMutation({
    mutationFn: (payload: { currentPassword: string; newPassword: string }) =>
      api.patch<{ updated: true }>("/owner/me/password", payload),
  })
}

export function useOwnerProfileQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["owner", "me"],
    enabled,
    queryFn: ({ signal }) => api.get<OwnerProfileResponse>("/owner/me", signal),
  })
}

export function useOnboardingDraftQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["owner", "onboarding-draft"],
    enabled,
    queryFn: ({ signal }) =>
      api.get<OnboardingDraftResponse>("/owner/onboarding/draft", signal),
  })
}

export function useReviewStatusQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["owner", "review-status"],
    enabled,
    queryFn: ({ signal }) =>
      api.get<ReviewStatusResponse>("/owner/review-status", signal),
  })
}

export function usePublicPlatformContentQuery(enabled = true) {
  return useQuery({
    queryKey: ["public", "platform-content"],
    enabled,
    staleTime: 1000 * 60 * 30,
    queryFn: ({ signal }) =>
      api.get<PlatformContentResponse>("/public/content", signal, false),
  })
}

export function useOwnerNotificationsQuery(enabled: boolean) {
  return useOwnerNotificationsListQuery(enabled)
}

export function useOwnerNotificationsListQuery(
  enabled: boolean,
  params?: {
    filter?: string
    search?: string
    page?: number
    pageSize?: number
  }
) {
  const normalizedParams = compactQueryParams(params)
  const queryString = buildQueryString(normalizedParams)
  const path = queryString ? `/owner/notifications?${queryString}` : "/owner/notifications"

  return useQuery({
    queryKey: ["owner", "notifications", normalizedParams],
    enabled,
    refetchInterval: enabled ? 30000 : false,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => api.get<OwnerListResponse<OwnerNotificationResponse>>(path, signal),
  })
}

export function useOwnerNotificationReadMutation() {
  return useMutation({
    mutationFn: (notificationId: string) =>
      api.patch<OwnerNotificationResponse>(`/owner/notifications/${notificationId}/read`, {}),
  })
}

export function useOwnerNotificationsReadAllMutation() {
  return useMutation({
    mutationFn: () =>
      api.patch<{ updated: true }>("/owner/notifications/read-all", {}),
  })
}

export function useOwnerStoreSettingsQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["owner", "store-settings"],
    enabled,
    queryFn: ({ signal }) => api.get<OwnerStoreSettingsResponse>("/owner/store-settings", signal),
  })
}

export function useOwnerOpeningHoursQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["owner", "opening-hours"],
    enabled,
    queryFn: ({ signal }) => api.get<OwnerOpeningHoursResponse>("/owner/opening-hours", signal),
  })
}

export function useUpdateOwnerOpeningHoursMutation() {
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.put<OwnerOpeningHoursResponse>("/owner/opening-hours", payload),
  })
}

export function useUpdateOwnerStoreSettingsMutation() {
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.patch<OwnerStoreSettingsResponse>("/owner/store-settings", payload),
  })
}

export function useUpdateOwnerRestaurantStatusMutation() {
  return useMutation({
    mutationFn: (payload: { isOnline: boolean }) =>
      api.patch<OwnerStoreSettingsResponse>("/owner/restaurant-status", {
        ...payload,
        source: "owner_web",
      }),
  })
}

export function useUpdateOwnerPayoutMethodMutation() {
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.put<OwnerPayoutMethodResponse>("/owner/payout-method", payload),
  })
}

export function useOwnerCategoriesQuery(
  enabled: boolean,
  params?: {
    search?: string
    status?: string
    sortBy?: string
    page?: number
    pageSize?: number
  }
) {
  const normalizedParams = compactQueryParams(params)
  const queryString = buildQueryString(normalizedParams)
  const path = queryString ? `/owner/categories?${queryString}` : "/owner/categories"

  return useQuery({
    queryKey: ["owner", "categories", normalizedParams],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => api.get<OwnerListResponse<OwnerCategoryResponse>>(path, signal),
  })
}

export function useCreateOwnerCategoryMutation() {
  return useMutation({
    mutationFn: (payload: { name: string; description?: string }) =>
      api.post<OwnerCategoryResponse>("/owner/categories", payload),
  })
}

export function useUpdateOwnerCategoryMutation() {
  return useMutation({
    mutationFn: (payload: {
      id: string
      name?: string
      description?: string
      status?: "active" | "archived"
      displayOrder?: number
    }) =>
      api.patch<OwnerCategoryResponse>(`/owner/categories/${payload.id}`, {
        name: payload.name,
        description: payload.description,
        status: payload.status,
        displayOrder: payload.displayOrder,
      }),
  })
}

export function useDeleteOwnerCategoryMutation() {
  return useMutation({
    mutationFn: (categoryId: string) =>
      api.delete<{ deleted: true }>(`/owner/categories/${categoryId}`),
  })
}

export function useOwnerMenuItemsQuery(
  enabled: boolean,
  params?: {
    search?: string
    status?: string
    availability?: string
    categoryId?: string
    popularFilter?: string
    sortBy?: string
    page?: number
    pageSize?: number
  }
) {
  const normalizedParams = compactQueryParams(params)
  const queryString = buildQueryString(normalizedParams)
  const path = queryString ? `/owner/menu-items?${queryString}` : "/owner/menu-items"

  return useQuery({
    queryKey: ["owner", "menu-items", normalizedParams],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => api.get<OwnerListResponse<OwnerMenuItemResponse>>(path, signal),
  })
}

export function useOwnerMenuApprovalRequestsQuery(
  enabled: boolean,
  status: "active" | "pending" | "approved" | "rejected" = "active"
) {
  const queryString = buildQueryString({ status })
  const path = queryString
    ? `/owner/menu-approval-requests?${queryString}`
    : "/owner/menu-approval-requests"

  return useQuery({
    queryKey: ["owner", "menu-approval-requests", status],
    enabled,
    queryFn: ({ signal }) =>
      api.get<OwnerListResponse<OwnerMenuApprovalSummary>>(path, signal),
  })
}

export function useOwnerSidebarSummaryQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["owner", "sidebar-summary"],
    enabled,
    staleTime: 1000 * 10,
    queryFn: ({ signal }) =>
      api.get<OwnerSidebarSummaryResponse>("/owner/sidebar-summary", signal),
  })
}

export function useOwnerVouchersQuery(
  enabled: boolean,
  params?: {
    search?: string
    lifecycle?: string
    mode?: string
    type?: string
    sortBy?: string
    page?: number
    pageSize?: number
  }
) {
  const normalizedParams = compactQueryParams(params)
  const queryString = buildQueryString(normalizedParams)
  const path = queryString ? `/owner/vouchers?${queryString}` : "/owner/vouchers"

  return useQuery({
    queryKey: ["owner", "vouchers", normalizedParams],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => api.get<OwnerListResponse<OwnerVoucherResponse>>(path, signal),
  })
}

export function useCreateOwnerVoucherMutation() {
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post<OwnerVoucherResponse>("/owner/vouchers", payload),
  })
}

export function useUpdateOwnerVoucherMutation() {
  return useMutation({
    mutationFn: (payload: { id: string } & Record<string, unknown>) =>
      api.patch<OwnerVoucherResponse>(`/owner/vouchers/${payload.id}`, (() => {
        const { id: _id, ...rest } = payload
        return rest
      })()),
  })
}

export function useDeleteOwnerVoucherMutation() {
  return useMutation({
    mutationFn: (voucherId: string) =>
      api.delete<{ deleted: true }>(`/owner/vouchers/${voucherId}`),
  })
}

export function useOwnerPayoutSummaryQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["owner", "payouts", "summary"],
    enabled,
    queryFn: ({ signal }) => api.get<OwnerPayoutSummaryResponse>("/owner/payouts/summary", signal),
  })
}

export function useOwnerPayoutHistoryQuery(
  enabled: boolean,
  params?: {
    search?: string
    status?: string
    sortBy?: string
    preset?: string
    from?: string
    to?: string
    dateBasis?: "created" | "history" | "activity"
    page?: number
    pageSize?: number
  }
) {
  const normalizedParams = compactQueryParams(params)
  const queryString = buildQueryString(normalizedParams)
  const path = queryString ? `/owner/payouts/history?${queryString}` : "/owner/payouts/history"

  return useQuery({
    queryKey: ["owner", "payouts", "history", normalizedParams],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => api.get<OwnerListResponse<OwnerPayoutHistoryResponse>>(path, signal),
  })
}

export function useOwnerPayoutTransactionsQuery(
  enabled: boolean,
  params?: {
    search?: string
    payoutId?: string
    type?: string
    sortBy?: string
    preset?: string
    from?: string
    to?: string
    page?: number
    pageSize?: number
  }
) {
  const normalizedParams = compactQueryParams(params)
  const queryString = buildQueryString(normalizedParams)
  const path = queryString ? `/owner/payout-transactions?${queryString}` : "/owner/payout-transactions"

  return useQuery({
    queryKey: ["owner", "payouts", "transactions", normalizedParams],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      api.get<OwnerListResponse<OwnerPayoutTransactionResponse>>(path, signal),
  })
}

export function useRequestOwnerPayoutMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api.post<OwnerPayoutHistoryResponse>("/owner/payouts/request", {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["owner", "payouts"] })
      void queryClient.invalidateQueries({ queryKey: ["owner", "dashboard", "summary"] })
    },
  })
}

export function useOwnerDashboardSummaryQuery(
  enabled: boolean,
  params?: {
    preset?: string
    from?: string
    to?: string
  }
) {
  const normalizedParams = compactQueryParams(params)
  const queryString = buildQueryString(normalizedParams)
  const path = queryString ? `/owner/dashboard/summary?${queryString}` : "/owner/dashboard/summary"

  return useQuery({
    queryKey: ["owner", "dashboard", "summary", normalizedParams],
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 1000 * 10,
    queryFn: ({ signal }) =>
      api.get<OwnerDashboardSummaryResponse>(path, signal),
  })
}

export function useOwnerAnalyticsOverviewQuery(
  enabled: boolean,
  params?: {
    preset?: string
    from?: string
    to?: string
    paymentMethod?: string
    orderType?: "delivery" | "pickup"
    categoryId?: string
  }
) {
  const normalizedParams = compactQueryParams(params)
  const queryString = buildQueryString(normalizedParams)
  const path = queryString
    ? `/owner/analytics/overview?${queryString}`
    : "/owner/analytics/overview"

  return useQuery({
    queryKey: ["owner", "analytics", "overview", normalizedParams],
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 1000 * 15,
    queryFn: ({ signal }) =>
      api.get<OwnerAnalyticsOverviewResponse>(path, signal),
  })
}

export function useOwnerReviewsQuery(
  enabled: boolean,
  params?: {
    search?: string
    rating?: string
    datePreset?: string
    from?: string
    to?: string
    commentFilter?: string
    replyFilter?: string
    sortBy?: string
    showNewOnly?: boolean
    page?: number
    pageSize?: number
  }
) {
  const normalizedParams = compactQueryParams({
    ...params,
    showNewOnly: params?.showNewOnly ? "true" : undefined,
  })
  const queryString = buildQueryString(normalizedParams)
  const path = queryString ? `/owner/reviews?${queryString}` : "/owner/reviews"

  return useQuery({
    queryKey: ["owner", "reviews", normalizedParams],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => api.get<OwnerListResponse<OwnerReviewResponse>>(path, signal),
  })
}

export function useOwnerSupportCasesQuery(enabled: boolean) {
  return useOwnerSupportCasesListQuery(enabled)
}

export function useOwnerSupportCasesListQuery(
  enabled: boolean,
  params?: {
    search?: string
    categoryId?: string
    status?: string
    sortBy?: string
    page?: number
    pageSize?: number
  }
) {
  const normalizedParams = compactQueryParams(params)
  const queryString = buildQueryString(normalizedParams)
  const path = queryString ? `/owner/support-cases?${queryString}` : "/owner/support-cases"

  return useQuery({
    queryKey: ["owner", "support-cases", normalizedParams],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      api.get<OwnerListResponse<OwnerSupportCaseResponse>>(path, signal),
  })
}

export function useCreateOwnerSupportCaseMutation() {
  return useMutation({
    mutationFn: (payload: {
      kind: "report" | "question"
      subject: string
      categoryId: string
      message: string
      priority?: "low" | "medium" | "high"
      attachments?: Array<{
        url?: string
        publicId?: string
        fileName?: string
        fileType?: string
      }>
    }) => api.post<OwnerSupportCaseResponse>("/owner/support-cases", payload),
  })
}

export function useOwnerReviewReplyMutation() {
  return useMutation({
    mutationFn: (payload: { reviewId: string; message: string }) =>
      api.post<OwnerReviewResponse>(`/owner/reviews/${payload.reviewId}/reply`, {
        message: payload.message,
      }),
  })
}

export function useOwnerReviewHideRequestMutation() {
  return useMutation({
    mutationFn: (payload: {
      reviewId: string
      reasonCategory:
        | "fake_spam"
        | "abusive_language"
        | "wrong_restaurant_or_order"
        | "unfair_misleading"
        | "other"
      note?: string
    }) =>
      api.post<OwnerReviewResponse>(`/owner/reviews/${payload.reviewId}/hide-request`, {
        reasonCategory: payload.reasonCategory,
        note: payload.note ?? "",
      }),
  })
}

export function useCreateOwnerMenuItemMutation() {
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post<OwnerMenuMutationResponse>("/owner/menu-items", payload),
  })
}

export function useUpdateOwnerMenuItemMutation() {
  return useMutation({
    mutationFn: (payload: { id: string } & Record<string, unknown>) =>
      api.patch<OwnerMenuMutationResponse>(`/owner/menu-items/${payload.id}`, (() => {
        const { id: _id, ...rest } = payload
        return rest
      })()),
  })
}

export function useDeleteOwnerMenuItemMutation() {
  return useMutation({
    mutationFn: (itemId: string) =>
      api.delete<{ deleted: true }>(`/owner/menu-items/${itemId}`),
  })
}

export function useOwnerOrdersQuery(
  enabled: boolean,
  params?: {
    tab?: "live" | "history"
    status?: string
    search?: string
    paymentMethod?: string
    sortBy?: string
    preset?: string
    from?: string
    to?: string
    page?: number
    pageSize?: number
  }
) {
  const normalizedParams = compactQueryParams(params)
  const queryString = buildQueryString(normalizedParams)
  const path = queryString ? `/owner/orders?${queryString}` : "/owner/orders"

  return useQuery({
    queryKey: ["owner", "orders", normalizedParams],
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 1000 * 5,
    queryFn: ({ signal }) => api.get<OwnerListResponse<OwnerOrderResponse>>(path, signal),
  })
}

export function useOwnerAnalyticsOrdersQuery(
  enabled: boolean,
  params?: {
    status?: string
    search?: string
    paymentMethod?: string
    sortBy?: string
    preset?: string
    from?: string
    to?: string
    dateBasis?: "created" | "history" | "activity"
    page?: number
    pageSize?: number
  }
) {
  const analyticsListParams = compactQueryParams({
    status: params?.status,
    search: params?.search,
    paymentMethod: params?.paymentMethod,
    sortBy: params?.sortBy,
    preset: params?.preset,
    from: params?.from,
    to: params?.to,
    dateBasis: params?.dateBasis,
    page: params?.page ?? 1,
    pageSize: params?.pageSize ?? 100,
  })
  const queryString = buildQueryString(analyticsListParams)
  const path = queryString ? `/owner/orders?${queryString}` : "/owner/orders"

  return useQuery({
    queryKey: ["owner", "analytics", "orders", analyticsListParams],
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 1000 * 10,
    queryFn: ({ signal }) =>
      api.get<OwnerListResponse<OwnerOrderResponse>>(path, signal),
  })
}

export function useOwnerAnalyticsPayoutHistoryQuery(
  enabled: boolean,
  params?: {
    search?: string
    status?: string
    sortBy?: string
    preset?: string
    from?: string
    to?: string
    page?: number
    pageSize?: number
  }
) {
  const analyticsListParams = compactQueryParams({
    ...params,
    page: params?.page ?? 1,
    pageSize: params?.pageSize ?? 100,
  })
  const queryString = buildQueryString(analyticsListParams)
  const path = queryString
    ? `/owner/payouts/history?${queryString}`
    : "/owner/payouts/history"

  return useQuery({
    queryKey: ["owner", "analytics", "payouts", "history", analyticsListParams],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      api.get<OwnerListResponse<OwnerPayoutHistoryResponse>>(path, signal),
  })
}

export function useOwnerAnalyticsPayoutTransactionsQuery(
  enabled: boolean,
  params?: {
    search?: string
    type?: string
    sortBy?: string
    preset?: string
    from?: string
    to?: string
    page?: number
    pageSize?: number
  }
) {
  const analyticsListParams = compactQueryParams({
    ...params,
    page: params?.page ?? 1,
    pageSize: params?.pageSize ?? 100,
  })
  const queryString = buildQueryString(analyticsListParams)
  const path = queryString
    ? `/owner/payout-transactions?${queryString}`
    : "/owner/payout-transactions"

  return useQuery({
    queryKey: ["owner", "analytics", "payouts", "transactions", analyticsListParams],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      api.get<OwnerListResponse<OwnerPayoutTransactionResponse>>(path, signal),
  })
}

export function useOwnerOrderTransitionMutation() {
  return useMutation({
    mutationFn: (payload: {
      orderId: string
      nextStatus: "Accepted" | "Rejected" | "Preparing" | "ReadyForPickup" | "Cancelled"
      actor: "owner"
      note?: string
      preparationMinutes?: number
    }) =>
      api.post<OwnerOrderResponse>(`/owner/orders/${payload.orderId}/transition`, {
        nextStatus: payload.nextStatus,
        actor: payload.actor,
        note: payload.note,
        preparationMinutes: payload.preparationMinutes,
      }),
  })
}

export function useOwnerOrderPreparationExtendMutation() {
  return useMutation({
    mutationFn: (payload: { orderId: string; minutes: 5 | 10 | 15 }) =>
      api.post<OwnerOrderResponse>(
        `/owner/orders/${payload.orderId}/preparation/extend`,
        { minutes: payload.minutes }
      ),
  })
}

export function useOwnerRiderAssignmentOptionsQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["owner", "riders", "assignment-options"],
    enabled,
    queryFn: ({ signal }) =>
      api.get<OwnerRiderAssignmentOptionResponse[]>("/owner/riders/assignment-options", signal),
  })
}

export function useOwnerAssignRiderMutation() {
  return useMutation({
    mutationFn: (payload: { orderId: string; riderId: string }) =>
      api.post<OwnerOrderResponse>(`/owner/orders/${payload.orderId}/assign-rider`, {
        riderId: payload.riderId,
      }),
  })
}

export function useUpdateOnboardingDraftMutation() {
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.put<OnboardingDraftResponse>("/owner/onboarding/draft", payload),
  })
}

export function useSubmitOnboardingDraftMutation() {
  return useMutation({
    mutationFn: () =>
      api.post<{
        restaurantLifecycleStatus: OwnerSigninResponse["restaurantLifecycleStatus"]
        submittedAt: string | null
        resubmissionCount: number
      }>("/owner/onboarding/submit"),
  })
}
