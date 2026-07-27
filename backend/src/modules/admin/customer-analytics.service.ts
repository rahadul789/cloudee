import { isValidObjectId } from "mongoose"

import { createInMemoryAsyncCache } from "../../common/utils/in-memory-cache"
import { CustomerAnalyticsEventModel } from "../customer/customer-analytics.model"
import { CustomerModel } from "../customer/customer.model"
import { OrderModel } from "../owner/operational.model"
import { RestaurantModel } from "../auth/auth.model"
import {
  buildOrderServiceAreaScopeFilter,
  buildRestaurantServiceAreaScopeFilter,
} from "../service-area/service-area.service"

type AnalyticsRow = Record<string, any>

type AnalyticsPreset =
  | "today"
  | "yesterday"
  | "last7Days"
  | "last30Days"
  | "last90Days"
  | "thisMonth"
  | "lastMonth"
  | "lifetime"
  | "custom"

type AnalyticsRange = {
  preset: AnalyticsPreset
  start: Date
  end: Date
}

export type AdminCustomerAnalyticsQuery = {
  preset?: AnalyticsPreset
  from?: string
  to?: string
  limit?: number
  zoneId?: string
  districtId?: string
}

export type AdminCustomerAnalyticsEventsQuery = AdminCustomerAnalyticsQuery & {
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
  preset: AnalyticsPreset
  start: string
  end: string
}

type CountRow = {
  label: string
  count: number
}

type SearchAnalyticsRow = {
  query: string
  scope: string
  restaurantId: string
  count: number
  zeroResultCount: number
  averageResults: number
  lastSeenAt: string | null
}

type AttributionRow = {
  source: string
  campaignId: string
  events: number
  checkouts: number
  orders: number
  checkoutRate: number
  orderRate: number
  lastSeenAt: string | null
}

type RecentEventRow = {
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
}

type EventsExplorerRow = RecentEventRow & {
  sourceApp: string
  metadata: Record<string, unknown>
}

type EventsExplorerResponse = {
  timeframe: AdminCustomerAnalyticsTimeframe
  items: EventsExplorerRow[]
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
    eventTypes: CountRow[]
    actorTypes: CountRow[]
    topPaths: TopPathRow[]
  }
}

type TopPathRow = {
  path: string
  count: number
  guestCount: number
  customerCount: number
  lastSeenAt: string | null
}

type OverviewResponse = {
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
  topPaths: TopPathRow[]
  eventTypes: CountRow[]
  actorTypes: CountRow[]
  sourceApps: CountRow[]
  searchAnalytics: SearchAnalyticsRow[]
  attribution: AttributionRow[]
  recentEvents: RecentEventRow[]
  alerts: Array<{
    key: string
    severity: "info" | "warning" | "critical"
    title: string
    description: string
    metric: number
  }>
}

type SessionJourneyRow = {
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
}

type RestaurantFunnelRow = {
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
}

type FunnelResponse = {
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
  sessionJourneys: SessionJourneyRow[]
  restaurantFunnels: RestaurantFunnelRow[]
  dropOffPaths: Array<{
    path: string
    sessions: number
    guestSessions: number
    customerSessions: number
    lastSeenAt: string | null
  }>
  searchAnalytics: SearchAnalyticsRow[]
}

type CustomerRow = {
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
  paymentMethods: CountRow[]
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

type AbandonedCheckoutRow = {
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
}

type CustomersResponse = {
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
  recentUsers: CustomerRow[]
  topOrderUsers: CustomerRow[]
  repeatCustomers: CustomerRow[]
  abandonedCheckouts: AbandonedCheckoutRow[]
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

type PaymentsResponse = {
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
    failureStages: CountRow[]
  }
  orderMethods: Array<{
    paymentMethod: string
    paymentStatus: string
    orders: number
    revenue: number
  }>
}

type ActorDetailResponse = {
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
  paymentMethods: CountRow[]
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

const ANALYTICS_SOURCE_APP = "customer-app"
const DEFAULT_LIMIT = 20

const overviewCache = createInMemoryAsyncCache<OverviewResponse>({
  ttlMs: 20_000,
  staleWhileRevalidateMs: 60_000,
  maxEntries: 24,
})
const funnelCache = createInMemoryAsyncCache<FunnelResponse>({
  ttlMs: 20_000,
  staleWhileRevalidateMs: 60_000,
  maxEntries: 24,
})
const customerCache = createInMemoryAsyncCache<CustomersResponse>({
  ttlMs: 20_000,
  staleWhileRevalidateMs: 60_000,
  maxEntries: 24,
})
const paymentsCache = createInMemoryAsyncCache<PaymentsResponse>({
  ttlMs: 20_000,
  staleWhileRevalidateMs: 60_000,
  maxEntries: 24,
})
const actorDetailCache = createInMemoryAsyncCache<ActorDetailResponse>({
  ttlMs: 15_000,
  staleWhileRevalidateMs: 45_000,
  maxEntries: 24,
})

function toIso(value: unknown) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function countValue(value: unknown) {
  const number = Number(value ?? 0)
  return Number.isFinite(number) ? number : 0
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value)
}

function displayOrderPaymentStatus(order: Record<string, any>) {
  const status = stringValue(order.status)
  const paymentMethod = stringValue(order.paymentMethod) || "Cash"
  const paymentStatus = stringValue(order.paymentStatus) || "pending"
  if (
    ["Cancelled", "Rejected"].includes(status) &&
    paymentMethod === "Cash" &&
    paymentStatus !== "paid"
  ) {
    return "cancelled"
  }
  return paymentStatus
}

function normalizeLimit(value?: number) {
  return Math.min(100, Math.max(5, value ?? DEFAULT_LIMIT))
}

function normalizePage(value?: number) {
  return Math.max(1, Math.floor(value ?? 1))
}

function normalizePageSize(value?: number) {
  return Math.min(100, Math.max(5, Math.floor(value ?? 25)))
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function startOfDay(value: Date) {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

function startOfMonth(value: Date) {
  const date = new Date(value)
  date.setDate(1)
  date.setHours(0, 0, 0, 0)
  return date
}

function endOfMonth(value: Date) {
  const date = new Date(value)
  date.setMonth(date.getMonth() + 1, 0)
  date.setHours(23, 59, 59, 999)
  return date
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10)
}

function eachTrendDate(range: AnalyticsRange) {
  const days = Math.ceil((range.end.getTime() - range.start.getTime()) / (24 * 60 * 60 * 1000))
  if (days > 90) return null
  const dates: string[] = []
  const cursor = startOfDay(range.start)
  const end = startOfDay(range.end)
  while (cursor.getTime() <= end.getTime()) {
    dates.push(dateKey(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

function resolveRange(params: AdminCustomerAnalyticsQuery): AnalyticsRange {
  const now = new Date()
  const preset = params.preset ?? "last30Days"

  if (preset === "custom") {
    const from = params.from ? new Date(params.from) : null
    const to = params.to ? new Date(params.to) : null
    if (from && !Number.isNaN(from.getTime()) && to && !Number.isNaN(to.getTime())) {
      return { preset, start: from, end: to }
    }
  }

  if (preset === "today") {
    return { preset, start: startOfDay(now), end: now }
  }
  if (preset === "yesterday") {
    const start = startOfDay(new Date(now.getTime() - 24 * 60 * 60 * 1000))
    const end = new Date(start)
    end.setHours(23, 59, 59, 999)
    return { preset, start, end }
  }
  if (preset === "last7Days") {
    return { preset, start: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000), end: now }
  }
  if (preset === "last90Days") {
    return { preset, start: new Date(now.getTime() - 89 * 24 * 60 * 60 * 1000), end: now }
  }
  if (preset === "thisMonth") {
    return { preset, start: startOfMonth(now), end: now }
  }
  if (preset === "lastMonth") {
    const start = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1))
    const end = endOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1))
    return { preset, start, end }
  }
  if (preset === "lifetime") {
    return {
      preset,
      start: new Date("2020-01-01T00:00:00.000Z"),
      end: now,
    }
  }

  return { preset: "last30Days", start: new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000), end: now }
}

function makeMatch(range: AnalyticsRange) {
  return {
    sourceApp: ANALYTICS_SOURCE_APP,
    occurredAt: {
      $gte: range.start,
      $lte: range.end,
    },
  }
}

function hasAreaScope(params: { zoneId?: string; districtId?: string }) {
  return Boolean(params.zoneId?.trim() || params.districtId?.trim())
}

async function buildAnalyticsScopeCondition(params: {
  zoneId?: string
  districtId?: string
}) {
  if (!hasAreaScope(params)) return null
  const orderScopeFilter = buildOrderServiceAreaScopeFilter(params)
  const restaurantScopeFilter = buildRestaurantServiceAreaScopeFilter(params)
  const [orders, restaurants] = await Promise.all([
    Object.keys(orderScopeFilter).length
      ? OrderModel.find(orderScopeFilter)
          .select({ _id: 1, customerId: 1, restaurantId: 1 })
          .limit(10000)
          .lean()
      : Promise.resolve([]),
    Object.keys(restaurantScopeFilter).length
      ? RestaurantModel.find(restaurantScopeFilter).select({ _id: 1 }).lean()
      : Promise.resolve([]),
  ])
  const orderIds = orders.map((order) => stringValue(order._id)).filter(Boolean)
  const customerIds = [
    ...new Set(orders.map((order) => stringValue(order.customerId)).filter(Boolean)),
  ]
  const restaurantIds = [
    ...new Set([
      ...restaurants.map((restaurant) => stringValue(restaurant._id)).filter(Boolean),
      ...orders.map((order) => stringValue(order.restaurantId)).filter(Boolean),
    ]),
  ]

  const conditions: AnalyticsRow[] = []
  if (params.zoneId) {
    conditions.push(
      { "metadata.serviceArea.zoneId": params.zoneId },
      { "metadata.serviceAreaSnapshot.zoneId": params.zoneId },
      { "metadata.zoneId": params.zoneId },
    )
  }
  if (params.districtId) {
    conditions.push(
      { "metadata.serviceArea.districtId": params.districtId },
      { "metadata.serviceAreaSnapshot.districtId": params.districtId },
      { "metadata.districtId": params.districtId },
    )
  }
  if (customerIds.length) conditions.push({ customerId: { $in: customerIds } })
  if (restaurantIds.length) {
    conditions.push(
      { entityType: "restaurant", entityId: { $in: restaurantIds } },
      { "metadata.restaurantId": { $in: restaurantIds } },
    )
  }
  if (orderIds.length) {
    conditions.push(
      { entityType: "order", entityId: { $in: orderIds } },
      { "metadata.orderId": { $in: orderIds } },
    )
  }

  return conditions.length ? { $or: conditions } : { _id: { $exists: false } }
}

async function buildScopedAnalyticsMatch(
  match: AnalyticsRow,
  params: AdminCustomerAnalyticsQuery,
) {
  const scopeCondition = await buildAnalyticsScopeCondition(params)
  if (!scopeCondition) return match
  return {
    ...match,
    $and: [...(Array.isArray(match.$and) ? match.$and : []), scopeCondition],
  }
}

function buildTimeframe(range: AnalyticsRange): AdminCustomerAnalyticsTimeframe {
  return {
    preset: range.preset,
    start: range.start.toISOString(),
    end: range.end.toISOString(),
  }
}

function buildCacheKey(...parts: Array<string | number | boolean | null | undefined>) {
  return parts.map((part) => String(part ?? "")).join("|")
}

function cacheScopeKey(params: { zoneId?: string; districtId?: string }) {
  return params.zoneId ? `zone:${params.zoneId}` : params.districtId ? `district:${params.districtId}` : "all"
}

function buildAlert(key: string, severity: "info" | "warning" | "critical", title: string, description: string, metric: number) {
  return { key, severity, title, description, metric }
}

async function countDistinct(field: string, match: AnalyticsRow) {
  const values = await CustomerAnalyticsEventModel.distinct(field, match)
  return values.filter(Boolean).length
}

function buildEventSummaryText(event: AnalyticsRow) {
  const eventType = stringValue(event.eventType)
  if (eventType === "search") {
    return `Search: ${stringValue((event.metadata as AnalyticsRow | undefined)?.query)}`
  }
  if (eventType === "payment_failed" || eventType === "payment_cancelled") {
    return `${eventType.replaceAll("_", " ")}`
  }
  if (eventType === "checkout_start") {
    return `Checkout start`
  }

  return eventType.replaceAll("_", " ")
}

function buildEventsExplorerMatch(range: AnalyticsRange, params: AdminCustomerAnalyticsEventsQuery) {
  const match: AnalyticsRow = makeMatch(range)
  const andConditions: AnalyticsRow[] = []

  if (params.eventType && params.eventType !== "all") {
    match.eventType = params.eventType
  }
  if (params.actorType && params.actorType !== "all") {
    match.actorType = params.actorType
  }
  if (params.customerId) {
    match.customerId = params.customerId
  }
  if (params.anonymousId) {
    match.anonymousId = params.anonymousId
  }
  if (params.sessionId) {
    match.sessionId = params.sessionId
  }
  if (params.path) {
    andConditions.push({ path: { $regex: new RegExp(escapeRegex(params.path), "i") } })
  }
  if (params.search) {
    const regex = new RegExp(escapeRegex(params.search), "i")
    andConditions.push({
      $or: [
        { eventType: regex },
        { actorType: regex },
        { customerId: regex },
        { anonymousId: regex },
        { sessionId: regex },
        { path: regex },
        { screenName: regex },
        { entityType: regex },
        { entityId: regex },
      ],
    })
  }
  if (andConditions.length) {
    match.$and = andConditions
  }

  return match
}

function addNonEmptyDistinctFilter(match: AnalyticsRow, field: string) {
  if (Object.prototype.hasOwnProperty.call(match, field)) return match
  return { ...match, [field]: { $ne: "" } }
}

async function buildEventsExplorer(params: AdminCustomerAnalyticsEventsQuery = {}): Promise<EventsExplorerResponse> {
  const range = resolveRange(params)
  const match = await buildScopedAnalyticsMatch(
    buildEventsExplorerMatch(range, params),
    params,
  )
  const page = normalizePage(params.page)
  const pageSize = normalizePageSize(params.pageSize)

  const [
    items,
    total,
    summaryRows,
    eventTypeRows,
    actorTypeRows,
    topPathRows,
    uniqueSessions,
    uniqueCustomers,
    uniqueGuests,
  ] = await Promise.all([
    CustomerAnalyticsEventModel.find(match)
      .sort({ occurredAt: -1, createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .select({
        eventType: 1,
        actorType: 1,
        customerId: 1,
        anonymousId: 1,
        sessionId: 1,
        sourceApp: 1,
        path: 1,
        screenName: 1,
        entityType: 1,
        entityId: 1,
        metadata: 1,
        occurredAt: 1,
        createdAt: 1,
      })
      .lean()
      .exec(),
    CustomerAnalyticsEventModel.countDocuments(match),
    CustomerAnalyticsEventModel.aggregate<any>([
      { $match: match },
      {
        $group: {
          _id: null,
          totalEvents: { $sum: 1 },
          lastEventAt: { $max: "$occurredAt" },
        },
      },
    ]),
    CustomerAnalyticsEventModel.aggregate<any>([
      { $match: match },
      { $group: { _id: "$eventType", count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 20 },
    ]),
    CustomerAnalyticsEventModel.aggregate<any>([
      { $match: match },
      { $group: { _id: "$actorType", count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
    ]),
    CustomerAnalyticsEventModel.aggregate<any>([
      { $match: match },
      {
        $group: {
          _id: "$path",
          count: { $sum: 1 },
          guestCount: { $sum: { $cond: [{ $eq: ["$actorType", "guest"] }, 1, 0] } },
          customerCount: { $sum: { $cond: [{ $eq: ["$actorType", "customer"] }, 1, 0] } },
          lastSeenAt: { $max: "$occurredAt" },
        },
      },
      { $sort: { count: -1, lastSeenAt: -1 } },
      { $limit: 12 },
    ]),
    countDistinct("sessionId", match),
    countDistinct("customerId", addNonEmptyDistinctFilter(match, "customerId")),
    countDistinct("anonymousId", addNonEmptyDistinctFilter(match, "anonymousId")),
  ])

  const summary = summaryRows[0] ?? {}

  return {
    timeframe: buildTimeframe(range),
    items: items.map((event) => ({
      id: String(event._id ?? ""),
      eventType: stringValue(event.eventType),
      actorType: stringValue(event.actorType),
      customerId: stringValue(event.customerId),
      anonymousId: stringValue(event.anonymousId),
      sessionId: stringValue(event.sessionId),
      sourceApp: stringValue(event.sourceApp),
      path: stringValue(event.path),
      screenName: stringValue(event.screenName),
      entityType: stringValue(event.entityType),
      entityId: stringValue(event.entityId),
      metadata:
        event.metadata && typeof event.metadata === "object"
          ? (event.metadata as Record<string, unknown>)
          : {},
      occurredAt: toIso(event.occurredAt),
      createdAt: toIso(event.createdAt),
      summary: buildEventSummaryText(event),
    })),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    summary: {
      totalEvents: countValue(summary.totalEvents),
      uniqueSessions,
      uniqueCustomers,
      uniqueGuests,
      lastEventAt: toIso(summary.lastEventAt),
      eventTypes: eventTypeRows.map((row) => ({
        label: stringValue(row._id),
        count: countValue(row.count),
      })),
      actorTypes: actorTypeRows.map((row) => ({
        label: stringValue(row._id),
        count: countValue(row.count),
      })),
      topPaths: topPathRows.map((row) => ({
        path: stringValue(row._id),
        count: countValue(row.count),
        guestCount: countValue(row.guestCount),
        customerCount: countValue(row.customerCount),
        lastSeenAt: toIso(row.lastSeenAt),
      })),
    },
  }
}

async function buildOverview(params: AdminCustomerAnalyticsQuery): Promise<OverviewResponse> {
  const range = resolveRange(params)
  const match = await buildScopedAnalyticsMatch(makeMatch(range), params)

  const [
    summaryRows,
    trendRows,
    topPathRows,
    eventTypeRows,
    actorTypeRows,
    sourceAppRows,
    searchRows,
    attributionRows,
    recentEvents,
    sessionSummaryRows,
    uniqueSessions,
    uniqueCustomers,
    uniqueGuests,
  ] = (await Promise.all([
    CustomerAnalyticsEventModel.aggregate<any>([
      { $match: match },
      {
        $group: {
          _id: null,
          totalEvents: { $sum: 1 },
          pageViews: { $sum: { $cond: [{ $eq: ["$eventType", "page_view"] }, 1, 0] } },
          restaurantViews: { $sum: { $cond: [{ $eq: ["$eventType", "restaurant_view"] }, 1, 0] } },
          menuItemViews: { $sum: { $cond: [{ $eq: ["$eventType", "menu_item_view"] }, 1, 0] } },
          cartViews: { $sum: { $cond: [{ $eq: ["$eventType", "cart_view"] }, 1, 0] } },
          cartAdds: { $sum: { $cond: [{ $eq: ["$eventType", "cart_add"] }, 1, 0] } },
          checkoutStarts: { $sum: { $cond: [{ $eq: ["$eventType", "checkout_start"] }, 1, 0] } },
          signupStarted: { $sum: { $cond: [{ $eq: ["$eventType", "signup_started"] }, 1, 0] } },
          signupCompleted: { $sum: { $cond: [{ $eq: ["$eventType", "signup_completed"] }, 1, 0] } },
          ordersCreated: { $sum: { $cond: [{ $eq: ["$eventType", "order_created"] }, 1, 0] } },
          paymentInitiated: { $sum: { $cond: [{ $eq: ["$eventType", "payment_initiated"] }, 1, 0] } },
          paymentCompleted: { $sum: { $cond: [{ $eq: ["$eventType", "payment_completed"] }, 1, 0] } },
          paymentFailed: { $sum: { $cond: [{ $eq: ["$eventType", "payment_failed"] }, 1, 0] } },
          paymentCancelled: { $sum: { $cond: [{ $eq: ["$eventType", "payment_cancelled"] }, 1, 0] } },
          searchEvents: { $sum: { $cond: [{ $eq: ["$eventType", "search"] }, 1, 0] } },
          voucherApplied: { $sum: { $cond: [{ $eq: ["$eventType", "voucher_applied"] }, 1, 0] } },
          campaignOpens: { $sum: { $cond: [{ $eq: ["$eventType", "campaign_open"] }, 1, 0] } },
          customEvents: { $sum: { $cond: [{ $eq: ["$eventType", "custom"] }, 1, 0] } },
          lastEventAt: { $max: "$occurredAt" },
        },
      },
    ]),
    CustomerAnalyticsEventModel.aggregate<any>([
      { $match: match },
      {
        $group: {
          _id: { date: { $dateToString: { format: "%Y-%m-%d", date: "$occurredAt" } } },
          totalEvents: { $sum: 1 },
          pageViews: { $sum: { $cond: [{ $eq: ["$eventType", "page_view"] }, 1, 0] } },
          restaurantViews: { $sum: { $cond: [{ $eq: ["$eventType", "restaurant_view"] }, 1, 0] } },
          cartAdds: { $sum: { $cond: [{ $eq: ["$eventType", "cart_add"] }, 1, 0] } },
          checkoutStarts: { $sum: { $cond: [{ $eq: ["$eventType", "checkout_start"] }, 1, 0] } },
          signupStarted: { $sum: { $cond: [{ $eq: ["$eventType", "signup_started"] }, 1, 0] } },
          signupCompleted: { $sum: { $cond: [{ $eq: ["$eventType", "signup_completed"] }, 1, 0] } },
          ordersCreated: { $sum: { $cond: [{ $eq: ["$eventType", "order_created"] }, 1, 0] } },
          paymentInitiated: { $sum: { $cond: [{ $eq: ["$eventType", "payment_initiated"] }, 1, 0] } },
          paymentCompleted: { $sum: { $cond: [{ $eq: ["$eventType", "payment_completed"] }, 1, 0] } },
        },
      },
      { $sort: { "_id.date": 1 } },
    ]),
    CustomerAnalyticsEventModel.aggregate<any>([
      { $match: match },
      {
        $group: {
          _id: "$path",
          count: { $sum: 1 },
          guestCount: { $sum: { $cond: [{ $eq: ["$actorType", "guest"] }, 1, 0] } },
          customerCount: { $sum: { $cond: [{ $eq: ["$actorType", "customer"] }, 1, 0] } },
          lastSeenAt: { $max: "$occurredAt" },
        },
      },
      { $sort: { count: -1, lastSeenAt: -1 } },
      { $limit: 12 },
    ]),
    CustomerAnalyticsEventModel.aggregate<any>([
      { $match: match },
      { $group: { _id: "$eventType", count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
    ]),
    CustomerAnalyticsEventModel.aggregate<any>([
      { $match: match },
      { $group: { _id: "$actorType", count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
    ]),
    CustomerAnalyticsEventModel.aggregate<any>([
      { $match: match },
      { $group: { _id: "$sourceApp", count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
    ]),
    CustomerAnalyticsEventModel.aggregate<any>([
      { $match: { ...match, eventType: "search" } },
      {
        $group: {
          _id: {
            query: { $ifNull: ["$metadata.query", ""] },
            scope: { $ifNull: ["$metadata.scope", "unknown"] },
            restaurantId: { $ifNull: ["$metadata.restaurantId", ""] },
          },
          count: { $sum: 1 },
          zeroResultCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: [{ $ifNull: ["$metadata.hasResults", true] }, false] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          averageResults: { $avg: { $ifNull: ["$metadata.resultCount", 0] } },
          lastSeenAt: { $max: "$occurredAt" },
        },
      },
      { $sort: { count: -1, lastSeenAt: -1 } },
      { $limit: 12 },
    ]),
    CustomerAnalyticsEventModel.aggregate<any>([
      {
        $match: {
          ...match,
          "metadata.attribution.source": { $type: "string", $ne: "" },
        },
      },
      {
        $group: {
          _id: {
            source: { $ifNull: ["$metadata.attribution.source", "unknown"] },
            campaignId: { $ifNull: ["$metadata.attribution.campaignId", ""] },
          },
          events: { $sum: 1 },
          checkouts: { $sum: { $cond: [{ $eq: ["$eventType", "checkout_start"] }, 1, 0] } },
          orders: { $sum: { $cond: [{ $eq: ["$eventType", "order_created"] }, 1, 0] } },
          lastSeenAt: { $max: "$occurredAt" },
        },
      },
      { $sort: { events: -1, lastSeenAt: -1 } },
      { $limit: 10 },
    ]),
    CustomerAnalyticsEventModel.find(match)
      .sort({ occurredAt: -1 })
      .limit(50)
      .select({
        eventType: 1,
        actorType: 1,
        customerId: 1,
        anonymousId: 1,
        sessionId: 1,
        path: 1,
        screenName: 1,
        entityType: 1,
        entityId: 1,
        occurredAt: 1,
        createdAt: 1,
        metadata: 1,
      })
      .lean()
      .exec(),
    CustomerAnalyticsEventModel.aggregate<any>([
      { $match: { ...match, sessionId: { $ne: "" } } },
      { $sort: { sessionId: 1, occurredAt: 1 } },
      {
        $group: {
          _id: "$sessionId",
          pageViews: { $sum: { $cond: [{ $eq: ["$eventType", "page_view"] }, 1, 0] } },
          checkoutStarts: { $sum: { $cond: [{ $eq: ["$eventType", "checkout_start"] }, 1, 0] } },
          signupStarted: { $sum: { $cond: [{ $eq: ["$eventType", "signup_started"] }, 1, 0] } },
          signupCompleted: { $sum: { $cond: [{ $eq: ["$eventType", "signup_completed"] }, 1, 0] } },
          ordersCreated: { $sum: { $cond: [{ $eq: ["$eventType", "order_created"] }, 1, 0] } },
        },
      },
      {
        $group: {
          _id: null,
          sessions: { $sum: 1 },
          browseOnlySessions: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gt: ["$pageViews", 0] },
                    { $eq: ["$checkoutStarts", 0] },
                    { $eq: ["$ordersCreated", 0] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          checkoutAbandonedSessions: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gt: ["$checkoutStarts", 0] },
                    { $eq: ["$ordersCreated", 0] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          signupAbandonedVisitors: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gt: ["$signupStarted", 0] },
                    { $eq: ["$signupCompleted", 0] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          registeredBrowseNoOrderCustomers: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gt: ["$pageViews", 0] },
                    { $eq: ["$ordersCreated", 0] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
    countDistinct("sessionId", match),
    countDistinct("customerId", { ...match, customerId: { $ne: "" } }),
    countDistinct("anonymousId", { ...match, anonymousId: { $ne: "" } }),
  ])) as [
    AnalyticsRow[],
    AnalyticsRow[],
    AnalyticsRow[],
    AnalyticsRow[],
    AnalyticsRow[],
    AnalyticsRow[],
    AnalyticsRow[],
    AnalyticsRow[],
    AnalyticsRow[],
    AnalyticsRow[],
    number,
    number,
    number,
  ]

  const summary = summaryRows[0] ?? {}
  const sessionSummary = sessionSummaryRows[0] ?? {}
  const totalEvents = countValue(summary.totalEvents)
  const checkoutStarts = countValue(summary.checkoutStarts)
  const ordersCreated = countValue(summary.ordersCreated)
  const paymentInitiated = countValue(summary.paymentInitiated)
  const paymentCompleted = countValue(summary.paymentCompleted)
  const signupStarted = countValue(summary.signupStarted)
  const signupCompleted = countValue(summary.signupCompleted)
  const browseOnlySessions = countValue(sessionSummary.browseOnlySessions)
  const checkoutAbandonedSessions = countValue(sessionSummary.checkoutAbandonedSessions)
  const signupAbandonedVisitors = countValue(sessionSummary.signupAbandonedVisitors)

  const alerts = [
    checkoutStarts >= 10 && ordersCreated / Math.max(checkoutStarts, 1) < 0.4
      ? buildAlert(
          "checkout_conversion_low",
          "warning",
          "Checkout conversion is soft",
          "Too many users are starting checkout without finishing an order.",
          ordersCreated,
        )
      : null,
    paymentInitiated >= 10 && paymentCompleted / Math.max(paymentInitiated, 1) < 0.7
      ? buildAlert(
          "payment_completion_low",
          "critical",
          "Payment completion is weak",
          "Payment initiation is outpacing successful completion.",
          paymentCompleted,
        )
      : null,
    signupStarted >= 5 && signupCompleted / Math.max(signupStarted, 1) < 0.75
      ? buildAlert(
          "signup_completion_low",
          "info",
          "Signup completion is slipping",
          "Some users are starting auth but not finishing registration.",
          signupCompleted,
        )
      : null,
  ].filter(Boolean) as NonNullable<OverviewResponse["alerts"]>

  return {
    timeframe: buildTimeframe(range),
    overview: {
      totalEvents,
      uniqueSessions,
      uniqueCustomers,
      uniqueGuests,
      pageViews: countValue(summary.pageViews),
      restaurantViews: countValue(summary.restaurantViews),
      menuItemViews: countValue(summary.menuItemViews),
      cartViews: countValue(summary.cartViews),
      cartAdds: countValue(summary.cartAdds),
      checkoutStarts,
      signupStarted,
      signupCompleted,
      ordersCreated,
      paymentInitiated,
      paymentCompleted,
      paymentFailed: countValue(summary.paymentFailed),
      paymentCancelled: countValue(summary.paymentCancelled),
      searchEvents: countValue(summary.searchEvents),
      voucherApplied: countValue(summary.voucherApplied),
      campaignOpens: countValue(summary.campaignOpens),
      customEvents: countValue(summary.customEvents),
      browseOnlySessions,
      checkoutAbandonedSessions,
      signupAbandonedVisitors,
      registeredBrowseNoOrderCustomers: countValue(sessionSummary.registeredBrowseNoOrderCustomers),
      checkoutConversionRate: checkoutStarts > 0 ? Math.round((ordersCreated / checkoutStarts) * 100) : 0,
      paymentCompletionRate: paymentInitiated > 0 ? Math.round((paymentCompleted / paymentInitiated) * 100) : 0,
      signupCompletionRate: signupStarted > 0 ? Math.round((signupCompleted / signupStarted) * 100) : 0,
      lastEventAt: toIso(summary.lastEventAt),
    },
    trend: (() => {
      const trendMap = new Map(
        trendRows.map((row) => [
          stringValue((row as AnalyticsRow)._id?.date),
          {
            date: stringValue((row as AnalyticsRow)._id?.date),
            totalEvents: countValue((row as AnalyticsRow).totalEvents),
            pageViews: countValue((row as AnalyticsRow).pageViews),
            restaurantViews: countValue((row as AnalyticsRow).restaurantViews),
            cartAdds: countValue((row as AnalyticsRow).cartAdds),
            checkoutStarts: countValue((row as AnalyticsRow).checkoutStarts),
            signupStarted: countValue((row as AnalyticsRow).signupStarted),
            signupCompleted: countValue((row as AnalyticsRow).signupCompleted),
            ordersCreated: countValue((row as AnalyticsRow).ordersCreated),
            paymentInitiated: countValue((row as AnalyticsRow).paymentInitiated),
            paymentCompleted: countValue((row as AnalyticsRow).paymentCompleted),
          },
        ]),
      )
      return (eachTrendDate(range) ?? [...trendMap.keys()]).map(
        (date) =>
          trendMap.get(date) ?? {
            date,
            totalEvents: 0,
            pageViews: 0,
            restaurantViews: 0,
            cartAdds: 0,
            checkoutStarts: 0,
            signupStarted: 0,
            signupCompleted: 0,
            ordersCreated: 0,
            paymentInitiated: 0,
            paymentCompleted: 0,
          },
      )
    })(),
    topPaths: topPathRows.map((row) => ({
      path: stringValue(row._id),
      count: countValue(row.count),
      guestCount: countValue((row as AnalyticsRow).guestCount),
      customerCount: countValue((row as AnalyticsRow).customerCount),
      lastSeenAt: toIso((row as AnalyticsRow).lastSeenAt),
    })),
    eventTypes: eventTypeRows.map((row) => ({
      label: stringValue(row._id).replaceAll("_", " "),
      count: countValue(row.count),
    })),
    actorTypes: actorTypeRows.map((row) => ({
      label: stringValue(row._id),
      count: countValue(row.count),
    })),
    sourceApps: sourceAppRows.map((row) => ({
      label: stringValue(row._id),
      count: countValue(row.count),
    })),
    searchAnalytics: searchRows.map((row) => ({
      query: stringValue((row as AnalyticsRow)._id?.query),
      scope: stringValue((row as AnalyticsRow)._id?.scope),
      restaurantId: stringValue((row as AnalyticsRow)._id?.restaurantId),
      count: countValue(row.count),
      zeroResultCount: countValue((row as AnalyticsRow).zeroResultCount),
      averageResults: Math.round(countValue((row as AnalyticsRow).averageResults) * 10) / 10,
      lastSeenAt: toIso((row as AnalyticsRow).lastSeenAt),
    })),
    attribution: attributionRows.map((row) => ({
      source: stringValue((row as AnalyticsRow)._id?.source),
      campaignId: stringValue((row as AnalyticsRow)._id?.campaignId),
      events: countValue(row.events),
      checkouts: countValue(row.checkouts),
      orders: countValue(row.orders),
      checkoutRate:
        countValue(row.events) > 0
          ? Math.round((countValue(row.checkouts) / countValue(row.events)) * 100)
          : 0,
      orderRate:
        countValue(row.events) > 0
          ? Math.round((countValue(row.orders) / countValue(row.events)) * 100)
          : 0,
      lastSeenAt: toIso((row as AnalyticsRow).lastSeenAt),
    })),
    recentEvents: recentEvents.map((event) => ({
      id: String((event as AnalyticsRow)._id ?? ""),
      eventType: stringValue((event as AnalyticsRow).eventType),
      actorType: stringValue((event as AnalyticsRow).actorType),
      customerId: stringValue((event as AnalyticsRow).customerId),
      anonymousId: stringValue((event as AnalyticsRow).anonymousId),
      sessionId: stringValue((event as AnalyticsRow).sessionId),
      path: stringValue((event as AnalyticsRow).path),
      screenName: stringValue((event as AnalyticsRow).screenName),
      entityType: stringValue((event as AnalyticsRow).entityType),
      entityId: stringValue((event as AnalyticsRow).entityId),
      occurredAt: toIso((event as AnalyticsRow).occurredAt),
      createdAt: toIso((event as AnalyticsRow).createdAt),
      summary: buildEventSummaryText(event as AnalyticsRow),
    })),
    alerts,
  }
}

async function buildSessionJourneys(
  range: AnalyticsRange,
  limit: number,
  params: AdminCustomerAnalyticsQuery,
) {
  const match = await buildScopedAnalyticsMatch(makeMatch(range), params)
  const journeys = await CustomerAnalyticsEventModel.aggregate<any>([
    { $match: { ...match, sessionId: { $ne: "" } } },
    { $sort: { sessionId: 1, occurredAt: 1 } },
    {
      $group: {
        _id: "$sessionId",
        actorType: { $last: "$actorType" },
        customerId: { $last: "$customerId" },
        anonymousId: { $first: "$anonymousId" },
        startPath: { $first: "$path" },
        lastPath: { $last: "$path" },
        firstSeenAt: { $min: "$occurredAt" },
        lastSeenAt: { $max: "$occurredAt" },
        eventCount: { $sum: 1 },
        pageViews: { $sum: { $cond: [{ $eq: ["$eventType", "page_view"] }, 1, 0] } },
        checkoutStarts: { $sum: { $cond: [{ $eq: ["$eventType", "checkout_start"] }, 1, 0] } },
        ordersCreated: { $sum: { $cond: [{ $eq: ["$eventType", "order_created"] }, 1, 0] } },
        paymentFailures: {
          $sum: {
            $cond: [
              { $in: ["$eventType", ["payment_failed", "payment_cancelled"]] },
              1,
              0,
            ],
          },
        },
        events: {
          $push: {
            eventType: "$eventType",
            path: "$path",
            screenName: "$screenName",
            entityType: "$entityType",
            entityId: "$entityId",
            occurredAt: "$occurredAt",
          },
        },
      },
    },
    { $sort: { lastSeenAt: -1 } },
    { $limit: limit },
  ])

  return journeys.map((row) => {
    const events = Array.isArray((row as AnalyticsRow).events)
      ? (row as AnalyticsRow).events
      : []

    return {
      sessionId: stringValue((row as AnalyticsRow)._id),
      actorType: stringValue((row as AnalyticsRow).actorType),
      customerId: stringValue((row as AnalyticsRow).customerId),
      anonymousId: stringValue((row as AnalyticsRow).anonymousId),
      startPath: stringValue((row as AnalyticsRow).startPath),
      lastPath: stringValue((row as AnalyticsRow).lastPath),
      firstSeenAt: toIso((row as AnalyticsRow).firstSeenAt),
      lastSeenAt: toIso((row as AnalyticsRow).lastSeenAt),
      eventCount: countValue((row as AnalyticsRow).eventCount),
      pageViews: countValue((row as AnalyticsRow).pageViews),
      checkoutStarts: countValue((row as AnalyticsRow).checkoutStarts),
      ordersCreated: countValue((row as AnalyticsRow).ordersCreated),
      paymentFailures: countValue((row as AnalyticsRow).paymentFailures),
      events: events.slice(-8).map((event: AnalyticsRow) => ({
        eventType: stringValue(event.eventType),
        path: stringValue(event.path),
        screenName: stringValue(event.screenName),
        entityType: stringValue(event.entityType),
        entityId: stringValue(event.entityId),
        occurredAt: toIso(event.occurredAt),
      })),
    }
  })
}

async function buildRestaurantFunnels(
  range: AnalyticsRange,
  limit: number,
  params: AdminCustomerAnalyticsQuery,
): Promise<RestaurantFunnelRow[]> {
  const match = await buildScopedAnalyticsMatch(makeMatch(range), params)
  const orderScopeFilter = buildOrderServiceAreaScopeFilter(params)
  const [restaurantViewRows, menuViewRows, orderRows] = (await Promise.all([
    CustomerAnalyticsEventModel.aggregate<any>([
      { $match: { ...match, eventType: "restaurant_view", entityId: { $ne: "" } } },
      {
        $group: {
          _id: "$entityId",
          views: { $sum: 1 },
          guestViews: { $sum: { $cond: [{ $eq: ["$actorType", "guest"] }, 1, 0] } },
          customerViews: { $sum: { $cond: [{ $eq: ["$actorType", "customer"] }, 1, 0] } },
          lastSeenAt: { $max: "$occurredAt" },
        },
      },
      { $sort: { views: -1, lastSeenAt: -1 } },
      { $limit: limit },
    ]),
    CustomerAnalyticsEventModel.aggregate<any>([
      {
        $match: {
          ...match,
          eventType: "menu_item_view",
          "metadata.restaurantId": { $ne: "" },
        },
      },
      {
        $group: {
          _id: "$metadata.restaurantId",
          menuItemViews: { $sum: 1 },
        },
      },
    ]),
    OrderModel.aggregate<any>([
      {
        $match: {
          ...orderScopeFilter,
          createdAt: { $gte: range.start, $lte: range.end },
          restaurantId: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: { restaurantId: { $toString: "$restaurantId" } },
          orders: { $sum: 1 },
          deliveredOrders: {
            $sum: { $cond: [{ $eq: ["$status", "Delivered"] }, 1, 0] },
          },
          revenue: { $sum: { $ifNull: ["$pricing.total", 0] } },
          uniqueCustomers: { $addToSet: "$customerId" },
          lastOrderAt: { $max: "$createdAt" },
        },
      },
      { $sort: { orders: -1, lastOrderAt: -1 } },
      { $limit: limit },
    ]),
  ])) as [AnalyticsRow[], AnalyticsRow[], AnalyticsRow[]]

  const restaurantIds = [
    ...new Set([
      ...restaurantViewRows.map((row) => stringValue(row._id)),
      ...menuViewRows.map((row) => stringValue(row._id)),
      ...orderRows.map((row) => stringValue((row as AnalyticsRow)._id?.restaurantId)),
    ].filter(Boolean)),
  ]

  const restaurants = restaurantIds.length
    ? await RestaurantModel.find({ _id: { $in: restaurantIds } })
        .select({ name: 1 })
        .lean() as any[]
    : []
  const restaurantMap = new Map(
    restaurants.map((restaurant) => [String(restaurant._id), restaurant]),
  )
  const menuViewMap = new Map(
    menuViewRows.map((row) => [stringValue(row._id), countValue((row as AnalyticsRow).menuItemViews)]),
  )
  const orderMap = new Map(
    orderRows.map((row) => [stringValue((row as AnalyticsRow)._id?.restaurantId), row]),
  )

  return restaurantViewRows.map((row) => {
    const restaurantId = stringValue(row._id)
    const orderRow = orderMap.get(restaurantId)
    const orderStats = orderRow as any
    const views = countValue(row.views)
    const orders = countValue(orderStats?.orders)
    const deliveredOrders = countValue(orderStats?.deliveredOrders)
    const revenue = countValue(orderStats?.revenue)
    const uniqueCustomers = Array.isArray(orderStats?.uniqueCustomers)
      ? orderStats.uniqueCustomers.filter(Boolean).length
      : 0

    return {
      restaurantId,
      restaurantName: String(restaurantMap.get(restaurantId)?.name ?? restaurantId),
      views,
      guestViews: countValue(row.guestViews),
      customerViews: countValue(row.customerViews),
      menuItemViews: menuViewMap.get(restaurantId) ?? 0,
      orders,
      deliveredOrders,
      revenue,
      uniqueCustomers,
      lastSeenAt: toIso(row.lastSeenAt),
      lastOrderAt: toIso(orderStats?.lastOrderAt),
      viewToOrderRate: views > 0 ? Math.round((orders / views) * 100) : 0,
    }
  })
}

async function buildCheckoutDropOffPaths(
  range: AnalyticsRange,
  limit: number,
  params: AdminCustomerAnalyticsQuery,
) {
  const match = await buildScopedAnalyticsMatch(makeMatch(range), params)
  const rows = await CustomerAnalyticsEventModel.aggregate<any>([
    { $match: { ...match, sessionId: { $ne: "" } } },
    { $sort: { sessionId: 1, occurredAt: 1 } },
    {
      $group: {
        _id: "$sessionId",
        actorType: { $last: "$actorType" },
        checkoutStarts: { $sum: { $cond: [{ $eq: ["$eventType", "checkout_start"] }, 1, 0] } },
        ordersCreated: { $sum: { $cond: [{ $eq: ["$eventType", "order_created"] }, 1, 0] } },
        lastPath: { $last: "$path" },
        lastSeenAt: { $max: "$occurredAt" },
      },
    },
    {
      $match: {
        checkoutStarts: { $gt: 0 },
        ordersCreated: 0,
      },
    },
    {
      $group: {
        _id: "$lastPath",
        sessions: { $sum: 1 },
        guestSessions: { $sum: { $cond: [{ $eq: ["$actorType", "guest"] }, 1, 0] } },
        customerSessions: { $sum: { $cond: [{ $eq: ["$actorType", "customer"] }, 1, 0] } },
        lastSeenAt: { $max: "$lastSeenAt" },
      },
    },
    { $sort: { sessions: -1, lastSeenAt: -1 } },
    { $limit: limit },
  ])

  return rows.map((row) => ({
    path: stringValue(row._id),
    sessions: countValue(row.sessions),
    guestSessions: countValue(row.guestSessions),
    customerSessions: countValue(row.customerSessions),
    lastSeenAt: toIso(row.lastSeenAt),
  }))
}

async function buildFunnel(params: AdminCustomerAnalyticsQuery): Promise<FunnelResponse> {
  const range = resolveRange(params)
  const limit = normalizeLimit(params.limit)
  const match = await buildScopedAnalyticsMatch(makeMatch(range), params)

  const funnelResults = await Promise.all([
      buildSessionJourneys(range, limit, params),
      buildRestaurantFunnels(range, limit, params),
      buildCheckoutDropOffPaths(range, limit, params),
      CustomerAnalyticsEventModel.aggregate<any>([
        { $match: { ...match, eventType: "search" } },
        {
          $group: {
            _id: {
              query: { $ifNull: ["$metadata.query", ""] },
              scope: { $ifNull: ["$metadata.scope", "unknown"] },
              restaurantId: { $ifNull: ["$metadata.restaurantId", ""] },
            },
            count: { $sum: 1 },
            zeroResultCount: {
              $sum: {
                $cond: [
                  { $eq: [{ $ifNull: ["$metadata.hasResults", true] }, false] },
                  1,
                  0,
                ],
              },
            },
            averageResults: { $avg: { $ifNull: ["$metadata.resultCount", 0] } },
            lastSeenAt: { $max: "$occurredAt" },
          },
        },
        { $sort: { count: -1, lastSeenAt: -1 } },
        { $limit: limit },
      ]),
      CustomerAnalyticsEventModel.aggregate<any>([
        { $match: { ...match, sessionId: { $ne: "" } } },
        { $sort: { sessionId: 1, occurredAt: 1 } },
        {
          $group: {
            _id: "$sessionId",
            actorType: { $last: "$actorType" },
            customerId: { $last: "$customerId" },
            anonymousId: { $first: "$anonymousId" },
            pageViews: { $sum: { $cond: [{ $eq: ["$eventType", "page_view"] }, 1, 0] } },
            checkoutStarts: { $sum: { $cond: [{ $eq: ["$eventType", "checkout_start"] }, 1, 0] } },
            signupStarted: { $sum: { $cond: [{ $eq: ["$eventType", "signup_started"] }, 1, 0] } },
            signupCompleted: { $sum: { $cond: [{ $eq: ["$eventType", "signup_completed"] }, 1, 0] } },
            ordersCreated: { $sum: { $cond: [{ $eq: ["$eventType", "order_created"] }, 1, 0] } },
          },
        },
        {
          $group: {
            _id: null,
            sessions: { $sum: 1 },
            browseOnlySessions: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gt: ["$pageViews", 0] },
                      { $eq: ["$checkoutStarts", 0] },
                      { $eq: ["$ordersCreated", 0] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            checkoutAbandonedSessions: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gt: ["$checkoutStarts", 0] },
                      { $eq: ["$ordersCreated", 0] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            signupAbandonedVisitors: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gt: ["$signupStarted", 0] },
                      { $eq: ["$signupCompleted", 0] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            registeredBrowseNoOrderCustomers: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$actorType", "customer"] },
                      { $gt: ["$pageViews", 0] },
                      { $eq: ["$ordersCreated", 0] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            guestSessions: {
              $sum: { $cond: [{ $eq: ["$actorType", "guest"] }, 1, 0] },
            },
            customerSessions: {
              $sum: { $cond: [{ $eq: ["$actorType", "customer"] }, 1, 0] },
            },
          },
        },
      ]),
    ]);

  const [sessionJourneys, restaurantFunnels, dropOffPaths, searchAnalytics, sessionSummaryRows] =
    funnelResults as [
      SessionJourneyRow[],
      RestaurantFunnelRow[],
      FunnelResponse["dropOffPaths"],
      AnalyticsRow[],
      AnalyticsRow[],
    ]

  const sessionSummary = sessionSummaryRows[0] ?? {}
  return {
    timeframe: buildTimeframe(range),
    sessionSummary: {
      sessions: countValue(sessionSummary.sessions),
      browseOnlySessions: countValue(sessionSummary.browseOnlySessions),
      checkoutAbandonedSessions: countValue(sessionSummary.checkoutAbandonedSessions),
      signupAbandonedVisitors: countValue(sessionSummary.signupAbandonedVisitors),
      registeredBrowseNoOrderCustomers: countValue(sessionSummary.registeredBrowseNoOrderCustomers),
      guestSessions: countValue(sessionSummary.guestSessions),
      customerSessions: countValue(sessionSummary.customerSessions),
    },
    sessionJourneys,
    restaurantFunnels,
    dropOffPaths,
    searchAnalytics: searchAnalytics.map((row) => ({
      query: stringValue((row as AnalyticsRow)._id?.query),
      scope: stringValue((row as AnalyticsRow)._id?.scope),
      restaurantId: stringValue((row as AnalyticsRow)._id?.restaurantId),
      count: countValue(row.count),
      zeroResultCount: countValue((row as AnalyticsRow).zeroResultCount),
      averageResults: Math.round(countValue((row as AnalyticsRow).averageResults) * 10) / 10,
      lastSeenAt: toIso((row as AnalyticsRow).lastSeenAt),
    })),
  }
}

async function buildCustomerRows(
  range: AnalyticsRange,
  limit: number,
  params: AdminCustomerAnalyticsQuery,
) {
  const orderScopeFilter = buildOrderServiceAreaScopeFilter(params)
  const analyticsMatch = await buildScopedAnalyticsMatch(makeMatch(range), params)
  const scopedCustomerIds = hasAreaScope(params)
    ? (
        await OrderModel.distinct("customerId", {
          ...orderScopeFilter,
          customerId: { $type: "string", $ne: "" },
        })
      )
        .map((value) => stringValue(value))
        .filter((value) => /^[a-f\d]{24}$/i.test(value))
    : []
  const customerQuery: AnalyticsRow = {
    createdAt: { $gte: range.start, $lte: range.end },
  }
  if (hasAreaScope(params)) {
    customerQuery._id = { $in: scopedCustomerIds }
  }
  const newCustomerDocs = await CustomerModel.find(customerQuery)
    .select({
      fullName: 1,
      phone: 1,
      status: 1,
      createdAt: 1,
      lastLoginAt: 1,
    })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean() as any[]

  const customerIds = newCustomerDocs.map((customer) => String(customer._id))
  const firstOrderRows = customerIds.length
    ? await OrderModel.aggregate<any>([
        { $match: { ...orderScopeFilter, customerId: { $in: customerIds } } },
        {
          $group: {
            _id: "$customerId",
            firstOrderAt: { $min: "$createdAt" },
            orderCount: { $sum: 1 },
            revenue: { $sum: { $ifNull: ["$pricing.total", 0] } },
          },
        },
      ])
    : []
  const firstOrderMap = new Map(
    firstOrderRows.map((row) => [String(row._id), row]),
  )
  const recentUsers = newCustomerDocs.slice(0, 10).map((customer) => {
    const orderRow = firstOrderMap.get(String(customer._id))
    const orders = countValue(orderRow?.orderCount)
    const spend = countValue(orderRow?.revenue)
    return {
      customerId: String(customer._id),
      fullName: String(customer.fullName ?? "Unknown customer"),
      phone: String(customer.phone ?? ""),
      status: String(customer.status ?? "active"),
      createdAt: toIso(customer.createdAt),
      lastLoginAt: toIso(customer.lastLoginAt),
      lifetimeOrders: orders,
      deliveredOrders: 0,
      cancelledOrders: 0,
      lifetimeSpend: spend,
      averageOrderValue: orders > 0 ? Math.round((spend / orders) * 100) / 100 : 0,
      firstOrderAt: toIso(orderRow?.firstOrderAt),
      lastOrderAt: toIso(orderRow?.firstOrderAt),
      favoritePaymentMethod: "unknown",
      paymentMethods: [],
      recentOrders: [],
    }
  })

  const newCustomers = newCustomerDocs.length
  const orderedWithin1Day = newCustomerDocs.filter((customer) => {
    const firstOrder = firstOrderMap.get(String(customer._id))
    const firstOrderAt = firstOrder?.firstOrderAt ? new Date(String(firstOrder.firstOrderAt)) : null
    const createdAt = customer.createdAt ? new Date(customer.createdAt) : null
    if (!firstOrderAt || !createdAt) return false
    return firstOrderAt.getTime() - createdAt.getTime() <= 24 * 60 * 60 * 1000
  }).length
  const orderedWithin7Days = newCustomerDocs.filter((customer) => {
    const firstOrder = firstOrderMap.get(String(customer._id))
    const firstOrderAt = firstOrder?.firstOrderAt ? new Date(String(firstOrder.firstOrderAt)) : null
    const createdAt = customer.createdAt ? new Date(customer.createdAt) : null
    if (!firstOrderAt || !createdAt) return false
    return firstOrderAt.getTime() - createdAt.getTime() <= 7 * 24 * 60 * 60 * 1000
  }).length
  const orderedWithin30Days = newCustomerDocs.filter((customer) => {
    const firstOrder = firstOrderMap.get(String(customer._id))
    const firstOrderAt = firstOrder?.firstOrderAt ? new Date(String(firstOrder.firstOrderAt)) : null
    const createdAt = customer.createdAt ? new Date(customer.createdAt) : null
    if (!firstOrderAt || !createdAt) return false
    return firstOrderAt.getTime() - createdAt.getTime() <= 30 * 24 * 60 * 60 * 1000
  }).length

  const repeatRows = await OrderModel.aggregate<any>([
    { $match: { ...orderScopeFilter, customerId: { $ne: "" } } },
    {
      $group: {
        _id: "$customerId",
        orders: { $sum: 1 },
        deliveredOrders: { $sum: { $cond: [{ $eq: ["$status", "Delivered"] }, 1, 0] } },
        cancelledOrders: {
          $sum: { $cond: [{ $in: ["$status", ["Cancelled", "Rejected"]] }, 1, 0] },
        },
        lifetimeSpend: { $sum: { $ifNull: ["$pricing.total", 0] } },
        firstOrderAt: { $min: "$createdAt" },
        lastOrderAt: { $max: "$createdAt" },
        paymentMethods: { $push: "$paymentMethod" },
        recentOrders: {
          $push: {
            orderId: { $toString: "$_id" },
            orderNumber: "$orderNumber",
            restaurantId: { $toString: "$restaurantId" },
            status: "$status",
            paymentMethod: "$paymentMethod",
            paymentStatus: "$paymentStatus",
            total: { $ifNull: ["$pricing.total", 0] },
            createdAt: "$createdAt",
          },
        },
      },
    },
    { $match: { orders: { $gte: 2 } } },
    { $sort: { lifetimeSpend: -1, lastOrderAt: -1 } },
    { $limit: limit },
  ])

  const repeatCustomerIds = repeatRows.map((row) => String(row._id))
  const repeatCustomersDocs = repeatCustomerIds.length
    ? await CustomerModel.find({ _id: { $in: repeatCustomerIds } })
        .select({ fullName: 1, phone: 1, status: 1, createdAt: 1, lastLoginAt: 1 })
        .lean() as any[]
    : []
  const repeatCustomerMap = new Map(
    repeatCustomersDocs.map((customer) => [String(customer._id), customer]),
  )
  const repeatCustomers = repeatRows.map((row) => {
    const customer = repeatCustomerMap.get(String(row._id))
    const recentOrders = Array.isArray((row as AnalyticsRow).recentOrders)
      ? (row as AnalyticsRow).recentOrders
      : []
    const paymentMethodsRaw: unknown[] = Array.isArray((row as AnalyticsRow).paymentMethods)
      ? (row as AnalyticsRow).paymentMethods
      : []
    const paymentMethodCounts = paymentMethodsRaw.reduce((acc: Record<string, number>, value: unknown) => {
      const method = stringValue(value) || "unknown"
      acc[method] = (acc[method] ?? 0) + 1
      return acc
    }, {} as Record<string, number>)

    return {
      customerId: String(row._id),
      fullName: String(customer?.fullName ?? "Unknown customer"),
      phone: String(customer?.phone ?? ""),
      status: String(customer?.status ?? "active"),
      createdAt: toIso(customer?.createdAt),
      lastLoginAt: toIso(customer?.lastLoginAt),
      lifetimeOrders: countValue((row as AnalyticsRow).orders),
      deliveredOrders: countValue((row as AnalyticsRow).deliveredOrders),
      cancelledOrders: countValue((row as AnalyticsRow).cancelledOrders),
      lifetimeSpend: countValue((row as AnalyticsRow).lifetimeSpend),
      averageOrderValue:
        countValue((row as AnalyticsRow).orders) > 0
          ? Math.round(
              (countValue((row as AnalyticsRow).lifetimeSpend) /
                countValue((row as AnalyticsRow).orders)) *
                100,
            ) / 100
          : 0,
      firstOrderAt: toIso((row as AnalyticsRow).firstOrderAt),
      lastOrderAt: toIso((row as AnalyticsRow).lastOrderAt),
      favoritePaymentMethod:
        Object.entries(paymentMethodCounts).sort((left, right) => right[1] - left[1])[0]?.[0] ??
        "unknown",
      paymentMethods: Object.entries(paymentMethodCounts).map(([label, count]) => ({
        label,
        count,
      })),
      recentOrders: recentOrders.slice(-5).reverse().map((order: AnalyticsRow) => ({
        orderId: String(order.orderId ?? ""),
        orderNumber: String(order.orderNumber ?? ""),
        restaurantId: String(order.restaurantId ?? ""),
        restaurantName: String(order.restaurantName ?? ""),
      status: String(order.status ?? ""),
      paymentMethod: String(order.paymentMethod ?? ""),
      paymentStatus: displayOrderPaymentStatus(order),
      total: countValue(order.total),
        createdAt: toIso(order.createdAt),
      })),
    }
  })

  const topOrderRows = await OrderModel.aggregate<any>([
    {
      $match: {
        ...orderScopeFilter,
        createdAt: { $gte: range.start, $lte: range.end },
        customerId: { $ne: "" },
      },
    },
    {
      $group: {
        _id: "$customerId",
        orders: { $sum: 1 },
        deliveredOrders: { $sum: { $cond: [{ $eq: ["$status", "Delivered"] }, 1, 0] } },
        cancelledOrders: {
          $sum: { $cond: [{ $in: ["$status", ["Cancelled", "Rejected"]] }, 1, 0] },
        },
        lifetimeSpend: { $sum: { $ifNull: ["$pricing.total", 0] } },
        firstOrderAt: { $min: "$createdAt" },
        lastOrderAt: { $max: "$createdAt" },
        paymentMethods: { $push: "$paymentMethod" },
      },
    },
    { $sort: { orders: -1, lifetimeSpend: -1, lastOrderAt: -1 } },
    { $limit: 10 },
  ])
  const topOrderCustomerIds = topOrderRows
    .map((row) => String(row._id))
    .filter((value) => /^[a-f\d]{24}$/i.test(value))
  const topOrderCustomerDocs = topOrderCustomerIds.length
    ? await CustomerModel.find({ _id: { $in: topOrderCustomerIds } })
        .select({ fullName: 1, phone: 1, status: 1, createdAt: 1, lastLoginAt: 1 })
        .lean() as any[]
    : []
  const topOrderCustomerMap = new Map(
    topOrderCustomerDocs.map((customer) => [String(customer._id), customer]),
  )
  const topOrderUsers = topOrderRows.map((row) => {
    const customer = topOrderCustomerMap.get(String(row._id))
    const paymentMethodsRaw: unknown[] = Array.isArray((row as AnalyticsRow).paymentMethods)
      ? (row as AnalyticsRow).paymentMethods
      : []
    const paymentMethodCounts = paymentMethodsRaw.reduce((acc: Record<string, number>, value: unknown) => {
      const method = stringValue(value) || "unknown"
      acc[method] = (acc[method] ?? 0) + 1
      return acc
    }, {} as Record<string, number>)
    const orders = countValue((row as AnalyticsRow).orders)
    const spend = countValue((row as AnalyticsRow).lifetimeSpend)
    return {
      customerId: String(row._id),
      fullName: String(customer?.fullName ?? "Unknown customer"),
      phone: String(customer?.phone ?? ""),
      status: String(customer?.status ?? "active"),
      createdAt: toIso(customer?.createdAt),
      lastLoginAt: toIso(customer?.lastLoginAt),
      lifetimeOrders: orders,
      deliveredOrders: countValue((row as AnalyticsRow).deliveredOrders),
      cancelledOrders: countValue((row as AnalyticsRow).cancelledOrders),
      lifetimeSpend: spend,
      averageOrderValue: orders > 0 ? Math.round((spend / orders) * 100) / 100 : 0,
      firstOrderAt: toIso((row as AnalyticsRow).firstOrderAt),
      lastOrderAt: toIso((row as AnalyticsRow).lastOrderAt),
      favoritePaymentMethod:
        Object.entries(paymentMethodCounts).sort((left, right) => right[1] - left[1])[0]?.[0] ??
        "unknown",
      paymentMethods: Object.entries(paymentMethodCounts).map(([label, count]) => ({
        label,
        count,
      })),
      recentOrders: [],
    }
  })

  const abandonedSessionRows = await CustomerAnalyticsEventModel.aggregate<any>([
    { $match: { ...analyticsMatch, sessionId: { $ne: "" } } },
    { $sort: { sessionId: 1, occurredAt: 1 } },
    {
      $group: {
        _id: "$sessionId",
        actorType: { $last: "$actorType" },
        customerId: { $last: "$customerId" },
        anonymousId: { $first: "$anonymousId" },
        fullName: { $last: "$customerName" },
        phone: { $last: "$customerPhone" },
        restaurantId: {
          $last: { $ifNull: ["$entityId", { $ifNull: ["$metadata.restaurantId", ""] }] },
        },
        restaurantName: { $last: { $ifNull: ["$metadata.restaurantName", ""] } },
        estimatedCartValue: { $last: { $ifNull: ["$metadata.total", "$metadata.subtotal"] } },
        itemCount: { $last: { $ifNull: ["$metadata.itemCount", 0] } },
        paymentMethod: {
          $last: {
            $ifNull: ["$metadata.paymentMethod", { $ifNull: ["$metadata.provider", "unknown"] }],
          },
        },
        voucherCode: {
          $last: { $ifNull: ["$metadata.code", { $ifNull: ["$metadata.voucherCode", ""] }] },
        },
        firstSeenAt: { $min: "$occurredAt" },
        lastSeenAt: { $max: "$occurredAt" },
        pageViews: { $sum: { $cond: [{ $eq: ["$eventType", "page_view"] }, 1, 0] } },
        checkoutStarts: { $sum: { $cond: [{ $eq: ["$eventType", "checkout_start"] }, 1, 0] } },
        ordersCreated: { $sum: { $cond: [{ $eq: ["$eventType", "order_created"] }, 1, 0] } },
        events: {
          $push: {
            eventType: "$eventType",
            path: "$path",
            screenName: "$screenName",
            entityType: "$entityType",
            entityId: "$entityId",
            occurredAt: "$occurredAt",
          },
        },
        cartItems: { $last: { $ifNull: ["$metadata.items", []] } },
      },
    },
    {
      $match: {
        checkoutStarts: { $gt: 0 },
        ordersCreated: 0,
      },
    },
    { $sort: { lastSeenAt: -1 } },
    { $limit: limit },
  ])

  const orderStatsMap = new Map(
    (
      customerIds.length
        ? await OrderModel.aggregate<any>([
            { $match: { ...orderScopeFilter, customerId: { $in: customerIds } } },
            {
              $group: {
                _id: "$customerId",
                orders: { $sum: 1 },
                revenue: { $sum: { $ifNull: ["$pricing.total", 0] } },
              },
            },
          ])
        : []
    ).map((row) => [
      String(row._id),
      {
        orders: countValue(row.orders),
        revenue: countValue(row.revenue),
      },
    ]),
  )

  const abandonedCheckouts = abandonedSessionRows.map((row) => {
    const cartItems = Array.isArray((row as AnalyticsRow).cartItems)
      ? (row as AnalyticsRow).cartItems
      : []
    const customerId = stringValue((row as AnalyticsRow).customerId)
    const customerStats = orderStatsMap.get(customerId)
    const lifetimeOrders = customerStats?.orders ?? 0
    const firstSeenAt = toIso((row as AnalyticsRow).firstSeenAt)
    const lastSeenAt = toIso((row as AnalyticsRow).lastSeenAt)
    return {
      sessionId: stringValue((row as AnalyticsRow)._id),
      actorType: stringValue((row as AnalyticsRow).actorType),
      customerId,
      anonymousId: stringValue((row as AnalyticsRow).anonymousId),
      fullName: String((row as AnalyticsRow).fullName ?? ""),
      phone: String((row as AnalyticsRow).phone ?? ""),
      restaurantId: stringValue((row as AnalyticsRow).restaurantId),
      restaurantName: String((row as AnalyticsRow).restaurantName ?? ""),
      estimatedCartValue: countValue((row as AnalyticsRow).estimatedCartValue),
      itemCount: countValue((row as AnalyticsRow).itemCount),
      paymentMethod: String((row as AnalyticsRow).paymentMethod ?? ""),
      voucherCode: String((row as AnalyticsRow).voucherCode ?? ""),
      repeatVisitor: lifetimeOrders > 1,
      lifetimeOrders,
      lifetimeSpend: customerStats?.revenue ?? 0,
      firstSeenAt,
      lastSeenAt,
      lastPath: String((row as AnalyticsRow).events?.slice(-1)[0]?.path ?? ""),
      eventCount: Array.isArray((row as AnalyticsRow).events)
        ? (row as AnalyticsRow).events.length
        : 0,
      cartItems: cartItems.map((item: AnalyticsRow) => ({
        itemId: String(item.itemId ?? ""),
        name: String(item.name ?? ""),
        quantity: countValue(item.quantity),
        unitPrice: countValue(item.unitPrice),
        total: countValue(item.total),
      })),
    }
  })

  const guestSessionRows = await CustomerAnalyticsEventModel.aggregate<any>([
    { $match: { ...analyticsMatch, sessionId: { $ne: "" } } },
    { $sort: { sessionId: 1, occurredAt: 1 } },
    {
      $group: {
        _id: "$sessionId",
        actorType: { $last: "$actorType" },
        anonymousId: { $first: "$anonymousId" },
        lastPath: { $last: "$path" },
        firstSeenAt: { $min: "$occurredAt" },
        lastSeenAt: { $max: "$occurredAt" },
        eventCount: { $sum: 1 },
        checkoutStarts: { $sum: { $cond: [{ $eq: ["$eventType", "checkout_start"] }, 1, 0] } },
        ordersCreated: { $sum: { $cond: [{ $eq: ["$eventType", "order_created"] }, 1, 0] } },
      },
    },
    { $match: { actorType: "guest" } },
    { $sort: { lastSeenAt: -1 } },
    { $limit: limit },
  ])

  return {
    timeframe: buildTimeframe(range),
    retention: {
      newCustomers,
      orderedWithin1Day,
      orderedWithin7Days,
      orderedWithin30Days,
      repeatCustomers: repeatCustomers.length,
      day1OrderRate: newCustomers > 0 ? Math.round((orderedWithin1Day / newCustomers) * 100) : 0,
      day7OrderRate: newCustomers > 0 ? Math.round((orderedWithin7Days / newCustomers) * 100) : 0,
      day30OrderRate: newCustomers > 0 ? Math.round((orderedWithin30Days / newCustomers) * 100) : 0,
    },
    recentUsers,
    topOrderUsers,
    repeatCustomers,
    abandonedCheckouts,
    guestSessions: guestSessionRows.map((row) => ({
      sessionId: String(row._id),
      anonymousId: String(row.anonymousId ?? ""),
      lastPath: String(row.lastPath ?? ""),
      firstSeenAt: toIso(row.firstSeenAt),
      lastSeenAt: toIso(row.lastSeenAt),
      eventCount: countValue(row.eventCount),
      checkoutStarts: countValue(row.checkoutStarts),
      ordersCreated: countValue(row.ordersCreated),
    })),
  }
}

async function buildPayments(params: AdminCustomerAnalyticsQuery): Promise<PaymentsResponse> {
  const range = resolveRange(params)
  const match = await buildScopedAnalyticsMatch(makeMatch(range), params)
  const orderScopeFilter = buildOrderServiceAreaScopeFilter(params)

  const [summaryRows, paymentEventRows, orderMethodsRows, failureStageRows] = (await Promise.all([
    CustomerAnalyticsEventModel.aggregate<any>([
      { $match: match },
      {
        $group: {
          _id: null,
          initiated: { $sum: { $cond: [{ $eq: ["$eventType", "payment_initiated"] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $eq: ["$eventType", "payment_completed"] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ["$eventType", "payment_failed"] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ["$eventType", "payment_cancelled"] }, 1, 0] } },
        },
      },
    ]),
    CustomerAnalyticsEventModel.aggregate<any>([
      {
        $match: {
          ...match,
          eventType: { $in: ["payment_initiated", "payment_completed", "payment_failed", "payment_cancelled"] },
        },
      },
      {
        $group: {
          _id: {
            eventType: "$eventType",
            provider: { $ifNull: ["$metadata.provider", "unknown"] },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1, "_id.eventType": 1 } },
    ]),
    OrderModel.aggregate<any>([
      {
        $match: {
          ...orderScopeFilter,
          createdAt: { $gte: range.start, $lte: range.end },
        },
      },
      {
        $addFields: {
          displayPaymentStatus: {
            $cond: [
              {
                $and: [
                  { $in: ["$status", ["Cancelled", "Rejected"]] },
                  { $eq: ["$paymentMethod", "Cash"] },
                  { $ne: ["$paymentStatus", "paid"] },
                ],
              },
              "cancelled",
              { $ifNull: ["$paymentStatus", "unknown"] },
            ],
          },
        },
      },
      {
        $group: {
          _id: {
            paymentMethod: { $ifNull: ["$paymentMethod", "unknown"] },
            paymentStatus: "$displayPaymentStatus",
          },
          orders: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$pricing.total", 0] } },
        },
      },
      { $sort: { orders: -1, revenue: -1 } },
    ]),
    CustomerAnalyticsEventModel.aggregate<any>([
      {
        $match: {
          ...match,
          eventType: "payment_failed",
        },
      },
      {
        $group: {
          _id: { stage: { $ifNull: ["$metadata.stage", "unknown"] } },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
  ])) as [AnalyticsRow[], AnalyticsRow[], AnalyticsRow[], AnalyticsRow[]]

  const summary = summaryRows[0] ?? {}
  const initiated = countValue(summary.initiated)
  const completed = countValue(summary.completed)

  return {
    timeframe: buildTimeframe(range),
    paymentHealth: {
      initiated,
      completed,
      failed: countValue(summary.failed),
      cancelled: countValue(summary.cancelled),
      completionRate: initiated > 0 ? Math.round((completed / initiated) * 100) : 0,
      events: paymentEventRows.map((row) => ({
        eventType: String((row as AnalyticsRow)._id?.eventType ?? ""),
        provider: String((row as AnalyticsRow)._id?.provider ?? ""),
        count: countValue(row.count),
      })),
      failureStages: failureStageRows.map((row) => ({
        label: String((row as AnalyticsRow)._id?.stage ?? "unknown"),
        count: countValue(row.count),
      })),
    },
    orderMethods: orderMethodsRows.map((row) => ({
      paymentMethod: String((row as AnalyticsRow)._id?.paymentMethod ?? "unknown"),
      paymentStatus: String((row as AnalyticsRow)._id?.paymentStatus ?? "unknown"),
      orders: countValue(row.orders),
      revenue: countValue(row.revenue),
    })),
  }
}

async function buildActorDetail(params: AdminCustomerAnalyticsQuery & { customerId?: string; anonymousId?: string }): Promise<ActorDetailResponse> {
  const range = resolveRange(params)
  const match = await buildScopedAnalyticsMatch(makeMatch(range), params)
  const orderScopeFilter = buildOrderServiceAreaScopeFilter(params)
  const customerId = params.customerId?.trim() ?? ""
  const anonymousId = params.anonymousId?.trim() ?? ""
  const actorType = customerId ? "customer" : "guest"

  const [customerDoc, eventRows, orderRows] = (await Promise.all([
    customerId
      ? CustomerModel.findById(customerId)
          .select({
            fullName: 1,
            phone: 1,
            status: 1,
            createdAt: 1,
            lastLoginAt: 1,
          })
          .lean()
          .exec()
      : null,
    CustomerAnalyticsEventModel.find(
      customerId
        ? { ...match, customerId }
        : { ...match, anonymousId: { $eq: anonymousId } },
    )
      .sort({ occurredAt: -1 })
      .limit(80)
      .lean()
      .exec(),
    customerId
      ? OrderModel.find({
          ...orderScopeFilter,
          customerId,
          createdAt: { $gte: range.start, $lte: range.end },
        })
          .sort({ createdAt: -1 })
          .limit(20)
          .lean()
          .exec()
      : [],
  ])) as [AnalyticsRow | null, AnalyticsRow[], AnalyticsRow[]]

  const orderRestaurantIds = [
    ...new Set(orderRows.map((order) => String(order.restaurantId ?? "")).filter(Boolean)),
  ]
  const restaurants = orderRestaurantIds.length
    ? await RestaurantModel.find({ _id: { $in: orderRestaurantIds } })
        .select({ name: 1 })
        .lean() as any[]
    : []
  const restaurantMap = new Map(restaurants.map((restaurant) => [String(restaurant._id), restaurant]))

  const totals = orderRows.reduce<{
    orders: number
    deliveredOrders: number
    cancelledOrders: number
    spend: number
    firstOrderAt: Date | null
    lastOrderAt: Date | null
    paymentMethods: Record<string, number>
    restaurants: Record<string, { orders: number; revenue: number }>
  }>(
    (acc, order) => {
      const paymentMethod = String(order.paymentMethod ?? "unknown")
      const restaurantId = String(order.restaurantId ?? "")
      acc.orders += 1
      acc.deliveredOrders += order.status === "Delivered" ? 1 : 0
      acc.cancelledOrders += ["Cancelled", "Rejected"].includes(String(order.status ?? "")) ? 1 : 0
      acc.spend += countValue(order.pricing?.total)
      const createdAt = order.createdAt ? new Date(order.createdAt) : null
      if (createdAt && (!acc.firstOrderAt || createdAt < acc.firstOrderAt)) acc.firstOrderAt = createdAt
      if (createdAt && (!acc.lastOrderAt || createdAt > acc.lastOrderAt)) acc.lastOrderAt = createdAt
      acc.paymentMethods[paymentMethod] = (acc.paymentMethods[paymentMethod] ?? 0) + 1
      if (restaurantId) {
        const current = acc.restaurants[restaurantId] ?? { orders: 0, revenue: 0 }
        current.orders += 1
        current.revenue += countValue(order.pricing?.total)
        acc.restaurants[restaurantId] = current
      }
      return acc
    },
    {
      orders: 0,
      deliveredOrders: 0,
      cancelledOrders: 0,
      spend: 0,
      firstOrderAt: null,
      lastOrderAt: null,
      paymentMethods: {},
      restaurants: {},
    },
  )

  const paymentMethods = Object.entries(totals.paymentMethods)
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count)

  const topRestaurants = Object.entries(totals.restaurants)
    .map(([restaurantId, row]) => ({
      restaurantId,
      restaurantName: String(restaurantMap.get(restaurantId)?.name ?? restaurantId),
      orders: row.orders,
      revenue: row.revenue,
    }))
    .sort((left, right) => right.orders - left.orders)

  const orderTrendMap = new Map<string, { orders: number; revenue: number }>()
  for (const order of orderRows) {
    const key = dateKey(new Date(order.createdAt ?? new Date()))
    const current = orderTrendMap.get(key) ?? { orders: 0, revenue: 0 }
    current.orders += 1
    current.revenue += countValue(order.pricing?.total)
    orderTrendMap.set(key, current)
  }

  const recentActivities = eventRows.slice(0, 20).map((event) => ({
    eventType: String(event.eventType ?? ""),
    path: String(event.path ?? ""),
    screenName: String(event.screenName ?? ""),
    entityType: String(event.entityType ?? ""),
    entityId: String(event.entityId ?? ""),
    occurredAt: toIso(event.occurredAt),
  }))

  return {
    timeframe: buildTimeframe(range),
    actorType,
    customerId,
    anonymousId,
    fullName: String(customerDoc?.fullName ?? ""),
    phone: String(customerDoc?.phone ?? ""),
    status: String(customerDoc?.status ?? "guest"),
    createdAt: toIso(customerDoc?.createdAt),
    lastLoginAt: toIso(customerDoc?.lastLoginAt),
    lifetimeOrders: totals.orders,
    timeframeOrders: totals.orders,
    deliveredOrders: totals.deliveredOrders,
    cancelledOrders: totals.cancelledOrders,
    lifetimeSpend: totals.spend,
    timeframeSpend: totals.spend,
    averageOrderValue: totals.orders > 0 ? Math.round((totals.spend / totals.orders) * 100) / 100 : 0,
    firstOrderAt: toIso(totals.firstOrderAt),
    lastOrderAt: toIso(totals.lastOrderAt),
    favoritePaymentMethod: paymentMethods[0]?.label ?? "unknown",
    paymentMethods,
    topRestaurants,
    orderTrend: (eachTrendDate(range) ?? [...orderTrendMap.keys()].sort()).map((date) => {
      const row = orderTrendMap.get(date)
      return {
        date,
        orders: row?.orders ?? 0,
        revenue: row?.revenue ?? 0,
      }
    }),
    recentOrders: orderRows.slice(0, 12).map((order) => ({
      orderId: String(order._id ?? ""),
      orderNumber: String(order.orderNumber ?? ""),
      restaurantId: String(order.restaurantId ?? ""),
      restaurantName: String(restaurantMap.get(String(order.restaurantId ?? ""))?.name ?? ""),
      status: String(order.status ?? ""),
      paymentMethod: String(order.paymentMethod ?? ""),
      paymentStatus: displayOrderPaymentStatus(order),
      total: countValue(order.pricing?.total),
      createdAt: toIso(order.createdAt),
    })),
    recentActivities,
  }
}

export async function getAdminCustomerAnalyticsOverview(params: AdminCustomerAnalyticsQuery = {}) {
  const range = resolveRange(params)
  const key = buildCacheKey("overview", cacheScopeKey(params), range.preset, range.start.toISOString(), range.end.toISOString(), params.limit ?? DEFAULT_LIMIT)
  return overviewCache.getOrSet(key, () => buildOverview(params))
}

export async function getAdminCustomerAnalyticsFunnels(params: AdminCustomerAnalyticsQuery = {}) {
  const range = resolveRange(params)
  const key = buildCacheKey("funnels", cacheScopeKey(params), range.preset, range.start.toISOString(), range.end.toISOString(), params.limit ?? DEFAULT_LIMIT)
  return funnelCache.getOrSet(key, () => buildFunnel(params))
}

export async function getAdminCustomerAnalyticsCustomers(params: AdminCustomerAnalyticsQuery = {}) {
  const range = resolveRange(params)
  const key = buildCacheKey("customers", cacheScopeKey(params), range.preset, range.start.toISOString(), range.end.toISOString(), params.limit ?? DEFAULT_LIMIT)
  return customerCache.getOrSet(key, () => buildCustomerRows(range, normalizeLimit(params.limit), params))
}

export async function getAdminCustomerAnalyticsPayments(params: AdminCustomerAnalyticsQuery = {}) {
  const range = resolveRange(params)
  const key = buildCacheKey("payments", cacheScopeKey(params), range.preset, range.start.toISOString(), range.end.toISOString())
  return paymentsCache.getOrSet(key, () => buildPayments(params))
}

export async function getAdminCustomerAnalyticsEvents(
  params: AdminCustomerAnalyticsEventsQuery = {},
) {
  return buildEventsExplorer(params)
}

export async function getAdminCustomerAnalyticsActorDetail(
  params: AdminCustomerAnalyticsQuery & { customerId?: string; anonymousId?: string },
) {
  const range = resolveRange(params)
  const key = buildCacheKey(
    "actor-detail",
    cacheScopeKey(params),
    range.preset,
    range.start.toISOString(),
    range.end.toISOString(),
    params.customerId ?? "",
    params.anonymousId ?? "",
  )
  return actorDetailCache.getOrSet(key, () => buildActorDetail(params))
}

// ---------------------------------------------------------------------------
// Restaurant view analytics — per-restaurant, time-windowed counts + in-app
// source attribution (carousel / featured / others) + a daily series.
// ---------------------------------------------------------------------------

const RESTAURANT_VIEW_WINDOWS = [
  { key: "5m", label: "Last 5 min" },
  { key: "10m", label: "Last 10 min" },
  { key: "20m", label: "Last 20 min" },
  { key: "1h", label: "Last 1 hour" },
  { key: "24h", label: "Last 24 hours" },
  { key: "today", label: "Today" },
] as const

export type RestaurantViewWindowKey =
  (typeof RESTAURANT_VIEW_WINDOWS)[number]["key"]

const DHAKA_OFFSET_MS = 6 * 60 * 60_000
const RESTAURANT_VIEW_DATE_DAYS = 14
const DAY_MS = 24 * 60 * 60_000

const RESTAURANT_VIEW_SOURCE_LABELS: Record<string, string> = {
  carousel: "Carousel",
  featured: "Featured",
  deals: "Deals",
  live_section: "Live section",
  home_nearby: "Home (nearby)",
  home: "Home",
  search: "Search",
  browse: "Browse all",
  reorder: "Reorder",
  direct: "Direct / link",
}

function restaurantViewSourceLabel(source: string) {
  const key = source.trim().toLowerCase()
  if (!key) return "Unknown"
  return (
    RESTAURANT_VIEW_SOURCE_LABELS[key] ??
    key.charAt(0).toUpperCase() + key.slice(1)
  )
}

// Start of "today" in Asia/Dhaka (UTC+6, no DST), expressed as the equivalent UTC instant.
function dhakaStartOfToday(now: Date) {
  const shifted = new Date(now.getTime() + DHAKA_OFFSET_MS)
  const midnightUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  )
  return new Date(midnightUtc - DHAKA_OFFSET_MS)
}

function dhakaDateKey(date: Date) {
  const shifted = new Date(date.getTime() + DHAKA_OFFSET_MS)
  const year = shifted.getUTCFullYear()
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0")
  const day = String(shifted.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

type RestaurantViewWindowRow = {
  key: RestaurantViewWindowKey
  label: string
  views: number
  visitors: number
}

type RestaurantViewSourceRow = {
  source: string
  label: string
  views: number
  visitors: number
  sharePct: number
}

type RestaurantViewDateRow = {
  date: string
  views: number
  visitors: number
}

export type RestaurantViewStatsResponse = {
  restaurantId: string
  restaurantName: string
  generatedAt: string
  window: { key: RestaurantViewWindowKey; label: string }
  totals: { views: number; visitors: number }
  windows: RestaurantViewWindowRow[]
  bySource: RestaurantViewSourceRow[]
  byDate: RestaurantViewDateRow[]
}

const restaurantViewStatsCache =
  createInMemoryAsyncCache<RestaurantViewStatsResponse>({
    ttlMs: 8_000,
    staleWhileRevalidateMs: 20_000,
    maxEntries: 60,
  })

async function buildRestaurantViewStats(
  restaurantId: string,
  windowKey: RestaurantViewWindowKey,
): Promise<RestaurantViewStatsResponse> {
  const now = new Date()
  const startOfToday = dhakaStartOfToday(now)
  const boundaries: Record<RestaurantViewWindowKey, Date> = {
    "5m": new Date(now.getTime() - 5 * 60_000),
    "10m": new Date(now.getTime() - 10 * 60_000),
    "20m": new Date(now.getTime() - 20 * 60_000),
    "1h": new Date(now.getTime() - 60 * 60_000),
    "24h": new Date(now.getTime() - DAY_MS),
    today: startOfToday,
  }
  // The overall match covers the widest range needed (the daily series); the facet branches then
  // narrow to each window. One restaurant's views over 14 days is a small, indexed set.
  const byDateStart = new Date(
    startOfToday.getTime() - (RESTAURANT_VIEW_DATE_DAYS - 1) * DAY_MS,
  )
  const windowStart = boundaries[windowKey] ?? boundaries["24h"]

  // Build the window facet dynamically: views (count) + visitors (distinct, via a null-sentinel
  // set that we strip with $setDifference) for each window in one $group.
  const windowGroup: Record<string, unknown> = { _id: null }
  const windowProject: Record<string, unknown> = { _id: 0 }
  for (const win of RESTAURANT_VIEW_WINDOWS) {
    const boundary = boundaries[win.key]
    windowGroup[`${win.key}_views`] = {
      $sum: { $cond: [{ $gte: ["$occurredAt", boundary] }, 1, 0] },
    }
    windowGroup[`${win.key}_visitors`] = {
      $addToSet: {
        $cond: [{ $gte: ["$occurredAt", boundary] }, "$visitorKey", null],
      },
    }
    windowProject[`${win.key}_views`] = 1
    windowProject[`${win.key}_visitors`] = {
      $size: { $setDifference: [`$${win.key}_visitors`, [null, ""]] },
    }
  }

  const pipeline: any[] = [
    {
      $match: {
        eventType: "restaurant_view",
        entityId: restaurantId,
        occurredAt: { $gte: byDateStart },
      },
    },
    {
      // A person = their persistent device id (anonymousId), falling back to the session id.
      $addFields: {
        visitorKey: {
          $cond: [
            { $gt: [{ $strLenCP: { $ifNull: ["$anonymousId", ""] } }, 0] },
            "$anonymousId",
            { $ifNull: ["$sessionId", ""] },
          ],
        },
      },
    },
    {
      $facet: {
        windows: [{ $group: windowGroup }, { $project: windowProject }],
        bySource: [
          { $match: { occurredAt: { $gte: windowStart } } },
          {
            $group: {
              _id: "$source",
              views: { $sum: 1 },
              visitors: { $addToSet: "$visitorKey" },
            },
          },
          {
            $project: {
              _id: 0,
              source: "$_id",
              views: 1,
              visitors: {
                $size: { $setDifference: ["$visitors", [null, ""]] },
              },
            },
          },
          { $sort: { views: -1 } },
        ],
        byDate: [
          {
            $group: {
              _id: {
                $dateToString: {
                  format: "%Y-%m-%d",
                  date: "$occurredAt",
                  timezone: "Asia/Dhaka",
                },
              },
              views: { $sum: 1 },
              visitors: { $addToSet: "$visitorKey" },
            },
          },
          {
            $project: {
              _id: 0,
              date: "$_id",
              views: 1,
              visitors: {
                $size: { $setDifference: ["$visitors", [null, ""]] },
              },
            },
          },
        ],
      },
    },
  ]

  const [restaurant, aggregateResult] = await Promise.all([
    isValidObjectId(restaurantId)
      ? RestaurantModel.findById(restaurantId).select("name").lean()
      : null,
    CustomerAnalyticsEventModel.aggregate(pipeline),
  ])

  const facet = (aggregateResult[0] ?? {}) as {
    windows?: Record<string, number>[]
    bySource?: { source?: string; views?: number; visitors?: number }[]
    byDate?: { date?: string; views?: number; visitors?: number }[]
  }

  const windowsRaw = facet.windows?.[0] ?? {}
  const windows: RestaurantViewWindowRow[] = RESTAURANT_VIEW_WINDOWS.map(
    (win) => ({
      key: win.key,
      label: win.label,
      views: countValue(windowsRaw[`${win.key}_views`]),
      visitors: countValue(windowsRaw[`${win.key}_visitors`]),
    }),
  )

  const sourceRows = facet.bySource ?? []
  const sourceViewTotal = sourceRows.reduce(
    (sum, row) => sum + countValue(row.views),
    0,
  )
  const bySource: RestaurantViewSourceRow[] = sourceRows.map((row) => {
    const source = stringValue(row.source)
    const views = countValue(row.views)
    return {
      source: source || "unknown",
      label: restaurantViewSourceLabel(source),
      views,
      visitors: countValue(row.visitors),
      sharePct:
        sourceViewTotal > 0
          ? Math.round((views / sourceViewTotal) * 1000) / 10
          : 0,
    }
  })

  const byDateMap = new Map(
    (facet.byDate ?? []).map((row) => [stringValue(row.date), row]),
  )
  const byDate: RestaurantViewDateRow[] = []
  for (let index = 0; index < RESTAURANT_VIEW_DATE_DAYS; index += 1) {
    const day = new Date(startOfToday.getTime() - index * DAY_MS)
    const key = dhakaDateKey(day)
    const row = byDateMap.get(key)
    byDate.push({
      date: key,
      views: countValue(row?.views),
      visitors: countValue(row?.visitors),
    })
  }

  const selected =
    windows.find((win) => win.key === windowKey) ?? windows[windows.length - 1]

  return {
    restaurantId,
    restaurantName: stringValue((restaurant as { name?: string } | null)?.name),
    generatedAt: now.toISOString(),
    window: { key: selected.key, label: selected.label },
    totals: { views: selected.views, visitors: selected.visitors },
    windows,
    bySource,
    byDate,
  }
}

export async function getAdminRestaurantViewStats(params: {
  restaurantId: string
  window?: RestaurantViewWindowKey
}) {
  const restaurantId = params.restaurantId.trim()
  const windowKey: RestaurantViewWindowKey = params.window ?? "24h"
  const key = buildCacheKey("restaurant-views", restaurantId, windowKey)
  return restaurantViewStatsCache.getOrSet(key, () =>
    buildRestaurantViewStats(restaurantId, windowKey),
  )
}


