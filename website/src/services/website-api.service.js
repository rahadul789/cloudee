const fallbackSettings = {
  siteUrl: "https://foodbela.com",
  seoDefaultTitle: "Foodbela | আপনার শহরের ফুড ডেলিভারি নেটওয়ার্ক",
  seoDefaultDescription:
    "Foodbela দিয়ে খাবার অর্ডার, রেস্টুরেন্ট পার্টনারশিপ এবং রাইডার অনবোর্ডিং এক প্ল্যাটফর্মে করুন।",
  seoOgImageUrl: "",
  googleSiteVerification: "",
  businessAddress: "",
  businessCity: "Dhaka",
  businessRegion: "Dhaka",
  businessPostalCode: "",
  businessCountry: "BD",
  playStoreUrl: "https://play.google.com/store/apps/details?id=com.foodbela.app",
  appDownloadUrl: "https://play.google.com/store/apps/details?id=com.foodbela.app",
  restaurantApplyUrl: "/restaurants#apply",
  riderApplyUrl: "/riders#apply",
  supportPhone: "+880 1700-000000",
  supportEmail: "hello@foodbela.com",
  facebookUrl: "#",
  instagramUrl: "#",
  linkedinUrl: "#",
  tiktokUrl: "#",
  youtubeUrl: "#",
  snapchatUrl: "#",
  socialLinksOrder: ["facebook", "instagram", "youtube", "linkedin", "tiktok", "snapchat"],
  heroTitle:
    "খাবার অর্ডার, রেস্টুরেন্ট বড় করা আর রাইডার আয়—সব একসাথে Foodbela.",
  heroSubtitle:
    "Foodbela আপনার এলাকায় দ্রুত খাবার ডেলিভারি, রেস্টুরেন্ট পার্টনারশিপ এবং রাইডার অনবোর্ডিংকে এক প্ল্যাটফর্মে আনে।",
  heroTitleEn: "Order food, grow restaurants, and power riders with Foodbela.",
  heroSubtitleEn:
    "Foodbela brings fast local delivery, restaurant partnerships, and rider onboarding into one connected platform.",
  customerYoutubeUrl: "https://www.youtube-nocookie.com/embed/ysz5S6PUM-U",
  customerVideoOrientation: "portrait",
  customerOfferEnabled: false,
  customerOfferTitle: "",
  customerOfferDescription: "",
  customerOfferCtaLabel: "অফার দেখুন",
  customerOfferCtaUrl: "#",
  websiteModalEnabled: true,
  websiteModalMode: "image_text_button",
  websiteModalImageUrl: "",
  websiteModalTitle: "Foodbela অ্যাপ ইনস্টল করুন",
  websiteModalTitleEn: "Install the Foodbela app",
  websiteModalDescription:
    "ফোন দিয়ে QR code স্ক্যান করে Play Store থেকে Foodbela অ্যাপ ইনস্টল করুন।",
  websiteModalDescriptionEn:
    "Scan the QR code with your phone and install Foodbela from Play Store.",
  websiteModalCtaLabel: "Google Play থেকে ডাউনলোড",
  websiteModalCtaLabelEn: "Download from Google Play",
  websiteModalCtaUrl: "https://play.google.com/store/apps/details?id=com.foodbela.app",
  websiteModalDelaySeconds: 1,
  websiteModalFrequency: "session",
  websiteBannerEnabled: false,
  websiteBannerText: "Foodbela অ্যাপ এখন Play Store-এ পাওয়া যাচ্ছে.",
  websiteBannerTextEn: "Foodbela app is now available on Play Store.",
  websiteBannerCtaLabel: "অ্যাপ ডাউনলোড",
  websiteBannerCtaLabelEn: "Download app",
  websiteBannerCtaUrl: "https://play.google.com/store/apps/details?id=com.foodbela.app",
  coverageRewardAmount: 2000,
  serviceAreas: [
    {
      name: "Dhaka",
      status: "active",
      note: "Selected zones now live",
      noteBn: "ঢাকার নির্বাচিত এলাকায় Foodbela কভারেজ লাইভ আছে।",
      noteEn: "Foodbela coverage is live in selected Dhaka zones.",
      popularSearches: ["Dhaka food delivery", "Dhaka restaurant delivery", "food delivery app Dhaka"],
      cuisineKeywords: ["Burger", "Biryani", "Fast food", "Dessert"],
      postalCodes: [],
    },
    {
      name: "Mirpur",
      status: "active",
      note: "Fast local delivery coverage",
      noteBn: "মিরপুরে দ্রুত লোকাল ডেলিভারি কভারেজ চালু আছে।",
      noteEn: "Fast local delivery coverage is active in Mirpur.",
      popularSearches: ["Mirpur food delivery", "Mirpur restaurant", "burger delivery Mirpur"],
      cuisineKeywords: ["Burger", "Biryani", "Chinese", "Cafe"],
      postalCodes: [],
    },
    {
      name: "Dhanmondi",
      status: "coming_soon",
      note: "Launching soon",
      noteBn: "ধানমন্ডিতে Foodbela শিগগির চালুর পরিকল্পনায় আছে।",
      noteEn: "Foodbela is planned to launch in Dhanmondi soon.",
      popularSearches: ["Dhanmondi food delivery", "Dhanmondi restaurant partner"],
      cuisineKeywords: ["Cafe", "Dessert", "Fast food"],
      postalCodes: [],
    },
  ],
};

const compactHeroSubtitle =
  "আপনার এলাকার প্রিয় খাবার, লাইভ ট্র্যাকিং আর দ্রুত ডেলিভারি—সব এক অ্যাপে।";
const compactHeroSubtitleEn =
  "Your local favorites, live tracking, and fast delivery in one app.";
const oldDefaultHeroSubtitleMarkers = [
  "রেস্টুরেন্ট পার্টনারশিপ",
  "রাইডার",
  "এক প্ল্যাটফর্মে",
];

fallbackSettings.heroSubtitle = compactHeroSubtitle;
fallbackSettings.heroSubtitleEn = compactHeroSubtitleEn;

let settingsCache = {
  value: null,
  expiresAt: 0,
};

function getBackendApiBaseUrl() {
  return (
    process.env.BACKEND_API_BASE_URL || "http://localhost:5000/api/v1"
  ).replace(/\/$/, "");
}

async function postBackend(path, payload) {
  const response = await fetch(`${getBackendApiBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const responsePayload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      responsePayload.message ||
        `Backend request failed with status ${response.status}`,
    );
    error.statusCode = response.status;
    error.code = responsePayload.code || "BACKEND_REQUEST_FAILED";
    error.errors = responsePayload.errors;
    throw error;
  }

  return responsePayload;
}

async function getWebsiteSettings() {
  if (settingsCache.value && settingsCache.expiresAt > Date.now()) {
    return settingsCache.value;
  }

  try {
    const response = await fetch(`${getBackendApiBaseUrl()}/website/settings`, {
      headers: { accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Settings request failed with status ${response.status}`);
    }

    const payload = await response.json();
    const settings = { ...fallbackSettings, ...(payload.data ?? {}) };
    if (
      oldDefaultHeroSubtitleMarkers.every((marker) =>
        String(settings.heroSubtitle || "").includes(marker),
      )
    ) {
      settings.heroSubtitle = compactHeroSubtitle;
    }
    if (
      settings.heroSubtitleEn ===
      "Foodbela brings fast local delivery, restaurant partnerships, and rider onboarding into one connected platform."
    ) {
      settings.heroSubtitleEn = compactHeroSubtitleEn;
    }
    settingsCache = {
      value: settings,
      expiresAt: Date.now() + 30_000,
    };
    return settings;
  } catch {
    return fallbackSettings;
  }
}

async function sendWebsiteAnalyticsEvent(payload) {
  return postBackend("/website/analytics/events", payload);
}

async function getAreaRestaurants(areaName, limit = 36) {
  const area = String(areaName || "").trim();
  if (!area) return [];

  try {
    const query = new URLSearchParams({
      area,
      limit: String(Math.max(1, Math.min(60, limit))),
    });
    const response = await fetch(
      `${getBackendApiBaseUrl()}/website/area-restaurants?${query.toString()}`,
      { headers: { accept: "application/json" } },
    );
    if (!response.ok) return [];
    const payload = await response.json();
    const items = payload?.data?.items || [];
    return Array.isArray(items)
      ? items.slice(0, limit).map((item) => ({
          id: String(item.id || item._id || ""),
          slug: String(item.slug || ""),
          name: String(item.name || ""),
          description: String(item.description || ""),
          cuisines: Array.isArray(item.cuisines)
            ? item.cuisines
            : Array.isArray(item.cuisineTypes)
              ? item.cuisineTypes
              : [],
          city: String(item.city || ""),
          address: String(item.address || ""),
          imageUrl: item.imageUrl || item.logoUrl || "",
          isOpen: item.isOpen !== false,
          serviceArea: item.serviceArea || {},
        }))
      : [];
  } catch {
    return [];
  }
}

module.exports = {
  fallbackSettings,
  getAreaRestaurants,
  getBackendApiBaseUrl,
  getWebsiteSettings,
  postBackend,
  sendWebsiteAnalyticsEvent,
};
