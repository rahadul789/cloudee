import mongoose, { Schema } from "mongoose"

export const customerAnalyticsEventTypes = [
  "page_view",
  "restaurant_view",
  "menu_item_view",
  "cart_add",
  "cart_view",
  "checkout_start",
  "payment_initiated",
  "payment_completed",
  "payment_failed",
  "payment_cancelled",
  "signup_started",
  "signup_completed",
  "order_created",
  "search",
  "campaign_open",
  "voucher_applied",
  "custom",
] as const

const customerAnalyticsEventSchema = new Schema(
  {
    eventType: {
      type: String,
      enum: customerAnalyticsEventTypes,
      required: true,
      index: true,
    },
    actorType: {
      type: String,
      enum: ["guest", "customer"],
      required: true,
      index: true,
    },
    customerId: { type: String, default: "", index: true },
    anonymousId: { type: String, default: "", index: true },
    sessionId: { type: String, default: "", index: true },
    sourceApp: { type: String, default: "customer-app", index: true },
    path: { type: String, required: true, trim: true, index: true },
    screenName: { type: String, default: "", trim: true },
    entityType: { type: String, default: "", index: true },
    entityId: { type: String, default: "", index: true },
    // In-app navigation source ("carousel" | "featured" | "deals" | "search" | "browse" | ...) —
    // promoted to a top-level field (from metadata.source) so restaurant-view attribution can be
    // grouped/queried as a first-class column rather than reaching into the Mixed metadata blob.
    source: { type: String, default: "", trim: true, index: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    userAgent: { type: String, default: "", trim: true },
    ipHash: { type: String, default: "", index: true },
    occurredAt: { type: Date, required: true, index: true },
  },
  { timestamps: true, versionKey: false }
)

customerAnalyticsEventSchema.index({ eventType: 1, occurredAt: -1 })
customerAnalyticsEventSchema.index({ eventType: 1, entityId: 1, occurredAt: -1 })
// Restaurant-view attribution: per-restaurant, per-source, time-windowed counts.
customerAnalyticsEventSchema.index({
  eventType: 1,
  entityId: 1,
  source: 1,
  occurredAt: -1,
})
customerAnalyticsEventSchema.index({ eventType: 1, sessionId: 1, occurredAt: -1 })
customerAnalyticsEventSchema.index({ actorType: 1, occurredAt: -1 })
customerAnalyticsEventSchema.index({ customerId: 1, occurredAt: -1 })
customerAnalyticsEventSchema.index({ anonymousId: 1, occurredAt: -1 })
customerAnalyticsEventSchema.index({ sessionId: 1, occurredAt: -1 })
customerAnalyticsEventSchema.index({ sourceApp: 1, occurredAt: -1 })
customerAnalyticsEventSchema.index({ path: 1, occurredAt: -1 })
customerAnalyticsEventSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 180 * 24 * 60 * 60 }
)

export const CustomerAnalyticsEventModel = mongoose.model(
  "CustomerAnalyticsEvent",
  customerAnalyticsEventSchema
)
