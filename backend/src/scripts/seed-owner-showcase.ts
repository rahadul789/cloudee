import mongoose from "mongoose";

import { connectDatabase } from "../config/db";
import { logger } from "../config/logger";
import {
  OnboardingDraftModel,
  OpeningHoursModel,
  OwnerModel,
  PayoutMethodModel,
  RestaurantModel,
} from "../modules/auth/auth.model";
import { hashPassword } from "../modules/auth/auth.utils";
import {
  RestaurantCollectionModel,
  VoucherModel,
} from "../modules/customer/customer.model";
import {
  CategoryModel,
  MenuItemModel,
} from "../modules/owner/operational.model";

type ShowcaseMenuItem = {
  name: string;
  slug: string;
  description: string;
  imageUrl: string;
  basePrice: number;
  kind?: "simple" | "variant";
  availability?: "available" | "unavailable";
  isPopular?: boolean;
  variants?: Array<{
    name: string;
    minSelect?: number;
    maxSelect?: number;
    options: Array<{ label: string; priceDelta: number }>;
  }>;
  addOnGroups?: Array<{
    name: string;
    minSelect?: number;
    maxSelect?: number;
    options: Array<{ label: string; price: number }>;
  }>;
};

type ShowcaseCategory = {
  name: string;
  slug: string;
  description: string;
  displayOrder: number;
  items: ShowcaseMenuItem[];
};

type ShowcaseVoucher = {
  name: string;
  code?: string;
  mode: "auto" | "coupon";
  type: "flat" | "percentage" | "free_delivery";
  discountValue: number;
  fundedBy: "owner" | "platform" | "shared";
  applicability?: "all" | "categories" | "items";
  categorySlugs?: string[];
  itemSlugs?: string[];
  minimumOrderAmount?: number;
  priority?: number;
};

type ShowcaseRestaurant = {
  owner: {
    fullName: string;
    phone: string;
    email: string;
  };
  restaurant: {
    name: string;
    slug: string;
    description: string;
    preparationTimeMinutes: number;
    cuisineTypes: string[];
    tags: string[];
    logoUrl: string;
    coverImageUrl: string;
    phone: string;
    email: string;
    address: string;
    city: string;
    latitude: number;
    longitude: number;
    isOnline: boolean;
    isVisible: boolean;
    featuredSortOrder: number;
  };
  payout: {
    type: "bkash" | "bank";
    accountName: string;
    accountNumber: string;
    bankName?: string;
    branchName?: string;
  };
  openingHours: Array<{
    day: string;
    isOpen: boolean;
    is24Hours: boolean;
    timeSlots: Array<{ id: string; startTime: string; endTime: string }>;
  }>;
  categories: ShowcaseCategory[];
  vouchers: ShowcaseVoucher[];
};

// const OWNER_PASSWORD = "Foodbela@123"
const OWNER_PASSWORD = "Foodbela@123";

const SHARED_WEEKLY_SCHEDULE: ShowcaseRestaurant["openingHours"] = [
  {
    day: "monday",
    isOpen: true,
    is24Hours: false,
    timeSlots: [{ id: "mon-lunch", startTime: "10:30", endTime: "22:00" }],
  },
  {
    day: "tuesday",
    isOpen: true,
    is24Hours: false,
    timeSlots: [{ id: "tue-lunch", startTime: "10:30", endTime: "22:00" }],
  },
  {
    day: "wednesday",
    isOpen: true,
    is24Hours: false,
    timeSlots: [{ id: "wed-lunch", startTime: "10:30", endTime: "22:00" }],
  },
  {
    day: "thursday",
    isOpen: true,
    is24Hours: false,
    timeSlots: [{ id: "thu-lunch", startTime: "10:30", endTime: "22:30" }],
  },
  {
    day: "friday",
    isOpen: true,
    is24Hours: false,
    timeSlots: [{ id: "fri-split", startTime: "15:00", endTime: "23:00" }],
  },
  {
    day: "saturday",
    isOpen: true,
    is24Hours: false,
    timeSlots: [{ id: "sat-lunch", startTime: "10:00", endTime: "23:00" }],
  },
  {
    day: "sunday",
    isOpen: true,
    is24Hours: false,
    timeSlots: [{ id: "sun-lunch", startTime: "10:00", endTime: "22:30" }],
  },
];

const showcaseRestaurants: ShowcaseRestaurant[] = [
  {
    owner: {
      fullName: "Mahmud Hasan",
      phone: "01711001001",
      email: "mahmud@riverstonekitchen.com",
    },
    restaurant: {
      name: "Riverstone Kitchen",
      slug: "riverstone-kitchen",
      description:
        "A polished casual kitchen serving smoky grills, signature burgers, loaded rice bowls, and quick comfort sides for busy lunch and dinner crowds.",
      preparationTimeMinutes: 24,
      cuisineTypes: ["Burgers", "Grill", "Rice Bowl"],
      tags: ["best seller", "grill", "late night", "family meal"],
      logoUrl:
        "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80",
      coverImageUrl:
        "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=1200&q=80",
      phone: "01711001001",
      email: "hello@riverstonekitchen.com",
      address: "College Road, Satpai, Netrokona",
      city: "Netrokona",
      latitude: 24.8799,
      longitude: 90.7288,
      isOnline: true,
      isVisible: true,
      featuredSortOrder: 1,
    },
    payout: {
      type: "bkash",
      accountName: "Riverstone Kitchen",
      accountNumber: "01711001001",
    },
    openingHours: SHARED_WEEKLY_SCHEDULE,
    categories: [
      {
        name: "Signature Burgers",
        slug: "signature-burgers",
        description: "Smash burgers and stacked signature sandwiches",
        displayOrder: 1,
        items: [
          {
            name: "Smoked Beef Smash",
            slug: "smoked-beef-smash",
            description:
              "Double smashed beef, cheddar, caramelized onion, and house burger sauce.",
            imageUrl:
              "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80",
            basePrice: 289,
            kind: "variant",
            isPopular: true,
            variants: [
              {
                name: "Size",
                minSelect: 1,
                maxSelect: 1,
                options: [
                  { label: "Regular", priceDelta: 0 },
                  { label: "Double Patty", priceDelta: 110 },
                ],
              },
            ],
            addOnGroups: [
              {
                name: "Extras",
                maxSelect: 3,
                options: [
                  { label: "Cheese Slice", price: 30 },
                  { label: "Jalapeno", price: 25 },
                  { label: "Loaded Fries", price: 85 },
                ],
              },
            ],
          },
          {
            name: "Firebird Crispy Chicken",
            slug: "firebird-crispy-chicken",
            description:
              "Crispy fried chicken, slaw, pickles, and spicy aioli in a toasted brioche bun.",
            imageUrl:
              "https://images.unsplash.com/photo-1606755962773-d324e0a13086?auto=format&fit=crop&w=900&q=80",
            basePrice: 249,
            isPopular: true,
          },
        ],
      },
      {
        name: "Power Bowls",
        slug: "power-bowls",
        description: "Rice bowls with grilled protein and fresh toppings",
        displayOrder: 2,
        items: [
          {
            name: "Grilled Chicken Rice Bowl",
            slug: "grilled-chicken-rice-bowl",
            description:
              "Chargrilled chicken strips, herbed rice, sauteed vegetables, and garlic mayo drizzle.",
            imageUrl:
              "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=900&q=80",
            basePrice: 269,
            kind: "variant",
            variants: [
              {
                name: "Protein",
                minSelect: 1,
                maxSelect: 1,
                options: [
                  { label: "Chicken", priceDelta: 0 },
                  { label: "Beef", priceDelta: 80 },
                ],
              },
            ],
          },
          {
            name: "Loaded Beef Burrito Bowl",
            slug: "loaded-beef-burrito-bowl",
            description:
              "Mexican-style beef mince, corn salsa, black beans, rice, and chipotle dressing.",
            imageUrl:
              "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=80",
            basePrice: 319,
          },
        ],
      },
      {
        name: "Sides & Drinks",
        slug: "sides-and-drinks",
        description: "Quick add-ons and chilled drinks",
        displayOrder: 3,
        items: [
          {
            name: "Loaded Cajun Fries",
            slug: "loaded-cajun-fries",
            description:
              "Seasoned fries with spicy mayo and crispy onion dust.",
            imageUrl:
              "https://images.unsplash.com/photo-1576107232684-1279f390859f?auto=format&fit=crop&w=900&q=80",
            basePrice: 149,
          },
          {
            name: "Mint Lemon Cooler",
            slug: "mint-lemon-cooler",
            description: "Fresh lemon, mint, crushed ice, and soda.",
            imageUrl:
              "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=900&q=80",
            basePrice: 95,
          },
        ],
      },
    ],
    vouchers: [
      {
        name: "Lunch Saver 15%",
        mode: "auto",
        type: "percentage",
        discountValue: 15,
        fundedBy: "shared",
        minimumOrderAmount: 350,
        priority: 10,
      },
      {
        name: "Burger Night 80 Off",
        code: "RIVER80",
        mode: "coupon",
        type: "flat",
        discountValue: 80,
        fundedBy: "owner",
        minimumOrderAmount: 499,
        applicability: "categories",
        categorySlugs: ["signature-burgers"],
        priority: 20,
      },
    ],
  },
  {
    owner: {
      fullName: "Tasnim Jahan",
      phone: "01711001002",
      email: "tasnim@clayovenhouse.com",
    },
    restaurant: {
      name: "Clay Oven House",
      slug: "clay-oven-house",
      description:
        "Rich biryani platters, smoky kebabs, naan breads, and creamy curries prepared for family-style meals and hearty dinner orders.",
      preparationTimeMinutes: 32,
      cuisineTypes: ["Biryani", "Kebab", "Curry"],
      tags: ["family meal", "special occasion", "biryani", "kebab"],
      logoUrl:
        "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=400&q=80",
      coverImageUrl:
        "https://images.unsplash.com/photo-1514326640560-7d063ef2aed5?auto=format&fit=crop&w=1200&q=80",
      phone: "01711001002",
      email: "bookings@clayovenhouse.com",
      address: "Park Road, Moktarpara, Netrokona",
      city: "Netrokona",
      latitude: 24.8811,
      longitude: 90.7334,
      isOnline: false,
      isVisible: true,
      featuredSortOrder: 2,
    },
    payout: {
      type: "bank",
      accountName: "Clay Oven House",
      accountNumber: "4301270001245",
      bankName: "Dutch-Bangla Bank",
      branchName: "Netrokona Branch",
    },
    openingHours: SHARED_WEEKLY_SCHEDULE,
    categories: [
      {
        name: "Biryani Platters",
        slug: "biryani-platters",
        description: "Slow-cooked biryani and special rice platters",
        displayOrder: 1,
        items: [
          {
            name: "Kacchi Biryani Platter",
            slug: "kacchi-biryani-platter",
            description:
              "Long-grain fragrant rice, slow-cooked mutton, aloo, and aromatic spices.",
            imageUrl:
              "https://images.unsplash.com/photo-1701579231347-1a69f7f66140?auto=format&fit=crop&w=900&q=80",
            basePrice: 389,
            kind: "variant",
            isPopular: true,
            variants: [
              {
                name: "Portion",
                minSelect: 1,
                maxSelect: 1,
                options: [
                  { label: "Single", priceDelta: 0 },
                  { label: "Family Pack", priceDelta: 420 },
                ],
              },
            ],
          },
          {
            name: "Chicken Tehari",
            slug: "chicken-tehari",
            description:
              "Lightly spiced tehari rice with tender chicken and fresh coriander.",
            imageUrl:
              "https://images.unsplash.com/photo-1631515243349-e0cb75fb8d3a?auto=format&fit=crop&w=900&q=80",
            basePrice: 269,
          },
        ],
      },
      {
        name: "Tandoor & Grill",
        slug: "tandoor-and-grill",
        description: "Clay oven kebabs and grilled proteins",
        displayOrder: 2,
        items: [
          {
            name: "Hariyali Chicken Kebab",
            slug: "hariyali-chicken-kebab",
            description:
              "Juicy herb-marinated kebabs with mint chutney and onion salad.",
            imageUrl:
              "https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?auto=format&fit=crop&w=900&q=80",
            basePrice: 279,
            addOnGroups: [
              {
                name: "Bread pairings",
                maxSelect: 2,
                options: [
                  { label: "Butter Naan", price: 40 },
                  { label: "Garlic Naan", price: 55 },
                ],
              },
            ],
          },
          {
            name: "Seekh Kebab Duo",
            slug: "seekh-kebab-duo",
            description:
              "Two smoky beef seekh kebabs with pickled onion and green chutney.",
            imageUrl:
              "https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?auto=format&fit=crop&w=900&q=80",
            basePrice: 299,
          },
        ],
      },
      {
        name: "Curries & Bread",
        slug: "curries-and-bread",
        description: "Signature curry pairings and breads",
        displayOrder: 3,
        items: [
          {
            name: "Butter Chicken",
            slug: "butter-chicken",
            description:
              "Tomato butter curry with charred chicken tikka pieces.",
            imageUrl:
              "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=900&q=80",
            basePrice: 349,
          },
          {
            name: "Garlic Butter Naan",
            slug: "garlic-butter-naan",
            description: "Soft naan brushed with garlic butter and parsley.",
            imageUrl:
              "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=900&q=80",
            basePrice: 65,
            availability: "available",
          },
        ],
      },
    ],
    vouchers: [
      {
        name: "Weekend Biryani Free Delivery",
        mode: "auto",
        type: "free_delivery",
        discountValue: 0,
        fundedBy: "platform",
        minimumOrderAmount: 300,
        priority: 10,
      },
      {
        name: "Clay Curry 20%",
        code: "CLAY20",
        mode: "coupon",
        type: "percentage",
        discountValue: 20,
        fundedBy: "owner",
        applicability: "items",
        itemSlugs: ["butter-chicken"],
        minimumOrderAmount: 250,
        priority: 18,
      },
    ],
  },
  {
    owner: {
      fullName: "Sadia Rahman",
      phone: "01711001003",
      email: "sadia@harvestbakehouse.com",
    },
    restaurant: {
      name: "Harvest Bakehouse",
      slug: "harvest-bakehouse",
      description:
        "Coffee, brunch plates, artisan pastries, and premium desserts for lighter daytime orders and calm evening cravings.",
      preparationTimeMinutes: 18,
      cuisineTypes: ["Cafe", "Dessert", "Brunch"],
      tags: ["coffee", "dessert", "breakfast", "premium"],
      logoUrl:
        "https://images.unsplash.com/photo-1445116572660-236099ec97a0?auto=format&fit=crop&w=400&q=80",
      coverImageUrl:
        "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80",
      phone: "01711001003",
      email: "hello@harvestbakehouse.com",
      address: "Station Road, Chakpara, Netrokona",
      city: "Netrokona",
      latitude: 24.8765,
      longitude: 90.7301,
      isOnline: true,
      isVisible: true,
      featuredSortOrder: 3,
    },
    payout: {
      type: "bkash",
      accountName: "Harvest Bakehouse",
      accountNumber: "01711001003",
    },
    openingHours: SHARED_WEEKLY_SCHEDULE.map((day) =>
      day.day === "friday"
        ? {
            ...day,
            timeSlots: [
              { id: "fri-evening", startTime: "16:00", endTime: "23:00" },
            ],
          }
        : day,
    ),
    categories: [
      {
        name: "Brunch Plates",
        slug: "brunch-plates",
        description: "Eggs, toast, and fresh brunch combos",
        displayOrder: 1,
        items: [
          {
            name: "Sourdough Chicken Melt",
            slug: "sourdough-chicken-melt",
            description:
              "Toasted sourdough with grilled chicken, cheddar, and garlic herb butter.",
            imageUrl:
              "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=900&q=80",
            basePrice: 259,
          },
          {
            name: "Eggs & Avocado Toast",
            slug: "eggs-avocado-toast",
            description:
              "Poached eggs, smashed avocado, and feta on toasted sourdough.",
            imageUrl:
              "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=900&q=80",
            basePrice: 219,
          },
        ],
      },
      {
        name: "Coffee & Shakes",
        slug: "coffee-and-shakes",
        description: "Signature brews and cold sweet drinks",
        displayOrder: 2,
        items: [
          {
            name: "Iced Vanilla Latte",
            slug: "iced-vanilla-latte",
            description:
              "Cold espresso, vanilla syrup, and creamy milk over ice.",
            imageUrl:
              "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=900&q=80",
            basePrice: 165,
            kind: "variant",
            variants: [
              {
                name: "Cup size",
                minSelect: 1,
                maxSelect: 1,
                options: [
                  { label: "Regular", priceDelta: 0 },
                  { label: "Large", priceDelta: 40 },
                ],
              },
            ],
          },
          {
            name: "Chocolate Hazelnut Shake",
            slug: "chocolate-hazelnut-shake",
            description:
              "Thick shake blended with chocolate gelato and roasted hazelnut paste.",
            imageUrl:
              "https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=900&q=80",
            basePrice: 210,
            isPopular: true,
          },
        ],
      },
      {
        name: "Pastries & Desserts",
        slug: "pastries-and-desserts",
        description: "Baked sweets, cakes, and dessert plates",
        displayOrder: 3,
        items: [
          {
            name: "Burnt Basque Cheesecake",
            slug: "burnt-basque-cheesecake",
            description: "Creamy cheesecake slice with a rich caramelized top.",
            imageUrl:
              "https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&w=900&q=80",
            basePrice: 195,
            isPopular: true,
          },
          {
            name: "Cinnamon Butter Croissant",
            slug: "cinnamon-butter-croissant",
            description: "Flaky butter croissant with cinnamon sugar dust.",
            imageUrl:
              "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=80",
            basePrice: 115,
            availability: "unavailable",
          },
        ],
      },
    ],
    vouchers: [
      {
        name: "Coffee Combo 60 Off",
        code: "BREW60",
        mode: "coupon",
        type: "flat",
        discountValue: 60,
        fundedBy: "shared",
        applicability: "categories",
        categorySlugs: ["coffee-and-shakes"],
        minimumOrderAmount: 280,
        priority: 12,
      },
      {
        name: "Dessert Time 10%",
        mode: "auto",
        type: "percentage",
        discountValue: 10,
        fundedBy: "owner",
        applicability: "items",
        itemSlugs: ["burnt-basque-cheesecake"],
        minimumOrderAmount: 150,
        priority: 9,
      },
    ],
  },
];

function mapLogo(url: string) {
  return {
    url,
    publicId: "",
  };
}

async function upsertOwnerRestaurantSeed(
  entry: ShowcaseRestaurant,
  passwordHash: string,
) {
  const owner = await OwnerModel.findOneAndUpdate(
    { phone: entry.owner.phone },
    {
      fullName: entry.owner.fullName,
      phone: entry.owner.phone,
      email: entry.owner.email,
      passwordHash,
      isPhoneVerified: true,
      status: "active",
      restaurantLifecycleStatus: "approved",
      profileImage: mapLogo(entry.restaurant.logoUrl),
      lastLoginAt: new Date(),
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  );

  const restaurant = await RestaurantModel.findOneAndUpdate(
    { slug: entry.restaurant.slug },
    {
      ownerId: owner._id,
      name: entry.restaurant.name,
      slug: entry.restaurant.slug,
      description: entry.restaurant.description,
      preparationTimeMinutes: entry.restaurant.preparationTimeMinutes,
      cuisineTypes: entry.restaurant.cuisineTypes,
      tags: entry.restaurant.tags,
      logo: mapLogo(entry.restaurant.logoUrl),
      coverImage: mapLogo(entry.restaurant.coverImageUrl),
      contact: {
        phone: entry.restaurant.phone,
        email: entry.restaurant.email,
      },
      address: {
        address: entry.restaurant.address,
        city: entry.restaurant.city,
      },
      location: {
        latitude: entry.restaurant.latitude,
        longitude: entry.restaurant.longitude,
      },
      locationPoint: {
        type: "Point",
        coordinates: [entry.restaurant.longitude, entry.restaurant.latitude],
      },
      runtime: {
        isVisible: entry.restaurant.isVisible,
        isOnline: entry.restaurant.isOnline,
      },
      discovery: {
        featuredSortOrder: entry.restaurant.featuredSortOrder,
        isFeatured: entry.restaurant.featuredSortOrder > 0,
      },
      settings: {
        orderSettings: {
          autoAcceptOrders: false,
        },
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  );

  owner.activeRestaurantId = restaurant._id;
  await owner.save();

  await OnboardingDraftModel.findOneAndUpdate(
    { ownerId: owner._id },
    {
      ownerId: owner._id,
      restaurantId: restaurant._id,
      currentStep: "completed",
      completedSteps: [
        "basic_info",
        "location",
        "opening_hours",
        "payout_setup",
      ],
      basicInfo: {
        restaurantName: entry.restaurant.name,
        fullName: entry.owner.fullName,
        phone: entry.owner.phone,
        email: entry.owner.email,
        description: entry.restaurant.description,
        preparationTimeMinutes: entry.restaurant.preparationTimeMinutes,
        cuisineTypes: entry.restaurant.cuisineTypes,
        tags: entry.restaurant.tags,
        logo: mapLogo(entry.restaurant.logoUrl),
        coverImage: mapLogo(entry.restaurant.coverImageUrl),
      },
      location: {
        address: entry.restaurant.address,
        city: entry.restaurant.city,
        latitude: entry.restaurant.latitude,
        longitude: entry.restaurant.longitude,
      },
      openingHours: {
        timezone: "Asia/Dhaka",
        weeklySchedule: entry.openingHours,
        exceptions: [],
        temporaryClosure: {
          isPaused: false,
          mode: null,
          resumeAt: null,
          reason: "",
        },
      },
      payoutSetup: {
        type: entry.payout.type,
        accountName: entry.payout.accountName,
        accountNumber: entry.payout.accountNumber,
        isVerified: true,
      },
      draftSavedAt: new Date(),
      submittedAt: new Date(),
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  );

  await OpeningHoursModel.findOneAndUpdate(
    { restaurantId: restaurant._id },
    {
      restaurantId: restaurant._id,
      timezone: "Asia/Dhaka",
      weeklySchedule: entry.openingHours,
      exceptions: [],
      temporaryClosure: {
        isPaused: false,
        mode: null,
        resumeAt: null,
        reason: "",
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  );

  await PayoutMethodModel.findOneAndUpdate(
    { restaurantId: restaurant._id },
    {
      restaurantId: restaurant._id,
      type: entry.payout.type,
      accountName: entry.payout.accountName,
      accountNumber: entry.payout.accountNumber,
      bankName: entry.payout.bankName ?? "",
      branchName: entry.payout.branchName ?? "",
      isVerified: true,
      verifiedAt: new Date(),
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  );

  await CategoryModel.deleteMany({ restaurantId: restaurant._id });
  await MenuItemModel.deleteMany({ restaurantId: restaurant._id });
  await VoucherModel.deleteMany({ restaurantId: restaurant._id });

  const categoryIdBySlug = new Map<string, mongoose.Types.ObjectId>();
  const itemIdBySlug = new Map<string, mongoose.Types.ObjectId>();

  for (const category of entry.categories) {
    const createdCategory = await CategoryModel.create({
      restaurantId: restaurant._id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      status: "active",
      displayOrder: category.displayOrder,
    });

    categoryIdBySlug.set(category.slug, createdCategory._id);

    for (const item of category.items) {
      const createdItem = await MenuItemModel.create({
        restaurantId: restaurant._id,
        categoryId: createdCategory._id,
        name: item.name,
        slug: item.slug,
        description: item.description,
        images: [{ url: item.imageUrl, publicId: "" }],
        status: "active",
        availability: item.availability ?? "available",
        kind: item.kind ?? "simple",
        basePrice: item.basePrice,
        variants: item.variants ?? [],
        addOnGroups: item.addOnGroups ?? [],
        isPopular: item.isPopular ?? false,
      });

      itemIdBySlug.set(item.slug, createdItem._id);
    }
  }

  const now = new Date();
  const startsAt = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 3,
  );
  const endsAt = new Date(now.getFullYear(), now.getMonth() + 2, now.getDate());

  for (const voucher of entry.vouchers) {
    await VoucherModel.create({
      restaurantId: restaurant._id,
      createdByType: "owner",
      createdById: owner.id,
      fundedBy: voucher.fundedBy,
      stackingRule: "exclusive",
      priority: voucher.priority ?? 0,
      mode: voucher.mode,
      type: voucher.type,
      name: voucher.name,
      code: voucher.code ?? "",
      discountValue: voucher.discountValue,
      minimumOrderAmount: voucher.minimumOrderAmount ?? 0,
      maxTotalUses: 0,
      maxUsesPerUser: 0,
      allowRepeatUsage: true,
      status: "Active",
      applicability: voucher.applicability ?? "all",
      categoryIds: (voucher.categorySlugs ?? [])
        .map((slug) => categoryIdBySlug.get(slug))
        .filter((value): value is mongoose.Types.ObjectId => Boolean(value)),
      itemIds: (voucher.itemSlugs ?? [])
        .map((slug) => itemIdBySlug.get(slug))
        .filter((value): value is mongoose.Types.ObjectId => Boolean(value)),
      startsAt,
      endsAt,
    });
  }

  return {
    owner,
    restaurant,
  };
}

async function seedOwnerShowcase() {
  await connectDatabase();

  const passwordHash = await hashPassword(OWNER_PASSWORD);
  const seededRestaurants: mongoose.Types.ObjectId[] = [];

  for (const entry of showcaseRestaurants) {
    const { restaurant } = await upsertOwnerRestaurantSeed(entry, passwordHash);
    seededRestaurants.push(restaurant._id);
  }

  await RestaurantCollectionModel.findOneAndUpdate(
    { key: "featured_restaurants" },
    {
      key: "featured_restaurants",
      name: "Featured Restaurants",
      type: "static",
      criteria: {},
      restaurantIds: seededRestaurants,
      sortOrders: seededRestaurants.map((restaurantId, index) => ({
        restaurantId,
        order: index + 1,
      })),
      isActive: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  await RestaurantCollectionModel.findOneAndUpdate(
    { key: "restaurants_with_offers" },
    {
      key: "restaurants_with_offers",
      name: "Restaurants With Offers",
      type: "dynamic",
      criteria: { hasActiveVoucher: true },
      restaurantIds: seededRestaurants,
      sortOrders: seededRestaurants.map((restaurantId, index) => ({
        restaurantId,
        order: index + 1,
      })),
      isActive: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  logger.info(
    {
      seededOwners: showcaseRestaurants.map((entry) => ({
        restaurant: entry.restaurant.name,
        ownerPhone: entry.owner.phone,
        ownerEmail: entry.owner.email,
      })),
      sharedPassword: OWNER_PASSWORD,
    },
    "Owner showcase seed completed successfully",
  );
}

seedOwnerShowcase()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error(error);
    process.exit(1);
  });
