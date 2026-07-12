import mongoose, { Schema } from "mongoose";

// One row per OTP session — the funnel + support-relay record behind the admin "OTP Monitor"
// and the "Foodbela OTP" Telegram bot. Separate from the security-hardened OtpSession (which
// stays hashed): this deliberately keeps the PLAINTEXT code so support can read it out. That
// tradeoff is bounded — the code is only valid for the short OTP TTL (a stored code older than
// that is already expired and useless for login), and the whole row auto-deletes (TTL below).
const otpAttemptSchema = new Schema(
  {
    verificationSessionId: { type: String, default: "" },
    phone: { type: String, required: true, trim: true },
    purpose: { type: String, default: "" },
    plainCode: { type: String, default: "" },
    channel: { type: String, default: "sms" },
    ipAddress: { type: String, default: "" },
    deviceId: { type: String, default: "" },
    requestedAt: { type: Date, default: () => new Date() },
    lastSentAt: { type: Date, default: null },
    resendCount: { type: Number, default: 0 },
    verifiedAt: { type: Date, default: null },
    loggedInAt: { type: Date, default: null },
    callRequestedAt: { type: Date, default: null },
    handledAt: { type: Date, default: null },
    handledByAdminId: { type: String, default: "" },
  },
  { timestamps: true },
);

// Funnel-retention window; also bounds plaintext-code exposure (expired codes are useless).
otpAttemptSchema.index({ createdAt: 1 }, { expireAfterSeconds: 14 * 24 * 60 * 60 });
otpAttemptSchema.index({ verificationSessionId: 1 });
otpAttemptSchema.index({ phone: 1, requestedAt: -1 });
otpAttemptSchema.index({ requestedAt: -1 });

export const OtpAttemptModel =
  (mongoose.models.OtpAttempt as mongoose.Model<Record<string, unknown>>) ??
  mongoose.model("OtpAttempt", otpAttemptSchema);
