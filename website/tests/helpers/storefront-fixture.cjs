const express = require("express");
const restaurant = { _id: "restaurant-test", name: "টেস্ট কিচেন", description: "শুধু স্থানীয় পরীক্ষার রেস্টুরেন্ট", cuisineTypes: ["বাংলা খাবার"], isOpen: true, availability: { isOpen: true }, isServiceableForSelectedLocation: true, preparationTimeMinutes: 25 };
const menuItem = { _id: "item-test", categoryId: "main", name: "চিকেন বিরিয়ানি", basePrice: 180, description: "পরীক্ষার খাবার", availability: "available", variants: [{ name: "সাইজ", minSelect: 1, maxSelect: 1, options: [{ label: "রেগুলার", priceDelta: 0 }, { label: "বড়", priceDelta: 60 }] }], addOnGroups: [{ name: "অতিরিক্ত", minSelect: 0, maxSelect: 1, options: [{ label: "ডিম", price: 20 }] }] };
function createFixture() {
  const app = express(); app.use(express.json());
  const calls = [], orders = [], idempotent = new Map(); let quoteFailure = false, refreshCount = 0;
  const token = () => `test.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now()/1000) + 3600 })).toString("base64url")}.test`;
  const customer = { _id: "customer-test", fullName: "টেস্ট ব্যবহারকারী", phone: "01712345678" };
  const auth = () => ({ accessToken: token(), refreshToken: "fixture-refresh-only", customer });
  app.use((req, _res, next) => { calls.push({ method: req.method, path: req.path, query: req.query, body: req.body, authorization: req.get("authorization") }); next(); });
  const ok = (res, data) => res.json({ data });
  app.get("/api/v1/website/settings", (_req,res) => ok(res, { siteUrl: "https://foodbela.com", serviceAreas: [{ name: "Netrakona", status: "active" }], websiteModalEnabled: false }));
  app.get("/api/v1/public/content", (_req,res) => ok(res, { operations: { payments: { bkashEnabled: true } } }));
  app.get("/api/v1/customer/discovery/home", (req,res) => ok(res, { homeCms: { homeCategories: { isActive: true, title: "পছন্দের খাবার", items: [{ label: "বিরিয়ানি", searchQuery: "বিরিয়ানি", isActive: true }] }, offerStrip: { isActive: true, mode: "promo_block", title: req.query.latitude ? "আপনার জোনের অফার" : "আজকের অফার", subtitle: "CMS থেকে পরীক্ষার কনটেন্ট", ctaLabel: "রেস্টুরেন্ট দেখুন", ctaPath: "/(tabs)/browse" }, restaurantSections: { featured: { isActive: true, title: "বিশেষ রেস্টুরেন্ট" } } }, featuredRestaurants: [restaurant], nearbyRestaurants: [], activeOffers: [] }));
  app.get("/api/v1/customer/restaurants/search", (req,res) => ok(res, { items: req.query.latitude === "0" ? [] : [restaurant], page: 1, total: 1, hasNextPage: false }));
  app.get("/api/v1/customer/restaurants/:id", (req,res) => req.params.id === restaurant._id ? ok(res, { restaurant, categories: [{ _id: "main", name: "প্রধান খাবার" }], menuItems: [menuItem], activeOffers: [] }) : res.status(404).json({ message: "Not found" }));
  app.post("/api/v1/customer/auth/phone/start", (req,res) => ok(res, { flow: req.body.useOtp ? "otp" : "password", phone: req.body.phone, verificationSessionId: "otp-session-test", resendAvailableInSeconds: 1 }));
  app.post("/api/v1/customer/auth/phone/otp/verify", (req,res) => req.body.otpCode === "1234" ? ok(res, { verificationSessionId: "verified-test" }) : res.status(400).json({ message: "Invalid OTP" }));
  app.post("/api/v1/customer/auth/phone/password", (req,res) => req.body.password === "test-password" ? ok(res, auth()) : res.status(401).json({ message: "Wrong password" }));
  app.post("/api/v1/customer/auth/phone/verify", (_req,res) => ok(res, auth()));
  app.post("/api/v1/customer/auth/refresh", (_req,res) => { refreshCount++; ok(res, auth()); });
  app.post("/api/v1/customer/auth/logout", (_req,res) => ok(res, {}));
  app.get("/api/v1/customer/profile", (req,res) => req.get("authorization") ? ok(res, customer) : res.status(401).json({ message: "Login required" }));
  app.get("/api/v1/customer/locations", (_req,res) => ok(res, []));
  const quote = (body) => {
    const items = body.items.map((i) => { const unitPrice = 180 + (i.selectedVariantOptions?.some((s) => s.optionLabel === "বড়") ? 60 : 0) + (i.selectedAddOnOptions?.length ? 20 : 0); return { ...i, name: menuItem.name, unitPrice, lineTotal: unitPrice * i.quantity }; });
    const subtotal = items.reduce((sum,i) => sum+i.lineTotal,0);
    return { restaurant: { id: restaurant._id, name: restaurant.name }, items, minimumOrder: { isMet: subtotal >= 100, amount: 100 }, pricing: { subtotal, deliveryFee: 35, discountAmount: 0, total: subtotal + 35 }, serviceArea: { zoneId: "test-zone", zoneName: "টেস্ট জোন" } };
  };
  app.post("/api/v1/customer/cart/quote", (req,res) => quoteFailure || req.body.latitude === 0 ? res.status(400).json({ message: "এই ঠিকানায় ডেলিভারি পাওয়া যায় না।", code: "OUTSIDE_SERVICE_AREA" }) : ok(res, quote(req.body)));
  app.use("/api/v1/customer/orders", (req,res,next) => req.get("authorization") ? next() : res.status(401).json({ message: "Login required" }));
  app.post("/api/v1/customer/orders", (req,res) => {
    if (!req.body.deliveryAddress || req.body.latitude === 0) return res.status(400).json({ message: "Missing address" });
    if (idempotent.has(req.body.clientOrderId)) return ok(res, idempotent.get(req.body.clientOrderId));
    const q = quote(req.body), order = { _id: `order-${orders.length+1}`, orderNumber: `FB-TEST-${orders.length+1}`, status: "New", paymentMethod: "Cash", paymentStatus: "unpaid", pricing: q.pricing, itemsSnapshot: q.items, createdAt: new Date().toISOString(), customerSnapshot: { deliveryAddress: req.body.deliveryAddress }, history: [{ status: "New", createdAt: new Date().toISOString() }] };
    orders.push(order); const data = { order, quote: q }; idempotent.set(req.body.clientOrderId, data); ok(res, data);
  });
  app.get("/api/v1/customer/orders", (_req,res) => ok(res, orders));
  app.get("/api/v1/customer/orders/:id", (req,res) => { const order = orders.find((o) => o._id === req.params.id); return order ? ok(res, order) : res.status(404).json({ message: "Not found" }); });
  app.post("/api/v1/customer/orders/:id/cancel", (req,res) => { const order = orders.find((o) => o._id === req.params.id); if (order) { order.status = "Cancelled"; return ok(res, order); } res.status(404).json({ message: "Not found" }); });
  app.post("/api/v1/customer/payments/bkash/initiate", (_req,res) => ok(res, { sessionId: "bkash-test", bkashURL: "https://payment.bkash.com/test", amount: 215 }));
  app.post("/api/v1/public/content/customer-home-event", (_req,res) => ok(res, {}));
  return { app, calls, orders, setQuoteFailure(value) { quoteFailure = value; }, getRefreshCount() { return refreshCount; } };
}
module.exports = { createFixture };
