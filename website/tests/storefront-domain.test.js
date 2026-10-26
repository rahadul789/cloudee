const { test } = require("node:test");
const assert = require("node:assert/strict");
const domain = import("../public/js/storefront-domain.mjs");
test("CMS app actions map to safe web routes and cannot execute arbitrary URLs", async () => {
  const { cmsPath, escapeHtml } = await domain;
  assert.equal(cmsPath("/(tabs)/browse?search=burger"), "/restaurants?search=burger");
  assert.equal(cmsPath("foodbela://restaurants/test"), "/restaurants/test");
  assert.equal(cmsPath("javascript:alert(1)"), "/restaurants");
  assert.equal(cmsPath("//evil.example"), "/restaurants");
  assert.equal(cmsPath("https://evil.example"), "/restaurants");
  assert.equal(cmsPath("/orders/test/tracking"), "/orders/test");
  assert.doesNotMatch(escapeHtml('<img onerror="test">'), /<img/);
});
test("cart only sends backend item IDs and selections, never client prices", async () => {
  const { cartPayload, validLocation, itemKey } = await domain;
  const item = { itemId: "one", quantity: 2, name: "Item", basePrice: 0.01, selectedVariantOptions: [{ groupName: "Size", optionLabel: "Large" }] };
  const payload = cartPayload({ restaurantId: "restaurant", items: [item] }, { address: "Home", latitude: 24.8, longitude: 90.7 });
  assert.equal(payload.items[0].basePrice, undefined); assert.equal(payload.items[0].name, undefined);
  assert.equal(validLocation({ address: "Home", latitude: 999, longitude: 90 }), false);
  assert.equal(itemKey(item), itemKey({ ...item, quantity: 5 }));
});
test("required variants and add-on bounds are enforced", async () => {
  const { validateSelections } = await domain;
  const item = { variants: [{ name: "Size", minSelect: 1, maxSelect: 1, options: [{ label: "Small" }, { label: "Large" }] }] };
  assert.throws(() => validateSelections(item, [], []));
  assert.throws(() => validateSelections(item, [{ groupName: "Size", optionLabel: "Fake" }], []));
  assert.doesNotThrow(() => validateSelections(item, [{ groupName: "Size", optionLabel: "Large" }], []));
});
test("closed restaurant cards show supplied reopening time and the requested delivery label", async () => {
  const { restaurantCard } = await import("../public/js/restaurant-card.mjs");
  const html = restaurantCard({ _id: "closed", name: "টেস্ট কিচেন", isOpen: false, availability: { isOpen: false, opensAtLabel: "আগামীকাল সকাল ১০টা" } });
  assert.match(html, /closed-overlay/);
  assert.match(html, /আগামীকাল সকাল ১০টা/);
  assert.match(html, /ডেলিভারি ৳20/);
  assert.doesNotMatch(html, /Order for later|order-later/);
});
test("open cards do not invent reopening times and escape merchant data", async () => {
  const { restaurantCard } = await import("../public/js/restaurant-card.mjs");
  const html = restaurantCard({ _id: "open", name: '<script>test</script>', isOpen: true, avgRating: 4.5 });
  assert.doesNotMatch(html, /closed-overlay|খুলবে:|<script>/);
  assert.match(html, /4\.5/);
});
