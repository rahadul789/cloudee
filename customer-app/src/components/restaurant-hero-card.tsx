import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { memo, useEffect, useRef } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from "react-native";

import { PressableScale } from "@/src/components/pressable-scale";
import { RemoteImage } from "@/src/components/remote-image";
import { formatPrepTimeRange } from "@/src/lib/date-time";
import { formatCompactCount } from "@/src/lib/format-count";
import { formatCardDeliveryFee } from "@/src/lib/delivery-fee-display";
import { formatDistanceValue } from "@/src/lib/distance";
import { getClosedCopy } from "@/src/lib/restaurant-availability";
import { palette } from "@/src/theme/palette";
import type { RestaurantAvailability } from "@/src/types/restaurant";

// Admin-set marketing badge label for a restaurant card — only when enabled + non-empty.
export function getRestaurantCustomBadge(
  restaurant:
    | { discovery?: { customBadge?: { enabled?: boolean; label?: string } } }
    | null
    | undefined,
): string | undefined {
  const badge = restaurant?.discovery?.customBadge;
  if (badge?.enabled !== true) return undefined;
  const label = badge.label?.trim();
  return label && label.length > 0 ? label : undefined;
}

type Props = {
  name: string;
  subtitle?: string;
  imageUrl?: string | null;
  isOpen?: boolean;
  availability?: RestaurantAvailability | null;
  offerLabel?: string | null;
  distanceKm?: number | null;
  avgRating?: number | null;
  reviewCount?: number;
  preparationTimeMinutes?: number | null;
  /** Kept for caller compatibility; no longer shown (cards show delivery fee instead). */
  lowestMenuPrice?: number | null;
  /** Estimated delivery fee in ৳ (0 = free). Hidden when unknown. */
  deliveryFee?: number | null;
  isFavorite?: boolean;
  favoriteDisabled?: boolean;
  onToggleFavorite?: () => void;
  onPress?: () => void;
  compact?: boolean;
  flat?: boolean;
  variant?: "default" | "featured" | "offer" | "nearby" | "list";
  badge?: "featured" | "nearby" | "none";
  sponsored?: boolean;
  /** Admin-set marketing badge label; shown on the card when non-empty. */
  customBadge?: string | null;
};

// The app's only restaurant card (home rails, All restaurants, Favourites, Search).
function RestaurantHeroCardComponent({
  name,
  subtitle,
  imageUrl,
  isOpen = true,
  availability,
  offerLabel,
  distanceKm,
  avgRating,
  reviewCount,
  preparationTimeMinutes,
  deliveryFee,
  isFavorite = false,
  favoriteDisabled = false,
  onToggleFavorite,
  onPress,
  compact = false,
  flat = false,
  variant = "default",
  badge,
  sponsored = false,
  customBadge,
}: Props) {
  const isRail = compact || variant === "featured" || variant === "offer";
  const customBadgeLabel = customBadge?.trim() ?? "";
  const showFeaturedBadge =
    !customBadgeLabel &&
    badge !== "none" &&
    (badge === "featured" || (badge === undefined && variant === "featured"));
  const hasRating =
    typeof avgRating === "number" &&
    Number.isFinite(avgRating) &&
    (reviewCount ?? 0) > 0;
  const hasPrep =
    typeof preparationTimeMinutes === "number" && preparationTimeMinutes > 0;
  const hasDistance =
    typeof distanceKm === "number" && Number.isFinite(distanceKm);
  const delivery = formatCardDeliveryFee(deliveryFee);
  const offerText = offerLabel?.trim() ?? "";
  const closedCopy = getClosedCopy(availability);

  const handleFavoritePress = (event: GestureResponderEvent) => {
    event.stopPropagation();
    if (favoriteDisabled || !onToggleFavorite) return;
    void Haptics.selectionAsync().catch(() => undefined);
    onToggleFavorite();
  };

  // A satisfying "pop" when the heart becomes a favourite (native-driver only). Tracked
  // via a ref so already-favourited cards don't pop on mount/scroll.
  const heartScale = useRef(new Animated.Value(1)).current;
  const wasFavorite = useRef(isFavorite);
  useEffect(() => {
    if (isFavorite && !wasFavorite.current) {
      heartScale.setValue(1.45);
      Animated.spring(heartScale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 4,
        tension: 140,
      }).start();
    }
    wasFavorite.current = isFavorite;
  }, [isFavorite, heartScale]);

  // ONE layout for every section (classic delivery-app card): a rounded photo, then two
  // quiet lines of text straight on the page — no box, border or shadow. Line 1: name +
  // rating. Line 2: cuisine · time · delivery fee · distance. Closed = dark photo with
  // "Closed / Opens at". Rails (featured/offer) just use a slightly taller photo.
  const cuisine = subtitle?.trim() ?? "";
  // Narrow rail cards: prep time rides on the photo so the cuisine isn't squeezed out.
  const timeOnPhoto = hasPrep && isRail;
  const timeInMeta = hasPrep && !isRail;
  const opensAt =
    (availability?.closedReason === "schedule" ||
      availability?.closedReason === "service_window") &&
    closedCopy.opensAtLabel
      ? closedCopy.opensAtLabel
      : "";

  return (
    <PressableScale scaleTo={0.985} style={styles.proCard} onPress={onPress}>
      <View style={[styles.proPhoto, isRail ? styles.proPhotoRail : null]}>
        <RemoteImage
          uri={imageUrl}
          style={styles.coverImage}
          fallbackIcon="restaurant-outline"
          fallbackIconSize={28}
          fallbackTint={palette.secondary}
          transition={flat ? 80 : 180}
          targetWidth={480}
          accessibilityLabel={`${name} restaurant photo`}
        />

        {!isOpen ? (
          <View style={styles.proClosed} pointerEvents="none">
            <Text style={styles.proClosedTitle}>Closed</Text>
            {opensAt ? <Text style={styles.proClosedSub}>Opens at {opensAt}</Text> : null}
          </View>
        ) : null}

        {offerText ? (
          <View style={[styles.proOffer, isRail ? styles.proOfferRail : null]} pointerEvents="none">
            <Ionicons name="pricetag" size={13} color={palette.onPrimary} />
            <Text numberOfLines={1} style={styles.proOfferText}>
              {offerText}
            </Text>
          </View>
          ) : null}

        {customBadgeLabel || showFeaturedBadge || (sponsored && !offerText) ? (
          <View style={styles.proBadge} pointerEvents="none">
            {showFeaturedBadge ? (
              <Ionicons name="sparkles" size={10} color={palette.primary} />
            ) : null}
            <Text numberOfLines={1} style={styles.proBadgeText}>
              {customBadgeLabel || (showFeaturedBadge ? "Featured" : "Sponsored")}
            </Text>
          </View>
        ) : null}

        {timeOnPhoto ? (
          <View style={styles.proTimeChip} pointerEvents="none">
            <Ionicons name="time-outline" size={12} color={palette.foreground} />
            <Text style={styles.proTimeChipText}>
              {formatPrepTimeRange(preparationTimeMinutes)}
            </Text>
          </View>
        ) : null}

        <Pressable
          style={[styles.favoriteButton, favoriteDisabled ? styles.favoriteButtonDisabled : null]}
          onPress={handleFavoritePress}
          onPressIn={(event) => event.stopPropagation()}
          onPressOut={(event) => event.stopPropagation()}
          accessibilityRole="button"
          accessibilityLabel={
            isFavorite ? `Remove ${name} from favourites` : `Add ${name} to favourites`
          }
          accessibilityState={{ disabled: favoriteDisabled, selected: isFavorite }}
          hitSlop={8}
        >
          <Animated.View style={{ transform: [{ scale: heartScale }] }}>
            <Ionicons
              name={isFavorite ? "heart" : "heart-outline"}
              size={16}
              color={isFavorite ? "#E5484D" : palette.foreground}
            />
          </Animated.View>
        </Pressable>
      </View>

      <View style={styles.proBody}>
        <View style={styles.proTitleRow}>
          <Text
            numberOfLines={1}
            style={[styles.proTitle, !isOpen ? styles.titleClosed : null]}
          >
            {name}
          </Text>
          <View style={styles.proRating}>
            <Ionicons
              name={hasRating ? "star" : "sparkles"}
              size={12}
              color={hasRating ? "#E2A100" : "#2F6FDB"}
            />
            <Text style={styles.proRatingText}>{hasRating ? avgRating?.toFixed(1) : "New"}</Text>
            {hasRating ? (
              <Text style={styles.proRatingCount}>({formatCompactCount(reviewCount)})</Text>
            ) : null}
          </View>
        </View>
        <View style={styles.proMetaRow}>
          {cuisine ? (
            <Text numberOfLines={1} style={[styles.proMeta, styles.proMetaCuisine]}>
              {cuisine}
            </Text>
          ) : null}
          {timeInMeta ? (
            <View style={styles.proFact}>
              {cuisine ? <Text style={styles.proDot}>·</Text> : null}
              <Ionicons name="time-outline" size={13} color={palette.mutedForeground} />
              <Text style={styles.proMeta}>{formatPrepTimeRange(preparationTimeMinutes)}</Text>
            </View>
          ) : null}
          {delivery ? (
            <View style={styles.proFact}>
              {cuisine || timeInMeta ? <Text style={styles.proDot}>·</Text> : null}
              <Ionicons
                name="bicycle"
                size={14}
                color={delivery.isFree ? palette.successText : palette.mutedForeground}
              />
              <Text style={[styles.proMeta, delivery.isFree ? styles.proFree : null]}>
                {delivery.isFree ? "Free" : delivery.label}
              </Text>
            </View>
          ) : null}
          {hasDistance ? (
            <View style={styles.proFact}>
              {cuisine || timeInMeta || delivery ? <Text style={styles.proDot}>·</Text> : null}
              <Text style={styles.proMeta}>{formatDistanceValue(distanceKm)}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </PressableScale>
  );
}

// In the home feed many of these render inside one ScrollView. Memoize on the visible
// data props so a favourite toggle (or any parent re-render) only re-renders the one
// card whose data actually changed — not the whole list. The onPress/onToggleFavorite
// closures are intentionally NOT compared: callers pass inline closures that change
// identity every render, but they close over stable (memoized) restaurant data and read
// volatile state (auth) freshly, so the retained closure stays correct.
function arePropsEqual(prev: Props, next: Props) {
  return (
    prev.name === next.name &&
    prev.subtitle === next.subtitle &&
    prev.imageUrl === next.imageUrl &&
    prev.isOpen === next.isOpen &&
    prev.availability?.opensAtLabel === next.availability?.opensAtLabel &&
    prev.availability?.closedReason === next.availability?.closedReason &&
    prev.offerLabel === next.offerLabel &&
    prev.distanceKm === next.distanceKm &&
    prev.avgRating === next.avgRating &&
    prev.reviewCount === next.reviewCount &&
    prev.preparationTimeMinutes === next.preparationTimeMinutes &&
    prev.deliveryFee === next.deliveryFee &&
    prev.isFavorite === next.isFavorite &&
    prev.favoriteDisabled === next.favoriteDisabled &&
    prev.compact === next.compact &&
    prev.flat === next.flat &&
    prev.variant === next.variant &&
    prev.badge === next.badge &&
    prev.sponsored === next.sponsored &&
    prev.customBadge === next.customBadge
  );
}

export const RestaurantHeroCard = memo(RestaurantHeroCardComponent, arePropsEqual);

const styles = StyleSheet.create({
  // ── "list" card (classic delivery-app layout) ──
  proCard: { gap: 9 },
  proPhoto: {
    // Wide banner: crops only a sliver top/bottom of a 16:9 cover, keeps the card short.
    aspectRatio: 2.3,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: palette.surfaceMuted,
  },
  proPhotoRail: { aspectRatio: 1.9 },
  proClosed: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    backgroundColor: "rgba(17,17,17,0.62)",
  },
  proClosedTitle: { fontSize: 17, lineHeight: 22, fontWeight: "700", color: "#FFFFFF" },
  proClosedSub: { fontSize: 13, lineHeight: 18, fontWeight: "500", color: "rgba(255,255,255,0.85)" },
  proOffer: {
    position: "absolute",
    left: 10,
    bottom: 10,
    maxWidth: "78%",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: palette.primary,
    shadowColor: "#000000",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  proOfferRail: { maxWidth: "56%" },
  proTimeChip: {
    position: "absolute",
    right: 10,
    bottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.95)",
  },
  proTimeChipText: { fontSize: 12, lineHeight: 16, fontWeight: "700", color: palette.foreground },
  proOfferText: { flexShrink: 1, fontSize: 13, lineHeight: 17, fontWeight: "700", color: palette.onPrimary },
  proMetaRow: { flexDirection: "row", alignItems: "center" },
  proMetaCuisine: { flexShrink: 1 },
  proFact: { flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 3 },
  proDot: { marginHorizontal: 6, fontSize: 13, lineHeight: 18, color: palette.mutedForeground },
  proFree: { color: palette.successText, fontWeight: "700" },
  proBadge: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    top: 10,
    left: 10,
    maxWidth: "70%",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "rgba(17,17,17,0.8)",
  },
  proBadgeText: { fontSize: 11.5, lineHeight: 15, fontWeight: "700", color: "#FFFFFF" },
  proBody: { paddingHorizontal: 2, gap: 2 },
  proTitleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  proTitle: { flex: 1, fontSize: 16, lineHeight: 21, fontWeight: "700", color: palette.foreground },
  proRating: { flexDirection: "row", alignItems: "center", gap: 3 },
  proRatingText: { fontSize: 13, lineHeight: 18, fontWeight: "700", color: palette.foreground },
  proRatingCount: { fontSize: 12.5, lineHeight: 18, color: palette.mutedForeground },
  proMeta: { fontSize: 13, lineHeight: 18, color: palette.mutedForeground },

  coverImage: {
    width: "100%",
    height: "100%",
  },
  favoriteButton: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.95)",
  },
  favoriteButtonDisabled: {
    opacity: 0.7,
  },
  titleClosed: {
    color: palette.mutedForeground,
  },
});
