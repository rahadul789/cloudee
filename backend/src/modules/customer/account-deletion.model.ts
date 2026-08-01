import mongoose, { Schema } from "mongoose"

// One row per account/data deletion request submitted from the customer app
// (Google Play data-safety compliance). A request is NEVER auto-deletes an account —
// it lands here as "pending" and an admin reviews/acts on it manually, so the flow is
// safe against abuse (anyone can type a phone number). `reviewDays` is a snapshot of the
// review window we told the customer at submit time.
const accountDeletionRequestSchema = new Schema(
  {
    phone: { type: String, required: true, trim: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", default: null },
    customerName: { type: String, default: "", trim: true },
    reason: { type: String, default: "", trim: true },
    status: {
      type: String,
      enum: ["pending", "reviewing", "completed", "rejected"],
      default: "pending",
      index: true,
    },
    reviewDays: { type: Number, default: 7 },
    source: { type: String, default: "customer_app", trim: true },
    adminNote: { type: String, default: "", trim: true },
    handledByAdminId: { type: String, default: "", trim: true },
    handledAt: { type: Date, default: null },
  },
  { timestamps: true },
)

accountDeletionRequestSchema.index({ status: 1, createdAt: -1 })

export const AccountDeletionRequestModel = mongoose.model(
  "AccountDeletionRequest",
  accountDeletionRequestSchema,
)
