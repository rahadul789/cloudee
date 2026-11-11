import { heroSlideDeliveryUrl } from "../src/modules/customer/hero-media-url";

const BASE = "https://res.cloudinary.com/jzc7lig4";

describe("heroSlideDeliveryUrl", () => {
  it("serves pre-optimised Cloudinary WebP via the short URL (app optimiser skips it)", () => {
    expect(heroSlideDeliveryUrl(`${BASE}/image/upload/v1794337069/foodbela/admin/home-hero/abc.webp`)).toBe(
      `${BASE}/v1794337069/foodbela/admin/home-hero/abc.webp`,
    );
  });

  it("keeps GIFs on the normal URL so f_auto can still shrink them", () => {
    const gif = `${BASE}/image/upload/v1/foodbela/admin/home-hero/abc.gif`;
    expect(heroSlideDeliveryUrl(gif)).toBe(gif);
  });

  it("leaves URLs that already carry transformations alone", () => {
    const transformed = `${BASE}/image/upload/f_auto,q_auto/v1/foodbela/abc.webp`;
    expect(heroSlideDeliveryUrl(transformed)).toBe(transformed);
  });

  it("passes non-Cloudinary URLs through and tolerates junk", () => {
    expect(heroSlideDeliveryUrl("https://media.giphy.com/media/x/giphy.gif")).toBe("https://media.giphy.com/media/x/giphy.gif");
    expect(heroSlideDeliveryUrl(undefined)).toBe("");
    expect(heroSlideDeliveryUrl("  ")).toBe("");
  });

  it("handles a WebP without a version segment", () => {
    expect(heroSlideDeliveryUrl(`${BASE}/image/upload/foodbela/abc.webp`)).toBe(`${BASE}/foodbela/abc.webp`);
  });
});
