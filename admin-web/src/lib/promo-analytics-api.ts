import { adminRequest } from "./api"

export type AdminPromoAnalyticsPreset =
  | "today"
  | "yesterday"
  | "last7Days"
  | "last30Days"
  | "last90Days"
  | "thisMonth"
  | "lastMonth"
  | "lifetime"
  | "custom"

export type AdminPromoAnalyticsQueryParams = {
  preset?: AdminPromoAnalyticsPreset
  from?: string
  to?: string
  zoneId?: string
  districtId?: string
  limit?: number
}

export type AdminPromoAnalyticsResponse = {
  timeframe: { preset: AdminPromoAnalyticsPreset; start: string; end: string }
  summary: {
    totalRedemptions: number
    uniqueCustomers: number
    activeOffers: number
    totalDiscount: number
    ownerFundedDiscount: number
    platformFundedDiscount: number
    influencedRevenue: number
  }
  fundedBy: Array<{
    key: "owner" | "platform" | "shared"
    redemptions: number
    discount: number
  }>
  byType: Array<{ type: string; redemptions: number; discount: number }>
  offers: Array<{
    voucherId: string
    name: string
    code: string
    fundedBy: string
    createdByType: string
    scopeType: string
    restaurantName: string
    redemptions: number
    uniqueCustomers: number
    discount: number
    ownerFundedDiscount: number
    platformFundedDiscount: number
    influencedRevenue: number
    lastUsedAt: string | null
  }>
  topCustomers: Array<{
    customerId: string
    name: string
    phone: string
    redemptions: number
    discount: number
    distinctOffers: number
  }>
  pushPromos: Array<{
    voucherId: string
    name: string
    code: string
    title: string
    sentAt: string | null
    totalTargets: number
    sentCount: number
    openCount: number
    openRate: number
  }>
  trend: Array<{ date: string; redemptions: number; discount: number }>
}

function buildQueryString(params?: AdminPromoAnalyticsQueryParams) {
  const searchParams = new URLSearchParams()
  if (params?.preset) searchParams.set("preset", params.preset)
  if (params?.from) searchParams.set("from", params.from)
  if (params?.to) searchParams.set("to", params.to)
  if (params?.zoneId) searchParams.set("zoneId", params.zoneId)
  if (params?.districtId) searchParams.set("districtId", params.districtId)
  if (params?.limit) searchParams.set("limit", String(params.limit))
  return searchParams.toString() ? `?${searchParams.toString()}` : ""
}

export async function getAdminPromoAnalytics(
  params?: AdminPromoAnalyticsQueryParams
) {
  const response = await adminRequest<AdminPromoAnalyticsResponse>(
    `/admin/promo-analytics${buildQueryString(params)}`
  )
  return response.data
}
