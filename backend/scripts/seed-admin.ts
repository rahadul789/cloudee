import mongoose from "mongoose"

import { env } from "../src/config/env"
import { logger } from "../src/config/logger"
import { hashPassword } from "../src/modules/auth/auth.utils"
import { AdminModel } from "../src/modules/admin/admin.model"

async function seedAdmin() {
  mongoose.set("strictQuery", true)

  await mongoose.connect(env.MONGODB_URI, {
    maxPoolSize: env.MONGODB_MAX_POOL_SIZE,
    minPoolSize: Math.min(env.MONGODB_MIN_POOL_SIZE, env.MONGODB_MAX_POOL_SIZE),
    serverSelectionTimeoutMS: 10000
  })

  const passwordHash = await hashPassword(env.ADMIN_BOOTSTRAP_PASSWORD)
  const admin = await AdminModel.findOneAndUpdate(
    { email: env.ADMIN_BOOTSTRAP_EMAIL },
    {
      $set: {
        fullName: env.ADMIN_BOOTSTRAP_NAME,
        email: env.ADMIN_BOOTSTRAP_EMAIL,
        passwordHash,
        role: "admin",
        status: "active"
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  logger.info(
    {
      adminId: admin.id,
      adminEmail: admin.email
    },
    "Admin seed completed successfully"
  )
}

seedAdmin()
  .then(() => mongoose.disconnect())
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error(error, "Admin seed failed")
    void mongoose.disconnect().finally(() => process.exit(1))
  })
