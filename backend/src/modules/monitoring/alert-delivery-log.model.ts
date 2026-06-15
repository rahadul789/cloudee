import mongoose, { Schema } from "mongoose";

const alertDeliveryLogSchema = new Schema(
  {
    dedupeKey: { type: String, required: true },
    channel: { type: String, required: true },
    layer: { type: String, default: "operations" },
    title: { type: String, default: "" },
    severity: { type: String, default: "warning" },
    lastSentAt: { type: Date, default: null },
    cooldownUntil: { type: Date, default: null, index: true },
    sendCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

alertDeliveryLogSchema.index({ dedupeKey: 1, channel: 1 }, { unique: true });
// Dedupe/cooldown bookkeeping only — drop entries that have been idle for 90 days
// so this collection never grows unbounded as new dedupe keys appear over time.
// updatedAt refreshes on every send, so actively-used keys are never expired.
alertDeliveryLogSchema.index(
  { updatedAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 },
);

export const AlertDeliveryLogModel = mongoose.model(
  "AlertDeliveryLog",
  alertDeliveryLogSchema,
);
