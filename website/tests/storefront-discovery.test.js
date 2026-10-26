const { test } = require("node:test");
const assert = require("node:assert/strict");
const discovery = import("../public/js/storefront-discovery.mjs");

test("deals never fall back to global content or render without images/location", async () => {
  const { zoneDealSlides } = await discovery;
  const strip = { isActive: true, mode: "promo_block", imageUrl: "https://example.com/zone.jpg" };
  assert.deepEqual(zoneDealSlides({ homeCms: { offerStrip: strip } }, true), []);
  assert.deepEqual(zoneDealSlides({ webDeals: { zoneId: "one", sourceScope: "zone:one", offerStrip: strip } }, false), []);
  assert.deepEqual(zoneDealSlides({ webDeals: { zoneId: "one", sourceScope: "zone:one", offerStrip: { ...strip, imageUrl: "" } } }, true), []);
  assert.equal(zoneDealSlides({ webDeals: { zoneId: "one", sourceScope: "zone:one", offerStrip: strip } }, true)[0].url, strip.imageUrl);
  assert.deepEqual(zoneDealSlides({ webDeals: { zoneId: "one", sourceScope: "district:all", offerStrip: strip } }, true), []);
  assert.deepEqual(zoneDealSlides({ webDeals: { zoneId: "one", offerStrip: strip } }, true), []);
  assert.deepEqual(zoneDealSlides({ webDeals: { zoneId: "one", sourceScope: "zone:one", offerStrip: { ...strip, variant: "carousel", carouselImages: [], carouselImageUrls: [] } } }, true), []);
  assert.deepEqual(zoneDealSlides({ webDeals: { zoneId: "one", sourceScope: "zone:one", offerStrip: { ...strip, variant: "text" } } }, true), []);
});
test("closed restaurant menu actions are disabled with the reopening reason", async () => {
  const { menuItemAvailability } = await discovery;
  const status = menuItemAvailability({ availability: { isOpen: false, opensAtLabel: 'সকাল ১০টা' } }, { availability: 'available' });
  assert.equal(status.disabled, true); assert.equal(status.label, 'এখন বন্ধ'); assert.match(status.reason, /সকাল ১০টা/);
  assert.equal(menuItemAvailability({ isOpen: true }, { availability: 'available' }).disabled, false);
});
test("restaurant badges use targeted offers only, including free delivery", async () => {
  const { restaurantOfferLabel } = await discovery;
  const offers = [{ scopeType: "all_restaurants", restaurantIds: ["one"], type: "flat", discountValue: 100 }, { scopeType: "selected_restaurants", restaurantIds: ["one"], type: "percentage", discountValue: 15 }];
  assert.equal(restaurantOfferLabel("one", offers), "15% ছাড়");
  assert.equal(restaurantOfferLabel("two", offers), "");
  assert.equal(restaurantOfferLabel("one", [{ restaurantId: "one", type: "free_delivery" }]), "ফ্রি ডেলিভারি");
  const { restaurantCard } = await import("../public/js/restaurant-card.mjs");
  assert.match(restaurantCard({ _id: "one", name: "One", offerLabel: "15% ছাড়" }), /restaurant-offer/);
});
