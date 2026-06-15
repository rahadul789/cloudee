import mongoose, { Schema } from "mongoose";

const riderPayrollAdjustmentSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["bonus", "tip", "reimbursement", "penalty", "deduction"],
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    note: { type: String, default: "", trim: true },
    createdByAdminId: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const riderPayrollCycleSchema = new Schema(
  {
    riderId: { type: Schema.Types.ObjectId, ref: "Rider", required: true },
    month: { type: String, required: true, trim: true },
    baseSalary: { type: Number, default: 0, min: 0 },
    adjustments: { type: [riderPayrollAdjustmentSchema], default: [] },
    status: {
      type: String,
      enum: ["draft", "approved", "paid"],
      default: "draft",
    },
    approvedAt: { type: Date, default: null },
    approvedByAdminId: { type: String, default: "" },
    paidAt: { type: Date, default: null },
    paidByAdminId: { type: String, default: "" },
    paymentReference: { type: String, default: "", trim: true },
    note: { type: String, default: "", trim: true },
  },
  { timestamps: true },
);

riderPayrollCycleSchema.index({ riderId: 1, month: 1 }, { unique: true });
riderPayrollCycleSchema.index({ month: 1, status: 1, updatedAt: -1 });

export const RiderPayrollCycleModel = mongoose.model(
  "RiderPayrollCycle",
  riderPayrollCycleSchema,
);
