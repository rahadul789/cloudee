import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { palette } from "@/src/theme/palette";

const IMAGE_SKELETON_COLOR = "#FFF0F6";

function useSkeletonTranslateX() {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const shimmerLoop = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1250,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    );

    shimmerAnim.setValue(0);
    shimmerLoop.start();

    return () => {
      shimmerLoop.stop();
    };
  }, [shimmerAnim]);

  return shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-220, 220],
  });
}

export function ShimmerBlock({ style }: { style?: StyleProp<ViewStyle> }) {
  const translateX = useSkeletonTranslateX();

  return (
    <View style={[styles.shimmerBlock, style]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.shimmerHighlight,
          { transform: [{ translateX }, { rotate: "10deg" }] },
        ]}
      />
    </View>
  );
}

type RestaurantSkeletonVariant = "default" | "featured" | "offer" | "nearby";

export function RestaurantCardSkeleton({
  compact = false,
  variant = "default",
}: {
  compact?: boolean;
  variant?: RestaurantSkeletonVariant;
}) {
  const isFeaturedVariant = variant === "featured";
  const isOfferVariant = variant === "offer";
  const isNearbyVariant = variant === "nearby";

  return (
    <View
      style={[
        styles.restaurantCard,
        compact ? styles.restaurantCardCompact : null,
        isFeaturedVariant ? styles.restaurantCardFeatured : null,
        isOfferVariant ? styles.restaurantCardOffer : null,
        isNearbyVariant ? styles.restaurantCardNearby : null,
      ]}
    >
      <View
        style={[
          styles.restaurantImageShell,
          compact ? styles.restaurantImageShellCompact : null,
          isFeaturedVariant ? styles.restaurantImageFeatured : null,
          isOfferVariant ? styles.restaurantImageOffer : null,
          isNearbyVariant ? styles.restaurantImageNearby : null,
          compact && isNearbyVariant
            ? styles.restaurantImageNearbyCompact
            : null,
        ]}
      >
        <ShimmerBlock style={styles.restaurantImage} />
        {isFeaturedVariant || isNearbyVariant || isOfferVariant ? (
          <ShimmerBlock
            style={
              isOfferVariant
                ? styles.restaurantOfferBadge
                : [
                    styles.restaurantImageBadge,
                    isNearbyVariant ? styles.restaurantImageBadgeNearby : null,
                  ]
            }
          />
        ) : null}
      </View>
      <View style={styles.restaurantCopy}>
        <View style={styles.restaurantTopRow}>
          <View style={styles.restaurantTitleBlock}>
            <ShimmerBlock style={styles.restaurantTitle} />
            <ShimmerBlock style={styles.restaurantSubtitle} />
          </View>
          <ShimmerBlock style={styles.restaurantPrice} />
        </View>
        <View style={styles.restaurantMetricRow}>
          <ShimmerBlock style={styles.restaurantMetric} />
          <ShimmerBlock style={styles.restaurantMetric} />
          <ShimmerBlock style={styles.restaurantMetricSmall} />
        </View>
      </View>
    </View>
  );
}

export function RestaurantListSkeleton({
  count = 3,
  compact = false,
  variant = "default",
}: {
  count?: number;
  compact?: boolean;
  variant?: RestaurantSkeletonVariant;
}) {
  return (
    <View style={styles.restaurantList}>
      {Array.from({ length: count }, (_, index) => (
        <RestaurantCardSkeleton
          key={index}
          compact={compact}
          variant={variant}
        />
      ))}
    </View>
  );
}

export function CardListSkeleton({
  count = 3,
  cardHeight = 96,
}: {
  count?: number;
  cardHeight?: number;
}) {
  return (
    <View style={styles.cardList}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={[styles.genericCard, { height: cardHeight }]}>
          <ShimmerBlock style={styles.genericAvatar} />
          <View style={styles.genericCopy}>
            <ShimmerBlock style={styles.genericTitle} />
            <ShimmerBlock style={styles.genericSubtitle} />
            <ShimmerBlock style={styles.genericMeta} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function PromoDetailsSkeleton() {
  return (
    <View style={styles.promoSkeleton}>
      <ShimmerBlock style={styles.promoHero} />
      <View style={styles.promoCopy}>
        <ShimmerBlock style={styles.promoBadge} />
        <ShimmerBlock style={styles.promoTitle} />
        <ShimmerBlock style={styles.promoLine} />
        <ShimmerBlock style={styles.promoLineShort} />
      </View>
    </View>
  );
}

export function MenuCategoryChipsSkeleton() {
  // Mirrors the real category rail (a horizontal ScrollView), so the placeholder
  // chips lay out in a row that bleeds past the right edge instead of wrapping —
  // reading as a scrollable rail. scrollEnabled stays off so a loading placeholder
  // is never draggable.
  return (
    <ScrollView
      horizontal
      scrollEnabled={false}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.menuCategoryRowSkeleton}
    >
      <ShimmerBlock style={styles.menuCategoryWideSkeleton} />
      <ShimmerBlock style={styles.menuCategorySkeleton} />
      <ShimmerBlock style={styles.menuCategorySmallSkeleton} />
      <ShimmerBlock style={styles.menuCategoryTinySkeleton} />
      <ShimmerBlock style={styles.menuCategorySkeleton} />
      <ShimmerBlock style={styles.menuCategorySmallSkeleton} />
    </ScrollView>
  );
}

export function MenuPopularSkeleton() {
  return (
    <View style={styles.menuPopularSkeleton}>
      <View style={styles.menuPopularHeaderSkeleton}>
        <View style={styles.menuPopularTitleRowSkeleton}>
          <ShimmerBlock style={styles.menuPopularIconSkeleton} />
          <ShimmerBlock style={styles.menuPopularTitleSkeleton} />
        </View>
        <ShimmerBlock style={styles.menuPopularDescriptionSkeleton} />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.menuPopularRowSkeleton}
      >
        {Array.from({ length: 3 }, (_, index) => (
          <View key={index} style={styles.popularCardSkeleton}>
            <ShimmerBlock style={styles.popularCardImageSkeleton} />
            <ShimmerBlock style={styles.popularCardBadgeSkeleton} />
            <View style={styles.popularCardCopySkeleton}>
              <ShimmerBlock style={styles.popularCardTitleSkeleton} />
              <ShimmerBlock style={styles.popularCardDescriptionSkeleton} />
              <ShimmerBlock
                style={styles.popularCardDescriptionShortSkeleton}
              />
            </View>
            <View style={styles.popularCardFooterSkeleton}>
              <ShimmerBlock style={styles.popularCardPriceSkeleton} />
              <ShimmerBlock style={styles.popularCardButtonSkeleton} />
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export function MenuContentSkeleton() {
  return (
    <View style={styles.menuContentSkeleton}>
      <MenuCategoryChipsSkeleton />
      <MenuPopularSkeleton />
    </View>
  );
}

export function OrdersTabSkeleton() {
  return (
    <View style={styles.ordersSkeletonList}>
      {Array.from({ length: 3 }, (_, index) => (
        <View key={index} style={styles.orderSkeletonCard}>
          <View style={styles.orderSkeletonTopRow}>
            <View style={styles.orderSkeletonCopy}>
              <ShimmerBlock style={styles.orderSkeletonTitle} />
              <ShimmerBlock style={styles.orderSkeletonMeta} />
            </View>
            <ShimmerBlock style={styles.orderSkeletonStatus} />
          </View>
          <View style={styles.orderSkeletonProgressCard}>
            <View style={styles.orderSkeletonProgressTop}>
              <ShimmerBlock style={styles.orderSkeletonChip} />
              <ShimmerBlock style={styles.orderSkeletonAmount} />
            </View>
            <ShimmerBlock style={styles.orderSkeletonTrack} />
            <ShimmerBlock style={styles.orderSkeletonAddress} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function RestaurantDetailsSkeleton() {
  return (
    <View style={styles.detailsContent}>
      <ShimmerBlock style={styles.detailsHero} />
      <View style={styles.detailsInfoCard}>
        <View style={styles.detailsInfoTop}>
          <ShimmerBlock style={styles.detailsLogo} />
          <View style={styles.detailsTitleStack}>
            <ShimmerBlock style={styles.detailsTitle} />
            <ShimmerBlock style={styles.detailsSubtitle} />
          </View>
        </View>
        <View style={styles.detailsFactGrid}>
          <ShimmerBlock style={styles.detailsFact} />
          <ShimmerBlock style={styles.detailsFact} />
          <ShimmerBlock style={styles.detailsFact} />
          <ShimmerBlock style={styles.detailsFact} />
        </View>
      </View>
      <ScrollView
        horizontal
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categorySkeletonRow}
      >
        <ShimmerBlock style={styles.categoryChipWide} />
        <ShimmerBlock style={styles.categoryChip} />
        <ShimmerBlock style={styles.categoryChipSmall} />
        <ShimmerBlock style={styles.categoryChip} />
        <ShimmerBlock style={styles.categoryChipSmall} />
      </ScrollView>
      <View style={styles.menuSkeletonList}>
        <ShimmerBlock style={styles.menuSectionTitle} />
        <ShimmerBlock style={styles.menuItem} />
        <ShimmerBlock style={styles.menuItem} />
        <ShimmerBlock style={styles.menuItem} />
      </View>
    </View>
  );
}

export function ReviewsSkeleton() {
  return (
    <View style={styles.reviewsContent}>
      <View style={styles.reviewsHeader}>
        <ShimmerBlock style={styles.reviewBackButton} />
        <View style={styles.reviewsHeaderCopy}>
          <ShimmerBlock style={styles.reviewsKicker} />
          <ShimmerBlock style={styles.reviewsTitle} />
          <ShimmerBlock style={styles.reviewsSubtitle} />
        </View>
      </View>
      <View style={styles.reviewFactGrid}>
        <ShimmerBlock style={styles.reviewFact} />
        <ShimmerBlock style={styles.reviewFact} />
      </View>
      <View style={styles.reviewList}>
        <ShimmerBlock style={styles.reviewCard} />
        <ShimmerBlock style={styles.reviewCard} />
        <ShimmerBlock style={styles.reviewCardShort} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shimmerBlock: {
    overflow: "hidden",
    backgroundColor: IMAGE_SKELETON_COLOR,
  },
  shimmerHighlight: {
    position: "absolute",
    top: -20,
    bottom: -20,
    width: 90,
    backgroundColor: "rgba(255,255,255,0.46)",
  },
  restaurantList: {
    gap: 14,
  },
  cardList: {
    gap: 12,
  },
  genericCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 22,
    padding: 14,
    backgroundColor: palette.surface,
    shadowColor: palette.shadow,
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  genericAvatar: {
    width: 54,
    height: 54,
    borderRadius: 18,
  },
  genericCopy: {
    flex: 1,
    gap: 8,
  },
  genericTitle: {
    width: "70%",
    height: 16,
    borderRadius: 8,
  },
  genericSubtitle: {
    width: "88%",
    height: 12,
    borderRadius: 6,
  },
  genericMeta: {
    width: "42%",
    height: 12,
    borderRadius: 6,
  },
  promoSkeleton: {
    gap: 14,
  },
  promoHero: {
    height: 240,
    borderRadius: 30,
  },
  promoCopy: {
    padding: 16,
    borderRadius: 24,
    backgroundColor: palette.surface,
    gap: 10,
  },
  promoBadge: {
    width: 116,
    height: 26,
    borderRadius: 13,
  },
  promoTitle: {
    width: "82%",
    height: 26,
    borderRadius: 13,
  },
  promoLine: {
    width: "100%",
    height: 14,
    borderRadius: 7,
  },
  promoLineShort: {
    width: "58%",
    height: 14,
    borderRadius: 7,
  },
  menuContentSkeleton: {
    paddingBottom: 26,
    gap: 6,
  },
  menuCategoryRowSkeleton: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingRight: 32,
    gap: 8,
  },
  menuCategoryWideSkeleton: {
    width: 94,
    height: 30,
    borderRadius: 12,
  },
  menuCategorySkeleton: {
    width: 76,
    height: 30,
    borderRadius: 12,
  },
  menuCategorySmallSkeleton: {
    width: 62,
    height: 30,
    borderRadius: 12,
  },
  menuCategoryTinySkeleton: {
    width: 48,
    height: 30,
    borderRadius: 12,
  },
  menuPopularSkeleton: {
    gap: 6,
  },
  menuPopularHeaderSkeleton: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 7,
  },
  menuPopularTitleRowSkeleton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  menuPopularIconSkeleton: {
    width: 15,
    height: 15,
    borderRadius: 8,
  },
  menuPopularTitleSkeleton: {
    width: 86,
    height: 20,
    borderRadius: 10,
  },
  menuPopularDescriptionSkeleton: {
    width: 142,
    height: 13,
    borderRadius: 7,
  },
  menuPopularRowSkeleton: {
    paddingHorizontal: 20,
    paddingRight: 28,
    gap: 14,
  },
  popularCardSkeleton: {
    width: 184,
    padding: 12,
    borderRadius: 24,
    backgroundColor: palette.surface,
    gap: 10,
    shadowColor: palette.shadow,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  popularCardImageSkeleton: {
    width: "100%",
    height: 110,
    borderRadius: 18,
  },
  popularCardBadgeSkeleton: {
    width: 72,
    height: 26,
    borderRadius: 999,
  },
  popularCardCopySkeleton: {
    gap: 7,
  },
  popularCardTitleSkeleton: {
    width: "76%",
    height: 15,
    borderRadius: 8,
  },
  popularCardDescriptionSkeleton: {
    width: "100%",
    height: 11,
    borderRadius: 6,
  },
  popularCardDescriptionShortSkeleton: {
    width: "68%",
    height: 11,
    borderRadius: 6,
  },
  popularCardFooterSkeleton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  popularCardPriceSkeleton: {
    width: 82,
    height: 17,
    borderRadius: 9,
  },
  popularCardButtonSkeleton: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  ordersSkeletonList: {
    gap: 10,
  },
  orderSkeletonCard: {
    minHeight: 154,
    padding: 14,
    borderRadius: 22,
    backgroundColor: palette.surface,
    gap: 10,
    shadowColor: palette.shadow,
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  orderSkeletonTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  orderSkeletonCopy: {
    flex: 1,
    gap: 7,
  },
  orderSkeletonTitle: {
    width: "58%",
    height: 16,
    borderRadius: 8,
  },
  orderSkeletonMeta: {
    width: "42%",
    height: 11,
    borderRadius: 6,
  },
  orderSkeletonStatus: {
    width: 92,
    height: 28,
    borderRadius: 14,
  },
  orderSkeletonProgressCard: {
    borderRadius: 16,
    backgroundColor: "#FFFDFE",
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 9,
    borderWidth: 1,
    borderColor: "#F7D7E3",
  },
  orderSkeletonProgressTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  orderSkeletonChip: {
    width: "52%",
    height: 24,
    borderRadius: 12,
  },
  orderSkeletonAmount: {
    width: 64,
    height: 24,
    borderRadius: 12,
  },
  orderSkeletonTrack: {
    width: "100%",
    height: 8,
    borderRadius: 999,
  },
  orderSkeletonAddress: {
    width: "82%",
    height: 14,
    borderRadius: 7,
  },
  restaurantCard: {
    overflow: "hidden",
    borderRadius: 24,
    backgroundColor: palette.surface,
    shadowColor: palette.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  restaurantCardFeatured: {},
  restaurantCardOffer: {},
  restaurantCardNearby: {},
  restaurantCardCompact: {},
  restaurantImageShell: {
    position: "relative",
    height: 132,
    overflow: "hidden",
    backgroundColor: "#FFF0F6",
  },
  restaurantImageShellCompact: {},
  restaurantImage: {
    ...StyleSheet.absoluteFillObject,
  },
  restaurantImageFeatured: {},
  restaurantImageOffer: {},
  restaurantImageNearby: {},
  restaurantImageNearbyCompact: {},
  restaurantImageBadge: {
    position: "absolute",
    left: 8,
    bottom: 8,
    width: 82,
    height: 24,
    borderRadius: 999,
    backgroundColor: "#FFF7D9",
  },
  restaurantImageBadgeNearby: {
    width: 76,
    backgroundColor: "#EDF4FF",
  },
  restaurantOfferBadge: {
    position: "absolute",
    right: 8,
    bottom: 8,
    width: 92,
    height: 24,
    borderRadius: 8,
    backgroundColor: "#FFF0F6",
  },
  restaurantCopy: {
    paddingHorizontal: 13,
    paddingTop: 10,
    paddingBottom: 11,
    gap: 10,
  },
  restaurantTopRow: {
    flexDirection: "row",
    gap: 10,
  },
  restaurantTitleBlock: {
    flex: 1,
    gap: 8,
  },
  restaurantTitle: {
    width: "72%",
    height: 17,
    borderRadius: 8,
  },
  restaurantSubtitle: {
    width: "54%",
    height: 12,
    borderRadius: 6,
  },
  restaurantPrice: {
    width: 62,
    height: 30,
    borderRadius: 12,
  },
  restaurantMetricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  restaurantMetric: {
    width: 76,
    height: 16,
    borderRadius: 8,
  },
  restaurantMetricSmall: {
    width: 54,
    height: 16,
    borderRadius: 8,
  },
  detailsContent: {
    paddingBottom: 44,
    gap: 14,
  },
  detailsHero: {
    height: 188,
    marginHorizontal: 20,
    marginTop: 8,
    borderRadius: 30,
  },
  detailsInfoCard: {
    marginHorizontal: 20,
    marginTop: -18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 28,
    backgroundColor: palette.surface,
    gap: 12,
    shadowColor: palette.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  detailsInfoTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  detailsLogo: {
    width: 52,
    height: 52,
    borderRadius: 16,
  },
  detailsTitleStack: {
    flex: 1,
    gap: 8,
  },
  detailsTitle: {
    width: "70%",
    height: 20,
    borderRadius: 10,
  },
  detailsSubtitle: {
    width: "52%",
    height: 12,
    borderRadius: 6,
  },
  detailsFactGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  detailsFact: {
    minWidth: "47%",
    flex: 1,
    height: 56,
    borderRadius: 18,
  },
  categorySkeletonRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 10,
  },
  categoryChipWide: {
    width: 100,
    height: 32,
    borderRadius: 14,
  },
  categoryChip: {
    width: 82,
    height: 32,
    borderRadius: 14,
  },
  categoryChipSmall: {
    width: 64,
    height: 32,
    borderRadius: 14,
  },
  menuSkeletonList: {
    paddingHorizontal: 20,
    gap: 12,
  },
  menuSectionTitle: {
    width: 130,
    height: 22,
    borderRadius: 11,
  },
  menuItem: {
    height: 118,
    borderRadius: 22,
  },
  reviewsContent: {
    paddingBottom: 36,
    gap: 16,
  },
  reviewsHeader: {
    paddingHorizontal: 18,
    paddingTop: 8,
    flexDirection: "row",
    gap: 12,
  },
  reviewBackButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  reviewsHeaderCopy: {
    flex: 1,
    gap: 8,
  },
  reviewsKicker: {
    width: 72,
    height: 12,
    borderRadius: 6,
  },
  reviewsTitle: {
    width: "72%",
    height: 28,
    borderRadius: 14,
  },
  reviewsSubtitle: {
    width: "88%",
    height: 14,
    borderRadius: 7,
  },
  reviewFactGrid: {
    paddingHorizontal: 18,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  reviewFact: {
    minWidth: "47%",
    flex: 1,
    height: 56,
    borderRadius: 18,
  },
  reviewList: {
    paddingHorizontal: 18,
    gap: 12,
  },
  reviewCard: {
    height: 124,
    borderRadius: 24,
  },
  reviewCardShort: {
    height: 96,
    borderRadius: 24,
  },
});
