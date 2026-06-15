import mongoose, { Schema } from "mongoose";

const adminNotificationScheduleSchema = new Schema(
  {
    recipientType: {
      type: String,
      enum: ["customers", "owners", "riders"],
      required: true,
    },
    audience: {
      type: String,
      enum: ["all", "selected"],
      required: true,
    },
    recipientIds: { type: [String], default: [] },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    path: { type: String, default: "", trim: true },
    ctaLabel: { type: String, default: "", trim: true },
    ctaPath: { type: String, default: "", trim: true },
    notificationType: { type: String, default: "system", trim: true },
    contentType: {
      type: String,
      enum: ["text", "image", "image_text"],
      default: "text",
    },
    imageUrl: { type: String, default: "", trim: true },
    imagePublicId: { type: String, default: "", trim: true },
    voucherId: { type: String, default: "", trim: true },
    voucherCode: { type: String, default: "", trim: true },
    voucherLabel: { type: String, default: "", trim: true },
    voucherExpiresAt: { type: Date, default: null },
    voucherMinOrder: { type: Number, default: null },
    personalOffer: { type: Boolean, default: false },
    pushEnabled: { type: Boolean, default: true },
    customerAudienceType: {
      type: String,
      enum: ["all_users", "new_users", "returning_users", "selected_users"],
      default: "all_users",
    },
    customerGroupKey: { type: String, default: "", trim: true },
    restaurantScope: {
      type: String,
      enum: ["all_restaurants", "selected_restaurants"],
      default: "all_restaurants",
    },
    selectedRestaurantIds: { type: [String], default: [] },
    zoneId: { type: String, default: "", trim: true, index: true },
    districtId: { type: String, default: "", trim: true, index: true },
    abTest: {
      enabled: { type: Boolean, default: false },
      splitPercent: { type: Number, default: 50 },
      variantBTitle: { type: String, default: "", trim: true },
      variantBBody: { type: String, default: "", trim: true },
      variantBPath: { type: String, default: "", trim: true },
    },
    conversionWindowDays: { type: Number, default: 7 },
    sendMode: {
      type: String,
      enum: ["instant", "scheduled"],
      default: "scheduled",
    },
    scheduledAt: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ["scheduled", "sending", "sent", "cancelled", "failed"],
      default: "scheduled",
      index: true,
    },
    createdByAdminId: { type: String, default: "" },
    sentAt: { type: Date, default: null },
    failureReason: { type: String, default: "" },
    result: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, versionKey: false },
);

adminNotificationScheduleSchema.index({ status: 1, scheduledAt: 1 });

export const AdminNotificationScheduleModel = mongoose.model(
  "AdminNotificationSchedule",
  adminNotificationScheduleSchema,
);
