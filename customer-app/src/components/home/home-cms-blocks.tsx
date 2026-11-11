import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  AppState,
  Easing,
  Image,
  Linking,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import { RemoteImage } from "@/src/components/remote-image";
import { apiPostWithOptionalAuth } from "@/src/lib/api";
import {
  resolveCustomerRoute,
  withRestaurantViewSource,
} from "@/src/lib/customer-routes";
import { isTrustedYoutubeUrl, parseYoutubeId } from "@/src/lib/youtube-url";
import { palette } from "@/src/theme/palette";
import type {
  CustomerCampaignPlacement,
  CustomerHomeCms,
} from "@/src/types/restaurant";

const BELA_MASCOT = require("../../../assets/bela_mascot.png");

export function recordCampaignEvent(
  voucherId: string | undefined,
  eventType: "impression" | "click" | "modal_open" | "strip_click",
) {
  if (!voucherId) return;
  void apiPostWithOptionalAuth("/customer/vouchers/display-event", {
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
  void apiPostWithOptionalAuth("/public/content/customer-home-event", {
    eventType,
  }).catch(() => undefined);
}

function isExternalHttpUrl(value?: string | null) {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

// A carousel image shows the "Sponsored" badge only while it's enabled AND still within its
// window — an empty `sponsoredUntil` means no expiry, otherwise it's hidden once that instant passes.
function isCarouselSponsored(image: {
  url?: string;
  sponsored?: boolean;
  sponsoredUntil?: string;
}) {
  if (image.sponsored !== true) return false;
  const until = image.sponsoredUntil?.trim();
  if (!until) return true;
  const ts = Date.parse(until);
  return Number.isNaN(ts) || ts > Date.now();
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
        shell: "#FFF1DC",
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
  const backgroundColor = display.backgroundColor || "#FFF6E8";
  const textColor = display.textColor || "#3F2432";
  const accentColor = display.accentColor || "#A86300";
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
    if (ctaPath) {
      router.push(withRestaurantViewSource(ctaPath, "carousel") as never);
    }
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

// Memoized so the home re-rendering (scroll, countdown ticks, query updates) doesn't re-render the
// carousel when its `cms` prop is unchanged — the carousel already re-renders itself on its own
// autoplay tick, which is enough.
function HomeCmsPromoBlockBase({ cms }: { cms: CustomerHomeCms }) {
  const block = cms.offerStrip;
  const router = useRouter();
  const isScreenFocused = useIsFocused();
  const { width: windowWidth } = useWindowDimensions();
  const carouselScrollRef = useRef<ScrollView | null>(null);
  const activeSlideIndexRef = useRef(0);
  const pageIndexRef = useRef(0);
  const pauseAutoPlayUntilRef = useRef(0);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [isAppActive, setIsAppActive] = useState(
    () => AppState.currentState === "active",
  );
  const carouselImages = useMemo(() => {
    const structuredImages =
      block.carouselImages?.filter((item) => item.url.trim()) ?? [];
    if (structuredImages.length) return structuredImages;

    return (block.carouselImageUrls ?? [])
      .filter((url) => url.trim())
      .map((url) => ({ url, linkEnabled: false, ctaPath: "" }));
  }, [block.carouselImageUrls, block.carouselImages]);
  const visibleCarouselImages = useMemo(
    () => carouselImages.slice(0, 5),
    [carouselImages],
  );
  const loopEnabled = visibleCarouselImages.length > 1;
  const renderedCarouselImages = useMemo(() => {
    if (!loopEnabled) return visibleCarouselImages;
    return [
      visibleCarouselImages[visibleCarouselImages.length - 1],
      ...visibleCarouselImages,
      visibleCarouselImages[0],
    ];
  }, [loopEnabled, visibleCarouselImages]);
  const slideWidth = Math.max(320, windowWidth);
  const autoPlayIntervalMs =
    Math.max(
      2,
      Math.min(30, Math.floor(block.carouselIntervalSeconds ?? 5)),
    ) * 1000;
  const autoPlayEnabled =
    block.carouselAutoPlayEnabled === true && loopEnabled;

  const getRealSlideIndexFromPage = useCallback(
    (pageIndex: number) => {
      const slideCount = visibleCarouselImages.length;
      if (!slideCount) return 0;
      if (!loopEnabled) {
        return Math.max(0, Math.min(slideCount - 1, pageIndex));
      }
      if (pageIndex <= 0) return slideCount - 1;
      if (pageIndex >= slideCount + 1) return 0;
      return pageIndex - 1;
    },
    [loopEnabled, visibleCarouselImages.length],
  );

  const scrollToCarouselPage = useCallback(
    (pageIndex: number, animated: boolean) => {
      carouselScrollRef.current?.scrollTo({
        x: pageIndex * slideWidth,
        animated,
      });
    },
    [slideWidth],
  );

  const pauseAutoPlay = useCallback(() => {
    pauseAutoPlayUntilRef.current =
      Date.now() + Math.max(autoPlayIntervalMs, 5000);
  }, [autoPlayIntervalMs]);

  const openCarouselTarget = useCallback(
    async (target?: string | null) => {
      const safeRoute = resolveCustomerRoute(target, null);
      if (safeRoute) {
        router.push(safeRoute as never);
        return;
      }

      const externalUrl = target?.trim() ?? "";
      if (isExternalHttpUrl(externalUrl)) {
        await Linking.openURL(externalUrl);
      }
    },
    [router],
  );

  const handleCarouselMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const slideCount = visibleCarouselImages.length;
      if (!slideCount) return;

      const rawPageIndex = Math.round(
        event.nativeEvent.contentOffset.x / slideWidth,
      );
      const realSlideIndex = getRealSlideIndexFromPage(rawPageIndex);
      let nextPageIndex = rawPageIndex;

      if (loopEnabled && rawPageIndex <= 0) {
        nextPageIndex = slideCount;
      } else if (loopEnabled && rawPageIndex >= slideCount + 1) {
        nextPageIndex = 1;
      }

      activeSlideIndexRef.current = realSlideIndex;
      pageIndexRef.current = nextPageIndex;
      setActiveSlideIndex(realSlideIndex);

      if (nextPageIndex !== rawPageIndex) {
        requestAnimationFrame(() => {
          scrollToCarouselPage(nextPageIndex, false);
        });
      }
    },
    [
      getRealSlideIndexFromPage,
      loopEnabled,
      scrollToCarouselPage,
      slideWidth,
      visibleCarouselImages.length,
    ],
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      setIsAppActive(state === "active");
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const slideCount = visibleCarouselImages.length;
    const nextActiveIndex = slideCount
      ? Math.min(activeSlideIndexRef.current, slideCount - 1)
      : 0;
    const nextPageIndex = loopEnabled ? nextActiveIndex + 1 : nextActiveIndex;

    activeSlideIndexRef.current = nextActiveIndex;
    pageIndexRef.current = nextPageIndex;
    setActiveSlideIndex(nextActiveIndex);

    const frame = requestAnimationFrame(() => {
      scrollToCarouselPage(nextPageIndex, false);
    });
    return () => cancelAnimationFrame(frame);
  }, [loopEnabled, scrollToCarouselPage, visibleCarouselImages.length]);

  useEffect(() => {
    if (!autoPlayEnabled || !isScreenFocused || !isAppActive) return;

    const timer = setInterval(() => {
      if (Date.now() < pauseAutoPlayUntilRef.current) return;

      const slideCount = visibleCarouselImages.length;
      const currentPageIndex =
        loopEnabled && pageIndexRef.current >= slideCount + 1
          ? 1
          : pageIndexRef.current;
      if (currentPageIndex !== pageIndexRef.current) {
        pageIndexRef.current = currentPageIndex;
        scrollToCarouselPage(currentPageIndex, false);
      }

      const nextPageIndex = currentPageIndex + 1;
      const realSlideIndex = getRealSlideIndexFromPage(nextPageIndex);
      pageIndexRef.current = nextPageIndex;
      activeSlideIndexRef.current = realSlideIndex;
      setActiveSlideIndex(realSlideIndex);
      scrollToCarouselPage(nextPageIndex, true);
    }, autoPlayIntervalMs);

    return () => clearInterval(timer);
  }, [
    autoPlayEnabled,
    autoPlayIntervalMs,
    getRealSlideIndexFromPage,
    isAppActive,
    isScreenFocused,
    loopEnabled,
    scrollToCarouselPage,
    visibleCarouselImages.length,
  ]);

  if (!block.isActive || block.mode !== "promo_block") return null;
  if (block.variant === "carousel" && !visibleCarouselImages.length) return null;
  if (block.variant === "image" && !block.imageUrl) return null;

  if (block.variant === "carousel") {
    return (
      <View style={styles.cmsCarouselOnly}>
        <ScrollView
          ref={carouselScrollRef}
          horizontal
          pagingEnabled
          snapToInterval={slideWidth}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleCarouselMomentumEnd}
          onScrollBeginDrag={pauseAutoPlay}
          scrollEventThrottle={16}
        >
          {renderedCarouselImages.map((image, index) => {
            const target = image.linkEnabled === true ? image.ctaPath : "";
            const hasAction = Boolean(
              resolveCustomerRoute(target, null) ||
                (target?.trim() ? isExternalHttpUrl(target) : false),
            );

            return (
              <View
                key={`${image.url}-${index}`}
                style={[styles.cmsCarouselOnlySlide, { width: slideWidth }]}
              >
                <Pressable
                  disabled={!hasAction}
                  style={({ pressed }) => [
                    styles.cmsCarouselOnlyPressable,
                    pressed && hasAction
                      ? styles.cmsCarouselOnlyPressed
                      : null,
                  ]}
                  onPress={
                    hasAction
                      ? () => {
                          recordHomeCmsEvent("block_click");
                          void openCarouselTarget(target);
                        }
                      : undefined
                  }
                >
                  <RemoteImage
                    uri={image.url}
                    style={styles.cmsCarouselOnlyImage}
                    fallbackIcon="pricetag-outline"
                    skeletonVariant="home-image"
                    targetWidth={slideWidth}
                    accessibilityLabel="Foodbela offer banner"
                  />
                  {isCarouselSponsored(image) ? (
                    <View style={styles.cmsCarouselSponsored}>
                      <Ionicons name="megaphone" size={9} color="#F4F6FB" />
                      <Text style={styles.cmsCarouselSponsoredText}>
                        Sponsored
                      </Text>
                    </View>
                  ) : null}
                  {/* No CTA button on the banner — the whole slide is the tap target. */}
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
        {visibleCarouselImages.length > 1 ? (
          <View style={styles.cmsCarouselDots}>
            {visibleCarouselImages.map((image, index) => (
              <View
                key={`${image.url}-${index}-dot`}
                style={[
                  styles.cmsCarouselDot,
                  index === activeSlideIndex
                    ? styles.cmsCarouselDotActive
                    : null,
                ]}
              />
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.cmsBlock,
        block.variant === "image" ? styles.cmsBlockImageOnlyShell : null,
        { backgroundColor: block.backgroundColor || "#FFF6E8" },
      ]}
    >
      {block.variant === "image" && block.imageUrl ? (
        <RemoteImage
          uri={block.imageUrl}
          style={styles.cmsImageOnly}
          fallbackIcon="pricetag-outline"
          skeletonVariant="home-image"
          targetWidth={windowWidth}
          accessibilityLabel={block.title || "Foodbela offer"}
        />
      ) : null}
      {block.variant === "image_text" && block.imageUrl ? (
        <RemoteImage
          uri={block.imageUrl}
          style={styles.cmsBlockImage}
          fallbackIcon="pricetag-outline"
          skeletonVariant="home-image"
          targetWidth={windowWidth}
          accessibilityLabel={block.title || "Foodbela offer"}
        />
      ) : null}
      {block.variant !== "image" ? (
        <View style={styles.cmsBlockCopy}>
          <View
            style={[
              styles.cmsBlockBadge,
            { backgroundColor: block.accentColor || "#A86300" },
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

export const HomeCmsPromoBlock = memo(HomeCmsPromoBlockBase);

export function HowToOrderGuideBlock({
  cms,
  isAnimationActive = true,
}: {
  cms: CustomerHomeCms;
  isAnimationActive?: boolean;
}) {
  const guide = cms.howToOrderGuide;
  const canOpenVideo = isTrustedYoutubeUrl(guide?.youtubeUrl);
  const playPulse = useRef(new Animated.Value(0)).current;
  const router = useRouter();

  // Plays inside the app (same player as the Hype videos); a non-YouTube-id link still
  // falls back to the browser.
  const openGuide = () => {
    if (!canOpenVideo || !guide?.youtubeUrl) return;
    recordHomeCmsEvent("guide_video_click");
    if (parseYoutubeId(guide.youtubeUrl)) {
      router.push({
        pathname: "/guide-video",
        params: { url: guide.youtubeUrl, title: guide.title ?? "", subtitle: guide.subtitle ?? "" },
      } as never);
      return;
    }
    void Linking.openURL(guide.youtubeUrl).catch(() => undefined);
  };

  useEffect(() => {
    if (guide?.isActive && canOpenVideo) recordHomeCmsEvent("guide_impression");
  }, [canOpenVideo, guide?.isActive]);

  // One gentle "breathing" ring on the play badge — the only motion (native driver).
  useEffect(() => {
    if (!guide?.isActive || !canOpenVideo || !isAnimationActive) {
      playPulse.stopAnimation();
      playPulse.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.timing(playPulse, {
        toValue: 1,
        duration: 1800,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => {
      animation.stop();
      playPulse.setValue(0);
    };
  }, [playPulse, canOpenVideo, guide?.isActive, isAnimationActive]);

  if (!guide?.isActive || !canOpenVideo) return null;

  const ringScale = playPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] });
  const ringOpacity = playPulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });

  // Brand-consistent card (white + amber, Bela as the "video thumbnail"). Admin still
  // controls title / subtitle / button label / video / step images; the old custom
  // background/accent colours are intentionally ignored so it matches the rest of home.
  return (
    <View style={styles.guideSection}>
      <Pressable
        style={({ pressed }) => [styles.guideCard, pressed ? styles.guideCardPressed : null]}
        onPress={openGuide}
        accessibilityRole="button"
        accessibilityLabel={`${guide.title || "How to order on Foodbela"} — watch video`}
      >
        <View style={styles.guideThumb}>
          <Image source={BELA_MASCOT} style={styles.guideMascot} resizeMode="contain" />
          <View style={styles.guidePlayWrap} pointerEvents="none">
            <Animated.View
              style={[styles.guidePlayRing, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]}
            />
            <View style={styles.guidePlay}>
              <Ionicons name="play" size={11} color={palette.onPrimary} style={styles.guidePlayIcon} />
            </View>
          </View>
        </View>
        <View style={styles.guideCopy}>
          <Text style={styles.guideEyebrow}>NEW TO FOODBELA?</Text>
          <Text style={styles.guideTitle} numberOfLines={2}>
            {guide.title || "How to order on Foodbela"}
          </Text>
          {guide.subtitle?.trim() ? (
            <Text style={styles.guideSubtitle} numberOfLines={2}>
              {guide.subtitle}
            </Text>
          ) : null}
        </View>
        <View style={styles.guideButton}>
          <Ionicons name="play" size={12} color={palette.onPrimary} />
          <Text style={styles.guideButtonText}>{guide.ctaLabel || "Watch"}</Text>
        </View>
      </Pressable>

      {guide.guideImages.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.guideImageRow}
        >
          {guide.guideImages.slice(0, 6).map((image, index) => (
            <Pressable
              key={`${image.url}-${index}`}
              style={styles.guideImageCard}
              onPress={() => recordHomeCmsEvent("guide_image_click")}
            >
              <View>
                <RemoteImage
                  uri={image.url}
                  style={styles.guideImage}
                  fallbackIcon="book-outline"
                  accessibilityLabel={image.title || `How to order step ${index + 1}`}
                />
                <View style={styles.guideStepBadge}>
                  <Text style={styles.guideStepBadgeText}>{index + 1}</Text>
                </View>
              </View>
              <Text style={styles.guideImageTitle} numberOfLines={1}>
                {image.title || `Step ${index + 1}`}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // ── "How to order" guide (brand card) ──
  guideSection: { paddingHorizontal: 16, paddingTop: 20, gap: 12 },
  guideCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ECECEC",
  },
  guideCardPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  guideThumb: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primarySoft,
  },
  guideMascot: { width: 52, height: 52 },
  guidePlayWrap: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  guidePlayRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 13,
    backgroundColor: palette.primary,
  },
  guidePlay: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
    borderWidth: 2,
    borderColor: palette.surface,
  },
  guidePlayIcon: { marginLeft: 1 },
  guideCopy: { flex: 1, minWidth: 0, gap: 2 },
  guideEyebrow: {
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: palette.secondary,
  },
  guideTitle: { fontSize: 15, lineHeight: 20, fontWeight: "700", color: palette.foreground },
  guideSubtitle: { fontSize: 12.5, lineHeight: 17, color: palette.mutedForeground },
  guideButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 999,
    backgroundColor: palette.primary,
  },
  guideButtonText: { fontSize: 12.5, lineHeight: 16, fontWeight: "700", color: palette.onPrimary },
  guideImageRow: { gap: 10, paddingRight: 4 },
  guideImageCard: { width: 124, gap: 6 },
  guideImage: {
    width: 124,
    height: 92,
    borderRadius: 14,
    backgroundColor: palette.surfaceMuted,
  },
  guideStepBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
  },
  guideStepBadgeText: { fontSize: 11.5, lineHeight: 14, fontWeight: "700", color: palette.onPrimary },
  guideImageTitle: { fontSize: 12, lineHeight: 16, fontWeight: "500", color: palette.foreground },
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
    backgroundColor: "#FFF6E8",
  },
  campaignCarousel: {
    maxWidth: 118,
  },
  campaignCarouselImage: {
    width: 76,
    height: 76,
    marginRight: 8,
    borderRadius: 16,
    backgroundColor: "#FFF6E8",
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
    fontWeight: "700",
  },
  campaignTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "700",
  },
  campaignSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
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
    fontWeight: "700",
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
    backgroundColor: "#FFF6E8",
  },
  cmsImageOnly: {
    width: "100%",
    height: 112,
    borderRadius: 16,
    backgroundColor: "#FFF6E8",
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
  cmsCarouselOnlyPressable: {
    position: "relative",
    borderRadius: 16,
  },
  cmsCarouselOnlyPressed: {
    opacity: 0.94,
  },
  cmsCarouselOnlyImage: {
    width: "100%",
    height: 112,
    borderRadius: 16,
    backgroundColor: "#FFF6E8",
  },
  // "Sponsored" ad-label pill, top-left of the slide (mirrors the Featured card's badge).
  cmsCarouselSponsored: {
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
    borderColor: "rgba(255, 255, 255, 0.28)",
  },
  cmsCarouselSponsoredText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
    color: "#F4F6FB",
  },
  // No admin label → a round arrow-only button.
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
    backgroundColor: "#A86300",
  },
  cmsCarouselDotActive: {
    width: 14,
    backgroundColor: "#A86300",
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
    fontWeight: "700",
  },
  cmsBlockTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "700",
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
    fontWeight: "700",
    color: "#fff",
  },
});
