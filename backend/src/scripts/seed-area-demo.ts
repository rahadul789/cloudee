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

type MenuCategorySeed = {
  name: string
  description: string
  items: Array<{
    name: string
    price: number
    description: string
  }>
}

const zones: DemoZone[] = [
  {
    districtName: "Netrakona",
    districtSlug: "netrakona",
    zoneName: "Netrakona Sadar",
    zoneSlug: "netrakona-sadar",
    center: { latitude: 24.875, longitude: 90.7333 },
    radiusKm: 8,
    maxRestaurantDistanceKm: 5,
    baseFeeTaka: 45,
  },
  {
    districtName: "Netrakona",
    districtSlug: "netrakona",
    zoneName: "Kendua",
    zoneSlug: "kendua",
    center: { latitude: 24.65, longitude: 90.8417 },
    radiusKm: 7,
    maxRestaurantDistanceKm: 4.5,
    baseFeeTaka: 50,
  },
  {
    districtName: "Dinajpur",
    districtSlug: "dinajpur",
    zoneName: "Dinajpur Sadar",
    zoneSlug: "dinajpur-sadar",
    center: { latitude: 25.6333, longitude: 88.65 },
    radiusKm: 7,
    maxRestaurantDistanceKm: 5,
    baseFeeTaka: 55,
  },
  {
    districtName: "Dhaka",
    districtSlug: "dhaka",
    zoneName: "Khilgaon",
    zoneSlug: "khilgaon",
    center: { latitude: 23.7508, longitude: 90.4264 },
    radiusKm: 5,
    maxRestaurantDistanceKm: 4,
    baseFeeTaka: 60,
  },
  {
    districtName: "Kushtia",
    districtSlug: "kushtia",
    zoneName: "Kushtia Sadar",
    zoneSlug: "kushtia-sadar",
    center: { latitude: 23.7222, longitude: 89.1519 },
    radiusKm: 7,
    maxRestaurantDistanceKm: 4.5,
    baseFeeTaka: 55,
  },
]

const NETRAKONA_SADAR_RESTAURANT_NAMES = [
  "Haor Bangla Kitchen",
  "Pink Grill Corner",
  "Sadar Porota Bari",
  "Netrakona Kacchi House",
  "Station Road Biriyani",
  "Mokterpara Fast Food",
  "Netrakona Grill Hub",
  "Rajur Bazar Rice Bowl",
  "Thana Road Cafe",
  "Datter Bazar Bhoj",
  "Shibbari Snacks",
  "College Road Kitchen",
  "Muktarpara Pizza House",
  "Seven Star Chicken",
  "Meghna Fish Meals",
  "Bhati Bangla Dine",
  "Town Hall Burger",
  "Green Chili Restaurant",
  "Nawabi Kacchi",
  "Sadar Thai & Chinese",
  "Rupali Hotel & Restaurant",
  "Netra Food Court",
  "Boro Bazar Fuchka House",
  "Chef Bari Express",
  "Purobi Sweets & Snacks",
  "Pitha Porota Palace",
  "Kebab Junction Sadar",
  "Family Feast Netrakona",
  "Chicken Republic Sadar",
  "Pasta & Pizza Corner",
  "River View Restaurant",
  "Aroma Chinese Sadar",
  "The Lunch Box",
  "Golden Spoon Cafe",
  "Kushiara Kitchen",
]

const NETRAKONA_OWNER_NAMES = [
  "Arif Hasan",
  "Rafiq Ahmed",
  "Nayeem Islam",
  "Mahin Chowdhury",
  "Sabbir Rahman",
  "Mehedi Karim",
  "Tanvir Hasan",
  "Imran Hossain",
  "Sadia Noor",
  "Jannat Akter",
  "Nusrat Jahan",
  "Fahim Rahman",
  "Tania Sultana",
  "Rumana Akter",
  "Shakil Ahmed",
  "Nasir Uddin",
  "Rahat Islam",
  "Maliha Noor",
]

const NETRAKONA_CUISINE_SETS = [
  ["Bangla", "Rice", "Fish"],
  ["Grill", "Shawarma", "Fast Food"],
  ["Porota", "Breakfast", "Snacks"],
  ["Kacchi", "Biryani", "Bangla"],
  ["Burger", "Fried Chicken", "Fast Food"],
  ["Chinese", "Thai Soup", "Noodles"],
  ["Sweets", "Dessert", "Snacks"],
  ["Cafe", "Tea", "Sandwich"],
  ["BBQ", "Kebab", "Chicken"],
  ["Family Meals", "Rice", "Curry"],
]

function makeNetrakonaSadarRestaurants(): DemoRestaurant[] {
  return NETRAKONA_SADAR_RESTAURANT_NAMES.map((name, index) => {
    const paddedIndex = String(index + 1).padStart(6, "0")

    return {
      name,
      ownerName: NETRAKONA_OWNER_NAMES[index % NETRAKONA_OWNER_NAMES.length],
      ownerPhone: `01720${paddedIndex}`,
      ownerEmail: `netra.owner${String(index + 1).padStart(2, "0")}@foodbela.demo`,
      phone: `01721${paddedIndex}`,
      zoneSlug: "netrakona-sadar",
      distanceKm: Number((1.2 + (index % 18) * 0.17 + Math.floor(index / 18) * 0.12).toFixed(2)),
      bearingDeg: (25 + index * 47) % 360,
      cuisines: NETRAKONA_CUISINE_SETS[index % NETRAKONA_CUISINE_SETS.length],
      imageUrl: FOOD_IMAGES[index % FOOD_IMAGES.length],
      featured: index < 8,
    }
  })
}

const restaurants: DemoRestaurant[] = [
  ...makeNetrakonaSadarRestaurants(),
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
    name: "Dinajpur Biryani House",
    ownerName: "Sadia Noor",
    ownerPhone: "01710000009",
    ownerEmail: "sadia@foodbela.demo",
    phone: "01710001009",
    zoneSlug: "dinajpur-sadar",
    distanceKm: 2.5,
    bearingDeg: 80,
    cuisines: ["Biryani", "Kacchi", "Bangla"],
    imageUrl: FOOD_IMAGES[3],
    featured: true,
  },
  {
    name: "Dinajpur Burger Lab",
    ownerName: "Jannat Akter",
    ownerPhone: "01710000010",
    ownerEmail: "jannat@foodbela.demo",
    phone: "01710001010",
    zoneSlug: "dinajpur-sadar",
    distanceKm: 5.8,
    bearingDeg: 140,
    cuisines: ["Burger", "Fast Food", "Fries"],
    imageUrl: FOOD_IMAGES[4],
  },
  {
    name: "Khilgaon Kacchi Point",
    ownerName: "Nusrat Jahan",
    ownerPhone: "01710000011",
    ownerEmail: "nusrat@foodbela.demo",
    phone: "01710001011",
    zoneSlug: "khilgaon",
    distanceKm: 1.8,
    bearingDeg: 35,
    cuisines: ["Kacchi", "Biryani", "Bangla"],
    imageUrl: FOOD_IMAGES[1],
    featured: true,
  },
  {
    name: "Khilgaon Grill Hub",
    ownerName: "Fahim Rahman",
    ownerPhone: "01710000012",
    ownerEmail: "fahim@foodbela.demo",
    phone: "01710001012",
    zoneSlug: "khilgaon",
    distanceKm: 3.6,
    bearingDeg: 210,
    cuisines: ["Grill", "Chicken", "Fast Food"],
    imageUrl: FOOD_IMAGES[6],
  },
  {
    name: "Kushtia Lalon Kitchen",
    ownerName: "Aminul Islam",
    ownerPhone: "01730000001",
    ownerEmail: "kushtia.owner01@foodbela.demo",
    phone: "01731000001",
    zoneSlug: "kushtia-sadar",
    distanceKm: 1.2,
    bearingDeg: 20,
    cuisines: ["Bangla", "Rice", "Fish"],
    imageUrl: FOOD_IMAGES[0],
    featured: true,
  },
  {
    name: "Gorai Grill House",
    ownerName: "Hasan Mahmud",
    ownerPhone: "01730000002",
    ownerEmail: "kushtia.owner02@foodbela.demo",
    phone: "01731000002",
    zoneSlug: "kushtia-sadar",
    distanceKm: 1.8,
    bearingDeg: 75,
    cuisines: ["Grill", "BBQ", "Chicken"],
    imageUrl: FOOD_IMAGES[1],
    featured: true,
  },
  {
    name: "Kushtia Kacchi & Tehari",
    ownerName: "Mizanur Rahman",
    ownerPhone: "01730000003",
    ownerEmail: "kushtia.owner03@foodbela.demo",
    phone: "01731000003",
    zoneSlug: "kushtia-sadar",
    distanceKm: 2.1,
    bearingDeg: 130,
    cuisines: ["Kacchi", "Biryani", "Tehari"],
    imageUrl: FOOD_IMAGES[3],
  },
  {
    name: "Court Station Cafe",
    ownerName: "Farhana Akter",
    ownerPhone: "01730000004",
    ownerEmail: "kushtia.owner04@foodbela.demo",
    phone: "01731000004",
    zoneSlug: "kushtia-sadar",
    distanceKm: 2.4,
    bearingDeg: 185,
    cuisines: ["Cafe", "Snacks", "Sandwich"],
    imageUrl: FOOD_IMAGES[7],
  },
  {
    name: "Mozompur Food Corner",
    ownerName: "Rakib Hossain",
    ownerPhone: "01730000005",
    ownerEmail: "kushtia.owner05@foodbela.demo",
    phone: "01731000005",
    zoneSlug: "kushtia-sadar",
    distanceKm: 2.9,
    bearingDeg: 235,
    cuisines: ["Fast Food", "Burger", "Fries"],
    imageUrl: FOOD_IMAGES[4],
  },
  {
    name: "Milpara Chinese",
    ownerName: "Sharmin Sultana",
    ownerPhone: "01730000006",
    ownerEmail: "kushtia.owner06@foodbela.demo",
    phone: "01731000006",
    zoneSlug: "kushtia-sadar",
    distanceKm: 3.2,
    bearingDeg: 290,
    cuisines: ["Chinese", "Noodles", "Thai Soup"],
    imageUrl: FOOD_IMAGES[6],
  },
  {
    name: "Lalon Shah Dining",
    ownerName: "Shahriar Kabir",
    ownerPhone: "01730000007",
    ownerEmail: "kushtia.owner07@foodbela.demo",
    phone: "01731000007",
    zoneSlug: "kushtia-sadar",
    distanceKm: 3.7,
    bearingDeg: 330,
    cuisines: ["Family Meals", "Bangla", "Curry"],
    imageUrl: FOOD_IMAGES[2],
  },
  {
    name: "Kushtia Sweets & Snacks",
    ownerName: "Sabina Yasmin",
    ownerPhone: "01730000008",
    ownerEmail: "kushtia.owner08@foodbela.demo",
    phone: "01731000008",
    zoneSlug: "kushtia-sadar",
    distanceKm: 4.1,
    bearingDeg: 255,
    cuisines: ["Sweets", "Dessert", "Snacks"],
    imageUrl: FOOD_IMAGES[5],
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

function districtDisplayOrder(slug: string) {
  if (slug === "netrakona") return 1
  if (slug === "dinajpur") return 2
  if (slug === "dhaka") return 3
  if (slug === "kushtia") return 4
  return 99
}

function zoneDisplayOrder(slug: string) {
  if (slug === "netrakona-sadar") return 1
  if (slug === "kendua") return 2
  if (slug === "dinajpur-sadar") return 3
  if (slug === "khilgaon") return 4
  if (slug === "kushtia-sadar") return 5
  return 99
}

async function cleanupRetiredDemoData() {
  const now = new Date()
  await Promise.all([
    ServiceZoneModel.updateMany(
      { slug: { $in: ["mymensingh-sadar"] }, notes: /demo/i },
      { $set: { status: "archived", notes: "Archived by area demo seed replacement" } },
    ),
    ServiceDistrictModel.updateMany(
      { slug: { $in: ["mymensingh"] }, notes: /demo/i },
      { $set: { status: "archived", notes: "Archived by area demo seed replacement" } },
    ),
    RestaurantModel.updateMany(
      {
        slug: { $in: ["mymensingh-biryani-house", "mymensingh-burger-lab"] },
        "commercial.commissionHistory.changedByAdminId": "area-demo-seed",
      },
      {
        $set: {
          "runtime.isOnline": false,
          "runtime.isVisible": false,
          "runtime.currentOperationalStatus": "closed",
        },
      },
    ),
    RiderModel.updateMany(
      {
        phone: /^0181000000\d{2}$/,
        "verification.reviewedByAdminId": "area-demo-seed",
      },
      {
        $set: {
          status: "inactive",
          isAvailableForAssignments: false,
        },
      },
    ),
    VoucherModel.updateMany(
      { code: { $in: ["MYMEN50"] }, createdByType: "admin" },
      { $set: { status: "Archived", archivedAt: now } },
    ),
  ])
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
        displayOrder: districtDisplayOrder(seed.districtSlug),
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
        centerPoint: point(seed.center.longitude, seed.center.latitude),
        radiusKm: seed.radiusKm,
        priority: seed.zoneSlug === "netrakona-sadar" ? 20 : 10,
        displayOrder: zoneDisplayOrder(seed.zoneSlug),
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
        city: serviceArea.zoneName,
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

const DEMO_MENU_CATEGORIES: MenuCategorySeed[] = [
  {
    name: "Rice Meals",
    description: "Fresh rice plates with local curry and bhorta sides.",
    items: [
      {
        name: "Rui Fish Rice Plate",
        price: 240,
        description: "Steamed rice with rui fish curry, bhorta, and salad.",
      },
      {
        name: "Chicken Curry Rice Plate",
        price: 220,
        description: "Home style chicken curry served with rice and salad.",
      },
      {
        name: "Beef Bhuna Rice Bowl",
        price: 280,
        description: "Slow cooked beef bhuna with steamed rice.",
      },
      {
        name: "Egg Bhorta Rice Meal",
        price: 160,
        description: "Rice with egg bhorta, dal, and seasonal vegetable.",
      },
      {
        name: "Mixed Vegetable Khichuri",
        price: 190,
        description: "Comforting khichuri cooked with mixed vegetables.",
      },
    ],
  },
  {
    name: "Biryani & Kacchi",
    description: "Aromatic biryani, kacchi, and festive rice specials.",
    items: [
      {
        name: "Chicken Biryani",
        price: 230,
        description: "Fragrant rice with tender chicken and potato.",
      },
      {
        name: "Beef Tehari",
        price: 260,
        description: "Classic beef tehari cooked with warm spices.",
      },
      {
        name: "Mutton Kacchi",
        price: 360,
        description: "Rich mutton kacchi with potato and salad.",
      },
      {
        name: "Morog Polao",
        price: 280,
        description: "Traditional morog polao with roast gravy.",
      },
      {
        name: "Family Biryani Box",
        price: 620,
        description: "Shareable biryani box for two to three people.",
      },
    ],
  },
  {
    name: "Grill & BBQ",
    description: "Grilled chicken, kebab, and smoky BBQ favorites.",
    items: [
      {
        name: "BBQ Chicken Quarter",
        price: 180,
        description: "Smoky BBQ chicken quarter with sauce.",
      },
      {
        name: "Grilled Chicken Half",
        price: 320,
        description: "Half grilled chicken with house marinade.",
      },
      {
        name: "Chicken Chap",
        price: 210,
        description: "Spiced chicken chap served with salad.",
      },
      {
        name: "Beef Seekh Kebab",
        price: 240,
        description: "Juicy beef seekh kebab with mint sauce.",
      },
      {
        name: "Garlic Naan with Grill",
        price: 170,
        description: "Soft garlic naan paired with grilled chicken pieces.",
      },
    ],
  },
  {
    name: "Fast Food",
    description: "Quick burgers, shawarma, fries, and snacks.",
    items: [
      {
        name: "Chicken Shawarma",
        price: 160,
        description: "Chicken shawarma wrapped with fresh salad and sauce.",
      },
      {
        name: "Crispy Chicken Burger",
        price: 190,
        description: "Crispy chicken patty with cheese and mayo.",
      },
      {
        name: "Beef Cheese Burger",
        price: 240,
        description: "Beef patty with cheese, onion, and house sauce.",
      },
      {
        name: "Loaded French Fries",
        price: 150,
        description: "Fries topped with chicken, cheese, and sauce.",
      },
      {
        name: "Chicken Sandwich",
        price: 170,
        description: "Grilled chicken sandwich with creamy sauce.",
      },
    ],
  },
  {
    name: "Chinese & Noodles",
    description: "Fried rice, noodles, soup, and Chinese-style sides.",
    items: [
      {
        name: "Chicken Chow Mein",
        price: 220,
        description: "Stir-fried noodles with chicken and vegetables.",
      },
      {
        name: "Thai Soup",
        price: 160,
        description: "Hot and tangy Thai soup with chicken.",
      },
      {
        name: "Fried Rice with Chicken",
        price: 250,
        description: "Egg fried rice served with chicken sides.",
      },
      {
        name: "Chili Chicken",
        price: 280,
        description: "Saucy chili chicken with peppers and onion.",
      },
      {
        name: "Wonton",
        price: 140,
        description: "Crispy wonton served with sweet chili dip.",
      },
    ],
  },
  {
    name: "Drinks & Desserts",
    description: "Cooling drinks and sweet endings.",
    items: [
      {
        name: "Borhani",
        price: 80,
        description: "Traditional spiced yogurt drink.",
      },
      {
        name: "Lemon Mint",
        price: 90,
        description: "Fresh lemon mint cooler.",
      },
      {
        name: "Firni Cup",
        price: 70,
        description: "Creamy firni served chilled.",
      },
      {
        name: "Sweet Yogurt",
        price: 90,
        description: "Classic sweet yogurt cup.",
      },
      {
        name: "Chocolate Milkshake",
        price: 150,
        description: "Thick chocolate milkshake.",
      },
    ],
  },
]

function buildMenuSeeds(restaurantName: string) {
  return DEMO_MENU_CATEGORIES.flatMap((category, categoryIndex) =>
    category.items.map((item, itemIndex) => ({
      categoryName: category.name,
      name: item.name,
      description: `${item.description} Prepared fresh by ${restaurantName}.`,
      price: item.price + ((restaurantName.length + categoryIndex + itemIndex) % 4) * 10,
    })),
  )
}

async function upsertMenu(restaurant: mongoose.Document & Record<string, any>) {
  const restaurantName = String(restaurant.name || "Restaurant")
  const restaurantSlug = slugify(restaurantName)
  const restaurantImageUrl = String(
    restaurant.coverImage?.url || restaurant.logo?.url || FOOD_IMAGES[0],
  )
  const menuSeeds = buildMenuSeeds(restaurantName)
  const categorySlugs = DEMO_MENU_CATEGORIES.map((category) => slugify(category.name))
  const itemSlugs = menuSeeds.map((seed) => slugify(seed.name))

  await CategoryModel.updateMany(
    { restaurantId: restaurant._id, slug: { $nin: categorySlugs } },
    { $set: { status: "archived" } },
  )
  await MenuItemModel.updateMany(
    { restaurantId: restaurant._id, slug: { $nin: itemSlugs } },
    { $set: { status: "archived", availability: "unavailable" } },
  )

  const categoryByName = new Map<string, mongoose.Document & Record<string, any>>()
  for (let index = 0; index < DEMO_MENU_CATEGORIES.length; index += 1) {
    const seed = DEMO_MENU_CATEGORIES[index]
    const category = await CategoryModel.findOneAndUpdate(
      { restaurantId: restaurant._id, slug: slugify(seed.name) },
      {
        restaurantId: restaurant._id,
        name: seed.name,
        slug: slugify(seed.name),
        description: seed.description,
        status: "active",
        displayOrder: index + 1,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
    categoryByName.set(seed.name, category)
  }

  const items: Array<mongoose.Document & Record<string, any>> = []
  for (let index = 0; index < menuSeeds.length; index += 1) {
    const seed = menuSeeds[index]
    const category = categoryByName.get(seed.categoryName)
    if (!category) {
      throw new Error(`Missing menu category ${seed.categoryName} for ${restaurantName}`)
    }

    const item = await MenuItemModel.findOneAndUpdate(
      { restaurantId: restaurant._id, slug: slugify(seed.name) },
      {
        restaurantId: restaurant._id,
        categoryId: category._id,
        name: seed.name,
        slug: slugify(seed.name),
        description: seed.description,
        images: [
          {
            url: restaurantImageUrl,
            publicId: `demo/items/${restaurantSlug}/${slugify(seed.name)}`,
          },
        ],
        status: "active",
        availability: "available",
        kind: "simple",
        basePrice: seed.price,
        isPopular: index < 6,
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
  const riderPhone = `01810${String(index + 1).padStart(6, "0")}`
  const riderNumber = (index % 3) + 1
  return RiderModel.findOneAndUpdate(
    { phone: riderPhone },
    {
      fullName: `${serviceArea.zoneName} Rider ${riderNumber}`,
      phone: riderPhone,
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
  const dinajpurRestaurants = seededRestaurants.filter(
    (entry) => entry.serviceArea.zoneSlug === "dinajpur-sadar",
  )
  const khilgaonRestaurants = seededRestaurants.filter(
    (entry) => entry.serviceArea.zoneSlug === "khilgaon",
  )
  const kushtiaRestaurants = seededRestaurants.filter(
    (entry) => entry.serviceArea.zoneSlug === "kushtia-sadar",
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
    { restaurantId: null, code: "DINA50" },
    {
      restaurantId: null,
      scopeType: "selected_restaurants",
      selectedRestaurantIds: dinajpurRestaurants.map((entry) => entry.restaurant._id),
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
      name: "Dinajpur Tk 50 off",
      code: "DINA50",
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
        title: "Tk 50 off in Dinajpur",
        subtitle: "Use DINA50",
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
    { restaurantId: null, code: "KHILGAON60" },
    {
      restaurantId: null,
      scopeType: "selected_restaurants",
      selectedRestaurantIds: khilgaonRestaurants.map((entry) => entry.restaurant._id),
      audienceType: "all_users",
      createdByType: "admin",
      createdById: adminId,
      fundedBy: "platform",
      ownerSharePercent: 0,
      platformSharePercent: 100,
      stackingRule: "exclusive",
      priority: 7,
      mode: "coupon",
      type: "flat",
      name: "Khilgaon Tk 60 off",
      code: "KHILGAON60",
      discountValue: 60,
      maxDiscountAmount: 60,
      minimumOrderAmount: 300,
      maxTotalUses: 500,
      maxUsesPerUser: 1,
      allowRepeatUsage: false,
      status: "Active",
      display: {
        showOnHome: true,
        showInOfferStrip: true,
        placement: "offers_row",
        variant: "chip",
        position: 4,
        title: "Tk 60 off in Khilgaon",
        subtitle: "Use KHILGAON60",
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
    { restaurantId: null, code: "KUSHTIA40" },
    {
      restaurantId: null,
      scopeType: "selected_restaurants",
      selectedRestaurantIds: kushtiaRestaurants.map((entry) => entry.restaurant._id),
      audienceType: "all_users",
      createdByType: "admin",
      createdById: adminId,
      fundedBy: "platform",
      ownerSharePercent: 0,
      platformSharePercent: 100,
      stackingRule: "exclusive",
      priority: 6,
      mode: "coupon",
      type: "flat",
      name: "Kushtia Tk 40 off",
      code: "KUSHTIA40",
      discountValue: 40,
      maxDiscountAmount: 40,
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
        position: 5,
        title: "Tk 40 off in Kushtia",
        subtitle: "Use KUSHTIA40",
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
  await cleanupRetiredDemoData()
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
