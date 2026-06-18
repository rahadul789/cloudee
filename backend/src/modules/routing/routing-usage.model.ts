import mongoose, { Schema } from "mongoose"

const routingApiUsageSchema = new Schema(
  {
    provider: { type: String, default: "google", index: true },
    api: { type: String, default: "directions", index: true },
    source: { type: String, default: "unknown", index: true },
    status: { type: String, required: true, index: true },
    billable: { type: Boolean, default: false, index: true },
    orderId: { type: String, default: "", index: true },
    sessionKey: { type: String, default: "", index: true },
    routeKey: { type: String, default: "", index: true },
    dateKey: { type: String, required: true, index: true },
    monthKey: { type: String, required: true, index: true },
    durationMs: { type: Number, default: 0 },
    distanceKm: { type: Number, default: null },
    routeDurationMinutes: { type: Number, default: null },
    reason: { type: String, default: "" },
    metadata: { type: Schema.Types.Mixed, default: {} },
    occurredAt: { type: Date, required: true, index: true },
  },
  { timestamps: true, versionKey: false },
)

routingApiUsageSchema.index({ monthKey: 1, billable: 1, occurredAt: -1 })
routingApiUsageSchema.index({ dateKey: 1, billable: 1, occurredAt: -1 })
routingApiUsageSchema.index({ orderId: 1, monthKey: 1, billable: 1 })

export const RoutingApiUsageModel = mongoose.model(
  "RoutingApiUsage",
  routingApiUsageSchema,
)
