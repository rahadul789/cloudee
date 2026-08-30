import mongoose from "mongoose"

import { env } from "../src/config/env"
import { AdminModel } from "../src/modules/admin/admin.model"
import {
  comparePassword,
  hashPassword,
} from "../src/modules/auth/auth.utils"

const ADMIN_EMAIL = "maerdollsragilisticdocs25968@vela.com"
const ADMIN_PASSWORD = "Bn0y10h2qI6045f8"

async function seedLoginAdmin() {
  mongoose.set("strictQuery", true)

  await mongoose.connect(env.MONGODB_URI, {
    maxPoolSize: env.MONGODB_MAX_POOL_SIZE,
    minPoolSize: Math.min(
      env.MONGODB_MIN_POOL_SIZE,
      env.MONGODB_MAX_POOL_SIZE,
    ),
    serverSelectionTimeoutMS: env.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
  })

  const passwordHash = await hashPassword(ADMIN_PASSWORD)
  const admin = await AdminModel.findOneAndUpdate(
    { email: ADMIN_EMAIL },
    {
      $set: {
        fullName: "Foodbela Admin",
        email: ADMIN_EMAIL,
        passwordHash,
        role: "admin",
        status: "active",
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )

  const passwordVerified = await comparePassword(
    ADMIN_PASSWORD,
    admin.passwordHash,
  )
  if (!passwordVerified) {
    throw new Error("Admin password verification failed after seeding.")
  }

  console.log("Admin credentials are ready for login.")
  console.log(`Email: ${ADMIN_EMAIL}`)
}

seedLoginAdmin()
  .catch((error) => {
    console.error("Admin credential seed failed.", error)
    process.exitCode = 1
  })
  .finally(async () => {
    await mongoose.disconnect()
  })
