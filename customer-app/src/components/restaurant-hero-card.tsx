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

import { RemoteImage } from "@/src/components/remote-image";
import { formatDurationMinutes } from "@/src/lib/date-time";
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
  lowestMenuPrice?: number | null;
  isFavorite?: boolean;
  favoriteDisabled?: boolean;
  onToggleFavorite?: () => void;
  onPress?: () => void;
  compact?: boolean;
  flat?: boolean;
  variant?: "default" | "featured" | "offer" | "nearby";
  badge?: "featured" | "nearby" | "none";
  sponsored?: boolean;
  /** Admin-set marketing badge label; shown on the card when non-empty. */
  customBadge?: string | null;
};

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
  lowestMenuPrice,
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
  const customBadgeLabel = customBadge?.trim() ?? "";
  const hasCustomBadge = customBadgeLabel.length > 0;
  const isFeaturedVariant = variant === "featured";
  const isOfferVariant = variant === "offer";
  const isNearbyVariant = variant === "nearby";
  const badgeType =
    badge === "none"
      ? null
      : badge ?? (isFeaturedVariant ? "featured" : isNearbyVariant ? "nearby" : null);
  const hasRating =
    typeof avgRating === "number" &&
    Number.isFinite(avgRating) &&
    (reviewCount ?? 0) > 0;
  const hasPreparationTime =
    typeof preparationTimeMinutes === "number" && preparationTimeMinutes > 0;
  const hasDistance =
    typeof distanceKm === "number" && Number.isFinite(distanceKm);
  const distanceLabel = formatDistanceValue(distanceKm);
  const hasOffer = Boolean(offerLabel?.trim());
  const hasLowestPrice =
    typeof lowestMenuPrice === "number" && Number.isFinite(lowestMenuPrice);
  // Closed overlay copy: "Opens 11:00 AM" when the reopen time is known, else the
  // generic "Temporarily unavailable". Cards show the static label (no live timer).
  const closedCopy = getClosedCopy(availability);
  const sectionBadge =
    badgeType === "featured"
      ? {
          icon: "sparkles" as const,
          label: "Featured pick",
          style: styles.sectionBadgeFeatured,
          textStyle: styles.sectionBadgeTextFeatured,
          iconColor: "#7A3E00",
        }
      : null;

  const handleFavoritePress = (event: GestureResponderEvent) => {
    event.stopPropagation();

    if (favoriteDisabled || !onToggleFavorite) {
      return;
    }

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

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        compact ? styles.cardCompact : null,
        isFeaturedVariant ? styles.cardFeatured : null,
        isOfferVariant ? styles.cardOffer : null,
        isNearbyVariant ? styles.cardNearby : null,
        flat ? styles.cardFlat : null,
        !isOpen ? styles.closedCard : null,
        pressed ? styles.cardPressed : null,
      ]}
      onPress={onPress}
    >
      <View
        style={[
          styles.imageWrap,
          compact ? styles.imageWrapCompact : null,
          isFeaturedVariant ? styles.imageWrapFeatured : null,
          compact && isFeaturedVariant ? styles.imageWrapFeaturedCompact : null,
          isOfferVariant ? styles.imageWrapOffer : null,
          isNearbyVariant ? styles.imageWrapNearby : null,
          compact && isNearbyVariant ? styles.imageWrapNearbyCompact : null,
        ]}
      >
        <RemoteImage
          uri={imageUrl}
          style={styles.coverImage}
          fallbackIcon="restaurant-outline"
          fallbackIconSize={28}
          fallbackTint={palette.primary}
          transition={flat ? 80 : 180}
          // Full-width card cover — resize to a phone-safe logical width so the list
          // decodes small bitmaps (no full-res images = no scroll jank / RAM spikes).
          targetWidth={420}
          accessibilityLabel={`${name} restaurant photo`}
        />

        <View
          style={[
            styles.imageOverlay,
            isFeaturedVariant ? styles.imageOverlayFeatured : null,
            isOfferVariant ? styles.imageOverlayOffer : null,
            isNearbyVariant ? styles.imageOverlayNearby : null,
            !isOpen ? styles.closedImageOverlay : null,
          ]}
        />

        {!isOpen ? (
          <View style={styles.closedOverlayContent}>
            {/* Centered "Closed" chip. For a restaurant closed on its OWN hours we show the
                reopen time right under it (on the cover), so the customer sees when THIS
                place opens without cluttering the card body. Platform/zone-wide closures
                skip the time here — the top "closed" banner already shows it. */}
            <View style={styles.closedTag}>
              <Ionicons
                name="lock-closed"
                size={13}
                color={palette.foreground}
              />
              <Text style={styles.closedTagText}>Closed</Text>
            </View>
            {availability?.closedReason === "schedule" &&
            closedCopy.opensAtLabel ? (
              <Text style={styles.closedOpensText}>
                Opens at {closedCopy.opensAtLabel}
              </Text>
            ) : null}
          </View>
        ) : null}

        {sponsored ? (
          <View style={styles.sponsoredBadge}>
            <Ionicons name="megaphone" size={9} color="#F4F6FB" />
            <Text style={styles.sponsoredBadgeText}>Sponsored</Text>
          </View>
        ) : null}

        <View style={[styles.topRow, compact ? styles.topRowCompact : null]}>
          <Pressable
            style={[
              styles.favoriteButton,
              isFavorite ? styles.favoriteButtonActive : null,
              favoriteDisabled ? styles.favoriteButtonDisabled : null,
            ]}
            onPress={handleFavoritePress}
            onPressIn={(event) => event.stopPropagation()}
            onPressOut={(event) => event.stopPropagation()}
            accessibilityRole="button"
            accessibilityLabel={
              isFavorite
                ? `Remove ${name} from favourites`
                : `Add ${name} to favourites`
            }
            accessibilityState={{ disabled: favoriteDisabled, selected: isFavorite }}
            hitSlop={8}
          >
            <Animated.View style={{ transform: [{ scale: heartScale }] }}>
              <Ionicons
                name={isFavorite ? "heart" : "heart-outline"}
                size={15}
                color={isFavorite ? "#fff" : palette.foreground}
              />
            </Animated.View>
          </Pressable>
        </View>

        {hasCustomBadge ? (
          <View style={[styles.sectionBadge, styles.customBadge]}>
            <Text
              numberOfLines={1}
              style={[styles.sectionBadgeText, styles.customBadgeText]}
            >
              {customBadgeLabel}
            </Text>
          </View>
        ) : sectionBadge ? (
          <View style={[styles.sectionBadge, sectionBadge.style]}>
            <Ionicons
              name={sectionBadge.icon}
              size={10}
              color={sectionBadge.iconColor}
            />
            <Text numberOfLines={1} style={[styles.sectionBadgeText, sectionBadge.textStyle]}>
              {sectionBadge.label}
            </Text>
          </View>
        ) : null}

        {hasOffer ? (
          <View style={styles.offerBadge}>
            <Ionicons name="pricetag" size={10} color="#fff" />
            <Text numberOfLines={1} style={styles.offerBadgeText}>
              {offerLabel}
            </Text>
          </View>
        ) : null}
      </View>

      <View
        style={[
          styles.content,
          compact ? styles.contentCompact : null,
          isFeaturedVariant ? styles.contentFeatured : null,
          isNearbyVariant ? styles.contentNearby : null,
        ]}
      >
        <View style={styles.titleRow}>
          <View style={styles.titleBlock}>
            <Text
              numberOfLines={1}
              style={[
                styles.title,
                compact ? styles.titleCompact : null,
                isFeaturedVariant ? styles.titleFeatured : null,
                isNearbyVariant ? styles.titleNearby : null,
                !isOpen ? styles.titleClosed : null,
              ]}
            >
              {name}
            </Text>
            {subtitle ? (
              <Text
                numberOfLines={2}
                style={[
                  styles.description,
                  compact ? styles.descriptionCompact : null,
                  isFeaturedVariant ? styles.descriptionFeatured : null,
                  !isOpen ? styles.descriptionClosed : null,
                ]}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>

          <View
            style={[
              styles.priceBlock,
              isFeaturedVariant ? styles.priceBlockFeatured : null,
            ]}
          >
            <Text
              style={[
                styles.priceLabel,
                isFeaturedVariant ? styles.priceLabelFeatured : null,
              ]}
            >
              Starts from
            </Text>
            <Text
              style={[
                styles.priceValue,
                isFeaturedVariant ? styles.priceValueFeatured : null,
              ]}
            >
              {hasLowestPrice ? `Tk ${lowestMenuPrice?.toFixed(0)}` : "View menu"}
            </Text>
          </View>
        </View>

        <View style={[styles.metricsRow, compact ? styles.metricsRowCompact : null]}>
          {hasRating ? (
            <Metric icon="star" value={`${avgRating} (${reviewCount})`} compact={compact} />
          ) : null}
          {hasPreparationTime ? (
            <Metric
              icon="time-outline"
              value={formatDurationMinutes(preparationTimeMinutes)}
              compact={compact}
            />
          ) : null}
          {hasDistance ? <Metric icon="navigate-outline" value={distanceLabel} compact={compact} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

// In the home feed ~40 of these render inside one ScrollView. Memoize on the visible
// data props so a favourite toggle (or any parent re-render) only re-renders the one
// card whose data actually changed — not the whole list. The onPress/onToggleFavorite
// closures are intentionally NOT compared: the home screen passes inline closures that
// change identity every render, but they close over stable (memoized) restaurant data
// and read volatile state (auth) freshly, so the retained closure stays correct.
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
    prev.lowestMenuPrice === next.lowestMenuPrice &&
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

export const RestaurantHeroCard = memo(
  RestaurantHeroCardComponent,
  arePropsEqual,
);

function Metric({
  icon,
  value,
  compact = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  compact?: boolean;
}) {
  return (
    <View style={styles.metric}>
      <Ionicons name={icon} size={14} color={palette.mutedForeground} />
      <Text style={[styles.metricText, compact ? styles.metricTextCompact : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: "hidden",
    borderRadius: 24,
    backgroundColor: palette.surface,
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 7,
  },
  // Subtle press feedback (the professional "tap" feel), identical to the menu-item
  // card in the restaurant-details screen so every tappable card in the app feels the
  // same. Only applied while the finger is down, so it never affects scroll
  // performance or the memoized children.
  cardPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.99 }],
  },
  cardCompact: {
    borderRadius: 22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  cardFlat: {
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
    borderWidth: 1,
    borderColor: "#F1E2EA",
  },
  cardFeatured: {
    backgroundColor: "#FFFDF5",
    shadowColor: "rgba(159, 92, 0, 0.22)",
    shadowOpacity: 1,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 16 },
    elevation: 8,
  },
  cardOffer: {
  },
  cardNearby: {
  },
  closedCard: {
    backgroundColor: "#FFF9F5",
  },
  imageWrap: {
    position: "relative",
    height: 148,
    backgroundColor: "#FFF0F6",
  },
  imageWrapCompact: {
    height: 132,
  },
  imageWrapFeatured: {
    height: 164,
    backgroundColor: "#FFF0CF",
  },
  imageWrapFeaturedCompact: {
    height: 142,
  },
  imageWrapOffer: {
  },
  imageWrapNearby: {
  },
  imageWrapNearbyCompact: {
  },
  coverImage: {
    width: "100%",
    height: "100%",
  },
  coverFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF0F6",
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(31, 36, 48, 0.18)",
  },
  imageOverlayFeatured: {
    backgroundColor: "rgba(34, 24, 10, 0.10)",
  },
  imageOverlayOffer: {
    backgroundColor: "rgba(62, 28, 44, 0.14)",
  },
  imageOverlayNearby: {
    backgroundColor: "rgba(31, 36, 48, 0.10)",
  },
  closedImageOverlay: {
    backgroundColor: "rgba(20, 24, 35, 0.52)",
  },
  closedOverlayContent: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 18,
  },
  // Centered "Closed" chip on the dimmed cover — white pill + dark text, same family as the
  // time-based rail's closed badge but a touch larger so it reads clearly on the cover.
  closedTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.96)",
  },
  closedTagText: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "800",
    letterSpacing: 0.3,
    color: palette.foreground,
  },
  // Reopen time shown under the "Closed" chip (restaurant's own hours only). White on the
  // dimmed cover, with a soft shadow so it stays legible over any photo.
  closedOpensText: {
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "700",
    letterSpacing: 0.2,
    color: "#FFFFFF",
    textShadowColor: "rgba(0, 0, 0, 0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  topRow: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  topRowCompact: {
    top: 9,
    left: 9,
    right: 9,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  statusPillCompact: {
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: palette.mint,
  },
  statusPillClosed: {
    backgroundColor: palette.warningText,
  },
  statusDotClosed: {
    backgroundColor: palette.surface,
  },
  statusText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    color: palette.foreground,
  },
  statusTextCompact: {
    fontSize: 10,
    lineHeight: 14,
  },
  statusTextClosed: {
    color: palette.surface,
  },
  favoriteButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.94)",
  },
  favoriteButtonActive: {
    backgroundColor: palette.secondary,
  },
  favoriteButtonDisabled: {
    opacity: 0.76,
  },
  sectionBadge: {
    position: "absolute",
    left: 8,
    bottom: 8,
    maxWidth: "44%",
    zIndex: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.74)",
  },
  sectionBadgeFeatured: {
    backgroundColor: "rgba(255, 242, 203, 0.98)",
    borderColor: "rgba(255,255,255,0.86)",
  },
  sectionBadgeNearby: {
    backgroundColor: "rgba(235, 242, 255, 0.96)",
  },
  sectionBadgeText: {
    flexShrink: 1,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "900",
  },
  sectionBadgeTextFeatured: {
    color: "#7A3E00",
  },
  sectionBadgeTextNearby: {
    color: "#3858A8",
  },
  // Admin-set marketing badge — a solid coral pill so it reads as a highlight, distinct
  // from the gold "Featured pick" and the pink offer badge.
  customBadge: {
    maxWidth: "62%",
    backgroundColor: palette.primary,
    borderColor: "rgba(255,255,255,0.72)",
  },
  customBadgeText: {
    color: "#fff",
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: "900",
  },
  offerBadge: {
    position: "absolute",
    right: 8,
    bottom: 8,
    maxWidth: "62%",
    zIndex: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(255, 99, 146, 0.96)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.72)",
  },
  offerBadgeText: {
    flexShrink: 1,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "800",
    color: "#fff",
  },
  // Neutral "Sponsored" disclosure pill, top-left of the cover. Deliberately
  // understated (translucent dark, no bright colour) — it's an ad label, not a promo.
  sponsoredBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    zIndex: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(20, 24, 35, 0.58)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  sponsoredBadgeText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
    color: "#F4F6FB",
  },
  content: {
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 12,
    gap: 8,
  },
  contentCompact: {
    paddingHorizontal: 13,
    paddingTop: 10,
    paddingBottom: 11,
    gap: 7,
  },
  contentFeatured: {
    backgroundColor: "#FFFDF5",
  },
  contentNearby: {
  },
  titleRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  titleBlock: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "800",
    color: palette.foreground,
  },
  titleCompact: {
    fontSize: 16,
    lineHeight: 21,
  },
  titleNearby: {
    fontSize: 16,
    lineHeight: 21,
  },
  titleFeatured: {
    color: "#20140A",
    fontWeight: "900",
  },
  titleClosed: {
    color: palette.mutedForeground,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    color: palette.mutedForeground,
  },
  descriptionCompact: {
    fontSize: 12,
    lineHeight: 16,
  },
  descriptionFeatured: {
    color: "#7D6752",
    fontWeight: "600",
  },
  descriptionClosed: {
    color: palette.mutedForeground,
  },
  priceBlock: {
    minWidth: 86,
    alignItems: "flex-end",
    gap: 2,
  },
  priceBlockFeatured: {
    minWidth: 92,
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 7,
    backgroundColor: "#FFF2CE",
  },
  priceLabel: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  priceLabelFeatured: {
    color: "#8C5A14",
  },
  priceValue: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    color: palette.foreground,
    textAlign: "right",
  },
  priceValueFeatured: {
    color: "#251407",
    fontWeight: "900",
  },
  metricsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metricsRowCompact: {
    gap: 7,
  },
  metric: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metricText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  metricTextCompact: {
    fontSize: 11,
    lineHeight: 15,
  },
});
