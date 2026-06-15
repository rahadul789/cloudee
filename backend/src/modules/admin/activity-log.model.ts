import mongoose, { Schema } from "mongoose";

const adminActivityLogSchema = new Schema(
  {
    action: { type: String, required: true, index: true },
    entityType: { type: String, required: true, index: true },
    entityId: { type: String, required: true, index: true },
    title: { type: String, default: "" },
    description: { type: String, default: "" },
    adminId: { type: String, default: "", index: true },
    adminName: { type: String, default: "" },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

adminActivityLogSchema.index({ createdAt: -1 });
adminActivityLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 180 * 24 * 60 * 60 }
);

export const AdminActivityLogModel = mongoose.model(
  "AdminActivityLog",
  adminActivityLogSchema
);
