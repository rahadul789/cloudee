import mongoose from "mongoose"

import { slugify } from "../src/common/utils/slugify"
import { connectDatabase } from "../src/config/db"
import { env } from "../src/config/env"
import { AdminModel } from "../src/modules/admin/admin.model"
import {
  OpeningHoursModel,
  OwnerModel,
  PayoutMethodModel,
  RestaurantModel,
  RiderModel,
} from "../src/modules/auth/auth.model"
import { hashPassword } from "../src/modules/auth/auth.utils"
import {
  CustomerModel,
  RestaurantCollectionModel,
  VoucherModel,
} from "../src/modules/customer/customer.model"
import { CategoryModel, MenuItemModel } from "../src/modules/owner/operational.model"
import {
  ServiceDistrictModel,
  ServiceZoneModel,
} from "../src/modules/service-area/service-area.model"

const CENTER = {
  latitude: 24.8765267,
  longitude: 90.7249078,
}

const DEMO_PASSWORD = "Foodbela@12345"
const ADMIN_EMAIL = env.ADMIN_BOOTSTRAP_EMAIL
const ADMIN_PASSWORD = env.ADMIN_BOOTSTRAP_PASSWORD
const NETROKONA_SADAR_ZONE_SLUG = "netrokona-sadar"
const KENDUA_ZONE_SLUG = "netrokona-kendua"
const MOHANGANJ_ZONE_SLUG = "netrokona-mohanganj"
const DURGAPUR_ZONE_SLUG = "netrokona-durgapur"
const KISHOREGANJ_SADAR_ZONE_SLUG = "kishoreganj-sadar"
const DINAJPUR_SADAR_ZONE_SLUG = "dinajpur-sadar"

type Coordinate = {
  latitude: number
  longitude: number
}

const SERVICE_DISTRICT_SEEDS = [
  {
    name: "Netrokona",
    slug: "netrokona",
    status: "active",
    country: "Bangladesh",
    displayOrder: 1,
    notes: "Primary launch district for Foodbela.",
  },
  {
    name: "Kishoreganj",
    slug: "kishoreganj",
    status: "active",
    country: "Bangladesh",
    displayOrder: 2,
    notes: "Expansion district with its own restaurants, riders, and coverage.",
  },
  {
    name: "Dinajpur",
    slug: "dinajpur",
    status: "active",
    country: "Bangladesh",
    displayOrder: 3,
    notes: "Expansion district for zone filtering and finance testing.",
  },
] as const

const SERVICE_ZONE_SEEDS = [
  {
    districtSlug: "netrokona",
    name: "Netrokona Sadar",
    slug: NETROKONA_SADAR_ZONE_SLUG,
    status: "active",
    center: CENTER,
    radiusKm: 5.5,
    priority: 100,
    displayOrder: 1,
    baseFeeTaka: 45,
    rainSurchargeTaka: 20,
    notes: "Active launch zone. Seed restaurants include inside 3km, 4-5km, and outside coverage examples.",
  },
  {
    districtSlug: "netrokona",
    name: "Kendua",
    slug: KENDUA_ZONE_SLUG,
    status: "active",
    center: { latitude: 24.7602, longitude: 90.8111 },
    radiusKm: 4.8,
    priority: 80,
    displayOrder: 2,
    baseFeeTaka: 50,
    rainSurchargeTaka: 20,
    notes: "Netrokona expansion zone for Kendua area.",
  },
  {
    districtSlug: "netrokona",
    name: "Mohanganj",
    slug: MOHANGANJ_ZONE_SLUG,
    status: "active",
    center: { latitude: 24.8756, longitude: 90.9766 },
    radiusKm: 5,
    priority: 75,
    displayOrder: 3,
    baseFeeTaka: 55,
    rainSurchargeTaka: 25,
    notes: "Haor side coverage zone for restaurant/rider assignment testing.",
  },
  {
    districtSlug: "netrokona",
    name: "Durgapur",
    slug: DURGAPUR_ZONE_SLUG,
    status: "active",
    center: { latitude: 25.1246, longitude: 90.6887 },
    radiusKm: 5,
    priority: 70,
    displayOrder: 4,
    baseFeeTaka: 60,
    rainSurchargeTaka: 25,
    notes: "North Netrokona coverage zone.",
  },
  {
    districtSlug: "kishoreganj",
    name: "Kishoreganj Sadar",
    slug: KISHOREGANJ_SADAR_ZONE_SLUG,
    status: "active",
    center: { latitude: 24.4336, longitude: 90.7866 },
    radiusKm: 5,
    priority: 65,
    displayOrder: 1,
    baseFeeTaka: 55,
    rainSurchargeTaka: 25,
    notes: "Kishoreganj Sadar active test zone.",
  },
  {
    districtSlug: "dinajpur",
    name: "Dinajpur Sadar",
    slug: DINAJPUR_SADAR_ZONE_SLUG,
    status: "active",
    center: { latitude: 25.6279, longitude: 88.6332 },
    radiusKm: 5,
    priority: 60,
    displayOrder: 1,
    baseFeeTaka: 60,
    rainSurchargeTaka: 30,
    notes: "Dinajpur Sadar active test zone.",
  },
] as const

const SERVICE_DISTRICT_SLUGS = SERVICE_DISTRICT_SEEDS.map((district) => district.slug)
const SERVICE_ZONE_SLUGS = SERVICE_ZONE_SEEDS.map((zone) => zone.slug)

const image = (photoId: string, width = 1200) =>
  `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=${width}&q=80`

type SeedItem = {
  name: string
  description: string
  price: number
  image: string
  popular?: boolean
  variant?: boolean
}

type SeedCategory = {
  name: string
  description: string
  items: SeedItem[]
}

type SeedRestaurant = {
  name: string
  description: string
  zoneSlug?: string
  city?: string
  distanceKm: number
  bearingDeg: number
  cuisines: string[]
  tags: string[]
  coverImage: string
  logoImage: string
  preparationTimeMinutes: number
  featuredPosition: number
  phone: string
  ownerName: string
  ownerPhone: string
  ownerEmail: string
  categories: SeedCategory[]
}

type SeedServiceAreas = {
  netrokonaDistrict: mongoose.Document
  netrokonaSadarZone: mongoose.Document
  districtsBySlug: Map<string, mongoose.Document>
  zonesBySlug: Map<string, mongoose.Document>
}

function assertResetAllowed() {
  if (process.env.CONFIRM_DB_RESET !== "YES") {
    throw new Error(
      'Refusing to reset database. Run with CONFIRM_DB_RESET="YES" when you really want to wipe it.',
    )
  }

  if (env.NODE_ENV === "production" && process.env.ALLOW_PRODUCTION_DB_RESET !== "YES") {
    throw new Error(
      'Refusing to reset a production database. Set ALLOW_PRODUCTION_DB_RESET="YES" only for an intentional production reset.',
    )
  }

  const mongoUri = env.MONGODB_URI.toLowerCase()
  const isLocalDatabase =
    mongoUri.includes("localhost") ||
    mongoUri.includes("127.0.0.1") ||
    mongoUri.includes("0.0.0.0") ||
    mongoUri.includes("host.docker.internal")

  if (!isLocalDatabase && process.env.ALLOW_REMOTE_DB_RESET !== "YES") {
    throw new Error(
      'MONGODB_URI does not look local. Set ALLOW_REMOTE_DB_RESET="YES" only if this is a disposable dev/staging database.',
    )
  }
}

function pointFromCoordinate(center: Coordinate, distanceKm: number, bearingDeg: number) {
  const earthRadiusKm = 6371
  const bearing = (bearingDeg * Math.PI) / 180
  const lat1 = (center.latitude * Math.PI) / 180
  const lon1 = (center.longitude * Math.PI) / 180
  const angularDistance = distanceKm / earthRadiusKm

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing),
  )
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
    )

  return {
    latitude: Number(((lat2 * 180) / Math.PI).toFixed(7)),
    longitude: Number(((lon2 * 180) / Math.PI).toFixed(7)),
  }
}

function pointFromCenter(distanceKm: number, bearingDeg: number) {
  return pointFromCoordinate(CENTER, distanceKm, bearingDeg)
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

function buildMediaAsset(publicId: string, url: string) {
  return {
    publicId,
    url,
  }
}

function buildVariants(enabled?: boolean) {
  return enabled
    ? [
        {
          name: "Size",
          minSelect: 1,
          maxSelect: 1,
          options: [
            { label: "Regular", priceDelta: 0 },
            { label: "Large", priceDelta: 90 },
          ],
        },
      ]
    : []
}

function buildAddOns(categoryName: string) {
  const normalized = categoryName.toLowerCase()
  const sauceOptions = normalized.includes("pizza")
    ? ["Extra cheese", "Olives", "Chicken topping"]
    : normalized.includes("drink") || normalized.includes("juice")
      ? ["Lemon", "Mint", "Ice cream scoop"]
      : ["Extra sauce", "Fried egg", "Extra salad"]

  return [
    {
      name: "Add-ons",
      minSelect: 0,
      maxSelect: 3,
      options: sauceOptions.map((label, index) => ({
        label,
        price: [20, 30, 45][index] ?? 20,
      })),
    },
  ]
}

const restaurantSeeds: SeedRestaurant[] = [
  {
    name: "Haor Bangla Kitchen",
    description: "Homestyle rice meals, bhorta, river fish and Bangla comfort food.",
    distanceKm: 0.35,
    bearingDeg: 40,
    cuisines: ["Bangla", "Rice", "Fish"],
    tags: ["nearby", "homestyle", "lunch"],
    coverImage: image("photo-1604908176997-125f25cc6f3d"),
    logoImage: image("photo-1555939594-58d7cb561ad1", 600),
    preparationTimeMinutes: 22,
    featuredPosition: 1,
    phone: "01793000001",
    ownerName: "Rafiq Hasan",
    ownerPhone: "01792000001",
    ownerEmail: "owner.bangla@foodbela.test",
    categories: [
      {
        name: "Rice Meals",
        description: "Daily Bangla meal plates.",
        items: [
          {
            name: "Rui Fish Rice Plate",
            description: "Steamed rice, rui curry, dal and seasonal bhorta.",
            price: 240,
            image: image("photo-1604908176997-125f25cc6f3d"),
            popular: true,
          },
          {
            name: "Chicken Jhol Set",
            description: "Deshi chicken curry with rice, dal and salad.",
            price: 260,
            image: image("photo-1562967916-eb82221dfb36"),
          },
        ],
      },
      {
        name: "Bhorta & Sides",
        description: "Classic sides for a proper Bangla lunch.",
        items: [
          {
            name: "Five Bhorta Platter",
            description: "Aloo, begun, shutki, dal and tomato bhorta.",
            price: 180,
            image: image("photo-1512621776951-a57141f2eefd"),
          },
          {
            name: "Crispy Begun Fry",
            description: "Thin eggplant slices fried golden.",
            price: 110,
            image: image("photo-1540189549336-e6e99c3679fe"),
          },
        ],
      },
      {
        name: "Drinks",
        description: "Simple cold drinks and lassi.",
        items: [
          {
            name: "Sweet Lassi",
            description: "Cold yogurt drink with a light cardamom finish.",
            price: 90,
            image: image("photo-1622597467836-f3285f2131b8"),
            variant: true,
          },
        ],
      },
    ],
  },
  {
    name: "Sultan Biryani House",
    description: "Kacchi, tehari and roast meals with warm spices.",
    distanceKm: 0.95,
    bearingDeg: 130,
    cuisines: ["Biryani", "Mughlai", "Kebab"],
    tags: ["kacchi", "family", "popular"],
    coverImage: image("photo-1589302168068-964664d93dc0"),
    logoImage: image("photo-1596797038530-2c107229654b", 600),
    preparationTimeMinutes: 30,
    featuredPosition: 2,
    phone: "01793000002",
    ownerName: "Sadia Rahman",
    ownerPhone: "01792000002",
    ownerEmail: "owner.biryani@foodbela.test",
    categories: [
      {
        name: "Biryani",
        description: "Aromatic rice dishes.",
        items: [
          {
            name: "Kacchi Biryani",
            description: "Mutton kacchi with potato, egg and borhani masala.",
            price: 360,
            image: image("photo-1589302168068-964664d93dc0"),
            popular: true,
            variant: true,
          },
          {
            name: "Chicken Tehari",
            description: "Mustard oil tehari with tender chicken pieces.",
            price: 220,
            image: image("photo-1599043513900-ed6fe01d3833"),
          },
        ],
      },
      {
        name: "Kebab & Roast",
        description: "Charcoal grilled sides.",
        items: [
          {
            name: "Beef Seekh Kebab",
            description: "Smoky minced beef kebab with chutney.",
            price: 180,
            image: image("photo-1555939594-58d7cb561ad1"),
          },
          {
            name: "Chicken Roast",
            description: "Soft roast chicken in rich Mughlai gravy.",
            price: 190,
            image: image("photo-1598515214211-89d3c73ae83b"),
          },
        ],
      },
      {
        name: "Extras",
        description: "Finish the biryani plate.",
        items: [
          {
            name: "Borhani",
            description: "Spiced yogurt drink for biryani.",
            price: 80,
            image: image("photo-1622597467836-f3285f2131b8"),
          },
        ],
      },
    ],
  },
  {
    name: "Pizza & Pasta Yard",
    description: "Fresh pizza, creamy pasta and oven-baked snacks.",
    distanceKm: 1.55,
    bearingDeg: 250,
    cuisines: ["Pizza", "Italian", "Pasta"],
    tags: ["cheesy", "kids", "dinner"],
    coverImage: image("photo-1565299624946-b28f40a0ae38"),
    logoImage: image("photo-1574071318508-1cdbab80d002", 600),
    preparationTimeMinutes: 25,
    featuredPosition: 3,
    phone: "01793000003",
    ownerName: "Nadia Islam",
    ownerPhone: "01792000003",
    ownerEmail: "owner.pizza@foodbela.test",
    categories: [
      {
        name: "Pizza",
        description: "Hand-tossed pizzas.",
        items: [
          {
            name: "Chicken Supreme Pizza",
            description: "Chicken, capsicum, onion, olive and mozzarella.",
            price: 520,
            image: image("photo-1565299624946-b28f40a0ae38"),
            popular: true,
            variant: true,
          },
          {
            name: "Margherita Pizza",
            description: "Tomato sauce, mozzarella and basil.",
            price: 380,
            image: image("photo-1574071318508-1cdbab80d002"),
            variant: true,
          },
        ],
      },
      {
        name: "Pasta",
        description: "Creamy and spicy pasta bowls.",
        items: [
          {
            name: "Creamy Alfredo Pasta",
            description: "Chicken alfredo with parmesan style sauce.",
            price: 280,
            image: image("photo-1621996346565-e3dbc646d9a9"),
          },
          {
            name: "Spicy Arrabbiata",
            description: "Tomato chilli pasta with herbs.",
            price: 250,
            image: image("photo-1551183053-bf91a1d81141"),
          },
        ],
      },
      {
        name: "Sides",
        description: "Quick bites.",
        items: [
          {
            name: "Garlic Bread",
            description: "Toasted bread with garlic butter.",
            price: 130,
            image: image("photo-1573140247632-f8fd74997d5c"),
          },
        ],
      },
    ],
  },
  {
    name: "Dragon Wok Chinese",
    description: "Chinese and Thai favourites cooked fast in a hot wok.",
    distanceKm: 2.25,
    bearingDeg: 305,
    cuisines: ["Chinese", "Thai", "Noodles"],
    tags: ["wok", "family-pack", "spicy"],
    coverImage: image("photo-1512058564366-18510be2db19"),
    logoImage: image("photo-1563245372-f21724e3856d", 600),
    preparationTimeMinutes: 20,
    featuredPosition: 4,
    phone: "01793000004",
    ownerName: "Imran Chowdhury",
    ownerPhone: "01792000004",
    ownerEmail: "owner.chinese@foodbela.test",
    categories: [
      {
        name: "Rice & Noodles",
        description: "Wok classics.",
        items: [
          {
            name: "Chicken Fried Rice",
            description: "Egg fried rice with chicken and vegetables.",
            price: 260,
            image: image("photo-1512058564366-18510be2db19"),
            popular: true,
          },
          {
            name: "Thai Chow Mein",
            description: "Spicy noodles with chicken and crisp vegetables.",
            price: 240,
            image: image("photo-1585032226651-759b368d7246"),
          },
        ],
      },
      {
        name: "Chicken",
        description: "Saucy chicken mains.",
        items: [
          {
            name: "Szechuan Chicken",
            description: "Hot garlic chilli chicken.",
            price: 310,
            image: image("photo-1525755662778-989d0524087e"),
          },
          {
            name: "Sweet & Sour Chicken",
            description: "Crispy chicken tossed in tangy sauce.",
            price: 300,
            image: image("photo-1562967916-eb82221dfb36"),
          },
        ],
      },
      {
        name: "Soup",
        description: "Warm starters.",
        items: [
          {
            name: "Thai Soup",
            description: "Chicken, prawn and mushroom soup.",
            price: 170,
            image: image("photo-1547592166-23ac45744acd"),
            variant: true,
          },
        ],
      },
    ],
  },
  {
    name: "Burger Lab Netrokona",
    description: "Smash burgers, loaded fries and cold shakes.",
    distanceKm: 2.85,
    bearingDeg: 180,
    cuisines: ["Burger", "Fast Food", "Fried Chicken"],
    tags: ["fast-food", "late-night", "combo"],
    coverImage: image("photo-1550547660-d9450f859349"),
    logoImage: image("photo-1571091718767-18b5b1457add", 600),
    preparationTimeMinutes: 18,
    featuredPosition: 5,
    phone: "01793000005",
    ownerName: "Tanvir Ahmed",
    ownerPhone: "01792000005",
    ownerEmail: "owner.burger@foodbela.test",
    categories: [
      {
        name: "Burgers",
        description: "Juicy burgers and combos.",
        items: [
          {
            name: "Double Smash Burger",
            description: "Two patties, cheese and house sauce.",
            price: 330,
            image: image("photo-1550547660-d9450f859349"),
            popular: true,
            variant: true,
          },
          {
            name: "Crispy Chicken Burger",
            description: "Crunchy chicken fillet with spicy mayo.",
            price: 260,
            image: image("photo-1571091718767-18b5b1457add"),
          },
        ],
      },
      {
        name: "Fries",
        description: "Loaded and classic fries.",
        items: [
          {
            name: "Loaded Cheese Fries",
            description: "Fries with cheese sauce and chicken bits.",
            price: 190,
            image: image("photo-1573080496219-bb080dd4f877"),
          },
          {
            name: "Masala Fries",
            description: "Crispy fries dusted with house spice.",
            price: 120,
            image: image("photo-1630384060421-cb20d0e0649d"),
          },
        ],
      },
      {
        name: "Shakes",
        description: "Cold milkshakes.",
        items: [
          {
            name: "Chocolate Shake",
            description: "Thick chocolate shake.",
            price: 170,
            image: image("photo-1572490122747-3968b75cc699"),
            variant: true,
          },
        ],
      },
    ],
  },
  {
    name: "Green Bowl & Juice",
    description: "Salads, wraps, grilled chicken and fresh fruit juices.",
    distanceKm: 3.45,
    bearingDeg: 75,
    cuisines: ["Healthy", "Juice", "Wraps"],
    tags: ["outside-3km", "healthy", "fresh"],
    coverImage: image("photo-1512621776951-a57141f2eefd"),
    logoImage: image("photo-1540420773420-3366772f4999", 600),
    preparationTimeMinutes: 16,
    featuredPosition: 6,
    phone: "01793000006",
    ownerName: "Mim Akter",
    ownerPhone: "01792000006",
    ownerEmail: "owner.healthy@foodbela.test",
    categories: [
      {
        name: "Bowls",
        description: "Fresh, filling bowls.",
        items: [
          {
            name: "Grilled Chicken Salad Bowl",
            description: "Chicken, greens, corn, egg and house dressing.",
            price: 290,
            image: image("photo-1512621776951-a57141f2eefd"),
            popular: true,
          },
          {
            name: "Veggie Power Bowl",
            description: "Chickpea, cucumber, tomato and herbs.",
            price: 240,
            image: image("photo-1540420773420-3366772f4999"),
          },
        ],
      },
      {
        name: "Wraps",
        description: "Soft tortilla wraps.",
        items: [
          {
            name: "Chicken Caesar Wrap",
            description: "Grilled chicken, lettuce and creamy dressing.",
            price: 220,
            image: image("photo-1626700051175-6818013e1d4f"),
          },
          {
            name: "Paneer Veg Wrap",
            description: "Paneer, vegetables and mint sauce.",
            price: 210,
            image: image("photo-1565299507177-b0ac66763828"),
          },
        ],
      },
      {
        name: "Juices",
        description: "Fresh blended drinks.",
        items: [
          {
            name: "Mango Smoothie",
            description: "Mango, yogurt and honey.",
            price: 160,
            image: image("photo-1623065422902-30a2d299bbe4"),
            variant: true,
          },
        ],
      },
    ],
  },
  {
    name: "Cafe Mishti & Bakery",
    description: "Coffee, cakes, pastries and classic Bangla sweets.",
    distanceKm: 4.15,
    bearingDeg: 220,
    cuisines: ["Cafe", "Dessert", "Bakery"],
    tags: ["outside-3km", "coffee", "sweet"],
    coverImage: image("photo-1551024506-0bccd828d307"),
    logoImage: image("photo-1565958011703-44f9829ba187", 600),
    preparationTimeMinutes: 15,
    featuredPosition: 7,
    phone: "01793000007",
    ownerName: "Sharmin Sultana",
    ownerPhone: "01792000007",
    ownerEmail: "owner.cafe@foodbela.test",
    categories: [
      {
        name: "Coffee",
        description: "Hot and iced coffee.",
        items: [
          {
            name: "Iced Latte",
            description: "Espresso, chilled milk and ice.",
            price: 180,
            image: image("photo-1461023058943-07fcbe16d735"),
            popular: true,
            variant: true,
          },
          {
            name: "Cappuccino",
            description: "Classic hot cappuccino.",
            price: 160,
            image: image("photo-1509042239860-f550ce710b93"),
          },
        ],
      },
      {
        name: "Cake & Pastry",
        description: "Bakery favourites.",
        items: [
          {
            name: "Chocolate Cake Slice",
            description: "Soft chocolate cake with ganache.",
            price: 170,
            image: image("photo-1565958011703-44f9829ba187"),
          },
          {
            name: "Butter Croissant",
            description: "Flaky bakery croissant.",
            price: 130,
            image: image("photo-1555507036-ab1f4038808a"),
          },
        ],
      },
      {
        name: "Mishti",
        description: "Bangla sweets.",
        items: [
          {
            name: "Roshmalai Cup",
            description: "Soft sweets in chilled milk cream.",
            price: 140,
            image: image("photo-1606313564200-e75d5e30476c"),
          },
        ],
      },
    ],
  },
  {
    name: "River Spice Seafood",
    description: "Prawn, fish fry and grilled seafood meals.",
    distanceKm: 4.75,
    bearingDeg: 15,
    cuisines: ["Seafood", "Grill", "Bangla"],
    tags: ["outside-3km", "seafood", "dinner"],
    coverImage: image("photo-1559847844-5315695dadae"),
    logoImage: image("photo-1615141982883-c7ad0e69fd62", 600),
    preparationTimeMinutes: 28,
    featuredPosition: 8,
    phone: "01793000008",
    ownerName: "Mahmud Karim",
    ownerPhone: "01792000008",
    ownerEmail: "owner.seafood@foodbela.test",
    categories: [
      {
        name: "Fish",
        description: "Fried and grilled fish.",
        items: [
          {
            name: "Grilled Rupchanda",
            description: "Whole grilled fish with garlic chilli sauce.",
            price: 420,
            image: image("photo-1559847844-5315695dadae"),
            popular: true,
          },
          {
            name: "Fish Fry Rice Set",
            description: "Fish fry, rice, dal and salad.",
            price: 280,
            image: image("photo-1604908176997-125f25cc6f3d"),
          },
        ],
      },
      {
        name: "Prawn",
        description: "Prawn specials.",
        items: [
          {
            name: "Butter Garlic Prawn",
            description: "Prawns tossed with garlic butter.",
            price: 390,
            image: image("photo-1565680018434-b513d5e5fd47"),
          },
          {
            name: "Prawn Curry",
            description: "Creamy coconut prawn curry.",
            price: 350,
            image: image("photo-1603133872878-684f208fb84b"),
          },
        ],
      },
      {
        name: "Combos",
        description: "Seafood share plates.",
        items: [
          {
            name: "Seafood Combo Box",
            description: "Fish fry, prawn, fries and salad.",
            price: 560,
            image: image("photo-1615141982883-c7ad0e69fd62"),
            variant: true,
          },
        ],
      },
    ],
  },
  {
    name: "Campus Street Bites",
    description: "Fuchka, chotpoti, rolls and fast street snacks for evening cravings.",
    distanceKm: 6.25,
    bearingDeg: 110,
    cuisines: ["Street Food", "Snacks", "Rolls"],
    tags: ["outside-5km", "street-food", "evening"],
    coverImage: image("photo-1601050690597-df0568f70950"),
    logoImage: image("photo-1604908177522-4024a1cf0b63", 600),
    preparationTimeMinutes: 14,
    featuredPosition: 9,
    phone: "01793000009",
    ownerName: "Jamil Hossain",
    ownerPhone: "01792000009",
    ownerEmail: "owner.street@foodbela.test",
    categories: [
      {
        name: "Street Specials",
        description: "Tangy snacks and local favourites.",
        items: [
          {
            name: "Fuchka Platter",
            description: "Crispy shells, potato mix, tamarind water and chutney.",
            price: 140,
            image: image("photo-1601050690597-df0568f70950"),
            popular: true,
          },
          {
            name: "Chotpoti Bowl",
            description: "Chickpea, egg, potato and spicy tamarind sauce.",
            price: 130,
            image: image("photo-1627308595229-7830a5c91f9f"),
          },
        ],
      },
      {
        name: "Rolls",
        description: "Paratha rolls for quick meals.",
        items: [
          {
            name: "Chicken Kathi Roll",
            description: "Chicken, onion, sauce and soft paratha.",
            price: 190,
            image: image("photo-1565299507177-b0ac66763828"),
            variant: true,
          },
          {
            name: "Egg Cheese Roll",
            description: "Egg roll with cheese and house sauce.",
            price: 160,
            image: image("photo-1626700051175-6818013e1d4f"),
          },
        ],
      },
      {
        name: "Tea",
        description: "Tea stall drinks.",
        items: [
          {
            name: "Masala Milk Tea",
            description: "Hot tea with milk and spice.",
            price: 40,
            image: image("photo-1571934811356-5cc061b6821f"),
          },
        ],
      },
    ],
  },
  {
    name: "Highway Grill Station",
    description: "BBQ chicken, steak plates and grilled family boxes outside the core area.",
    distanceKm: 8.4,
    bearingDeg: 300,
    cuisines: ["BBQ", "Grill", "Steak"],
    tags: ["outside-5km", "bbq", "family-box"],
    coverImage: image("photo-1529193591184-b1d58069ecdd"),
    logoImage: image("photo-1544025162-d76694265947", 600),
    preparationTimeMinutes: 35,
    featuredPosition: 10,
    phone: "01793000010",
    ownerName: "Arafat Khan",
    ownerPhone: "01792000010",
    ownerEmail: "owner.grill@foodbela.test",
    categories: [
      {
        name: "BBQ",
        description: "Flame grilled items.",
        items: [
          {
            name: "BBQ Chicken Quarter",
            description: "Smoky chicken with rice, sauce and salad.",
            price: 340,
            image: image("photo-1529193591184-b1d58069ecdd"),
            popular: true,
          },
          {
            name: "Beef Steak Plate",
            description: "Grilled beef, mashed potato and vegetables.",
            price: 620,
            image: image("photo-1544025162-d76694265947"),
            variant: true,
          },
        ],
      },
      {
        name: "Family Boxes",
        description: "Shareable grill boxes.",
        items: [
          {
            name: "Mixed Grill Box",
            description: "Chicken, beef kebab, fries and dips.",
            price: 980,
            image: image("photo-1555939594-58d7cb561ad1"),
            variant: true,
          },
          {
            name: "Wings Bucket",
            description: "Spicy grilled wings with two dips.",
            price: 460,
            image: image("photo-1527477396000-e27163b481c2"),
          },
        ],
      },
      {
        name: "Cold Drinks",
        description: "Drinks for grilled meals.",
        items: [
          {
            name: "Mint Lemonade",
            description: "Cold lemon drink with mint.",
            price: 120,
            image: image("photo-1621263764928-df1444c5e859"),
          },
        ],
      },
    ],
  },
]

function expansionCategories(primaryName: string, heroItem: string, sideItem: string, imageId: string): SeedCategory[] {
  return [
    {
      name: primaryName,
      description: "Best sellers for this service area.",
      items: [
        {
          name: heroItem,
          description: "Freshly prepared local favourite for daily orders.",
          price: 260,
          image: image(imageId),
          popular: true,
          variant: true,
        },
        {
          name: sideItem,
          description: "A simple add-on that works well with the main meal.",
          price: 160,
          image: image("photo-1540189549336-e6e99c3679fe"),
        },
      ],
    },
    {
      name: "Drinks & Extras",
      description: "Small extras for checkout testing.",
      items: [
        {
          name: "Fresh Lemon Drink",
          description: "Cold lemon drink with light sweetness.",
          price: 80,
          image: image("photo-1621263764928-df1444c5e859"),
        },
        {
          name: "House Dessert Cup",
          description: "Small sweet cup after the meal.",
          price: 120,
          image: image("photo-1551024506-0bccd828d307"),
        },
      ],
    },
  ]
}

const expansionRestaurantSeeds: SeedRestaurant[] = [
  {
    name: "Kendua Fresh Kitchen",
    description: "Rice meals, chicken curry and local lunch plates in Kendua.",
    zoneSlug: KENDUA_ZONE_SLUG,
    city: "Kendua",
    distanceKm: 0.7,
    bearingDeg: 80,
    cuisines: ["Bangla", "Lunch", "Chicken"],
    tags: ["kendua", "lunch", "local"],
    coverImage: image("photo-1562967916-eb82221dfb36"),
    logoImage: image("photo-1604908176997-125f25cc6f3d", 600),
    preparationTimeMinutes: 24,
    featuredPosition: 11,
    phone: "01793000101",
    ownerName: "Morshed Alam",
    ownerPhone: "01792000101",
    ownerEmail: "owner.kendua.kitchen@foodbela.test",
    categories: expansionCategories("Rice Plates", "Kendua Chicken Rice", "Dal Bhorta Bowl", "photo-1562967916-eb82221dfb36"),
  },
  {
    name: "Kendua Sweets & Snacks",
    description: "Mishti, rolls, tea and evening snacks for Kendua customers.",
    zoneSlug: KENDUA_ZONE_SLUG,
    city: "Kendua",
    distanceKm: 2.2,
    bearingDeg: 210,
    cuisines: ["Sweets", "Snacks", "Tea"],
    tags: ["kendua", "snacks", "evening"],
    coverImage: image("photo-1551024506-0bccd828d307"),
    logoImage: image("photo-1578985545062-69928b1d9587", 600),
    preparationTimeMinutes: 16,
    featuredPosition: 12,
    phone: "01793000102",
    ownerName: "Rumana Akter",
    ownerPhone: "01792000102",
    ownerEmail: "owner.kendua.sweets@foodbela.test",
    categories: expansionCategories("Sweets & Rolls", "Roshmalai Snack Box", "Chicken Mini Roll", "photo-1551024506-0bccd828d307"),
  },
  {
    name: "Mohanganj Haor Fish House",
    description: "Fresh fish meals and haor-style curry near Mohanganj.",
    zoneSlug: MOHANGANJ_ZONE_SLUG,
    city: "Mohanganj",
    distanceKm: 1.1,
    bearingDeg: 35,
    cuisines: ["Fish", "Bangla", "Rice"],
    tags: ["mohanganj", "fish", "haor"],
    coverImage: image("photo-1615141982883-c7ad0e69fd62"),
    logoImage: image("photo-1604908176997-125f25cc6f3d", 600),
    preparationTimeMinutes: 28,
    featuredPosition: 13,
    phone: "01793000103",
    ownerName: "Abdul Hakim",
    ownerPhone: "01792000103",
    ownerEmail: "owner.mohanganj.fish@foodbela.test",
    categories: expansionCategories("Fish Meals", "Haor Fish Rice Plate", "Prawn Bhuna Cup", "photo-1615141982883-c7ad0e69fd62"),
  },
  {
    name: "Mohanganj Tea & Grill",
    description: "Quick grilled snacks, tea and wraps for rider dispatch testing.",
    zoneSlug: MOHANGANJ_ZONE_SLUG,
    city: "Mohanganj",
    distanceKm: 3.7,
    bearingDeg: 160,
    cuisines: ["Grill", "Tea", "Wraps"],
    tags: ["mohanganj", "grill", "tea"],
    coverImage: image("photo-1529193591184-b1d58069ecdd"),
    logoImage: image("photo-1571934811356-5cc061b6821f", 600),
    preparationTimeMinutes: 20,
    featuredPosition: 14,
    phone: "01793000104",
    ownerName: "Nahid Islam",
    ownerPhone: "01792000104",
    ownerEmail: "owner.mohanganj.grill@foodbela.test",
    categories: expansionCategories("Grill Snacks", "Tea Grill Wrap", "Masala Fries", "photo-1529193591184-b1d58069ecdd"),
  },
  {
    name: "Durgapur Hill View Cafe",
    description: "Coffee, sandwiches and bakery items for the Durgapur zone.",
    zoneSlug: DURGAPUR_ZONE_SLUG,
    city: "Durgapur",
    distanceKm: 1.6,
    bearingDeg: 250,
    cuisines: ["Cafe", "Bakery", "Coffee"],
    tags: ["durgapur", "cafe", "bakery"],
    coverImage: image("photo-1554118811-1e0d58224f24"),
    logoImage: image("photo-1509042239860-f550ce710b93", 600),
    preparationTimeMinutes: 18,
    featuredPosition: 15,
    phone: "01793000105",
    ownerName: "Faria Sultana",
    ownerPhone: "01792000105",
    ownerEmail: "owner.durgapur.cafe@foodbela.test",
    categories: expansionCategories("Cafe Plates", "Chicken Sandwich Combo", "Chocolate Cake Cup", "photo-1554118811-1e0d58224f24"),
  },
  {
    name: "Durgapur Local Bites",
    description: "Local snacks, rolls and small meals around Durgapur market.",
    zoneSlug: DURGAPUR_ZONE_SLUG,
    city: "Durgapur",
    distanceKm: 4.4,
    bearingDeg: 20,
    cuisines: ["Snacks", "Rolls", "Bangla"],
    tags: ["durgapur", "market", "snacks"],
    coverImage: image("photo-1601050690597-df0568f70950"),
    logoImage: image("photo-1626700051175-6818013e1d4f", 600),
    preparationTimeMinutes: 15,
    featuredPosition: 16,
    phone: "01793000106",
    ownerName: "Rubel Miah",
    ownerPhone: "01792000106",
    ownerEmail: "owner.durgapur.bites@foodbela.test",
    categories: expansionCategories("Street Bites", "Durgapur Fuchka Box", "Egg Cheese Roll", "photo-1601050690597-df0568f70950"),
  },
  {
    name: "Kishoreganj Royal Biryani",
    description: "Biryani, roast and kebab meals in Kishoreganj Sadar.",
    zoneSlug: KISHOREGANJ_SADAR_ZONE_SLUG,
    city: "Kishoreganj",
    distanceKm: 0.8,
    bearingDeg: 105,
    cuisines: ["Biryani", "Kebab", "Roast"],
    tags: ["kishoreganj", "biryani", "premium"],
    coverImage: image("photo-1563379091339-03246963d4f6"),
    logoImage: image("photo-1604908176997-125f25cc6f3d", 600),
    preparationTimeMinutes: 30,
    featuredPosition: 17,
    phone: "01793000107",
    ownerName: "Sakib Mahmud",
    ownerPhone: "01792000107",
    ownerEmail: "owner.kishoreganj.biryani@foodbela.test",
    categories: expansionCategories("Biryani & Roast", "Royal Kacchi Box", "Chicken Roast Piece", "photo-1563379091339-03246963d4f6"),
  },
  {
    name: "Kishoreganj Cafe Corner",
    description: "Cafe food, pasta, drinks and desserts for Kishoreganj.",
    zoneSlug: KISHOREGANJ_SADAR_ZONE_SLUG,
    city: "Kishoreganj",
    distanceKm: 3.2,
    bearingDeg: 270,
    cuisines: ["Cafe", "Pasta", "Dessert"],
    tags: ["kishoreganj", "cafe", "dessert"],
    coverImage: image("photo-1554118811-1e0d58224f24"),
    logoImage: image("photo-1509042239860-f550ce710b93", 600),
    preparationTimeMinutes: 22,
    featuredPosition: 18,
    phone: "01793000108",
    ownerName: "Nusrat Jahan",
    ownerPhone: "01792000108",
    ownerEmail: "owner.kishoreganj.cafe@foodbela.test",
    categories: expansionCategories("Cafe Mains", "Creamy Pasta Bowl", "Cold Coffee Cup", "photo-1554118811-1e0d58224f24"),
  },
  {
    name: "Dinajpur Rice & Roast",
    description: "Rice plates, roast and family meal boxes in Dinajpur Sadar.",
    zoneSlug: DINAJPUR_SADAR_ZONE_SLUG,
    city: "Dinajpur",
    distanceKm: 1.4,
    bearingDeg: 45,
    cuisines: ["Bangla", "Roast", "Rice"],
    tags: ["dinajpur", "rice", "roast"],
    coverImage: image("photo-1562967916-eb82221dfb36"),
    logoImage: image("photo-1555939594-58d7cb561ad1", 600),
    preparationTimeMinutes: 26,
    featuredPosition: 19,
    phone: "01793000109",
    ownerName: "Arman Hossain",
    ownerPhone: "01792000109",
    ownerEmail: "owner.dinajpur.rice@foodbela.test",
    categories: expansionCategories("Rice & Roast", "Dinajpur Roast Rice", "Family Dal Pack", "photo-1562967916-eb82221dfb36"),
  },
  {
    name: "Dinajpur Pizza Point",
    description: "Pizza, pasta and quick western snacks for Dinajpur customers.",
    zoneSlug: DINAJPUR_SADAR_ZONE_SLUG,
    city: "Dinajpur",
    distanceKm: 3.9,
    bearingDeg: 190,
    cuisines: ["Pizza", "Pasta", "Fast Food"],
    tags: ["dinajpur", "pizza", "fast-food"],
    coverImage: image("photo-1565299624946-b28f40a0ae38"),
    logoImage: image("photo-1513104890138-7c749659a591", 600),
    preparationTimeMinutes: 25,
    featuredPosition: 20,
    phone: "01793000110",
    ownerName: "Mehedi Hasan",
    ownerPhone: "01792000110",
    ownerEmail: "owner.dinajpur.pizza@foodbela.test",
    categories: expansionCategories("Pizza & Pasta", "Chicken Cheese Pizza", "Garlic Bread Bites", "photo-1565299624946-b28f40a0ae38"),
  },
]

const allRestaurantSeeds = [...restaurantSeeds, ...expansionRestaurantSeeds]

async function syncCoreIndexes() {
  await Promise.all([
    AdminModel.syncIndexes(),
    OwnerModel.syncIndexes(),
    RiderModel.syncIndexes(),
    RestaurantModel.syncIndexes(),
    ServiceDistrictModel.syncIndexes(),
    ServiceZoneModel.syncIndexes(),
    OpeningHoursModel.syncIndexes(),
    PayoutMethodModel.syncIndexes(),
    CategoryModel.syncIndexes(),
    MenuItemModel.syncIndexes(),
    CustomerModel.syncIndexes(),
    RestaurantCollectionModel.syncIndexes(),
    VoucherModel.syncIndexes(),
  ])
}

async function seedAdmin() {
  return AdminModel.findOneAndUpdate(
    { email: ADMIN_EMAIL },
    {
      fullName: env.ADMIN_BOOTSTRAP_NAME,
      email: ADMIN_EMAIL,
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      role: "admin",
      status: "active",
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
}

function buildServiceAreaSnapshot(zone: mongoose.Document) {
  const zoneObject = zone.toObject() as Record<string, any>
  return {
    districtId: String(zoneObject.districtId ?? ""),
    districtName: String(zoneObject.districtName ?? ""),
    zoneId: String(zoneObject._id ?? ""),
    zoneName: String(zoneObject.name ?? ""),
    zoneSlug: String(zoneObject.slug ?? ""),
    center: zoneObject.center ?? null,
    radiusKm: Number(zoneObject.radiusKm ?? 0),
    delivery: zoneObject.delivery ?? {},
    dispatch: zoneObject.dispatch ?? {},
  }
}

async function seedServiceAreas(): Promise<SeedServiceAreas> {
  const districtDocs = await ServiceDistrictModel.create(SERVICE_DISTRICT_SEEDS)
  const districtsBySlug = new Map(
    districtDocs.map((district) => [
      String((district.toObject() as Record<string, any>).slug),
      district,
    ]),
  )
  const zoneDocs = await ServiceZoneModel.create(
    SERVICE_ZONE_SEEDS.map((zone) => {
      const district = districtsBySlug.get(zone.districtSlug)
      if (!district) {
        throw new Error(`Missing district for zone ${zone.slug}`)
      }
      const districtObject = district.toObject() as Record<string, any>
      return {
        districtId: district._id,
        districtName: String(districtObject.name ?? ""),
        name: zone.name,
        slug: zone.slug,
        status: zone.status,
        center: zone.center,
        radiusKm: zone.radiusKm,
        priority: zone.priority,
        displayOrder: zone.displayOrder,
        delivery: {
          baseFeeTaka: zone.baseFeeTaka,
          distanceSurchargeEnabled: true,
          surchargeStartsAfterKm: 2,
          surchargeStepMeters: 1000,
          surchargeAmountTaka: 10,
          maxRestaurantDistanceKm: Math.max(zone.radiusKm + 1.5, 6),
          rainSurchargeEnabled: false,
          rainSurchargeTaka: zone.rainSurchargeTaka,
        },
        dispatch: {
          autoAssignEnabled: true,
          dispatchMode: "fleet",
          primaryRiderId: "",
          primaryRiderFallbackEnabled: true,
          algorithm: "nearest_eligible_balanced",
          maxActiveOrdersPerRiderOverride: null,
          staleLocationCutoffMinutes: 20,
          retryCooldownMinutes: 3,
        },
        notes: zone.notes,
      }
    }),
  )
  const zonesBySlug = new Map(
    zoneDocs.map((zone) => [
      String((zone.toObject() as Record<string, any>).slug),
      zone,
    ]),
  )
  const netrokonaDistrict = districtsBySlug.get("netrokona")
  const netrokonaSadarZone = zonesBySlug.get(NETROKONA_SADAR_ZONE_SLUG)
  if (!netrokonaDistrict || !netrokonaSadarZone) {
    throw new Error("Showcase service area seed failed to create Netrokona Sadar.")
  }

  return {
    netrokonaDistrict,
    netrokonaSadarZone,
    districtsBySlug,
    zonesBySlug,
  }
}

async function seedRestaurant(
  seed: SeedRestaurant,
  passwordHash: string,
  index: number,
  serviceAreas: SeedServiceAreas,
) {
  const owner = await OwnerModel.create({
    fullName: seed.ownerName,
    phone: seed.ownerPhone,
    email: seed.ownerEmail,
    passwordHash,
    isPhoneVerified: true,
    status: "active",
    restaurantLifecycleStatus: "approved",
  })

  const slug = slugify(seed.name)
  const zone =
    serviceAreas.zonesBySlug.get(seed.zoneSlug ?? NETROKONA_SADAR_ZONE_SLUG) ??
    serviceAreas.netrokonaSadarZone
  const zoneObject = zone.toObject() as Record<string, any>
  const zoneCenter = (zoneObject.center ?? CENTER) as Coordinate
  const zoneRadiusKm = Number(zoneObject.radiusKm ?? 0)
  const location = pointFromCoordinate(zoneCenter, seed.distanceKm, seed.bearingDeg)
  const serviceArea =
    seed.distanceKm <= zoneRadiusKm
      ? buildServiceAreaSnapshot(zone)
      : {}
  const city = seed.city ?? String(zoneObject.districtName ?? "Netrokona")
  const restaurant = await RestaurantModel.create({
    ownerId: owner._id,
    name: seed.name,
    slug,
    description: seed.description,
    preparationTimeMinutes: seed.preparationTimeMinutes,
    cuisineTypes: seed.cuisines,
    tags: seed.tags,
    logo: buildMediaAsset(`showcase/restaurants/${slug}/logo`, seed.logoImage),
    coverImage: buildMediaAsset(`showcase/restaurants/${slug}/cover`, seed.coverImage),
    contact: {
      phone: seed.phone,
      email: seed.ownerEmail,
    },
    address: {
      address: `${seed.name} Road ${index + 1}, ${city}`,
      city,
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
      isFeatured: true,
      featuredSortOrder: seed.featuredPosition,
    },
    commercial: {
      commissionRate: 15,
      commissionHistory: [
        {
          previousRate: null,
          rate: 15,
          changedByAdminId: "",
          note: "Showcase seed",
          createdAt: new Date(),
        },
      ],
    },
    settings: {
      orderSettings: {
        autoAcceptOrders: false,
      },
      notifications: {
        newOrder: true,
        cancellation: true,
        payouts: true,
        support: true,
      },
    },
    profileCompletion: {
      percentage: 100,
      completedWeight: 100,
    },
  })

  owner.activeRestaurantId = restaurant._id
  await owner.save()

  await Promise.all([
    OpeningHoursModel.create({
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
    }),
    PayoutMethodModel.create({
      restaurantId: restaurant._id,
      type: "bkash",
      accountName: seed.ownerName,
      accountNumber: seed.ownerPhone,
      bankName: "",
      branchName: "",
      isVerified: true,
      pendingAccountNumber: null,
      verificationSource: "showcase_seed",
      verifiedAt: new Date(),
    }),
  ])

  const categoryDocs = []
  for (let categoryIndex = 0; categoryIndex < seed.categories.length; categoryIndex += 1) {
    const categorySeed = seed.categories[categoryIndex]
    const category = await CategoryModel.create({
      restaurantId: restaurant._id,
      name: categorySeed.name,
      slug: slugify(categorySeed.name),
      description: categorySeed.description,
      status: "active",
      displayOrder: categoryIndex + 1,
    })
    categoryDocs.push(category)

    for (let itemIndex = 0; itemIndex < categorySeed.items.length; itemIndex += 1) {
      const itemSeed = categorySeed.items[itemIndex]
      await MenuItemModel.create({
        restaurantId: restaurant._id,
        categoryId: category._id,
        name: itemSeed.name,
        slug: slugify(itemSeed.name),
        description: itemSeed.description,
        images: [
          {
            url: itemSeed.image,
            publicId: `showcase/menu/${slug}/${slugify(itemSeed.name)}`,
          },
        ],
        status: "active",
        availability: "available",
        kind: itemSeed.variant ? "variant" : "simple",
        basePrice: itemSeed.price,
        variants: buildVariants(itemSeed.variant),
        addOnGroups: buildAddOns(categorySeed.name),
        isPopular: itemSeed.popular === true,
      })
    }
  }

  return {
    owner,
    restaurant,
    categories: categoryDocs,
    distanceKm: seed.distanceKm,
  }
}

async function seedCollections(restaurants: Array<{ restaurant: mongoose.Document; distanceKm: number }>) {
  const restaurantIds = restaurants.map(({ restaurant }) => restaurant._id)
  const insideThreeKm = restaurants
    .filter(({ distanceKm }) => distanceKm <= 3)
    .map(({ restaurant }) => restaurant._id)
  const outsideThreeWithinFiveKm = restaurants
    .filter(({ distanceKm }) => distanceKm > 3 && distanceKm <= 5)
    .map(({ restaurant }) => restaurant._id)
  const outsideFiveKm = restaurants
    .filter(({ distanceKm }) => distanceKm > 5)
    .map(({ restaurant }) => restaurant._id)

  await RestaurantCollectionModel.create([
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
      key: "inside_3km_showcase",
      name: "Inside 3km Showcase",
      type: "static",
      restaurantIds: insideThreeKm,
      sortOrders: insideThreeKm.map((restaurantId, index) => ({
        restaurantId,
        order: index + 1,
      })),
      isActive: true,
    },
    {
      key: "outside_3km_within_5km_showcase",
      name: "Outside 3km, Within 5km",
      type: "static",
      restaurantIds: outsideThreeWithinFiveKm,
      sortOrders: outsideThreeWithinFiveKm.map((restaurantId, index) => ({
        restaurantId,
        order: index + 1,
      })),
      isActive: true,
    },
    {
      key: "outside_5km_showcase",
      name: "Outside 5km Showcase",
      type: "static",
      restaurantIds: outsideFiveKm,
      sortOrders: outsideFiveKm.map((restaurantId, index) => ({
        restaurantId,
        order: index + 1,
      })),
      isActive: true,
    },
  ])
}

async function seedOffers(adminId: string, restaurants: Array<{ restaurant: mongoose.Document }>) {
  const now = new Date()
  const endsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const [first, second, third] = restaurants

  await VoucherModel.create([
    {
      restaurantId: first.restaurant._id,
      scopeType: "restaurant",
      selectedRestaurantIds: [],
      audienceType: "all_users",
      display: {
        showOnHome: true,
        showInOfferStrip: true,
        placement: "after_banner",
        variant: "image",
        position: 1,
        title: "Launch 15% off",
        subtitle: "Try Bangla favourites near you.",
        imageUrl: image("photo-1604908176997-125f25cc6f3d"),
        ctaLabel: "Order now",
        ctaPath: "/restaurants",
      },
      createdByType: "admin",
      createdById: adminId,
      fundedBy: "platform",
      ownerSharePercent: 0,
      platformSharePercent: 100,
      mode: "coupon",
      type: "percentage",
      name: "Launch 15% Off",
      code: "SHOW15",
      discountValue: 15,
      maxDiscountAmount: 120,
      minimumOrderAmount: 250,
      maxTotalUses: 500,
      maxUsesPerUser: 3,
      allowRepeatUsage: true,
      status: "Active",
      startsAt: now,
      endsAt,
    },
    {
      restaurantId: null,
      scopeType: "selected_restaurants",
      selectedRestaurantIds: [second.restaurant._id, third.restaurant._id],
      audienceType: "all_users",
      display: {
        showOnHome: true,
        showInOfferStrip: true,
        placement: "offers_row",
        variant: "block",
        position: 2,
        title: "Free delivery picks",
        subtitle: "Selected restaurants for local testing.",
        imageUrl: image("photo-1565299624946-b28f40a0ae38"),
        ctaLabel: "View deals",
        ctaPath: "/restaurants",
      },
      createdByType: "admin",
      createdById: adminId,
      fundedBy: "platform",
      ownerSharePercent: 0,
      platformSharePercent: 100,
      mode: "auto",
      type: "free_delivery",
      name: "Free Delivery Showcase",
      code: "",
      discountValue: 0,
      maxDiscountAmount: 80,
      minimumOrderAmount: 300,
      maxTotalUses: 500,
      maxUsesPerUser: 3,
      allowRepeatUsage: true,
      status: "Active",
      startsAt: now,
      endsAt,
    },
  ])
}

function demoRiderPhone(index: number) {
  return `01794${String(index + 1).padStart(6, "0")}`
}

function demoCustomerPhone(index: number) {
  return `01795${String(index + 1).padStart(6, "0")}`
}

async function seedRiders(passwordHash: string, serviceAreas: SeedServiceAreas) {
  const riderNames = [
    "Arif",
    "Hasan",
    "Bijoy",
    "Nayeem",
    "Sajib",
    "Ratul",
    "Farhan",
    "Milon",
    "Sohan",
    "Rony",
    "Parvez",
    "Mamun",
  ]
  const riderSeeds = SERVICE_ZONE_SEEDS.flatMap((zoneSeed, zoneIndex) => {
    const zone = serviceAreas.zonesBySlug.get(zoneSeed.slug)
    const district = serviceAreas.districtsBySlug.get(zoneSeed.districtSlug)
    if (!zone || !district) {
      throw new Error(`Missing rider service area for ${zoneSeed.slug}`)
    }
    const zoneObject = zone.toObject() as Record<string, any>
    const districtObject = district.toObject() as Record<string, any>
    const center = (zoneObject.center ?? CENTER) as Coordinate
    const serviceArea = {
      primaryZoneId: String(zone._id),
      primaryZoneName: String(zoneObject.name ?? zoneSeed.name),
      assignedZoneIds: [String(zone._id)],
      assignedZoneNames: [String(zoneObject.name ?? zoneSeed.name)],
      districtIds: [String(district._id)],
      districtNames: [String(districtObject.name ?? "")],
    }

    return [0, 1].map((slot) => {
      const index = zoneIndex * 2 + slot
      return {
        fullName: `${zoneSeed.name} Rider ${riderNames[index] ?? index + 1}`,
        phone: demoRiderPhone(index),
        zoneCenter: center,
        serviceArea,
        distanceKm: slot === 0 ? 0.6 : 2.4,
        bearingDeg: slot === 0 ? 25 + zoneIndex * 20 : 180 + zoneIndex * 15,
      }
    })
  })

  return RiderModel.create(
    riderSeeds.map((rider) => {
      const location = pointFromCoordinate(
        rider.zoneCenter,
        rider.distanceKm,
        rider.bearingDeg,
      )
      return {
        fullName: rider.fullName,
        phone: rider.phone,
        passwordHash,
        vehicleType: "cycle",
        activeTrackingOrderId: "",
        isAvailableForAssignments: true,
        serviceArea: rider.serviceArea,
        lastKnownLocation: {
          ...location,
          heading: rider.bearingDeg,
          accuracyMeters: 12,
          speedKmph: 0,
          updatedAt: new Date(),
        },
        isPhoneVerified: true,
        verification: {
          status: "approved",
          nationalIdNumber: `NID-SHOW-${rider.phone.slice(-4)}`,
          reviewNote: "Approved by showcase seed",
          submittedAt: new Date(),
          reviewedAt: new Date(),
          reviewedByAdminId: "showcase-seed",
        },
        payroll: {
          isPayrollEnabled: true,
          monthlySalary: 12000,
          payoutDay: 7,
          note: "Showcase rider",
          updatedByAdminId: "showcase-seed",
          updatedAt: new Date(),
        },
        status: "active",
      }
    }),
  )
}

async function seedCustomers(passwordHash: string, serviceAreas: SeedServiceAreas) {
  const customerSeeds = SERVICE_ZONE_SEEDS.map((zoneSeed, index) => {
    const zone = serviceAreas.zonesBySlug.get(zoneSeed.slug)
    if (!zone) {
      throw new Error(`Missing customer service area for ${zoneSeed.slug}`)
    }
    const zoneObject = zone.toObject() as Record<string, any>
    const center = (zoneObject.center ?? CENTER) as Coordinate
    const location = pointFromCoordinate(center, 1 + (index % 3) * 0.8, 90 + index * 35)
    return {
      fullName: `${zoneSeed.name} Demo Customer`,
      phone: demoCustomerPhone(index),
      email: `customer.${zoneSeed.slug}@foodbela.test`,
      passwordHash,
      authProviders: ["phone"],
      status: "active",
      favoriteRestaurantIds: [],
      savedLocations: [
        {
          label: "Home",
          address: `Demo Home, ${zoneSeed.name}`,
          latitude: location.latitude,
          longitude: location.longitude,
          source: "saved",
          isDefault: true,
          lastUsedAt: new Date(),
        },
      ],
    }
  })

  return CustomerModel.create(customerSeeds)
}

async function clearShowcaseData() {
  const ownerPhones = allRestaurantSeeds.map((seed) => seed.ownerPhone)
  const restaurantSlugs = allRestaurantSeeds.map((seed) => slugify(seed.name))
  const riderPhones = Array.from(
    { length: SERVICE_ZONE_SEEDS.length * 2 },
    (_, index) => demoRiderPhone(index),
  )
  const customerPhones = Array.from(
    { length: SERVICE_ZONE_SEEDS.length },
    (_, index) => demoCustomerPhone(index),
  )
  const collectionKeys = [
    "featured_restaurants",
    "inside_3km_showcase",
    "outside_3km_within_5km_showcase",
    "outside_5km_showcase",
  ]
  const owners = await OwnerModel.find({ phone: { $in: ownerPhones } })
    .select({ _id: 1 })
    .lean()
  const ownerIds = owners.map((owner) => owner._id)
  const restaurants = await RestaurantModel.find({
    $or: [{ ownerId: { $in: ownerIds } }, { slug: { $in: restaurantSlugs } }],
  })
    .select({ _id: 1 })
    .lean()
  const restaurantIds = restaurants.map((restaurant) => restaurant._id)

  await Promise.all([
    restaurantIds.length
      ? CategoryModel.deleteMany({ restaurantId: { $in: restaurantIds } })
      : Promise.resolve(),
    restaurantIds.length
      ? MenuItemModel.deleteMany({ restaurantId: { $in: restaurantIds } })
      : Promise.resolve(),
    restaurantIds.length
      ? OpeningHoursModel.deleteMany({ restaurantId: { $in: restaurantIds } })
      : Promise.resolve(),
    restaurantIds.length
      ? PayoutMethodModel.deleteMany({ restaurantId: { $in: restaurantIds } })
      : Promise.resolve(),
    restaurantIds.length
      ? RestaurantModel.deleteMany({ _id: { $in: restaurantIds } })
      : Promise.resolve(),
    OwnerModel.deleteMany({ phone: { $in: ownerPhones } }),
    RiderModel.deleteMany({ phone: { $in: riderPhones } }),
    CustomerModel.deleteMany({ phone: { $in: customerPhones } }),
    RestaurantCollectionModel.deleteMany({ key: { $in: collectionKeys } }),
    VoucherModel.deleteMany({
      name: { $in: ["Launch 15% Off", "Free Delivery Showcase"] },
    }),
    ServiceZoneModel.deleteMany({
      slug: {
        $in: SERVICE_ZONE_SLUGS,
      },
    }),
    ServiceDistrictModel.deleteMany({
      slug: { $in: SERVICE_DISTRICT_SLUGS },
    }),
  ])
}

async function seedShowcaseData(mode: "reset" | "seed-only") {
  const passwordHash = await hashPassword(DEMO_PASSWORD)
  const admin = await seedAdmin()
  const serviceAreas = await seedServiceAreas()
  const restaurants = []

  for (let index = 0; index < allRestaurantSeeds.length; index += 1) {
    restaurants.push(
      await seedRestaurant(allRestaurantSeeds[index], passwordHash, index, serviceAreas),
    )
  }

  await Promise.all([
    seedCollections(restaurants),
    seedOffers(admin.id, restaurants),
    seedRiders(passwordHash, serviceAreas),
    seedCustomers(passwordHash, serviceAreas),
  ])

  await syncCoreIndexes()

  console.log(
    mode === "reset"
      ? "Showcase database reset complete"
      : "Showcase seed complete",
  )
  console.log(`Center: ${CENTER.latitude},${CENTER.longitude}`)
  console.log(`Admin: ${ADMIN_EMAIL}`)
  console.log(`Admin password: ${ADMIN_PASSWORD}`)
  console.log(`Owner/rider/customer demo password: ${DEMO_PASSWORD}`)
  console.log("Owner phones:", allRestaurantSeeds.map((seed) => seed.ownerPhone).join(", "))
  console.log(
    "Rider phones:",
    Array.from({ length: SERVICE_ZONE_SEEDS.length * 2 }, (_, index) => demoRiderPhone(index)).join(", "),
  )
  console.log(
    "Customer phones:",
    Array.from({ length: SERVICE_ZONE_SEEDS.length }, (_, index) => demoCustomerPhone(index)).join(", "),
  )
  console.table(
    allRestaurantSeeds.map((seed) => ({
      restaurant: seed.name,
      zone: seed.zoneSlug ?? NETROKONA_SADAR_ZONE_SLUG,
      distanceKm: seed.distanceKm,
      ownerPhone: seed.ownerPhone,
      phone: seed.phone,
    })),
  )
}

async function resetAndSeed() {
  assertResetAllowed()
  await connectDatabase()
  await mongoose.connection.dropDatabase()
  await syncCoreIndexes()
  await seedShowcaseData("reset")
}

async function seedOnly() {
  await connectDatabase()
  await clearShowcaseData()
  await syncCoreIndexes()
  await seedShowcaseData("seed-only")
}

const isSeedOnly = process.argv.includes("--seed-only")

;(isSeedOnly ? seedOnly() : resetAndSeed())
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await mongoose.disconnect()
  })
