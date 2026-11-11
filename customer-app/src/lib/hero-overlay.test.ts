import { DEFAULT_HERO_OVERLAY_COLOR, heroOverlayTheme, hexLuminance } from "./hero-overlay";

describe("heroOverlayTheme", () => {
  it("falls back to the default dark text for missing / invalid colours", () => {
    expect(heroOverlayTheme(undefined).text).toBe(DEFAULT_HERO_OVERLAY_COLOR);
    expect(heroOverlayTheme("").text).toBe(DEFAULT_HERO_OVERLAY_COLOR);
    expect(heroOverlayTheme("not-a-colour").text).toBe(DEFAULT_HERO_OVERLAY_COLOR);
  });

  it("dark text gets a white glow + light glass (bright GIFs)", () => {
    const theme = heroOverlayTheme("#111111");
    expect(theme.shadow).toBe("rgba(255,255,255,0.85)");
    expect(theme.glassBg).toBe("rgba(255,255,255,0.22)");
  });

  it("light text gets a dark glow + dark glass (night / dark GIFs)", () => {
    const theme = heroOverlayTheme("#ffffff");
    expect(theme.text).toBe("#FFFFFF");
    expect(theme.shadow).toBe("rgba(0,0,0,0.55)");
    expect(theme.glassBg).toBe("rgba(0,0,0,0.28)");
  });

  it("accepts hex without # and normalises case", () => {
    expect(heroOverlayTheme("ffb84c").text).toBe("#FFB84C");
  });

  it("computes luminance at the extremes", () => {
    expect(hexLuminance("#000000")).toBe(0);
    expect(hexLuminance("#FFFFFF")).toBeCloseTo(1);
  });
});
