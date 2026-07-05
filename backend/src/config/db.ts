import mongoose from "mongoose"

import { OtpAbuseBlockModel, OtpSecurityEventModel } from "../modules/auth/auth.model"
import {
  BkashPaymentAttemptModel,
  BkashSandboxPaymentSessionModel,
  VoucherRedemptionModel,
} from "../modules/customer/customer.model"
import { AlertDeliveryLogModel } from "../modules/monitoring/alert-delivery-log.model"
import { ReviewModel } from "../modules/owner/experience.model"
import { env } from "./env"
import { logger } from "./logger"

export async function connectDatabase() {
  mongoose.set("strictQuery", true)

  await mongoose.connect(env.MONGODB_URI, {
    maxPoolSize: env.MONGODB_MAX_POOL_SIZE,
    minPoolSize: Math.min(env.MONGODB_MIN_POOL_SIZE, env.MONGODB_MAX_POOL_SIZE),
    serverSelectionTimeoutMS: 10000
  })

  if (env.DB_STARTUP_MAINTENANCE_ENABLED) {
    await BkashSandboxPaymentSessionModel.updateMany(
      {
        $or: [{ sandboxPaymentId: "" }, { otpCodeHash: "" }]
      },
      {
        $unset: {
          sandboxPaymentId: 1,
          otpCodeHash: 1
        }
      }
    )

    // Reviews are now one-per-order (partial unique index below). Drop any legacy
    // duplicates FIRST — keeping the most recent per order (matches the order's stamped
    // reviewRequest) — so the unique index can build. Idempotent: a no-op once clean.
    const duplicateReviewGroups = await ReviewModel.aggregate<{
      _id: mongoose.Types.ObjectId
      ids: mongoose.Types.ObjectId[]
    }>([
      { $match: { orderId: { $type: "objectId" } } },
      { $sort: { createdAt: 1 } },
      { $group: { _id: "$orderId", ids: { $push: "$_id" }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ])
    const staleReviewIds = duplicateReviewGroups.flatMap((group) =>
      group.ids.slice(0, -1),
    )
    if (staleReviewIds.length) {
      await ReviewModel.deleteMany({ _id: { $in: staleReviewIds } })
      logger.warn(
        { removed: staleReviewIds.length },
        "Removed duplicate per-order reviews before unique index sync",
      )
    }

    await BkashSandboxPaymentSessionModel.syncIndexes()
    await BkashPaymentAttemptModel.syncIndexes()
    await VoucherRedemptionModel.syncIndexes()
    await OtpSecurityEventModel.syncIndexes()
    await OtpAbuseBlockModel.syncIndexes()
    await AlertDeliveryLogModel.syncIndexes()
    await ReviewModel.syncIndexes()
  }

  logger.info("MongoDB connected successfully")
}
