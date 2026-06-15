import mongoose, { Schema } from "mongoose";

const adminOperationalAlertSchema = new Schema(
  {
    alertType: { type: String, required: true, index: true },
    severity: {
      type: String,
      enum: ["info", "warning", "critical"],
      default: "warning",
      index: true,
    },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    source: { type: String, default: "operations", index: true },
    entityType: { type: String, default: "" },
    entityId: { type: String, default: "" },
    path: { type: String, default: "" },
    iconKey: { type: String, default: "bell" },
    dedupeKey: { type: String, required: true, unique: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    snoozedUntil: { type: Date, default: null, index: true },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

adminOperationalAlertSchema.index({ createdAt: -1 });
adminOperationalAlertSchema.index({ entityType: 1, entityId: 1, alertType: 1 });
adminOperationalAlertSchema.index(
  { resolvedAt: 1 },
  {
    expireAfterSeconds: 90 * 24 * 60 * 60,
    partialFilterExpression: { resolvedAt: { $type: "date" } },
  },
);

export const AdminOperationalAlertModel = mongoose.model(
  "AdminOperationalAlert",
  adminOperationalAlertSchema,
);
