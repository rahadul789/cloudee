import { getAreaWebDeals } from "../src/modules/customer/customer-home-web";

describe("web home deals area isolation", () => {
  const strip = { isActive: true, mode: "promo_block", imageUrl: "https://example.com/zone.jpg" };
  const content = { customerApp: { homeCms: { offerStrip: strip }, homeCmsAreaOverrides: { "zone:one": { offerStrip: strip }, "zone:off": { offerStrip: { ...strip, isActive: false } }, "district:district-one": { offerStrip: strip } } } };
  it("does not expose global campaigns without a resolved area or an area override", () => {
    expect(getAreaWebDeals(content)).toBeNull();
    expect(getAreaWebDeals(content, { zoneId: "missing" })).toBeNull();
  });
  it("returns the selected zone's explicit content", () => {
    expect(getAreaWebDeals(content, { zoneId: "one" })).toEqual({ zoneId: "one", sourceScope: "zone:one", offerStrip: strip });
  });
  it("never inherits district content and respects a disabled zone override", () => {
    expect(getAreaWebDeals(content, { zoneId: "two", districtId: "district-one" })).toBeNull();
    expect(getAreaWebDeals(content, { zoneId: "off", districtId: "district-one" })).toBeNull();
  });
  it("does not resurrect an old single image when the selected carousel is empty", () => {
    const current = { customerApp: { homeCmsAreaOverrides: { "zone:sadar": { offerStrip: { ...strip, variant: "carousel", carouselImages: [], carouselImageUrls: [] } } } } };
    expect(getAreaWebDeals(current, { zoneId: "sadar" })).toBeNull();
  });
});
