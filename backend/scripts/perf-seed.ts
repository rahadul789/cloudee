import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

import mongoose from "mongoose"

import { connectDatabase } from "../src/config/db"
import {
  hashPassword,
  signAccessToken,
  signRefreshToken
} from "../src/modules/auth/auth.utils"
import {
  OwnerModel,
  RefreshTokenSessionModel,
  RestaurantModel,
  RiderModel,
  RiderRefreshTokenSessionModel
} from "../src/modules/auth/auth.model"
import { bootstrapAdminIfMissing, signinAdmin } from "../src/modules/admin/admin.service"
import {
  CustomerModel,
  CustomerRefreshTokenSessionModel,
  RestaurantCollectionModel
} from "../src/modules/customer/customer.model"
import { CategoryModel, MenuItemModel, OrderModel } from "../src/modules/owner/operational.model"

const CUSTOMER_COUNT = Number.parseInt(process.env.PERF_CUSTOMERS ?? "100", 10)
const RIDER_COUNT = Number.parseInt(process.env.PERF_RIDERS ?? "20", 10)
const ORDER_COUNT = Number.parseInt(process.env.PERF_ORDERS ?? "50", 10)
const PERF_PASSWORD = process.env.PERF_PASSWORD ?? "Perf@123456"
const DATA_FILE = path.resolve(process.cwd(), ".perf-load-data.json")
const RESTAURANT_LATITUDE = 24.8709
const RESTAURANT_LONGITUDE = 90.7279
const REFRESH_SESSION_EXPIRY_DAYS = 3650

function requireDoc<T>(doc: T, label: string): NonNullable<T> {
  if (!doc) {
    throw new Error(`Failed to create ${label}`)
  }
  return doc as NonNullable<T>
}

function phone(prefix: string, index: number) {
  return `${prefix}${String(index).padStart(7, "0")}`
}

function buildRefreshExpiry() {
  return new Date(Date.now() + REFRESH_SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
}

async function createOwnerRefreshSession(ownerId: string, restaurantId: string) {
  const tokenId = crypto.randomUUID()
  const refreshToken = signRefreshToken({
    subject: ownerId,
    role: "owner",
    restaurantId,
    tokenId
  })
  const tokenHash = await hashPassword(refreshToken)

  await RefreshTokenSessionModel.updateMany(
    { ownerId, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  )

  await RefreshTokenSessionModel.create({
    ownerId,
    tokenId,
    tokenHash,
    userAgent: "foodbela-perf-seed",
    ipAddress: "127.0.0.1",
    expiresAt: buildRefreshExpiry()
  })

  return { refreshToken, tokenId }
}

async function createCustomerRefreshSession(customerId: string) {
  const tokenId = crypto.randomUUID()
  const refreshToken = signRefreshToken({
    subject: customerId,
    role: "customer",
    tokenId
  })
  const tokenHash = await hashPassword(refreshToken)

  await CustomerRefreshTokenSessionModel.updateMany(
    { customerId, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  )

  await CustomerRefreshTokenSessionModel.create({
    customerId,
    tokenId,
    tokenHash,
    userAgent: "foodbela-perf-seed",
    ipAddress: "127.0.0.1",
    expiresAt: buildRefreshExpiry()
  })

  return { refreshToken, tokenId }
}

async function createRiderRefreshSession(riderId: string) {
  const tokenId = crypto.randomUUID()
  const refreshToken = signRefreshToken({
    subject: riderId,
    role: "rider",
    tokenId
  })
  const tokenHash = await hashPassword(refreshToken)

  await RiderRefreshTokenSessionModel.updateMany(
    { riderId, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  )

  await RiderRefreshTokenSessionModel.create({
    riderId,
    tokenId,
    tokenHash,
    userAgent: "foodbela-perf-seed",
    ipAddress: "127.0.0.1",
    expiresAt: buildRefreshExpiry()
  })

  return { refreshToken, tokenId }
}

function orderHistory(date: Date) {
  const acceptedAt = new Date(date.getTime() + 60_000)
  const preparingAt = new Date(date.getTime() + 120_000)
  const readyAt = new Date(date.getTime() + 180_000)
  const pickedUpAt = new Date(date.getTime() + 240_000)

  return {
    timestamps: {
      placedAt: date,
      Accepted: acceptedAt,
      acceptedAt,
      Preparing: preparingAt,
      preparingAt,
      ReadyForPickup: readyAt,
      readyForPickupAt: readyAt,
      PickedUp: pickedUpAt,
      pickedUpAt
    },
    history: [
      { status: "New", actor: "customer", note: "Perf seed order", createdAt: date },
      { status: "Accepted", actor: "system", note: "Perf seed order", createdAt: acceptedAt },
      { status: "Preparing", actor: "system", note: "Perf seed order", createdAt: preparingAt },
      { status: "ReadyForPickup", actor: "system", note: "Perf seed order", createdAt: readyAt },
      { status: "PickedUp", actor: "rider", note: "Perf seed order", createdAt: pickedUpAt }
    ]
  }
}

async function seed() {
  await connectDatabase()

  const passwordHash = await hashPassword(PERF_PASSWORD)
  const owner = requireDoc(
    await OwnerModel.findOneAndUpdate(
      { phone: "01790000000" },
      {
        fullName: "Perf Test Owner",
        phone: "01790000000",
        email: "perf-owner@foodbela.test",
        passwordHash,
        isPhoneVerified: true,
        status: "active",
        restaurantLifecycleStatus: "approved"
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ),
    "perf owner"
  )

  const restaurant = requireDoc(
    await RestaurantModel.findOneAndUpdate(
      { ownerId: owner._id, slug: "perf-test-kitchen" },
      {
        ownerId: owner._id,
        name: "Perf Test Kitchen",
        slug: "perf-test-kitchen",
        description: "Synthetic restaurant for load testing",
        preparationTimeMinutes: 20,
        cuisineTypes: ["Fast Food", "Bangla"],
        tags: ["perf-test"],
        contact: {
          phone: "01790000000",
          email: "perf-owner@foodbela.test"
        },
        address: {
          address: "Perf Test Road, Netrokona",
          city: "Netrokona"
        },
        location: {
          latitude: RESTAURANT_LATITUDE,
          longitude: RESTAURANT_LONGITUDE
        },
        locationPoint: {
          type: "Point",
          coordinates: [RESTAURANT_LONGITUDE, RESTAURANT_LATITUDE]
        },
        runtime: {
          isVisible: true,
          isOnline: true,
          status: "open",
          manuallyPaused: false
        },
        discovery: {
          isFeatured: true,
          featuredSortOrder: 1
        },
        settings: {
          orderSettings: {
            autoAcceptOrders: true
          },
          notifications: {
            newOrder: true,
            cancellation: true,
            payouts: true,
            support: true
          }
        },
        profileCompletion: {
          percentage: 100,
          completedWeight: 100
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ),
    "perf restaurant"
  )

  await OwnerModel.updateOne(
    { _id: owner._id },
    { $set: { activeRestaurantId: restaurant._id } }
  )
  const ownerRefreshSession = await createOwnerRefreshSession(owner.id, restaurant.id)

  await bootstrapAdminIfMissing()
  const adminAuth = await signinAdmin({
    email: process.env.ADMIN_BOOTSTRAP_EMAIL ?? "admin@foodbela.com",
    password: process.env.ADMIN_BOOTSTRAP_PASSWORD ?? "Admin@123456",
    userAgent: "foodbela-perf-seed",
    ipAddress: "127.0.0.1"
  })

  const category = requireDoc(
    await CategoryModel.findOneAndUpdate(
      { restaurantId: restaurant._id, slug: "perf-combo" },
      {
        restaurantId: restaurant._id,
        name: "Perf Combo",
        slug: "perf-combo",
        description: "Synthetic menu category",
        status: "active",
        displayOrder: 1
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ),
    "perf category"
  )

  const menuItem = requireDoc(
    await MenuItemModel.findOneAndUpdate(
      { restaurantId: restaurant._id, slug: "perf-burger-combo" },
      {
        restaurantId: restaurant._id,
        categoryId: category._id,
        name: "Perf Burger Combo",
        slug: "perf-burger-combo",
        description: "Synthetic item used by perf tests",
        status: "active",
        availability: "available",
        kind: "simple",
        basePrice: 220,
        isPopular: true,
        images: []
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ),
    "perf menu item"
  )

  await RestaurantCollectionModel.findOneAndUpdate(
    { key: "featured_restaurants" },
    {
      key: "featured_restaurants",
      name: "Featured Restaurants",
      type: "static",
      restaurantIds: [restaurant._id],
      sortOrders: [{ restaurantId: restaurant._id, order: 1 }],
      isActive: true
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  const customers = []
  for (let index = 1; index <= CUSTOMER_COUNT; index += 1) {
    const customer = requireDoc(
      await CustomerModel.findOneAndUpdate(
        { phone: phone("0198", index) },
        {
          fullName: `Perf Customer ${index}`,
          phone: phone("0198", index),
          email: `perf.customer.${index}@foodbela.test`,
          passwordHash,
          authProviders: ["phone", "password"],
          status: "active",
          savedLocations: [
            {
              label: "Home",
              address: "Perf Test Customer Area",
              latitude: RESTAURANT_LATITUDE + 0.004,
              longitude: RESTAURANT_LONGITUDE + 0.004,
              source: "saved",
              isDefault: true,
              lastUsedAt: new Date()
            }
          ]
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ),
      `perf customer ${index}`
    )
    const refreshSession = await createCustomerRefreshSession(customer.id)
    customers.push({
      id: customer.id,
      fullName: customer.fullName,
      phone: customer.phone,
      refreshToken: refreshSession.refreshToken,
      tokenId: refreshSession.tokenId
    })
  }

  const riders = []
  for (let index = 1; index <= RIDER_COUNT; index += 1) {
    const rider = requireDoc(
      await RiderModel.findOneAndUpdate(
        { phone: phone("0188", index) },
        {
          fullName: `Perf Rider ${index}`,
          phone: phone("0188", index),
          passwordHash,
          vehicleType: "cycle",
          isAvailableForAssignments: true,
          isPhoneVerified: true,
          verification: {
            status: "approved",
            nationalIdNumber: `PERF-NID-${index}`
          },
          status: "active",
          lastKnownLocation: {
            latitude: RESTAURANT_LATITUDE,
            longitude: RESTAURANT_LONGITUDE,
            heading: 90,
            accuracyMeters: 8,
            speedKmph: 16,
            updatedAt: new Date()
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ),
      `perf rider ${index}`
    )
    const refreshSession = await createRiderRefreshSession(rider.id)
    riders.push({
      id: rider.id,
      fullName: rider.fullName,
      phone: rider.phone,
      vehicleType: rider.vehicleType,
      refreshToken: refreshSession.refreshToken,
      tokenId: refreshSession.tokenId
    })
  }

  const orders = []
  const riderOrderIds = new Map<string, string[]>()
  const now = Date.now()

  for (let index = 0; index < ORDER_COUNT; index += 1) {
    const customer = customers[index % customers.length]
    const rider = riders[index % riders.length]
    const quantity = (index % 3) + 1
    const subtotal = 220 * quantity
    const deliveryFee = 40
    const total = subtotal + deliveryFee
    const placedAt = new Date(now - (ORDER_COUNT - index) * 90_000)
    const history = orderHistory(placedAt)
    const clientOrderId = `perf-order-${String(index + 1).padStart(3, "0")}`

    const order = requireDoc(
      await OrderModel.findOneAndUpdate(
        {
          customerId: customer.id,
          clientOrderId
        },
        {
          $setOnInsert: {
            orderNumber: `PERF-${String(index + 1).padStart(5, "0")}`
          },
          $set: {
            restaurantId: restaurant._id,
            customerId: customer.id,
            clientOrderId,
            riderId: rider.id,
            status: "PickedUp",
            paymentMethod: "Cash",
            paymentStatus: "pending",
            paymentSnapshot: {
              provider: "Cash"
            },
            pricing: {
              subtotal,
              deliveryFee,
              discountAmount: 0,
              ownerDiscountCost: 0,
              platformDiscountCost: 0,
              total
            },
            customerSnapshot: {
              id: customer.id,
              fullName: customer.fullName,
              phone: customer.phone,
              deliveryAddress: {
                label: "Home",
                addressLine: "Perf Test Customer Area",
                latitude: RESTAURANT_LATITUDE + 0.004 + index * 0.0001,
                longitude: RESTAURANT_LONGITUDE + 0.004 + index * 0.0001
              }
            },
            riderSnapshot: {
              id: rider.id,
              name: rider.fullName,
              phone: rider.phone,
              vehicleType: rider.vehicleType
            },
            riderTracking: {
              isActive: true,
              isFocused: index < RIDER_COUNT,
              currentLocation: {
                latitude: RESTAURANT_LATITUDE,
                longitude: RESTAURANT_LONGITUDE,
                heading: 90,
                accuracyMeters: 8,
                speedKmph: 16,
                updatedAt: new Date()
              }
            },
            dispatchMeta: {
              acknowledgedAt: history.timestamps.acceptedAt
            },
            preparationMeta: {
              acceptedAt: history.timestamps.acceptedAt,
              readyForPickupAt: history.timestamps.readyForPickupAt
            },
            itemsSnapshot: [
              {
                itemId: menuItem.id,
                categoryId: category.id,
                itemName: menuItem.name,
                name: menuItem.name,
                itemSlug: menuItem.slug,
                categoryName: category.name,
                categorySlug: category.slug,
                imageUrl: "",
                quantity,
                unitPrice: 220,
                lineTotal: subtotal,
                selectedVariantOptions: [],
                selectedAddOnOptions: []
              }
            ],
            timestamps: history.timestamps,
            history: history.history
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ),
      `perf order ${index + 1}`
    )

    orders.push(order)
    riderOrderIds.set(rider.id, [...(riderOrderIds.get(rider.id) ?? []), order.id])
  }

  await Promise.all(
    riders.map((rider) =>
      RiderModel.updateOne(
        { _id: rider.id },
        { $set: { activeTrackingOrderId: riderOrderIds.get(rider.id)?.[0] ?? "" } }
      )
    )
  )

  const data = {
    generatedAt: new Date().toISOString(),
    apiBaseUrl: process.env.API_BASE_URL ?? "http://localhost:5000/api/v1",
    socketUrl: process.env.SOCKET_URL ?? "http://localhost:5000",
    restaurant: {
      id: restaurant.id,
      name: restaurant.name,
      latitude: RESTAURANT_LATITUDE,
      longitude: RESTAURANT_LONGITUDE,
      categoryId: category.id,
      menuItemId: menuItem.id
    },
    owner: {
      id: owner.id,
      refreshToken: ownerRefreshSession.refreshToken,
      token: signAccessToken({
        subject: owner.id,
        role: "owner",
        restaurantId: restaurant.id,
        tokenId: ownerRefreshSession.tokenId
      })
    },
    admin: {
      id: adminAuth.admin.id,
      email: adminAuth.admin.email,
      refreshToken: adminAuth.refreshToken,
      token: adminAuth.accessToken
    },
    customers: customers.map((customer) => ({
      id: customer.id,
      phone: customer.phone,
      refreshToken: customer.refreshToken,
      token: signAccessToken({
        subject: customer.id,
        role: "customer",
        tokenId: customer.tokenId
      })
    })),
    riders: riders.map((rider) => ({
      id: rider.id,
      phone: rider.phone,
      refreshToken: rider.refreshToken,
      token: signAccessToken({
        subject: rider.id,
        role: "rider",
        tokenId: rider.tokenId
      }),
      orderIds: riderOrderIds.get(rider.id) ?? []
    })),
    orders: orders.map((order) => ({
      id: order.id,
      customerId: order.customerId,
      riderId: order.riderId,
      status: order.status
    }))
  }

  await fs.writeFile(DATA_FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8")

  console.log(`Perf seed complete`)
  console.log(`- data file: ${DATA_FILE}`)
  console.log(`- customers: ${customers.length}`)
  console.log(`- riders: ${riders.length}`)
  console.log(`- live orders: ${orders.length}`)
  console.log(`- admin: ${adminAuth.admin.email}`)
}

seed()
  .then(async () => {
    await mongoose.disconnect()
  })
  .catch(async (error) => {
    console.error(error)
    await mongoose.disconnect()
    process.exit(1)
  })
