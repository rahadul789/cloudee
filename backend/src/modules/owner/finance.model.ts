import mongoose, { Schema } from "mongoose"

const ledgerEntrySchema = new Schema(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", default: null },
    payoutBatchId: { type: Schema.Types.ObjectId, ref: "PayoutBatch", default: null },
    sourceEntityType: { type: String, required: true },
    sourceEntityId: { type: String, required: true },
    entryType: {
      type: String,
      enum: ["earning", "refund", "payout", "adjustment"],
      required: true
    },
    grossAmount: { type: Number, default: 0 },
    commissionBase: { type: Number, default: 0 },
    commission: { type: Number, default: 0 },
    discountCost: { type: Number, default: 0 },
    platformDiscountCost: { type: Number, default: 0 },
    deliveryCost: { type: Number, default: 0 },
    netAmount: { type: Number, required: true },
    serviceAreaSnapshot: { type: Schema.Types.Mixed, default: {} },
    settlementStatus: {
      type: String,
      enum: ["pending", "available", "paid_out"],
      default: "pending"
    },
    availableAt: { type: Date, default: null }
  },
  { timestamps: true }
)

ledgerEntrySchema.index({ restaurantId: 1, settlementStatus: 1, createdAt: -1 })
ledgerEntrySchema.index({ restaurantId: 1, entryType: 1, orderId: 1 })
ledgerEntrySchema.index({ restaurantId: 1, entryType: 1, settlementStatus: 1, availableAt: 1 })
ledgerEntrySchema.index({ restaurantId: 1, entryType: 1, createdAt: -1 })
ledgerEntrySchema.index({ "serviceAreaSnapshot.zoneId": 1, entryType: 1, settlementStatus: 1, createdAt: -1 })
ledgerEntrySchema.index({ "serviceAreaSnapshot.zoneSlug": 1, entryType: 1, settlementStatus: 1, createdAt: -1 })

const payoutBatchSchema = new Schema(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
    methodId: { type: Schema.Types.ObjectId, ref: "PayoutMethod", required: true },
    amount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending"
    },
    batchReference: { type: String, default: "" },
    provider: {
      type: String,
      enum: ["manual", "bkash", "bank"],
      default: "manual"
    },
    providerReference: { type: String, default: "" },
    providerPayoutId: { type: String, default: "" },
    providerTransactionId: { type: String, default: "" },
    paymentProofUrl: { type: String, default: "" },
    processingNote: { type: String, default: "" },
    approvedByAdminId: { type: String, default: "" },
    approvedAt: { type: Date, default: null },
    processedByAdminId: { type: String, default: "" },
    failureReason: { type: String, default: "" },
    requestedAt: { type: Date, required: true },
    processedAt: { type: Date, default: null }
  },
  { timestamps: true }
)

payoutBatchSchema.index({ restaurantId: 1, createdAt: -1 })
payoutBatchSchema.index({ restaurantId: 1, status: 1, createdAt: -1 })

const restaurantMetricsSchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      unique: true
    },
    totalOrders: { type: Number, default: 0 },
    totalDeliveredOrders: { type: Number, default: 0 },
    totalCancelledOrders: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    totalNetEarnings: { type: Number, default: 0 },
    averageOrderValue: { type: Number, default: 0 },
    averagePreparationTimeMinutes: { type: Number, default: 0 },
    averageRating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    repeatCustomerCount: { type: Number, default: 0 },
    lastOrderAt: { type: Date, default: null },
    lastAggregatedAt: { type: Date, default: null }
  },
  { timestamps: true }
)

const platformFinanceEntrySchema = new Schema(
  {
    direction: {
      type: String,
      enum: ["credit", "debit"],
      required: true
    },
    category: {
      type: String,
      enum: [
        "online_payment",
        "cod_deposit",
        "restaurant_payout",
        "customer_refund",
        "rider_payroll",
        "deploy_hosting",
        "manual_expense",
        "manual_income",
        "adjustment",
        "other"
      ],
      required: true
    },
    amount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ["posted", "void"],
      default: "posted"
    },
    sourceEntityType: { type: String, default: "" },
    sourceEntityId: { type: String, default: "" },
    paymentMethod: { type: String, default: "" },
    reference: { type: String, default: "", trim: true },
    proofUrl: { type: String, default: "", trim: true },
    note: { type: String, default: "", trim: true },
    createdByAdminId: { type: String, default: "" },
    voidedByAdminId: { type: String, default: "" },
    voidedAt: { type: Date, default: null },
    occurredAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
)

platformFinanceEntrySchema.index({ occurredAt: -1, createdAt: -1 })
platformFinanceEntrySchema.index({ direction: 1, category: 1, occurredAt: -1 })
platformFinanceEntrySchema.index({ status: 1, occurredAt: -1 })
platformFinanceEntrySchema.index(
  { sourceEntityType: 1, sourceEntityId: 1 },
  {
    partialFilterExpression: {
      sourceEntityType: { $type: "string", $gt: "" },
      sourceEntityId: { $type: "string", $gt: "" }
    }
  }
)

const dailyFinanceSnapshotSchema = new Schema(
  {
    dateKey: { type: String, required: true, unique: true },
    rangeStart: { type: Date, required: true },
    rangeEnd: { type: Date, required: true },
    summary: { type: Schema.Types.Mixed, default: {} },
    alerts: { type: [Schema.Types.Mixed], default: [] },
    note: { type: String, default: "", trim: true },
    closedByAdminId: { type: String, default: "" },
    closedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
)

dailyFinanceSnapshotSchema.index({ closedAt: -1 })

export const LedgerEntryModel = mongoose.model("LedgerEntry", ledgerEntrySchema)
export const PayoutBatchModel = mongoose.model("PayoutBatch", payoutBatchSchema)
export const RestaurantMetricsModel = mongoose.model("RestaurantMetrics", restaurantMetricsSchema)
export const PlatformFinanceEntryModel = mongoose.model("PlatformFinanceEntry", platformFinanceEntrySchema)
export const DailyFinanceSnapshotModel = mongoose.model("DailyFinanceSnapshot", dailyFinanceSnapshotSchema)
