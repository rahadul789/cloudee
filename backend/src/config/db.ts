import mongoose from "mongoose"

import { OtpAbuseBlockModel, OtpSecurityEventModel } from "../modules/auth/auth.model"
import {
  BkashPaymentAttemptModel,
  BkashSandboxPaymentSessionModel,
  VoucherRedemptionModel,
} from "../modules/customer/customer.model"
import { AlertDeliveryLogModel } from "../modules/monitoring/alert-delivery-log.model"
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

    await BkashSandboxPaymentSessionModel.syncIndexes()
    await BkashPaymentAttemptModel.syncIndexes()
    await VoucherRedemptionModel.syncIndexes()
    await OtpSecurityEventModel.syncIndexes()
    await OtpAbuseBlockModel.syncIndexes()
    await AlertDeliveryLogModel.syncIndexes()
  }

  logger.info("MongoDB connected successfully")
}
