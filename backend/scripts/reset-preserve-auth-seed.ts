import mongoose, { type ClientSession } from "mongoose"

import { slugify } from "../src/common/utils/slugify"
import { env } from "../src/config/env"
import {
  AdminModel,
  AdminRefreshTokenSessionModel,
} from "../src/modules/admin/admin.model"
import {
  OpeningHoursModel,
  OwnerModel,
  PayoutMethodModel,
  RestaurantModel,
} from "../src/modules/auth/auth.model"
import { hashPassword } from "../src/modules/auth/auth.utils"
import {
  CustomerModel,
  CustomerRefreshTokenSessionModel,
  RestaurantCollectionModel,
} from "../src/modules/customer/customer.model"
import {
  CategoryModel,
  MenuItemModel,
} from "../src/modules/owner/operational.model"
import {
  ServiceDistrictModel,
  ServiceZoneModel,
} from "../src/modules/service-area/service-area.model"

const CENTER = { latitude: 24.87789, longitude: 90.731036 }
const ZONE_RADIUS_KM = 3
const LARGE_MENU_ITEM_COUNT = 80
const STANDARD_MENU_ITEM_COUNT = 40
const ADMIN_EMAIL =
  process.env.PRESERVE_SEED_ADMIN_EMAIL?.trim() ||
  "maerdollsragilisticdocs25968@vela.com"
const ADMIN_PASSWORD =
  process.env.PRESERVE_SEED_ADMIN_PASSWORD || "Bn0y10h2qI6045f8"
const OWNER_PASSWORD =
  process.env.PRESERVE_SEED_OWNER_PASSWORD || "Foodbela@12345"

type Coordinate = typeof CENTER

type RestaurantProfile = {
  name: string
  description: string
  cuisines: string[]
  tags: string[]
  categories: string[]
  dishes: string[]
  addOns: string[]
  variantLabels: string[]
  basePrice: number
  preparationTimeMinutes: number
  distanceKm: number
  bearingDeg: number
  itemCount: number
  imageIds: string[]
}

const RESTAURANT_PROFILES: RestaurantProfile[] = [
  {
    name: "Haor Bangla Kitchen",
    description: "Bangla rice meals, bhorta, fish curry and homestyle favourites.",
    cuisines: ["Bangla", "Rice", "Fish"],
    tags: ["homestyle", "lunch", "family"],
    categories: ["Rice Meals", "Fish", "Chicken", "Bhorta", "Vegetables", "Snacks", "Desserts", "Drinks"],
    dishes: ["Rui Curry", "Ilish Fry", "Chicken Jhol", "Beef Bhuna", "Mixed Bhorta", "Khichuri", "Dal Rice", "Vegetable Curry", "Prawn Malai", "Mutton Rezala"],
    addOns: ["Extra rice", "Fried egg", "Seasonal bhorta", "Fresh salad"],
    variantLabels: ["Single", "Regular", "Family"],
    basePrice: 150,
    preparationTimeMinutes: 24,
    distanceKm: 0.25,
    bearingDeg: 18,
    itemCount: LARGE_MENU_ITEM_COUNT,
    imageIds: ["photo-1604908176997-125f25cc6f3d", "photo-1562967916-eb82221dfb36", "photo-1512621776951-a57141f2eefd"],
  },
  {
    name: "Sultan Biryani House",
    description: "Kacchi, tehari, roast and kebab prepared with warm spices.",
    cuisines: ["Biryani", "Mughlai", "Kebab"],
    tags: ["kacchi", "popular", "group-meal"],
    categories: ["Kacchi", "Tehari", "Polao", "Roast", "Kebab", "Family Packs", "Desserts", "Drinks"],
    dishes: ["Mutton Kacchi", "Chicken Biryani", "Beef Tehari", "Morog Polao", "Chicken Roast", "Seekh Kebab", "Jali Kebab", "Mutton Rezala", "Borhani", "Firni"],
    addOns: ["Extra potato", "Boiled egg", "Jali kebab", "Borhani"],
    variantLabels: ["Half", "Full", "Family Pack"],
    basePrice: 190,
    preparationTimeMinutes: 30,
    distanceKm: 0.43,
    bearingDeg: 82,
    itemCount: LARGE_MENU_ITEM_COUNT,
    imageIds: ["photo-1589302168068-964664d93dc0", "photo-1599043513900-ed6fe01d3833", "photo-1598515214211-89d3c73ae83b"],
  },
  {
    name: "Pizza Pasta Yard",
    description: "Hand-tossed pizza, creamy pasta and oven-baked sides.",
    cuisines: ["Pizza", "Italian", "Pasta"],
    tags: ["cheesy", "dinner", "kids"],
    categories: ["Pizza", "Pasta", "Baked Sides", "Salads", "Drinks"],
    dishes: ["Chicken Supreme Pizza", "Margherita Pizza", "Beef Pepperoni Pizza", "Alfredo Pasta", "Arrabbiata Pasta", "Baked Penne", "Garlic Bread", "Chicken Salad"],
    addOns: ["Extra cheese", "Black olives", "Chicken topping", "Jalapeno"],
    variantLabels: ["6 inch", "9 inch", "12 inch"],
    basePrice: 220,
    preparationTimeMinutes: 26,
    distanceKm: 0.66,
    bearingDeg: 142,
    itemCount: STANDARD_MENU_ITEM_COUNT,
    imageIds: ["photo-1565299624946-b28f40a0ae38", "photo-1574071318508-1cdbab80d002", "photo-1621996346565-e3dbc646d9a9"],
  },
  {
    name: "Dragon Wok",
    description: "Fast wok-fired Chinese and Thai comfort food.",
    cuisines: ["Chinese", "Thai", "Noodles"],
    tags: ["wok", "spicy", "family-pack"],
    categories: ["Fried Rice", "Noodles", "Chicken", "Soup", "Thai"],
    dishes: ["Chicken Fried Rice", "Mixed Chow Mein", "Thai Soup", "Chilli Chicken", "Beef Sizzling", "Prawn Tempura", "Vegetable Wonton", "Pad Thai"],
    addOns: ["Fried egg", "Extra chicken", "Chilli oil", "Wonton"],
    variantLabels: ["Regular", "Large", "Family"],
    basePrice: 180,
    preparationTimeMinutes: 22,
    distanceKm: 0.85,
    bearingDeg: 205,
    itemCount: STANDARD_MENU_ITEM_COUNT,
    imageIds: ["photo-1512058564366-18510be2db19", "photo-1563245372-f21724e3856d", "photo-1547592180-85f173990554"],
  },
  {
    name: "Grill Street Burgers",
    description: "Smashed burgers, loaded fries and grilled sandwiches.",
    cuisines: ["Burger", "Fast Food", "Grill"],
    tags: ["burger", "late-night", "quick-bite"],
    categories: ["Beef Burgers", "Chicken Burgers", "Sandwiches", "Fries", "Drinks"],
    dishes: ["Classic Smash Burger", "BBQ Beef Burger", "Crispy Chicken Burger", "Grilled Chicken Sandwich", "Loaded Fries", "Chicken Wings", "Onion Rings", "Club Sandwich"],
    addOns: ["Cheese slice", "Beef patty", "Chicken patty", "Caramelized onion"],
    variantLabels: ["Single", "Double", "Combo"],
    basePrice: 160,
    preparationTimeMinutes: 20,
    distanceKm: 1.05,
    bearingDeg: 268,
    itemCount: STANDARD_MENU_ITEM_COUNT,
    imageIds: ["photo-1568901346375-23c9450c58cd", "photo-1550547660-d9450f859349", "photo-1573080496219-bb080dd4f877"],
  },
  {
    name: "Cha Ghor Cafe",
    description: "Tea, coffee, breakfast and relaxed cafe snacks.",
    cuisines: ["Cafe", "Breakfast", "Snacks"],
    tags: ["tea", "coffee", "breakfast"],
    categories: ["Tea", "Coffee", "Breakfast", "Sandwiches", "Desserts"],
    dishes: ["Masala Tea", "Milk Tea", "Cold Coffee", "Cappuccino", "Paratha Breakfast", "Chicken Sandwich", "French Toast", "Chocolate Cake"],
    addOns: ["Extra milk", "Espresso shot", "Vanilla syrup", "Whipped cream"],
    variantLabels: ["Small", "Regular", "Large"],
    basePrice: 70,
    preparationTimeMinutes: 16,
    distanceKm: 1.24,
    bearingDeg: 330,
    itemCount: STANDARD_MENU_ITEM_COUNT,
    imageIds: ["photo-1495474472287-4d71bcdd2085", "photo-1509042239860-f550ce710b93", "photo-1551024506-0bccd828d307"],
  },
  {
    name: "Kebab Darbar",
    description: "Charcoal kebab, naan and Mughlai platters.",
    cuisines: ["Kebab", "Mughlai", "BBQ"],
    tags: ["charcoal", "naan", "dinner"],
    categories: ["Chicken Kebab", "Beef Kebab", "Platters", "Naan", "Drinks"],
    dishes: ["Chicken Tikka", "Beef Seekh", "Reshmi Kebab", "Boti Kebab", "Mixed Grill", "Butter Naan", "Garlic Naan", "Lacchi"],
    addOns: ["Butter naan", "Mint chutney", "Grilled vegetables", "Extra kebab"],
    variantLabels: ["4 pieces", "8 pieces", "Platter"],
    basePrice: 170,
    preparationTimeMinutes: 28,
    distanceKm: 1.43,
    bearingDeg: 42,
    itemCount: STANDARD_MENU_ITEM_COUNT,
    imageIds: ["photo-1529692236671-f1f6cf9683ba", "photo-1544025162-d76694265947", "photo-1555939594-58d7cb561ad1"],
  },
  {
    name: "River Fish Corner",
    description: "Fresh local fish, rice meals and seafood specials.",
    cuisines: ["Fish", "Seafood", "Bangla"],
    tags: ["fresh-fish", "rice", "local"],
    categories: ["River Fish", "Seafood", "Rice Sets", "Sides", "Drinks"],
    dishes: ["Rui Fry", "Katla Curry", "Ilish Bhapa", "Prawn Bhuna", "Fish Khichuri", "Koi Curry", "Tilapia Fry", "Fish Platter"],
    addOns: ["Extra rice", "Dal", "Bhorta", "Lemon salad"],
    variantLabels: ["Small", "Medium", "Large"],
    basePrice: 160,
    preparationTimeMinutes: 25,
    distanceKm: 1.62,
    bearingDeg: 108,
    itemCount: STANDARD_MENU_ITEM_COUNT,
    imageIds: ["photo-1544943910-4c1dc44aab44", "photo-1580959375944-abd7e991f971", "photo-1579631542720-3a87824fff86"],
  },
  {
    name: "Shobuj Vegetarian",
    description: "Fresh vegetarian meals, salads and plant-forward snacks.",
    cuisines: ["Vegetarian", "Healthy", "Bangla"],
    tags: ["vegetarian", "fresh", "light"],
    categories: ["Rice Bowls", "Vegetable Curry", "Salads", "Snacks", "Drinks"],
    dishes: ["Vegetable Khichuri", "Paneer Curry", "Mixed Vegetable", "Dal Bowl", "Chickpea Salad", "Vegetable Roll", "Mushroom Fry", "Fruit Bowl"],
    addOns: ["Paneer", "Boiled egg", "Mixed seeds", "Fresh salad"],
    variantLabels: ["Regular", "Large", "Meal Box"],
    basePrice: 110,
    preparationTimeMinutes: 19,
    distanceKm: 1.81,
    bearingDeg: 174,
    itemCount: STANDARD_MENU_ITEM_COUNT,
    imageIds: ["photo-1540189549336-e6e99c3679fe", "photo-1512621776951-a57141f2eefd", "photo-1540420773420-3366772f4999"],
  },
  {
    name: "Misti Bakery",
    description: "Fresh bread, cakes, pastries and Bengali sweets.",
    cuisines: ["Bakery", "Dessert", "Sweets"],
    tags: ["cake", "pastry", "celebration"],
    categories: ["Cakes", "Pastries", "Bread", "Bengali Sweets", "Drinks"],
    dishes: ["Chocolate Cake", "Vanilla Cake", "Red Velvet Pastry", "Chicken Patties", "Milk Bread", "Roshogolla", "Gulab Jamun", "Sweet Yogurt"],
    addOns: ["Birthday topper", "Chocolate message", "Candles", "Gift box"],
    variantLabels: ["Slice", "Half pound", "One pound"],
    basePrice: 80,
    preparationTimeMinutes: 18,
    distanceKm: 2,
    bearingDeg: 238,
    itemCount: STANDARD_MENU_ITEM_COUNT,
    imageIds: ["photo-1578985545062-69928b1d9587", "photo-1551024506-0bccd828d307", "photo-1509440159596-0249088772ff"],
  },
  {
    name: "Crispy Chicken Lab",
    description: "Fried chicken, wings, rice bowls and family buckets.",
    cuisines: ["Fried Chicken", "Fast Food", "Rice Bowl"],
    tags: ["crispy", "wings", "family-bucket"],
    categories: ["Fried Chicken", "Wings", "Rice Bowls", "Family Buckets", "Drinks"],
    dishes: ["Crispy Chicken", "Hot Wings", "Chicken Popcorn", "BBQ Wings", "Chicken Rice Bowl", "Family Bucket", "Spicy Strips", "Coleslaw"],
    addOns: ["Garlic dip", "Spicy mayo", "French fries", "Extra chicken"],
    variantLabels: ["2 pieces", "4 pieces", "8 pieces"],
    basePrice: 140,
    preparationTimeMinutes: 21,
    distanceKm: 2.18,
    bearingDeg: 302,
    itemCount: STANDARD_MENU_ITEM_COUNT,
    imageIds: ["photo-1626645738196-c2a7c87a8f58", "photo-1562967914-608f82629710", "photo-1569058242253-92a9c755a0ec"],
  },
  {
    name: "Bangkok Bowl",
    description: "Thai curries, noodles, rice bowls and soups.",
    cuisines: ["Thai", "Asian", "Noodles"],
    tags: ["thai", "curry", "spicy"],
    categories: ["Thai Curry", "Noodles", "Rice Bowls", "Soup", "Drinks"],
    dishes: ["Green Curry", "Red Curry", "Pad Thai", "Basil Chicken", "Tom Yum Soup", "Pineapple Rice", "Cashew Chicken", "Thai Noodles"],
    addOns: ["Jasmine rice", "Extra chicken", "Fried egg", "Chilli flakes"],
    variantLabels: ["Regular", "Large", "Family"],
    basePrice: 180,
    preparationTimeMinutes: 23,
    distanceKm: 2.34,
    bearingDeg: 8,
    itemCount: STANDARD_MENU_ITEM_COUNT,
    imageIds: ["photo-1455619452474-d2be8b1e70cd", "photo-1559847844-5315695dadae", "photo-1562565652-a0d8f0c59eb4"],
  },
  {
    name: "Taco Town",
    description: "Tacos, wraps, nachos and bold grilled flavours.",
    cuisines: ["Mexican", "Wraps", "Fast Food"],
    tags: ["taco", "wrap", "spicy"],
    categories: ["Tacos", "Wraps", "Nachos", "Rice Bowls", "Drinks"],
    dishes: ["Chicken Taco", "Beef Taco", "Grilled Wrap", "Loaded Nachos", "Mexican Rice Bowl", "Chicken Quesadilla", "Bean Taco", "Salsa Fries"],
    addOns: ["Guacamole", "Cheese sauce", "Salsa", "Extra chicken"],
    variantLabels: ["Single", "Double", "Meal"],
    basePrice: 150,
    preparationTimeMinutes: 20,
    distanceKm: 2.5,
    bearingDeg: 70,
    itemCount: STANDARD_MENU_ITEM_COUNT,
    imageIds: ["photo-1551504734-5ee1c4a1479b", "photo-1565299585323-38d6b0865b47", "photo-1599974579688-8dbdd335c77f"],
  },
  {
    name: "Dessert Cloud",
    description: "Ice cream, waffles, shakes and warm desserts.",
    cuisines: ["Dessert", "Ice Cream", "Drinks"],
    tags: ["sweet", "ice-cream", "waffle"],
    categories: ["Ice Cream", "Waffles", "Shakes", "Warm Desserts", "Coffee"],
    dishes: ["Chocolate Sundae", "Vanilla Ice Cream", "Belgian Waffle", "Brownie Bowl", "Mango Shake", "Cold Coffee", "Falooda", "Caramel Pudding"],
    addOns: ["Ice cream scoop", "Chocolate sauce", "Nuts", "Whipped cream"],
    variantLabels: ["Small", "Regular", "Large"],
    basePrice: 90,
    preparationTimeMinutes: 15,
    distanceKm: 2.67,
    bearingDeg: 136,
    itemCount: STANDARD_MENU_ITEM_COUNT,
    imageIds: ["photo-1563805042-7684c019e1cb", "photo-1551024506-0bccd828d307", "photo-1579954115545-a95591f28bfc"],
  },
  {
    name: "Fit Bowl Kitchen",
    description: "Balanced protein bowls, salads, wraps and fresh juice.",
    cuisines: ["Healthy", "Salad", "Protein Bowl"],
    tags: ["protein", "fresh", "balanced"],
    categories: ["Protein Bowls", "Salads", "Healthy Wraps", "Smoothies", "Juices"],
    dishes: ["Grilled Chicken Bowl", "Beef Protein Bowl", "Caesar Salad", "Tuna Salad", "Chicken Wrap", "Green Smoothie", "Orange Juice", "Yogurt Bowl"],
    addOns: ["Extra protein", "Avocado", "Mixed seeds", "Boiled egg"],
    variantLabels: ["Regular", "Large", "High Protein"],
    basePrice: 140,
    preparationTimeMinutes: 18,
    distanceKm: 2.84,
    bearingDeg: 214,
    itemCount: STANDARD_MENU_ITEM_COUNT,
    imageIds: ["photo-1543362906-acfc16c67564", "photo-1512621776951-a57141f2eefd", "photo-1540420773420-3366772f4999"],
  },
]

const STYLE_LABELS = [
  "Classic",
  "Signature",
  "Special",
  "Spicy",
  "Smoky",
  "Chef's",
  "House",
  "Premium",
  "Fresh",
  "Family",
]

function image(photoId: string, width = 1200) {
  return `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=${width}&q=80`
}

function pointFromCoordinate(
  center: Coordinate,
  distanceKm: number,
  bearingDeg: number,
) {
  const earthRadiusKm = 6371
  const bearing = (bearingDeg * Math.PI) / 180
  const latitude = (center.latitude * Math.PI) / 180
  const longitude = (center.longitude * Math.PI) / 180
  const angularDistance = distanceKm / earthRadiusKm
  const destinationLatitude = Math.asin(
    Math.sin(latitude) * Math.cos(angularDistance) +
      Math.cos(latitude) *
        Math.sin(angularDistance) *
        Math.cos(bearing),
  )
  const destinationLongitude =
    longitude +
    Math.atan2(
      Math.sin(bearing) *
        Math.sin(angularDistance) *
        Math.cos(latitude),
      Math.cos(angularDistance) -
        Math.sin(latitude) * Math.sin(destinationLatitude),
    )

  return {
    latitude: Number(((destinationLatitude * 180) / Math.PI).toFixed(7)),
    longitude: Number(((destinationLongitude * 180) / Math.PI).toFixed(7)),
  }
}

function distanceBetweenKm(origin: Coordinate, destination: Coordinate) {
  const earthRadiusKm = 6371
  const latitudeDelta =
    ((destination.latitude - origin.latitude) * Math.PI) / 180
  const longitudeDelta =
    ((destination.longitude - origin.longitude) * Math.PI) / 180
  const originLatitude = (origin.latitude * Math.PI) / 180
  const destinationLatitude = (destination.latitude * Math.PI) / 180
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(originLatitude) *
      Math.cos(destinationLatitude) *
      Math.sin(longitudeDelta / 2) ** 2

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(haversine))
}

function buildVariants(profile: RestaurantProfile, itemIndex: number) {
  if (itemIndex % 4 !== 0 && itemIndex % 7 !== 0) return []

  return [
    {
      name: "Size",
      minSelect: 1,
      maxSelect: 1,
      options: profile.variantLabels.map((label, optionIndex) => ({
        label,
        priceDelta: optionIndex * (profile.basePrice >= 170 ? 80 : 50),
      })),
    },
  ]
}

function buildAddOns(profile: RestaurantProfile, itemIndex: number) {
  if (itemIndex % 3 === 2) return []

  return [
    {
      name: "Add-ons",
      minSelect: 0,
      maxSelect: Math.min(3, profile.addOns.length),
      options: profile.addOns.map((label, optionIndex) => ({
        label,
        price: 20 + optionIndex * 15,
      })),
    },
  ]
}

function buildMenuItemSeed(profile: RestaurantProfile, itemIndex: number) {
  const dish = profile.dishes[itemIndex % profile.dishes.length]
  const styleIndex = Math.floor(itemIndex / profile.dishes.length)
  const style = STYLE_LABELS[styleIndex % STYLE_LABELS.length]
  const name = `${style} ${dish}`
  const variants = buildVariants(profile, itemIndex)
  const addOnGroups = buildAddOns(profile, itemIndex)

  return {
    name,
    slug: slugify(name),
    description: `${style} ${dish.toLowerCase()} prepared fresh by ${profile.name}.`,
    imageUrl: image(profile.imageIds[itemIndex % profile.imageIds.length]),
    basePrice:
      Math.ceil(
        (profile.basePrice +
          (itemIndex % profile.dishes.length) * 15 +
          styleIndex * 10) /
          10,
      ) * 10,
    variants,
    addOnGroups,
    kind: variants.length ? "variant" : "simple",
    isPopular: itemIndex < 6 || itemIndex % 11 === 0,
  }
}

function validateSeedDefinition() {
  if (RESTAURANT_PROFILES.length !== 15) {
    throw new Error("Seed must contain exactly 15 restaurants.")
  }
  if (!ADMIN_EMAIL.includes("@") || ADMIN_PASSWORD.length < 6) {
    throw new Error("Seed admin credentials are invalid.")
  }

  const restaurantSlugs = new Set<string>()
  for (const [profileIndex, profile] of RESTAURANT_PROFILES.entries()) {
    const expectedCount =
      profileIndex < 2 ? LARGE_MENU_ITEM_COUNT : STANDARD_MENU_ITEM_COUNT
    if (profile.itemCount !== expectedCount) {
      throw new Error(`${profile.name} must contain ${expectedCount} menu items.`)
    }
    if (profile.distanceKm >= ZONE_RADIUS_KM) {
      throw new Error(`${profile.name} is not strictly inside the 3 km zone.`)
    }

    const restaurantSlug = slugify(profile.name)
    if (!restaurantSlug || restaurantSlugs.has(restaurantSlug)) {
      throw new Error(`Duplicate or invalid restaurant slug: ${restaurantSlug}`)
    }
    restaurantSlugs.add(restaurantSlug)

    const menuSlugs = new Set(
      Array.from({ length: profile.itemCount }, (_, itemIndex) =>
        buildMenuItemSeed(profile, itemIndex).slug,
      ),
    )
    if (menuSlugs.size !== profile.itemCount) {
      throw new Error(`${profile.name} contains duplicate menu item slugs.`)
    }
    const generatedItems = Array.from(
      { length: profile.itemCount },
      (_, itemIndex) => buildMenuItemSeed(profile, itemIndex),
    )
    if (!generatedItems.some((item) => item.variants.length)) {
      throw new Error(`${profile.name} must contain variant menu items.`)
    }
    if (!generatedItems.some((item) => item.addOnGroups.length)) {
      throw new Error(`${profile.name} must contain menu item add-ons.`)
    }

    const location = pointFromCoordinate(
      CENTER,
      profile.distanceKm,
      profile.bearingDeg,
    )
    const calculatedDistance = distanceBetweenKm(CENTER, location)
    if (calculatedDistance > ZONE_RADIUS_KM) {
      throw new Error(`${profile.name} generated outside the delivery radius.`)
    }
  }
}

function assertResetAllowed() {
  if (process.env.CONFIRM_PRESERVE_AUTH_RESET !== "YES") {
    throw new Error(
      'Refusing to clear data. Set CONFIRM_PRESERVE_AUTH_RESET="YES" after reviewing the preview.',
    )
  }
  if (
    env.NODE_ENV === "production" &&
    process.env.ALLOW_PRODUCTION_PRESERVE_AUTH_RESET !== "YES"
  ) {
    throw new Error(
      'Refusing to clear production data. Set ALLOW_PRODUCTION_PRESERVE_AUTH_RESET="YES" only for an intentional reset.',
    )
  }

  const mongoUri = env.MONGODB_URI.toLowerCase()
  const isLocal = [
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "host.docker.internal",
  ].some((host) => mongoUri.includes(host))
  if (!isLocal && process.env.ALLOW_REMOTE_PRESERVE_AUTH_RESET !== "YES") {
    throw new Error(
      'MONGODB_URI is remote. Set ALLOW_REMOTE_PRESERVE_AUTH_RESET="YES" only after verifying the target database.',
    )
  }
}

function createDefaultWeeklySchedule() {
  return [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ].map((day) => ({
    day,
    isOpen: true,
    is24Hours: false,
    timeSlots: [{ startTime: "10:00", endTime: "23:00" }],
  }))
}

function preservedCollectionNames() {
  return new Set([
    AdminModel.collection.collectionName,
    AdminRefreshTokenSessionModel.collection.collectionName,
    CustomerModel.collection.collectionName,
    CustomerRefreshTokenSessionModel.collection.collectionName,
  ])
}

async function clearNonPreservedCollections(session?: ClientSession) {
  const database = mongoose.connection.db
  if (!database) throw new Error("MongoDB connection is not ready.")

  const preserved = preservedCollectionNames()
  const collections = await database.listCollections({}, { nameOnly: false }).toArray()
  const targets = collections.filter(
    (collection) =>
      collection.type === "collection" &&
      !collection.name.startsWith("system.") &&
      !preserved.has(collection.name),
  )

  for (const collection of targets) {
    await database.collection(collection.name).deleteMany({}, { session })
  }

  return targets.map((collection) => collection.name).sort()
}

function buildServiceAreaSnapshot(zone: mongoose.Document) {
  const value = zone.toObject() as Record<string, any>
  return {
    districtId: String(value.districtId),
    districtName: String(value.districtName),
    zoneId: String(value._id),
    zoneName: String(value.name),
    zoneSlug: String(value.slug),
    center: value.center,
    radiusKm: Number(value.radiusKm),
    delivery: value.delivery ?? {},
    dispatch: value.dispatch ?? {},
  }
}

async function seedAdmin(session?: ClientSession) {
  const passwordHash = await hashPassword(ADMIN_PASSWORD)
  return AdminModel.findOneAndUpdate(
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
    { upsert: true, new: true, setDefaultsOnInsert: true, session },
  )
}

async function seedRestaurants(session?: ClientSession) {
  const [district] = await ServiceDistrictModel.create(
    [
      {
        name: "Netrokona",
        slug: "netrokona",
        status: "active",
        country: "Bangladesh",
        displayOrder: 1,
        notes: "Primary district for the preserve-auth seed.",
      },
    ],
    { session, ordered: true },
  )
  const [zone] = await ServiceZoneModel.create(
    [
      {
        districtId: district._id,
        districtName: district.name,
        name: "Netrokona Central",
        slug: "netrokona-central-3km",
        status: "active",
        center: CENTER,
        radiusKm: ZONE_RADIUS_KM,
        priority: 100,
        displayOrder: 1,
        delivery: {
          baseFeeTaka: 45,
          distanceSurchargeEnabled: true,
          surchargeStartsAfterKm: 1.5,
          surchargeStepMeters: 500,
          surchargeAmountTaka: 5,
          maxRestaurantDistanceKm: ZONE_RADIUS_KM,
          rainSurchargeEnabled: false,
          rainSurchargeTaka: 20,
        },
        dispatch: {
          autoAssignEnabled: true,
          dispatchMode: "fleet",
          primaryRiderFallbackEnabled: true,
          algorithm: "nearest_eligible_balanced",
          staleLocationCutoffMinutes: 20,
          retryCooldownMinutes: 3,
        },
        notes: `Delivery coverage centered at ${CENTER.latitude}, ${CENTER.longitude}.`,
      },
    ],
    { session, ordered: true },
  )

  const ownerPasswordHash = await hashPassword(OWNER_PASSWORD)
  const owners = await OwnerModel.insertMany(
    RESTAURANT_PROFILES.map((profile, index) => ({
      fullName: `${profile.name} Owner`,
      phone: `01780${String(index + 1).padStart(6, "0")}`,
      email: `seed-owner-${String(index + 1).padStart(2, "0")}@foodbela.test`,
      passwordHash: ownerPasswordHash,
      isPhoneVerified: true,
      status: "active",
      restaurantLifecycleStatus: "approved",
    })),
    { session, ordered: true },
  )
  const serviceArea = buildServiceAreaSnapshot(zone)
  const restaurants = await RestaurantModel.insertMany(
    RESTAURANT_PROFILES.map((profile, index) => {
      const restaurantSlug = slugify(profile.name)
      const location = pointFromCoordinate(
        CENTER,
        profile.distanceKm,
        profile.bearingDeg,
      )
      const ownerEmail = `seed-owner-${String(index + 1).padStart(2, "0")}@foodbela.test`

      return {
        ownerId: owners[index]._id,
        name: profile.name,
        slug: restaurantSlug,
        description: profile.description,
        preparationTimeMinutes: profile.preparationTimeMinutes,
        cuisineTypes: profile.cuisines,
        tags: profile.tags,
        logo: {
          publicId: `preserve-auth/restaurants/${restaurantSlug}/logo`,
          url: image(profile.imageIds[0], 600),
        },
        coverImage: {
          publicId: `preserve-auth/restaurants/${restaurantSlug}/cover`,
          url: image(profile.imageIds[1] ?? profile.imageIds[0]),
        },
        contact: {
          phone: `01880${String(index + 1).padStart(6, "0")}`,
          email: ownerEmail,
        },
        address: {
          address: `${index + 1} Central Food Street, Netrokona`,
          city: "Netrokona",
        },
        location,
        locationPoint: {
          type: "Point",
          coordinates: [location.longitude, location.latitude],
        },
        serviceArea,
        runtime: {
          isVisible: true,
          isOnline: true,
          status: "open",
          currentOperationalStatus: "open",
          manuallyPaused: false,
          lastOnlineAt: new Date(),
        },
        discovery: {
          isFeatured: index < 8,
          featuredSortOrder: index + 1,
        },
        commercial: {
          commissionRate: 15,
          commissionHistory: [
            {
              previousRate: null,
              rate: 15,
              changedByAdminId: "",
              note: "Preserve-auth seed",
              createdAt: new Date(),
            },
          ],
        },
        settings: {
          orderSettings: { autoAcceptOrders: false },
          notifications: {
            newOrder: true,
            cancellation: true,
            payouts: true,
            support: true,
          },
        },
        profileCompletion: { percentage: 100, completedWeight: 100 },
      }
    }),
    { session },
  )

  await OwnerModel.bulkWrite(
    owners.map((owner, index) => ({
      updateOne: {
        filter: { _id: owner._id },
        update: { $set: { activeRestaurantId: restaurants[index]._id } },
      },
    })),
    { session },
  )
  await OpeningHoursModel.insertMany(
    restaurants.map((restaurant) => ({
      restaurantId: restaurant._id,
      timezone: "Asia/Dhaka",
      weeklySchedule: createDefaultWeeklySchedule(),
      exceptions: [],
      temporaryClosure: {
        isPaused: false,
        mode: null,
        resumeAt: null,
        reason: "",
      },
    })),
    { session },
  )
  await PayoutMethodModel.insertMany(
    restaurants.map((restaurant, index) => ({
      restaurantId: restaurant._id,
      type: "bkash",
      accountName: `${RESTAURANT_PROFILES[index].name} Owner`,
      accountNumber: `01780${String(index + 1).padStart(6, "0")}`,
      isVerified: true,
      verificationSource: "preserve_auth_seed",
      verifiedAt: new Date(),
    })),
    { session },
  )

  const categorySeeds = RESTAURANT_PROFILES.flatMap((profile, profileIndex) =>
    profile.categories.map((categoryName, categoryIndex) => ({
      profileIndex,
      categoryIndex,
      restaurantId: restaurants[profileIndex]._id,
      name: categoryName,
      slug: slugify(categoryName),
      description: `${categoryName} from ${profile.name}.`,
      status: "active",
      displayOrder: categoryIndex + 1,
    })),
  )
  const categories = await CategoryModel.insertMany(
    categorySeeds.map(({ profileIndex: _profileIndex, categoryIndex: _categoryIndex, ...seed }) => seed),
    { session },
  )
  const categoriesByProfile = new Map<string, mongoose.Document>()
  categorySeeds.forEach((seed, index) => {
    categoriesByProfile.set(
      `${seed.profileIndex}:${seed.categoryIndex}`,
      categories[index],
    )
  })

  const menuItems = RESTAURANT_PROFILES.flatMap((profile, profileIndex) =>
    Array.from({ length: profile.itemCount }, (_, itemIndex) => {
      const categoryIndex = itemIndex % profile.categories.length
      const category = categoriesByProfile.get(`${profileIndex}:${categoryIndex}`)
      if (!category) {
        throw new Error(`Missing category for ${profile.name} item ${itemIndex + 1}.`)
      }
      const item = buildMenuItemSeed(profile, itemIndex)
      const restaurantSlug = slugify(profile.name)

      return {
        restaurantId: restaurants[profileIndex]._id,
        categoryId: category._id,
        name: item.name,
        slug: item.slug,
        description: item.description,
        images: [
          {
            url: item.imageUrl,
            publicId: `preserve-auth/menu/${restaurantSlug}/${item.slug}`,
          },
        ],
        status: "active",
        availability: "available",
        kind: item.kind,
        basePrice: item.basePrice,
        variants: item.variants,
        addOnGroups: item.addOnGroups,
        isPopular: item.isPopular,
      }
    }),
  )
  await MenuItemModel.insertMany(menuItems, { session })

  const restaurantIds = restaurants.map((restaurant) => restaurant._id)
  await RestaurantCollectionModel.create(
    [
      {
        key: "featured_restaurants",
        name: "Featured Restaurants",
        type: "static",
        restaurantIds,
        sortOrders: restaurantIds.map((restaurantId, index) => ({
          restaurantId,
          order: index + 1,
        })),
        isActive: true,
      },
      {
        key: "restaurants_with_offers",
        name: "Restaurants With Offers",
        type: "dynamic",
        criteria: { hasActiveVoucher: true },
        restaurantIds: [],
        sortOrders: [],
        isActive: true,
      },
    ],
    { session, ordered: true },
  )

  return { district, zone, owners, restaurants, categories, menuItems }
}

async function supportsTransactions() {
  const database = mongoose.connection.db
  if (!database) return false
  const hello = await database.admin().command({ hello: 1 })
  return Boolean(hello.setName || hello.msg === "isdbgrid")
}

async function runSeedWork(session?: ClientSession) {
  const clearedCollections = await clearNonPreservedCollections(session)
  const admin = await seedAdmin(session)
  const seeded = await seedRestaurants(session)
  return { ...seeded, admin, clearedCollections }
}

async function syncSeedIndexes() {
  await Promise.all([
    ServiceDistrictModel.syncIndexes(),
    ServiceZoneModel.syncIndexes(),
    OwnerModel.syncIndexes(),
    RestaurantModel.syncIndexes(),
    OpeningHoursModel.syncIndexes(),
    PayoutMethodModel.syncIndexes(),
    CategoryModel.syncIndexes(),
    MenuItemModel.syncIndexes(),
    RestaurantCollectionModel.syncIndexes(),
  ])
}

function printPreview() {
  validateSeedDefinition()
  const generatedItems = RESTAURANT_PROFILES.flatMap((profile) =>
    Array.from({ length: profile.itemCount }, (_, itemIndex) =>
      buildMenuItemSeed(profile, itemIndex),
    ),
  )
  console.log(`Center: ${CENTER.latitude}, ${CENTER.longitude}`)
  console.log(`Delivery radius: ${ZONE_RADIUS_KM} km`)
  console.log(`Admin to create/update: ${ADMIN_EMAIL}`)
  console.log("Preserved collections:", [...preservedCollectionNames()].join(", "))
  console.table(
    RESTAURANT_PROFILES.map((profile) => ({
      restaurant: profile.name,
      distanceKm: profile.distanceKm,
      itemCount: profile.itemCount,
    })),
  )
  console.log("Total menu items:", generatedItems.length)
  console.log(
    "Items with variants:",
    generatedItems.filter((item) => item.variants.length).length,
  )
  console.log(
    "Items with add-ons:",
    generatedItems.filter((item) => item.addOnGroups.length).length,
  )
}

async function main() {
  validateSeedDefinition()
  if (process.argv.includes("--preview")) {
    printPreview()
    return
  }
  assertResetAllowed()

  mongoose.set("strictQuery", true)
  await mongoose.connect(env.MONGODB_URI, {
    maxPoolSize: env.MONGODB_MAX_POOL_SIZE,
    minPoolSize: Math.min(
      env.MONGODB_MIN_POOL_SIZE,
      env.MONGODB_MAX_POOL_SIZE,
    ),
    serverSelectionTimeoutMS: env.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
  })

  const activeSessionCutoff = new Date()
  const customerCountBefore = await CustomerModel.countDocuments()
  const activeCustomerSessionsBefore =
    await CustomerRefreshTokenSessionModel.countDocuments({
      revokedAt: null,
      expiresAt: { $gt: activeSessionCutoff },
    })
  const adminCountBefore = await AdminModel.countDocuments()
  const adminSessionCountBefore =
    await AdminRefreshTokenSessionModel.countDocuments()

  let result: Awaited<ReturnType<typeof runSeedWork>>
  if (await supportsTransactions()) {
    const session = await mongoose.startSession()
    try {
      let transactionResult: Awaited<ReturnType<typeof runSeedWork>> | null = null
      await session.withTransaction(async () => {
        transactionResult = await runSeedWork(session)
      })
      if (!transactionResult) throw new Error("Seed transaction did not complete.")
      result = transactionResult
    } finally {
      await session.endSession()
    }
  } else {
    console.warn(
      "MongoDB transactions are unavailable; running the validated seed without a transaction.",
    )
    result = await runSeedWork()
  }

  await syncSeedIndexes()

  const [customerCountAfter, activeCustomerSessionsAfter, adminCountAfter, adminSessionCountAfter] =
    await Promise.all([
      CustomerModel.countDocuments(),
      CustomerRefreshTokenSessionModel.countDocuments({
        revokedAt: null,
        expiresAt: { $gt: activeSessionCutoff },
      }),
      AdminModel.countDocuments(),
      AdminRefreshTokenSessionModel.countDocuments(),
    ])
  if (customerCountAfter !== customerCountBefore) {
    throw new Error("Customer preservation check failed.")
  }
  if (activeCustomerSessionsAfter !== activeCustomerSessionsBefore) {
    throw new Error("Active customer session preservation check failed.")
  }
  if (adminCountAfter < adminCountBefore) {
    throw new Error("Existing admin preservation check failed.")
  }
  if (adminSessionCountAfter !== adminSessionCountBefore) {
    throw new Error("Admin session preservation check failed.")
  }

  console.log("Preserve-auth reset and seed completed successfully.")
  console.log(`Admin ready: ${result.admin.email}`)
  console.log(`Zone: ${result.zone.name} (${ZONE_RADIUS_KM} km)`)
  console.log(`Restaurants: ${result.restaurants.length}`)
  console.log(`Menu items: ${result.menuItems.length}`)
  console.log(`Customers preserved: ${customerCountAfter}`)
  console.log(`Active customer sessions preserved: ${activeCustomerSessionsAfter}`)
  console.log(`Existing/new admins retained: ${adminCountAfter}`)
  console.log(`Admin sessions preserved: ${adminSessionCountAfter}`)
  console.log(`Cleared collections: ${result.clearedCollections.join(", ")}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await mongoose.disconnect()
  })
