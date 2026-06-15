import mongoose, { Schema } from "mongoose"

const dispatchCandidateSchema = new Schema(
  {
    riderId: { type: String, default: "" },
    riderName: { type: String, default: "" },
    activeOrders: { type: Number, default: 0 },
    hasActiveTracking: { type: Boolean, default: false },
    hasFreshLocation: { type: Boolean, default: false },
    distanceKm: { type: Number, default: null },
    score: { type: Number, default: null },
    capacityState: { type: String, default: "" },
    locationState: { type: String, default: "" }
  },
  { _id: false }
)

const dispatchDecisionLogSchema = new Schema(
  {
    orderId: { type: String, required: true, index: true },
    orderNumber: { type: String, required: true },
    restaurantId: { type: String, default: "" },
    restaurantName: { type: String, default: "" },
    algorithm: {
      type: String,
      enum: ["nearest_eligible_balanced", "least_loaded_first"],
      required: true
    },
    assignmentSource: {
      type: String,
      enum: ["manual_admin", "auto_dispatch"],
      required: true
    },
    outcome: {
      type: String,
      enum: ["assigned", "reassigned", "no_match", "skipped"],
      required: true
    },
    selectedRiderId: { type: String, default: "" },
    selectedRiderName: { type: String, default: "" },
    reason: { type: String, default: "" },
    candidateCount: { type: Number, default: 0 },
    candidates: { type: [dispatchCandidateSchema], default: [] }
  },
  { timestamps: true }
)

dispatchDecisionLogSchema.index({ createdAt: -1 })
dispatchDecisionLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 }
)

export const DispatchDecisionLogModel = mongoose.model(
  "DispatchDecisionLog",
  dispatchDecisionLogSchema
)
