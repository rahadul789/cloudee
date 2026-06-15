import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import { RemoteImage } from "@/src/components/remote-image";
import { apiPost } from "@/src/lib/api";
import { resolveCustomerRoute } from "@/src/lib/customer-routes";
import type {
  CustomerCampaignPlacement,
  CustomerHomeCms,
} from "@/src/types/restaurant";

function isTrustedGuideVideoUrl(value?: string | null) {
  const url = value?.trim();
  if (!url) return false;

  const match = url.match(/^https:\/\/([^/?#\s]+)(?:[/?#]|$)/i);
  const host = match?.[1]?.toLowerCase();
  if (!host) return false;

  return (
    host === "youtu.be" ||
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "youtube-nocookie.com" ||
    host.endsWith(".youtube-nocookie.com")
  );
}

export function recordCampaignEvent(
  voucherId: string | undefined,
  eventType: "impression" | "click" | "modal_open" | "strip_click",
) {
  if (!voucherId) return;
  void apiPost("/customer/vouchers/display-event", {
    voucherId,
    eventType,
  }).catch(() => undefined);
}

export function recordHomeCmsEvent(
  eventType:
    | "strip_impression"
    | "strip_click"
    | "block_impression"
    | "block_click"
    | "modal_impression"
    | "modal_click"
    | "guide_impression"
    | "guide_video_click"
    | "guide_image_click",
) {
  void apiPost("/public/content/customer-home-event", { eventType }).catch(
    () => undefined,
  );
}

export function getBannerToneStyle(
  tone?: "sky" | "mint" | "amber" | "rose" | null,
) {
  switch (tone) {
    case "mint":
      return {
        shell: "#EAF9F4",
        chip: "#D7F2E8",
        title: "#156C53",
        subtitle: "#3A6A5E",
        button: "#1E7F62",
      };
    case "amber":
      return {
        shell: "#FFEAF3",
        chip: "#FFD9E8",
        title: "#A73D69",
        subtitle: "#8A5E72",
        button: "#D45487",
      };
    case "rose":
      return {
        shell: "#FFEAF1",
        chip: "#FFD7E4",
        title: "#A73D69",
        subtitle: "#8A5E72",
        button: "#D45487",
      };
    case "sky":
    default:
      return {
        shell: "#EDF4FF",
        chip: "#DDEAFF",
        title: "#355EAD",
        subtitle: "#607394",
        button: "#5D8BFF",
      };
  }
}

export function CampaignPlacementCard({
  campaign,
  onOpenModal,
}: {
  campaign: CustomerCampaignPlacement;
  onOpenModal: (campaign: CustomerCampaignPlacement) => void;
}) {
  const display = campaign.display ?? {};
  const title = display.title || campaign.name;
  const subtitle =
    display.subtitle ||
    (campaign.code ? `Use code ${campaign.code}` : "Limited time offer");
  const ctaPath = resolveCustomerRoute(display.ctaPath, null);
  const canOpenModal = Boolean(display.openInModal);
  const hasAction = canOpenModal || Boolean(ctaPath);
  const backgroundColor = display.backgroundColor || "#FFF0F6";
  const textColor = display.textColor || "#3F2432";
  const accentColor = display.accentColor || "#FF5C93";
  const router = useRouter();

  const handlePress = () => {
    void recordCampaignEvent(
      campaign.voucherId,
      canOpenModal ? "modal_open" : "click",
    );
    if (canOpenModal) {
      onOpenModal(campaign);
      return;
    }
    if (ctaPath) router.push(ctaPath as never);
  };

  return (
    <Pressable
      style={[styles.campaignCard, { backgroundColor }]}
      disabled={!hasAction}
      onPress={hasAction ? handlePress : undefined}
    >
      {display.variant === "image" && display.imageUrl ? (
        <RemoteImage
          uri={display.imageUrl}
          style={styles.campaignImage}
          fallbackIcon="pricetag-outline"
          skeletonVariant="home-image"
          accessibilityLabel={`${title} campaign image`}
        />
      ) : null}
      {display.variant === "carousel" && display.carouselImageUrls?.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.campaignCarousel}
        >
          {display.carouselImageUrls.slice(0, 4).map((imageUrl) => (
            <RemoteImage
              key={imageUrl}
              uri={imageUrl}
              style={styles.campaignCarouselImage}
              fallbackIcon="pricetag-outline"
              skeletonVariant="home-image"
            />
          ))}
        </ScrollView>
      ) : null}
      <View style={styles.campaignCopy}>
        <View
          style={[styles.campaignBadge, { backgroundColor: accentColor }]}
        >
          <Ionicons name="sparkles-outline" size={13} color="#FFFFFF" />
          <Text style={[styles.campaignBadgeText, { color: "#FFFFFF" }]}>
            Campaign
          </Text>
        </View>
        <Text
          style={[styles.campaignTitle, { color: textColor }]}
          numberOfLines={2}
        >
          {title}
        </Text>
        <Text
          style={[styles.campaignSubtitle, { color: textColor }]}
          numberOfLines={2}
        >
          {subtitle}
        </Text>
      </View>
      {hasAction ? (
        <View style={[styles.campaignAction, { backgroundColor: accentColor }]}>
          <Text style={styles.campaignActionText}>
            {display.ctaLabel || (canOpenModal ? "View" : "Order now")}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function HomeCmsPromoBlock({ cms }: { cms: CustomerHomeCms }) {
  const block = cms.offerStrip;
  const { width: windowWidth } = useWindowDimensions();
  const scrollX = useRef(new Animated.Value(0)).current;
  const carouselImages: { url: string; ctaPath?: string }[] =
    block.carouselImages?.filter((item) => item.url) ??
    block.carouselImageUrls.map((url) => ({ url })) ??
    [];
  const visibleCarouselImages = carouselImages.slice(0, 5);
  const slideWidth = Math.max(320, windowWidth);

  if (!block.isActive || block.mode !== "promo_block") return null;
  if (block.variant === "carousel" && !visibleCarouselImages.length) return null;
  if (block.variant === "image" && !block.imageUrl) return null;

  if (block.variant === "carousel") {
    return (
      <View style={styles.cmsCarouselOnly}>
        <Animated.ScrollView
          horizontal
          pagingEnabled
          snapToInterval={slideWidth}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          showsHorizontalScrollIndicator={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: false },
          )}
          scrollEventThrottle={16}
        >
          {visibleCarouselImages.map((imageUrl) => (
            <View
              key={imageUrl.url}
              style={[styles.cmsCarouselOnlySlide, { width: slideWidth }]}
            >
              <RemoteImage
                uri={imageUrl.url}
                style={styles.cmsCarouselOnlyImage}
                fallbackIcon="pricetag-outline"
                skeletonVariant="home-image"
                accessibilityLabel="Foodbela offer banner"
              />
            </View>
          ))}
        </Animated.ScrollView>
        <View style={styles.cmsCarouselDots}>
          {visibleCarouselImages.map((imageUrl, index) => {
            const inputRange = [
              (index - 1) * slideWidth,
              index * slideWidth,
              (index + 1) * slideWidth,
            ];
            const dotWidth = scrollX.interpolate({
              inputRange,
              outputRange: [6, 24, 6],
              extrapolate: "clamp",
            });
            const dotOpacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.36, 1, 0.36],
              extrapolate: "clamp",
            });

            return (
              <Animated.View
                key={`${imageUrl.url}-dot`}
                style={[
                  styles.cmsCarouselDot,
                  { width: dotWidth, opacity: dotOpacity },
                ]}
              />
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.cmsBlock,
        block.variant === "image" ? styles.cmsBlockImageOnlyShell : null,
        { backgroundColor: block.backgroundColor || "#FFF0F6" },
      ]}
    >
      {block.variant === "image" && block.imageUrl ? (
        <RemoteImage
          uri={block.imageUrl}
          style={styles.cmsImageOnly}
          fallbackIcon="pricetag-outline"
          skeletonVariant="home-image"
          accessibilityLabel={block.title || "Foodbela offer"}
        />
      ) : null}
      {block.variant === "image_text" && block.imageUrl ? (
        <RemoteImage
          uri={block.imageUrl}
          style={styles.cmsBlockImage}
          fallbackIcon="pricetag-outline"
          skeletonVariant="home-image"
          accessibilityLabel={block.title || "Foodbela offer"}
        />
      ) : null}
      {block.variant !== "image" ? (
        <View style={styles.cmsBlockCopy}>
          <View
            style={[
              styles.cmsBlockBadge,
            { backgroundColor: block.accentColor || "#FF5C93" },
            ]}
          >
            <Ionicons
              name="sparkles-outline"
              size={13}
              color="#FFFFFF"
            />
            <Text
              style={[
                styles.cmsBlockBadgeText,
                { color: "#FFFFFF" },
              ]}
            >
              Promo
            </Text>
          </View>
          <Text
            style={[
              styles.cmsBlockTitle,
              { color: block.textColor || "#3F2432" },
            ]}
            numberOfLines={2}
          >
            {block.title || "Fresh offers near you"}
          </Text>
          <Text
            style={[
              styles.cmsBlockSubtitle,
              { color: block.textColor || "#3F2432" },
            ]}
            numberOfLines={2}
          >
            {block.subtitle ||
              "Limited-time savings from restaurants around you."}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export function HowToOrderGuideBlock({
  cms,
  isAnimationActive = true,
}: {
  cms: CustomerHomeCms;
  isAnimationActive?: boolean;
}) {
  const guide = cms.howToOrderGuide;
  const canOpenVideo = isTrustedGuideVideoUrl(guide?.youtubeUrl);
  const { width: windowWidth } = useWindowDimensions();
  const borderProgress = useRef(new Animated.Value(0)).current;
  const cardWidth = Math.max(280, windowWidth - 40);
  const horizontalTravel = Math.max(0, cardWidth - 72);
  const verticalTravel = 62;
  const animatedBorderColor = guide?.accentColor || "#5D8BFF";
  // Accent-colored glow for the moving border runner. Static style (only
  // transform + opacity animate on the native thread), so it stays 60fps.
  const borderGlow = {
    shadowColor: animatedBorderColor,
    shadowOpacity: 0.9,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 },
    elevation: 7,
  } as const;

  const openGuide = () => {
    if (canOpenVideo && guide?.youtubeUrl) {
      recordHomeCmsEvent("guide_video_click");
      void Linking.openURL(guide.youtubeUrl).catch(() => undefined);
    }
  };

  useEffect(() => {
    if (guide?.isActive && canOpenVideo) recordHomeCmsEvent("guide_impression");
  }, [canOpenVideo, guide?.isActive]);

  useEffect(() => {
    if (!guide?.isActive || !canOpenVideo || !isAnimationActive) {
      borderProgress.stopAnimation();
      borderProgress.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.timing(borderProgress, {
        toValue: 1,
        duration: 4800,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    animation.start();

    return () => {
      animation.stop();
      borderProgress.stopAnimation();
      borderProgress.setValue(0);
    };
  }, [borderProgress, canOpenVideo, guide?.isActive, isAnimationActive]);

  if (!guide?.isActive || !canOpenVideo) return null;

  const topSegmentX = borderProgress.interpolate({
    inputRange: [0, 0.25, 1],
    outputRange: [10, horizontalTravel, horizontalTravel],
  });
  const rightSegmentY = borderProgress.interpolate({
    inputRange: [0, 0.25, 0.5, 1],
    outputRange: [8, 8, verticalTravel, verticalTravel],
  });
  const bottomSegmentX = borderProgress.interpolate({
    inputRange: [0, 0.5, 0.75, 1],
    outputRange: [horizontalTravel, horizontalTravel, 10, 10],
  });
  const leftSegmentY = borderProgress.interpolate({
    inputRange: [0, 0.75, 1],
    outputRange: [verticalTravel, verticalTravel, 8],
  });
  // Wider, overlapping fade windows so adjacent segments briefly co-exist at the
  // corners — the runner hands off smoothly instead of blinking on/off.
  const topOpacity = borderProgress.interpolate({
    inputRange: [0, 0.04, 0.21, 0.3, 1],
    outputRange: [1, 1, 1, 0, 0],
  });
  const rightOpacity = borderProgress.interpolate({
    inputRange: [0, 0.2, 0.29, 0.46, 0.55, 1],
    outputRange: [0, 0, 1, 1, 0, 0],
  });
  const bottomOpacity = borderProgress.interpolate({
    inputRange: [0, 0.45, 0.54, 0.71, 0.8, 1],
    outputRange: [0, 0, 1, 1, 0, 0],
  });
  const leftOpacity = borderProgress.interpolate({
    inputRange: [0, 0.7, 0.79, 0.97, 1],
    outputRange: [0, 0, 1, 1, 1],
  });

  return (
    <View style={styles.guideSection}>
      <View style={styles.guideCardFrame}>
        <View pointerEvents="none" style={styles.guideBorderBase} />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.guideBorderRunnerHorizontal,
            styles.guideBorderRunnerTop,
            borderGlow,
            {
              backgroundColor: animatedBorderColor,
              opacity: topOpacity,
              transform: [{ translateX: topSegmentX }],
            },
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.guideBorderRunnerVertical,
            styles.guideBorderRunnerRight,
            borderGlow,
            {
              backgroundColor: animatedBorderColor,
              opacity: rightOpacity,
              transform: [{ translateY: rightSegmentY }],
            },
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.guideBorderRunnerHorizontal,
            styles.guideBorderRunnerBottom,
            borderGlow,
            {
              backgroundColor: animatedBorderColor,
              opacity: bottomOpacity,
              transform: [{ translateX: bottomSegmentX }],
            },
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.guideBorderRunnerVertical,
            styles.guideBorderRunnerLeft,
            borderGlow,
            {
              backgroundColor: animatedBorderColor,
              opacity: leftOpacity,
              transform: [{ translateY: leftSegmentY }],
            },
          ]}
        />
        <Pressable
          style={[
            styles.guideCard,
            { backgroundColor: guide.backgroundColor || "#EDF4FF" },
          ]}
          onPress={openGuide}
        >
          <Ionicons
            name="play-circle-outline"
            size={42}
            color="rgba(255,255,255,0.30)"
            style={styles.guideDecorPlay}
          />
          <Ionicons
            name="book-outline"
            size={30}
            color="rgba(255,255,255,0.24)"
            style={styles.guideDecorBook}
          />
          <Ionicons
            name="fast-food-outline"
            size={32}
            color="rgba(255,255,255,0.22)"
            style={styles.guideDecorFood}
          />
          <View style={styles.guideIcon}>
            <Ionicons
              name="play-circle"
              size={24}
              color={guide.accentColor || "#5D8BFF"}
            />
          </View>
          <View style={styles.guideCopy}>
            <Text
              style={[
                styles.guideTitle,
                { color: guide.textColor || "#24406F" },
              ]}
              numberOfLines={1}
            >
              {guide.title || "How to order on Foodbela"}
            </Text>
            {guide.subtitle?.trim() ? (
              <Text
                style={[
                  styles.guideSubtitle,
                  { color: guide.textColor || "#24406F" },
                ]}
                numberOfLines={1}
              >
                {guide.subtitle}
              </Text>
            ) : null}
          </View>
          <View
            style={[
              styles.guideButton,
              { backgroundColor: guide.accentColor || "#5D8BFF" },
            ]}
          >
            <Ionicons name="play" size={12} color="#fff" />
            <Text style={styles.guideButtonText}>
              {guide.ctaLabel || "Watch"}
            </Text>
          </View>
        </Pressable>
      </View>
      {guide.guideImages.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.guideImageRow}
        >
          {guide.guideImages.slice(0, 6).map((image, index) => (
            <View key={`${image.url}-${index}`} style={styles.guideImageCard}>
              <Pressable onPress={() => recordHomeCmsEvent("guide_image_click")}>
                <RemoteImage
                  uri={image.url}
                  style={styles.guideImage}
                  fallbackIcon="book-outline"
                  accessibilityLabel={image.title || `How to order step ${index + 1}`}
                />
              </Pressable>
              <Text style={styles.guideImageTitle} numberOfLines={1}>
                {image.title || `Step ${index + 1}`}
              </Text>
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  campaignCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 22,
    overflow: "hidden",
  },
  campaignImage: {
    width: 84,
    height: 84,
    borderRadius: 18,
    backgroundColor: "#FFF0F6",
  },
  campaignCarousel: {
    maxWidth: 118,
  },
  campaignCarouselImage: {
    width: 76,
    height: 76,
    marginRight: 8,
    borderRadius: 16,
    backgroundColor: "#FFF0F6",
  },
  campaignCopy: {
    flex: 1,
    gap: 6,
  },
  campaignBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  campaignBadgeText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "800",
  },
  campaignTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "900",
  },
  campaignSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    opacity: 0.78,
  },
  campaignAction: {
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 999,
  },
  campaignActionText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "900",
    color: "#fff",
  },
  cmsBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 22,
    overflow: "hidden",
  },
  cmsBlockImageOnlyShell: {
    padding: 0,
    gap: 0,
  },
  cmsBlockImage: {
    width: 82,
    height: 82,
    borderRadius: 18,
    backgroundColor: "#FFF0F6",
  },
  cmsImageOnly: {
    width: "100%",
    height: 112,
    borderRadius: 16,
    backgroundColor: "#FFF0F6",
  },
  cmsCarouselOnly: {
    position: "relative",
    marginHorizontal: -20,
    overflow: "hidden",
  },
  cmsCarouselOnlySlide: {
    paddingHorizontal: 20,
    borderRadius: 0,
    overflow: "hidden",
  },
  cmsCarouselOnlyImage: {
    width: "100%",
    height: 112,
    borderRadius: 16,
    backgroundColor: "#FFF0F6",
  },
  cmsCarouselDots: {
    position: "absolute",
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
  },
  cmsCarouselDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#FF5C93",
  },
  cmsCarouselDotActive: {
    width: 14,
    backgroundColor: "#FF5C93",
  },
  cmsBlockCopy: {
    flex: 1,
    gap: 6,
  },
  cmsBlockBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  cmsBlockBadgeText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "900",
  },
  cmsBlockTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "900",
  },
  cmsBlockSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    opacity: 0.78,
  },
  cmsInlineButton: {
    alignSelf: "flex-start",
    marginTop: 2,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  cmsInlineButtonSoft: {
    backgroundColor: "rgba(255,255,255,0.62)",
  },
  cmsInlineButtonOutline: {
    backgroundColor: "transparent",
  },
  cmsInlineButtonDark: {
    backgroundColor: "#2B1D24",
    borderColor: "#2B1D24",
  },
  cmsInlineButtonText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "900",
    color: "#fff",
  },
  guideSection: {
    paddingTop: 18,
    gap: 10,
  },
  guideCardFrame: {
    marginHorizontal: 20,
    position: "relative",
    padding: 2,
    borderRadius: 22,
    overflow: "hidden",
    shadowColor: "#111827",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  guideCard: {
    position: "relative",
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 78,
    paddingHorizontal: 15,
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.72)",
  },
  guideBorderBase: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.72)",
  },
  guideBorderRunnerHorizontal: {
    position: "absolute",
    zIndex: 2,
    width: 66,
    height: 3,
    borderRadius: 999,
  },
  guideBorderRunnerVertical: {
    position: "absolute",
    zIndex: 2,
    width: 3,
    height: 34,
    borderRadius: 999,
  },
  guideBorderRunnerTop: {
    top: 2,
    left: 0,
  },
  guideBorderRunnerRight: {
    top: 0,
    right: 2,
  },
  guideBorderRunnerBottom: {
    bottom: 2,
    left: 0,
  },
  guideBorderRunnerLeft: {
    top: 0,
    left: 2,
  },
  guideDecorPlay: {
    position: "absolute",
    right: 18,
    top: 10,
  },
  guideDecorBook: {
    position: "absolute",
    right: 72,
    bottom: 10,
  },
  guideDecorFood: {
    position: "absolute",
    right: 116,
    bottom: 12,
  },
  guideIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.7)",
  },
  guideCopy: {
    flex: 1,
    gap: 3,
  },
  guideTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "900",
  },
  guideSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    opacity: 0.72,
  },
  guideButton: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    shadowColor: "#111827",
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  guideButtonText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "900",
    color: "#fff",
  },
  guideImageRow: {
    paddingLeft: 20,
    paddingRight: 10,
    gap: 10,
  },
  guideImageCard: {
    width: 116,
    gap: 6,
  },
  guideImage: {
    width: 116,
    height: 86,
    borderRadius: 16,
    backgroundColor: "#EDF4FF",
  },
  guideImageTitle: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    color: "#181620",
  },
});
