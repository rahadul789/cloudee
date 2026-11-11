// Colours for the "Deliver to" + bell overlay that floats on the home hero GIF.
// Admin picks one text colour per slide (any GIF can be dark or bright); the glow behind
// the text and the glassy pin/bell tiles are derived from it so it always stays readable.

export type HeroOverlayTheme = {
  text: string;
  subText: string;
  shadow: string;
  glassBg: string;
  glassBorder: string;
};

export const DEFAULT_HERO_OVERLAY_COLOR = "#111111";

function parseHex(value?: string | null) {
  const match = /^#?([0-9a-f]{6})$/i.exec((value ?? "").trim());
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Relative luminance 0..1 (WCAG). */
export function hexLuminance(value: string) {
  const rgb = parseHex(value);
  if (!rgb) return 0;
  const ch = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(rgb.r) + 0.7152 * ch(rgb.g) + 0.0722 * ch(rgb.b);
}

export function heroOverlayTheme(color?: string | null): HeroOverlayTheme {
  const rgb = parseHex(color) ?? parseHex(DEFAULT_HERO_OVERLAY_COLOR)!;
  const hex = `#${[rgb.r, rgb.g, rgb.b].map((c) => c.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  const light = hexLuminance(hex) > 0.45; // light text → sits on a dark GIF
  return {
    text: hex,
    subText: `rgba(${rgb.r},${rgb.g},${rgb.b},0.85)`,
    shadow: light ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.85)",
    glassBg: light ? "rgba(0,0,0,0.28)" : "rgba(255,255,255,0.22)",
    glassBorder: light ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.6)",
  };
}
