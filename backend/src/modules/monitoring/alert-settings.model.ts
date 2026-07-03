import mongoose, { Schema } from "mongoose";

const alertDeliverySettingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "global" },
    recipientEmails: { type: [String], default: [] },
    notificationChannel: {
      type: String,
      enum: ["email", "telegram", "both"],
      default: "both",
    },
    fromEmail: { type: String, default: "" },
    fromName: { type: String, default: "Foodbela Monitor" },
    cooldownMinutes: { type: Number, default: 30 },
    checkIntervalSeconds: { type: Number, default: 60 },
    memoryRssMb: { type: Number, default: 900 },
    cpuPercent: { type: Number, default: 85 },
    fivexxThreshold: { type: Number, default: 5 },
    rateLimitThreshold: { type: Number, default: 20 },
    sslExpiryDays: { type: Number, default: 14 },
    updatedByAdminId: { type: String, default: "" },
    updatedByAdminName: { type: String, default: "" },
  },
  { timestamps: true },
);

export const AlertDeliverySettingsModel = mongoose.model(
  "AlertDeliverySettings",
  alertDeliverySettingsSchema,
);
