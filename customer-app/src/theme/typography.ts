import type { TextStyle } from "react-native";

// Clean "delivery-app" type scale (system font: Roboto on Android, SF on iOS). Measured
// from the reference design: lighter weights (500/700 instead of 800/900), near-black
// titles and a neutral grey for meta text. Use these on redesigned surfaces (home, tabs).
export const ink = {
  title: "#111111",
  body: "#2E3338",
  muted: "#5F6368",
  hairline: "#E3E4E6",
  divider: "#F0F0F0",
  chipSurface: "#F4F5F7",
  star: "#FFC107",
} as const;

// Brand amber. LIGHT colour: put onPrimary (dark) text/icons on it, never white.
// Use `strong` for amber text/icons on white (WCAG AA). Mirrors palette.primary/secondary.
export const brand = {
  primary: "#FFB84C",
  strong: "#A86300",
  onPrimary: "#111111",
  onPrimarySoft: "rgba(255,255,255,0.45)",
} as const;

export const type = {
  sectionTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "700",
    color: ink.title,
  },
  sectionSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400",
    color: ink.muted,
  },
  cardTitle: {
    fontSize: 15.5,
    lineHeight: 21,
    fontWeight: "500",
    color: ink.title,
  },
  meta: {
    fontSize: 13.5,
    lineHeight: 19,
    fontWeight: "400",
    color: ink.body,
  },
  offerTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    color: ink.title,
  },
  offerSubtitle: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "400",
    color: ink.muted,
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
    color: ink.title,
  },
  input: {
    fontSize: 14.5,
    lineHeight: 19,
    fontWeight: "400",
    color: "#4A5057",
  },
} satisfies Record<string, TextStyle>;
