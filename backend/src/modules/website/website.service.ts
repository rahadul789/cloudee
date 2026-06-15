import { createAdminOperationalAlert } from "../admin/admin-alert.service";
import { RestaurantModel } from "../auth/auth.model";
import { slugify } from "../../common/utils/slugify";
import { ServiceZoneModel } from "../service-area/service-area.model";
import {
  WebsiteAnalyticsEventModel,
  WebsiteLeadModel,
  WebsiteSettingsModel,
} from "./website.model";

export type WebsiteLeadInput = {
  type: "restaurant" | "rider" | "contact";
  name: string;
  phone: string;
  email?: string;
  area: string;
  businessName?: string;
  cuisineType?: string;
  vehicleType?: string;
  message?: string;
  source?: string;
  landingPage?: string;
  referrer?: string;
  language?: string;
  visitorId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
};

export type WebsiteAnalyticsEventInput = {
  eventName: string;
  pagePath?: string;
  visitorId: string;
  sessionId: string;
  language?: string;
  referrer?: string;
  source?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
};

export type WebsiteLeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "converted"
  | "closed";

export type WebsiteAreaRestaurantParams = {
  area: string;
  limit?: number;
};

const defaultHeroTitle =
  "খাবার অর্ডার, রেস্টুরেন্ট বড় করা আর রাইডার আয়—সব একসাথে Foodbela.";
const defaultHeroSubtitle =
  "Foodbela আপনার এলাকায় দ্রুত খাবার ডেলিভারি, রেস্টুরেন্ট পার্টনারশিপ এবং রাইডার অনবোর্ডিংকে এক প্ল্যাটফর্মে আনে।";
const compactHeroSubtitle =
  "আপনার এলাকার প্রিয় খাবার, লাইভ ট্র্যাকিং আর দ্রুত ডেলিভারি—সব এক অ্যাপে।";
const defaultHeroTitleEn =
  "Order food, grow restaurants, and power riders with Foodbela.";
const defaultHeroSubtitleEn =
  "Foodbela brings fast local delivery, restaurant partnerships, and rider onboarding into one connected platform.";
const compactHeroSubtitleEn =
  "Your local favorites, live tracking, and fast delivery in one app.";
const defaultCustomerYoutubeUrl =
  "https://www.youtube-nocookie.com/embed/ysz5S6PUM-U";
const defaultCustomerVideoOrientation = "portrait";
const defaultSiteUrl = "https://foodbela.com";
const defaultPlayStoreUrl =
  "https://play.google.com/store/apps/details?id=com.foodbela.app";
const defaultSeoTitle = "Foodbela | আপনার শহরের ফুড ডেলিভারি নেটওয়ার্ক";
const defaultSeoDescription =
  "Foodbela দিয়ে খাবার অর্ডার, রেস্টুরেন্ট পার্টনারশিপ এবং রাইডার অনবোর্ডিং এক প্ল্যাটফর্মে করুন।";
const socialLinkKeys = ["facebook", "instagram", "youtube", "linkedin", "tiktok", "snapchat"];
const defaultSocialLinksOrder = ["facebook", "instagram", "youtube", "linkedin", "tiktok", "snapchat"];
const legacyHeroTitle =
  "খাবার, রেস্টুরেন্ট আর রাইডার—সব এক স্মার্ট ডেলিভারি নেটওয়ার্কে।";
const legacyHeroSubtitle =
  "Foodbela আপনাকে লোকাল রেস্টুরেন্ট থেকে দ্রুত অর্ডার, লাইভ ট্র্যাকিং, সহজ পার্টনারশিপ এবং রাইডার অনবোর্ডিং—সবকিছু এক জায়গায় দেয়।";
const previousHeroTitle =
  "আপনার এলাকার খাবার, রেস্টুরেন্ট ও রাইডার—সব এক স্মার্ট ডেলিভারি নেটওয়ার্কে।";
const previousHeroSubtitle =
  "Foodbela দিয়ে কাছের রেস্টুরেন্ট থেকে দ্রুত অর্ডার করুন, রাইডারের লাইভ আপডেট দেখুন, আর রেস্টুরেন্ট বা রাইডার হিসেবে একই প্ল্যাটফর্মে যুক্ত হন।";

function serializeLead(row: any) {
  return {
    id: String(row._id ?? row.id ?? ""),
    type: row.type ?? "contact",
    status: row.status ?? "new",
    name: row.name ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    area: row.area ?? "",
    businessName: row.businessName ?? "",
    cuisineType: row.cuisineType ?? "",
    vehicleType: row.vehicleType ?? "",
    message: row.message ?? "",
    source: row.source ?? "foodbela.com",
    landingPage: row.landingPage ?? "",
    referrer: row.referrer ?? "",
    language: row.language ?? "bn",
    visitorId: row.visitorId ?? "",
    sessionId: row.sessionId ?? "",
    notes: row.notes ?? "",
    assignedAdminId: row.assignedAdminId ?? "",
    lastContactedAt: row.lastContactedAt
      ? new Date(row.lastContactedAt).toISOString()
      : null,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function exactTextRegex(value: string) {
  return new RegExp(`^${escapeRegex(value.trim())}$`, "i");
}

function splitAreaName(areaName: string) {
  const parts = areaName
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return {
    zoneName: parts[0] ?? areaName.trim(),
    districtName: parts.length > 1 ? parts.at(-1) ?? "" : "",
  };
}

function expandAreaAliases(values: string[]) {
  const aliases = new Set<string>();
  values.forEach((value) => {
    const text = value.trim();
    if (!text) return;
    aliases.add(text);
    aliases.add(text.replace(/netrokona/gi, "Netrakona"));
    aliases.add(text.replace(/netrakona/gi, "Netrokona"));
  });
  return [...aliases].filter(Boolean);
}

function getWebsiteRestaurantQuery(areaName: string): Record<string, any> {
  const cleanArea = areaName.trim();
  const { zoneName, districtName } = splitAreaName(cleanArea);
  const areaTerms = expandAreaAliases([cleanArea, zoneName, districtName]);
  const cityTerms = expandAreaAliases([districtName, zoneName, cleanArea]);

  return {
    "runtime.isVisible": true,
    $and: [
      {
        $or: [
          { "enforcement.status": { $exists: false } },
          { "enforcement.status": { $in: ["active", "under_review"] } },
          { "enforcement.expiresAt": { $lte: new Date() } },
        ],
      },
      {
        $or: [
          ...areaTerms.map((term) => ({
            "serviceArea.zoneName": exactTextRegex(term),
          })),
          ...areaTerms.map((term) => ({
            "serviceArea.districtName": exactTextRegex(term),
          })),
          ...cityTerms.map((term) => ({
            "address.city": exactTextRegex(term),
          })),
        ],
      },
    ],
  };
}

async function getWebsiteAreaZones(areaName: string) {
  const cleanArea = areaName.trim();
  const { zoneName, districtName } = splitAreaName(cleanArea);
  const areaTerms = expandAreaAliases([cleanArea, zoneName, districtName]);
  const slugs = [...new Set(areaTerms.map((term) => slugify(term)).filter(Boolean))];

  return ServiceZoneModel.find({
    status: "active",
    $or: [
      ...(slugs.length ? [{ slug: { $in: slugs } }] : []),
      ...areaTerms.map((term) => ({ name: exactTextRegex(term) })),
      ...areaTerms.map((term) => ({ districtName: exactTextRegex(term) })),
    ],
  })
    .select({ _id: 1, slug: 1, center: 1, radiusKm: 1, districtId: 1, districtName: 1, name: 1 })
    .lean();
}

function getWebsiteZoneRestaurantQuery(zones: Array<Record<string, any>>): Record<string, any> {
  const zoneIds = zones.map((zone) => String(zone._id ?? "")).filter(Boolean);
  const zoneSlugs = zones.map((zone) => String(zone.slug ?? "")).filter(Boolean);
  const geoClauses: Record<string, any>[] = [];
  zones.forEach((zone) => {
    const latitude = Number(zone.center?.latitude);
    const longitude = Number(zone.center?.longitude);
    const radiusKm = Number(zone.radiusKm ?? 0);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || radiusKm <= 0) {
      return;
    }
    geoClauses.push({
        locationPoint: {
          $geoWithin: {
            $centerSphere: [[longitude, latitude], radiusKm / 6371],
          },
        },
      });
  });

  return {
    "runtime.isVisible": true,
    $and: [
      {
        $or: [
          { "enforcement.status": { $exists: false } },
          { "enforcement.status": { $in: ["active", "under_review"] } },
          { "enforcement.expiresAt": { $lte: new Date() } },
        ],
      },
      {
        $or: [
          ...(zoneIds.length ? [{ "serviceArea.zoneId": { $in: zoneIds } }] : []),
          ...(zoneSlugs.length ? [{ "serviceArea.zoneSlug": { $in: zoneSlugs } }] : []),
          ...geoClauses,
        ],
      },
    ],
  };
}

function serializeWebsiteRestaurant(row: Record<string, any>) {
  return {
    id: String(row._id ?? row.id ?? ""),
    slug: String(row.slug ?? ""),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    cuisines: Array.isArray(row.cuisineTypes) ? row.cuisineTypes : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    city: String(row.address?.city ?? ""),
    address: String(row.address?.address ?? ""),
    imageUrl: String(row.coverImage?.url || row.logo?.url || ""),
    logoUrl: String(row.logo?.url || ""),
    isOpen: row.runtime?.isOnline === true,
    isVisible: row.runtime?.isVisible !== false,
    serviceArea: {
      districtId: String(row.serviceArea?.districtId ?? ""),
      districtName: String(row.serviceArea?.districtName ?? ""),
      zoneId: String(row.serviceArea?.zoneId ?? ""),
      zoneSlug: String(row.serviceArea?.zoneSlug ?? ""),
      zoneName: String(row.serviceArea?.zoneName ?? ""),
    },
  };
}

function serializeZoneName(zone: any) {
  const zoneName = String(zone.name ?? "").trim();
  const districtName = String(zone.districtName ?? "").trim();
  if (!districtName || districtName.toLowerCase() === zoneName.toLowerCase()) {
    return zoneName;
  }
  return `${zoneName}, ${districtName}`;
}

function normalizeSocialLinksOrder(value: unknown) {
  const incoming = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const seen = new Set<string>();
  const order: string[] = [];

  for (const item of incoming) {
    const key = String(item ?? "").trim().toLowerCase();
    if (!socialLinkKeys.includes(key) || seen.has(key)) continue;
    seen.add(key);
    order.push(key);
  }

  for (const key of defaultSocialLinksOrder) {
    if (!seen.has(key)) order.push(key);
  }

  return order;
}

function normalizeTextList(value: unknown, limit = 20) {
  const incoming = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const seen = new Set<string>();
  const items: string[] = [];

  for (const item of incoming) {
    const text = String(item ?? "").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(text);
    if (items.length >= limit) break;
  }

  return items;
}

async function getServiceAreasForWebsite(row: any) {
  const fallbackAreas = Array.isArray(row.serviceAreas) ? row.serviceAreas : [];
  if (fallbackAreas.length) {
    const seen = new Set<string>();
    return fallbackAreas
      .map((area: any) => ({
        name: String(area.name ?? "").trim(),
        status:
          area.status === "coming_soon" || area.status === "paused"
            ? area.status
            : "active",
        note: String(area.note ?? "").trim(),
        noteBn: String(area.noteBn ?? "").trim(),
        noteEn: String(area.noteEn ?? "").trim(),
        seoTitle: String(area.seoTitle ?? "").trim(),
        seoDescription: String(area.seoDescription ?? "").trim(),
        popularSearches: normalizeTextList(area.popularSearches),
        cuisineKeywords: normalizeTextList(area.cuisineKeywords),
        postalCodes: normalizeTextList(area.postalCodes),
      }))
      .filter((area: { name: string; status: string; note: string }) => {
        if (!area.name) return false;
        const key = area.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  const zones = await ServiceZoneModel.find({ status: { $ne: "archived" } })
    .sort({ status: 1, priority: -1, displayOrder: 1, name: 1 })
    .limit(200)
    .lean();

  if (!zones.length) {
    return fallbackAreas;
  }

  const seen = new Set<string>();
  return zones
    .map((zone) => {
      const name = serializeZoneName(zone);
      return {
        name,
        status: zone.status === "active" ? "active" : "paused",
        note:
          String(zone.notes ?? "").trim() ||
          (zone.status === "active" ? "Available now" : "Temporarily paused"),
        noteBn: "",
        noteEn: "",
        seoTitle: "",
        seoDescription: "",
        popularSearches: [],
        cuisineKeywords: [],
        postalCodes: [],
      };
    })
    .filter((area) => {
      if (!area.name) return false;
      const key = area.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

async function serializeSettings(row: any) {
  const serviceAreas = await getServiceAreasForWebsite(row);

  return {
    siteUrl: row.siteUrl ?? defaultSiteUrl,
    seoDefaultTitle: row.seoDefaultTitle ?? defaultSeoTitle,
    seoDefaultDescription: row.seoDefaultDescription ?? defaultSeoDescription,
    seoOgImageUrl: row.seoOgImageUrl ?? "",
    googleSiteVerification: row.googleSiteVerification ?? "",
    businessAddress: row.businessAddress ?? "",
    businessCity: row.businessCity ?? "Dhaka",
    businessRegion: row.businessRegion ?? "Dhaka",
    businessPostalCode: row.businessPostalCode ?? "",
    businessCountry: row.businessCountry ?? "BD",
    playStoreUrl: row.playStoreUrl || defaultPlayStoreUrl,
    appDownloadUrl: row.appDownloadUrl ?? "",
    restaurantApplyUrl: row.restaurantApplyUrl ?? "/restaurants#apply",
    riderApplyUrl: row.riderApplyUrl ?? "/riders#apply",
    supportPhone: row.supportPhone ?? "+880 1700-000000",
    supportEmail: row.supportEmail ?? "hello@foodbela.com",
    facebookUrl: row.facebookUrl ?? "#",
    instagramUrl: row.instagramUrl ?? "#",
    linkedinUrl: row.linkedinUrl ?? "#",
    tiktokUrl: row.tiktokUrl ?? "#",
    youtubeUrl: row.youtubeUrl ?? "#",
    snapchatUrl: row.snapchatUrl ?? "#",
    socialLinksOrder: normalizeSocialLinksOrder(row.socialLinksOrder),
    heroTitle: row.heroTitle ?? defaultHeroTitle,
    heroSubtitle: row.heroSubtitle ?? compactHeroSubtitle,
    heroTitleEn: row.heroTitleEn ?? defaultHeroTitleEn,
    heroSubtitleEn: row.heroSubtitleEn ?? compactHeroSubtitleEn,
    customerYoutubeUrl: row.customerYoutubeUrl ?? defaultCustomerYoutubeUrl,
    customerVideoOrientation:
      row.customerVideoOrientation === "landscape"
        ? "landscape"
        : defaultCustomerVideoOrientation,
    customerOfferEnabled: row.customerOfferEnabled === true,
    customerOfferTitle: row.customerOfferTitle ?? "",
    customerOfferDescription: row.customerOfferDescription ?? "",
    customerOfferCtaLabel: row.customerOfferCtaLabel ?? "অফার দেখুন",
    customerOfferCtaUrl: row.customerOfferCtaUrl ?? "#",
    websiteModalEnabled: row.websiteModalEnabled !== false,
    websiteModalMode:
      row.websiteModalMode === "image" ||
      row.websiteModalMode === "image_text"
        ? row.websiteModalMode
        : "image_text_button",
    websiteModalImageUrl: row.websiteModalImageUrl ?? "",
    websiteModalTitle: row.websiteModalTitle ?? "Foodbela অ্যাপ ইনস্টল করুন",
    websiteModalTitleEn: row.websiteModalTitleEn ?? "Install the Foodbela app",
    websiteModalDescription:
      row.websiteModalDescription ??
      "ফোন দিয়ে QR code স্ক্যান করে Play Store থেকে Foodbela অ্যাপ ইনস্টল করুন।",
    websiteModalDescriptionEn:
      row.websiteModalDescriptionEn ??
      "Scan the QR code with your phone and install Foodbela from Play Store.",
    websiteModalCtaLabel: row.websiteModalCtaLabel ?? "Google Play থেকে ডাউনলোড",
    websiteModalCtaLabelEn: row.websiteModalCtaLabelEn ?? "Download from Google Play",
    websiteModalCtaUrl: row.websiteModalCtaUrl || defaultPlayStoreUrl,
    websiteModalDelaySeconds:
      typeof row.websiteModalDelaySeconds === "number"
        ? row.websiteModalDelaySeconds
        : 1,
    websiteModalFrequency:
      row.websiteModalFrequency === "always" || row.websiteModalFrequency === "daily"
        ? row.websiteModalFrequency
        : "session",
    websiteBannerEnabled: row.websiteBannerEnabled === true,
    websiteBannerText:
      row.websiteBannerText ?? "Foodbela অ্যাপ এখন Play Store-এ পাওয়া যাচ্ছে.",
    websiteBannerTextEn:
      row.websiteBannerTextEn ?? "Foodbela app is now available on Play Store.",
    websiteBannerCtaLabel: row.websiteBannerCtaLabel ?? "অ্যাপ ডাউনলোড",
    websiteBannerCtaLabelEn: row.websiteBannerCtaLabelEn ?? "Download app",
    websiteBannerCtaUrl: row.websiteBannerCtaUrl || defaultPlayStoreUrl,
    coverageRewardAmount:
      typeof row.coverageRewardAmount === "number"
        ? row.coverageRewardAmount
        : 2000,
    serviceAreas,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

export async function getWebsiteSettings() {
  let settings = await WebsiteSettingsModel.findOneAndUpdate(
    { singletonKey: "foodbela.com" },
    { $setOnInsert: { singletonKey: "foodbela.com" } },
    { upsert: true, new: true },
  ).lean();

  const shouldMigrateDefaultHero =
    (settings?.heroTitle === legacyHeroTitle &&
      settings?.heroSubtitle === legacyHeroSubtitle) ||
    (settings?.heroTitle === previousHeroTitle &&
      settings?.heroSubtitle === previousHeroSubtitle) ||
    settings?.heroSubtitle === defaultHeroSubtitle ||
    settings?.heroSubtitleEn === defaultHeroSubtitleEn;

  if (shouldMigrateDefaultHero) {
    const migratedSettings = await WebsiteSettingsModel.findOneAndUpdate(
      { singletonKey: "foodbela.com" },
      {
        $set: {
          heroTitle: defaultHeroTitle,
          heroSubtitle: compactHeroSubtitle,
          heroTitleEn: defaultHeroTitleEn,
          heroSubtitleEn: compactHeroSubtitleEn,
        },
      },
      { new: true },
    ).lean();
    if (migratedSettings) {
      settings = migratedSettings;
    }
  }

  return serializeSettings(settings ?? {});
}

export async function listWebsiteAreaRestaurants(
  params: WebsiteAreaRestaurantParams,
) {
  const areaName = params.area.trim();
  if (!areaName) {
    return {
      area: "",
      items: [],
      total: 0,
    };
  }

  const limit = Math.min(60, Math.max(1, Math.floor(params.limit ?? 24)));
  const areaZones = await getWebsiteAreaZones(areaName);
  const query = areaZones.length
    ? getWebsiteZoneRestaurantQuery(areaZones)
    : getWebsiteRestaurantQuery(areaName);
  const [rows, total] = await Promise.all([
    RestaurantModel.find(query)
      .select({
        name: 1,
        slug: 1,
        description: 1,
        cuisineTypes: 1,
        tags: 1,
        logo: 1,
        coverImage: 1,
        address: 1,
        runtime: 1,
        serviceArea: 1,
        discovery: 1,
        createdAt: 1,
      })
      .sort({
        "runtime.isOnline": -1,
        "discovery.isFeatured": -1,
        "discovery.featuredSortOrder": 1,
        name: 1,
      })
      .limit(limit)
      .lean(),
    RestaurantModel.countDocuments(query),
  ]);

  return {
    area: areaName,
    items: rows.map((row) => serializeWebsiteRestaurant(row)),
    total,
  };
}

export async function updateWebsiteSettings(
  payload: Record<string, unknown>,
  adminId: string,
) {
  const allowed = [
    "siteUrl",
    "seoDefaultTitle",
    "seoDefaultDescription",
    "seoOgImageUrl",
    "googleSiteVerification",
    "businessAddress",
    "businessCity",
    "businessRegion",
    "businessPostalCode",
    "businessCountry",
    "playStoreUrl",
    "appDownloadUrl",
    "restaurantApplyUrl",
    "riderApplyUrl",
    "supportPhone",
    "supportEmail",
    "facebookUrl",
    "instagramUrl",
    "linkedinUrl",
    "tiktokUrl",
    "youtubeUrl",
    "snapchatUrl",
    "socialLinksOrder",
    "heroTitle",
    "heroSubtitle",
    "heroTitleEn",
    "heroSubtitleEn",
    "customerYoutubeUrl",
    "customerVideoOrientation",
    "customerOfferEnabled",
    "customerOfferTitle",
    "customerOfferDescription",
    "customerOfferCtaLabel",
    "customerOfferCtaUrl",
    "websiteModalEnabled",
    "websiteModalMode",
    "websiteModalImageUrl",
    "websiteModalTitle",
    "websiteModalTitleEn",
    "websiteModalDescription",
    "websiteModalDescriptionEn",
    "websiteModalCtaLabel",
    "websiteModalCtaLabelEn",
    "websiteModalCtaUrl",
    "websiteModalDelaySeconds",
    "websiteModalFrequency",
    "websiteBannerEnabled",
    "websiteBannerText",
    "websiteBannerTextEn",
    "websiteBannerCtaLabel",
    "websiteBannerCtaLabelEn",
    "websiteBannerCtaUrl",
    "coverageRewardAmount",
    "serviceAreas",
  ];
  const $set: Record<string, unknown> = { updatedByAdminId: adminId };

  for (const key of allowed) {
    if (key in payload) {
      $set[key] = payload[key];
    }
  }

  const settings = await WebsiteSettingsModel.findOneAndUpdate(
    { singletonKey: "foodbela.com" },
    { $set, $setOnInsert: { singletonKey: "foodbela.com" } },
    { upsert: true, new: true },
  ).lean();

  return serializeSettings(settings ?? {});
}

export async function createWebsiteLead(input: WebsiteLeadInput) {
  const lead = await WebsiteLeadModel.create(input);
  const payload = serializeLead(lead.toObject());
  const leadTitle =
    input.type === "restaurant"
      ? "New restaurant partner application"
      : input.type === "rider"
        ? "New rider application"
        : "New Foodbela.com message";

  await createAdminOperationalAlert({
    alertType: "support_website_lead",
    severity: input.type === "contact" ? "info" : "warning",
    title: leadTitle,
    description: `${input.name} from ${input.area} submitted ${input.type} details.`,
    source: "foodbela.com",
    entityType: "website_lead",
    entityId: payload.id,
    path: `/website?leadId=${encodeURIComponent(payload.id)}`,
    iconKey: "globe",
    dedupeKey: `website-lead:${payload.id}`,
    metadata: {
      type: input.type,
      phone: input.phone,
      area: input.area,
      businessName: input.businessName ?? "",
      vehicleType: input.vehicleType ?? "",
    },
  });

  return payload;
}

export async function listWebsiteLeads(params: {
  type?: string;
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));
  const query: Record<string, unknown> = {};

  if (params.type && params.type !== "all") query.type = params.type;
  if (params.status && params.status !== "all") query.status = params.status;
  if (params.search) {
    query.$or = [
      { name: { $regex: params.search, $options: "i" } },
      { phone: { $regex: params.search, $options: "i" } },
      { email: { $regex: params.search, $options: "i" } },
      { area: { $regex: params.search, $options: "i" } },
      { businessName: { $regex: params.search, $options: "i" } },
    ];
  }

  const [rows, total] = await Promise.all([
    WebsiteLeadModel.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    WebsiteLeadModel.countDocuments(query),
  ]);

  return {
    items: rows.map((row) => serializeLead(row)),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

export async function getWebsiteLead(leadId: string) {
  const lead = await WebsiteLeadModel.findById(leadId).lean();
  return lead ? serializeLead(lead) : null;
}

export async function updateWebsiteLead(
  leadId: string,
  payload: {
    status?: WebsiteLeadStatus;
    notes?: string;
    assignedAdminId?: string;
    markContacted?: boolean;
  },
) {
  const $set: Record<string, unknown> = {};
  if (payload.status) $set.status = payload.status;
  if (typeof payload.notes === "string") $set.notes = payload.notes;
  if (typeof payload.assignedAdminId === "string") {
    $set.assignedAdminId = payload.assignedAdminId;
  }
  if (payload.markContacted) $set.lastContactedAt = new Date();

  const lead = await WebsiteLeadModel.findByIdAndUpdate(
    leadId,
    { $set },
    { new: true },
  ).lean();

  return lead ? serializeLead(lead) : null;
}

export async function recordWebsiteAnalyticsEvent(
  input: WebsiteAnalyticsEventInput,
) {
  const row = await WebsiteAnalyticsEventModel.create(input);
  return { id: String(row._id) };
}

export type WebsiteAnalyticsParams = {
  days?: number;
  from?: string;
  to?: string;
  preset?:
    | "today"
    | "yesterday"
    | "last7Days"
    | "last30Days"
    | "last90Days"
    | "thisMonth"
    | "lastMonth"
    | "lifetime"
    | "custom";
  eventName?: string;
  deviceType?: string;
  pagePath?: string;
  language?: string;
  eventPage?: number;
  eventPageSize?: number;
};

function parseAnalyticsDate(value: string | undefined, endOfDay = false) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (!endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date.setHours(0, 0, 0, 0);
  }
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date.setHours(23, 59, 59, 999);
  }
  return date;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function buildAnalyticsRange(params: WebsiteAnalyticsParams) {
  const safeDays = Math.min(365, Math.max(1, params.days ?? 30));
  const today = new Date();
  const preset = params.preset ?? "custom";

  if (preset && preset !== "custom") {
    if (preset === "today") {
      return { from: startOfDay(today), to: endOfDay(today), safeDays: 1 };
    }
    if (preset === "yesterday") {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { from: startOfDay(yesterday), to: endOfDay(yesterday), safeDays: 1 };
    }
    if (preset === "last7Days" || preset === "last30Days" || preset === "last90Days") {
      const days = preset === "last7Days" ? 7 : preset === "last30Days" ? 30 : 90;
      const from = startOfDay(today);
      from.setDate(from.getDate() - (days - 1));
      return { from, to: endOfDay(today), safeDays: days };
    }
    if (preset === "thisMonth") {
      return {
        from: startOfMonth(today),
        to: endOfDay(today),
        safeDays: Math.max(1, today.getDate()),
      };
    }
    if (preset === "lastMonth") {
      const previousMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      return {
        from: startOfMonth(previousMonth),
        to: endOfMonth(previousMonth),
        safeDays: Math.max(1, endOfMonth(previousMonth).getDate()),
      };
    }
    if (preset === "lifetime") {
      return {
        from: new Date("2020-01-01T00:00:00.000Z"),
        to: endOfDay(today),
        safeDays: 365,
      };
    }
  }

  const from =
    parseAnalyticsDate(params.from) ??
    new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
  const to = parseAnalyticsDate(params.to, true) ?? new Date();
  return { from, to, safeDays };
}

function buildAnalyticsMatch(params: WebsiteAnalyticsParams) {
  const { from, to } = buildAnalyticsRange(params);
  const match: Record<string, any> = { createdAt: { $gte: from, $lte: to } };
  if (params.eventName && params.eventName !== "all") {
    match.eventName = params.eventName;
  }
  if (params.deviceType && params.deviceType !== "all") {
    match["metadata.deviceType"] = params.deviceType;
  }
  if (params.language && params.language !== "all") {
    match.language = params.language;
  }
  if (params.pagePath?.trim()) {
    match.pagePath = { $regex: params.pagePath.trim(), $options: "i" };
  }
  return match;
}

function serializeBreakdown(rows: Array<Record<string, any>>, label = "label") {
  return rows.map((item) => ({
    [label]: item._id || "unknown",
    count: item.count ?? 0,
  }));
}

function getMetadataString(metadata: Record<string, any> | undefined, keys: string[]) {
  if (!metadata) return "";
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function resolveEventPlace(metadata: Record<string, any> | undefined) {
  const place =
    getMetadataString(metadata, [
      "place",
      "placeName",
      "area",
      "areaName",
      "zoneName",
      "serviceAreaName",
      "city",
      "districtName",
      "district",
      "country",
    ]) || "Unknown place";
  const city = getMetadataString(metadata, ["city", "town", "municipality"]);
  const district = getMetadataString(metadata, ["districtName", "district", "region"]);
  const country = getMetadataString(metadata, ["country", "countryName"]);
  const latitude = Number(metadata?.latitude ?? metadata?.lat ?? metadata?.coords?.latitude);
  const longitude = Number(metadata?.longitude ?? metadata?.lng ?? metadata?.coords?.longitude);

  return {
    place,
    city,
    district,
    country,
    coordinates:
      Number.isFinite(latitude) && Number.isFinite(longitude)
        ? { latitude, longitude }
        : null,
  };
}

function serializeRecentEvent(row: Record<string, any>) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const place = resolveEventPlace(metadata);
  return {
    id: String(row._id ?? row.id ?? ""),
    eventName: String(row.eventName ?? ""),
    pagePath: String(row.pagePath ?? "/"),
    visitorId: String(row.visitorId ?? ""),
    sessionId: String(row.sessionId ?? ""),
    language: String(row.language ?? ""),
    referrer: String(row.referrer ?? ""),
    deviceType: String(metadata.deviceType ?? "unknown"),
    browserName: String(metadata.browserName ?? "unknown"),
    osName: String(metadata.osName ?? "unknown"),
    place: place.place,
    city: place.city,
    district: place.district,
    country: place.country,
    coordinates: place.coordinates,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
  };
}

const websiteAnalyticsTimezone = "Asia/Dhaka";

function formatHourLabel(hour: number) {
  const start = String(hour).padStart(2, "0");
  const end = String((hour + 1) % 24).padStart(2, "0");
  return `${start}:00-${end}:00`;
}

export async function getWebsiteAnalytics(params: WebsiteAnalyticsParams = {}) {
  const { from, to, safeDays } = buildAnalyticsRange(params);
  const match = buildAnalyticsMatch(params);
  const leadDateMatch = { createdAt: { $gte: from, $lte: to } };
  const eventPage = Math.max(1, params.eventPage ?? 1);
  const eventPageSize = Math.min(100, Math.max(5, params.eventPageSize ?? 30));

  const [
    totalEvents,
    uniqueVisitors,
    sessions,
    pageViews,
    ctaClicks,
    leadSubmits,
    leadCounts,
    topPages,
    topReferrers,
    dailyEvents,
    dailyLeads,
    hourlyEvents,
    hourlyLeads,
    eventBreakdown,
    deviceBreakdown,
    browserBreakdown,
    osBreakdown,
    languageBreakdown,
    placeBreakdown,
    ctaBreakdown,
    recentEvents,
  ] = await Promise.all([
    WebsiteAnalyticsEventModel.countDocuments(match),
    WebsiteAnalyticsEventModel.distinct("visitorId", match),
    WebsiteAnalyticsEventModel.distinct("sessionId", match),
    WebsiteAnalyticsEventModel.countDocuments({
      ...match,
      eventName: "page_view",
    }),
    WebsiteAnalyticsEventModel.countDocuments({
      ...match,
      eventName: "cta_click",
    }),
    WebsiteAnalyticsEventModel.countDocuments({
      ...match,
      eventName: "lead_submit",
    }),
    WebsiteLeadModel.aggregate([
      { $match: leadDateMatch },
      { $group: { _id: "$type", count: { $sum: 1 } } },
    ]),
    WebsiteAnalyticsEventModel.aggregate([
      { $match: { ...match, eventName: "page_view" } },
      { $group: { _id: "$pagePath", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 12 },
    ]),
    WebsiteAnalyticsEventModel.aggregate([
      { $match: { ...match, referrer: { $nin: ["", null] } } },
      {
        $group: {
          _id: { $ifNull: ["$metadata.referrerHost", "$referrer"] },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    WebsiteAnalyticsEventModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          events: { $sum: 1 },
          pageViews: {
            $sum: { $cond: [{ $eq: ["$eventName", "page_view"] }, 1, 0] },
          },
          visitors: { $addToSet: "$visitorId" },
          sessions: { $addToSet: "$sessionId" },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    WebsiteLeadModel.aggregate([
      { $match: leadDateMatch },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          leads: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    WebsiteAnalyticsEventModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            $hour: { date: "$createdAt", timezone: websiteAnalyticsTimezone },
          },
          events: { $sum: 1 },
          pageViews: {
            $sum: { $cond: [{ $eq: ["$eventName", "page_view"] }, 1, 0] },
          },
          visitors: { $addToSet: "$visitorId" },
          sessions: { $addToSet: "$sessionId" },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    WebsiteLeadModel.aggregate([
      { $match: leadDateMatch },
      {
        $group: {
          _id: {
            $hour: { date: "$createdAt", timezone: websiteAnalyticsTimezone },
          },
          leads: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    WebsiteAnalyticsEventModel.aggregate([
      { $match: match },
      { $group: { _id: "$eventName", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    WebsiteAnalyticsEventModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $ifNull: ["$metadata.deviceType", "unknown"] },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]),
    WebsiteAnalyticsEventModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $ifNull: ["$metadata.browserName", "unknown"] },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]),
    WebsiteAnalyticsEventModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $ifNull: ["$metadata.osName", "unknown"] },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]),
    WebsiteAnalyticsEventModel.aggregate([
      { $match: match },
      { $group: { _id: "$language", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    WebsiteAnalyticsEventModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            place: "$metadata.place",
            placeName: "$metadata.placeName",
            area: "$metadata.area",
            areaName: "$metadata.areaName",
            zoneName: "$metadata.zoneName",
            city: "$metadata.city",
            districtName: "$metadata.districtName",
            district: "$metadata.district",
            country: "$metadata.country",
          },
          count: { $sum: 1 },
          pageViews: {
            $sum: { $cond: [{ $eq: ["$eventName", "page_view"] }, 1, 0] },
          },
          visitors: { $addToSet: "$visitorId" },
          sessions: { $addToSet: "$sessionId" },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 12 },
    ]),
    WebsiteAnalyticsEventModel.aggregate([
      { $match: { ...match, eventName: "cta_click" } },
      {
        $group: {
          _id: {
            label: { $ifNull: ["$metadata.label", "Unknown CTA"] },
            href: { $ifNull: ["$metadata.href", ""] },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 12 },
    ]),
    WebsiteAnalyticsEventModel.find(match)
      .sort({ createdAt: -1 })
      .skip((eventPage - 1) * eventPageSize)
      .limit(eventPageSize)
      .lean(),
  ]);

  const leads = {
    restaurant: 0,
    rider: 0,
    contact: 0,
  };
  for (const item of leadCounts) {
    if (item._id in leads) {
      leads[item._id as keyof typeof leads] = item.count;
    }
  }

  const hourlyBreakdown = Array.from({ length: 24 }, (_, hour) => {
    const eventRow = hourlyEvents.find((item) => Number(item._id) === hour);
    const leadRow = hourlyLeads.find((item) => Number(item._id) === hour);
    return {
      hour,
      label: formatHourLabel(hour),
      events: eventRow?.events ?? 0,
      pageViews: eventRow?.pageViews ?? 0,
      visitors: Array.isArray(eventRow?.visitors) ? eventRow.visitors.length : 0,
      sessions: Array.isArray(eventRow?.sessions) ? eventRow.sessions.length : 0,
      leads: leadRow?.leads ?? 0,
    };
  });
  const peakVisitorHours = [...hourlyBreakdown]
    .filter((item) => item.visitors > 0 || item.pageViews > 0 || item.events > 0)
    .sort((a, b) => {
      if (b.visitors !== a.visitors) return b.visitors - a.visitors;
      if (b.pageViews !== a.pageViews) return b.pageViews - a.pageViews;
      return b.events - a.events;
    })
    .slice(0, 3);
  const totalLeads = leads.restaurant + leads.rider + leads.contact;

  return {
    days: safeDays,
    range: {
      from: from.toISOString(),
      to: to.toISOString(),
    },
    filters: {
      preset: params.preset || "custom",
      eventName: params.eventName || "all",
      deviceType: params.deviceType || "all",
      pagePath: params.pagePath || "",
      language: params.language || "all",
    },
    totals: {
      events: totalEvents,
      pageViews,
      uniqueVisitors: uniqueVisitors.length,
      sessions: sessions.length,
      ctaClicks,
      leadSubmits,
      leads,
      totalLeads,
      leadConversionRate: uniqueVisitors.length
        ? Number(((totalLeads / uniqueVisitors.length) * 100).toFixed(2))
        : 0,
      ctaClickRate: pageViews
        ? Number(((ctaClicks / pageViews) * 100).toFixed(2))
        : 0,
      pageViewsPerSession: sessions.length
        ? Number((pageViews / sessions.length).toFixed(2))
        : 0,
    },
    topPages: topPages.map((item) => ({
      path: item._id || "/",
      views: item.count,
    })),
    daily: dailyEvents.map((item) => ({
      date: item._id,
      events: item.events,
      pageViews: item.pageViews,
      visitors: Array.isArray(item.visitors) ? item.visitors.length : 0,
      sessions: Array.isArray(item.sessions) ? item.sessions.length : 0,
      leads:
        dailyLeads.find((leadItem) => leadItem._id === item._id)?.leads ?? 0,
    })),
    hourlyBreakdown,
    peakVisitorHours,
    topReferrers: topReferrers.map((item) => ({
      referrer: item._id || "Direct",
      visits: item.count,
    })),
    eventBreakdown: serializeBreakdown(eventBreakdown, "eventName"),
    deviceBreakdown: serializeBreakdown(deviceBreakdown, "deviceType"),
    browserBreakdown: serializeBreakdown(browserBreakdown, "browserName"),
    osBreakdown: serializeBreakdown(osBreakdown, "osName"),
    languageBreakdown: serializeBreakdown(languageBreakdown, "language"),
    placeBreakdown: placeBreakdown.map((item) => {
      const place = resolveEventPlace(item._id ?? {});
      return {
        place: place.place,
        city: place.city,
        district: place.district,
        country: place.country,
        count: item.count ?? 0,
        pageViews: item.pageViews ?? 0,
        visitors: Array.isArray(item.visitors) ? item.visitors.length : 0,
        sessions: Array.isArray(item.sessions) ? item.sessions.length : 0,
      };
    }),
    ctaBreakdown: ctaBreakdown.map((item) => ({
      label: item._id?.label || "Unknown CTA",
      href: item._id?.href || "",
      count: item.count ?? 0,
    })),
    recentEventsMeta: {
      page: eventPage,
      pageSize: eventPageSize,
      total: totalEvents,
      totalPages: Math.max(1, Math.ceil(totalEvents / eventPageSize)),
      truncated: totalEvents > eventPage * eventPageSize,
    },
    recentEvents: recentEvents.map((row) => serializeRecentEvent(row)),
  };
}

export async function getWebsiteOverview() {
  const [settings, analytics, leads, newCount] = await Promise.all([
    getWebsiteSettings(),
    getWebsiteAnalytics({ days: 30 }),
    listWebsiteLeads({ page: 1, pageSize: 10 }),
    WebsiteLeadModel.countDocuments({ status: "new" }),
  ]);

  return {
    settings,
    analytics,
    recentLeads: leads.items,
    newLeadCount: newCount,
  };
}
