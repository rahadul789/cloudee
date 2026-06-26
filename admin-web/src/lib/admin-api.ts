import { adminRequest, getApiBaseUrl } from "./api"
import { getAdminAccessToken } from "./admin-session"
import { clearAdminSession, setAdminSession } from "./admin-session"
import { getAdminZoneScopeQueryParams } from "./admin-zone-scope"

export type ReviewIssue = {
  section: string
  title: string
  fields?: string[]
  note?: string
}

export type ReviewCase = {
  _id: string
  ownerId: string
  draftId: string
  restaurantId: string | null
  status: "submitted" | "under_review" | "approved" | "rejected"
  submittedSnapshot: Record<string, unknown>
  reviewNote: string
  reviewIssues: ReviewIssue[]
  reviewedByAdminId: string | null
  submittedAt: string
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
}

export type SupportCaseStatus = "open" | "in_progress" | "resolved" | "closed"
export type SupportCasePriority = "low" | "medium" | "high"

export type SupportCaseReply = {
  message: string
  senderType?: "admin" | "customer"
  senderId?: string
  senderName?: string
  attachments?: Array<{
    url?: string
    publicId?: string
    fileName?: string
    fileType?: string
  }>
  createdAt: string
}

export type SupportCase = {
  _id: string
  ownerId?: string | null
  restaurantId?: string | null
  source?: "owner" | "customer"
  customerId?: string | null
  customerSnapshot?: {
    fullName?: string
    phone?: string
    email?: string
  }
  kind: "report" | "question"
  subject: string
  categoryId: string
  message: string
  status: SupportCaseStatus
  priority: SupportCasePriority
  attachments?: Array<{
    url?: string
    publicId?: string
    fileName?: string
    fileType?: string
  }>
  replies?: SupportCaseReply[]
  createdAt: string
  updatedAt: string
}

export type AdminSupportSlaState = {
  key: "done" | "overdue" | "due_soon" | "healthy"
  label: string
  minutesRemaining: number | null
}

export type AdminSupportCase = {
  id: string
  source: "customer" | "owner" | "rider" | "admin" | string
  ownerId: string
  restaurantId: string
  customerId: string
  riderId: string
  orderId: string
  restaurantName: string
  orderNumber: string
  requesterName: string
  requesterPhone: string
  kind: "report" | "question"
  subject: string
  categoryId: string
  message: string
  status: SupportCaseStatus
  priority: SupportCasePriority
  assignedAdminId: string
  assignedAdminName: string
  slaDueAt: string | null
  sla: AdminSupportSlaState
  firstResponseAt: string | null
  resolvedAt: string | null
  closedAt: string | null
  resolutionNote: string
  tags: string[]
  attachmentCount: number
  replyCount: number
  latestReplyMessage: string
  latestReplyAt: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type AdminSupportDetails = {
  supportCase: AdminSupportCase
  messages: Array<{
    id: string
    senderType: string
    senderName: string
    message: string
    createdAt: string | null
    attachments: Array<{
      url?: string
      publicId?: string
      fileName?: string
      fileType?: string
    }>
  }>
  internalNotes: Array<{
    id: string
    note: string
    adminName: string
    createdAt: string | null
  }>
  history: Array<{
    id: string
    action: string
    actorName: string
    note: string
    previousValue: string
    nextValue: string
    createdAt: string | null
  }>
  order: null | {
    id: string
    orderNumber: string
    status: string
    total: number
    paymentMethod: string
    paymentStatus: string
    createdAt: string | null
  }
  auditLogs: Array<{
    id: string
    action: string
    title: string
    description: string
    actorName: string
    createdAt: string | null
    metadata: Record<string, unknown>
  }>
}

export type AdminReportsPreset =
  | "today"
  | "yesterday"
  | "last7Days"
  | "last30Days"
  | "last90Days"
  | "thisMonth"
  | "lastMonth"
  | "lifetime"
  | "custom"

export type AdminReportsResponse = {
  timeframe: {
    preset: AdminReportsPreset
    start: string
    end: string
    days: number
  }
  overview: {
    deliveredRevenue: number
    deliveredSubtotalGross: number
    deliveredOrders: number
    averageOrderValue: number
    revenueChangePercent: number
    ordersChangePercent: number
    aovChangePercent: number
    platformCommission: number
    restaurantPayable: number
    discountCost: number
    platformDiscountCost: number
    deliveryFees: number
    riderPayrollExpense: number
    platformGrossIncome: number
    platformOperatingExpense: number
    estimatedPlatformMargin: number
    newCustomers: number
    totalCustomers: number
    activeUsersToday: number
    activeUsersMonth: number
    orderingCustomers: number
    repeatCustomers: number
    repeatRate: number
    activeRestaurants: number
    averageServiceMinutes: number
    reviewCount: number
    averageRating: number
  }
  comparison: {
    previousDeliveredRevenue: number
    previousDeliveredOrders: number
    previousAverageOrderValue: number
    revenueChangePercent: number
    ordersChangePercent: number
    aovChangePercent: number
  }
  reconciliation: {
    orderSubtotalGross: number
    customerCollected: number
    ledgerGrossAmount: number
    difference: number
    tolerance: number
    status: "ok" | "warning"
    message: string
  }
  sales: {
    trend: Array<{ date: string; label: string; orders: number; revenue: number }>
    hourly: Array<{ hour: number; label: string; orders: number; revenue: number }>
    dayOfWeek: Array<{ day: string; orders: number; revenue: number }>
    ledger: {
      grossAmount: number
      commissionBase: number
      platformCommission: number
      restaurantPayable: number
      discountCost: number
      platformDiscountCost: number
      deliveryCost: number
      pending: number
      available: number
      paidOut: number
    }
    platformMargin: {
      platformCommission: number
      deliveryFees: number
      platformGrossIncome: number
      platformDiscountCost: number
      riderPayrollExpense: number
      riderBaseSalary: number
      riderPlatformBonus: number
      riderPenalties: number
      riderPayrollPending: number
      riderPayrollPaid: number
      platformOperatingExpense: number
      estimatedPlatformMargin: number
      payrollMonths: string[]
    }
  }
  orders: {
    statusDistribution: Array<{ status: string; count: number; revenue: number }>
    cancellationReasons: Array<{ reason: string; count: number }>
    cancellationByActor: Array<{ actor: string; count: number }>
    refunds: {
      pendingCount: number
      pendingAmount: number
      refundedCount: number
      refundedAmount: number
      rejectedCount: number
      ledgerRefundCount: number
      ledgerRefundAmount: number
    }
  }
  payments: Array<{ method: string; orders: number; amount: number; paid: number }>
  restaurants: Array<{
    restaurantId: string
    name: string
    city: string
    deliveredOrders: number
    deliveredRevenue: number
    averageOrderValue: number
  }>
  customers: {
    newCustomers: number
    totalCustomers: number
    topCustomers: Array<{
      customerId: string
      name: string
      phone: string
      deliveredOrders: number
      spend: number
      lastOrderedAt: string | null
    }>
  }
  riders: Array<{
    riderId: string
    name: string
    phone: string
    deliveredTrips: number
    payrollExpense: number
    payrollPending: number
    payrollPaid: number
  }>
  topItems: Array<{
    itemId: string
    name: string
    categoryName: string
    quantity: number
    revenue: number
    orders: number
  }>
  promotions: Array<{
    voucherId: string
    name: string
    code: string
    fundedBy: string
    uses: number
    discount: number
    ownerFundedDiscount: number
    platformFundedDiscount: number
    deliveredRevenue: number
  }>
}

export type AdminServiceZone = {
  id: string
  districtId: string
  districtName: string
  name: string
  slug: string
  status: "active" | "paused" | "archived"
  center: { latitude: number; longitude: number } | null
  radiusKm: number
  priority: number
  displayOrder: number
  delivery: {
    baseFeeTaka?: number | null
    distanceSurchargeEnabled?: boolean | null
    surchargeStartsAfterKm?: number | null
    surchargeStepMeters?: number | null
    surchargeAmountTaka?: number | null
    maxRestaurantDistanceKm?: number | null
    rainSurchargeEnabled?: boolean
    rainSurchargeTaka?: number
  }
  dispatch: {
    autoAssignEnabled?: boolean
    dispatchMode?: "fleet" | "primary_rider" | null
    primaryRiderId?: string
    primaryRiderFallbackEnabled?: boolean | null
    algorithm?: "nearest_eligible_balanced" | "least_loaded_first" | null
    maxActiveOrdersPerRiderOverride?: number | null
    staleLocationCutoffMinutes?: number | null
    retryCooldownMinutes?: number | null
  }
  notes: string
  createdAt: string
  updatedAt: string
}

export type AdminServiceDistrict = {
  id: string
  name: string
  slug: string
  status: "active" | "paused" | "archived"
  country: string
  displayOrder: number
  notes: string
  zones: AdminServiceZone[]
  createdAt: string
  updatedAt: string
}

export type AdminServiceAreasResponse = {
  districts: AdminServiceDistrict[]
  zones: AdminServiceZone[]
}

export type AdminServiceDistrictPayload = {
  name: string
  slug?: string
  status?: "active" | "paused" | "archived"
  country?: string
  displayOrder?: number
  notes?: string
}

export type AdminServiceZonePayload = {
  districtId: string
  name: string
  slug?: string
  status?: "active" | "paused" | "archived"
  center: { latitude: number; longitude: number }
  radiusKm: number
  priority?: number
  displayOrder?: number
  delivery?: AdminServiceZone["delivery"]
  dispatch?: AdminServiceZone["dispatch"]
  notes?: string
}

export type AdminFoodCategoryStatus = "active" | "archived"
export type AdminFoodCategoryHealth = "all" | "empty" | "needs_review" | "duplicate" | "healthy"
export type AdminFoodCategorySort = "newest" | "oldest" | "mostItems" | "emptyFirst" | "name"

export type AdminFoodCategory = {
  id: string
  restaurantId: string
  restaurantName: string
  restaurantCity: string
  restaurantAddress: string
  restaurantVisible: boolean
  ownerId: string
  name: string
  slug: string
  description: string
  status: AdminFoodCategoryStatus
  displayOrder: number
  totalItems: number
  activeItems: number
  unavailableItems: number
  archivedItems: number
  duplicateNameCount: number
  needsReview: boolean
  flags: Array<{
    key: "empty" | "no_active_items" | "duplicate_name" | "archived" | "blocked_keyword"
    label: string
    tone: "warning" | "critical" | "neutral"
  }>
  createdAt: string | null
  updatedAt: string | null
}

export type AdminFoodCategoryDetails = {
  category: AdminFoodCategory
  sales: {
    deliveredOrders: number
    deliveredRevenue: number
    itemQuantity: number
    topItem: null | { name: string; quantity: number; revenue: number }
    recentOrders: Array<{
      id: string
      orderNumber: string
      customerName: string
      categoryRevenue: number
      createdAt: string | null
    }>
  }
  duplicateSuggestions: Array<{
    id: string
    name: string
    status: string
    updatedAt: string | null
  }>
  menuItems: Array<{
    id: string
    name: string
    status: string
    availability: string
    basePrice: number
    isPopular: boolean
    imageUrl: string
    updatedAt: string | null
  }>
  auditLogs: Array<{
    id: string
    action: string
    title: string
    description: string
    actorName: string
    createdAt: string | null
    metadata: Record<string, unknown>
  }>
}

export type AdminReviewModerationStatus = "visible" | "hidden" | "flagged"
export type AdminReviewSort = "newest" | "oldest" | "highest" | "lowest"

export type AdminReview = {
  id: string
  restaurantId: string
  restaurantName: string
  restaurantCity: string
  customerId: string
  customerName: string
  customerPhone: string
  orderId: string
  orderNumber: string
  orderStatus: string
  rating: number
  comment: string
  ownerReplyMessage: string
  ownerReplyCreatedAt: string | null
  ownerReplyUpdatedAt: string | null
  moderationStatus: AdminReviewModerationStatus
  isHidden: boolean
  hiddenAt: string | null
  hiddenByAdminId: string
  hiddenReason: string
  flaggedAt: string | null
  flaggedByAdminId: string
  flaggedReason: string
  createdAt: string | null
  updatedAt: string | null
}

export type AdminReviewDetails = {
  review: AdminReview
  order: null | {
    id: string
    orderNumber: string
    status: string
    total: number
    paymentMethod: string
    paymentStatus: string
    itemCount: number
    createdAt: string | null
    deliveredAt: string | null
  }
  moderationHistory: Array<{
    action: string
    reason: string
    adminId: string
    createdAt: string | null
  }>
  auditLogs: Array<{
    id: string
    action: string
    title: string
    description: string
    actorName: string
    createdAt: string | null
    metadata: Record<string, unknown>
  }>
}

export type AdminRiderPayroll = {
  month: string
  cycleId: string
  isPayrollEnabled: boolean
  monthlySalary: number
  payoutDay: number
  nextPayoutDate: string | null
  baseSalary: number
  platformBonus: number
  penalties: number
  netPayable: number
  paidAmount: number
  pendingAmount: number
  status: "draft" | "approved" | "paid"
  approvedAt: string | null
  paidAt: string | null
  paymentReference: string
  note: string
  adjustments: Array<{
    id: string
    type: string
    amount: number
    note: string
    createdAt: string | null
    createdByAdminId: string
  }>
  lifetimeEarnings?: number
  estimatedPayable?: number
  paidOut: number
  pending: number
}

export type AdminRiderSummary = {
  id: string
  fullName: string
  phone: string
  status: "active" | "suspended" | "locked"
  vehicleType: string
  isAvailableForAssignments: boolean
  activeTrackingOrderId: string
  lastLoginAt: string | null
  lastKnownLocation: null | {
    latitude: number | null
    longitude: number | null
    heading: number | null
    accuracyMeters: number | null
    lastUpdatedAt: string | null
    speedKmph: number
  }
  activeOrders: number
  liveTrips: number
  deliveredTrips: number
  deliveredFees: number
  cancelledTrips: number
  totalAssignedTrips: number
  completionRate: number
  averageDeliveryMinutes: number
  payout: AdminRiderPayroll
  payroll: AdminRiderPayroll
  verification: {
    status: "pending" | "approved" | "rejected"
    nationalIdNumber: string
    documentFrontUrl: string
    documentBackUrl: string
    selfieUrl: string
    hasDocuments: boolean
    reviewNote: string
    submittedAt: string | null
    reviewedAt: string | null
    reviewedByAdminId: string
  }
  createdAt: string | null
  updatedAt: string | null
}

export type AdminRiderPayrollSnapshot = {
  month: string
  summary: {
    riders: number
    baseSalary: number
    platformBonus: number
    penalties: number
    netPayable: number
    pending: number
    paid: number
    approved: number
    draft: number
    paidCycles: number
  }
  items: Array<{
    riderId: string
    riderName: string
    phone: string
    status: string
    verificationStatus: string
    payroll: AdminRiderPayroll
  }>
}

export type AdminLiveMapDelivery = {
  id: string
  orderNumber: string
  status: "New" | "Accepted" | "Preparing" | "ReadyForPickup" | "PickedUp"
  paymentMethod: string
  total: number
  createdAt: string | null
  readyAt: string | null
  pickedUpAt: string | null
  readyWaitMinutes: number
  pickedUpMinutes: number
  isTrackingActive: boolean
  isNearCustomer: boolean
  isDelayed: boolean
  delaySeverity: "none" | "warning" | "critical"
  delayReason: string
  rider: null | {
    id: string
    fullName: string
    phone: string
    status: string
    vehicleType: string
    isAvailableForAssignments: boolean
    activeTrackingOrderId: string
    lastLoginAt: string | null
    activeOrderCount: number
    readyOrderCount: number
    pickedUpOrderCount: number
    activeOrderNumbers: string[]
    location: null | {
      latitude: number | null
      longitude: number | null
      heading: number | null
      accuracyMeters: number | null
      lastUpdatedAt: string | null
      speedKmph: number
    }
  }
  restaurant: {
    id: string
    name: string
    latitude: number | null
    longitude: number | null
    address: string
    city: string
    phone: string
    isOnline: boolean
  }
  customer: {
    id: string
    name: string
    phone: string
    deliveryAddress: {
      label: string
      addressLine: string
      latitude: number | null
      longitude: number | null
    }
  }
  tracking: {
    remainingDistanceKm: number
    remainingDurationMinutes: number
    speedKmph: number
    lastUpdatedAt: string | null
  }
}

export type AdminLiveMapRider = {
  id: string
  fullName: string
  phone: string
  status: string
  vehicleType: string
  isAvailableForAssignments: boolean
  activeTrackingOrderId: string
  lastLoginAt: string | null
  liveOrderId: string
  liveOrderNumber: string
  activeOrderCount: number
  readyOrderCount: number
  pickedUpOrderCount: number
  activeOrderNumbers: string[]
  currentLocation: null | {
    latitude: number | null
    longitude: number | null
    heading: number | null
    accuracyMeters: number | null
    lastUpdatedAt: string | null
    speedKmph: number
  }
}

export type AdminLiveMapRestaurant = {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
  address: string
  city: string
  phone: string
  isOnline: boolean
  isVisible: boolean
  activeOrders: number
  delayedOrders: number
  readyForPickup: number
  pickedUp: number
  statusCounts: Record<string, number>
  latestOrder: null | {
    id: string
    orderNumber: string
    status: string
    updatedAt: string | null
  }
}

export type AdminLiveMapSnapshot = {
  summary: {
    activeRiders: number
    availableRiders: number
    liveTrips: number
    readyForPickup: number
    nearCustomer: number
    delayedTrips: number
    warningDelays: number
    criticalDelays: number
    unassignedReady: number
    restaurants: number
    onlineRestaurants: number
    restaurantsWithLiveOrders: number
  }
  deliveries: AdminLiveMapDelivery[]
  riders: AdminLiveMapRider[]
  restaurants: AdminLiveMapRestaurant[]
  lastUpdatedAt: string | null
}

export type AdminRiderDetails = AdminRiderSummary & {
  createdAt: string | null
  pushTokens: Array<{
    platform: string
    appVersion: string
    deviceId: string
    lastSeenAt: string | null
    disabledAt: string | null
  }>
  availability: {
    isOnline: boolean
    currentSessionStartedAt: string | null
    todayActiveSeconds: number
    averageDailyActiveSeconds7d: number
    averageDailyActiveSeconds30d: number
    activeDaysLast7d: number
    lastOnlineAt: string | null
    lastOfflineAt: string | null
    sessionCountToday: number
    sessions: Array<{
      id: string
      startedAt: string | null
      endedAt: string | null
      durationSeconds: number
      status: "online" | "closed" | string
      startSource: string
      endSource: string
      endReason: string
    }>
  }
  summary: {
    activeOrders: number
    liveTrips: number
    deliveredTrips: number
    deliveredFees: number
    cancelledTrips: number
    totalAssignedTrips: number
    totalDeliveryMinutes: number
    deliveredWithDuration: number
  }
  activeOrders: Array<{
    id: string
    orderNumber: string
    restaurantName: string
    customerName: string
    status: string
    total: number
    createdAt: string | null
    assignedAt: string | null
    acknowledgedAt: string | null
    readyAt: string | null
    pickedUpAt: string | null
    isTrackingActive: boolean
    trackingFreshness: string
    trackingLastUpdatedAt: string | null
    remainingDistanceKm: number
    remainingDurationMinutes: number
    speedKmph: number
  }>
  recentTrips: Array<{
    id: string
    orderNumber: string
    restaurantName: string
    customerName: string
    status: string
    total: number
    deliveryFee: number
    createdAt: string | null
    deliveredAt: string | null
  }>
}

export type AdminRiderAssignmentCandidate = {
  id: string
  orderNumber: string
  restaurantId: string
  riderId: string
  restaurantName: string
  customerName: string
  customerPhone: string
  deliveryAddress: string
  total: number
  createdAt: string | null
}

export type AdminBulkRiderAssignmentResult = {
  assigned: number
  scanned: number
  skipped: number
  results: Array<{
    orderId: string
    orderNumber: string
    outcome: "assigned" | "skipped" | "no_match"
    riderName: string
    reason: string
  }>
}

export type AdminOperationalHealthSnapshot = {
  generatedAt: string
  systemStatus: "healthy" | "watching" | "needs_attention" | string
  attentionScore: number
  runtime: {
    ready: boolean
    database: string
    uptimeSeconds: number
    memory: {
      rssMb: number
      heapUsedMb: number
      heapTotalMb: number
    }
    nodeEnv: string
    pid: number
  }
  requestMonitor: {
    startedAt: string
    lastCapturedAt: string | null
    windowMinutes: number
    summary: {
      totalRequests: number
      errorRequests: number
      actionableErrorRequests: number
      authSessionRequests: number
      successRequests: number
      averageDurationMs: number
      p95DurationMs: number
      maxDurationMs: number
      requestsPerMinute: number
    }
    byApp: Array<{
      app: string
      totalRequests: number
      errorRequests: number
      actionableErrorRequests: number
      authSessionRequests: number
      averageDurationMs: number
      p95DurationMs: number
      lastSeenAt: string | null
    }>
    endpoints: Array<{
      app: string
      key: string
      method: string
      route: string
      lastPath: string
      totalRequests: number
      errorRequests: number
      actionableErrorRequests: number
      authSessionRequests: number
      successRequests: number
      averageDurationMs: number
      p95DurationMs: number
      statusCounts: Record<string, number>
      errorSamples: Array<{
        code: string
        message: string
        statusCode: number
        lastSeenAt: string
        count: number
      }>
      lastStatusCode: number
      lastSeenAt: string | null
    }>
    recent: Array<{
      app: string
      durationMs: number
      method: string
      path: string
      route: string
      statusCode: number
      errorCode: string
      errorMessage: string
      timestamp: string
    }>
    recentErrors: Array<{
      app: string
      durationMs: number
      method: string
      path: string
      route: string
      statusCode: number
      errorCode: string
      errorMessage: string
      timestamp: string
    }>
  }
  infrastructure: {
    status: "healthy" | "warning" | "critical" | "unknown" | string
    checkedAt: string | null
    components: Array<{
      key: string
      label: string
      status: "healthy" | "warning" | "critical" | "unknown" | string
      message: string
      checkedAt: string
      value?: number | string | null
      threshold?: number | string | null
      details?: Record<string, unknown>
    }>
  }
  summary: {
    openCriticalAlerts: number
    openWarningAlerts: number
    openInfoAlerts: number
    failedSchedules: number
    pendingSchedules: number
    eventsLast24h: number
    criticalEventsLast24h: number
    warningEventsLast24h: number
  }
  schedulerJobs: Array<{
    key: string
    label: string
    status: "idle" | "running" | "ok" | "failed" | string
    lastStartedAt: string | null
    lastFinishedAt: string | null
    lastDurationMs: number | null
    lastError: string
  }>
  timeline: Array<{
    id: string
    event: string
    category: string
    severity: "info" | "warning" | "critical" | string
    title: string
    description: string
    entityType: string
    entityId: string
    actorType: string
    actorId: string
    actorName: string
    metadata: Record<string, unknown>
    createdAt: string | null
  }>
  activeAlerts: Array<{
    id: string
    alertType: string
    severity: "info" | "warning" | "critical" | string
    title: string
    description: string
    source: string
    entityType: string
    entityId: string
    path: string
    iconKey: string
    lastSeenAt: string | null
    createdAt: string | null
    resolvedAt: string | null
    snoozedUntil: string | null
  }>
  schedules: Array<{
    id: string
    title: string
    recipientType: string
    audience: string
    status: string
    scheduledAt: string | null
    sentAt: string | null
    failureReason: string
    updatedAt: string | null
  }>
  realtime: {
    socket: {
      initialized: boolean
      totalConnections: number
      authenticatedConnections: number
      anonymousConnections: number
      adminConnections: number
      ownerConnections: number
      customerConnections: number
      riderConnections: number
      byRole: Record<string, number>
      roomCounts: Record<string, number>
      connections: Array<{
        id: string
        userId: string
        displayName?: string
        contact?: string
        actorLabel?: string
        role: string
        connectedAt: string | null
        connectedForSeconds?: number | null
        rooms: string[]
        businessRooms?: string[]
        primaryRoom?: string
        lifecycleNote?: string
        transport: string
        ipAddress: string
        userAgent: string
      }>
    }
    liveLocation: {
      activeShares: number
      focusedShares: number
      liveShares: number
      staleShares: number
      visibleLimit: number
      sampleSize: number
      orders: Array<{
        id: string
        orderNumber: string
        status: string
        restaurantId: string
        customerId: string
        riderId: string
        customerName: string
        customerPhone: string
        riderName: string
        riderPhone: string
        deliveryAddress: string
        isFocused: boolean
        isNearCustomer: boolean
        startedAt: string | null
        lastUpdatedAt: string | null
        freshness: {
          state: string
          ageSeconds: number | null
          isFresh: boolean
          isStale: boolean
        }
        remainingDistanceKm: number
        directDistanceKm: number
        remainingDurationMinutes: number
        speedKmph: number
        currentLocation: {
          latitude: number
          longitude: number
          heading: number | null
          accuracyMeters: number | null
        } | null
        createdAt: string | null
        updatedAt: string | null
      }>
    }
  }
}

export type AdminRestaurantSummary = {
  id: string
  ownerId: string
  name: string
  slug: string
  description: string
  preparationTimeMinutes: number | null
  cuisines: string[]
  tags: string[]
  city: string
  address: string
  latitude: number | null
  longitude: number | null
  ownerName: string
  ownerPhone: string
  ownerEmail: string
  ownerStatus: string
  restaurantLifecycleStatus: string
  enforcement: {
    status: string
    effectiveStatus: string
    isRestricted: boolean
    reason: string
    ownerNote: string
    customerMessage: string
    internalNote: string
    startsAt: string | null
    expiresAt: string | null
    updatedAt: string | null
    updatedByAdminId: string
    history: Array<Record<string, unknown>>
  }
  isOnline: boolean
  isVisible: boolean
  isFeatured: boolean
  featuredPosition: number | null
  commissionRate: number
  profileCompletionPercentage: number
  totalOrders: number
  liveOrders: number
  deliveredOrders: number
  cancelledOrders: number
  systemCancelledOrders: number
  restaurantCancelledOrders: number
  lateOrders: number
  averageRating: number
  reviewCount: number
  createdAt: string | null
  updatedAt: string | null
  logoUrl: string
  coverImageUrl: string
  hasLogo: boolean
  hasCoverImage: boolean
}

export type AdminRestaurantDetails = AdminRestaurantSummary & {
  owner: {
    id: string
    fullName: string
    phone: string
    email: string
    status: string
    restaurantLifecycleStatus: string
    lastLoginAt: string | null
  }
  payoutMethod: {
    type: string
    accountName: string
    accountNumber: string
    accountNumberMasked: string
    bankName: string
    branchName: string
    isVerified: boolean
    verifiedAt: string | null
  } | null
  openingHours: {
    timezone: string
    weeklySchedule: Array<Record<string, unknown>>
    openDays: number
  } | null
  cancelledOrders: number
  merchandising: {
    isFeatured: boolean
    featuredPosition: number | null
    customerNote: {
      enabled: boolean
      label: string
      placeholder: string
    }
  }
  discovery: {
    isVisible: boolean
    isOnline: boolean
    isFeatured: boolean
    featuredPosition: number | null
    cuisineTypes: string[]
    tags: string[]
    preparationTimeMinutes: number | null
    averageRating: number
    reviewCount: number
    city: string
    address: string
    logoUrl: string
    coverImageUrl: string
  }
  deliveryPricing: {
    override: {
      enabled: boolean
      baseFeeTaka: number | null
      distanceSurchargeEnabled: boolean | null
      surchargeStartsAfterKm: number | null
      surchargeStepMeters: number | null
      surchargeAmountTaka: number | null
      updatedAt: string | null
    }
  }
  menu: {
    totalCategories: number
    activeCategories: number
    archivedCategories: number
    totalItems: number
    activeItems: number
    archivedItems: number
    availableItems: number
    unavailableItems: number
    popularItems: number
    categoriesPath: string
    itemsPath: string
  }
  finance: {
    totalRevenue: number
    grossDeliveredRevenue: number
    windowGrossDeliveredRevenue: number
    totalNetEarnings: number
    windowNetEarnings: number
    availableBalance: number
    pendingBalance: number
    paidOutBalance: number
    totalOutstandingToRestaurant: number
    totalCommission: number
    windowCommission: number
    totalDiscountCost: number
    windowDiscountCost: number
    totalDeliveryCost: number
    windowDeliveryCost: number
    averageOrderValue: number
    windowDeliveredOrders: number
    windowAverageOrderValue: number
    lastPayoutAmount: number
    lastPayoutAt: string | null
    nextSettlementAvailableAt: string | null
    settlementDelayDays: number
    minimumPayoutAmountTaka: number
    oneActivePayoutRequest: boolean
    recentPayouts: Array<{
      id: string
      amount: number
      status: string
      batchReference: string
      provider: string
      providerReference: string
      providerPayoutId: string
      providerTransactionId: string
      paymentProofUrl: string
      processingNote: string
      requestedAt: string | null
      approvedAt: string | null
      processedAt: string | null
      failureReason: string
    }>
  }
  analytics: {
    totalOrders: number
    liveOrders: number
    totalDeliveredOrders: number
    totalCancelledOrders: number
    systemCancelledOrders: number
    restaurantCancelledOrders: number
    lateOrders: number
    repeatCustomerCount: number
    lastOrderAt: string | null
    deliveredTrend: Array<{
      date: string
      label: string
      orders: number
      revenue: number
    }>
    statusDistribution: Array<{
      key: string
      label: string
      count: number
    }>
    topItems: Array<{
      itemId: string
      name: string
      quantity: number
      revenue: number
      orders: number
    }>
    topCustomers: Array<{
      customerId: string
      name: string
      phone: string
      orders: number
      totalSpend: number
      lastOrderedAt: string | null
    }>
  }
  operations: {
    preset: "last7Days" | "last30Days" | "last90Days"
    ordersAnalyzed: number
    averageAcceptanceMinutes: number
    averagePreparationMinutes: number
    averageReadyFromOrderMinutes: number
    averagePickupWaitMinutes: number
    averageDeliveryMinutes: number
    acceptedWithin5MinutesRate: number
    readyWithinEstimateRate: number
    lateOrders: number
    systemCancelledOrders: number
    restaurantCancelledOrders: number
    pickedUpSampleOrders: number
    deliveredSampleOrders: number
    hasLogo: boolean
    hasCoverImage: boolean
  }
  support: {
    summary: {
      total: number
      open: number
      inProgress: number
      resolved: number
      closed: number
    }
    cases: Array<{
      id: string
      subject: string
      categoryId: string
      kind: "report" | "question"
      status: SupportCaseStatus
      priority: SupportCasePriority
      message: string
      createdAt: string | null
      updatedAt: string | null
      replyCount: number
      latestReplyMessage: string
      latestReplyAdminName: string
      latestReplyAt: string | null
    }>
    topReasons: Array<{
      key: string
      label: string
      count: number
    }>
  }
  recentOrders: Array<{
    id: string
    orderNumber: string
    status: string
    paymentMethod: string
    total: number
    customerName: string
    createdAt: string | null
    acceptedAt: string | null
    readyAt: string | null
    pickedUpAt: string | null
    deliveredAt: string | null
    cancelledAt: string | null
    riderId: string
    riderName: string
    riderPhone: string
    acceptanceMinutes: number | null
    preparationMinutes: number | null
    totalServiceMinutes: number | null
    isLate: boolean
    lateReason: string
    lateMinutes: number
    lateTone: "none" | "warning" | "critical" | string
  }>
  recentReviews: Array<{
    id: string
    rating: number
    comment: string
    customerName: string
    createdAt: string | null
    ownerReplyMessage: string
    ownerReplyUpdatedAt: string | null
    moderationStatus?: "visible" | "hidden" | "flagged" | string
    isHidden?: boolean
    hiddenAt?: string | null
    hiddenByAdminId?: string
    hiddenReason?: string
  }>
  activityTimeline: Array<{
    type: string
    title: string
    description: string
    createdAt: string
  }>
  auditLogs: Array<{
    id: string
    action: string
    title: string
    description: string
    actorName: string
    actorRole: string
    createdAt: string | null
    metadata: Record<string, unknown>
  }>
}

export type AdminListResponse<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
  pageCount: number
  summary?: Record<string, number>
}

export type AdminReferralStatus =
  | "pending"
  | "rewarded"
  | "capped"
  | "disabled"
  | "under_review"
  | "rejected"

export type AdminReferralRow = {
  id: string
  status: AdminReferralStatus
  referredAt: string | null
  skippedAt: string | null
  skippedReason: string
  riskScore: number
  referrer: {
    id: string
    fullName: string
    phone: string
    status: string
    referralCode: string
  }
  referredCustomer: {
    id: string
    fullName: string
    phone: string
    status: string
    referralCode: string
    createdAt: string | null
  }
  reward: {
    rewardedAt: string | null
    voucherId: string
    voucherCode: string
    voucherStatus: string
    amount: number
    minimumOrderAmount: number
    expiresAt: string | null
  }
  order: {
    id: string
    orderNumber: string
    status: string
    paymentMethod: string
    paymentStatus: string
    total: number
    deliveredAt: string | null
    createdAt: string | null
    deliveryAddress: {
      label: string
      addressLine: string
    }
  }
  fraud: {
    signupDeviceId: string
    signupIpAddress: string
    signupUserAgent: string
  }
}

export type AdminReferralSummary = {
  totalReferrals: number
  pendingReferrals: number
  rewardedReferrals: number
  underReviewReferrals: number
  blockedReferrals: number
  rewardValue: number
  conversionRate: number
  statusCounts: Record<AdminReferralStatus, number>
}

export type AdminReferralTopReferrer = {
  id: string
  fullName: string
  phone: string
  referralCode: string
  totalReferrals: number
  rewardedReferrals: number
  underReviewReferrals: number
  rejectedReferrals: number
  rewardValue: number
}

export type AdminReferralListResponse = {
  items: AdminReferralRow[]
  total: number
  page: number
  pageSize: number
  pageCount: number
  summary: AdminReferralSummary
  topReferrers: AdminReferralTopReferrer[]
}

export type AdminRestaurantVisibilityUpdate = {
  id: string
  name: string
  isVisible: boolean
  updatedAt: string | null
}

export type AdminRestaurantMerchandisingUpdate = {
  id: string
  name: string
  isFeatured: boolean
  featuredPosition: number | null
  customerNote: {
    enabled: boolean
    label: string
    placeholder: string
  }
  updatedAt: string | null
}

export type AdminRestaurantCommissionUpdate = {
  id: string
  name: string
  commissionRate: number
  updatedAt: string | null
}

export type AdminRestaurantDeliveryPricingUpdate = {
  id: string
  name: string
  override: {
    enabled: boolean
    baseFeeTaka: number | null
    distanceSurchargeEnabled: boolean | null
    surchargeStartsAfterKm: number | null
    surchargeStepMeters: number | null
    surchargeAmountTaka: number | null
    updatedAt: string | null
  }
  updatedAt: string | null
}

export type AdminVoucherMode = "auto" | "coupon"
export type AdminVoucherType =
  | "flat"
  | "percentage"
  | "bogo"
  | "free-delivery"
  | "free_delivery"
  | "threshold-discount"
export type AdminVoucherStatus = "Active" | "Draft"
export type AdminVoucherLifecycle =
  | "all"
  | "Active"
  | "Scheduled"
  | "Expired"
  | "Draft"
  | "Archived"

export type AdminVoucherAnalytics = {
  totalUses: number
  appliedCount?: number
  deliveredCount?: number
  uniqueUsers: number
  repeatUsage: number
  totalDiscountGiven: number
  totalOrdersUsingVoucher: number
  revenueGenerated: number
  remainingUsage: number | null
  totalDeliveryCostCovered: number
  points: Array<{
    label: string
    uses: number
    discount: number
  }>
  usageRows?: Array<{
    id: string
    orderId: string
    orderNumber: string
    customerId: string
    customerName: string
    customerPhone: string
    status: string
    appliedAt: string | null
    deliveredAt: string | null
    discountAmount: number
    ownerDiscountCost: number
    platformDiscountCost: number
    revenue: number
    released: boolean
  }>
}

export type AdminRestaurantVoucher = {
  _id: string
  restaurantId: string
  scopeType: "restaurant" | "selected_restaurants" | "all_restaurants"
  selectedRestaurantIds: string[]
  selectedRestaurants?: Array<{
    id: string
    name: string
    city: string
    address: string
  }>
  audienceType: "all_users" | "new_users" | "returning_users" | "selected_users"
  selectedCustomerIds?: string[]
  customerGroupKey?: string
  display?: {
    showOnHome?: boolean
    showInOfferStrip?: boolean
    placement?: "top" | "after_banner" | "offers_row"
    variant?: "chip" | "block" | "image" | "carousel"
    position?: number
    title?: string
    subtitle?: string
    imageUrl?: string
    carouselImageUrls?: string[]
    openInModal?: boolean
    ctaLabel?: string
    ctaPath?: string
    backgroundColor?: string
    textColor?: string
    accentColor?: string
  }
  displayAnalytics?: {
    impressions?: number
    clicks?: number
    modalOpens?: number
    stripClicks?: number
    lastEventAt?: string | null
  }
  pushCampaign?: {
    enabled?: boolean
    title?: string
    body?: string
    path?: string
    sentAt?: string | null
    sentByAdminId?: string
    totalTargets?: number
    sentCount?: number
    disabledCount?: number
    openCount?: number
    openEvents?: Array<{
      customerId: string
      customerName: string
      customerPhone: string
      openedAt: string
      path: string
    }>
  }
  restaurant?: {
    id: string
    name: string
    city: string
    address: string
  } | null
  createdByType: "owner" | "admin" | "system"
  createdById: string
  fundedBy: "owner" | "platform" | "shared"
  ownerSharePercent: number
  platformSharePercent: number
  stackingRule: "exclusive" | "stackable"
  priority: number
  surface?: "checkout" | "menu_markdown"
  mode: AdminVoucherMode
  type: AdminVoucherType
  name: string
  code: string
  discountValue: number | null
  maxDiscountAmount: number
  minimumOrderAmount: number
  minItemPrice?: number
  maxTotalUses: number | null
  maxUsesPerUser: number
  allowRepeatUsage: boolean
  maxTotalDiscountBudget?: number
  consumedDiscountBudget?: number
  status: AdminVoucherStatus
  applicability: "all" | "categories" | "items"
  categoryIds: string[]
  itemIds: string[]
  cuisineTypes?: string[]
  zoneIds?: string[]
  districtIds?: string[]
  targetCategories?: Array<{ id: string; name: string }>
  targetItems?: Array<{ id: string; name: string }>
  startsAt: string
  endsAt: string
  createdAt: string
  updatedAt: string
  archivedAt?: string | null
  archiveReason?: string
  recentAudits?: Array<{
    id: string
    actorType: "admin" | "owner" | "system"
    actorId: string
    action: "created" | "updated" | "archived" | "restored"
    note: string
    createdAt: string
  }>
  analytics: AdminVoucherAnalytics
}

export type AdminPromotionTargets = {
  categories: Array<{ id: string; name: string }>
  items: Array<{
    id: string
    name: string
    categoryId: string
    basePrice: number
    availability: string
  }>
}

export type AdminVoucherPayload = {
  restaurantId?: string
  scopeType?: "restaurant" | "selected_restaurants" | "all_restaurants"
  selectedRestaurantIds?: string[]
  audienceType?: "all_users" | "new_users" | "returning_users" | "selected_users"
  selectedCustomerIds?: string[]
  customerGroupKey?: string
  display?: AdminRestaurantVoucher["display"]
  pushCampaign?: Pick<
    NonNullable<AdminRestaurantVoucher["pushCampaign"]>,
    "enabled" | "title" | "body" | "path"
  >
  fundedBy: "owner" | "platform" | "shared"
  ownerSharePercent?: number
  platformSharePercent?: number
  stackingRule: "exclusive" | "stackable"
  priority?: number
  surface?: "checkout" | "menu_markdown"
  mode: AdminVoucherMode
  type: "flat" | "percentage" | "free_delivery"
  name: string
  code?: string
  discountValue?: number
  maxDiscountAmount?: number
  minimumOrderAmount?: number
  minItemPrice?: number
  maxTotalUses?: number
  maxUsesPerUser?: number
  allowRepeatUsage?: boolean
  maxTotalDiscountBudget?: number
  status?: AdminVoucherStatus
  applicability?: "all" | "categories" | "items"
  categoryIds?: string[]
  itemIds?: string[]
  cuisineTypes?: string[]
  zoneIds?: string[]
  districtIds?: string[]
  startsAt: string
  endsAt: string
}

export type AdminRestaurantFinanceReconcileResult = {
  restaurantId: string
  scanned: number
  created: number
  updated: number
  skippedPaidOut: number
  pending: number
  available: number
  reconciledAt: string
}

export type AdminFinancePayoutEligibility =
  | "eligible"
  | "blocked"
  | "pending_request"

export type AdminFinancePayoutRow = {
  restaurant: {
    id: string
    name: string
    slug: string
    city: string
    address: string
    isOnline: boolean
    isVisible: boolean
    serviceArea?: {
      districtId?: string
      districtName?: string
      zoneId?: string
      zoneName?: string
    }
    logoUrl: string
  }
  owner: {
    id: string
    fullName: string
    phone: string
    email: string
    status: string
  }
  payoutMethod: null | {
    id: string
    type: string
    accountName: string
    accountNumber: string
    accountNumberMasked: string
    bankName: string
    branchName: string
    isVerified: boolean
    verifiedAt: string | null
    updatedAt: string | null
  }
  finance: {
    grossAmount: number
    commissionBase: number
    commission: number
    discountCost: number
    platformDiscountCost: number
    deliveryCost: number
    netAmount: number
    availableBalance: number
    pendingBalance: number
    paidOutBalance: number
    carryForwardBalance: number
    carryForwardAvailableBalance: number
    carryForwardPendingBalance: number
    carryForwardPaidOutBalance: number
    payoutRequestedAmount: number
    payoutProcessingAmount: number
    payoutCompletedAmount: number
    payoutFailedAmount: number
    totalPayoutRequests: number
    lastRequestedAt: string | null
  }
  activePayout: AdminFinancePayoutBatch | null
  eligibility: {
    status: AdminFinancePayoutEligibility
    reasons: string[]
    hasVerifiedPayoutMethod: boolean
  }
}

export type AdminPayoutMethodApproval = {
  id: string
  restaurant: {
    id: string
    name: string
    city: string
  }
  owner: {
    id: string
    fullName: string
    phone: string
  }
  current: {
    type: string
    accountName: string
    accountNumber: string
    bankName: string
    branchName: string
    isVerified: boolean
    verifiedAt: string | null
  }
  pending: {
    type: string
    accountName: string
    accountNumber: string
    bankName: string
    branchName: string
    status: string
    verifiedAt: string | null
    adminNote: string
  }
  createdAt: string | null
  updatedAt: string | null
}

export type AdminFinancePayoutBatch = {
  id: string
  restaurantId: string
  methodId: string
  amount: number
  status: string
  batchReference: string
  provider: string
  providerReference: string
  providerPayoutId: string
  providerTransactionId: string
  paymentProofUrl: string
  processingNote: string
  failureReason: string
  requestedAt: string | null
  approvedAt: string | null
  processedAt: string | null
  updatedAt: string | null
  createdAt: string | null
}

export type AdminFinanceLedgerEntry = {
  id: string
  restaurantId: string
  restaurantName: string
  restaurantCity: string
  orderId: string
  orderNumber: string
  orderStatus: string
  paymentMethod: string
  paymentStatus: string
  payoutBatchId: string
  payoutReference: string
  payoutStatus: string
  sourceEntityType: string
  sourceEntityId: string
  sourceLabel: string
  isCarryForward: boolean
  serviceArea?: {
    districtId?: string
    districtName?: string
    zoneId?: string
    zoneName?: string
  }
  entryType: string
  grossAmount: number
  commissionBase: number
  commission: number
  discountCost: number
  platformDiscountCost: number
  deliveryCost: number
  netAmount: number
  settlementStatus: string
  availableAt: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type AdminFinancePayoutDetails = AdminFinancePayoutRow & {
  settings: {
    settlementDelayDays: number
    minimumPayoutAmountEnabled?: boolean
    minimumPayoutAmountTaka: number
    oneActivePayoutRequest: boolean
  }
  recentPayouts: AdminFinancePayoutBatch[]
  recentLedgerEntries: AdminFinanceLedgerEntry[]
  availableLedgerEntries: AdminFinanceLedgerEntry[]
  reservedLedgerEntries: AdminFinanceLedgerEntry[]
}

export type AdminFinancePayoutsResponse = {
  items: AdminFinancePayoutRow[]
  total: number
  page: number
  pageSize: number
  pageCount: number
  summary: {
    restaurants: number
    eligibleRestaurants: number
    blockedRestaurants: number
    pendingRequestRestaurants: number
    availableBalance: number
    pendingBalance: number
    paidOutBalance: number
    payoutRequestedAmount: number
    payoutProcessingAmount: number
    payoutCompletedAmount: number
  }
  settings: {
    settlementDelayDays: number
    minimumPayoutAmountEnabled?: boolean
    minimumPayoutAmountTaka: number
    oneActivePayoutRequest: boolean
  }
}

export type AdminFinanceLedgerResponse = {
  items: AdminFinanceLedgerEntry[]
  total: number
  page: number
  pageSize: number
  pageCount: number
  summary: {
    grossAmount: number
    commissionBase: number
    commission: number
    discountCost: number
    platformDiscountCost: number
    deliveryCost: number
    netAmount: number
    availableBalance: number
    pendingBalance: number
    paidOutBalance: number
    carryForwardBalance: number
    carryForwardAvailableBalance: number
    carryForwardPendingBalance: number
    carryForwardPaidOutBalance: number
    pendingEntries: number
    availableEntries: number
    paidOutEntries: number
  }
}

export type AdminRefundNotificationChannelAudit = {
  status: string
  attemptedAt: string | null
  deliveredAt: string | null
  provider: string
  recipient: string
  requestId: string
  error: string
  sent: number
  inAppCreated: number
  ticketIds: string[]
}

export type AdminRefundNotificationAudit = {
  message: string
  updatedAt: string | null
  push: AdminRefundNotificationChannelAudit
  sms: AdminRefundNotificationChannelAudit
}

export type AdminFinanceRefundRow = {
  id: string
  orderNumber: string
  restaurantId: string
  restaurantName: string
  restaurantCity: string
  serviceArea?: {
    districtId?: string
    districtName?: string
    zoneId?: string
    zoneName?: string
  }
  customerId: string
  customerName: string
  customerPhone: string
  status: string
  terminalReason: string
  cancelledBy: string
  paymentMethod: string
  paymentStatus: string
  transactionId: string
  subtotal: number
  deliveryFee: number
  discount: number
  total: number
  voucherCodes: string[]
  refundNotificationAudit: AdminRefundNotificationAudit | null
  createdAt: string | null
  updatedAt: string | null
}

export type AdminFinanceRefundsResponse = {
  items: AdminFinanceRefundRow[]
  total: number
  page: number
  pageSize: number
  pageCount: number
  summary: {
    total: number
    pending: number
    refunded: number
    rejected: number
    needsReview: number
    amount: number
    discount: number
  }
}

export type AdminPlatformFinanceResponse = {
  timeframe: {
    preset: AdminReportsPreset
    start: string
    end: string
    days: number
  }
  health: "healthy" | "watch" | "risk"
  revenue: {
    platformCommission: number
    deliveryFeeRevenue: number
    platformGrossRevenue: number
    deliveredOrders: number
    deliveredRevenue: number
    deliveredSubtotalGross: number
  }
  expenses: {
    platformVoucherCost: number
    riderPayrollExpense: number
    riderBaseSalary: number
    riderPlatformBonus: number
    riderPenalties: number
    manualExpense: number
    operatingExpense: number
  }
  profitLoss: {
    grossProfit: number
    netProfit: number
    marginPercent: number
    status: "profit" | "loss"
  }
  cash: {
    onlineCollected: number
    codDelivered: number
    codCollected: number
    codUncollected: number
    walletCreditAmount: number
    walletDebitAmount: number
    walletNetAdjustment: number
    cashIn: number
    refundsPaid: number
    payoutsPaid: number
    riderPayrollPaid: number
    cashOut: number
    estimatedPlatformCash: number
    netPositionAfterLiabilities: number
  }
  liabilities: {
    restaurantAvailablePayable: number
    restaurantPendingPayable: number
    activePayoutReserved: number
    refundPendingAmount: number
    refundPendingCount: number
    riderPayrollPending: number
    totalLiabilities: number
  }
  reconciliation: {
    orderSubtotalGross: number
    ledgerGrossAmount: number
    difference: number
    tolerance: number
    status: "ok" | "warning"
    alerts: Array<{
      type: "success" | "warning" | "danger" | "info"
      title: string
      message: string
      amount?: number
    }>
  }
  series: Array<{
    date: string
    label: string
    deliveredOrders: number
    revenue: number
    commission: number
    deliveryFees: number
    operatingExpense: number
    platformDiscountCost: number
    refundsPaid: number
    payoutsPaid: number
    cashIn: number
    cashOut: number
    profit: number
  }>
  paymentBreakdown: Array<{
    method: string
    orders: number
    amount: number
    collected: number
  }>
  promotionCosts: Array<{
    code: string
    name: string
    fundedBy: string
    uses: number
    discount: number
    platformCost: number
    ownerCost: number
    revenue: number
    roi: number
    costToRevenuePercent: number
  }>
  profitByRestaurant: Array<{
    restaurantId: string
    name: string
    city: string
    deliveredOrders: number
    grossAmount: number
    commission: number
    deliveryFees: number
    platformDiscountCost: number
    restaurantPayable: number
    platformRevenue: number
    platformProfit: number
  }>
  riderProfitability: Array<{
    riderId: string
    name: string
    phone: string
    deliveredTrips: number
    deliveryFees: number
    deliveredRevenue: number
    payrollExpense: number
    payrollPaid: number
    payrollPending: number
    platformBonus: number
    contribution: number
    costPerTrip: number
  }>
  riderSalaryNotices: Array<{
    riderId: string
    riderName: string
    riderPhone: string
    monthlySalary: number
    salaryCycleStart: string
    nextDueAt: string
    daysUntilDue: number
    noticeAt: string
    status: "overdue" | "due_soon" | "scheduled" | string
  }>
  wallet: {
    creditAmount: number
    debitAmount: number
    netAdjustment: number
    manualIncome: number
    manualExpense: number
    adjustmentCredit: number
    adjustmentDebit: number
    count: number
    recentEntries: AdminPlatformWalletEntry[]
  }
  dailyClosing: {
    latest: null | {
      id: string
      dateKey: string
      rangeStart: string | null
      rangeEnd: string | null
      summary: Record<string, unknown>
      alerts: unknown[]
      note: string
      closedAt: string | null
    }
    recent: Array<{
      id: string
      dateKey: string
      netProfit: number
      platformCash: number
      liabilities: number
      health: string
      note: string
      closedAt: string | null
    }>
  }
  codReconciliation: {
    pendingAmount: number
    pendingCount: number
    recentPending: Array<{
      orderId: string
      orderNumber: string
      restaurantName: string
      riderId: string
      riderName: string
      riderPhone: string
      total: number
      paymentStatus: string
      updatedAt: string | null
      createdAt: string | null
    }>
  }
  payoutStatus: {
    pending: { amount: number; count: number }
    processing: { amount: number; count: number }
    completed: { amount: number; count: number }
    failed: { amount: number; count: number }
    selectedPaid: { amount: number; count: number }
  }
  notes: string[]
}

export type AdminPlatformWalletEntry = {
  id: string
  direction: "credit" | "debit" | string
  category: string
  amount: number
  status: string
  sourceEntityType: string
  sourceEntityId: string
  paymentMethod: string
  reference: string
  proofUrl: string
  note: string
  occurredAt: string | null
  createdAt: string | null
  updatedAt: string | null
  voidedAt: string | null
}

export type AdminPlatformWalletResponse = {
  items: AdminPlatformWalletEntry[]
  total: number
  page: number
  pageSize: number
  pageCount: number
  summary: {
    creditAmount: number
    debitAmount: number
    netAmount: number
    postedCount: number
  }
}

export type AdminDailyFinanceCloseResponse = {
  id: string
  dateKey: string
  rangeStart: string
  rangeEnd: string
  summary: Record<string, unknown>
  alerts: unknown[]
  note: string
  closedAt: string | null
}

export type AdminMoneyTransaction = {
  id: string
  direction: "credit" | "debit"
  category: string
  source: string
  amount: number
  occurredAt: string | null
  status: string
  reference: string
  paymentMethod: string
  actorType: string
  actorName: string
  actorPhone: string
  restaurantId: string
  restaurantName: string
  orderId: string
  orderNumber: string
  note: string
}

export type AdminMoneyTransactionsResponse = {
  items: AdminMoneyTransaction[]
  total: number
  page: number
  pageSize: number
  pageCount: number
  summary: {
    creditAmount: number
    debitAmount: number
    creditCount: number
    debitCount: number
    netAmount: number
    transactionCount: number
  }
}

export type AdminRestaurantCreateInput = {
  ownerFullName: string
  ownerPhone: string
  ownerEmail?: string
  temporaryPassword: string
  name: string
  description?: string
  phone?: string
  email?: string
  payoutBkashNumber?: string
  cuisineTypes?: string[]
  tags?: string[]
  documents?: AdminRestaurantDocumentAttachment[]
  address?: string
  city?: string
  latitude?: number | null
  longitude?: number | null
  serviceZoneId?: string
  preparationTimeMinutes?: number | null
  commissionRate?: number
  isVisible?: boolean
}

export type AdminRestaurantDocumentAttachment = {
  type: "nid" | "trade_license" | "tin" | "bin_vat"
  label: string
  url: string
  publicId?: string
  fileName?: string
  fileType?: string
  resourceType?: string
  uploadedAt?: string | null
}

export type AdminRestaurantOrderHistoryItem = {
  id: string
  orderNumber: string
  status: string
  paymentMethod: string
  paymentStatus: string
  voucherCodes?: string[]
  total: number
  subtotal: number
  deliveryFee: number
  customerName: string
  customerPhone: string
  riderId: string
  riderName: string
  riderPhone: string
  createdAt: string | null
  acceptedAt: string | null
  preparingAt: string | null
  readyAt: string | null
  pickedUpAt: string | null
  deliveredAt: string | null
  cancelledAt: string | null
  acceptanceMinutes: number | null
  preparationMinutes: number | null
  totalServiceMinutes: number | null
  isLate: boolean
  lateReason: string
  lateMinutes: number
  lateTone: "none" | "warning" | "critical" | string
}

export type AdminRestaurantOrderDateFilterPreset =
  | "today"
  | "yesterday"
  | "last7Days"
  | "last30Days"
  | "last90Days"
  | "thisWeek"
  | "thisMonth"
  | "lastMonth"
  | "lifetime"
  | "custom"

export type AdminCustomerTier = "new" | "repeat" | "vip" | "at_risk"

export type AdminCustomerSummary = {
  id: string
  fullName: string
  phone: string
  email: string
  status: "active" | "suspended" | "locked"
  customerTier: AdminCustomerTier
  authProviders: string[]
  lastLoginAt: string | null
  createdAt: string | null
  updatedAt: string | null
  savedLocationsCount: number
  serviceArea: AdminCustomerServiceArea | null
  lastKnownLocation: AdminCustomerLastKnownLocation | null
  hasPushToken: boolean
  unreadNotifications: number
  requestStatus: "pending" | "cancelled" | "reviewed" | "completed" | null
  requestType: "deactivate" | "delete" | null
  requestRequestedAt: string | null
  totalOrders: number
  liveOrders: number
  deliveredOrders: number
  deliveredSpend: number
  lastOrderAt: string | null
}

export type AdminCustomerServiceArea = {
  districtId: string
  districtName: string
  zoneId: string
  zoneSlug: string
  zoneName: string
  radiusKm: number | null
}

export type AdminCustomerLastKnownLocation = {
  label: string
  address: string
  addressDetails: string
  latitude: number
  longitude: number
  source: string
  updatedAt: string | null
}

export type AdminCustomerBehaviorSummary = {
  preset: string
  from: string | null
  to: string | null
  newCustomers: number
  orderingCustomers: number
  repeatCustomers: number
  firstTimeOrderingCustomers: number
  repeatRate: number
  trend: Array<{
    date: string
    orders: number
    orderingCustomers: number
    repeatCustomers: number
    newCustomers: number
  }>
}

export type AdminCustomerTierBreakdown = {
  new: number
  repeat: number
  vip: number
  at_risk: number
}

export type AdminCustomerDirectorySummary = Record<string, unknown> & {
  total?: number
  active?: number
  suspended?: number
  locked?: number
  pendingRequests?: number
  behavior?: AdminCustomerBehaviorSummary
  tierBreakdown?: AdminCustomerTierBreakdown
}

export type AdminCustomerGroup = {
  id: string
  name: string
  description: string
  memberCount: number
  sourceFilter: Record<string, unknown>
  createdAt: string | null
  updatedAt: string | null
}

export type AdminCustomerDetails = {
  id: string
  fullName: string
  phone: string
  email: string
  status: "active" | "suspended" | "locked"
  profileImageUrl: string
  authProviders: string[]
  lastLoginAt: string | null
  createdAt: string | null
  updatedAt: string | null
  serviceArea: AdminCustomerServiceArea | null
  lastKnownLocation: AdminCustomerLastKnownLocation | null
  notificationSettings: {
    orderUpdates?: boolean
    restaurantStatus?: boolean
    reviewReplies?: boolean
  }
  overview: {
    totalOrders: number
    liveOrders: number
    deliveredOrders: number
    deliveredSpend: number
    averageDeliveredValue: number
    reviewsGiven: number
    averageReviewRating: number
  }
  lifetime: {
    totalOrders: number
    liveOrders: number
    deliveredOrders: number
    deliveredSpend: number
    averageDeliveredValue: number
  }
  account: {
    savedLocationsCount: number
    unreadNotifications: number
    pushTokensCount: number
    activePushTokensCount: number
    previousPhones: Array<{
      phone: string
      changedAt: string | null
    }>
  }
  accountRequest: null | {
    type: "deactivate" | "delete" | null
    status: "pending" | "cancelled" | "reviewed" | "completed" | null
    requestedAt: string | null
    reason: string
    reviewNote: string
    reviewedByAdminName: string
    reviewedAt: string | null
    history: Array<{
      action: string
      note: string
      actorName: string
      createdAt: string | null
    }>
  }
  topRestaurants: Array<{
    restaurantId: string
    restaurantName: string
    orders: number
    deliveredOrders: number
    spend: number
    lastOrderedAt: string | null
  }>
  orderRestaurants: Array<{
    restaurantId: string
    restaurantName: string
  }>
  savedLocations: Array<{
    id: string
    label: string
    address: string
    addressDetails?: string
    isDefault: boolean
    serviceArea: AdminCustomerServiceArea | null
    lastUsedAt: string | null
  }>
  devices: Array<{
    expoPushToken: string
    platform: string
    appVersion: string
    deviceId: string
    lastSeenAt: string | null
    disabledAt: string | null
  }>
  recentNotifications: Array<{
    type: string
    title: string
    description: string
    path: string
    campaignId?: string
    ctaLabel?: string
    ctaPath?: string
    contentType?: "text" | "image" | "image_text"
    imageUrl?: string
    voucherId?: string
    voucherCode?: string
    voucherLabel?: string
    voucherExpiresAt?: string | null
    voucherMinOrder?: number | null
    personalOffer?: boolean
    offerStatus?: "active" | "expired" | "inactive" | string
    isRead: boolean
    createdAt: string | null
  }>
  personalOffers?: Array<{
    id: string
    type: string
    title: string
    description: string
    path: string
    campaignId?: string
    ctaLabel?: string
    ctaPath?: string
    contentType?: "text" | "image" | "image_text"
    imageUrl?: string
    voucherId?: string
    voucherCode?: string
    voucherLabel?: string
    voucherExpiresAt?: string | null
    voucherMinOrder?: number | null
    personalOffer?: boolean
    offerStatus?: "active" | "expired" | "inactive" | string
    isRead: boolean
    createdAt: string | null
  }>
  recentOrders: Array<{
    id: string
    orderNumber: string
    restaurantId: string
    restaurantName: string
    status: string
    paymentMethod: string
    paymentStatus: string
    total: number
    createdAt: string | null
    deliveredAt: string | null
  }>
  recentReviews: Array<{
    id: string
    restaurantId: string
    restaurantName: string
    rating: number
    comment: string
    ownerReplyMessage: string
    moderationStatus?: "visible" | "hidden" | "flagged" | string
    isHidden?: boolean
    hiddenAt?: string | null
    hiddenReason?: string
    createdAt: string | null
  }>
  auditLogs: Array<{
    id: string
    action: string
    title: string
    description: string
    actorName: string
    actorRole: string
    createdAt: string | null
    metadata: Record<string, unknown>
  }>
}

export type AdminCustomerOrderHistoryItem = {
  id: string
  orderNumber: string
  restaurantId: string
  restaurantName: string
  status: string
  paymentMethod: string
  paymentStatus: string
  voucherCodes?: string[]
  total: number
  subtotal: number
  deliveryFee: number
  createdAt: string | null
  acceptedAt: string | null
  readyAt: string | null
  deliveredAt: string | null
  cancelledAt: string | null
}

export type AdminOrderDetails = {
  id: string
  orderNumber: string
  status: string
  paymentMethod: string
  paymentStatus: string
  paymentSnapshot?: Record<string, unknown>
  restaurantId: string
  restaurantName: string
  restaurantOwnerName?: string
  restaurantOwnerPhone?: string
  customerId?: string
  customerName: string
  customerPhone: string
  riderId?: string
  riderName?: string
  riderPhone?: string
  terminalReason?: string
  cancelledBy?: string
  rejectionReason?: string
  pricing: {
    subtotal: number
    deliveryFee: number
    discount: number
    ownerDiscountCost?: number
    platformDiscountCost?: number
    total: number
  }
  appliedVouchers?: Array<{
    id: string
    code: string
    name: string
    type: string
    mode: string
    fundedBy: string
    ownerSharePercent: number
    platformSharePercent: number
    discountAmount: number
  }>
  deliveryAddress: string
  items: Array<{
    id: string
    name: string
    quantity: number
    lineTotal: number
  }>
  timestamps: {
    createdAt: string | null
    acceptedAt: string | null
    preparingAt: string | null
    readyAt: string | null
    pickedUpAt: string | null
    deliveredAt: string | null
    cancelledAt: string | null
  }
  autoCancel?: {
    enabled: boolean
    applies: boolean
    autoCancelAfterMinutes: number
    notifyBeforeMinutes: number
    autoCancelAt: string | null
    remainingSeconds: number | null
  }
  preparationTiming?: {
    phase: string
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
  operationalTiming?: {
    averagePreparationMinutes: number
    currentPhaseLabel: string
    primaryLabel: string
    secondaryLabel: string
    lateByMinutes: number
    remainingMinutes: number | null
    remainingSeconds?: number | null
    targetMinutes: number | null
    targetAt: string | null
  }
  history: Array<{
    status: string
    actor: string
    note: string
    createdAt: string | null
  }>
  riderTracking?: {
    isActive?: boolean
    startedAt?: string | null
    lastUpdatedAt?: string | null
    remainingDistanceKm?: number
    directDistanceKm?: number
    remainingDurationMinutes?: number
    speedKmph?: number
    isNearCustomer?: boolean
    freshness?: {
      lastUpdatedAt?: string | null
      ageSeconds?: number | null
      isFresh?: boolean
      isStale?: boolean
      state?: "live" | "stale" | "unavailable"
    }
    currentLocation?: {
      latitude?: number
      longitude?: number
      heading?: number | null
      accuracyMeters?: number | null
    }
  }
}

export type AdminOrderListItem = {
  id: string
  orderNumber: string
  status: string
  restaurantId: string
  restaurantName: string
  customerId: string
  customerName: string
  customerPhone: string
  riderId: string
  riderName: string
  riderPhone: string
  assignmentState:
    | "awaiting_owner"
    | "assigned"
    | "unassigned"
    | "picked_up"
    | "completed"
  ownerAcceptanceState?: "not_applicable" | "awaiting" | "timed_out"
  assignmentAcknowledgementState?:
    | "not_applicable"
    | "not_assigned"
    | "awaiting"
    | "acknowledged"
    | "timed_out"
  paymentMethod: string
  paymentStatus: string
  voucherCodes: string[]
  total: number
  subtotal: number
  deliveryFee: number
  discount: number
  createdAt: string | null
  updatedAt: string | null
  acceptedAt: string | null
  preparingAt: string | null
  readyAt: string | null
  pickedUpAt: string | null
  deliveredAt: string | null
  cancelledAt: string | null
  terminalReason: string
  cancelledBy: string
  rejectionReason: string
  isRefundCandidate: boolean
  isLate: boolean
  lateReason: string
  lateMinutes: number
  lateTone: "none" | "warning" | "critical" | string
  riderTracking?: AdminOrderDetails["riderTracking"]
  autoCancel?: AdminOrderDetails["autoCancel"]
  preparationTiming?: AdminOrderDetails["preparationTiming"]
  operationalTiming?: AdminOrderDetails["operationalTiming"]
  customerLifetimeOrders?: number
  customerTier?: "new" | "repeat" | "vip"
}

export type AdminOrdersListResponse = AdminListResponse<AdminOrderListItem> & {
  summary?: {
    total?: number
    newOrders?: number
    liveOrders?: number
    readyForPickup?: number
    pickedUp?: number
    deliveredOrders?: number
    cancelledOrders?: number
    refundPending?: number
    deliveredRevenue?: number
    onlineRiders?: number
    unassignedReadyOrders?: number
    staleTracking?: number
    delayedRiderOrders?: number
  }
}

export type AdminPaymentTransaction = {
  id: string
  orderId: string
  orderNumber: string
  status: string
  restaurantId: string
  restaurantName: string
  customerName: string
  customerPhone: string
  paymentMethod: string
  paymentStatus: string
  provider: string
  bkashPayerPhone: string
  transactionId: string
  amount: number
  subtotal: number
  deliveryFee: number
  discount: number
  refundStatus: string
  refundNote: string
  refundRequestedAt: string | null
  refundReviewedAt: string | null
  refundNotificationAudit: AdminRefundNotificationAudit | null
  voucherCodes: string[]
  createdAt: string | null
  updatedAt: string | null
  deliveredAt: string | null
  cancelledAt: string | null
  isRefundCandidate: boolean
}

export type AdminPaymentsResponse = AdminListResponse<AdminPaymentTransaction> & {
  summary: {
    transactionCount: number
    deliveredRevenue: number
    onlineCollected: number
    codDelivered: number
    pendingCod: number
    refundPendingCount: number
    refundPendingAmount: number
    refundedCount: number
    refundedAmount: number
    failedOrRejectedRefunds: number
    settlementGrossAmount: number
    settlementCommissionBase: number
    platformCommission: number
    restaurantPayable: number
    discountCost: number
    platformDiscountCost: number
    deliveryCost: number
    payoutReadyAmount: number
    payoutPendingAmount: number
    payoutRequestedAmount: number
    payoutReservedAmount: number
    paidOutAmount: number
    payoutFailedAmount: number
    riderPayrollBaseSalary: number
    riderPayrollBonus: number
    riderPayrollPenalties: number
    riderPayrollExpense: number
    riderPayrollPending: number
    riderPayrollPaid: number
    riderPayrollMonths: string[]
    platformGrossIncome: number
    platformOperatingExpense: number
    estimatedPlatformMargin: number
    nextPayoutDate: string | null
  }
}

export type AdminBkashPaymentAttempt = {
  id: string
  customerId: string
  customerName: string
  customerPhone: string
  restaurantId: string
  restaurantName: string
  orderId: string
  sessionId: string
  clientOrderId: string
  walletNumber: string
  walletNumberMasked: string
  payerReference: string
  customerMsisdn: string
  payerPhone: string
  amount: number
  voucherCode: string
  paymentID: string
  transactionId: string
  status: string
  rawStatus: string
  paymentStatus: string
  orderFinalizationStatus: string
  failureStage: string
  failureReason: string
  providerCode: string
  providerMessage: string
  latestEvent: string
  latestNote: string
  initiatedAt: string | null
  providerCreatedAt: string | null
  callbackAt: string | null
  executedAt: string | null
  confirmedAt: string | null
  orderFinalizedAt: string | null
  failedAt: string | null
  expiresAt: string | null
  createdAt: string | null
  updatedAt: string | null
  events: Array<{
    event: string
    status: string
    paymentStatus: string
    note: string
    reason: string
    providerCode: string
    providerMessage: string
    occurredAt: string | null
  }>
}

export type AdminBkashPaymentAttemptsResponse =
  AdminListResponse<AdminBkashPaymentAttempt> & {
    summary: {
      attemptCount: number
      paidCount: number
      paidAmount: number
      unpaidCount: number
      cancelledCount: number
      failedCount: number
      expiredCount: number
      staleUnpaidCount: number
      orderFinalizedCount: number
      orderFinalizeFailedCount: number
      paidWithoutOrderCount: number
      paidWithoutOrderAmount: number
    }
  }

export type AdminBkashPaymentReconcileResult = {
  status: string
  paymentID: string
  transactionId: string
  orderId: string
  attempt?: Record<string, unknown> | null
}

export type AdminPaymentsExportResponse = AdminPaymentsResponse & {
  truncated: boolean
}

export type AdminSmsBalanceResponse = {
  configured: boolean
  status: "ok" | "failed" | "not_configured"
  provider: "sms.bd"
  balance: number | null
  rawBalance: string
  message: string
  senderIdConfigured: boolean
  checkedAt: string
}

export type AdminPaymentsReconcileResult = {
  restaurants: number
  scanned: number
  created: number
  updated: number
  skippedPaidOut: number
  pending: number
  available: number
  reconciledAt: string
}

export type AdminOrdersMonitorItem = {
  id: string
  orderNumber: string
  status: string
  restaurantName: string
  customerName: string
  riderName: string
  riderPhone: string
  assignmentState:
    | "awaiting_owner"
    | "assigned"
    | "unassigned"
    | "picked_up"
    | "completed"
  ownerAcceptanceState?: "not_applicable" | "awaiting" | "timed_out"
  assignmentAcknowledgementState?:
    | "not_applicable"
    | "not_assigned"
    | "awaiting"
    | "acknowledged"
    | "timed_out"
  updatedAt: string | null
  createdAt: string | null
  riderTracking?: {
    lastUpdatedAt?: string | null
    freshness?: {
      lastUpdatedAt?: string | null
      ageSeconds?: number | null
      isFresh?: boolean
      isStale?: boolean
      state?: "live" | "stale" | "unavailable"
    }
  }
}

export type AdminOrdersMonitorResponse = {
  summary: {
    total: number
    newOrders: number
    delayedOwnerAcceptance: number
    pickedUp: number
    staleTracking: number
    readyForPickup: number
    unassignedReady: number
    unacknowledgedAssignments: number
    onlineRiders: number
    surgeActive: number
  }
  dispatch: AdminDispatchSettings
  items: AdminOrdersMonitorItem[]
}

export type AdminDispatchSettings = {
  autoAssignmentEnabled: boolean
  autoReassignTimedOutOrders: boolean
  dispatchMode: "fleet" | "primary_rider"
  primaryRiderId: string
  primaryRiderFallbackEnabled: boolean
  algorithm: "nearest_eligible_balanced" | "least_loaded_first"
  ownerAcceptanceTimeoutMinutes: number
  maxActiveOrdersPerRider: number
  staleLocationCutoffMinutes: number
  assignmentTimeoutMinutes: number
  prepStartGraceMinutes: number
  preparationMaxExtraMinutes: number
  prepLateGraceMinutes: number
  pickupLateGraceMinutes: number
  deliveryLateGraceMinutes: number
  deliveryWatchAfterPickupMinutes: number
  deliveryLateAfterPickupMinutes: number
  deliveryCriticalAfterPickupMinutes: number
  retryCooldownMinutes: number
  surgeReadyOrderThreshold: number
  surgeUnassignedOrderThreshold: number
  autoCancelUnacceptedOrdersEnabled: boolean
  autoCancelAfterMinutes: number
  autoCancelNotifyBeforeMinutes: number
  metrics: {
    onlineRiders: number
    eligibleRiders: number
    blockedRiders: number
    totalRiders: number
    activeRiders: number
    unavailableRiders: number
    pendingKycRiders: number
    rejectedKycRiders: number
    suspendedRiders: number
    lockedRiders: number
    singleRiderModeRecommended: boolean
    primaryRiderName: string
    primaryRiderActiveOrders: number
    primaryRiderAtCapacity: boolean
    readyOrders: number
    unassignedReadyOrders: number
    surgeActive: boolean
    surgeMessage: string
  }
  recentLogs: Array<{
    id: string
    orderId: string
    orderNumber: string
    restaurantName: string
    algorithm: "nearest_eligible_balanced" | "least_loaded_first"
    assignmentSource: "manual_admin" | "auto_dispatch"
    outcome: "assigned" | "reassigned" | "no_match" | "skipped"
    selectedRiderName: string
    reason: string
    candidateCount: number
    candidates: Array<{
      riderId: string
      riderName: string
      activeOrders: number
      hasActiveTracking: boolean
      hasFreshLocation: boolean
      distanceKm: number | null
      score: number | null
      capacityState: string
      locationState: string
    }>
    createdAt: string | null
  }>
}

export type AdminDispatchDecisionLog = AdminDispatchSettings["recentLogs"][number]

export type AdminDispatchLogsResponse =
  AdminListResponse<AdminDispatchDecisionLog> & {
    retentionDays: number
  }

export type AdminRiderAssignmentOption = {
  id: string
  fullName: string
  phone: string
  vehicleType: string
  isAvailableForAssignments: boolean
  activeOrders: number
}

export type AdminCustomerStatusUpdate = {
  id: string
  fullName: string
  status: "active" | "suspended" | "locked"
  updatedAt: string | null
}

export type PlatformContentHomeRestaurantSection = {
  isActive?: boolean
  title: string
  subtitle: string
  source?: "auto" | "manual"
  selectedRestaurantIds?: string[]
  maxItems?: number
  position?: number
  layout?: "horizontal" | "vertical"
  allowRepeatAcrossSections?: boolean
}

export type PlatformContentCartRecommendations = {
  isActive?: boolean
  source?: "manual" | "auto" | "both"
  title: string
  subtitle: string
  maxItems?: number
}

export type PlatformContent = {
  branding: {
    platformName: string
    tagline: string
  }
  customerApp: {
    homeBanner: {
      isActive: boolean
      title: string
      subtitle: string
      ctaLabel: string
      ctaPath: string
      tone: "sky" | "mint" | "amber" | "rose"
    }
    homeCms: {
      offerStrip: {
        isActive: boolean
        showVoucherStrip: boolean
        showRestaurantOfferSection?: boolean
        mode: "voucher_strip" | "promo_block" | "hidden"
        title: string
        subtitle: string
        variant: "text" | "image" | "image_text" | "carousel"
        buttonStyle: "pill" | "soft" | "outline" | "dark"
        imageUrl: string
        imagePublicId: string
        carouselImageUrls: string[]
        carouselImages: Array<{ url: string; publicId: string; ctaPath?: string }>
        ctaLabel: string
        ctaPath: string
        backgroundColor: string
        textColor: string
        accentColor: string
      }
      homeCategories?: {
        isActive: boolean
        title: string
        subtitle: string
        items: Array<{
          id?: string
          label: string
          searchQuery: string
          icon?: string
          color?: string
          position?: number
          isActive?: boolean
        }>
      }
      restaurantSections?: {
        featured: PlatformContentHomeRestaurantSection
        offers: PlatformContentHomeRestaurantSection
        discoverNew: PlatformContentHomeRestaurantSection
        popularNearYou: PlatformContentHomeRestaurantSection
        nearby: PlatformContentHomeRestaurantSection
      }
      cartRecommendations?: PlatformContentCartRecommendations
      modal: {
        isActive: boolean
        title: string
        subtitle: string
        imageUrl: string
        imagePublicId: string
        ctaLabel: string
        ctaPath: string
        delaySeconds: number
        frequency: "once_per_session" | "every_refresh"
        backgroundColor: string
        textColor: string
        accentColor: string
      }
      howToOrderGuide: {
        isActive: boolean
        audience: "all_users" | "new_users"
        title: string
        subtitle: string
        youtubeUrl: string
        ctaLabel: string
        placement: "after_search" | "after_offers" | "before_restaurants"
        backgroundColor: string
        textColor: string
        accentColor: string
        guideImages: Array<{ url: string; publicId: string; title?: string }>
      }
      pushCampaign: {
        contentType: "text" | "image" | "image_text"
        title: string
        body: string
        imageUrl: string
        imagePublicId: string
        path: string
        currentCampaignId: string
        audienceType: "all_users" | "new_users" | "returning_users" | "selected_users"
        selectedCustomerIds: string[]
        customerGroupKey: string
        restaurantScope: "all_restaurants" | "selected_restaurants"
        selectedRestaurantIds: string[]
        abTest: {
          enabled: boolean
          splitPercent: number
          variantBTitle: string
          variantBBody: string
          variantBPath: string
        }
        lastSentAt: string | null
        totalTargets: number
        sentCount: number
        disabledCount: number
        openCount: number
        recipientEvents: Array<{
          customerId: string
          customerName: string
          customerPhone: string
          sentAt: string
          status: "sent" | "in_app_only" | "preference_disabled" | "failed"
          expoTokenCount: number
          ticketIds?: string[]
          receiptStatus?: "pending" | "delivered_to_provider" | "failed" | "device_not_registered"
          receiptCheckedAt?: string | null
          receiptError?: string
          variant?: "A" | "B"
        }>
        openEvents: Array<{
          customerId: string
          customerName: string
          customerPhone: string
          openedAt: string
          path: string
          campaignId?: string
          variant?: "A" | "B"
        }>
        receiptCheckedAt: string | null
        conversionWindowDays: number
        scheduledAt: string | null
        scheduleStatus: "none" | "scheduled" | "sending" | "sent" | "cancelled" | "failed"
        scheduledByAdminId: string
        scheduledCreatedAt: string | null
        scheduleHistory: Array<{
          action: "scheduled" | "cancelled" | "sent" | "failed"
          scheduledAt: string | null
          occurredAt: string
          adminId: string
          note: string
        }>
        conversions: {
          orderCount: number
          deliveredOrderCount: number
          deliveredRevenue: number
          uniqueOrderingCustomers: number
          conversionRate: number
          refreshedAt: string | null
          convertedOrders: Array<{
            orderId: string
            orderNumber: string
            customerId: string
            customerName: string
            status: string
            total: number
            createdAt: string
          }>
        }
        campaignHistory: Array<{
          campaignId: string
          contentType: "text" | "image" | "image_text"
          title: string
          body: string
          imageUrl: string
          path: string
          audienceType: string
          restaurantScope: string
          abTest?: PlatformContent["customerApp"]["homeCms"]["pushCampaign"]["abTest"]
          sentAt: string
          totalTargets: number
          sentCount: number
          disabledCount: number
          openCount: number
          recipientEvents: PlatformContent["customerApp"]["homeCms"]["pushCampaign"]["recipientEvents"]
          openEvents: PlatformContent["customerApp"]["homeCms"]["pushCampaign"]["openEvents"]
          receiptCheckedAt: string | null
          conversionWindowDays: number
          conversions: PlatformContent["customerApp"]["homeCms"]["pushCampaign"]["conversions"]
        }>
      }
      analytics: {
        stripImpressions: number
        stripClicks: number
        blockImpressions: number
        blockClicks: number
        modalImpressions: number
        modalClicks: number
        guideImpressions: number
        guideVideoClicks: number
        guideImageClicks: number
        pushOpens: number
        lastEventAt: string | null
      }
      analyticsEvents: Array<{
        eventType:
          | "strip_impression"
          | "strip_click"
          | "block_impression"
          | "block_click"
          | "modal_impression"
          | "modal_click"
          | "guide_impression"
          | "guide_video_click"
          | "guide_image_click"
        customerId: string
        customerName: string
        customerPhone: string
        occurredAt: string
      }>
    }
  }
  operations: {
    ownerApp: {
      webDashboardUrl: string
      showCustomerPhoneNumbers: boolean
    }
    serviceArea: {
      name: string
      centerLatitude: number
      centerLongitude: number
      radiusKm: number
    }
    deliveryPricing: {
      baseFeeTaka: number
      distanceSurchargeEnabled: boolean
      surchargeStartsAfterKm: number
      surchargeStepMeters: number
      surchargeAmountTaka: number
    }
    routing: {
      provider: "google" | "haversine"
      fallbackSpeedKmph: number
      pickupBufferMinutes: number
      costMode: "economy" | "balanced" | "precision"
      googleMonthlyLimit: number
      maxGoogleCallsPerOrder: number
      routeSessionTtlMinutes: number
      rerouteCooldownSeconds: number
      offRouteThresholdMeters: number
      offRouteConsecutiveUpdates: number
      periodicRefreshMinutes: number
      nearDestinationMeters: number
    }
    mapStyles: {
      styles: Array<{
        id: string
        name: string
        description: string
        isActive: boolean
        styleJson: Array<Record<string, unknown>>
      }>
      assignments: Record<string, string>
    }
    liveTracking: {
      mode: "balanced" | "battery_saver" | "high_accuracy"
      updateIntervalSeconds: number
      distanceIntervalMeters: number
      passiveHeartbeatSeconds: number
    }
    failedDelivery: {
      customerFaultRefundPercent: number
      restaurantCompensationPercent: number
      riderFailedTripPay: number
    }
    payments: {
      cashOnDeliveryEnabled: boolean
      bkashEnabled: boolean
      bkashLabel: string
      bkashSubtitle: string
      bkashRefundEtaMinutes: number
      bkashRefundSmsEnabled: boolean
      bkashRefundSmsTemplate: string
    }
    finance: {
      settlementDelayDays: number
      minimumPayoutAmountEnabled?: boolean
      minimumPayoutAmountTaka: number
      oneActivePayoutRequest: boolean
    }
    adminNotifications: {
      orderPlaced: boolean
      customerOrderUpdates: boolean
      orderDelays: boolean
      preparationDelays: boolean
      riderDelays: boolean
      deliveryDelays: boolean
      paymentExceptions: boolean
      payoutRequests: boolean
      support: boolean
      security: boolean
      campaigns: boolean
    }
    referrals: {
      enabled: boolean
      rewardAmountTaka: number
      minimumOrderAmountTaka: number
      voucherExpiryDays: number
      monthlyRewardCapPerCustomer: number
      shareLinkTemplate: string
      shareMessageTemplate: string
    }
    dispatch: {
      autoAssignmentEnabled: boolean
      autoReassignTimedOutOrders: boolean
      dispatchMode: "fleet" | "primary_rider"
      primaryRiderId: string
      primaryRiderFallbackEnabled: boolean
      algorithm: "nearest_eligible_balanced" | "least_loaded_first"
      ownerAcceptanceTimeoutMinutes: number
      maxActiveOrdersPerRider: number
      staleLocationCutoffMinutes: number
      assignmentTimeoutMinutes: number
      prepStartGraceMinutes: number
      preparationMaxExtraMinutes: number
      prepLateGraceMinutes: number
      pickupLateGraceMinutes: number
      deliveryLateGraceMinutes: number
      deliveryWatchAfterPickupMinutes: number
      deliveryLateAfterPickupMinutes: number
      deliveryCriticalAfterPickupMinutes: number
      riderEtaSpeedKmph: number
      riderEtaRouteFactor: number
      retryCooldownMinutes: number
      surgeReadyOrderThreshold: number
      surgeUnassignedOrderThreshold: number
      autoCancelUnacceptedOrdersEnabled: boolean
      autoCancelAfterMinutes: number
      autoCancelNotifyBeforeMinutes: number
    }
  }
  auth: {
    otp: {
      expiresInSeconds: number
      resendCooldownSeconds: number
      messageTemplate: string
    }
    rateLimits: {
      signinAttemptsPerWindow: number
      signupAttemptsPerWindow: number
      otpSendPerPhoneWindow: number
      otpSendPerIpWindow: number
      otpVerifyAttemptsPerWindow: number
      passwordRecoveryPerWindow: number
      refreshPerWindow: number
      paymentInitiatePerWindow: number
      orderPlacePerWindow: number
      orderActionPerWindow: number
      cartQuotePerWindow: number
      supportWritePerWindow: number
      analyticsEventsPerWindow: number
      riderLocationPerWindow: number
      adminWritePerWindow: number
      ownerWritePerWindow: number
      otpPhoneHourlySendLimit: number
      otpPhoneDailySendLimit: number
      otpIpDailySendLimit: number
      otpFailedVerifyLimit: number
      otpVerifyLockMinutes: number
    }
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

export type PlatformContentEditorResponse = {
  content: PlatformContent
  meta: {
    updatedAt: string | null
    updatedByAdminId: string | null
    updatedByAdminName: string
  }
  history: Array<{
    updatedAt: string
    updatedByAdminId: string | null
    updatedByAdminName: string
    changedSections: string[]
  }>
}

export type AdminActivityLog = {
  id: string
  action: string
  entityType: string
  entityId: string
  title: string
  description: string
  adminId: string
  adminName: string
  createdAt: string | null
  metadata: Record<string, unknown>
}

export type AdminNotificationCenterItem = {
  id: string
  source: "customer" | "owner" | "rider" | "campaign" | "scheduled" | "ops"
  type: string
  title: string
  description: string
  recipientId: string
  recipientName: string
  recipientPhone: string
  restaurantName?: string
  path: string
  ctaLabel?: string
  ctaPath?: string
  recipientType?: string
  audience?: string
  sendMode?: "cms" | "instant" | "scheduled" | string
  zoneId?: string
  districtId?: string
  customerAudienceType?: "all_users" | "new_users" | "returning_users" | "selected_users" | string
  customerGroupKey?: string
  restaurantScope?: "all_restaurants" | "selected_restaurants" | string
  selectedRestaurantIds?: string[]
  abTest?: {
    enabled?: boolean
    splitPercent?: number
    variantBTitle?: string
    variantBBody?: string
    variantBPath?: string
  }
  conversionWindowDays?: number
  conversions?: {
    orderCount: number
    deliveredOrderCount: number
    deliveredRevenue: number
    uniqueOrderingCustomers: number
    conversionRate: number
    refreshedAt: string | null
    convertedOrders: Array<{
      orderId: string
      orderNumber: string
      customerId: string
      customerName: string
      status: string
      total: number
      createdAt: string
    }>
  } | null
  campaignId?: string
  contentType?: "text" | "image" | "image_text"
  imageUrl?: string
  voucherId?: string
  voucherCode?: string
  voucherLabel?: string
  voucherExpiresAt?: string | null
  voucherMinOrder?: number | null
  personalOffer?: boolean
  isRead: boolean
  readAt: string | null
  createdAt: string | null
  deliveryStatus: string
  totalTargets?: number
  sentCount?: number
  disabledCount?: number
  inAppCount?: number
  skippedCount?: number
  openCount?: number
  scheduledAt?: string | null
  sentAt?: string | null
  failureReason?: string
  iconKey?: string
  severity?: string
  entityType?: string
  entityId?: string
  metadata?: Record<string, unknown>
}

export type AdminNotificationsResponse = AdminListResponse<AdminNotificationCenterItem> & {
  summary: {
    totalNotifications: number
    customerUnread: number
    ownerUnread: number
    riderUnread: number
    customerPushActiveTokens: number
    customerPushDisabledTokens: number
    riderPushActiveTokens: number
    riderPushDisabledTokens: number
    campaignCount: number
    campaignTargets: number
    campaignDelivered: number
    campaignOpens: number
    campaignOpenRate: number
    scheduledCount: number
    opsUnread?: number
  }
}

export type AdminNotificationSendPayload = {
  zoneId?: string
  districtId?: string
  recipientType: "customers" | "owners" | "riders"
  audience: "all" | "selected"
  recipientIds?: string[]
  title: string
  body: string
  path?: string
  ctaLabel?: string
  ctaPath?: string
  type?: string
  contentType?: "text" | "image" | "image_text"
  imageUrl?: string
  imagePublicId?: string
  voucherId?: string
  voucherCode?: string
  voucherLabel?: string
  voucherExpiresAt?: string
  voucherMinOrder?: number
  personalOffer?: boolean
  customerAudienceType?: "all_users" | "new_users" | "returning_users" | "selected_users"
  customerGroupKey?: string
  restaurantScope?: "all_restaurants" | "selected_restaurants"
  selectedRestaurantIds?: string[]
  abTest?: {
    enabled?: boolean
    splitPercent?: number
    variantBTitle?: string
    variantBBody?: string
    variantBPath?: string
  }
  conversionWindowDays?: number
  testMode?: boolean
  pushEnabled?: boolean
  scheduledAt?: string
}

export type AdminNotificationSendResult = {
  recipientType: "customers" | "owners" | "riders"
  totalTargets: number
  sentCount: number
  disabledCount: number
  inAppCount: number
  skippedCount: number
  scheduledId?: string
  scheduledAt?: string
}

export type AdminNotificationActionResult = {
  updated: boolean
  status?: string
  failureReason?: string
  customerDocuments?: number
  ownerNotifications?: number
  opsAlerts?: number
}

export type AdminNotificationRecipientReportStatus =
  | "all"
  | "received"
  | "opened"
  | "not_reached"

export type AdminNotificationRecipientReport = {
  campaignId: string
  items: Array<{
    id: string
    name: string
    phone: string
    userType: "customer" | "owner" | "rider" | string
    restaurantName?: string
    status: "received" | "opened" | "not_reached" | string
    statusLabel: string
    notificationId: string
    receivedAt: string | null
    openedAt: string | null
    reason: string
  }>
  total: number
  page: number
  pageSize: number
  pageCount: number
  summary: {
    total: number
    received: number
    opened: number
    notReached: number
  }
  unavailableReason: string
}

export type AdminNotificationCampaignConversions = {
  refreshed: boolean
  unavailableReason?: string
  orderCount?: number
  deliveredOrderCount?: number
  deliveredRevenue?: number
  uniqueOrderingCustomers?: number
  conversionRate?: number
  refreshedAt?: string | null
  convertedOrders?: Array<{
    orderId: string
    orderNumber: string
    customerId: string
    customerName: string
    status: string
    total: number
    createdAt: string
  }>
}

export type AdminNotificationCampaignReceipts = {
  checked: number
  deliveredToProvider: number
  failed: number
  deviceNotRegistered: number
  unavailableReason?: string
}

export async function bootstrapAdmin() {
  return adminRequest<{ id: string; email: string }>("/admin/auth/bootstrap", {
    method: "POST",
    skipAuth: true,
  })
}

export async function signinAdmin(email: string, password: string) {
  const response = await adminRequest<{
    accessToken: string
    admin: {
      id: string
      fullName: string
      email: string
      role: "admin"
    }
  }>("/admin/auth/signin", {
    method: "POST",
    skipAuth: true,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  })

  setAdminSession(response.data)
  return response.data
}

export async function logoutAdmin() {
  const response = await adminRequest<{ revoked: boolean }>(
    "/admin/auth/logout",
    {
      method: "POST",
      skipAuth: true,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    }
  )

  clearAdminSession()
  return response.data
}

export type AdminSessionRole = "admin" | "owner" | "customer" | "rider"
export type AdminSessionStatus = "active" | "revoked" | "expired"
export type AdminSessionFilterStatus =
  | "all"
  | AdminSessionStatus
  | "recent"
  | "stale"

export type AdminSessionItem = {
  id: string
  role: AdminSessionRole
  status: AdminSessionStatus
  actor: {
    id: string
    name: string
    contact: string
    status: string
    lastLoginAt: string | null
  }
  tokenId: string
  userAgent: string
  ipAddress: string
  createdAt: string | null
  lastSeenAt: string | null
  expiresAt: string | null
  revokedAt: string | null
}

export type AdminSessionsResponse = {
  items: AdminSessionItem[]
  total: number
  page: number
  pageSize: number
  summary: {
    active: number
    valid: number
    revoked: number
    expired: number
    uniqueValidAccounts: number
    recentlyActive: number
    stale: number
    recentWindowMinutes: number
    staleAfterDays: number
  }
}

export type AdminOtpSecurityResponse = {
  timeframe: {
    hours: number
    since: string
  }
  summary: {
    sent: number
    reused: number
    blocked: number
    sendFailed: number
    verifyFailed: number
    verifyBlocked: number
    uniquePhones: number
    uniqueIps: number
    lockedSessions: number
    activeBlocks: number
  }
  blocks: Array<{
    id: string
    targetType: "phone" | "ip" | "device" | string
    targetValue: string
    displayValue: string
    reason: string
    isPermanent: boolean
    isActive: boolean
    lockedUntilAt: string | null
    liftedAt: string | null
    createdByAdminId: string
    updatedByAdminId: string
    liftedByAdminId: string
    createdAt: string | null
    updatedAt: string | null
  }>
  phones: Array<{
    phone: string
    sent: number
    reused: number
    blocked: number
    verifyFailed: number
    verifyBlocked: number
    purposes: string[]
    ipAddresses: string[]
    lastSeenAt: string | null
  }>
  items: Array<{
    id: string
    phone: string
    purpose: string
    referenceId: string
    verificationSessionId: string
    event: string
    blockReason: string
    ipAddress: string
    userAgent: string
    metadata: Record<string, unknown>
    createdAt: string | null
  }>
  total: number
  page: number
  pageSize: number
}

export async function upsertAdminOtpBlock(params: {
  targetType: "phone" | "ip" | "device"
  targetValue: string
  durationMinutes?: number
  permanent?: boolean
  reason?: string
}) {
  const response = await adminRequest<AdminOtpSecurityResponse["blocks"][number]>(
    "/admin/otp-security/blocks",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(params),
    }
  )
  return response.data
}

export async function deleteAdminOtpBlock(params: {
  blockId: string
  reason?: string
}) {
  const response = await adminRequest<AdminOtpSecurityResponse["blocks"][number]>(
    `/admin/otp-security/blocks/${params.blockId}`,
    {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ reason: params.reason ?? "" }),
    }
  )
  return response.data
}

export async function getAdminOtpSecurity(params?: {
  phone?: string
  hours?: number
  page?: number
  pageSize?: number
}) {
  const search = new URLSearchParams()
  if (params?.phone) search.set("phone", params.phone)
  if (params?.hours) search.set("hours", String(params.hours))
  if (params?.page) search.set("page", String(params.page))
  if (params?.pageSize) search.set("pageSize", String(params.pageSize))
  const query = search.toString() ? `?${search.toString()}` : ""
  const response = await adminRequest<AdminOtpSecurityResponse>(
    `/admin/otp-security${query}`
  )
  return response.data
}

export async function listAdminSessions(params?: {
  role?: AdminSessionRole | "all"
  status?: AdminSessionFilterStatus
  page?: number
  pageSize?: number
}) {
  const search = new URLSearchParams()
  if (params?.role) search.set("role", params.role)
  if (params?.status) search.set("status", params.status)
  if (params?.page) search.set("page", String(params.page))
  if (params?.pageSize) search.set("pageSize", String(params.pageSize))
  const query = search.toString() ? `?${search.toString()}` : ""
  const response = await adminRequest<AdminSessionsResponse>(
    `/admin/sessions${query}`
  )
  return response.data
}

export async function revokeAdminSession(params: {
  role: AdminSessionRole
  sessionId: string
}) {
  const response = await adminRequest<{ revoked: boolean }>(
    `/admin/sessions/${params.role}/${params.sessionId}/revoke`,
    { method: "POST" }
  )
  return response.data
}

export async function revokeAdminActorSessions(params: {
  role: AdminSessionRole
  actorId: string
}) {
  const response = await adminRequest<{ revoked: number }>(
    `/admin/sessions/${params.role}/users/${params.actorId}/revoke`,
    { method: "POST" }
  )
  return response.data
}

export async function listReviewCases(status?: ReviewCase["status"]) {
  const query = status ? `?status=${status}` : ""
  const response = await adminRequest<ReviewCase[]>(
    `/admin/review-cases${query}`
  )
  return response.data
}

export async function startReviewCase(reviewCaseId: string) {
  const response = await adminRequest<ReviewCase>(
    `/admin/review-cases/${reviewCaseId}/start-review`,
    {
      method: "POST",
    }
  )
  return response.data
}

export async function approveReviewCase(reviewCaseId: string) {
  const response = await adminRequest<{ reviewCase: ReviewCase }>(
    `/admin/review-cases/${reviewCaseId}/approve`,
    {
      method: "POST",
    }
  )
  return response.data
}

export async function rejectReviewCase(params: {
  reviewCaseId: string
  reviewNote: string
  reviewIssues: ReviewIssue[]
}) {
  const response = await adminRequest<ReviewCase>(
    `/admin/review-cases/${params.reviewCaseId}/reject`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        reviewNote: params.reviewNote,
        reviewIssues: params.reviewIssues,
      }),
    }
  )
  return response.data
}

export async function listSupportCases(params?: {
  search?: string
  source?: "all" | "customer" | "owner" | "rider" | "admin"
  status?: "all" | SupportCaseStatus
  priority?: "all" | SupportCasePriority
  assigned?: "all" | "me" | "unassigned"
  categoryId?: string
  sla?: "all" | "overdue" | "due_soon" | "healthy"
  sortBy?: "newest" | "oldest" | "updated" | "priority" | "sla"
  page?: number
  pageSize?: number
}) {
  const searchParams = new URLSearchParams()
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== "" && value !== "all") {
      searchParams.set(key, String(value))
    }
  })
  const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const response = await adminRequest<{
    items: AdminSupportCase[]
    total: number
    page: number
    pageSize: number
    pageCount: number
    summary: {
      total: number
      open: number
      inProgress: number
      resolved: number
      closed: number
      highPriority: number
      unassigned: number
      overdue: number
    }
    categories: string[]
    admins: Array<{ id: string; name: string; role: string }>
  }>(`/admin/support-cases${query}`)
  return response.data
}

export async function getSupportCase(supportCaseId: string) {
  const response = await adminRequest<AdminSupportDetails>(
    `/admin/support-cases/${supportCaseId}`
  )
  return response.data
}

export async function replySupportCase(params: {
  supportCaseId: string
  message: string
  status?: SupportCaseStatus
}) {
  const response = await adminRequest<AdminSupportDetails>(
    `/admin/support-cases/${params.supportCaseId}/reply`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: params.message,
        status: params.status,
      }),
    }
  )
  return response.data
}

export async function updateSupportCase(params: {
  supportCaseId: string
  status?: SupportCaseStatus
  priority?: SupportCasePriority
  assignedAdminId?: string
  resolutionNote?: string
  tags?: string[]
}) {
  const response = await adminRequest<AdminSupportDetails>(
    `/admin/support-cases/${params.supportCaseId}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: params.status,
        priority: params.priority,
        assignedAdminId: params.assignedAdminId,
        resolutionNote: params.resolutionNote,
        tags: params.tags,
      }),
    }
  )
  return response.data
}

export async function addSupportInternalNote(params: {
  supportCaseId: string
  note: string
}) {
  const response = await adminRequest<AdminSupportDetails>(
    `/admin/support-cases/${params.supportCaseId}/internal-notes`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note: params.note }),
    }
  )
  return response.data
}

export async function getAdminReports(params?: {
  preset?: AdminReportsPreset
  from?: string
  to?: string
  zoneId?: string
  districtId?: string
}) {
  const searchParams = new URLSearchParams()
  if (params?.preset) searchParams.set("preset", params.preset)
  if (params?.from) searchParams.set("from", params.from)
  if (params?.to) searchParams.set("to", params.to)
  if (params?.zoneId) searchParams.set("zoneId", params.zoneId)
  if (params?.districtId) searchParams.set("districtId", params.districtId)
  const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const response = await adminRequest<AdminReportsResponse>(`/admin/reports${query}`)
  return response.data
}

export async function listAdminRiders(params?: {
  search?: string
  status?: "all" | "active" | "suspended" | "locked"
  availability?: "all" | "available" | "unavailable"
  verification?: "all" | "pending" | "approved" | "rejected" | "missing"
  sortBy?: "newest" | "recentLogin" | "mostActive" | "mostDelivered"
  page?: number
  pageSize?: number
  zoneId?: string
  districtId?: string
}) {
  const searchParams = new URLSearchParams()
  if (params?.search) searchParams.set("search", params.search)
  if (params?.status && params.status !== "all")
    searchParams.set("status", params.status)
  if (params?.availability && params.availability !== "all") {
    searchParams.set("availability", params.availability)
  }
  if (params?.verification && params.verification !== "all") {
    searchParams.set("verification", params.verification)
  }
  if (params?.sortBy) searchParams.set("sortBy", params.sortBy)
  if (params?.page) searchParams.set("page", `${params.page}`)
  if (params?.pageSize) searchParams.set("pageSize", `${params.pageSize}`)
  if (params?.zoneId) searchParams.set("zoneId", params.zoneId)
  if (params?.districtId) searchParams.set("districtId", params.districtId)
  const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const response = await adminRequest<AdminListResponse<AdminRiderSummary>>(
    `/admin/riders${query}`
  )
  return response.data
}

export async function createAdminRider(params: {
  fullName: string
  phone: string
  status?: "active" | "suspended" | "locked"
  isAvailableForAssignments?: boolean
  verificationStatus?: "pending" | "approved" | "rejected"
  nationalIdNumber?: string
  monthlySalary?: number
  payoutDay?: number
  primaryZoneId?: string
  assignedZoneIds?: string[]
}) {
  const response = await adminRequest<AdminRiderSummary>("/admin/riders", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(params),
  })
  return response.data
}

export async function getAdminLiveMap() {
  const response = await adminRequest<AdminLiveMapSnapshot>("/admin/live-map")
  return response.data
}

export async function getAdminRider(riderId: string) {
  const response = await adminRequest<AdminRiderDetails>(
    `/admin/riders/${riderId}`
  )
  return response.data
}

export async function listAdminRiderPayroll(params?: {
  month?: string
  zoneId?: string
  districtId?: string
}) {
  const searchParams = new URLSearchParams()
  if (params?.month) searchParams.set("month", params.month)
  if (params?.zoneId) searchParams.set("zoneId", params.zoneId)
  if (params?.districtId) searchParams.set("districtId", params.districtId)
  const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const response = await adminRequest<AdminRiderPayrollSnapshot>(
    `/admin/rider-payroll${query}`
  )
  return response.data
}

export async function updateAdminRiderPayrollSettings(params: {
  riderId: string
  monthlySalary: number
  payoutDay: number
  isPayrollEnabled?: boolean
  note?: string
}) {
  const response = await adminRequest<AdminRiderSummary>(
    `/admin/riders/${params.riderId}/payroll-settings`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        monthlySalary: params.monthlySalary,
        payoutDay: params.payoutDay,
        isPayrollEnabled: params.isPayrollEnabled,
        note: params.note,
      }),
    }
  )
  return response.data
}

export async function addAdminRiderPayrollAdjustment(params: {
  riderId: string
  month?: string
  type: "bonus" | "tip" | "reimbursement" | "penalty" | "deduction"
  amount: number
  note?: string
}) {
  const response = await adminRequest<AdminRiderPayroll>(
    `/admin/riders/${params.riderId}/payroll-adjustments`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        month: params.month,
        type: params.type,
        amount: params.amount,
        note: params.note,
      }),
    }
  )
  return response.data
}

export async function updateAdminRiderPayrollStatus(params: {
  riderId: string
  month?: string
  status: "draft" | "approved" | "paid"
  paymentReference?: string
  note?: string
}) {
  const response = await adminRequest<AdminRiderPayroll>(
    `/admin/riders/${params.riderId}/payroll-status`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        month: params.month,
        status: params.status,
        paymentReference: params.paymentReference,
        note: params.note,
      }),
    }
  )
  return response.data
}

export async function setAdminRiderActiveTrip(params: {
  riderId: string
  orderId: string
}) {
  const response = await adminRequest<AdminRiderDetails>(
    `/admin/riders/${params.riderId}/active-trip`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ orderId: params.orderId }),
    },
  )
  return response.data
}

export async function updateAdminRiderStatus(params: {
  riderId: string
  expectedStatus?: string
  status: "active" | "suspended" | "locked"
}) {
  const response = await adminRequest<{
    id: string
    previousStatus: string
    status: "active" | "suspended" | "locked"
    isAvailableForAssignments: boolean
  }>(`/admin/riders/${params.riderId}/status`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      expectedStatus: params.expectedStatus,
      status: params.status,
    }),
  })
  return response.data
}

export async function updateAdminRiderVerification(params: {
  riderId: string
  expectedStatus?: string
  status: "pending" | "approved" | "rejected"
  note?: string
}) {
  const response = await adminRequest<AdminRiderSummary>(
    `/admin/riders/${params.riderId}/verification`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        expectedStatus: params.expectedStatus,
        status: params.status,
        note: params.note,
      }),
    }
  )
  return response.data
}

export async function listAdminRestaurants(params?: {
  search?: string
  visibility?: "all" | "visible" | "hidden"
  runtime?: "all" | "online" | "offline"
  sortBy?: "newestUpdated" | "mostOrders" | "highestRating" | "completionHigh"
  page?: number
  pageSize?: number
  zoneId?: string
  districtId?: string
}) {
  const searchParams = new URLSearchParams()
  if (params?.search) {
    searchParams.set("search", params.search)
  }
  if (params?.visibility && params.visibility !== "all") {
    searchParams.set("visibility", params.visibility)
  }
  if (params?.runtime && params.runtime !== "all") {
    searchParams.set("runtime", params.runtime)
  }
  if (params?.sortBy) {
    searchParams.set("sortBy", params.sortBy)
  }
  if (params?.page) {
    searchParams.set("page", `${params.page}`)
  }
  if (params?.pageSize) {
    searchParams.set("pageSize", `${params.pageSize}`)
  }
  if (params?.zoneId) searchParams.set("zoneId", params.zoneId)
  if (params?.districtId) searchParams.set("districtId", params.districtId)
  const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const response = await adminRequest<
    AdminListResponse<AdminRestaurantSummary>
  >(`/admin/restaurants${query}`)
  return response.data
}

export async function createAdminRestaurant(
  payload: AdminRestaurantCreateInput
) {
  const response = await adminRequest<AdminRestaurantSummary>(
    "/admin/restaurants",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  )
  return response.data
}

export async function deleteAdminRestaurant(restaurantId: string) {
  const response = await adminRequest<{
    id: string
    name: string
    mode: "deleted" | "hidden"
    orderCount: number
    deletedAt: string | null
    updatedAt: string | null
  }>(`/admin/restaurants/${restaurantId}`, {
    method: "DELETE",
  })
  return response.data
}

export async function deleteAdminRestaurantReview(params: {
  restaurantId: string
  reviewId: string
}) {
  const response = await adminRequest<{
    id: string
    restaurantId: string
    deletedAt: string
    isHidden: boolean
  }>(`/admin/restaurants/${params.restaurantId}/reviews/${params.reviewId}`, {
    method: "DELETE",
  })
  return response.data
}

export async function restoreAdminRestaurantReview(params: {
  restaurantId: string
  reviewId: string
}) {
  const response = await adminRequest<{
    id: string
    restaurantId: string
    restoredAt: string
    isHidden: boolean
  }>(
    `/admin/restaurants/${params.restaurantId}/reviews/${params.reviewId}/restore`,
    {
      method: "PATCH",
    }
  )
  return response.data
}

export async function listAdminCustomers(params?: {
  search?: string
  status?: "all" | "active" | "suspended" | "locked"
  requestStatus?:
    | "all"
    | "pending"
    | "cancelled"
    | "reviewed"
    | "completed"
    | "none"
  customerGroupKey?: string
  preset?: string
  from?: string
  to?: string
  sortBy?: "newest" | "recentLogin" | "mostOrders" | "highestSpend" | "repeatFirst"
  tier?: "all" | AdminCustomerTier
  page?: number
  pageSize?: number
  zoneId?: string
  districtId?: string
}) {
  const searchParams = new URLSearchParams()
  if (params?.search) searchParams.set("search", params.search)
  if (params?.status && params.status !== "all")
    searchParams.set("status", params.status)
  if (params?.requestStatus && params.requestStatus !== "all") {
    searchParams.set("requestStatus", params.requestStatus)
  }
  if (params?.customerGroupKey) {
    searchParams.set("customerGroupKey", params.customerGroupKey)
  }
  if (params?.preset) searchParams.set("preset", params.preset)
  if (params?.from) searchParams.set("from", params.from)
  if (params?.to) searchParams.set("to", params.to)
  if (params?.sortBy) searchParams.set("sortBy", params.sortBy)
  if (params?.tier && params.tier !== "all") searchParams.set("tier", params.tier)
  if (params?.page) searchParams.set("page", `${params.page}`)
  if (params?.pageSize) searchParams.set("pageSize", `${params.pageSize}`)
  if (params?.zoneId) searchParams.set("zoneId", params.zoneId)
  if (params?.districtId) searchParams.set("districtId", params.districtId)
  const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const response = await adminRequest<
    AdminListResponse<AdminCustomerSummary> & {
      summary?: AdminCustomerDirectorySummary
    }
  >(`/admin/customers${query}`)
  return response.data
}

export async function listAdminCustomerGroups() {
  const response = await adminRequest<{
    items: AdminCustomerGroup[]
    total: number
  }>("/admin/customer-groups")
  return response.data
}

export async function createAdminCustomerGroup(payload: {
  name: string
  description?: string
  sourceFilter?: {
    search?: string
    status?: "all" | "active" | "suspended" | "locked"
    requestStatus?:
      | "all"
      | "pending"
      | "cancelled"
      | "reviewed"
      | "completed"
      | "none"
    customerGroupKey?: string
    preset?: string
    from?: string
    to?: string
    sortBy?:
      | "newest"
      | "recentLogin"
      | "mostOrders"
      | "highestSpend"
      | "repeatFirst"
    tier?: "all" | AdminCustomerTier
    zoneId?: string
    districtId?: string
  }
  customerIds?: string[]
}) {
  const scopeParams = getAdminZoneScopeQueryParams()
  const scopedPayload = {
    ...payload,
    sourceFilter: {
      ...(payload.sourceFilter ?? {}),
      ...scopeParams,
    },
  }
  const response = await adminRequest<AdminCustomerGroup>("/admin/customer-groups", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(scopedPayload),
  })
  return response.data
}

export async function updateAdminCustomerGroup(
  groupId: string,
  payload: {
    name?: string
    description?: string
  }
) {
  const response = await adminRequest<AdminCustomerGroup>(
    `/admin/customer-groups/${groupId}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }
  )
  return response.data
}

export async function deleteAdminCustomerGroup(groupId: string) {
  const response = await adminRequest<{
    deleted: boolean
    group: AdminCustomerGroup
  }>(`/admin/customer-groups/${groupId}`, {
    method: "DELETE",
  })
  return response.data
}

export async function addAdminCustomerGroupMembers(params: {
  groupId: string
  customerIds: string[]
}) {
  const response = await adminRequest<AdminCustomerGroup>(
    `/admin/customer-groups/${params.groupId}/members`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customerIds: params.customerIds }),
    }
  )
  return response.data
}

export async function removeAdminCustomerGroupMember(params: {
  groupId: string
  customerId: string
}) {
  const response = await adminRequest<AdminCustomerGroup>(
    `/admin/customer-groups/${params.groupId}/members/${params.customerId}`,
    { method: "DELETE" }
  )
  return response.data
}

export async function listAdminReferrals(params?: {
  search?: string
  status?: "all" | AdminReferralStatus
  preset?: "today" | "yesterday" | "last7Days" | "last30Days" | "last90Days" | "thisMonth" | "lastMonth" | "lifetime" | "custom"
  from?: string
  to?: string
  sortBy?: "newest" | "oldest" | "rewardedAt" | "risk"
  page?: number
  pageSize?: number
  zoneId?: string
  districtId?: string
}) {
  const searchParams = new URLSearchParams()
  if (params?.search) searchParams.set("search", params.search)
  if (params?.status && params.status !== "all")
    searchParams.set("status", params.status)
  if (params?.preset) searchParams.set("preset", params.preset)
  if (params?.from) searchParams.set("from", params.from)
  if (params?.to) searchParams.set("to", params.to)
  if (params?.sortBy) searchParams.set("sortBy", params.sortBy)
  if (params?.page) searchParams.set("page", `${params.page}`)
  if (params?.pageSize) searchParams.set("pageSize", `${params.pageSize}`)
  if (params?.zoneId) searchParams.set("zoneId", params.zoneId)
  if (params?.districtId) searchParams.set("districtId", params.districtId)
  const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const response = await adminRequest<AdminReferralListResponse>(
    `/admin/referrals${query}`
  )
  return response.data
}

export async function getAdminReferral(referralId: string) {
  const response = await adminRequest<AdminReferralRow>(
    `/admin/referrals/${referralId}`
  )
  return response.data
}

export async function getAdminCustomer(
  customerId: string,
  params?: {
    preset?: AdminRestaurantOrderDateFilterPreset
    from?: string
    to?: string
  }
) {
  const searchParams = new URLSearchParams()
  if (params?.preset) searchParams.set("preset", params.preset)
  if (params?.from) searchParams.set("from", params.from)
  if (params?.to) searchParams.set("to", params.to)
  const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const response = await adminRequest<AdminCustomerDetails>(
    `/admin/customers/${customerId}${query}`
  )
  return response.data
}

export async function deleteAdminCustomerPersonalOffer(params: {
  customerId: string
  notificationId: string
}) {
  const response = await adminRequest<{
    deleted: boolean
    notificationId: string
    voucherId?: string
  }>(`/admin/customers/${params.customerId}/offers/${params.notificationId}`, {
    method: "DELETE",
  })
  return response.data
}

export async function listAdminCustomerOrders(
  customerId: string,
  params?: {
    preset?: AdminRestaurantOrderDateFilterPreset
    from?: string
    to?: string
    restaurantId?: string
    status?: "all" | "live" | "delivered" | "cancelled"
    search?: string
    sortBy?: "newest" | "oldest" | "highestValue"
    page?: number
    pageSize?: number
  }
) {
  const searchParams = new URLSearchParams()
  if (params?.preset) searchParams.set("preset", params.preset)
  if (params?.from) searchParams.set("from", params.from)
  if (params?.to) searchParams.set("to", params.to)
  if (params?.restaurantId)
    searchParams.set("restaurantId", params.restaurantId)
  if (params?.status && params.status !== "all")
    searchParams.set("status", params.status)
  if (params?.search) searchParams.set("search", params.search)
  if (params?.sortBy) searchParams.set("sortBy", params.sortBy)
  if (params?.page) searchParams.set("page", `${params.page}`)
  if (params?.pageSize) searchParams.set("pageSize", `${params.pageSize}`)
  const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const response = await adminRequest<{
    items: AdminCustomerOrderHistoryItem[]
    total: number
    page: number
    pageSize: number
    pageCount: number
  }>(`/admin/customers/${customerId}/orders${query}`)
  return response.data
}

export async function listAdminOrders(params?: {
  search?: string
  preset?: AdminRestaurantOrderDateFilterPreset
  from?: string
  to?: string
  status?:
    | "all"
    | "new"
    | "live"
    | "ready"
    | "pickedUp"
    | "delivered"
    | "cancelled"
    | "refund"
  paymentMethod?: "all" | "Cash" | "Bkash"
  paymentStatus?: "all" | "pending" | "paid" | "refund_pending" | "refunded"
  assignment?: "all" | "assigned" | "unassigned" | "stale"
  attention?: "all" | "riderDelay" | "extraTime"
  sortBy?: "newest" | "oldest" | "highestValue" | "recentlyUpdated"
  page?: number
  pageSize?: number
}) {
  const searchParams = new URLSearchParams()
  if (params?.search) searchParams.set("search", params.search)
  if (params?.preset) searchParams.set("preset", params.preset)
  if (params?.from) searchParams.set("from", params.from)
  if (params?.to) searchParams.set("to", params.to)
  if (params?.status && params.status !== "all")
    searchParams.set("status", params.status)
  if (params?.paymentMethod && params.paymentMethod !== "all") {
    searchParams.set("paymentMethod", params.paymentMethod)
  }
  if (params?.paymentStatus && params.paymentStatus !== "all") {
    searchParams.set("paymentStatus", params.paymentStatus)
  }
  if (params?.assignment && params.assignment !== "all") {
    searchParams.set("assignment", params.assignment)
  }
  if (params?.attention && params.attention !== "all") {
    searchParams.set("attention", params.attention)
  }
  if (params?.sortBy) searchParams.set("sortBy", params.sortBy)
  if (params?.page) searchParams.set("page", `${params.page}`)
  if (params?.pageSize) searchParams.set("pageSize", `${params.pageSize}`)
  const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const response = await adminRequest<AdminOrdersListResponse>(
    `/admin/orders${query}`
  )
  return response.data
}

export async function listAdminPayments(params?: {
  search?: string
  preset?: AdminRestaurantOrderDateFilterPreset
  from?: string
  to?: string
  paymentMethod?: "all" | "Cash" | "Bkash"
  paymentStatus?:
    | "all"
    | "pending"
    | "paid"
    | "refund_pending"
    | "refunded"
    | "refund_rejected"
  settlement?: "all" | "delivered" | "refund_queue" | "online" | "cod"
  sortBy?: "newest" | "oldest" | "highestValue" | "recentlyUpdated"
  page?: number
  pageSize?: number
}) {
  const searchParams = new URLSearchParams()
  if (params?.search) searchParams.set("search", params.search)
  if (params?.preset) searchParams.set("preset", params.preset)
  if (params?.from) searchParams.set("from", params.from)
  if (params?.to) searchParams.set("to", params.to)
  if (params?.paymentMethod && params.paymentMethod !== "all") {
    searchParams.set("paymentMethod", params.paymentMethod)
  }
  if (params?.paymentStatus && params.paymentStatus !== "all") {
    searchParams.set("paymentStatus", params.paymentStatus)
  }
  if (params?.settlement && params.settlement !== "all") {
    searchParams.set("settlement", params.settlement)
  }
  if (params?.sortBy) searchParams.set("sortBy", params.sortBy)
  if (params?.page) searchParams.set("page", `${params.page}`)
  if (params?.pageSize) searchParams.set("pageSize", `${params.pageSize}`)
  const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const response = await adminRequest<AdminPaymentsResponse>(
    `/admin/payments${query}`
  )
  return response.data
}

export async function listAdminBkashPaymentAttempts(params?: {
  search?: string
  preset?: AdminRestaurantOrderDateFilterPreset
  from?: string
  to?: string
  status?:
    | "all"
    | "initiated"
    | "provider_created"
    | "provider_create_failed"
    | "callback_success"
    | "customer_cancelled"
    | "callback_failed"
    | "execute_failed"
    | "confirmed_paid"
    | "order_finalized"
    | "order_finalize_failed"
    | "expired"
  paymentStatus?: "all" | "unpaid" | "paid" | "cancelled" | "failed" | "expired"
  orderState?: "all" | "finalized" | "missing" | "failed"
  page?: number
  pageSize?: number
}) {
  const searchParams = new URLSearchParams()
  if (params?.search) searchParams.set("search", params.search)
  if (params?.preset) searchParams.set("preset", params.preset)
  if (params?.from) searchParams.set("from", params.from)
  if (params?.to) searchParams.set("to", params.to)
  if (params?.status && params.status !== "all") {
    searchParams.set("status", params.status)
  }
  if (params?.paymentStatus && params.paymentStatus !== "all") {
    searchParams.set("paymentStatus", params.paymentStatus)
  }
  if (params?.orderState && params.orderState !== "all") {
    searchParams.set("orderState", params.orderState)
  }
  if (params?.page) searchParams.set("page", `${params.page}`)
  if (params?.pageSize) searchParams.set("pageSize", `${params.pageSize}`)
  const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const response = await adminRequest<AdminBkashPaymentAttemptsResponse>(
    `/admin/payments/bkash-attempts${query}`
  )
  return response.data
}

export async function reconcileAdminBkashPaymentAttempt(params: {
  attemptId: string
  note?: string
}) {
  const response = await adminRequest<AdminBkashPaymentReconcileResult>(
    `/admin/payments/bkash-attempts/${params.attemptId}/reconcile`,
    {
      method: "POST",
      body: JSON.stringify({
        note: params.note ?? "",
      }),
    }
  )
  return response.data
}

export async function exportAdminPayments(params?: Parameters<typeof buildAdminPaymentsQuery>[0]) {
  const query = buildAdminPaymentsQuery({
    ...params,
    page: 1,
    pageSize: 5000,
  })
  const response = await adminRequest<AdminPaymentsExportResponse>(
    `/admin/payments/export${query}`
  )
  return response.data
}

export async function reconcileAdminPaymentsLedger() {
  const response = await adminRequest<AdminPaymentsReconcileResult>(
    "/admin/payments/reconcile-ledger",
    {
      method: "POST",
    }
  )
  return response.data
}

export async function getAdminSmsBalance() {
  const response = await adminRequest<AdminSmsBalanceResponse>(
    "/admin/settings/sms-balance"
  )
  return response.data
}

function buildAdminPaymentsQuery(params?: {
  search?: string
  preset?: AdminRestaurantOrderDateFilterPreset
  from?: string
  to?: string
  paymentMethod?: "all" | "Cash" | "Bkash"
  paymentStatus?:
    | "all"
    | "pending"
    | "paid"
    | "refund_pending"
    | "refunded"
    | "refund_rejected"
  settlement?: "all" | "delivered" | "refund_queue" | "online" | "cod"
  sortBy?: "newest" | "oldest" | "highestValue" | "recentlyUpdated"
  page?: number
  pageSize?: number
}) {
  const searchParams = new URLSearchParams()
  if (params?.search) searchParams.set("search", params.search)
  if (params?.preset) searchParams.set("preset", params.preset)
  if (params?.from) searchParams.set("from", params.from)
  if (params?.to) searchParams.set("to", params.to)
  if (params?.paymentMethod && params.paymentMethod !== "all") {
    searchParams.set("paymentMethod", params.paymentMethod)
  }
  if (params?.paymentStatus && params.paymentStatus !== "all") {
    searchParams.set("paymentStatus", params.paymentStatus)
  }
  if (params?.settlement && params.settlement !== "all") {
    searchParams.set("settlement", params.settlement)
  }
  if (params?.sortBy) searchParams.set("sortBy", params.sortBy)
  if (params?.page) searchParams.set("page", `${params.page}`)
  if (params?.pageSize) searchParams.set("pageSize", `${params.pageSize}`)
  return searchParams.toString() ? `?${searchParams.toString()}` : ""
}

export async function getAdminOrder(orderId: string) {
  const response = await adminRequest<AdminOrderDetails>(
    `/admin/orders/${orderId}`
  )
  return response.data
}

export async function listAdminOrdersMonitor(params?: {
  scope?: "all" | "live" | "stale"
}) {
  const searchParams = new URLSearchParams()
  if (params?.scope && params.scope !== "all") {
    searchParams.set("scope", params.scope)
  }
  const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const response = await adminRequest<AdminOrdersMonitorResponse>(
    `/admin/orders-monitor${query}`
  )
  return response.data
}

export async function listAdminRidersAssignmentOptions() {
  const scope = getAdminZoneScopeQueryParams()
  const searchParams = new URLSearchParams()
  if ("zoneId" in scope && scope.zoneId) searchParams.set("zoneId", scope.zoneId)
  if ("districtId" in scope && scope.districtId) searchParams.set("districtId", scope.districtId)
  const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const response = await adminRequest<AdminRiderAssignmentOption[]>(
    `/admin/riders-assignment-options${query}`
  )
  return response.data
}

export async function assignAdminOrderRider(params: {
  orderId: string
  riderId: string
}) {
  const response = await adminRequest<{
    id: string
    orderNumber: string
    riderId: string
    riderName: string
    assignmentSource?: "manual_admin" | "auto_dispatch"
  }>(`/admin/orders/${params.orderId}/assign-rider`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ riderId: params.riderId }),
  })
  return response.data
}

export async function updateAdminOrderStatus(params: {
  orderId: string
  expectedStatus: string
  nextStatus:
    | "Accepted"
    | "Rejected"
    | "Preparing"
    | "ReadyForPickup"
    | "Cancelled"
  note?: string
}) {
  const response = await adminRequest<{
    id: string
    orderNumber: string
    previousStatus: string
    status: string
    paymentStatus?: string
    updatedAt: string | null
  }>(`/admin/orders/${params.orderId}/status`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      expectedStatus: params.expectedStatus,
      nextStatus: params.nextStatus,
      note: params.note,
    }),
  })
  return response.data
}

export async function updateAdminOrderRefundStatus(params: {
  orderId: string
  expectedPaymentStatus?: string
  paymentStatus: "refund_pending" | "refunded" | "refund_rejected"
  note?: string
  providerReference?: string
  proofUrl?: string
}) {
  const response = await adminRequest<{
    id: string
    orderNumber: string
    previousPaymentStatus: string
    paymentStatus: string
    updatedAt: string | null
  }>(`/admin/orders/${params.orderId}/refund`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      expectedPaymentStatus: params.expectedPaymentStatus,
      paymentStatus: params.paymentStatus,
      note: params.note,
      providerReference: params.providerReference,
      proofUrl: params.proofUrl,
    }),
  })
  return response.data
}

export async function updateAdminOrderCodCollection(params: {
  orderId: string
  expectedPaymentStatus?: string
  note?: string
}) {
  const response = await adminRequest<{
    id: string
    orderNumber: string
    previousPaymentStatus: string
    paymentStatus: string
    updatedAt: string | null
  }>(`/admin/orders/${params.orderId}/cod-collection`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      expectedPaymentStatus: params.expectedPaymentStatus,
      note: params.note,
    }),
  })
  return response.data
}

export async function getAdminDispatchSettings() {
  const scope = getAdminZoneScopeQueryParams()
  const searchParams = new URLSearchParams()
  if ("zoneId" in scope && scope.zoneId) searchParams.set("zoneId", scope.zoneId)
  if ("districtId" in scope && scope.districtId) searchParams.set("districtId", scope.districtId)
  const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const response = await adminRequest<AdminDispatchSettings>(
    `/admin/dispatch-settings${query}`
  )
  return response.data
}

export async function listAdminDispatchLogs(params?: {
  search?: string
  outcome?: "all" | "assigned" | "reassigned" | "no_match" | "skipped"
  source?: "all" | "manual_admin" | "auto_dispatch"
  from?: string
  to?: string
  page?: number
  pageSize?: number
}) {
  const scope = getAdminZoneScopeQueryParams()
  const searchParams = new URLSearchParams()
  if (params?.search) searchParams.set("search", params.search)
  if (params?.outcome && params.outcome !== "all") {
    searchParams.set("outcome", params.outcome)
  }
  if (params?.source && params.source !== "all") {
    searchParams.set("source", params.source)
  }
  if (params?.from) searchParams.set("from", params.from)
  if (params?.to) searchParams.set("to", params.to)
  if (params?.page) searchParams.set("page", `${params.page}`)
  if (params?.pageSize) searchParams.set("pageSize", `${params.pageSize}`)
  if ("zoneId" in scope && scope.zoneId) searchParams.set("zoneId", scope.zoneId)
  if ("districtId" in scope && scope.districtId) searchParams.set("districtId", scope.districtId)

  const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const response = await adminRequest<AdminDispatchLogsResponse>(
    `/admin/dispatch-logs${query}`
  )
  return response.data
}

export async function updateAdminDispatchSettings(
  settings: Omit<AdminDispatchSettings, "metrics" | "recentLogs">
) {
  const scope = getAdminZoneScopeQueryParams()
  const searchParams = new URLSearchParams()
  if ("zoneId" in scope && scope.zoneId) searchParams.set("zoneId", scope.zoneId)
  if ("districtId" in scope && scope.districtId) searchParams.set("districtId", scope.districtId)
  const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const response = await adminRequest<AdminDispatchSettings>(
    `/admin/dispatch-settings${query}`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(settings),
    }
  )
  return response.data
}

export async function runAdminAutoDispatch() {
  const scope = getAdminZoneScopeQueryParams()
  const searchParams = new URLSearchParams()
  if ("zoneId" in scope && scope.zoneId) searchParams.set("zoneId", scope.zoneId)
  if ("districtId" in scope && scope.districtId) searchParams.set("districtId", scope.districtId)
  const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const response = await adminRequest<{
    assigned: number
    scanned: number
    skipped: number
    reason: string
  }>(`/admin/dispatch/run${query}`, {
    method: "POST",
  })
  return response.data
}

export async function updateAdminCustomerStatus(params: {
  customerId: string
  status: "active" | "suspended" | "locked"
  note?: string
}) {
  const response = await adminRequest<AdminCustomerStatusUpdate>(
    `/admin/customers/${params.customerId}/status`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        status: params.status,
        note: params.note,
      }),
    }
  )
  return response.data
}

export async function getAdminRestaurant(
  restaurantId: string,
  params?: {
    preset?: AdminRestaurantOrderDateFilterPreset
    from?: string
    to?: string
  }
) {
  const searchParams = new URLSearchParams()
  if (params?.preset) {
    searchParams.set("preset", params.preset)
  }
  if (params?.from) {
    searchParams.set("from", params.from)
  }
  if (params?.to) {
    searchParams.set("to", params.to)
  }
  const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const response = await adminRequest<AdminRestaurantDetails>(
    `/admin/restaurants/${restaurantId}${query}`
  )
  return response.data
}

export async function listAdminRestaurantOrders(
  restaurantId: string,
  params?: {
    preset?: AdminRestaurantOrderDateFilterPreset
    from?: string
    to?: string
    status?: "all" | "live" | "delivered" | "cancelled"
    paymentMethod?: string
    search?: string
    sortBy?: "newest" | "oldest" | "highestValue"
    page?: number
    pageSize?: number
  }
) {
  const searchParams = new URLSearchParams()
  if (params?.preset) searchParams.set("preset", params.preset)
  if (params?.from) searchParams.set("from", params.from)
  if (params?.to) searchParams.set("to", params.to)
  if (params?.status && params.status !== "all")
    searchParams.set("status", params.status)
  if (params?.paymentMethod && params.paymentMethod !== "all") {
    searchParams.set("paymentMethod", params.paymentMethod)
  }
  if (params?.search) searchParams.set("search", params.search)
  if (params?.sortBy) searchParams.set("sortBy", params.sortBy)
  if (params?.page) searchParams.set("page", `${params.page}`)
  if (params?.pageSize) searchParams.set("pageSize", `${params.pageSize}`)
  const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const response = await adminRequest<{
    items: AdminRestaurantOrderHistoryItem[]
    total: number
    page: number
    pageSize: number
    pageCount: number
  }>(`/admin/restaurants/${restaurantId}/orders${query}`)
  return response.data
}

export async function updateAdminRestaurantVisibility(params: {
  restaurantId: string
  isVisible: boolean
}) {
  const response = await adminRequest<AdminRestaurantVisibilityUpdate>(
    `/admin/restaurants/${params.restaurantId}/visibility`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        isVisible: params.isVisible,
      }),
    }
  )
  return response.data
}

export async function updateAdminRestaurantEnforcement(params: {
  restaurantId: string
  status:
    | "active"
    | "under_review"
    | "quality_hold"
    | "temporarily_suspended"
    | "permanently_disabled"
  reason?: string
  ownerNote?: string
  customerMessage?: string
  internalNote?: string
  expiresAt?: string | null
}) {
  const response = await adminRequest<{
    id: string
    name: string
    enforcement: AdminRestaurantSummary["enforcement"]
    isOnline: boolean
    isVisible: boolean
    updatedAt: string | null
  }>(`/admin/restaurants/${params.restaurantId}/enforcement`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      status: params.status,
      reason: params.reason,
      ownerNote: params.ownerNote,
      customerMessage: params.customerMessage,
      internalNote: params.internalNote,
      expiresAt: params.expiresAt,
    }),
  })
  return response.data
}

export async function updateAdminRestaurantMerchandising(params: {
  restaurantId: string
  isFeatured: boolean
  featuredPosition: number | null
  customerNote?: {
    enabled: boolean
    label: string
    placeholder: string
  }
}) {
  const response = await adminRequest<AdminRestaurantMerchandisingUpdate>(
    `/admin/restaurants/${params.restaurantId}/merchandising`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        isFeatured: params.isFeatured,
        featuredPosition: params.featuredPosition,
        customerNote: params.customerNote,
      }),
    }
  )
  return response.data
}

export async function updateAdminRestaurantCommission(params: {
  restaurantId: string
  commissionRate: number
}) {
  const response = await adminRequest<AdminRestaurantCommissionUpdate>(
    `/admin/restaurants/${params.restaurantId}/commission`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        commissionRate: params.commissionRate,
      }),
    }
  )
  return response.data
}

export async function updateAdminRestaurantDeliveryPricing(params: {
  restaurantId: string
  enabled: boolean
  baseFeeTaka: number
  distanceSurchargeEnabled: boolean
  surchargeStartsAfterKm: number
  surchargeStepMeters: number
  surchargeAmountTaka: number
}) {
  const response = await adminRequest<AdminRestaurantDeliveryPricingUpdate>(
    `/admin/restaurants/${params.restaurantId}/delivery-pricing`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        enabled: params.enabled,
        baseFeeTaka: params.baseFeeTaka,
        distanceSurchargeEnabled: params.distanceSurchargeEnabled,
        surchargeStartsAfterKm: params.surchargeStartsAfterKm,
        surchargeStepMeters: params.surchargeStepMeters,
        surchargeAmountTaka: params.surchargeAmountTaka,
      }),
    }
  )
  return response.data
}

export async function reconcileAdminRestaurantFinance(restaurantId: string) {
  const response = await adminRequest<AdminRestaurantFinanceReconcileResult>(
    `/admin/restaurants/${restaurantId}/finance/reconcile`,
    {
      method: "POST",
    }
  )
  return response.data
}

export async function getAdminPlatformFinance(params?: {
  preset?: AdminReportsPreset
  from?: string
  to?: string
}) {
  const searchParams = new URLSearchParams()
  if (params?.preset) searchParams.set("preset", params.preset)
  if (params?.from) searchParams.set("from", params.from)
  if (params?.to) searchParams.set("to", params.to)
  const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const response = await adminRequest<AdminPlatformFinanceResponse>(
    `/admin/finance/platform${query}`
  )
  return response.data
}

export async function listAdminMoneyTransactions(params?: {
  preset?: AdminReportsPreset
  from?: string
  to?: string
  search?: string
  direction?: "all" | "credit" | "debit"
  category?:
    | "all"
    | "online_payment"
    | "cod_collection"
    | "restaurant_payout"
    | "customer_refund"
    | "rider_payroll"
    | "deploy_hosting"
    | "manual_income"
    | "manual_expense"
    | "adjustment"
    | "other"
  source?: "all" | "order" | "payout" | "refund" | "payroll" | "wallet"
  page?: number
  pageSize?: number
}) {
  const searchParams = new URLSearchParams()
  if (params?.preset) searchParams.set("preset", params.preset)
  if (params?.from) searchParams.set("from", params.from)
  if (params?.to) searchParams.set("to", params.to)
  if (params?.search) searchParams.set("search", params.search)
  if (params?.direction && params.direction !== "all") {
    searchParams.set("direction", params.direction)
  }
  if (params?.category && params.category !== "all") {
    searchParams.set("category", params.category)
  }
  if (params?.source && params.source !== "all") {
    searchParams.set("source", params.source)
  }
  if (params?.page) searchParams.set("page", `${params.page}`)
  if (params?.pageSize) searchParams.set("pageSize", `${params.pageSize}`)
  const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const response = await adminRequest<AdminMoneyTransactionsResponse>(
    `/admin/finance/transactions${query}`
  )
  return response.data
}

export async function listAdminPlatformWalletEntries(params?: {
  preset?: AdminReportsPreset
  from?: string
  to?: string
  direction?: "all" | "credit" | "debit"
  category?:
    | "all"
    | "online_payment"
    | "cod_deposit"
    | "restaurant_payout"
    | "customer_refund"
    | "rider_payroll"
    | "deploy_hosting"
    | "manual_expense"
    | "manual_income"
    | "adjustment"
    | "other"
  page?: number
  pageSize?: number
}) {
  const searchParams = new URLSearchParams()
  if (params?.preset) searchParams.set("preset", params.preset)
  if (params?.from) searchParams.set("from", params.from)
  if (params?.to) searchParams.set("to", params.to)
  if (params?.direction && params.direction !== "all") {
    searchParams.set("direction", params.direction)
  }
  if (params?.category && params.category !== "all") {
    searchParams.set("category", params.category)
  }
  if (params?.page) searchParams.set("page", `${params.page}`)
  if (params?.pageSize) searchParams.set("pageSize", `${params.pageSize}`)
  const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const response = await adminRequest<AdminPlatformWalletResponse>(
    `/admin/finance/wallet${query}`
  )
  return response.data
}

export async function createAdminPlatformWalletEntry(params: {
  direction: "credit" | "debit"
  category: "cod_deposit" | "deploy_hosting" | "manual_expense" | "manual_income" | "adjustment" | "other"
  amount: number
  occurredAt?: string
  paymentMethod?: string
  reference?: string
  proofUrl?: string
  note?: string
}) {
  const response = await adminRequest<AdminPlatformWalletEntry>(
    "/admin/finance/wallet",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
    }
  )
  return response.data
}

export async function voidAdminPlatformWalletEntry(entryId: string) {
  const response = await adminRequest<AdminPlatformWalletEntry>(
    `/admin/finance/wallet/${entryId}/void`,
    { method: "POST" }
  )
  return response.data
}

export async function closeAdminDailyFinance(params?: {
  date?: string
  note?: string
}) {
  const response = await adminRequest<AdminDailyFinanceCloseResponse>(
    "/admin/finance/daily-closing",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params ?? {}),
    }
  )
  return response.data
}

export async function listAdminFinancePayouts(params?: {
  search?: string
  zoneId?: string
  eligibility?: "all" | AdminFinancePayoutEligibility
  sortBy?: "available_desc" | "pending_desc" | "recent_request" | "name_asc"
  page?: number
  pageSize?: number
}) {
  const searchParams = new URLSearchParams()
  if (params?.search) searchParams.set("search", params.search)
  if (params?.zoneId) searchParams.set("zoneId", params.zoneId)
  if (params?.eligibility && params.eligibility !== "all") {
    searchParams.set("eligibility", params.eligibility)
  }
  if (params?.sortBy) searchParams.set("sortBy", params.sortBy)
  if (params?.page) searchParams.set("page", `${params.page}`)
  if (params?.pageSize) searchParams.set("pageSize", `${params.pageSize}`)
  const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const response = await adminRequest<AdminFinancePayoutsResponse>(
    `/admin/finance/payouts${query}`
  )
  return response.data
}

export async function listAdminPayoutMethodApprovals() {
  const response = await adminRequest<{
    items: AdminPayoutMethodApproval[]
    total: number
  }>("/admin/finance/payout-method-approvals")
  return response.data
}

export async function reviewAdminPayoutMethodApproval(params: {
  methodId: string
  decision: "approved" | "rejected"
  note?: string
}) {
  const response = await adminRequest(`/admin/finance/payout-method-approvals/${params.methodId}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      decision: params.decision,
      note: params.note,
    }),
  })
  return response.data
}

export async function getAdminFinancePayoutDetails(restaurantId: string) {
  const response = await adminRequest<AdminFinancePayoutDetails>(
    `/admin/finance/payouts/${restaurantId}`
  )
  return response.data
}

export async function createAdminFinancePayout(params: {
  restaurantId: string
  amount: number
  status?: "processing" | "completed"
  note?: string
  providerReference?: string
  providerPayoutId?: string
  providerTransactionId?: string
  paymentProofUrl?: string
  includePending?: boolean
  notifyOwnerSms?: boolean
}) {
  const response = await adminRequest<AdminFinancePayoutBatch>(
    `/admin/finance/payouts/${params.restaurantId}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        amount: params.amount,
        status: params.status,
        note: params.note,
        providerReference: params.providerReference,
        providerPayoutId: params.providerPayoutId,
        providerTransactionId: params.providerTransactionId,
        paymentProofUrl: params.paymentProofUrl,
        includePending: params.includePending,
        notifyOwnerSms: params.notifyOwnerSms,
      }),
    }
  )
  return response.data
}

export async function listAdminFinanceLedger(params?: {
  search?: string
  restaurantId?: string
  zoneId?: string
  entryType?: "all" | "earning" | "refund" | "payout" | "adjustment"
  settlementStatus?: "all" | "pending" | "available" | "paid_out"
  sortBy?: "newest" | "oldest" | "highest_net" | "lowest_net"
  page?: number
  pageSize?: number
}) {
  const searchParams = new URLSearchParams()
  if (params?.search) searchParams.set("search", params.search)
  if (params?.restaurantId) searchParams.set("restaurantId", params.restaurantId)
  if (params?.zoneId) searchParams.set("zoneId", params.zoneId)
  if (params?.entryType && params.entryType !== "all") {
    searchParams.set("entryType", params.entryType)
  }
  if (params?.settlementStatus && params.settlementStatus !== "all") {
    searchParams.set("settlementStatus", params.settlementStatus)
  }
  if (params?.sortBy) searchParams.set("sortBy", params.sortBy)
  if (params?.page) searchParams.set("page", `${params.page}`)
  if (params?.pageSize) searchParams.set("pageSize", `${params.pageSize}`)
  const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const response = await adminRequest<AdminFinanceLedgerResponse>(
    `/admin/finance/ledger${query}`
  )
  return response.data
}

export async function listAdminFinanceRefunds(params?: {
  search?: string
  restaurantId?: string
  zoneId?: string
  status?: "all" | "refund_pending" | "refunded" | "refund_rejected" | "needs_review"
  sortBy?: "newest" | "oldest" | "highest_value" | "recently_updated"
  page?: number
  pageSize?: number
}) {
  const searchParams = new URLSearchParams()
  if (params?.search) searchParams.set("search", params.search)
  if (params?.restaurantId) searchParams.set("restaurantId", params.restaurantId)
  if (params?.zoneId) searchParams.set("zoneId", params.zoneId)
  if (params?.status && params.status !== "all") searchParams.set("status", params.status)
  if (params?.sortBy) searchParams.set("sortBy", params.sortBy)
  if (params?.page) searchParams.set("page", `${params.page}`)
  if (params?.pageSize) searchParams.set("pageSize", `${params.pageSize}`)
  const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const response = await adminRequest<AdminFinanceRefundsResponse>(
    `/admin/finance/refunds${query}`
  )
  return response.data
}

export async function updateAdminRestaurantPayoutStatus(params: {
  restaurantId: string
  payoutId: string
  status: "processing" | "completed" | "failed"
  expectedStatus?: string
  failureReason?: string
  providerReference?: string
  providerPayoutId?: string
  providerTransactionId?: string
  paymentProofUrl?: string
  processingNote?: string
  notifyOwnerSms?: boolean
}) {
  const response = await adminRequest<{
    id: string
    amount: number
    status: string
    batchReference: string
    provider: string
    providerReference: string
    providerPayoutId: string
    providerTransactionId: string
    paymentProofUrl: string
    processingNote: string
    failureReason: string
    requestedAt: string | null
    approvedAt: string | null
    processedAt: string | null
    updatedAt: string | null
  }>(`/admin/restaurants/${params.restaurantId}/payouts/${params.payoutId}/status`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      status: params.status,
      expectedStatus: params.expectedStatus,
      failureReason: params.failureReason,
      providerReference: params.providerReference,
      providerPayoutId: params.providerPayoutId,
      providerTransactionId: params.providerTransactionId,
      paymentProofUrl: params.paymentProofUrl,
      processingNote: params.processingNote,
      notifyOwnerSms: params.notifyOwnerSms,
    }),
  })
  return response.data
}

export async function listAdminRestaurantPromotions(
  restaurantId: string,
  params?: {
    search?: string
    lifecycle?: AdminVoucherLifecycle
    mode?: "all" | AdminVoucherMode
    type?: "all" | "flat" | "percentage" | "free-delivery"
    sortBy?: "newestUpdated" | "highestUses" | "highestDiscount" | "endingSoon"
    page?: number
    pageSize?: number
  }
) {
  const searchParams = new URLSearchParams()
  searchParams.set("restaurantId", restaurantId)
  if (params?.search) searchParams.set("search", params.search)
  if (params?.lifecycle && params.lifecycle !== "all") {
    searchParams.set("lifecycle", params.lifecycle)
  }
  if (params?.mode && params.mode !== "all") searchParams.set("mode", params.mode)
  if (params?.type && params.type !== "all") searchParams.set("type", params.type)
  if (params?.sortBy) searchParams.set("sortBy", params.sortBy)
  if (params?.page) searchParams.set("page", `${params.page}`)
  if (params?.pageSize) searchParams.set("pageSize", `${params.pageSize}`)
  const response = await adminRequest<
    AdminListResponse<AdminRestaurantVoucher>
  >(`/admin/vouchers?${searchParams.toString()}`)
  return response.data
}

export async function listAdminVouchers(params?: {
  restaurantId?: string
  zoneId?: string
  districtId?: string
  scopeType?: "all" | "restaurant" | "selected_restaurants" | "all_restaurants"
  surface?: "all" | "checkout" | "menu_markdown"
  search?: string
  lifecycle?: AdminVoucherLifecycle
  mode?: "all" | AdminVoucherMode
  type?: "all" | "flat" | "percentage" | "free-delivery"
  sortBy?: "newestUpdated" | "highestUses" | "highestDiscount" | "endingSoon"
  page?: number
  pageSize?: number
}) {
  const searchParams = new URLSearchParams()
  if (params?.restaurantId) searchParams.set("restaurantId", params.restaurantId)
  if (params?.zoneId) searchParams.set("zoneId", params.zoneId)
  if (params?.districtId) searchParams.set("districtId", params.districtId)
  if (params?.scopeType && params.scopeType !== "all") searchParams.set("scopeType", params.scopeType)
  // Always forward surface (incl. "all") so the backend can show both surfaces together;
  // omitting it falls back to the legacy "checkout only" default.
  if (params?.surface) searchParams.set("surface", params.surface)
  if (params?.search) searchParams.set("search", params.search)
  if (params?.lifecycle && params.lifecycle !== "all") {
    searchParams.set("lifecycle", params.lifecycle)
  }
  if (params?.mode && params.mode !== "all") searchParams.set("mode", params.mode)
  if (params?.type && params.type !== "all") searchParams.set("type", params.type)
  if (params?.sortBy) searchParams.set("sortBy", params.sortBy)
  if (params?.page) searchParams.set("page", `${params.page}`)
  if (params?.pageSize) searchParams.set("pageSize", `${params.pageSize}`)
  const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const response = await adminRequest<AdminListResponse<AdminRestaurantVoucher>>(
    `/admin/vouchers${query}`
  )
  return response.data
}

export async function createAdminVoucher(payload: AdminVoucherPayload) {
  const response = await adminRequest<AdminRestaurantVoucher>("/admin/vouchers", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  })
  return response.data
}

export async function updateAdminVoucher(
  voucherId: string,
  payload: AdminVoucherPayload
) {
  const response = await adminRequest<AdminRestaurantVoucher>(
    `/admin/vouchers/${voucherId}`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  )
  return response.data
}

export async function archiveAdminVoucher(voucherId: string, reason?: string) {
  const response = await adminRequest<AdminRestaurantVoucher>(
    `/admin/vouchers/${voucherId}/archive`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ reason }),
    }
  )
  return response.data
}

export async function restoreAdminVoucher(voucherId: string) {
  const response = await adminRequest<AdminRestaurantVoucher>(
    `/admin/vouchers/${voucherId}/restore`,
    {
      method: "PATCH",
    }
  )
  return response.data
}

export async function sendAdminVoucherPushCampaign(voucherId: string) {
  const response = await adminRequest<{
    totalTargets: number
    sentCount: number
    disabledCount: number
  }>(`/admin/vouchers/${voucherId}/send-push`, {
    method: "POST",
  })
  return response.data
}

export async function getAdminRestaurantPromotionTargets(
  restaurantId: string
) {
  const response = await adminRequest<AdminPromotionTargets>(
    `/admin/restaurants/${restaurantId}/promotion-targets`
  )
  return response.data
}

export async function getAdminOperationalHealth() {
  const response = await adminRequest<AdminOperationalHealthSnapshot>(
    "/admin/operations/health"
  )
  return response.data
}

export async function resolveAdminOperationalAlert(alertId: string) {
  const response = await adminRequest<{ updated: boolean }>(
    `/admin/operations/alerts/${alertId}/resolve`,
    { method: "PATCH" }
  )
  return response.data
}

export async function clearAdminRequestMonitor() {
  const response = await adminRequest<{ cleared: boolean }>(
    "/admin/operations/requests/clear",
    {
      method: "POST",
    },
  )
  return response.data
}

export async function snoozeAdminOperationalAlert(params: {
  alertId: string
  minutes: number
}) {
  const response = await adminRequest<{
    updated: boolean
    snoozedUntil: string
  }>(`/admin/operations/alerts/${params.alertId}/snooze`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ minutes: params.minutes }),
  })
  return response.data
}

export async function listAdminRiderAssignmentCandidates(params?: {
  zoneId?: string
  districtId?: string
}) {
  const searchParams = new URLSearchParams()
  if (params?.zoneId) searchParams.set("zoneId", params.zoneId)
  if (params?.districtId) searchParams.set("districtId", params.districtId)
  const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const response = await adminRequest<AdminRiderAssignmentCandidate[]>(
    `/admin/orders/assignment-candidates${query}`
  )
  return response.data
}

export async function assignAdminRider(params: {
  orderId: string
  riderId: string
}) {
  const response = await adminRequest<{
    id: string
    orderNumber: string
    riderId: string
    riderName: string
  }>(`/admin/orders/${params.orderId}/assign-rider`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ riderId: params.riderId }),
  })
  return response.data
}

export async function bulkAssignAdminRiders(params: { orderIds: string[] }) {
  const response = await adminRequest<AdminBulkRiderAssignmentResult>(
    "/admin/orders/bulk-assign-riders",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ orderIds: params.orderIds }),
    }
  )
  return response.data
}

export async function updateAdminRiderAvailability(params: {
  riderId: string
  isAvailableForAssignments: boolean
}) {
  const response = await adminRequest<{
    id: string
    isAvailableForAssignments: boolean
  }>(`/admin/riders/${params.riderId}/availability`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      isAvailableForAssignments: params.isAvailableForAssignments,
    }),
  })
  return response.data
}

export async function listAdminFoodCategories(params: {
  search?: string
  restaurantId?: string
  status?: "all" | AdminFoodCategoryStatus
  health?: AdminFoodCategoryHealth
  sortBy?: AdminFoodCategorySort
  page?: number
  pageSize?: number
}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "" && value !== "all") {
      query.set(key, String(value))
    }
  })
  const response = await adminRequest<{
    items: AdminFoodCategory[]
    total: number
    page: number
    pageSize: number
    pageCount: number
    summary: {
      total: number
      active: number
      archived: number
      empty: number
      needsReview: number
    }
    restaurants: Array<{ id: string; name: string; city: string }>
  }>(`/admin/categories${query.toString() ? `?${query.toString()}` : ""}`)
  return response.data
}

export async function getAdminFoodCategory(categoryId: string) {
  const response = await adminRequest<AdminFoodCategoryDetails>(`/admin/categories/${categoryId}`)
  return response.data
}

export async function updateAdminFoodCategoryStatus(params: {
  categoryId: string
  status: AdminFoodCategoryStatus
  reason?: string
  notifyOwner?: boolean
}) {
  const response = await adminRequest<{ id: string; status: AdminFoodCategoryStatus }>(
    `/admin/categories/${params.categoryId}/status`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: params.status, reason: params.reason ?? "", notifyOwner: Boolean(params.notifyOwner) }),
    }
  )
  return response.data
}

export async function bulkUpdateAdminFoodCategoryStatus(params: {
  categoryIds: string[]
  status: AdminFoodCategoryStatus
  reason?: string
  notifyOwner?: boolean
}) {
  const response = await adminRequest<{ updated: number; items: Array<{ id: string; status: AdminFoodCategoryStatus }> }>(
    "/admin/categories/bulk-status",
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        categoryIds: params.categoryIds,
        status: params.status,
        reason: params.reason ?? "",
        notifyOwner: Boolean(params.notifyOwner),
      }),
    }
  )
  return response.data
}

export async function listAdminReviews(params: {
  search?: string
  restaurantId?: string
  status?: "all" | AdminReviewModerationStatus
  rating?: "all" | "1" | "2" | "3" | "4" | "5"
  reply?: "all" | "replied" | "not_replied"
  comment?: "all" | "with_comment" | "without_comment"
  sortBy?: AdminReviewSort
  page?: number
  pageSize?: number
}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "" && value !== "all") {
      query.set(key, String(value))
    }
  })
  const response = await adminRequest<{
    items: AdminReview[]
    total: number
    page: number
    pageSize: number
    pageCount: number
    summary: {
      total: number
      visible: number
      hidden: number
      flagged: number
      withComments: number
      unanswered: number
      averageVisibleRating: number
    }
    restaurants: Array<{ id: string; name: string; city: string }>
  }>(`/admin/reviews${query.toString() ? `?${query.toString()}` : ""}`)
  return response.data
}

export async function getAdminReview(reviewId: string) {
  const response = await adminRequest<AdminReviewDetails>(`/admin/reviews/${reviewId}`)
  return response.data
}

export async function updateAdminReviewModeration(params: {
  reviewId: string
  status: AdminReviewModerationStatus
  reason?: string
}) {
  const response = await adminRequest<AdminReview>(
    `/admin/reviews/${params.reviewId}/moderation`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: params.status, reason: params.reason ?? "" }),
    }
  )
  return response.data
}

export async function bulkUpdateAdminReviews(params: {
  reviewIds: string[]
  status: AdminReviewModerationStatus
  reason?: string
}) {
  const response = await adminRequest<{ updated: number; items: AdminReview[] }>(
    "/admin/reviews/bulk-moderation",
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reviewIds: params.reviewIds,
        status: params.status,
        reason: params.reason ?? "",
      }),
    }
  )
  return response.data
}

export async function getPlatformContent() {
  const query = getAdminZoneScopeQueryString()
  const response = await adminRequest<PlatformContentEditorResponse>(
    `/admin/platform-content${query}`
  )
  return response.data
}

function getAdminZoneScopeQueryString() {
  const scope = getAdminZoneScopeQueryParams()
  const searchParams = new URLSearchParams()
  if ("zoneId" in scope && scope.zoneId) searchParams.set("zoneId", scope.zoneId)
  if ("districtId" in scope && scope.districtId) searchParams.set("districtId", scope.districtId)
  return searchParams.toString() ? `?${searchParams.toString()}` : ""
}

export async function listAdminNotifications(params?: {
  kind?: "all" | "notifications" | "push"
  source?: "all" | "customer" | "owner" | "rider" | "campaign" | "scheduled" | "ops"
  status?: "all" | "read" | "unread"
  deliveryStatus?:
    | "all"
    | "sent"
    | "push_ready"
    | "scheduled"
    | "failed"
    | "cancelled"
    | "in_app"
    | "in_app_only"
    | "campaign"
    | "warning"
    | "critical"
  recipientType?: "all" | "customers" | "owners" | "riders"
  search?: string
  page?: number
  pageSize?: number
  zoneId?: string
  districtId?: string
}) {
  const scope = getAdminZoneScopeQueryParams()
  const searchParams = new URLSearchParams()
  if (params?.kind && params.kind !== "all") searchParams.set("kind", params.kind)
  if (params?.source && params.source !== "all") searchParams.set("source", params.source)
  if (params?.status && params.status !== "all") searchParams.set("status", params.status)
  if (params?.deliveryStatus && params.deliveryStatus !== "all") {
    searchParams.set("deliveryStatus", params.deliveryStatus)
  }
  if (params?.recipientType && params.recipientType !== "all") {
    searchParams.set("recipientType", params.recipientType)
  }
  if (params?.search) searchParams.set("search", params.search)
  if (params?.page) searchParams.set("page", `${params.page}`)
  if (params?.pageSize) searchParams.set("pageSize", `${params.pageSize}`)
  const zoneId = params?.zoneId ?? ("zoneId" in scope ? scope.zoneId : "")
  const districtId = params?.districtId ?? ("districtId" in scope ? scope.districtId : "")
  if (zoneId) searchParams.set("zoneId", zoneId)
  if (districtId) searchParams.set("districtId", districtId)
  const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const response = await adminRequest<AdminNotificationsResponse>(
    `/admin/notifications${query}`
  )
  return response.data
}

export async function sendAdminNotification(payload: AdminNotificationSendPayload) {
  const scopedPayload = {
    ...payload,
    ...getAdminZoneScopeQueryParams(),
  }
  const response = await adminRequest<AdminNotificationSendResult>(
    "/admin/notifications/send",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(scopedPayload),
    }
  )
  return response.data
}

export async function getAdminNotificationCampaignRecipients(params: {
  campaignId: string
  status?: AdminNotificationRecipientReportStatus
  page?: number
  pageSize?: number
}) {
  const searchParams = new URLSearchParams()
  if (params.status && params.status !== "all") searchParams.set("status", params.status)
  if (params.page) searchParams.set("page", `${params.page}`)
  if (params.pageSize) searchParams.set("pageSize", `${params.pageSize}`)
  const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const response = await adminRequest<AdminNotificationRecipientReport>(
    `/admin/notifications/campaigns/${params.campaignId}/recipients${query}`
  )
  return response.data
}

export async function refreshAdminNotificationCampaignConversions(campaignId: string) {
  const response = await adminRequest<AdminNotificationCampaignConversions>(
    `/admin/notifications/campaigns/${campaignId}/conversions`,
    { method: "POST" }
  )
  return response.data
}

export async function checkAdminNotificationCampaignReceipts(campaignId: string) {
  const response = await adminRequest<AdminNotificationCampaignReceipts>(
    `/admin/notifications/campaigns/${campaignId}/receipts`,
    { method: "POST" }
  )
  return response.data
}

export async function markAdminNotificationRead(params: {
  source: "customer" | "owner" | "rider" | "ops"
  id: string
}) {
  const response = await adminRequest<AdminNotificationActionResult>(
    `/admin/notifications/${params.source}/${params.id}/read`,
    { method: "PATCH" }
  )
  return response.data
}

export async function markAllAdminNotificationsRead() {
  const scope = getAdminZoneScopeQueryParams()
  const searchParams = new URLSearchParams()
  if ("zoneId" in scope && scope.zoneId) searchParams.set("zoneId", scope.zoneId)
  if ("districtId" in scope && scope.districtId) searchParams.set("districtId", scope.districtId)
  const query = searchParams.toString()
  const response = await adminRequest<AdminNotificationActionResult>(
    `/admin/notifications/read-all${query ? `?${query}` : ""}`,
    { method: "PATCH" }
  )
  return response.data
}

export async function cancelAdminNotificationSchedule(scheduleId: string) {
  const response = await adminRequest<AdminNotificationActionResult>(
    `/admin/notifications/scheduled/${scheduleId}/cancel`,
    { method: "POST" }
  )
  return response.data
}

export async function retryAdminNotificationSchedule(scheduleId: string) {
  const response = await adminRequest<AdminNotificationActionResult>(
    `/admin/notifications/scheduled/${scheduleId}/retry`,
    { method: "POST" }
  )
  return response.data
}

export async function updatePlatformContent(content: PlatformContent) {
  const query = getAdminZoneScopeQueryString()
  const response = await adminRequest<PlatformContentEditorResponse>(
    `/admin/platform-content${query}`,
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(content),
    }
  )
  return response.data
}

export async function listAdminActivityLogs(params?: {
  entityType?: string
  entityId?: string
  page?: number
  pageSize?: number
  includeTotal?: boolean
}) {
  const searchParams = new URLSearchParams()
  if (params?.entityType) searchParams.set("entityType", params.entityType)
  if (params?.entityId) searchParams.set("entityId", params.entityId)
  if (params?.page) searchParams.set("page", `${params.page}`)
  if (params?.pageSize) searchParams.set("pageSize", `${params.pageSize}`)
  if (params?.includeTotal === false) searchParams.set("includeTotal", "false")
  const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const response = await adminRequest<AdminListResponse<AdminActivityLog>>(
    `/admin/activity-logs${query}`
  )
  return response.data
}

export async function rollbackPlatformContent(updatedAt: string) {
  const response = await adminRequest<PlatformContentEditorResponse>(
    "/admin/platform-content/rollback",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ updatedAt }),
    }
  )
  return response.data
}

export type AdminMediaAsset = {
  id: string
  url: string
  publicId: string
  folder: string
  resourceType: string
  context: string
  uploadedByRole: string
  uploadedById: string
  createdAt: string | null
  updatedAt: string | null
}

export async function listAdminMediaAssets(params?: {
  context?: string
  page?: number
  pageSize?: number
}) {
  const searchParams = new URLSearchParams()
  if (params?.context) searchParams.set("context", params.context)
  if (params?.page) searchParams.set("page", `${params.page}`)
  if (params?.pageSize) searchParams.set("pageSize", `${params.pageSize}`)
  const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const response = await adminRequest<AdminListResponse<AdminMediaAsset>>(
    `/media/assets${query}`
  )
  return response.data
}

async function recordAdminMediaAsset(params: {
  url: string
  publicId: string
  folder: string
  resourceType: string
  context: string
}) {
  const response = await adminRequest<AdminMediaAsset>("/media/assets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  })
  return response.data
}

export async function deleteAdminMediaAsset(assetId: string) {
  const response = await adminRequest<{
    deleted: boolean
    cloudinaryDeleted: boolean
    asset: AdminMediaAsset
  }>(`/media/assets/${assetId}`, {
    method: "DELETE",
  })
  return response.data
}

export async function uploadAdminMedia(
  file: File,
  folder = "foodbela/admin/home-cms",
  context = "admin_media",
  resourceType = "image",
) {
  const signatureResponse = await adminRequest<{
    cloudName: string
    folder: string
    timestamp: number
    signature: string
    apiKey: string
    resourceType: string
  }>("/media/upload-signature", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ folder, resourceType }),
  })
  const signature = signatureResponse.data
  const formData = new FormData()
  formData.append("file", file)
  formData.append("api_key", signature.apiKey)
  formData.append("timestamp", String(signature.timestamp))
  formData.append("signature", signature.signature)
  formData.append("folder", signature.folder)
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${signature.cloudName}/${signature.resourceType}/upload`,
    { method: "POST", body: formData }
  )
  const payload = (await response.json()) as {
    secure_url?: string
    public_id?: string
    resource_type?: string
    error?: { message?: string }
  }
  if (!response.ok || !payload.secure_url) {
    throw new Error(payload.error?.message ?? "Image upload failed")
  }
  const asset = {
    url: payload.secure_url,
    publicId: payload.public_id ?? "",
    folder,
    resourceType: payload.resource_type ?? signature.resourceType,
    context,
  }
  await recordAdminMediaAsset(asset).catch(() => undefined)
  return { url: asset.url, publicId: asset.publicId }
}

export async function deleteAdminMedia(publicId: string) {
  if (!publicId) return { deleted: true }
  const response = await fetch(`${getApiBaseUrl()}/media/delete`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${getAdminAccessToken() ?? ""}`,
    },
    body: JSON.stringify({ publicId, resourceType: "image" }),
  })
  if (!response.ok) {
    throw new Error("Image delete failed")
  }
  return { deleted: true }
}

export async function sendCustomerHomePushCampaign() {
  const query = getAdminZoneScopeQueryString()
  const response = await adminRequest<{
    totalTargets: number
    sentCount: number
    disabledCount: number
  }>(`/admin/platform-content/customer-home-push/send${query}`, {
    method: "POST",
  })
  return response.data
}

export async function sendCustomerHomeTestPush(customerId: string) {
  const query = getAdminZoneScopeQueryString()
  const response = await adminRequest<{
    sentCount: number
    disabledCount: number
    ticketIds: string[]
  }>(`/admin/platform-content/customer-home-push/test${query}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ customerId }),
  })
  return response.data
}

export async function checkCustomerHomePushReceipts() {
  const query = getAdminZoneScopeQueryString()
  const response = await adminRequest<{
    checked: number
    deliveredToProvider: number
    failed: number
    deviceNotRegistered: number
  }>(`/admin/platform-content/customer-home-push/check-receipts${query}`, {
    method: "POST",
  })
  return response.data
}

export async function refreshCustomerHomePushConversions() {
  const query = getAdminZoneScopeQueryString()
  const response = await adminRequest<{
    orderCount: number
    deliveredOrderCount: number
    deliveredRevenue: number
    uniqueOrderingCustomers: number
    conversionRate: number
    refreshedAt: string | null
  }>(`/admin/platform-content/customer-home-push/refresh-conversions${query}`, {
    method: "POST",
  })
  return response.data
}

export async function scheduleCustomerHomePushCampaign(scheduledAt: string) {
  const query = getAdminZoneScopeQueryString()
  const response = await adminRequest<{
    scheduledAt: string
    scheduleStatus: "scheduled"
  }>(`/admin/platform-content/customer-home-push/schedule${query}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scheduledAt }),
  })
  return response.data
}

export async function cancelCustomerHomePushSchedule() {
  const query = getAdminZoneScopeQueryString()
  const response = await adminRequest<{
    scheduleStatus: "cancelled"
  }>(`/admin/platform-content/customer-home-push/cancel-schedule${query}`, {
    method: "POST",
  })
  return response.data
}

export async function getAdminServiceAreas() {
  const response = await adminRequest<AdminServiceAreasResponse>("/admin/service-areas")
  return response.data
}

export async function createAdminServiceDistrict(payload: AdminServiceDistrictPayload) {
  const response = await adminRequest<AdminServiceDistrict>("/admin/service-areas/districts", {
    method: "POST",
    body: JSON.stringify(payload),
  })
  return response.data
}

export async function updateAdminServiceDistrict(
  districtId: string,
  payload: Partial<AdminServiceDistrictPayload>
) {
  const response = await adminRequest<AdminServiceDistrict>(
    `/admin/service-areas/districts/${districtId}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    }
  )
  return response.data
}

export async function createAdminServiceZone(payload: AdminServiceZonePayload) {
  const response = await adminRequest<AdminServiceZone>("/admin/service-areas/zones", {
    method: "POST",
    body: JSON.stringify(payload),
  })
  return response.data
}

export async function updateAdminServiceZone(
  zoneId: string,
  payload: Partial<AdminServiceZonePayload>
) {
  const response = await adminRequest<AdminServiceZone>(`/admin/service-areas/zones/${zoneId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  })
  return response.data
}

export async function archiveAdminServiceZone(zoneId: string) {
  const response = await adminRequest<AdminServiceZone>(`/admin/service-areas/zones/${zoneId}`, {
    method: "DELETE",
  })
  return response.data
}
