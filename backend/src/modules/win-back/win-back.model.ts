import { Schema, model } from "mongoose"

// Admin settings (single document, key "default"). OFF until the admin turns it on.
const winBackSettingsSchema = new Schema(
  {
    key: { type: String, default: "default", unique: true },
    enabled: { type: Boolean, default: false },
    /** "approval" = admin reviews today's list and presses Send · "auto" = sends daily by itself. */
    mode: { type: String, enum: ["approval", "auto"], default: "approval" },
    lapsedDays: { type: Number, default: 30 },
    amounts: {
      one_time: { type: Number, default: 20 },
      regular: { type: Number, default: 35 },
      loyal: { type: Number, default: 50 },
    },
    minOrderAmount: { type: Number, default: 250 },
    validityDays: { type: Number, default: 7 },
    monthlyBudget: { type: Number, default: 3000 },
    maxAttemptsPer90Days: { type: Number, default: 2 },
    controlPercent: { type: Number, default: 10 },
    /** Auto mode send time (Asia/Dhaka), minutes after midnight. 12:30 PM. */
    sendMinuteOfDay: { type: Number, default: 12 * 60 + 30 },
    lastAutoRunDate: { type: String, default: "" },
  },
  { timestamps: true },
)

// One row per attempt. "control" rows are customers deliberately NOT sent anything
// (to measure whether vouchers really bring people back).
const winBackAttemptSchema = new Schema(
  {
    customerId: { type: String, required: true, index: true },
    segment: { type: String, enum: ["one_time", "regular", "loyal"], required: true },
    status: { type: String, enum: ["sent", "control", "failed"], required: true },
    amount: { type: Number, default: 0 },
    voucherId: { type: Schema.Types.ObjectId, ref: "Voucher", default: null },
    voucherCode: { type: String, default: "" },
    favouriteRestaurantId: { type: String, default: "" },
    daysSinceOrder: { type: Number, default: 0 },
    trigger: { type: String, enum: ["admin", "auto"], required: true },
    triggeredBy: { type: String, default: "" },
  },
  { timestamps: true },
)
winBackAttemptSchema.index({ createdAt: -1 })
winBackAttemptSchema.index({ status: 1, createdAt: -1 })

export const WinBackSettingsModel = model("WinBackSettings", winBackSettingsSchema)
export const WinBackAttemptModel = model("WinBackAttempt", winBackAttemptSchema)
