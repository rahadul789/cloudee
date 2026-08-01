// Shared, professional colour presets for the home search+categories panel and the offer
// cards. Admin picks a preset (or a custom colour), or runs "random" — which rotates the
// preset on a deterministic 5-hour bucket (same for everyone, no timer, changes on the next
// render after the boundary). When the background changes, the text/accent colours change
// with it so contrast always stays readable.

export type PanelTheme = {
  bg: string; // panel / card background
  border: string; // border colour
  glow: string; // shadow / glow colour
  text: string; // primary text (category labels, offer discount)
  subText: string; // secondary text (offer condition)
  accent: string; // vibrant accent (offer badge + code fill)
  accentOn: string; // icon / text sitting ON the accent
};

export type PanelThemeConfig = {
  mode?: "manual" | "random";
  preset?: string; // preset id or "custom"
  customColor?: string;
};

export const PANEL_PRESETS: Record<string, PanelTheme> = {
  // Dark grounds → light text.
  neon: { bg: "#211A2E", accent: "#FFC94D", accentOn: "#1B1426", text: "#ECE7F2", subText: "#C9C2D6", border: "rgba(255,201,77,0.4)", glow: "#FFC94D" },
  ocean: { bg: "#0F2A43", accent: "#4BB8F5", accentOn: "#06283D", text: "#E6F3FB", subText: "#A9C7DB", border: "rgba(75,184,245,0.4)", glow: "#4BB8F5" },
  sunset: { bg: "#2E1626", accent: "#FF7A9C", accentOn: "#2A0F1A", text: "#FDE7EF", subText: "#D9A9BC", border: "rgba(255,122,156,0.4)", glow: "#FF7A9C" },
  forest: { bg: "#12251C", accent: "#34D399", accentOn: "#0C241C", text: "#E4F6EC", subText: "#A9CCB8", border: "rgba(52,211,153,0.4)", glow: "#34D399" },
  grape: { bg: "#241A38", accent: "#A78BFA", accentOn: "#1A1030", text: "#EDE7FA", subText: "#BCB0D6", border: "rgba(167,139,250,0.4)", glow: "#A78BFA" },
  midnight: { bg: "#14161F", accent: "#60A5FA", accentOn: "#0A1220", text: "#E8ECF5", subText: "#A9B0C2", border: "rgba(96,165,250,0.4)", glow: "#60A5FA" },
  mocha: { bg: "#241A16", accent: "#E9A06A", accentOn: "#241108", text: "#F6EAE0", subText: "#CFB6A4", border: "rgba(233,160,106,0.4)", glow: "#E9A06A" },
  // Light grounds → dark text.
  light: { bg: "#FFFFFF", accent: "#FF6392", accentOn: "#FFFFFF", text: "#2E2E38", subText: "#6F7285", border: "rgba(255,224,236,0.92)", glow: "rgba(31,36,48,0.1)" },
  rose: { bg: "#FFF0F5", accent: "#E11D66", accentOn: "#FFFFFF", text: "#3A2530", subText: "#8A6D78", border: "rgba(225,29,102,0.25)", glow: "rgba(225,29,102,0.16)" },
  mint: { bg: "#EAF8F0", accent: "#0E9F6E", accentOn: "#FFFFFF", text: "#14261C", subText: "#5E8571", border: "rgba(14,159,110,0.25)", glow: "rgba(14,159,110,0.16)" },
  sand: { bg: "#FBF3E7", accent: "#C77D33", accentOn: "#FFFFFF", text: "#2E2416", subText: "#7A6A50", border: "rgba(199,125,51,0.28)", glow: "rgba(199,125,51,0.16)" },
};

// Ids + labels for the admin picker (keep in sync with PANEL_PRESETS).
export const PANEL_PRESET_OPTIONS: { id: string; label: string }[] = [
  { id: "neon", label: "Neon (amber)" },
  { id: "ocean", label: "Ocean" },
  { id: "sunset", label: "Sunset" },
  { id: "forest", label: "Forest" },
  { id: "grape", label: "Grape" },
  { id: "midnight", label: "Midnight" },
  { id: "mocha", label: "Mocha" },
  { id: "light", label: "Light" },
  { id: "rose", label: "Rose" },
  { id: "mint", label: "Mint" },
  { id: "sand", label: "Sand" },
];

const RANDOM_KEYS = Object.keys(PANEL_PRESETS);

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace("#", "").trim();
  const full =
    normalized.length === 3
      ? normalized.split("").map((c) => c + c).join("")
      : normalized.padEnd(6, "0").slice(0, 6);
  return {
    r: parseInt(full.slice(0, 2), 16) || 0,
    g: parseInt(full.slice(2, 4), 16) || 0,
    b: parseInt(full.slice(4, 6), 16) || 0,
  };
}

function isDarkColor(hex: string): boolean {
  const { r, g, b } = hexToRgb(hex);
  // Perceived luminance (0–1). Below the midpoint reads as a "dark" ground.
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.55;
}

// Admin-chosen background; text + accent auto-computed for readable contrast.
function buildCustomTheme(bg: string): PanelTheme {
  const dark = isDarkColor(bg);
  return {
    bg,
    text: dark ? "#F2EEF7" : "#242028",
    subText: dark ? "#C4BDD0" : "#6F6A78",
    accent: dark ? "#FFC94D" : "#FF6392",
    accentOn: dark ? "#1B1426" : "#FFFFFF",
    border: dark ? "rgba(255,255,255,0.22)" : "rgba(31,36,48,0.14)",
    glow: dark ? "#FFC94D" : "rgba(31,36,48,0.12)",
  };
}

export function resolvePanelTheme(config?: PanelThemeConfig | null): PanelTheme {
  if (config?.mode === "random") {
    const bucket = Math.floor(Date.now() / (5 * 60 * 60 * 1000));
    return PANEL_PRESETS[RANDOM_KEYS[bucket % RANDOM_KEYS.length]];
  }
  if (config?.preset === "custom") {
    return buildCustomTheme(config.customColor || "#211A2E");
  }
  return PANEL_PRESETS[config?.preset ?? "neon"] ?? PANEL_PRESETS.neon;
}
