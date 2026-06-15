import mongoose, { Schema } from "mongoose";

const adminBusinessEventSchema = new Schema(
  {
    event: { type: String, required: true, index: true },
    category: {
      type: String,
      enum: ["orders", "dispatch", "notifications", "scheduler", "security", "system"],
      default: "system",
      index: true,
    },
    severity: {
      type: String,
      enum: ["info", "warning", "critical"],
      default: "info",
      index: true,
    },
    title: { type: String, default: "" },
    description: { type: String, default: "" },
    entityType: { type: String, default: "", index: true },
    entityId: { type: String, default: "", index: true },
    actorType: { type: String, default: "system" },
    actorId: { type: String, default: "" },
    actorName: { type: String, default: "" },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, versionKey: false },
);

adminBusinessEventSchema.index({ createdAt: -1 });
adminBusinessEventSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60 },
);

export const AdminBusinessEventModel = mongoose.model(
  "AdminBusinessEvent",
  adminBusinessEventSchema,
);
