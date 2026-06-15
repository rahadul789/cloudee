import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from "react-native";

import { RemoteImage } from "@/src/components/remote-image";
import { formatDurationMinutes } from "@/src/lib/date-time";
import { formatDistanceValue } from "@/src/lib/distance";
import { palette } from "@/src/theme/palette";

type Props = {
  name: string;
  subtitle?: string;
  imageUrl?: string | null;
  isOpen?: boolean;
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
  variant?: "default" | "featured" | "offer" | "nearby";
  badge?: "featured" | "nearby" | "none";
};

export function RestaurantHeroCard({
  name,
  subtitle,
  imageUrl,
  isOpen = true,
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
  variant = "default",
  badge,
}: Props) {
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
  const sectionBadge =
    badgeType === "featured"
      ? {
          icon: "sparkles" as const,
          label: "Featured pick",
          style: styles.sectionBadgeFeatured,
          textStyle: styles.sectionBadgeTextFeatured,
          iconColor: "#7A3E00",
        }
      : badgeType === "nearby"
        ? {
            icon: "navigate" as const,
            label: "Near you",
            style: styles.sectionBadgeNearby,
            textStyle: styles.sectionBadgeTextNearby,
            iconColor: "#3858A8",
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

  return (
    <Pressable
      style={[
        styles.card,
        compact ? styles.cardCompact : null,
        isFeaturedVariant ? styles.cardFeatured : null,
        isOfferVariant ? styles.cardOffer : null,
        isNearbyVariant ? styles.cardNearby : null,
        !isOpen ? styles.closedCard : null,
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
            <View style={styles.closedOverlayBadge}>
              <Ionicons name="time-outline" size={15} color={palette.surface} />
              <Text style={styles.closedOverlayText}>Temporarily unavailable</Text>
            </View>
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
            accessibilityState={{ disabled: favoriteDisabled, selected: isFavorite }}
            hitSlop={8}
          >
            <Ionicons
              name={isFavorite ? "heart" : "heart-outline"}
              size={15}
              color={isFavorite ? "#fff" : palette.foreground}
            />
          </Pressable>
        </View>

        {sectionBadge ? (
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
        {!isOpen ? <View style={styles.closedContentVeil} /> : null}
      </View>
    </Pressable>
  );
}

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
  cardCompact: {
    borderRadius: 22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
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
    backgroundColor: "rgba(20, 24, 35, 0.68)",
  },
  closedOverlayContent: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  closedOverlayBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(20, 24, 35, 0.72)",
  },
  closedOverlayText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    letterSpacing: 0.2,
    color: palette.surface,
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
    elevation: 4,
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
  offerBadge: {
    position: "absolute",
    right: 8,
    bottom: 8,
    maxWidth: "62%",
    zIndex: 4,
    elevation: 4,
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
    color: "#6D5747",
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
    color: "#8E7B6C",
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
  closedContentVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 249, 245, 0.38)",
  },
});
