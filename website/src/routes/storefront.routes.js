const express = require("express");
const { backendRequest } = require("../services/customer-api.service");
const { buildPageSeo } = require("../services/seo.service");
const { getAreaRestaurants } = require("../services/website-api.service");
const router = express.Router();
const cardRenderer = import("../../public/js/restaurant-card.mjs");
async function render(req, res, next) {
  try {
    if (req.path === "/restaurants" && req.query.partner === "1") return res.redirect(301, "/restaurant-partner");
    let restaurantData = null;
    let discovery = null;
    let catalog = null;
    let loadError = "";
    try {
      if (req.params.id) restaurantData = await backendRequest(`/customer/restaurants/${encodeURIComponent(req.params.id)}`);
      else if (req.path === "/" || req.path === "/restaurants") {
        const results = await Promise.allSettled([
          backendRequest("/customer/discovery/home"),
          backendRequest("/customer/restaurants/search?page=1&pageSize=18"),
        ]);
        if (results[0].status === "fulfilled") discovery = results[0].value;
        if (results[1].status === "fulfilled") catalog = results[1].value;
        // Discovery may require coordinates. Keep genuine restaurant links in public HTML.
        if (!catalog?.items?.length) {
          const activeArea = (res.locals.websiteSettings.serviceAreas || []).find((area) => area.status === "active");
          if (activeArea) {
            const restaurants = await getAreaRestaurants(activeArea.name, 18);
            if (restaurants.length) catalog = { items: restaurants.filter((r) => r.id).map((r) => ({ _id: r.id, name: r.name, isOpen: r.isOpen, cuisineTypes: r.cuisines, coverImage: { url: r.imageUrl } })) };
          }
        }
        if (!discovery && !catalog) throw results[0].reason;
      }
    } catch (error) {
      if (error.statusCode === 404 && req.params.id) return next();
      loadError = error.message;
    }
    const page = req.params.id ? "restaurant" : req.path === "/checkout" ? "checkout" : req.path.startsWith("/orders") || req.path === "/payment-return" ? "orders" : "home";
    const name = restaurantData?.restaurant?.name;
    const seo = buildPageSeo(req, res.locals.websiteSettings, "home", {
      canonicalPath: req.path,
      ...(name ? { title: `${name} — মেনু ও অর্ডার | Foodbela`, description: restaurantData.restaurant.description || `${name}-এর মেনু দেখুন ও Foodbela দিয়ে খাবার অর্ডার করুন।` } : {}),
      noindex: page === "checkout" || page === "orders" || Boolean(loadError),
    });
    res.set("Cache-Control", "private, no-store");
    const { restaurantCard } = await cardRenderer;
    res.render("pages/storefront", { seo, page, restaurantData, discovery, catalog, restaurantCard, loadError, title: seo.title, description: seo.description });
  } catch (error) { next(error); }
}
router.get(["/", "/restaurants", "/restaurants/:id", "/checkout", "/orders", "/orders/:orderId", "/payment-return"], render);
router.get("/.well-known/assetlinks.json", (req, res) => {
  const fingerprints = String(process.env.ANDROID_APP_LINK_SHA256 || "").split(",").map((s) => s.trim()).filter((s) => /^(?:[A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/.test(s));
  if (!fingerprints.length) return res.status(503).json({ message: "Android app signing fingerprint is not configured." });
  res.json([{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: "com.foodbela.app", sha256_cert_fingerprints: fingerprints } }]);
});
module.exports = router;
