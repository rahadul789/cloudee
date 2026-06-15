import mongoose from "mongoose"

import { connectDatabase } from "../config/db"
import { logger } from "../config/logger"
import { slugify } from "../common/utils/slugify"
import { hashPassword } from "../modules/auth/auth.utils"
import { bootstrapAdminIfMissing } from "../modules/admin/admin.service"
import {
  OwnerModel,
  RestaurantModel,
  RiderModel,
} from "../modules/auth/auth.model"
import {
  CustomerModel,
  RestaurantCollectionModel,
  VoucherModel,
} from "../modules/customer/customer.model"
import { CategoryModel, MenuItemModel } from "../modules/owner/operational.model"
import {
  ServiceDistrictModel,
  ServiceZoneModel,
} from "../modules/service-area/service-area.model"
import { buildServiceAreaSnapshot } from "../modules/service-area/service-area.service"

const DEMO_PASSWORD = "123456"
const FOOD_IMAGES = [
  "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=900&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=900&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=900&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1596797038530-2c107229654b?w=900&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1544025162-d76694265947?w=900&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1550547660-d9450f859349?w=900&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1562967914-608f82629710?w=900&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1559847844-5315695dadae?w=900&auto=format&fit=crop",
]

type DemoZone = {
  districtName: string
  districtSlug: string
  zoneName: string
  zoneSlug: string
  center: { latitude: number; longitude: number }
  radiusKm: number
  maxRestaurantDistanceKm: number
  baseFeeTaka: number
}

type DemoRestaurant = {
  name: string
  ownerName: string
  ownerPhone: string
  ownerEmail: string
  phone: string
  zoneSlug: string
  distanceKm: number
  bearingDeg: number
  cuisines: string[]
  imageUrl: string
  featured?: boolean
}

const zones: DemoZone[] = [
  {
    districtName: "Netrakona",
    districtSlug: "netrakona",
    zoneName: "Netrakona Sadar",
    zoneSlug: "netrakona-sadar",
    center: { latitude: 24.8835, longitude: 90.7278 },
    radiusKm: 8,
    maxRestaurantDistanceKm: 5,
    baseFeeTaka: 45,
  },
  {
    districtName: "Netrakona",
    districtSlug: "netrakona",
    zoneName: "Kendua",
    zoneSlug: "kendua",
    center: { latitude: 24.6912, longitude: 90.8555 },
    radiusKm: 7,
    maxRestaurantDistanceKm: 4.5,
    baseFeeTaka: 50,
  },
  {
    districtName: "Mymensingh",
    districtSlug: "mymensingh",
    zoneName: "Mymensingh Sadar",
    zoneSlug: "mymensingh-sadar",
    center: { latitude: 24.7471, longitude: 90.4203 },
    radiusKm: 7,
    maxRestaurantDistanceKm: 5,
    baseFeeTaka: 55,
  },
]

const restaurants: DemoRestaurant[] = [
  {
    name: "Haor Bangla Kitchen",
    ownerName: "Arif Hasan",
    ownerPhone: "01710000001",
    ownerEmail: "arif@foodbela.demo",
    phone: "01710001001",
    zoneSlug: "netrakona-sadar",
    distanceKm: 2,
    bearingDeg: 25,
    cuisines: ["Bangla", "Rice", "Fish"],
    imageUrl: FOOD_IMAGES[0],
    featured: true,
  },
  {
    name: "Pink Grill Corner",
    ownerName: "Rafiq Ahmed",
    ownerPhone: "01710000002",
    ownerEmail: "rafiq@foodbela.demo",
    phone: "01710001002",
    zoneSlug: "netrakona-sadar",
    distanceKm: 3,
    bearingDeg: 110,
    cuisines: ["Grill", "Shawarma", "Fast Food"],
    imageUrl: FOOD_IMAGES[1],
  },
  {
    name: "Sadar Porota Bari",
    ownerName: "Nayeem Islam",
    ownerPhone: "01710000003",
    ownerEmail: "nayeem@foodbela.demo",
    phone: "01710001003",
    zoneSlug: "netrakona-sadar",
    distanceKm: 4,
    bearingDeg: 205,
    cuisines: ["Porota", "Breakfast", "Snacks"],
    imageUrl: FOOD_IMAGES[2],
  },
  {
    name: "Netrakona Kacchi House",
    ownerName: "Mahin Chowdhury",
    ownerPhone: "01710000004",
    ownerEmail: "mahin@foodbela.demo",
    phone: "01710001004",
    zoneSlug: "netrakona-sadar",
    distanceKm: 5,
    bearingDeg: 285,
    cuisines: ["Kacchi", "Biryani", "Bangla"],
    imageUrl: FOOD_IMAGES[3],
  },
  {
    name: "Six Km Test Diner",
    ownerName: "Sabbir Rahman",
    ownerPhone: "01710000005",
    ownerEmail: "sabbir@foodbela.demo",
    phone: "01710001005",
    zoneSlug: "netrakona-sadar",
    distanceKm: 6.2,
    bearingDeg: 330,
    cuisines: ["Burger", "Fried Chicken", "Fast Food"],
    imageUrl: FOOD_IMAGES[4],
  },
  {
    name: "Kendua Ruti Ghar",
    ownerName: "Mehedi Karim",
    ownerPhone: "01710000006",
    ownerEmail: "mehedi@foodbela.demo",
    phone: "01710001006",
    zoneSlug: "kendua",
    distanceKm: 2,
    bearingDeg: 45,
    cuisines: ["Ruti", "Paratha", "Snacks"],
    imageUrl: FOOD_IMAGES[5],
    featured: true,
  },
  {
    name: "Kendua Grill Stop",
    ownerName: "Tanvir Hasan",
    ownerPhone: "01710000007",
    ownerEmail: "tanvir@foodbela.demo",
    phone: "01710001007",
    zoneSlug: "kendua",
    distanceKm: 4,
    bearingDeg: 175,
    cuisines: ["Grill", "Chicken", "Shawarma"],
    imageUrl: FOOD_IMAGES[6],
  },
  {
    name: "Kendua Far Test Cafe",
    ownerName: "Imran Hossain",
    ownerPhone: "01710000008",
    ownerEmail: "imran@foodbela.demo",
    phone: "01710001008",
    zoneSlug: "kendua",
    distanceKm: 5.2,
    bearingDeg: 260,
    cuisines: ["Cafe", "Snacks", "Tea"],
    imageUrl: FOOD_IMAGES[7],
  },
  {
    name: "Mymensingh Biryani House",
    ownerName: "Sadia Noor",
    ownerPhone: "01710000009",
    ownerEmail: "sadia@foodbela.demo",
    phone: "01710001009",
    zoneSlug: "mymensingh-sadar",
    distanceKm: 2.5,
    bearingDeg: 80,
    cuisines: ["Biryani", "Kacchi", "Bangla"],
    imageUrl: FOOD_IMAGES[3],
  },
  {
    name: "Mymensingh Burger Lab",
    ownerName: "Jannat Akter",
    ownerPhone: "01710000010",
    ownerEmail: "jannat@foodbela.demo",
    phone: "01710001010",
    zoneSlug: "mymensingh-sadar",
    distanceKm: 5.8,
    bearingDeg: 140,
    cuisines: ["Burger", "Fast Food", "Fries"],
    imageUrl: FOOD_IMAGES[4],
  },
]

function toRadians(value: number) {
  return (value * Math.PI) / 180
}

function toDegrees(value: number) {
  return (value * 180) / Math.PI
}

function pointFromDistance(
  center: { latitude: number; longitude: number },
  distanceKm: number,
  bearingDeg: number,
) {
  const earthRadiusKm = 6371
  const angularDistance = distanceKm / earthRadiusKm
  const bearing = toRadians(bearingDeg)
  const latitude = toRadians(center.latitude)
  const longitude = toRadians(center.longitude)

  const destinationLatitude = Math.asin(
    Math.sin(latitude) * Math.cos(angularDistance) +
      Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing),
  )
  const destinationLongitude =
    longitude +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
      Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(destinationLatitude),
    )

  return {
    latitude: Number(toDegrees(destinationLatitude).toFixed(6)),
    longitude: Number(toDegrees(destinationLongitude).toFixed(6)),
  }
}

function point(longitude: number | null, latitude: number | null) {
  if (typeof latitude !== "number" || typeof longitude !== "number") return null
  return {
    type: "Point",
    coordinates: [longitude, latitude],
  }
}

async function upsertDistrictsAndZones() {
  const zoneBySlug = new Map<string, mongoose.Document & Record<string, any>>()

  for (const seed of zones) {
    const district = await ServiceDistrictModel.findOneAndUpdate(
      { slug: seed.districtSlug },
      {
        name: seed.districtName,
        slug: seed.districtSlug,
        status: "active",
        country: "Bangladesh",
        displayOrder: seed.districtSlug === "netrakona" ? 1 : 2,
        notes: "Foodbela area demo seed",
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )

    const zone = await ServiceZoneModel.findOneAndUpdate(
      { districtId: district._id, slug: seed.zoneSlug },
      {
        districtId: district._id,
        districtName: district.name,
        name: seed.zoneName,
        slug: seed.zoneSlug,
        status: "active",
        center: seed.center,
        radiusKm: seed.radiusKm,
        priority: seed.zoneSlug === "netrakona-sadar" ? 20 : 10,
        displayOrder: seed.zoneSlug === "netrakona-sadar" ? 1 : 2,
        delivery: {
          baseFeeTaka: seed.baseFeeTaka,
          distanceSurchargeEnabled: true,
          surchargeStartsAfterKm: 2,
          surchargeStepMeters: 500,
          surchargeAmountTaka: 8,
          maxRestaurantDistanceKm: seed.maxRestaurantDistanceKm,
          rainSurchargeEnabled: false,
          rainSurchargeTaka: 0,
        },
        dispatch: {
          autoAssignEnabled: true,
          dispatchMode: "fleet",
          algorithm: "nearest_eligible_balanced",
          assignmentTimeoutMinutes: 5,
          ownerAcceptanceTimeoutMinutes: 8,
          autoCancelUnacceptedOrdersEnabled: true,
          autoCancelAfterMinutes: 12,
          autoCancelNotifyBeforeMinutes: 3,
        },
        notes: "Area-scoped demo zone",
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )

    zoneBySlug.set(seed.zoneSlug, zone)
  }

  return zoneBySlug
}

async function upsertRestaurant(
  seed: DemoRestaurant,
  zoneBySlug: Map<string, mongoose.Document & Record<string, any>>,
  passwordHash: string,
) {
  const zone = zoneBySlug.get(seed.zoneSlug)
  if (!zone) throw new Error(`Missing zone for ${seed.zoneSlug}`)

  const owner = await OwnerModel.findOneAndUpdate(
    { phone: seed.ownerPhone },
    {
      fullName: seed.ownerName,
      phone: seed.ownerPhone,
      email: seed.ownerEmail,
      passwordHash,
      isPhoneVerified: true,
      status: "active",
      restaurantLifecycleStatus: "approved",
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )

  const location = pointFromDistance(
    {
      latitude: Number(zone.center.latitude),
      longitude: Number(zone.center.longitude),
    },
    seed.distanceKm,
    seed.bearingDeg,
  )
  const { latitude, longitude } = location
  const slug = slugify(seed.name)
  const serviceArea = buildServiceAreaSnapshot(zone, seed.distanceKm)

  const restaurant = await RestaurantModel.findOneAndUpdate(
    { ownerId: owner._id, slug },
    {
      ownerId: owner._id,
      name: seed.name,
      slug,
      description: `${seed.name} demo restaurant for ${serviceArea.zoneName}, about ${seed.distanceKm} km from the zone center.`,
      preparationTimeMinutes: 25,
      cuisineTypes: seed.cuisines,
      tags: seed.cuisines,
      logo: { url: seed.imageUrl, publicId: `demo/${slug}/logo` },
      coverImage: { url: seed.imageUrl, publicId: `demo/${slug}/cover` },
      contact: {
        phone: seed.phone,
        email: seed.ownerEmail,
      },
      address: {
        address: `${seed.name} Road, ${serviceArea.zoneName}`,
        city: serviceArea.districtName,
      },
      location: { latitude, longitude },
      locationPoint: point(longitude, latitude),
      serviceArea,
      runtime: {
        isOnline: true,
        isVisible: true,
        currentOperationalStatus: "open",
      },
      discovery: {
        isFeatured: seed.featured === true,
        featuredSortOrder: seed.featured ? 1 : null,
        collectionIds: [],
      },
      commercial: {
        commissionRate: 15,
        commissionHistory: [
          {
            previousRate: null,
            rate: 15,
            changedByAdminId: "area-demo-seed",
            note: "Area demo seed",
            createdAt: new Date(),
          },
        ],
      },
      profileCompletion: {
        percentage: 90,
        completedWeight: 90,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )

  owner.activeRestaurantId = restaurant._id
  await owner.save()

  return { owner, restaurant, serviceArea }
}

async function upsertMenu(restaurant: mongoose.Document & Record<string, any>) {
  const restaurantImageUrl = String(
    restaurant.coverImage?.url || restaurant.logo?.url || FOOD_IMAGES[0],
  )
  const categorySeeds = [
    { name: "Rice Meals", item: "Rui Fish Rice Plate", price: 240 },
    { name: "Snacks", item: "Chicken Shawarma", price: 160 },
  ]

  const items: Array<mongoose.Document & Record<string, any>> = []
  for (let index = 0; index < categorySeeds.length; index += 1) {
    const seed = categorySeeds[index]
    const category = await CategoryModel.findOneAndUpdate(
      { restaurantId: restaurant._id, slug: slugify(seed.name) },
      {
        restaurantId: restaurant._id,
        name: seed.name,
        slug: slugify(seed.name),
        description: "",
        status: "active",
        displayOrder: index + 1,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )

    const item = await MenuItemModel.findOneAndUpdate(
      { restaurantId: restaurant._id, slug: slugify(seed.item) },
      {
        restaurantId: restaurant._id,
        categoryId: category._id,
        name: seed.item,
        slug: slugify(seed.item),
        description: "Area demo menu item",
        images: [{ url: restaurantImageUrl, publicId: `demo/items/${slugify(seed.item)}` }],
        status: "active",
        availability: "available",
        kind: "simple",
        basePrice: seed.price,
        isPopular: index === 0,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
    items.push(item)
  }

  return items
}

async function upsertRider(
  zone: mongoose.Document & Record<string, any>,
  passwordHash: string,
  index: number,
) {
  const serviceArea = buildServiceAreaSnapshot(zone, null)
  return RiderModel.findOneAndUpdate(
    { phone: `0181000000${index + 1}` },
    {
      fullName: `${serviceArea.zoneName} Rider ${index + 1}`,
      phone: `0181000000${index + 1}`,
      passwordHash,
      isPhoneVerified: true,
      status: "active",
      isAvailableForAssignments: true,
      vehicleType: "cycle",
      lastKnownLocation: {
        latitude: serviceArea.center.latitude + 0.003,
        longitude: serviceArea.center.longitude + 0.003,
        heading: null,
        accuracyMeters: 20,
        speedKmph: 0,
        updatedAt: new Date(),
      },
      serviceArea: {
        primaryZoneId: serviceArea.zoneId,
        primaryZoneName: serviceArea.zoneName,
        assignedZoneIds: [serviceArea.zoneId],
        assignedZoneNames: [serviceArea.zoneName],
        districtIds: [serviceArea.districtId],
        districtNames: [serviceArea.districtName],
      },
      verification: {
        status: "verified",
        reviewedByAdminId: "area-demo-seed",
        reviewedAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
}

async function upsertCustomer(
  zone: mongoose.Document & Record<string, any>,
  passwordHash: string,
  index: number,
) {
  const serviceArea = buildServiceAreaSnapshot(zone, null)
  const latitude = serviceArea.center.latitude
  const longitude = serviceArea.center.longitude
  return CustomerModel.findOneAndUpdate(
    { phone: `0191000000${index + 1}` },
    {
      fullName: `${serviceArea.zoneName} Customer ${index + 1}`,
      phone: `0191000000${index + 1}`,
      email: `customer${index + 1}@foodbela.demo`,
      passwordHash,
      authProviders: ["phone"],
      status: "active",
      referralCode: `FBD${index + 1}000`,
      savedLocations: [
        {
          label: "Home",
          address: `${serviceArea.zoneName} demo address`,
          addressDetails: "Seeded location",
          latitude,
          longitude,
          source: "saved",
          isDefault: true,
          serviceArea,
          lastUsedAt: new Date(),
        },
      ],
      notifications: [
        {
          type: "promotion",
          title: `${serviceArea.zoneName} demo offer`,
          description: "Area scoped notification seed",
          path: "/offers",
          contentType: "text",
          zoneId: serviceArea.zoneId,
          districtId: serviceArea.districtId,
          isRead: false,
          createdAt: new Date(),
        },
      ],
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
}

async function upsertCollectionsAndVouchers(
  adminId: string,
  seededRestaurants: Array<{
    restaurant: mongoose.Document & Record<string, any>
    serviceArea: Record<string, any>
  }>,
  netrakonaCustomer: mongoose.Document & Record<string, any>,
) {
  const featuredRestaurants = seededRestaurants
    .filter((entry) => entry.restaurant.discovery?.isFeatured)
    .map((entry) => entry.restaurant._id)

  await RestaurantCollectionModel.findOneAndUpdate(
    { key: "featured_restaurants" },
    {
      key: "featured_restaurants",
      name: "Featured Restaurants",
      type: "static",
      restaurantIds: featuredRestaurants,
      sortOrders: featuredRestaurants.map((restaurantId, index) => ({
        restaurantId,
        order: index + 1,
      })),
      isActive: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
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
      isActive: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )

  const now = new Date()
  const endsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const netrakonaRestaurants = seededRestaurants.filter(
    (entry) => entry.serviceArea.zoneSlug === "netrakona-sadar",
  )
  const kenduaRestaurants = seededRestaurants.filter(
    (entry) => entry.serviceArea.zoneSlug === "kendua",
  )
  const mymensinghRestaurants = seededRestaurants.filter(
    (entry) => entry.serviceArea.zoneSlug === "mymensingh-sadar",
  )
  await VoucherModel.findOneAndUpdate(
    { restaurantId: null, code: "NETRA15" },
    {
      restaurantId: null,
      scopeType: "selected_restaurants",
      selectedRestaurantIds: netrakonaRestaurants.map((entry) => entry.restaurant._id),
      audienceType: "all_users",
      createdByType: "admin",
      createdById: adminId,
      fundedBy: "platform",
      ownerSharePercent: 0,
      platformSharePercent: 100,
      stackingRule: "exclusive",
      priority: 10,
      mode: "coupon",
      type: "percentage",
      name: "Netrakona Sadar 15% off",
      code: "NETRA15",
      discountValue: 15,
      maxDiscountAmount: 80,
      minimumOrderAmount: 250,
      maxTotalUses: 500,
      maxUsesPerUser: 1,
      allowRepeatUsage: false,
      status: "Active",
      display: {
        showOnHome: true,
        showInOfferStrip: true,
        placement: "offers_row",
        variant: "chip",
        position: 1,
        title: "15% off in Netrakona",
        subtitle: "Use NETRA15",
        ctaLabel: "Order now",
        ctaPath: "/offers",
      },
      startsAt: now,
      endsAt,
      archivedAt: null,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )

  await VoucherModel.findOneAndUpdate(
    { restaurantId: null, code: "KENDUA20" },
    {
      restaurantId: null,
      scopeType: "selected_restaurants",
      selectedRestaurantIds: kenduaRestaurants.map((entry) => entry.restaurant._id),
      audienceType: "all_users",
      createdByType: "admin",
      createdById: adminId,
      fundedBy: "platform",
      ownerSharePercent: 0,
      platformSharePercent: 100,
      stackingRule: "exclusive",
      priority: 9,
      mode: "coupon",
      type: "percentage",
      name: "Kendua 20% off",
      code: "KENDUA20",
      discountValue: 20,
      maxDiscountAmount: 90,
      minimumOrderAmount: 280,
      maxTotalUses: 500,
      maxUsesPerUser: 1,
      allowRepeatUsage: false,
      status: "Active",
      display: {
        showOnHome: true,
        showInOfferStrip: true,
        placement: "offers_row",
        variant: "chip",
        position: 2,
        title: "20% off in Kendua",
        subtitle: "Use KENDUA20",
        ctaLabel: "Order now",
        ctaPath: "/offers",
      },
      startsAt: now,
      endsAt,
      archivedAt: null,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )

  await VoucherModel.findOneAndUpdate(
    { restaurantId: null, code: "MYMEN50" },
    {
      restaurantId: null,
      scopeType: "selected_restaurants",
      selectedRestaurantIds: mymensinghRestaurants.map((entry) => entry.restaurant._id),
      audienceType: "all_users",
      createdByType: "admin",
      createdById: adminId,
      fundedBy: "platform",
      ownerSharePercent: 0,
      platformSharePercent: 100,
      stackingRule: "exclusive",
      priority: 8,
      mode: "coupon",
      type: "flat",
      name: "Mymensingh Tk 50 off",
      code: "MYMEN50",
      discountValue: 50,
      maxDiscountAmount: 50,
      minimumOrderAmount: 250,
      maxTotalUses: 500,
      maxUsesPerUser: 1,
      allowRepeatUsage: false,
      status: "Active",
      display: {
        showOnHome: true,
        showInOfferStrip: true,
        placement: "offers_row",
        variant: "chip",
        position: 3,
        title: "Tk 50 off in Mymensingh",
        subtitle: "Use MYMEN50",
        ctaLabel: "Order now",
        ctaPath: "/offers",
      },
      startsAt: now,
      endsAt,
      archivedAt: null,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )

  await VoucherModel.findOneAndUpdate(
    { restaurantId: null, code: "MYOFFER" },
    {
      restaurantId: null,
      scopeType: "selected_restaurants",
      selectedRestaurantIds: netrakonaRestaurants.map((entry) => entry.restaurant._id),
      audienceType: "selected_users",
      selectedCustomerIds: [netrakonaCustomer._id],
      createdByType: "admin",
      createdById: adminId,
      fundedBy: "platform",
      ownerSharePercent: 0,
      platformSharePercent: 100,
      stackingRule: "exclusive",
      priority: 20,
      mode: "coupon",
      type: "flat",
      name: "Personal demo offer",
      code: "MYOFFER",
      discountValue: 70,
      maxDiscountAmount: 70,
      minimumOrderAmount: 300,
      maxTotalUses: 1,
      maxUsesPerUser: 1,
      allowRepeatUsage: false,
      status: "Active",
      display: {
        showOnHome: false,
        showInOfferStrip: false,
        placement: "offers_row",
        variant: "chip",
        position: 2,
        title: "Your personal Tk 70 off",
        subtitle: "Use MYOFFER",
        ctaLabel: "View offer",
        ctaPath: "/offers",
      },
      startsAt: now,
      endsAt,
      archivedAt: null,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
}

async function seedAreaDemo() {
  await connectDatabase()
  const [admin, passwordHash] = await Promise.all([
    bootstrapAdminIfMissing(),
    hashPassword(DEMO_PASSWORD),
  ])
  const zoneBySlug = await upsertDistrictsAndZones()

  const seededRestaurants = []
  for (const restaurantSeed of restaurants) {
    const seeded = await upsertRestaurant(restaurantSeed, zoneBySlug, passwordHash)
    await upsertMenu(seeded.restaurant)
    seededRestaurants.push(seeded)
  }

  const seededCustomers = []
  const seededZones = Array.from(zoneBySlug.values())
  for (let zoneIndex = 0; zoneIndex < seededZones.length; zoneIndex += 1) {
    for (let riderIndex = 0; riderIndex < 3; riderIndex += 1) {
      await upsertRider(
        seededZones[zoneIndex],
        passwordHash,
        zoneIndex * 3 + riderIndex,
      )
    }
    seededCustomers.push(await upsertCustomer(seededZones[zoneIndex], passwordHash, zoneIndex))
  }

  const netrakonaCustomer =
    seededCustomers.find((customer) =>
      customer.savedLocations?.some(
        (location: Record<string, any>) =>
          location.serviceArea?.zoneSlug === "netrakona-sadar",
      ),
    ) ?? seededCustomers[0]
  await upsertCollectionsAndVouchers(
    String(admin._id),
    seededRestaurants,
    netrakonaCustomer,
  )

  logger.info(
    {
      zones: zones.map((zone) => zone.zoneSlug),
      restaurants: restaurants.map((restaurant) => ({
        name: restaurant.name,
        zone: restaurant.zoneSlug,
        distanceKm: restaurant.distanceKm,
      })),
      demoPassword: DEMO_PASSWORD,
    },
    "Area demo seed completed",
  )
}

seedAreaDemo()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error(error, "Area demo seed failed")
    process.exit(1)
  })
