const defaultSiteUrl = "https://foodbela.com";
const staticPageDefinitions = {
  home: {
    path: "/",
    title: "Foodbela | আপনার শহরের ফুড ডেলিভারি নেটওয়ার্ক",
    description:
      "Foodbela দিয়ে আপনার এলাকার প্রিয় খাবার অর্ডার করুন, রেস্টুরেন্ট পার্টনার হিসেবে যুক্ত হন, অথবা রাইডার হিসেবে কাজ শুরু করুন।",
    priority: "1.0",
    changefreq: "weekly",
  },
  restaurants: {
    path: "/restaurants",
    title: "Foodbela Restaurant Partner | রেস্টুরেন্ট পার্টনারশিপ",
    description:
      "Foodbela রেস্টুরেন্ট প্যানেল ও মোবাইল অ্যাপ দিয়ে অর্ডার, মেন্যু, পেমেন্ট ও ডেলিভারি অপারেশন সহজে পরিচালনা করুন।",
    priority: "0.9",
    changefreq: "weekly",
  },
  download: {
    path: "/download",
    title: "Download Foodbela App | Foodbela অ্যাপ ডাউনলোড",
    description:
      "Foodbela customer app Play Store থেকে ডাউনলোড করুন এবং আপনার এলাকার খাবার অর্ডার, লাইভ ট্র্যাকিং ও অফার ব্যবহার করুন।",
    priority: "0.9",
    changefreq: "weekly",
  },
  riders: {
    path: "/riders",
    title: "Ride with Foodbela | রাইডার অনবোর্ডিং",
    description:
      "Foodbela রাইডার অ্যাপ দিয়ে আপনার এলাকায় খাবার ডেলিভারি করুন, অর্ডার স্ট্যাটাস দেখুন এবং সুবিধামতো আয় করুন।",
    priority: "0.85",
    changefreq: "weekly",
  },
  about: {
    path: "/about",
    title: "About Foodbela | আমাদের সম্পর্কে",
    description:
      "Foodbela স্থানীয় খাবার ডেলিভারি, রেস্টুরেন্ট পার্টনারশিপ এবং রাইডার নেটওয়ার্ককে একটি স্মার্ট প্ল্যাটফর্মে আনছে।",
    priority: "0.65",
    changefreq: "monthly",
  },
  contact: {
    path: "/contact",
    title: "Contact Foodbela | যোগাযোগ",
    description:
      "কাস্টমার সাপোর্ট, রেস্টুরেন্ট অনবোর্ডিং, রাইডার আবেদন বা কভারেজ রিকোয়েস্টের জন্য Foodbela টিমের সাথে যোগাযোগ করুন।",
    priority: "0.75",
    changefreq: "monthly",
  },
  privacyPolicy: {
    path: "/privacy-policy",
    title: "Privacy Policy | Foodbela",
    description:
      "Read how Foodbela collects, uses, shares, protects, and deletes customer app data including account, location, order, payment, support, analytics, and notification data.",
    priority: "0.45",
    changefreq: "monthly",
  },
  areas: {
    path: "/areas",
    title: "Foodbela Service Areas | Local food delivery coverage",
    description:
      "Foodbela কোন কোন এলাকায় খাবার ডেলিভারি, রেস্টুরেন্ট পার্টনারশিপ এবং রাইডার অনবোর্ডিং দিচ্ছে তা দেখুন।",
    priority: "0.85",
    changefreq: "weekly",
  },
};

function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function cleanExternalUrl(value) {
  const url = String(value || "").trim();
  if (!url || url === "#") return "";
  return url;
}

function getPublicSiteUrl(settings = {}) {
  return stripTrailingSlash(
    settings.siteUrl ||
      process.env.WEBSITE_PUBLIC_URL ||
      process.env.PUBLIC_SITE_URL ||
      process.env.SITE_URL ||
      defaultSiteUrl,
  );
}

function absoluteUrl(settings, path = "/") {
  const baseUrl = getPublicSiteUrl(settings);
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
}

function getOgImageUrl(settings = {}) {
  const configured = cleanExternalUrl(settings.seoOgImageUrl);
  if (configured && !/\/images\/foodbela-icon\.png(?:\?|$)/i.test(configured)) {
    if (configured.startsWith("/")) return absoluteUrl(settings, configured);
    return configured;
  }
  return absoluteUrl(settings, "/images/foodbela-og.png");
}

function normalizePhoneForSchema(phone) {
  return String(phone || "").trim() || "+880 1700-000000";
}

function normalizeText(value, fallback = "") {
  return String(value || fallback).trim();
}

function slugifyArea(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\u0980-\u09FF]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getAreaCanonicalPath(areaName) {
  return `/areas/${slugifyArea(areaName)}-food-delivery`;
}

function getAreaRestaurantsPath(areaName) {
  return `${getAreaCanonicalPath(areaName)}/restaurants`;
}

function getAreaRestaurantPartnerPath(areaName) {
  return `${getAreaCanonicalPath(areaName)}/restaurant-partner`;
}

function getAreaRidersPath(areaName) {
  return `${getAreaCanonicalPath(areaName)}/riders`;
}

function normalizeList(value, fallback = []) {
  const incoming = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const seen = new Set();
  const items = [];
  for (const item of incoming) {
    const text = normalizeText(item);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(text);
  }
  return items.length ? items : fallback;
}

function getAreaPopularSearches(area = {}) {
  const areaName = normalizeText(area.name, "আপনার এলাকা");
  return normalizeList(area.popularSearches, [
    `${areaName} food delivery`,
    `${areaName} খাবার ডেলিভারি`,
    `${areaName} restaurant delivery`,
    `${areaName} রেস্টুরেন্ট পার্টনার`,
    `${areaName} rider job`,
  ]);
}

function getAreaCuisines(area = {}) {
  return normalizeList(area.cuisineKeywords, [
    "Biryani",
    "Burger",
    "Fast food",
    "Chinese",
    "Dessert",
    "Cafe",
  ]);
}

function buildItemListSchema(settings = {}, name = "Foodbela list", items = []) {
  if (!items.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: absoluteUrl(settings, item.path || "/"),
    })),
  };
}

function findServiceAreaBySlug(settings = {}, slug = "") {
  const target = String(slug || "").trim().toLowerCase();
  return (settings.serviceAreas || []).find((area) => {
    const areaSlug = slugifyArea(area.name);
    return target === areaSlug || target === `${areaSlug}-food-delivery`;
  });
}

function getOrderedSocialUrls(settings = {}) {
  const keys = Array.isArray(settings.socialLinksOrder)
    ? settings.socialLinksOrder
    : ["facebook", "instagram", "youtube", "linkedin", "tiktok", "snapchat"];
  const seen = new Set();
  return keys
    .map((key) => {
      const cleanKey = String(key || "").toLowerCase();
      if (seen.has(cleanKey)) return "";
      seen.add(cleanKey);
      return cleanExternalUrl(settings[`${cleanKey}Url`]);
    })
    .filter(Boolean);
}

function safeJsonLd(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function buildAddress(settings = {}) {
  const streetAddress = normalizeText(settings.businessAddress);
  const addressLocality = normalizeText(settings.businessCity, "Dhaka");
  const addressRegion = normalizeText(settings.businessRegion);
  const postalCode = normalizeText(settings.businessPostalCode);
  const addressCountry = normalizeText(settings.businessCountry, "BD");
  if (!streetAddress && !addressLocality && !addressRegion && !postalCode) {
    return undefined;
  }
  return {
    "@type": "PostalAddress",
    ...(streetAddress ? { streetAddress } : {}),
    ...(addressLocality ? { addressLocality } : {}),
    ...(addressRegion ? { addressRegion } : {}),
    ...(postalCode ? { postalCode } : {}),
    addressCountry,
  };
}

function buildOrganizationSchema(settings = {}) {
  const sameAs = getOrderedSocialUrls(settings);
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Foodbela",
    alternateName: [
      "Foodbela Bangladesh",
      "Food Bela",
      "Food Bella",
      "Foodblea",
      "Fodbela",
      "Foodbila",
      "Fudbela",
      "Foodbelaa",
      "Foodvela",
      "Foodbela BD",
      "Foodbela Netrokona",
      "Foodbela Netrakona",
    ],
    keywords:
      "Foodbela, Food Bela, Food Bella, Foodblea, Fodbela, Foodbila, Fudbela, Foodbelaa, Foodvela, food delivery Bangladesh, Netrakona food delivery, Netrokona food delivery",
    url: getPublicSiteUrl(settings),
    logo: absoluteUrl(settings, "/images/Foodbela.svg"),
    image: getOgImageUrl(settings),
    description:
      settings.seoDefaultDescription ||
      staticPageDefinitions.home.description,
    telephone: normalizePhoneForSchema(settings.supportPhone),
    email: normalizeText(settings.supportEmail, "hello@foodbela.com"),
    ...(sameAs.length ? { sameAs } : {}),
    ...(buildAddress(settings) ? { address: buildAddress(settings) } : {}),
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        telephone: normalizePhoneForSchema(settings.supportPhone),
        email: normalizeText(settings.supportEmail, "hello@foodbela.com"),
        areaServed: "BD",
        availableLanguage: ["bn", "en"],
      },
    ],
  };
}

function buildLocalBusinessSchema(settings = {}) {
  const activeAreas = (settings.serviceAreas || [])
    .filter((area) => area && area.name && area.status === "active")
    .map((area) => area.name);
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: "Foodbela",
    url: getPublicSiteUrl(settings),
    image: getOgImageUrl(settings),
    logo: absoluteUrl(settings, "/images/Foodbela.svg"),
    telephone: normalizePhoneForSchema(settings.supportPhone),
    priceRange: "$$",
    ...(buildAddress(settings) ? { address: buildAddress(settings) } : {}),
    ...(activeAreas.length ? { areaServed: activeAreas } : {}),
  };
}

function buildWebsiteSchema(settings = {}) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Foodbela",
    alternateName: ["Food Bela", "Food Bella", "Foodblea", "Fodbela", "Foodbila", "Fudbela", "Foodbelaa", "Foodvela"],
    url: getPublicSiteUrl(settings),
    inLanguage: ["bn-BD", "en"],
    publisher: {
      "@type": "Organization",
      name: "Foodbela",
      logo: absoluteUrl(settings, "/images/Foodbela.svg"),
    },
    potentialAction: {
      "@type": "SearchAction",
      target: `${getPublicSiteUrl(settings)}/areas?search={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

function buildSoftwareApplicationSchema(settings = {}) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Foodbela",
    applicationCategory: "Food delivery application",
    operatingSystem: "Android",
    url: cleanExternalUrl(settings.playStoreUrl) || absoluteUrl(settings, "/download"),
    downloadUrl: cleanExternalUrl(settings.playStoreUrl) || undefined,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "BDT",
    },
  };
}

function buildFaqSchema(faqs = []) {
  const mainEntity = faqs
    .filter((item) => item && item.question && item.answer)
    .map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    }));
  if (!mainEntity.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity,
  };
}

function buildBreadcrumbSchema(settings = {}, crumbs = []) {
  const items = [{ name: "Foodbela", path: "/" }, ...crumbs].map((item, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: item.name,
    item: absoluteUrl(settings, item.path),
  }));
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items,
  };
}

function buildPageSeo(req, settings = {}, pageKey = "home", options = {}) {
  const definition = staticPageDefinitions[pageKey] || staticPageDefinitions.home;
  const canonicalPath = options.canonicalPath || definition.path || req.path || "/";
  const fallbackTitle =
    pageKey === "home" ? settings.seoDefaultTitle || definition.title : definition.title;
  const fallbackDescription =
    pageKey === "home"
      ? settings.seoDefaultDescription || definition.description
      : definition.description;
  const title = normalizeText(options.title, fallbackTitle);
  const description = normalizeText(options.description, fallbackDescription);
  const canonicalUrl = absoluteUrl(settings, canonicalPath);
  const structuredData = [
    buildOrganizationSchema(settings),
    buildBreadcrumbSchema(settings, options.breadcrumbs || []),
    ...(pageKey === "home" ? [buildWebsiteSchema(settings), buildLocalBusinessSchema(settings)] : []),
    ...(pageKey === "download" ? [buildSoftwareApplicationSchema(settings)] : []),
    ...(options.faqs ? [buildFaqSchema(options.faqs)] : []),
    ...(options.structuredData || []),
  ].filter(Boolean);

  return {
    title,
    description,
    canonicalUrl,
    robots: options.noindex ? "noindex,follow" : "index,follow",
    ogType: options.ogType || "website",
    ogImageUrl: getOgImageUrl(settings),
    keywords:
      options.keywords ||
      "Foodbela, Food Bela, Food Bella, Foodblea, Fodbela, Foodbila, Fudbela, Foodbelaa, Foodvela, food delivery, Netrakona food delivery, Netrokona food delivery",
    siteName: "Foodbela",
    locale: "bn_BD",
    googleSiteVerification: normalizeText(settings.googleSiteVerification),
    structuredDataJson: safeJsonLd(structuredData.length === 1 ? structuredData[0] : structuredData),
  };
}

function buildAreasIndexSeo(req, settings = {}) {
  const activeAreas = (settings.serviceAreas || [])
    .filter((area) => area && area.name && area.status === "active")
    .map((area) => ({ name: area.name, path: getAreaCanonicalPath(area.name) }));

  return buildPageSeo(req, settings, "areas", {
    canonicalPath: "/areas",
    breadcrumbs: [{ name: "Service areas", path: "/areas" }],
    structuredData: [
      buildItemListSchema(settings, "Foodbela service areas", activeAreas),
      {
        "@context": "https://schema.org",
        "@type": "Service",
        name: "Foodbela local food delivery coverage",
        serviceType: "Food delivery",
        provider: {
          "@type": "Organization",
          name: "Foodbela",
          url: getPublicSiteUrl(settings),
        },
        areaServed: activeAreas.map((area) => area.name),
      },
    ],
  });
}

function buildAreaSeo(req, settings = {}, area) {
  const areaName = normalizeText(area?.name, "আপনার এলাকা");
  const active = area?.status === "active";
  const path = getAreaCanonicalPath(areaName);
  const fallbackTitle = `Foodbela ${areaName} Food Delivery | ${areaName} খাবার ডেলিভারি`;
  const fallbackDescription = active
    ? `${areaName} এলাকায় Foodbela দিয়ে খাবার অর্ডার, রেস্টুরেন্ট পার্টনারশিপ এবং রাইডার অনবোর্ডিং সম্পর্কে জানুন।`
    : `${areaName} এলাকায় Foodbela কভারেজের আপডেট দেখুন এবং আপনার আগ্রহ জানিয়ে কভারেজ রিকোয়েস্ট করুন।`;
  return buildPageSeo(req, settings, "home", {
    canonicalPath: path,
    title: normalizeText(area?.seoTitle, fallbackTitle),
    description: normalizeText(area?.seoDescription, fallbackDescription),
    noindex: !active,
    breadcrumbs: [{ name: `${areaName} food delivery`, path }],
    structuredData: [
      {
        "@context": "https://schema.org",
        "@type": "Service",
        name: `Foodbela food delivery in ${areaName}`,
        serviceType: "Food delivery",
        provider: {
          "@type": "Organization",
          name: "Foodbela",
          url: getPublicSiteUrl(settings),
        },
        areaServed: areaName,
      },
    ],
  });
}

function buildAreaIntentSeo(req, settings = {}, area, intent = "restaurants", restaurants = []) {
  const areaName = normalizeText(area?.name, "আপনার এলাকা");
  const active = area?.status === "active";
  const intentConfigs = {
    restaurants: {
      path: getAreaRestaurantsPath(areaName),
      title: `Best restaurants in ${areaName} | ${areaName} Foodbela restaurants`,
      description: `${areaName} এলাকার Foodbela restaurant discovery, খাবারের ধরন, local delivery coverage এবং app download guide দেখুন।`,
      crumb: `${areaName} restaurants`,
      serviceType: "Restaurant delivery",
    },
    partner: {
      path: getAreaRestaurantPartnerPath(areaName),
      title: `${areaName} restaurant partner | Foodbela restaurant onboarding`,
      description: `${areaName} এলাকার রেস্টুরেন্ট মালিকদের জন্য Foodbela restaurant panel, mobile app, online order এবং delivery growth সম্পর্কে জানুন।`,
      crumb: `${areaName} restaurant partner`,
      serviceType: "Restaurant onboarding",
    },
    riders: {
      path: getAreaRidersPath(areaName),
      title: `${areaName} rider job | Foodbela rider application`,
      description: `${areaName} এলাকায় Foodbela rider হিসেবে mobile app দিয়ে delivery কাজ শুরু করার নিয়ম, area coverage এবং আবেদন ফর্ম দেখুন।`,
      crumb: `${areaName} rider job`,
      serviceType: "Rider onboarding",
    },
  };
  const intentConfig = intentConfigs[intent] || intentConfigs.restaurants;
  const restaurantItems = restaurants
    .filter((restaurant) => restaurant && restaurant.name)
    .map((restaurant) => ({
      name: restaurant.name,
      path: intentConfig.path,
    }));

  return buildPageSeo(req, settings, "areas", {
    canonicalPath: intentConfig.path,
    title: intentConfig.title,
    description: intentConfig.description,
    noindex: !active,
    breadcrumbs: [
      { name: `${areaName} food delivery`, path: getAreaCanonicalPath(areaName) },
      { name: intentConfig.crumb, path: intentConfig.path },
    ],
    structuredData: [
      {
        "@context": "https://schema.org",
        "@type": "Service",
        name: `Foodbela ${intentConfig.serviceType} in ${areaName}`,
        serviceType: intentConfig.serviceType,
        provider: {
          "@type": "Organization",
          name: "Foodbela",
          url: getPublicSiteUrl(settings),
        },
        areaServed: areaName,
      },
      buildItemListSchema(settings, `${areaName} Foodbela restaurants`, restaurantItems),
    ],
  });
}

function xmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildSitemapXml(settings = {}) {
  const lastmod = new Date(settings.updatedAt || Date.now()).toISOString();
  const staticUrls = Object.values(staticPageDefinitions).map((page) => ({
    loc: absoluteUrl(settings, page.path),
    changefreq: page.changefreq,
    priority: page.priority,
  }));
  const areaUrls = (settings.serviceAreas || [])
    .filter((area) => area && area.name && area.status === "active")
    .flatMap((area) => [
      {
        loc: absoluteUrl(settings, getAreaCanonicalPath(area.name)),
        changefreq: "weekly",
        priority: "0.82",
      },
      {
        loc: absoluteUrl(settings, getAreaRestaurantsPath(area.name)),
        changefreq: "weekly",
        priority: "0.78",
      },
      {
        loc: absoluteUrl(settings, getAreaRestaurantPartnerPath(area.name)),
        changefreq: "weekly",
        priority: "0.72",
      },
      {
        loc: absoluteUrl(settings, getAreaRidersPath(area.name)),
        changefreq: "weekly",
        priority: "0.7",
      },
    ]);
  const urls = [...staticUrls, ...areaUrls];
  const body = urls
    .map(
      (url) => `  <url>
    <loc>${xmlEscape(url.loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`;
}

function buildRobotsTxt(settings = {}) {
  return `User-agent: *
Allow: /
Disallow: /leads
Disallow: /analytics
Disallow: /admin

Sitemap: ${absoluteUrl(settings, "/sitemap.xml")}
`;
}

module.exports = {
  absoluteUrl,
  buildAreaIntentSeo,
  buildAreaSeo,
  buildAreasIndexSeo,
  buildPageSeo,
  buildRobotsTxt,
  buildSitemapXml,
  findServiceAreaBySlug,
  getAreaCanonicalPath,
  getAreaCuisines,
  getAreaPopularSearches,
  getAreaRestaurantPartnerPath,
  getAreaRestaurantsPath,
  getAreaRidersPath,
  getPublicSiteUrl,
  slugifyArea,
  staticPageDefinitions,
};
