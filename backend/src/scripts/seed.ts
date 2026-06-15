import { connectDatabase } from "../config/db"
import { logger } from "../config/logger"
import { env } from "../config/env"
import { bootstrapAdminIfMissing } from "../modules/admin/admin.service"
import { RestaurantCollectionModel } from "../modules/customer/customer.model"

async function seed() {
  await connectDatabase()

  const admin = await bootstrapAdminIfMissing()

  await RestaurantCollectionModel.findOneAndUpdate(
    { key: "featured_restaurants" },
    {
      key: "featured_restaurants",
      name: "Featured Restaurants",
      type: "static",
      restaurantIds: [],
      sortOrders: [],
      isActive: true
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  await RestaurantCollectionModel.findOneAndUpdate(
    { key: "restaurants_with_offers" },
    {
      key: "restaurants_with_offers",
      name: "Restaurants With Offers",
      type: "dynamic",
      criteria: { hasActiveVoucher: true },
      restaurantIds: [],
      sortOrders: [],
      isActive: true
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  logger.info(
    {
      adminEmail: admin.email,
      bootstrapEmail: env.ADMIN_BOOTSTRAP_EMAIL
    },
    "Seed completed successfully"
  )
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error(error)
    process.exit(1)
  })
