import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

import { PressableScale } from "@/src/components/pressable-scale";
import { RemoteImage } from "@/src/components/remote-image";
import { hexLuminance } from "@/src/lib/hero-overlay";
import type { CustomerHomeCms } from "@/src/types/restaurant";
import { palette } from "@/src/theme/palette";

type PromoModal = CustomerHomeCms["modal"];

const ASPECT: Record<NonNullable<PromoModal["imageAspect"]>, number> = {
  "4:5": 5 / 4,
  "1:1": 1,
  "16:9": 9 / 16,
};

// Floating promo card (app-open campaign). Image full-bleed on top in the admin's shape,
// optional badge, frosted close button, then title/subtitle and a full-width CTA plus a
// quiet "Maybe later". Enters with a soft native-driver spring.
export function HomePromoModal({
  modal,
  width,
  canCta,
  onClose,
  onCta,
}: {
  modal: PromoModal;
  width: number;
  canCta: boolean;
  onClose: () => void;
  onCta: () => void;
}) {
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(enter, { toValue: 1, damping: 16, stiffness: 180, mass: 0.9, useNativeDriver: true }).start();
  }, [enter]);

  const cardWidth = Math.min(width - 40, 380);
  const title = modal.title?.trim() ?? "";
  const subtitle = modal.subtitle?.trim() ?? "";
  const imageOnly = Boolean(modal.imageUrl) && !title && !subtitle;
  const imageHeight = Math.round(cardWidth * (ASPECT[modal.imageAspect ?? "4:5"] ?? 1.25));
  const accent = modal.accentColor || palette.primary;
  // Readable CTA text on any admin colour (amber → dark text, never white on amber).
  const ctaText = hexLuminance(accent) > 0.45 ? palette.onPrimary : "#FFFFFF";
  const textColor = modal.textColor || palette.foreground;
  const dismissLabel = modal.dismissLabel === undefined ? "Maybe later" : modal.dismissLabel.trim();

  return (
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      <Animated.View
        style={[
          styles.card,
          {
            width: cardWidth,
            backgroundColor: modal.backgroundColor || palette.surface,
            opacity: enter,
            transform: [
              { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
              { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
            ],
          },
        ]}
      >
        {modal.imageUrl ? (
          <Pressable disabled={!canCta || !imageOnly} onPress={onCta}>
            <RemoteImage
              uri={modal.imageUrl}
              style={{ width: cardWidth, height: imageHeight }}
              fallbackIcon="image-outline"
              targetWidth={cardWidth}
              accessibilityLabel={title || "Foodbela announcement"}
            />
            {modal.badgeLabel?.trim() ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText} numberOfLines={1}>
                  {modal.badgeLabel.trim()}
                </Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}

        <Pressable
          style={[styles.close, !modal.imageUrl ? styles.closeOnSurface : null]}
          onPress={onClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={18} color={modal.imageUrl ? "#FFFFFF" : palette.foreground} />
        </Pressable>

        {!imageOnly || canCta ? (
          <View style={styles.body}>
            {title ? <Text style={[styles.title, { color: textColor }]}>{title}</Text> : null}
            {subtitle ? (
              <Text style={[styles.subtitle, { color: modal.textColor || palette.mutedForeground }]}>{subtitle}</Text>
            ) : null}
            {canCta ? (
              <PressableScale
                scaleTo={0.97}
                containerStyle={styles.ctaSlot}
                style={[styles.cta, { backgroundColor: accent }]}
                onPress={onCta}
                accessibilityRole="button"
              >
                <Text style={[styles.ctaText, { color: ctaText }]}>{modal.ctaLabel || "Explore now"}</Text>
                <Ionicons name="arrow-forward" size={17} color={ctaText} />
              </PressableScale>
            ) : null}
            {dismissLabel ? (
              <Pressable onPress={onClose} hitSlop={8} style={styles.dismiss} accessibilityRole="button">
                <Text style={styles.dismissText}>{dismissLabel}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: "rgba(10,10,12,0.62)",
  },
  card: {
    overflow: "hidden",
    borderRadius: 28,
    // Floating element → the one place a soft shadow is allowed.
    shadowColor: "#000000",
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 14,
  },
  badge: {
    position: "absolute",
    top: 14,
    left: 14,
    maxWidth: "70%",
    height: 26,
    paddingHorizontal: 11,
    borderRadius: 13,
    justifyContent: "center",
    backgroundColor: "#111111",
  },
  badgeText: { fontSize: 12, fontWeight: "700", letterSpacing: 0.3, color: palette.primary },
  close: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17,17,17,0.45)",
  },
  closeOnSurface: { backgroundColor: palette.surfaceMuted },
  body: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14, gap: 6 },
  title: { fontSize: 21, lineHeight: 27, fontWeight: "700" },
  subtitle: { fontSize: 14.5, lineHeight: 21, fontWeight: "400" },
  ctaSlot: { marginTop: 12 },
  cta: {
    height: 52,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  ctaText: { fontSize: 16, fontWeight: "700" },
  dismiss: { alignSelf: "center", paddingVertical: 8, paddingHorizontal: 16 },
  dismissText: { fontSize: 14, fontWeight: "500", color: palette.mutedForeground },
});
