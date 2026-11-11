// Foodbela theme: warm amber brand (#FFB84C) on clean neutral surfaces.
//
// Contrast rule (important): #FFB84C is a LIGHT colour — white text on it is unreadable
// (~1.7:1). So:
//   • `primary`   = the brand FILL (buttons, chips, badges, header). Put `onPrimary`
//                   (near-black) text/icons on it, never white.
//   • `secondary` = the same amber hue, darkened for TEXT / ICONS / BORDERS on white
//                   (~4.7:1, WCAG AA). Use it for links, active labels, accent icons.
export const palette = {
  background: "#F6F6F7",
  surface: "#FFFFFF",
  surfaceMuted: "#F4F5F7",
  foreground: "#111111",
  mutedForeground: "#5F6368",
  border: "#E6E6E6",
  primary: "#FFB84C",
  onPrimary: "#111111",
  primaryPressed: "#F5A623",
  heroBackground: "#FFF4E0",
  heroOrbPrimary: "#FFD48A",
  heroOrbSecondary: "#FFE2B3",
  heroAccentText: "#A86300",
  secondary: "#A86300",
  sky: "#5D8BFF",
  mint: "#38C7A3",
  lime: "#B6D957",
  amber: "#FFC857",
  primarySoft: "#FFF4E0",
  primaryStrong: "#111111",
  successSurface: "#EFFAF5",
  successText: "#14985B",
  warningSurface: "#FFF6E3",
  warningText: "#C46A00",
  placeholder: "#9CA3AF",
  shadow: "rgba(17, 17, 17, 0.10)",
} as const;
