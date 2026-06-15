import { adminRequest } from "./api"

export type AdminCustomerAnalyticsPreset =
  | "today"
  | "yesterday"
  | "last7Days"
  | "last30Days"
  | "last90Days"
  | "thisMonth"
  | "lastMonth"
  | "lifetime"
  | "custom"

export type AdminCustomerAnalyticsQueryParams = {
  preset?: AdminCustomerAnalyticsPreset
  from?: string
  to?: string
  limit?: number
}

export type AdminCustomerAnalyticsEventsQueryParams =
  AdminCustomerAnalyticsQueryParams & {
    eventType?: string
    actorType?: "all" | "guest" | "customer"
    search?: string
    customerId?: string
    anonymousId?: string
    sessionId?: string
    path?: string
    page?: number
    pageSize?: number
  }

export type AdminCustomerAnalyticsTimeframe = {
  preset: AdminCustomerAnalyticsPreset
  start: string
  end: string
}

export type AdminCustomerAnalyticsOverviewResponse = {
  timeframe: AdminCustomerAnalyticsTimeframe
  overview: {
    totalEvents: number
    uniqueSessions: number
    uniqueCustomers: number
    uniqueGuests: number
    pageViews: number
    restaurantViews: number
    menuItemViews: number
    cartViews: number
    cartAdds: number
    checkoutStarts: number
    signupStarted: number
    signupCompleted: number
    ordersCreated: number
    paymentInitiated: number
    paymentCompleted: number
    paymentFailed: number
    paymentCancelled: number
    searchEvents: number
    voucherApplied: number
    campaignOpens: number
    customEvents: number
    browseOnlySessions: number
    checkoutAbandonedSessions: number
    signupAbandonedVisitors: number
    registeredBrowseNoOrderCustomers: number
    checkoutConversionRate: number
    paymentCompletionRate: number
    signupCompletionRate: number
    lastEventAt: string | null
  }
  trend: Array<{
    date: string
    totalEvents: number
    pageViews: number
    restaurantViews: number
    cartAdds: number
    checkoutStarts: number
    signupStarted: number
    signupCompleted: number
    ordersCreated: number
    paymentInitiated: number
    paymentCompleted: number
  }>
  topPaths: Array<{
    path: string
    count: number
    guestCount: number
    customerCount: number
    lastSeenAt: string | null
  }>
  eventTypes: Array<{ label: string; count: number }>
  actorTypes: Array<{ label: string; count: number }>
  sourceApps: Array<{ label: string; count: number }>
  searchAnalytics: Array<{
    query: string
    scope: string
    restaurantId: string
    count: number
    zeroResultCount: number
    averageResults: number
    lastSeenAt: string | null
  }>
  attribution: Array<{
    source: string
    campaignId: string
    events: number
    checkouts: number
    orders: number
    checkoutRate: number
    orderRate: number
    lastSeenAt: string | null
  }>
  recentEvents: Array<{
    id: string
    eventType: string
    actorType: string
    customerId: string
    anonymousId: string
    sessionId: string
    path: string
    screenName: string
    entityType: string
    entityId: string
    occurredAt: string | null
    createdAt: string | null
    summary: string
  }>
  alerts: Array<{
    key: string
    severity: "info" | "warning" | "critical"
    title: string
    description: string
    metric: number
  }>
}

export type AdminCustomerAnalyticsFunnelsResponse = {
  timeframe: AdminCustomerAnalyticsTimeframe
  sessionSummary: {
    sessions: number
    browseOnlySessions: number
    checkoutAbandonedSessions: number
    signupAbandonedVisitors: number
    registeredBrowseNoOrderCustomers: number
    guestSessions: number
    customerSessions: number
  }
  sessionJourneys: Array<{
    sessionId: string
    actorType: string
    customerId: string
    anonymousId: string
    startPath: string
    lastPath: string
    firstSeenAt: string | null
    lastSeenAt: string | null
    eventCount: number
    pageViews: number
    checkoutStarts: number
    ordersCreated: number
    paymentFailures: number
    events: Array<{
      eventType: string
      path: string
      screenName: string
      entityType: string
      entityId: string
      occurredAt: string | null
    }>
  }>
  restaurantFunnels: Array<{
    restaurantId: string
    restaurantName: string
    views: number
    guestViews: number
    customerViews: number
    menuItemViews: number
    orders: number
    deliveredOrders: number
    revenue: number
    uniqueCustomers: number
    lastSeenAt: string | null
    lastOrderAt: string | null
    viewToOrderRate: number
  }>
  dropOffPaths: Array<{
    path: string
    sessions: number
    guestSessions: number
    customerSessions: number
    lastSeenAt: string | null
  }>
  searchAnalytics: AdminCustomerAnalyticsOverviewResponse["searchAnalytics"]
}

export type AdminCustomerAnalyticsCustomerRow = {
    customerId: string
    fullName: string
    phone: string
    status: string
    createdAt: string | null
    lastLoginAt: string | null
    lifetimeOrders: number
    deliveredOrders: number
    cancelledOrders: number
    lifetimeSpend: number
    averageOrderValue: number
    firstOrderAt: string | null
    lastOrderAt: string | null
    favoritePaymentMethod: string
    paymentMethods: Array<{ label: string; count: number }>
    recentOrders: Array<{
      orderId: string
      orderNumber: string
      restaurantId: string
      restaurantName: string
      status: string
      paymentMethod: string
      paymentStatus: string
      total: number
      createdAt: string | null
    }>
  }

export type AdminCustomerAnalyticsCustomersResponse = {
  timeframe: AdminCustomerAnalyticsTimeframe
  retention: {
    newCustomers: number
    orderedWithin1Day: number
    orderedWithin7Days: number
    orderedWithin30Days: number
    repeatCustomers: number
    day1OrderRate: number
    day7OrderRate: number
    day30OrderRate: number
  }
  recentUsers: AdminCustomerAnalyticsCustomerRow[]
  topOrderUsers: AdminCustomerAnalyticsCustomerRow[]
  repeatCustomers: AdminCustomerAnalyticsCustomerRow[]
  abandonedCheckouts: Array<{
    sessionId: string
    actorType: string
    customerId: string
    anonymousId: string
    fullName: string
    phone: string
    restaurantId: string
    restaurantName: string
    estimatedCartValue: number
    itemCount: number
    paymentMethod: string
    voucherCode: string
    repeatVisitor: boolean
    lifetimeOrders: number
    lifetimeSpend: number
    firstSeenAt: string | null
    lastSeenAt: string | null
    lastPath: string
    eventCount: number
    cartItems: Array<{
      itemId: string
      name: string
      quantity: number
      unitPrice: number
      total: number
    }>
  }>
  guestSessions: Array<{
    sessionId: string
    anonymousId: string
    lastPath: string
    firstSeenAt: string | null
    lastSeenAt: string | null
    eventCount: number
    checkoutStarts: number
    ordersCreated: number
  }>
}

export type AdminCustomerAnalyticsPaymentsResponse = {
  timeframe: AdminCustomerAnalyticsTimeframe
  paymentHealth: {
    initiated: number
    completed: number
    failed: number
    cancelled: number
    completionRate: number
    events: Array<{
      eventType: string
      provider: string
      count: number
    }>
    failureStages: Array<{ label: string; count: number }>
  }
  orderMethods: Array<{
    paymentMethod: string
    paymentStatus: string
    orders: number
    revenue: number
  }>
}

export type AdminCustomerAnalyticsEventsResponse = {
  timeframe: AdminCustomerAnalyticsTimeframe
  items: Array<{
    id: string
    eventType: string
    actorType: string
    customerId: string
    anonymousId: string
    sessionId: string
    sourceApp: string
    path: string
    screenName: string
    entityType: string
    entityId: string
    metadata: Record<string, unknown>
    occurredAt: string | null
    createdAt: string | null
    summary: string
  }>
  total: number
  page: number
  pageSize: number
  pageCount: number
  summary: {
    totalEvents: number
    uniqueSessions: number
    uniqueCustomers: number
    uniqueGuests: number
    lastEventAt: string | null
    eventTypes: Array<{ label: string; count: number }>
    actorTypes: Array<{ label: string; count: number }>
    topPaths: Array<{
      path: string
      count: number
      guestCount: number
      customerCount: number
      lastSeenAt: string | null
    }>
  }
}

export type AdminCustomerAnalyticsActorDetailResponse = {
  timeframe: AdminCustomerAnalyticsTimeframe
  actorType: "customer" | "guest"
  customerId: string
  anonymousId: string
  fullName: string
  phone: string
  status: string
  createdAt: string | null
  lastLoginAt: string | null
  lifetimeOrders: number
  timeframeOrders: number
  deliveredOrders: number
  cancelledOrders: number
  lifetimeSpend: number
  timeframeSpend: number
  averageOrderValue: number
  firstOrderAt: string | null
  lastOrderAt: string | null
  favoritePaymentMethod: string
  paymentMethods: Array<{ label: string; count: number }>
  topRestaurants: Array<{
    restaurantId: string
    restaurantName: string
    orders: number
    revenue: number
  }>
  orderTrend: Array<{
    date: string
    orders: number
    revenue: number
  }>
  recentOrders: Array<{
    orderId: string
    orderNumber: string
    restaurantId: string
    restaurantName: string
    status: string
    paymentMethod: string
    paymentStatus: string
    total: number
    createdAt: string | null
  }>
  recentActivities: Array<{
    eventType: string
    path: string
    screenName: string
    entityType: string
    entityId: string
    occurredAt: string | null
  }>
}

function buildQueryString(params?: AdminCustomerAnalyticsQueryParams) {
  const searchParams = new URLSearchParams()
  if (params?.preset) searchParams.set("preset", params.preset)
  if (params?.from) searchParams.set("from", params.from)
  if (params?.to) searchParams.set("to", params.to)
  if (params?.limit) searchParams.set("limit", String(params.limit))
  return searchParams.toString() ? `?${searchParams.toString()}` : ""
}

function buildEventsQueryString(params?: AdminCustomerAnalyticsEventsQueryParams) {
  const searchParams = new URLSearchParams()
  if (params?.preset) searchParams.set("preset", params.preset)
  if (params?.from) searchParams.set("from", params.from)
  if (params?.to) searchParams.set("to", params.to)
  if (params?.limit) searchParams.set("limit", String(params.limit))
  if (params?.eventType && params.eventType !== "all") {
    searchParams.set("eventType", params.eventType)
  }
  if (params?.actorType && params.actorType !== "all") {
    searchParams.set("actorType", params.actorType)
  }
  if (params?.search) searchParams.set("search", params.search)
  if (params?.customerId) searchParams.set("customerId", params.customerId)
  if (params?.anonymousId) searchParams.set("anonymousId", params.anonymousId)
  if (params?.sessionId) searchParams.set("sessionId", params.sessionId)
  if (params?.path) searchParams.set("path", params.path)
  if (params?.page) searchParams.set("page", String(params.page))
  if (params?.pageSize) searchParams.set("pageSize", String(params.pageSize))
  return searchParams.toString() ? `?${searchParams.toString()}` : ""
}

export async function getAdminCustomerAnalyticsOverview(params?: AdminCustomerAnalyticsQueryParams) {
  const response = await adminRequest<AdminCustomerAnalyticsOverviewResponse>(
    `/admin/customer-analytics/overview${buildQueryString(params)}`,
  )
  return response.data
}

export async function getAdminCustomerAnalyticsFunnels(params?: AdminCustomerAnalyticsQueryParams) {
  const response = await adminRequest<AdminCustomerAnalyticsFunnelsResponse>(
    `/admin/customer-analytics/funnels${buildQueryString(params)}`,
  )
  return response.data
}

export async function getAdminCustomerAnalyticsCustomers(params?: AdminCustomerAnalyticsQueryParams) {
  const response = await adminRequest<AdminCustomerAnalyticsCustomersResponse>(
    `/admin/customer-analytics/customers${buildQueryString(params)}`,
  )
  return response.data
}

export async function getAdminCustomerAnalyticsPayments(params?: AdminCustomerAnalyticsQueryParams) {
  const response = await adminRequest<AdminCustomerAnalyticsPaymentsResponse>(
    `/admin/customer-analytics/payments${buildQueryString(params)}`,
  )
  return response.data
}

export async function getAdminCustomerAnalyticsEvents(params?: AdminCustomerAnalyticsEventsQueryParams) {
  const response = await adminRequest<AdminCustomerAnalyticsEventsResponse>(
    `/admin/customer-analytics/events${buildEventsQueryString(params)}`,
  )
  return response.data
}

export async function getAdminCustomerAnalyticsActorDetail(params: AdminCustomerAnalyticsQueryParams & {
  customerId?: string
  anonymousId?: string
}) {
  const searchParams = new URLSearchParams()
  if (params.preset) searchParams.set("preset", params.preset)
  if (params.from) searchParams.set("from", params.from)
  if (params.to) searchParams.set("to", params.to)
  if (params.limit) searchParams.set("limit", String(params.limit))
  if (params.customerId) searchParams.set("customerId", params.customerId)
  if (params.anonymousId) searchParams.set("anonymousId", params.anonymousId)
  const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const response = await adminRequest<AdminCustomerAnalyticsActorDetailResponse>(
    `/admin/customer-analytics/actor-detail${query}`,
  )
  return response.data
}
