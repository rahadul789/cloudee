const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { createFixture } = require("./helpers/storefront-fixture.cjs");
let backend, server, base, fixture;
const originalFetch = global.fetch;
before(async () => {
  process.env.NODE_ENV = "test";
  fixture = createFixture(); backend = await new Promise((resolve) => { const s = fixture.app.listen(0, "127.0.0.1", () => resolve(s)); });
  process.env.BACKEND_API_BASE_URL = `http://127.0.0.1:${backend.address().port}/api/v1`;
  const app = require("../src/app");
  server = await new Promise((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`; process.env.WEBSITE_BASE_URL = base;
});
after(async () => { global.fetch = originalFetch; await Promise.all([new Promise((resolve) => server.close(resolve)), new Promise((resolve) => backend.close(resolve))]); });
async function request(path, body, cookie, extraHeaders = {}) {
  return originalFetch(`${base}${path}`, { method: body ? "POST" : "GET", headers: { ...(body ? { "Content-Type": "application/json", "X-Foodbela-Web": "1", origin: base } : {}), ...(cookie ? { cookie } : {}), ...extraHeaders }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
async function login() {
  const res = await request("/shop-api/auth/phone/password", { phone: "01712345678", password: "test-password" });
  return res.headers.get("set-cookie").split(";")[0];
}
test("customer pages render public menus, preserve information pages and exclude private pages from indexing", async () => {
  for (const path of ["/", "/restaurants", "/restaurants/restaurant-test", "/checkout", "/orders", "/payment-return", "/restaurant-partner", "/foodbela", "/about", "/areas"]) {
    const res = await request(path); assert.equal(res.status, 200, path);
    const html = await res.text();
    if (["/checkout", "/orders", "/payment-return"].includes(path)) assert.match(html, /noindex,follow/);
    if (path === "/restaurants/restaurant-test") { assert.match(html, /চিকেন বিরিয়ানি/); assert.match(html, /টেস্ট কিচেন/); }
    if (path === "/") { assert.match(html, /\/restaurant-partner#apply/); assert.doesNotMatch(html, /website-modal/); assert.match(html, /class="filter-panel"/); assert.match(html, /id="mobile-cart-open"/); }
  }
  assert.equal((await request("/restaurants/missing")).status, 404);
});
test("BFF rejects cross-site writes and unknown backend paths", async () => {
  assert.equal((await request("/shop-api/cart/quote", { items: [] }, null, { origin: "https://evil.example" })).status, 403);
  assert.equal((await request("/shop-api/cart/quote", { items: [] }, null, { "X-Foodbela-Web": "" })).status, 403);
  assert.equal((await request("/shop-api/admin/users")).status, 404);
  assert.equal((await request("/shop-api/orders", { items: [] })).status, 401);
});
test("login keeps credentials in authenticated HttpOnly cookies and forwards owned requests", async () => {
  const response = await request("/shop-api/auth/phone/password", { phone: "01712345678", password: "test-password" });
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/);
  assert.doesNotMatch(cookie, /fixture-refresh-only/);
  const payload = await response.json(); assert.equal(payload.data.customer.phone, "01712345678");
  assert.equal(payload.data.accessToken, undefined); assert.equal(payload.data.refreshToken, undefined);
  assert.equal((await request("/shop-api/profile", null, cookie.split(";")[0])).status, 200);
  assert.equal((await request("/shop-api/profile", null, "foodbela_customer=tampered")).status, 401);
});
test("location goes to CMS and quote endpoints; quote errors remain blocking backend errors", async () => {
  const res = await request("/shop-api/home?latitude=24.88&longitude=90.72");
  assert.equal((await res.json()).data.homeCms.offerStrip.title, "আপনার জোনের অফার");
  const cart = { restaurantId: "restaurant-test", items: [{ itemId: "item-test", quantity: 2 }], latitude: 24.88, longitude: 90.72 };
  assert.equal((await (await request("/shop-api/cart/quote", cart)).json()).data.pricing.total, 395);
  fixture.setQuoteFailure(true);
  assert.equal((await request("/shop-api/cart/quote", cart)).status, 400);
  fixture.setQuoteFailure(false);
});
test("same clientOrderId survives retries; bKash requests are marked web", async () => {
  const cookie = await login();
  const body = { restaurantId: "restaurant-test", clientOrderId: "web-retry-test", items: [{ itemId: "item-test", quantity: 1 }], paymentMethod: "Cash", deliveryAddress: { label: "Home", addressLine: "Netrakona", latitude: 24.88, longitude: 90.72 } };
  const first = (await (await request("/shop-api/orders", body, cookie)).json()).data;
  const second = (await (await request("/shop-api/orders", body, cookie)).json()).data;
  assert.equal(first.order._id, second.order._id); assert.equal(fixture.orders.length, 1);
  await request("/shop-api/payments/bkash/initiate", { ...body, walletNumber: "01712345678", clientPlatform: "app" }, cookie);
  assert.equal(fixture.calls.findLast((c) => c.path.endsWith("/bkash/initiate")).body.clientPlatform, "web");
});
test("expired access tokens refresh once across parallel requests without exposing tokens", async () => {
  const { seal } = require("../src/services/customer-session.service");
  const expired = `test.${Buffer.from(JSON.stringify({ exp: 1 })).toString("base64url")}.test`;
  const cookie = `foodbela_customer=${seal({ accessToken: expired, refreshToken: "refresh-for-concurrency-test", expiresAt: Date.now()+60000 })}`;
  const responses = await Promise.all([request("/shop-api/profile", null, cookie), request("/shop-api/home", null, cookie)]);
  assert.ok(responses.every((res) => res.status === 200)); assert.equal(fixture.getRefreshCount(), 1);
});
test("App Links never publish made-up fingerprints", async () => {
  assert.equal((await request("/.well-known/assetlinks.json")).status, 503);
  process.env.ANDROID_APP_LINK_SHA256 = Array(32).fill("AB").join(":");
  const data = await (await request("/.well-known/assetlinks.json")).json();
  assert.equal(data[0].target.package_name, "com.foodbela.app"); delete process.env.ANDROID_APP_LINK_SHA256;
});
test("OTP start, verification and account completion reuse backend contracts", async () => {
  const start = await (await request("/shop-api/auth/phone/start", { phone: "01712345678", useOtp: true })).json();
  assert.equal(start.data.flow, "otp");
  assert.equal((await request("/shop-api/auth/phone/otp/verify", { verificationSessionId: start.data.verificationSessionId, otpCode: "0000" })).status, 400);
  const verified = await (await request("/shop-api/auth/phone/otp/verify", { verificationSessionId: start.data.verificationSessionId, otpCode: "1234" })).json();
  const completed = await request("/shop-api/auth/phone/verify", { verificationSessionId: verified.data.verificationSessionId, fullName: "টেস্ট ব্যবহারকারী" });
  assert.equal(completed.status, 200); assert.match(completed.headers.get("set-cookie"), /HttpOnly/);
  assert.equal((await completed.json()).data.accessToken, undefined);
});
test("backend revocation clears cookies but a refresh outage preserves login", async () => {
  const { seal } = require("../src/services/customer-session.service");
  const expired = `test.${Buffer.from(JSON.stringify({ exp: 1 })).toString("base64url")}.test`;
  const requestWith = token => request("/shop-api/profile", null, `foodbela_customer=${seal({ accessToken: expired, refreshToken: token, expiresAt: Date.now()+60000 })}`);
  const revoked = await requestWith("revoked-test");
  assert.equal(revoked.status, 401);
  assert.match(revoked.headers.get("set-cookie"), /Expires=Thu, 01 Jan 1970/);
  const outage = await requestWith("temporary-outage-test");
  assert.equal(outage.status, 503);
  assert.equal(outage.headers.get("set-cookie"), null);
});
test("successful visits renew older persistent cookies and logout explicitly clears them", async () => {
  const { seal } = require("../src/services/customer-session.service");
  const token = `test.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now()/1000)+86400 })).toString("base64url")}.test`;
  const cookie = `foodbela_customer=${seal({ accessToken: token, refreshToken: token, expiresAt: Date.now()+86400000, cookieRenewedAt: Date.now()-2*86400000 })}`;
  const response = await request("/shop-api/profile", null, cookie);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /HttpOnly/);
  const logout = await request("/shop-api/auth/logout", {}, cookie);
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie"), /Expires=Thu, 01 Jan 1970/);
});
