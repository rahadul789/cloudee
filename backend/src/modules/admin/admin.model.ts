import mongoose, { Schema } from "mongoose"

const adminSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["admin", "support", "ops"],
      default: "admin"
    },
    status: {
      type: String,
      enum: ["active", "suspended", "locked"],
      default: "active"
    },
    lastLoginAt: { type: Date, default: null }
  },
  { timestamps: true }
)

const adminRefreshTokenSessionSchema = new Schema(
  {
    adminId: { type: Schema.Types.ObjectId, ref: "Admin", required: true },
    tokenId: { type: String, required: true, unique: true },
    tokenHash: { type: String, required: true },
    userAgent: { type: String, default: "" },
    ipAddress: { type: String, default: "" },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null }
  },
  { timestamps: true }
)

const adminAuditLogSchema = new Schema(
  {
    actorAdminId: { type: String, default: "" },
    actorName: { type: String, default: "Admin" },
    actorRole: { type: String, default: "admin" },
    entityType: { type: String, required: true, trim: true },
    entityId: { type: String, required: true, trim: true },
    action: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
)

adminRefreshTokenSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 45 })
adminAuditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 })
adminAuditLogSchema.index({ actorAdminId: 1, createdAt: -1 })

export const AdminModel = mongoose.model("Admin", adminSchema)
export const AdminRefreshTokenSessionModel = mongoose.model(
  "AdminRefreshTokenSession",
  adminRefreshTokenSessionSchema
)
export const AdminAuditLogModel = mongoose.model("AdminAuditLog", adminAuditLogSchema)
