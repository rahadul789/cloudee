import mongoose, { Schema } from "mongoose";

const adminCustomerGroupSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    customerIds: [{ type: Schema.Types.ObjectId, ref: "Customer" }],
    sourceFilter: { type: Schema.Types.Mixed, default: {} },
    createdByAdminId: { type: String, default: "", trim: true },
    archivedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, versionKey: false },
);

adminCustomerGroupSchema.index({ archivedAt: 1, createdAt: -1 });
adminCustomerGroupSchema.index({ name: 1, archivedAt: 1 });

export const AdminCustomerGroupModel = mongoose.model(
  "AdminCustomerGroup",
  adminCustomerGroupSchema,
);
