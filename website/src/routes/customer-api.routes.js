const express = require("express");
const { customerRequest, backendRequest } = require("../services/customer-api.service");
const { readSession, writeSession, clearSession } = require("../services/customer-session.service");
const router = express.Router();
const limits = new Map();
router.use((req, res, next) => {
  res.set({ "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" });
  if (!["GET", "HEAD"].includes(req.method)) {
    // Custom header + exact Origin check stops cross-site form/fetch requests.
    const expected = new URL(process.env.WEBSITE_BASE_URL || process.env.WEBSITE_PUBLIC_URL || `${req.protocol}://${req.get("host")}`).origin;
    if (req.get("X-Foodbela-Web") !== "1" || (req.get("origin") && req.get("origin") !== expected)) {
      return res.status(403).json({ message: "এই অনুরোধ অনুমোদিত নয়।" });
    }
  }
  const auth = req.path.startsWith("/auth");
  const bucketKey = `${req.ip}:${auth ? "auth" : "shop"}`;
  const now = Date.now();
  if (limits.size > 10000) for (const [key, entry] of limits) if (entry.until < now) limits.delete(key);
  let bucket = limits.get(bucketKey);
  if (!bucket || bucket.until < now) { bucket = { count: 0, until: now + 60000 }; limits.set(bucketKey, bucket); }
  if (++bucket.count > (auth ? 20 : 180)) return res.status(429).set("Retry-After", "60").json({ message: "একটু অপেক্ষা করে আবার চেষ্টা করুন।" });
  next();
});
const wrap = (fn) => async (req, res) => {
  try { res.json({ data: await fn(req, res) }); }
  catch (error) { res.status(error.statusCode || 500).json({ message: error.message, code: error.code, errors: error.errors }); }
};
const forward = (path, options = {}) => wrap((req, res) => customerRequest(req, res,
  typeof path === "function" ? path(req) : path,
  { ...options, ...(req.method !== "GET" ? { method: req.method, body: req.body } : {}) }));
const query = (req, keys) => {
  const search = new URLSearchParams();
  for (const key of keys) if (typeof req.query[key] === "string") search.set(key, req.query[key]);
  return `?${search}`;
};
const coords = ["latitude", "longitude"];
router.get("/home", forward((req) => `/customer/discovery/home${query(req, coords)}`));
router.get("/restaurants", forward((req) => `/customer/restaurants/search${query(req, [...coords, "search", "page", "pageSize", "filter", "sortBy", "openStrict"])}`));
router.get("/restaurants/:id", forward((req) => `/customer/restaurants/${encodeURIComponent(req.params.id)}${query(req, coords)}`));
router.get("/settings", wrap(async () => {
  const content = await backendRequest("/public/content");
  return { payments: content?.operations?.payments || {} };
}));
router.get("/profile", forward("/customer/profile", { protected: true }));
router.get("/offers/custom-summary", forward("/customer/offers/custom-summary", { protected: true }));
router.post("/offers/custom-request", forward("/customer/offers/custom-request", { protected: true }));
router.get("/locations", forward("/customer/locations", { protected: true }));
router.post("/locations", forward("/customer/locations", { protected: true }));
router.post("/cart/quote", forward("/customer/cart/quote"));
router.get("/orders", forward((req) => `/customer/orders${query(req, ["page", "pageSize", "statusGroup"])}`, { protected: true }));
router.get("/orders/:id", forward((req) => `/customer/orders/${encodeURIComponent(req.params.id)}`, { protected: true }));
router.post("/orders", forward("/customer/orders", { protected: true }));
router.post("/orders/:id/cancel", forward((req) => `/customer/orders/${encodeURIComponent(req.params.id)}/cancel`, { protected: true }));
router.post("/payments/bkash/initiate", wrap((req, res) => customerRequest(req, res, "/customer/payments/bkash/initiate", {
  protected: true, method: "POST", body: { ...req.body, clientPlatform: "web" },
})));
router.post("/poll/vote", forward("/customer/home/poll/vote"));
router.post("/cms/event", forward("/public/content/customer-home-event"));
for (const action of ["phone/start", "phone/otp/verify", "password/forgot", "password/otp/verify", "password/reset"]) {
  router.post(`/auth/${action}`, forward(`/customer/auth/${action}`));
}
for (const action of ["phone/password", "phone/verify"]) {
  router.post(`/auth/${action}`, wrap(async (req, res) => {
    const data = await backendRequest(`/customer/auth/${action}`, { method: "POST", body: req.body, userAgent: req.headers["user-agent"], clientIp: req.ip });
    if (!data?.accessToken || !data?.refreshToken) throw Object.assign(new Error("লগইন সম্পন্ন হয়নি।"), { statusCode: 502 });
    writeSession(res, data);
    return { customer: data.customer };
  }));
}
router.post("/auth/logout", wrap(async (req, res) => {
  const session = readSession(req);
  try { if (session) await backendRequest("/customer/auth/logout", { method: "POST", body: { refreshToken: session.refreshToken } }); }
  finally { clearSession(res); }
  return { loggedOut: true };
}));
module.exports = router;
