import { StyleSheet } from "react-native";

import { palette } from "@/src/theme/palette";

// Full-screen map picker: the map fills the screen; a top bar (back + title pill) and a
// bottom card float over it.
const floatingShadow = {
  shadowColor: "#000000",
  shadowOpacity: 0.14,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 8,
};

export const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },

  // ── Map + pin ──
  centerPinWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  pinWrap: {
    // Lift the icon so its TIP (not its centre) marks the map centre.
    marginTop: -44,
  },
  // Brand amber pin with a dark rim-shadow so it stays visible on light map tiles.
  pinIcon: {
    textShadowColor: "rgba(17,17,17,0.45)",
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 1 },
  },
  pinShadow: {
    position: "absolute",
    width: 16,
    height: 6,
    borderRadius: 8,
    backgroundColor: "#000000",
  },
  pinHalo: {
    position: "absolute",
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: palette.primary,
  },
  pinTooltip: {
    position: "absolute",
    // sits above the pin head
    bottom: "50%",
    marginBottom: 54,
    alignItems: "center",
  },
  pinTooltipText: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: palette.foreground,
    color: "#FFFFFF",
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: "700",
  },
  pinTooltipArrow: {
    width: 10,
    height: 10,
    marginTop: -5,
    transform: [{ rotate: "45deg" }],
    backgroundColor: palette.foreground,
  },
  mapFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 32,
    backgroundColor: palette.background,
  },
  mapFallbackIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primarySoft,
  },
  mapFallbackTitle: { fontSize: 17, lineHeight: 22, fontWeight: "700", color: palette.foreground },
  mapFallbackText: {
    fontSize: 13.5,
    lineHeight: 19,
    color: palette.mutedForeground,
    textAlign: "center",
  },
  mapFallbackButton: {
    marginTop: 6,
    minHeight: 46,
    paddingHorizontal: 20,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: palette.primary,
  },
  mapFallbackButtonText: { fontSize: 14, lineHeight: 18, fontWeight: "700", color: palette.onPrimary },

  // ── Top overlay ──
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
  },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
    ...floatingShadow,
  },
  titlePill: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 22,
    backgroundColor: palette.surface,
    ...floatingShadow,
  },
  titleCopy: { flex: 1, minWidth: 0 },
  titleText: { fontSize: 14.5, lineHeight: 19, fontWeight: "700", color: palette.foreground },
  titleSub: { fontSize: 11.5, lineHeight: 15, color: palette.mutedForeground },

  // ── Bottom overlay ──
  bottomArea: {
    position: "absolute",
    left: 12,
    right: 12,
    gap: 10,
  },
  locateFabWrap: { alignSelf: "flex-end", alignItems: "center", justifyContent: "center" },
  // Amber pill with label — obvious "tap for current location".
  locatePill: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: palette.primary,
    ...floatingShadow,
  },
  locatePillText: { fontSize: 14, lineHeight: 18, fontWeight: "700", color: palette.onPrimary },
  locateRadar: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    backgroundColor: palette.primary,
  },
  card: {
    gap: 14,
    padding: 16,
    borderRadius: 24,
    backgroundColor: palette.surface,
    ...floatingShadow,
  },
  addressRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  addressIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
  },
  addressCopy: { flex: 1, minWidth: 0, gap: 1 },
  addressTitle: { fontSize: 15, lineHeight: 20, fontWeight: "700", color: palette.foreground },
  addressHint: { fontSize: 12, lineHeight: 16, color: palette.mutedForeground },

  presetRow: { flexDirection: "row", gap: 8 },
  presetChip: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: palette.surfaceMuted,
  },
  presetChipActive: { backgroundColor: palette.primary },
  presetText: { fontSize: 13, lineHeight: 17, fontWeight: "500", color: palette.foreground },
  presetTextActive: { fontWeight: "700", color: palette.onPrimary },

  detailsBlock: { gap: 8 },
  detailsLabel: { fontSize: 13, lineHeight: 17, fontWeight: "700", color: palette.foreground },
  inputShell: {
    borderWidth: 1.5,
    borderRadius: 14,
    backgroundColor: palette.surfaceMuted,
  },
  input: {
    minHeight: 52,
    maxHeight: 96,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 14,
    lineHeight: 19,
    color: palette.foreground,
  },
  guideRow: { gap: 6 },
  guideChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#F1DDB8",
    backgroundColor: palette.primarySoft,
  },
  guideText: { fontSize: 12, lineHeight: 15, fontWeight: "700", color: palette.secondary },

  confirmButton: {
    minHeight: 52,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
  },
  confirmDisabled: { opacity: 0.7 },
  confirmText: { fontSize: 15.5, lineHeight: 20, fontWeight: "700", color: palette.onPrimary },
});
