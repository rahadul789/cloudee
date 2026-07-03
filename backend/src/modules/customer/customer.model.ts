import mongoose, { Schema } from "mongoose"

const customerSavedLocationServiceAreaSchema = new Schema(
  {
    districtId: { type: String, default: "", trim: true },
    districtName: { type: String, default: "", trim: true },
    zoneId: { type: String, default: "", trim: true },
    zoneSlug: { type: String, default: "", trim: true },
    zoneName: { type: String, default: "", trim: true },
    radiusKm: { type: Number, default: null },
  },
  { _id: false }
)

const customerSavedLocationSchema = new Schema(
  {
    label: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    addressDetails: { type: String, default: "", trim: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    source: { type: String, enum: ["gps", "manual", "saved"], default: "saved" },
    isDefault: { type: Boolean, default: false },
    serviceArea: { type: customerSavedLocationServiceAreaSchema, default: null },
    lastUsedAt: { type: Date, default: Date.now }
  },
  { _id: true }
)

const customerLastKnownLocationSchema = new Schema(
  {
    label: { type: String, default: "", trim: true },
    address: { type: String, default: "", trim: true },
    addressDetails: { type: String, default: "", trim: true },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    source: { type: String, enum: ["gps", "manual", "saved"], default: "manual" },
    updatedAt: { type: Date, default: null }
  },
  { _id: false }
)

const customerPushTokenSchema = new Schema(
  {
    expoPushToken: { type: String, required: true, trim: true },
    platform: { type: String, enum: ["android", "ios"], required: true },
    deviceId: { type: String, default: "", trim: true },
    appVersion: { type: String, default: "", trim: true },
    lastSeenAt: { type: Date, default: Date.now },
    disabledAt: { type: Date, default: null }
  },
  { _id: true }
)

const customerPhoneHistorySchema = new Schema(
  {
    phone: { type: String, required: true, trim: true },
    changedAt: { type: Date, default: Date.now }
  },
  { _id: true }
)

const customerNotificationSchema = new Schema(
  {
    type: { type: String, default: "system", trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    path: { type: String, default: "", trim: true },
    campaignId: { type: String, default: "", trim: true },
    campaignVariant: { type: String, default: "", trim: true },
    ctaLabel: { type: String, default: "", trim: true },
    ctaPath: { type: String, default: "", trim: true },
    contentType: { type: String, enum: ["text", "image", "image_text"], default: "text" },
    imageUrl: { type: String, default: "", trim: true },
    voucherId: { type: String, default: "", trim: true },
    voucherCode: { type: String, default: "", trim: true },
    voucherLabel: { type: String, default: "", trim: true },
    voucherExpiresAt: { type: Date, default: null },
    voucherMinOrder: { type: Number, default: null },
    personalOffer: { type: Boolean, default: false },
    zoneId: { type: String, default: "", trim: true },
    districtId: { type: String, default: "", trim: true },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: true }
)

const customerNotificationSettingsSchema = new Schema(
  {
    orderUpdates: { type: Boolean, default: true },
    restaurantStatus: { type: Boolean, default: true },
    reviewReplies: { type: Boolean, default: true },
    promotions: { type: Boolean, default: true }
  },
  { _id: false }
)

const customerAccountRequestSchema = new Schema(
  {
    type: { type: String, enum: ["deactivate", "delete"], default: null },
    reason: { type: String, default: "" },
    reviewNote: { type: String, default: "" },
    reviewedByAdminId: { type: String, default: null },
    reviewedByAdminName: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "cancelled", "reviewed", "completed"],
      default: null
    },
    requestedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    history: {
      type: [
        new Schema(
          {
            action: {
              type: String,
              enum: ["submitted", "cancelled", "approved", "rejected"],
              required: true
            },
            note: { type: String, default: "" },
            actorId: { type: String, default: "" },
            actorName: { type: String, default: "" },
            createdAt: { type: Date, default: Date.now }
          },
          { _id: false }
        )
      ],
      default: []
    }
  },
  { _id: false }
)

const customerCustomOfferRequestSchema = new Schema(
  {
    status: {
      type: String,
      enum: ["none", "requested", "fulfilled", "cancelled"],
      default: "none"
    },
    cycleStartedAt: { type: Date, default: null },
    cycleNumber: { type: Number, default: 1 },
    qualifiedAt: { type: Date, default: null },
    qualificationNotifiedAt: { type: Date, default: null },
    requestedAt: { type: Date, default: null },
    expectedReadyAt: { type: Date, default: null },
    fulfilledAt: { type: Date, default: null },
    lastRequestOrderCount: { type: Number, default: 0 },
    requestedCode: { type: String, default: "", trim: true, uppercase: true },
    voucherId: { type: String, default: "", trim: true },
    voucherCode: { type: String, default: "", trim: true },
    voucherLabel: { type: String, default: "", trim: true },
    adminNote: { type: String, default: "", trim: true },
    analytics: {
      type: new Schema(
        {
          qualifiedCount: { type: Number, default: 0 },
          requestedCount: { type: Number, default: 0 },
          fulfilledCount: { type: Number, default: 0 },
          lastQualifiedAt: { type: Date, default: null },
          lastRequestedAt: { type: Date, default: null },
          lastFulfilledAt: { type: Date, default: null }
        },
        { _id: false }
      ),
      default: () => ({})
    },
    history: {
      type: [
        new Schema(
          {
            action: {
              type: String,
              enum: ["qualified", "requested", "fulfilled", "cancelled", "note"],
              required: true
            },
            note: { type: String, default: "", trim: true },
            actorId: { type: String, default: "", trim: true },
            actorName: { type: String, default: "", trim: true },
            createdAt: { type: Date, default: Date.now }
          },
          { _id: false }
        )
      ],
      default: []
    }
  },
  { _id: false }
)

const customerSchema = new Schema(
  {
    fullName: { type: String, default: "" },
    phone: { type: String, unique: true, sparse: true },
    pendingPhone: { type: String, default: null, trim: true },
    email: { type: String, default: "", trim: true },
    passwordHash: { type: String, default: "" },
    googleSub: { type: String, unique: true, sparse: true },
    profileImage: {
      type: new Schema(
        {
          url: { type: String, default: "" },
          publicId: { type: String, default: "" }
        },
        { _id: false }
      ),
      default: () => ({})
    },
    authProviders: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["active", "suspended", "locked"],
      default: "active"
    },
    lastLoginAt: { type: Date, default: null },
    lastKnownDeviceId: { type: String, default: "", trim: true },
    lastKnownIpAddress: { type: String, default: "", trim: true },
    lastKnownUserAgent: { type: String, default: "", trim: true },
    referralCode: { type: String, unique: true, sparse: true, trim: true, uppercase: true },
    referredByCustomerId: { type: Schema.Types.ObjectId, ref: "Customer", default: null },
    referredAt: { type: Date, default: null },
    referralSignupDeviceId: { type: String, default: "", trim: true },
    referralSignupIpAddress: { type: String, default: "", trim: true },
    referralSignupUserAgent: { type: String, default: "", trim: true },
    referralRewardedAt: { type: Date, default: null },
    referralRewardOrderId: { type: Schema.Types.ObjectId, ref: "Order", default: null },
    referralRewardVoucherId: { type: Schema.Types.ObjectId, ref: "Voucher", default: null },
    referralRewardStatus: {
      type: String,
      enum: ["pending", "rewarded", "capped", "disabled", "under_review", "rejected"],
      default: "pending"
    },
    referralRewardSkippedAt: { type: Date, default: null },
    referralRewardSkippedReason: { type: String, default: "" },
    previousPhones: { type: [customerPhoneHistorySchema], default: [] },
    notificationSettings: {
      type: customerNotificationSettingsSchema,
      default: () => ({})
    },
    accountRequest: {
      type: customerAccountRequestSchema,
      default: () => ({})
    },
    customOfferRequest: {
      type: customerCustomOfferRequestSchema,
      default: () => ({})
    },
    favoriteRestaurantIds: { type: [Schema.Types.ObjectId], ref: "Restaurant", default: [] },
    serviceArea: { type: customerSavedLocationServiceAreaSchema, default: null },
    lastKnownLocation: {
      type: customerLastKnownLocationSchema,
      default: () => ({})
    },
    savedLocations: { type: [customerSavedLocationSchema], default: [] },
    pushTokens: { type: [customerPushTokenSchema], default: [] },
    notifications: { type: [customerNotificationSchema], default: [] }
  },
  { timestamps: true }
)

customerSchema.index(
  { pendingPhone: 1 },
  { unique: true, partialFilterExpression: { pendingPhone: { $type: "string" } } }
)
customerSchema.index({ referredByCustomerId: 1, createdAt: -1 })
customerSchema.index({ referralSignupDeviceId: 1, createdAt: -1 })
customerSchema.index({ referralSignupIpAddress: 1, createdAt: -1 })
customerSchema.index({ status: 1, "savedLocations.serviceArea.zoneId": 1 })
customerSchema.index({ status: 1, "savedLocations.serviceArea.zoneSlug": 1 })
customerSchema.index({ status: 1, "savedLocations.serviceArea.districtId": 1 })
customerSchema.index({ status: 1, "serviceArea.zoneId": 1 })
customerSchema.index({ status: 1, "serviceArea.zoneSlug": 1 })
customerSchema.index({ status: 1, "serviceArea.districtId": 1 })
// Supports the saved-location bounding-box query used for zone-scoped
// notification campaigns (multikey range scan on coordinates).
customerSchema.index({
  status: 1,
  "savedLocations.latitude": 1,
  "savedLocations.longitude": 1,
})

const customerRefreshTokenSessionSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    tokenId: { type: String, required: true, unique: true },
    tokenHash: { type: String, required: true },
    userAgent: { type: String, default: "" },
    ipAddress: { type: String, default: "" },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null }
  },
  { timestamps: true }
)

const bkashSandboxPaymentSessionSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", default: null },
    sandboxPaymentId: { type: String },
    paymentAttemptId: { type: Schema.Types.ObjectId, ref: "BkashPaymentAttempt", default: null },
    otpCodeHash: { type: String },
    walletNumber: { type: String, required: true },
    payerReference: { type: String, default: "", trim: true },
    customerMsisdn: { type: String, default: "", trim: true },
    amount: { type: Number, required: true },
    voucherCode: { type: String, default: "" },
    status: {
      type: String,
      enum: ["initiated", "confirmed", "cancelled", "failed", "expired"],
      default: "initiated"
    },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", default: null },
    usedAt: { type: Date, default: null },
    transactionId: { type: String, default: "" },
    checkoutSnapshot: { type: Schema.Types.Mixed, default: {} },
    expiresAt: { type: Date, required: true },
    confirmedAt: { type: Date, default: null }
  },
  { timestamps: true }
)

const bkashPaymentAttemptEventSchema = new Schema(
  {
    event: { type: String, required: true, trim: true },
    status: { type: String, default: "", trim: true },
    paymentStatus: { type: String, default: "", trim: true },
    note: { type: String, default: "", trim: true },
    reason: { type: String, default: "", trim: true },
    providerStatus: { type: String, default: "", trim: true },
    providerCode: { type: String, default: "", trim: true },
    providerMessage: { type: String, default: "", trim: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    occurredAt: { type: Date, default: Date.now }
  },
  { _id: false }
)

const bkashPaymentAttemptSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", default: null },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", default: null },
    sessionId: { type: Schema.Types.ObjectId, ref: "BkashSandboxPaymentSession", default: null },
    clientOrderId: { type: String, default: "", trim: true },
    provider: { type: String, default: "Bkash", trim: true },
    walletNumber: { type: String, default: "", trim: true },
    walletNumberMasked: { type: String, default: "", trim: true },
    payerReference: { type: String, default: "", trim: true },
    customerMsisdn: { type: String, default: "", trim: true },
    amount: { type: Number, required: true },
    voucherCode: { type: String, default: "", trim: true },
    paymentID: { type: String, default: "", trim: true },
    transactionId: { type: String, default: "", trim: true },
    status: {
      type: String,
      enum: [
        "initiated",
        "provider_created",
        "provider_create_failed",
        "callback_success",
        "customer_cancelled",
        "callback_failed",
        "execute_failed",
        "confirmed_paid",
        "order_finalized",
        "order_finalize_failed",
        "expired"
      ],
      default: "initiated"
    },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid", "cancelled", "failed", "expired"],
      default: "unpaid"
    },
    orderFinalizationStatus: {
      type: String,
      enum: ["not_started", "finalized", "failed", "not_applicable"],
      default: "not_started"
    },
    failureStage: { type: String, default: "", trim: true },
    failureReason: { type: String, default: "", trim: true },
    providerResponse: { type: Schema.Types.Mixed, default: {} },
    checkoutSnapshot: { type: Schema.Types.Mixed, default: {} },
    events: { type: [bkashPaymentAttemptEventSchema], default: [] },
    initiatedAt: { type: Date, default: Date.now },
    providerCreatedAt: { type: Date, default: null },
    callbackAt: { type: Date, default: null },
    executedAt: { type: Date, default: null },
    confirmedAt: { type: Date, default: null },
    orderFinalizedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null }
  },
  { timestamps: true }
)

customerRefreshTokenSessionSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 45 }
)

bkashSandboxPaymentSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 })
bkashSandboxPaymentSessionSchema.index(
  { sandboxPaymentId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      sandboxPaymentId: { $exists: true, $type: "string" }
    }
  }
)
bkashSandboxPaymentSessionSchema.index({ paymentAttemptId: 1 })

bkashPaymentAttemptSchema.index({ createdAt: -1 })
bkashPaymentAttemptSchema.index({ status: 1, createdAt: -1 })
bkashPaymentAttemptSchema.index({ paymentStatus: 1, createdAt: -1 })
bkashPaymentAttemptSchema.index({ customerId: 1, createdAt: -1 })
bkashPaymentAttemptSchema.index({ restaurantId: 1, createdAt: -1 })
bkashPaymentAttemptSchema.index({ orderId: 1 })
bkashPaymentAttemptSchema.index({ sessionId: 1 })
bkashPaymentAttemptSchema.index(
  { paymentID: 1 },
  {
    unique: true,
    partialFilterExpression: {
      paymentID: { $exists: true, $type: "string", $gt: "" }
    }
  }
)
bkashPaymentAttemptSchema.index(
  { transactionId: 1 },
  {
    partialFilterExpression: {
      transactionId: { $exists: true, $type: "string", $gt: "" }
    }
  }
)
// Detailed payment-flow audit logs. Keep for 1 year (financial audit value),
// then auto-expire so this collection does not grow without bound. The order
// itself retains its own paymentSnapshot independently of this log.
bkashPaymentAttemptSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 365 * 24 * 60 * 60 }
)

const voucherSchema = new Schema(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", default: null },
    scopeType: {
      type: String,
      enum: ["restaurant", "selected_restaurants", "all_restaurants"],
      default: "restaurant"
    },
    selectedRestaurantIds: { type: [Schema.Types.ObjectId], ref: "Restaurant", default: [] },
    audienceType: {
      type: String,
      enum: ["all_users", "new_users", "returning_users", "selected_users"],
      default: "all_users"
    },
    selectedCustomerIds: { type: [Schema.Types.ObjectId], ref: "Customer", default: [] },
    customerGroupKey: { type: String, default: "" },
    display: {
      type: new Schema(
        {
          showOnHome: { type: Boolean, default: false },
          showInOfferStrip: { type: Boolean, default: true },
          placement: { type: String, enum: ["top", "after_banner", "offers_row"], default: "offers_row" },
          variant: { type: String, enum: ["chip", "block", "image", "carousel"], default: "chip" },
          position: { type: Number, default: 0 },
          title: { type: String, default: "" },
          subtitle: { type: String, default: "" },
          imageUrl: { type: String, default: "" },
          carouselImageUrls: { type: [String], default: [] },
          openInModal: { type: Boolean, default: false },
          ctaLabel: { type: String, default: "" },
          ctaPath: { type: String, default: "" },
          backgroundColor: { type: String, default: "#FFF0F6" },
          textColor: { type: String, default: "#3F2432" },
          accentColor: { type: String, default: "#FF5C93" }
        },
        { _id: false }
      ),
      default: () => ({})
    },
    displayAnalytics: {
      type: new Schema(
        {
          impressions: { type: Number, default: 0 },
          clicks: { type: Number, default: 0 },
          modalOpens: { type: Number, default: 0 },
          stripClicks: { type: Number, default: 0 },
          lastEventAt: { type: Date, default: null }
        },
        { _id: false }
      ),
      default: () => ({})
    },
    pushCampaign: {
      type: new Schema(
        {
          enabled: { type: Boolean, default: false },
          title: { type: String, default: "" },
          body: { type: String, default: "" },
          path: { type: String, default: "" },
          sentAt: { type: Date, default: null },
          sentByAdminId: { type: String, default: "" },
          totalTargets: { type: Number, default: 0 },
          sentCount: { type: Number, default: 0 },
          disabledCount: { type: Number, default: 0 },
          openCount: { type: Number, default: 0 },
          openEvents: {
            type: [
              new Schema(
                {
                  customerId: { type: String, default: "" },
                  customerName: { type: String, default: "" },
                  customerPhone: { type: String, default: "" },
                  openedAt: { type: Date, default: Date.now },
                  path: { type: String, default: "" },
                },
                { _id: false }
              )
            ],
            default: []
          }
        },
        { _id: false }
      ),
      default: () => ({})
    },
    createdByType: { type: String, enum: ["owner", "admin", "system"], required: true },
    createdById: { type: String, required: true },
    fundedBy: { type: String, enum: ["owner", "platform", "shared"], required: true },
    ownerSharePercent: { type: Number, default: 100, min: 0, max: 100 },
    platformSharePercent: { type: Number, default: 0, min: 0, max: 100 },
    stackingRule: { type: String, enum: ["exclusive", "stackable"], default: "exclusive" },
    priority: { type: Number, default: 0 },
    // Discount surface. "checkout" = classic voucher applied to the order total (default,
    // keeps every existing voucher backward-compatible). "menu_markdown" = platform-funded
    // per-item price markdown shown as a strike-through on the customer menu.
    surface: { type: String, enum: ["checkout", "menu_markdown"], default: "checkout" },
    mode: { type: String, enum: ["auto", "coupon"], required: true },
    type: { type: String, enum: ["flat", "percentage", "free_delivery"], required: true },
    name: { type: String, required: true },
    code: { type: String, default: "" },
    discountValue: { type: Number, default: 0 },
    maxDiscountAmount: { type: Number, default: 0 },
    minimumOrderAmount: { type: Number, default: 0 },
    // menu_markdown only: the per-variant (base + variant) price must be at or above this
    // threshold for the markdown to apply. 0 = applies to every price.
    minItemPrice: { type: Number, default: 0 },
    maxTotalUses: { type: Number, default: 0 },
    maxUsesPerUser: { type: Number, default: 0 },
    allowRepeatUsage: { type: Boolean, default: false },
    // menu_markdown only: cap on the total platform-funded discount this rule may give out.
    // 0 = no budget cap. consumedDiscountBudget is the atomically maintained running total,
    // mirroring redeemedCount, and is checked race-free at order placement.
    maxTotalDiscountBudget: { type: Number, default: 0 },
    consumedDiscountBudget: { type: Number, default: 0 },
    // Atomically maintained live count of active redemptions (incremented under a
    // guard at order placement, decremented on release). Used to enforce
    // maxTotalUses race-free. Only meaningful when maxTotalUses > 0.
    redeemedCount: { type: Number, default: 0 },
    status: { type: String, enum: ["Draft", "Active"], default: "Draft" },
    applicability: { type: String, enum: ["all", "categories", "items"], default: "all" },
    categoryIds: { type: [Schema.Types.ObjectId], default: [] },
    itemIds: { type: [Schema.Types.ObjectId], default: [] },
    // menu_markdown targeting: restrict to restaurants matching these cuisine types.
    // Empty = no cuisine restriction.
    cuisineTypes: { type: [String], default: [] },
    // menu_markdown targeting: restrict to restaurants in these service-area zones/districts.
    // Empty = no zone/district restriction.
    zoneIds: { type: [String], default: [] },
    districtIds: { type: [String], default: [] },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    archivedAt: { type: Date, default: null },
    archivedByAdminId: { type: String, default: "" },
    archiveReason: { type: String, default: "" }
  },
  { timestamps: true }
)

voucherSchema.index(
  { restaurantId: 1, code: 1 },
  { unique: true, partialFilterExpression: { code: { $type: "string", $gt: "" } } }
)
voucherSchema.index({ status: 1, archivedAt: 1, startsAt: 1, endsAt: 1, restaurantId: 1 })
voucherSchema.index({ status: 1, archivedAt: 1, startsAt: 1, endsAt: 1, scopeType: 1 })
voucherSchema.index({ selectedRestaurantIds: 1, status: 1, archivedAt: 1 })
// Fast resolution of active menu-markdown rules on the customer menu hot path.
voucherSchema.index({ surface: 1, status: 1, archivedAt: 1, startsAt: 1, endsAt: 1 })

const voucherAuditSchema = new Schema(
  {
    voucherId: { type: Schema.Types.ObjectId, ref: "Voucher", required: true },
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", default: null },
    actorType: { type: String, enum: ["admin", "owner", "system"], required: true },
    actorId: { type: String, default: "" },
    action: {
      type: String,
      enum: ["created", "updated", "archived", "restored"],
      required: true
    },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    note: { type: String, default: "" }
  },
  { timestamps: true }
)

const restaurantCollectionSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    type: { type: String, enum: ["static", "dynamic"], required: true },
    criteria: { type: Schema.Types.Mixed, default: {} },
    restaurantIds: { type: [Schema.Types.ObjectId], default: [] },
    sortOrders: {
      type: [
        new Schema(
          {
            restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
            order: { type: Number, required: true }
          },
          { _id: false }
        )
      ],
      default: []
    },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
)

const voucherRedemptionSchema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
    voucherId: { type: Schema.Types.ObjectId, ref: "Voucher", required: true },
    voucherSnapshot: { type: Schema.Types.Mixed, required: true },
    discountBreakdown: { type: Schema.Types.Mixed, default: {} },
    appliedAt: { type: Date, default: Date.now },
    releasedAt: { type: Date, default: null },
    releaseReason: { type: String, default: "" },
    // Set true only for single-use-per-customer vouchers (maxUsesPerUser === 1).
    // Cleared on release so a cancelled order frees the voucher for reuse.
    singleUsePerUser: { type: Boolean, default: false },
    // True when this redemption incremented the voucher's redeemedCount
    // (i.e. the voucher had maxTotalUses > 0). Drives the matching decrement
    // on release so the global counter stays accurate.
    countedTowardTotal: { type: Boolean, default: false },
    // menu_markdown only: true when this redemption added to the rule's
    // consumedDiscountBudget. budgetConsumed records how much, so a release can
    // give the exact amount back race-free.
    countedTowardBudget: { type: Boolean, default: false },
    budgetConsumed: { type: Number, default: 0 }
  },
  { timestamps: true }
)

voucherRedemptionSchema.index({ voucherId: 1, releasedAt: 1 })
voucherRedemptionSchema.index({ "voucherSnapshot.customerId": 1, voucherId: 1, releasedAt: 1 })
voucherRedemptionSchema.index({ orderId: 1, voucherId: 1 }, { unique: true })
// Race-free guard for single-use-per-customer vouchers: at most one active
// (non-released) redemption per (voucher, customer). Concurrent reuse attempts
// fail with a duplicate-key error instead of slipping past the count check.
voucherRedemptionSchema.index(
  { voucherId: 1, "voucherSnapshot.customerId": 1 },
  { unique: true, partialFilterExpression: { singleUsePerUser: true } }
)

export const CustomerModel = mongoose.model("Customer", customerSchema)
export const CustomerRefreshTokenSessionModel = mongoose.model(
  "CustomerRefreshTokenSession",
  customerRefreshTokenSessionSchema
)
export const BkashSandboxPaymentSessionModel = mongoose.model(
  "BkashSandboxPaymentSession",
  bkashSandboxPaymentSessionSchema
)
export const BkashPaymentAttemptModel = mongoose.model(
  "BkashPaymentAttempt",
  bkashPaymentAttemptSchema
)
export const VoucherModel = mongoose.model("Voucher", voucherSchema)
export const VoucherAuditModel = mongoose.model("VoucherAudit", voucherAuditSchema)
export const RestaurantCollectionModel = mongoose.model(
  "RestaurantCollection",
  restaurantCollectionSchema
)
export const VoucherRedemptionModel = mongoose.model(
  "VoucherRedemption",
  voucherRedemptionSchema
)
