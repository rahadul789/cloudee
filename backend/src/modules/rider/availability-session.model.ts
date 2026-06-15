import mongoose, { Schema } from "mongoose";

const riderAvailabilitySessionSchema = new Schema(
  {
    riderId: { type: String, required: true, index: true },
    startedAt: { type: Date, required: true, default: Date.now, index: true },
    endedAt: { type: Date, default: null, index: true },
    durationSeconds: { type: Number, default: 0 },
    startSource: { type: String, default: "app", trim: true },
    endSource: { type: String, default: "", trim: true },
    endReason: {
      type: String,
      enum: ["manual_offline", "admin_offline", "status_changed", "kyc_changed", "replaced", "system"],
      default: "manual_offline",
    },
  },
  { timestamps: true },
);

riderAvailabilitySessionSchema.index({ riderId: 1, startedAt: -1 });
riderAvailabilitySessionSchema.index(
  { riderId: 1, endedAt: 1 },
  {
    unique: true,
    partialFilterExpression: { endedAt: null },
  },
);

export const RiderAvailabilitySessionModel = mongoose.model(
  "RiderAvailabilitySession",
  riderAvailabilitySessionSchema,
);
