const express = require("express");
const {
  faqs,
  restaurantBenefits,
  riderBenefits,
} = require("../data/site");
const {
  buildAreaIntentSeo,
  buildAreaSeo,
  buildAreasIndexSeo,
  buildPageSeo,
  buildRobotsTxt,
  buildSitemapXml,
  findServiceAreaBySlug,
  getAreaCuisines,
  getAreaPopularSearches,
} = require("../services/seo.service");
const { renderQrPng, renderQrSvg } = require("../services/qr-code.service");
const { getAreaRestaurants } = require("../services/website-api.service");

const router = express.Router();

function getSettings(res) {
  return res.locals.websiteSettings || {};
}

function getInstallTarget(settings) {
  const appInstallUrl = settings.playStoreUrl || settings.appDownloadUrl || "/download";
  if (/^https?:\/\//i.test(appInstallUrl)) {
    return appInstallUrl;
  }

  const siteUrl = String(settings.siteUrl || "https://foodbela.com").replace(/\/$/, "");
  const path = appInstallUrl.startsWith("/") ? appInstallUrl : `/${appInstallUrl}`;
  return `${siteUrl}${path}`;
}

function downloadInstallQr(req, res, next, format) {
  try {
    const installTarget = getInstallTarget(getSettings(res));
    const buffer =
      format === "svg"
        ? renderQrSvg(installTarget)
        : renderQrPng(installTarget, { size: 2400 });
    res.set({
      "Cache-Control": "public, max-age=86400",
      "Content-Disposition": `attachment; filename="foodbela-app-qr.${format}"`,
      "Content-Length": String(buffer.length),
    });
    res.type(format === "svg" ? "image/svg+xml" : "image/png").send(buffer);
  } catch (error) {
    next(error);
  }
}

function renderSeoPage(req, res, view, pageKey, options = {}) {
  const seo = buildPageSeo(req, getSettings(res), pageKey, options);
  res.render(view, {
    title: seo.title,
    description: seo.description,
    seo,
    ...options.viewData,
  });
}

router.get("/robots.txt", (req, res) => {
  res.type("text/plain").send(buildRobotsTxt(getSettings(res)));
});

router.get("/sitemap.xml", (req, res) => {
  res.type("application/xml").send(buildSitemapXml(getSettings(res)));
});

router.get("/", (req, res) => {
  renderSeoPage(req, res, "pages/home", "home");
});

router.get("/download/qr.png", (req, res, next) => {
  downloadInstallQr(req, res, next, "png");
});

router.get("/download/qr.svg", (req, res, next) => {
  downloadInstallQr(req, res, next, "svg");
});

router.get("/restaurants", (req, res) => {
  renderSeoPage(req, res, "pages/restaurants", "restaurants", {
    faqs: faqs.restaurants,
    breadcrumbs: [{ name: "Restaurants", path: "/restaurants" }],
    viewData: {
      benefits: restaurantBenefits,
      faqs: faqs.restaurants,
    },
  });
});

router.get("/download", (req, res) => {
  renderSeoPage(req, res, "pages/download", "download", {
    breadcrumbs: [{ name: "Download", path: "/download" }],
  });
});

router.get("/riders", (req, res) => {
  renderSeoPage(req, res, "pages/riders", "riders", {
    faqs: faqs.riders,
    breadcrumbs: [{ name: "Riders", path: "/riders" }],
    viewData: {
      benefits: riderBenefits,
      faqs: faqs.riders,
    },
  });
});

router.get("/about", (req, res) => {
  renderSeoPage(req, res, "pages/about", "about", {
    breadcrumbs: [{ name: "About", path: "/about" }],
  });
});

router.get("/contact", (req, res) => {
  renderSeoPage(req, res, "pages/contact", "contact", {
    breadcrumbs: [{ name: "Contact", path: "/contact" }],
  });
});

router.get("/privacy-policy", (req, res) => {
  renderSeoPage(req, res, "pages/privacy-policy", "privacyPolicy", {
    breadcrumbs: [{ name: "Privacy Policy", path: "/privacy-policy" }],
  });
});

router.get("/areas", (req, res) => {
  const seo = buildAreasIndexSeo(req, getSettings(res));
  res.render("pages/areas", {
    title: seo.title,
    description: seo.description,
    seo,
    areas: getSettings(res).serviceAreas || [],
  });
});

router.get("/areas/:slug/restaurants", async (req, res, next) => {
  const area = findServiceAreaBySlug(getSettings(res), req.params.slug);
  if (!area) return next();
  const restaurants = await getAreaRestaurants(area.name, 36);
  const seo = buildAreaIntentSeo(req, getSettings(res), area, "restaurants", restaurants);
  res.render("pages/area-intent", {
    title: seo.title,
    description: seo.description,
    seo,
    area,
    intent: "restaurants",
    restaurants,
    cuisines: getAreaCuisines(area),
    popularSearches: getAreaPopularSearches(area),
  });
});

router.get("/areas/:slug/restaurant-partner", (req, res, next) => {
  const area = findServiceAreaBySlug(getSettings(res), req.params.slug);
  if (!area) return next();
  const seo = buildAreaIntentSeo(req, getSettings(res), area, "partner");
  res.render("pages/area-intent", {
    title: seo.title,
    description: seo.description,
    seo,
    area,
    intent: "partner",
    restaurants: [],
    cuisines: getAreaCuisines(area),
    popularSearches: getAreaPopularSearches(area),
  });
});

router.get("/areas/:slug/riders", (req, res, next) => {
  const area = findServiceAreaBySlug(getSettings(res), req.params.slug);
  if (!area) return next();
  const seo = buildAreaIntentSeo(req, getSettings(res), area, "riders");
  res.render("pages/area-intent", {
    title: seo.title,
    description: seo.description,
    seo,
    area,
    intent: "riders",
    restaurants: [],
    cuisines: getAreaCuisines(area),
    popularSearches: getAreaPopularSearches(area),
  });
});

router.get("/areas/:slug", (req, res, next) => {
  const area = findServiceAreaBySlug(getSettings(res), req.params.slug);
  if (!area) return next();
  const seo = buildAreaSeo(req, getSettings(res), area);
  res.render("pages/area", {
    title: seo.title,
    description: seo.description,
    seo,
    area,
    cuisines: getAreaCuisines(area),
    popularSearches: getAreaPopularSearches(area),
  });
});

module.exports = router;
