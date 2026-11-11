import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { useRouter } from "expo-router";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  Animated,
  AppState,
  Easing,
  type LayoutChangeEvent,
  Linking,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  type StyleProp,
  Text,
  View,
  type ViewStyle,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ClosingSoonBanner,
  ServiceClosedHero,
  ServiceClosedStickyPill,
} from "@/src/components/service-closed-banner";
import { EmptyStateCard } from "@/src/components/empty-state-card";
import { HomeRewardsChip } from "@/src/components/rewards/home-rewards-chip";
import { buildRestaurantOfferMap, getOfferLabel } from "@/src/lib/restaurant-offer-labels";
import { ShimmerBlock as SharedShimmerBlock } from "@/src/components/loading-skeleton";
import {
  getBannerToneStyle,
  HomeCmsPromoBlock,
  HowToOrderGuideBlock,
  recordHomeCmsEvent,
} from "@/src/components/home/home-cms-blocks";
import { HomeDealsSection } from "@/src/components/home/home-deals-section";
import {
  HERO_ASPECT_RATIO,
  HomeHeroCarousel,
} from "@/src/components/home/home-hero-carousel";
import { HomePollModal } from "@/src/components/home/home-poll-modal";
import { RotatingSearchPlaceholder } from "@/src/components/home/rotating-search-placeholder";
import { PressableScale } from "@/src/components/pressable-scale";
import { styles } from "@/src/components/home/home-screen.styles";
import { HomeTimeBasedSection } from "@/src/components/home/home-time-based-section";
import { RemoteImage } from "@/src/components/remote-image";
import { HomeLocationReminder } from "@/src/components/home/home-location-reminder";
import { HomeOrderAgainSection } from "@/src/components/home/home-order-again-section";
import { BelaPullToRefresh } from "@/src/components/bela-pull-to-refresh";
import {
  ClosedReminderStrip,
  NotifyWhenOpenButton,
  useOpenNotify,
} from "@/src/components/notify-when-open-button";
import { RestaurantFeedRow } from "@/src/components/restaurant-feed-row";
import {
  getRestaurantCustomBadge,
  RestaurantHeroCard,
} from "@/src/components/restaurant-hero-card";
import { SectionHeader } from "@/src/components/section-header";
import {
  useCustomerDiscoveryHomeQuery,
  useCustomerFavoriteRestaurantIdsQuery,
  useCustomerNotificationsQuery,
  useCustomerOrderPresenceQuery,
  useRestaurantDiscoveryInfiniteQuery,
  useCustomerToggleFavoriteRestaurantMutation,
} from "@/src/hooks/use-customer-api";
import { useCustomerAuthStore } from "@/src/store/auth-store";
import { useBrowseHistoryStore } from "@/src/store/browse-history-store";
import { useIsOnline } from "@/src/hooks/use-network-status";
import { useLocationStore } from "@/src/store/location-store";
import { palette } from "@/src/theme/palette";
import { trackCustomerEvent } from "@/src/lib/analytics";
import { formatDeliverToLine } from "@/src/lib/location-address";
import {
  resolveCustomerRoute,
  withRestaurantViewSource,
} from "@/src/lib/customer-routes";
import { normalizeFoodCategorySuggestions } from "@/src/lib/food-categories";
import { openFirst } from "@/src/lib/open-first";
import { openLocationPermissionSettings } from "@/src/lib/location-permissions";
import { resolvePanelTheme } from "@/src/lib/panel-theme";
import {
  useCloseAutoRefresh,
  useReopenAutoRefresh,
} from "@/src/lib/restaurant-availability";
import { hasVotedPoll } from "@/src/lib/poll-vote-storage";
import { heroOverlayTheme } from "@/src/lib/hero-overlay";
import type {
  CustomerHomeHeroSlide,
  CustomerHomeCms,
  CustomerHomeRestaurantSectionConfig,
  DiscoverableRestaurant,
} from "@/src/types/restaurant";

function isExternalHttpUrl(value?: string | null) {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

// Expands a #RGB/#RRGGBB color into an 8-digit hex with the given alpha so the
// time-based section can tint its header from the admin-set accent color.
function withAlpha(hex: string | undefined, alpha: number) {
  const normalized = (hex ?? "").replace("#", "").trim();
  if (normalized.length !== 3 && normalized.length !== 6) return hex ?? "#A86300";
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized;
  const alphaHex = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${full}${alphaHex}`;
}

// Backend-driven order of the 3 "top" home sections. Any missing/invalid key is appended
// in the default order, so the result is always exactly [featured, timeBased, offers] in
// some order — never ambiguous. Default preserves the current layout.
const TOP_SECTION_KEYS = ["featured", "timeBased", "offers"] as const;
type TopSectionKey = (typeof TOP_SECTION_KEYS)[number];
function getTopSectionOrder(order?: string[] | null): TopSectionKey[] {
  const valid = (order ?? []).filter((key): key is TopSectionKey =>
    (TOP_SECTION_KEYS as readonly string[]).includes(key),
  );
  const deduped = Array.from(new Set(valid));
  for (const key of TOP_SECTION_KEYS) {
    if (!deduped.includes(key)) deduped.push(key);
  }
  return deduped;
}

// Vibrant per-tile ring colours so the category row reads colourful, not monochrome. The
// first is amber to match the lead tile's "hot pick" glow.
const CATEGORY_TINTS = [
  "#FFB020",
  "#A86300",
  "#7C6CFF",
  "#37B7FF",
  "#34D399",
  "#FF6B6B",
];

function hasRenderableHomePromoBlock(homeCms?: CustomerHomeCms | null) {
  const block = homeCms?.offerStrip;
  if (!block?.isActive || block.mode !== "promo_block") return false;
  if (block.variant === "carousel") {
    return Boolean(
      block.carouselImages?.some((image) => image.url.trim()) ||
      block.carouselImageUrls?.some((url) => url.trim()),
    );
  }
  if (block.variant === "image") return Boolean(block.imageUrl.trim());
  return Boolean(
    block.title.trim() ||
    block.subtitle.trim() ||
    (block.variant === "image_text" && block.imageUrl.trim()),
  );
}

function isHomeRestaurantSectionActive(
  config?: CustomerHomeRestaurantSectionConfig,
) {
  return config?.isActive !== false;
}

function getHomeRestaurantSectionLimit(
  config: CustomerHomeRestaurantSectionConfig | undefined,
  fallback: number,
) {
  const value = Number(config?.maxItems ?? fallback);
  return Math.max(1, Math.min(20, Number.isFinite(value) ? Math.floor(value) : fallback));
}

function getHomeRestaurantSectionText(
  config: CustomerHomeRestaurantSectionConfig | undefined,
  fallbackTitle: string,
  fallbackSubtitle: string,
) {
  return {
    title: config?.title?.trim() || fallbackTitle,
    subtitle: config?.subtitle?.trim() || fallbackSubtitle,
    // Admin-set header emoji (empty = none). Falls back to no emoji.
    emoji: config?.emoji?.trim() || "",
  };
}

function NearbyHeaderSpinner({ visible }: { visible: boolean }) {
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      rotateAnim.stopAnimation();
      return;
    }

    const rotateLoop = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 880,
        easing: Easing.linear,
        useNativeDriver: true,
        isInteraction: false,
      }),
    );

    rotateAnim.setValue(0);
    rotateLoop.start();

    return () => {
      rotateLoop.stop();
      rotateAnim.stopAnimation();
    };
  }, [rotateAnim, visible]);

  if (!visible) {
    return null;
  }

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <View style={styles.nearbySpinnerShell}>
      <Animated.View
        style={[styles.nearbySpinnerRing, { transform: [{ rotate: spin }] }]}
      />
      <View style={styles.nearbySpinnerCore}>
        <Ionicons name="location" size={11} color={palette.secondary} />
      </View>
    </View>
  );
}

function useHomeShimmer(active: boolean) {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      shimmerAnim.stopAnimation();
      return;
    }

    const shimmerLoop = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1250,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
        isInteraction: false,
      }),
    );

    shimmerAnim.setValue(0);
    shimmerLoop.start();

    return () => {
      shimmerLoop.stop();
      shimmerAnim.stopAnimation();
    };
  }, [active, shimmerAnim]);

  return shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-220, 220],
  });
}

function ShimmerBlock({
  style,
  translateX,
}: {
  style?: StyleProp<ViewStyle>;
  translateX: Animated.AnimatedInterpolation<number>;
}) {
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

type HomeRestaurantCardVariant = "featured" | "offer" | "nearby";

function HomeHeroSkeleton({
  translateX,
}: {
  translateX: Animated.AnimatedInterpolation<number>;
}) {
  return (
    <View style={styles.homeHeroSkeleton}>
      <ShimmerBlock translateX={translateX} style={styles.homeBannerSkeleton} />
    </View>
  );
}

function RestaurantCardSkeleton({
  translateX,
  variant = "nearby",
}: {
  translateX: Animated.AnimatedInterpolation<number>;
  variant?: HomeRestaurantCardVariant;
}) {
  const isFeaturedVariant = variant === "featured";
  const isOfferVariant = variant === "offer";
  const isNearbyVariant = variant === "nearby";

  return (
    <View
      style={[
        styles.restaurantSkeletonCard,
        isFeaturedVariant ? styles.restaurantSkeletonCardFeatured : null,
        isOfferVariant ? styles.restaurantSkeletonCardOffer : null,
        isNearbyVariant ? styles.restaurantSkeletonCardNearby : null,
      ]}
    >
      <View
        style={[
          styles.restaurantSkeletonImageShell,
          isFeaturedVariant ? styles.restaurantSkeletonImageFeatured : null,
          isOfferVariant ? styles.restaurantSkeletonImageOffer : null,
          isNearbyVariant ? styles.restaurantSkeletonImageNearby : null,
        ]}
      >
        <ShimmerBlock
          translateX={translateX}
          style={styles.restaurantSkeletonImage}
        />
        <ShimmerBlock
          translateX={translateX}
          style={
            isOfferVariant
              ? styles.restaurantSkeletonOfferBadge
              : [
                  styles.restaurantSkeletonImageBadge,
                  isNearbyVariant
                    ? styles.restaurantSkeletonImageBadgeNearby
                    : null,
                ]
          }
        />
      </View>
      <View
        style={[
          styles.restaurantSkeletonCopy,
          isOfferVariant ? styles.restaurantSkeletonCopyOffer : null,
        ]}
      >
        <View style={styles.restaurantSkeletonTitleRow}>
          <View style={styles.restaurantSkeletonTitleBlock}>
            <ShimmerBlock
              translateX={translateX}
              style={styles.restaurantSkeletonTitle}
            />
            <ShimmerBlock
              translateX={translateX}
              style={styles.restaurantSkeletonSubtitle}
            />
          </View>
          <ShimmerBlock
            translateX={translateX}
            style={styles.restaurantSkeletonPrice}
          />
        </View>
        <View style={styles.restaurantSkeletonMetricRow}>
          <ShimmerBlock
            translateX={translateX}
            style={styles.restaurantSkeletonMetric}
          />
          <ShimmerBlock
            translateX={translateX}
            style={styles.restaurantSkeletonMetric}
          />
          <ShimmerBlock
            translateX={translateX}
            style={styles.restaurantSkeletonMetricSmall}
          />
        </View>
      </View>
    </View>
  );
}

function RestaurantListSkeleton({
  translateX,
  horizontal = false,
  count = 3,
  variant = "nearby",
}: {
  translateX: Animated.AnimatedInterpolation<number>;
  horizontal?: boolean;
  count?: number;
  variant?: HomeRestaurantCardVariant;
}) {
  const skeletons = Array.from({ length: count }, (_, index) => index);

  if (horizontal) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.horizontalRow}
      >
        {skeletons.map((item) => (
          <View key={item} style={styles.featuredCardWrap}>
            <RestaurantCardSkeleton translateX={translateX} variant={variant} />
          </View>
        ))}
      </ScrollView>
    );
  }

  return (
    <View style={styles.verticalList}>
      {skeletons.map((item) => (
        <View key={item} style={styles.rowSkeleton}>
          <ShimmerBlock translateX={translateX} style={styles.rowSkeletonImage} />
          <View style={styles.rowSkeletonBody}>
            <ShimmerBlock translateX={translateX} style={styles.rowSkeletonTitle} />
            <ShimmerBlock translateX={translateX} style={styles.rowSkeletonLine} />
            <ShimmerBlock
              translateX={translateX}
              style={styles.rowSkeletonLineShort}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function mapRestaurantSubtitle(restaurant: DiscoverableRestaurant) {
  return [
    restaurant.cuisineTypes?.slice(0, 2).join(" • "),
    restaurant.address?.city,
  ]
    .filter(Boolean)
    .join(" • ");
}

function mapRestaurantCardSubtitle(restaurant: DiscoverableRestaurant) {
  return restaurant.cuisineTypes?.slice(0, 2).join(" • ") ?? "";
}

function isFeaturedRestaurant(restaurant: DiscoverableRestaurant) {
  return (
    restaurant.discovery?.isFeatured === true ||
    typeof restaurant.discovery?.featuredSortOrder === "number"
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const isHomeFocused = useIsFocused();
  const { width: screenWidth } = useWindowDimensions();
  const searchQuery = "";
  const [showHomeCmsModal, setShowHomeCmsModal] = useState(false);
  const [homeCmsModalShown, setHomeCmsModalShown] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const lastTrackedSearchRef = useRef("");
  const isCustomerAuthenticated = useCustomerAuthStore((state) =>
    Boolean(state.accessToken),
  );
  const selectedLocation = useLocationStore((state) => state.selectedLocation);
  const isLocationHydrated = useLocationStore((state) => state.isHydrated);
  const startupStatus = useLocationStore((state) => state.startupStatus);
  // First run has no saved location while permission/GPS/geocode is still resolving.
  // Treat that window as "loading" (show a skeleton) instead of the "choose your
  // location" prompt, so a brand-new user never sees the prompt flash then vanish.
  const isResolvingLocation =
    !selectedLocation &&
    (!isLocationHydrated || startupStatus === "loading_location");
  const locationKey = selectedLocation
    ? `${selectedLocation.id}:${selectedLocation.latitude}:${selectedLocation.longitude}`
    : "";
  const previousLocationKeyRef = useRef(locationKey);
  const [pendingLocationUpdateKey, setPendingLocationUpdateKey] = useState("");
  const isOnline = useIsOnline();
  const addRecentVisitedRestaurant = useBrowseHistoryStore(
    (state) => state.addRecentVisitedRestaurant,
  );
  const permissionGranted = useLocationStore(
    (state) => state.permissionGranted,
  );
  const isSearching = searchQuery.trim().length > 0;

  const queryClient = useQueryClient();
  const homeQuery = useCustomerDiscoveryHomeQuery({
    latitude: selectedLocation?.latitude,
    longitude: selectedLocation?.longitude,
    enabled: isLocationHydrated,
  });
  const orderPresenceQuery = useCustomerOrderPresenceQuery(
    isCustomerAuthenticated,
  );
  const favoriteRestaurantIdsQuery = useCustomerFavoriteRestaurantIdsQuery();
  // "All restaurants" = every place that delivers to the pin, paged (scroll-to-load).
  const allRestaurantsQuery = useRestaurantDiscoveryInfiniteQuery({
    latitude: selectedLocation?.latitude,
    longitude: selectedLocation?.longitude,
    pageSize: 10,
  });
  const allRestaurants = useMemo(() => {
    const seen = new Set<string>();
    const rows: DiscoverableRestaurant[] = [];
    for (const page of allRestaurantsQuery.data?.pages ?? []) {
      for (const restaurant of page.items) {
        if (seen.has(restaurant._id)) continue;
        seen.add(restaurant._id);
        rows.push(restaurant);
      }
    }
    return rows;
  }, [allRestaurantsQuery.data?.pages]);
  const allRestaurantsTotal = allRestaurantsQuery.data?.pages[0]?.total ?? 0;
  const notificationsSummaryQuery = useCustomerNotificationsQuery(isHomeFocused);
  const unreadNotificationCount =
    notificationsSummaryQuery.data?.unreadCount ?? 0;
  const toggleFavoriteMutation = useCustomerToggleFavoriteRestaurantMutation();

  const nearbyRestaurants = useMemo(
    () => homeQuery.data?.nearbyRestaurants ?? [],
    [homeQuery.data?.nearbyRestaurants],
  );
  const homeFeed = homeQuery.data;
  // Section header → full list ("See all") on its own screen.
  const openCollection = (kind: "featured" | "offers" | "popular", title?: string, subtitle?: string) =>
    router.push({ pathname: "/collection/[kind]", params: { kind, title: title ?? "", subtitle: subtitle ?? "" } });
  const homeBanner = !isSearching ? (homeFeed?.homeBanner ?? null) : null;
  const homeCms = !isSearching ? (homeFeed?.homeCms ?? null) : null;
  // Admin: where the "Order again" rail sits (default: before the top sections).
  const orderAgainPlacement = homeCms?.orderAgainSection?.placement ?? "before_top_sections";
  const homeOfferStrip = homeCms?.offerStrip;

  // The active poll (a standalone record) the backend says to show now — already excludes
  // closed / past-deadline polls. We show it as a modal until this device has voted.
  const activePoll = !isSearching ? (homeFeed?.activePoll ?? null) : null;
  const activePollId = activePoll?.pollId ?? "";
  const [hasVotedActivePoll, setHasVotedActivePoll] = useState(false);
  useEffect(() => {
    let active = true;
    if (!activePollId) {
      setHasVotedActivePoll(false);
      return;
    }
    void hasVotedPoll(activePollId).then((voted) => {
      if (active) setHasVotedActivePoll(voted);
    });
    return () => {
      active = false;
    };
  }, [activePollId]);
  const shouldShowPoll = Boolean(activePoll) && !hasVotedActivePoll;
  const restaurantSections = homeCms?.restaurantSections;
  // Admin-picked colour theme for the offer cards.
  const offerTheme = resolvePanelTheme(homeCms?.offerPanelTheme);
  const featuredSectionConfig = restaurantSections?.featured;
  const offersSectionConfig = restaurantSections?.offers;
  const discoverNewSectionConfig = restaurantSections?.discoverNew;
  const popularNearYouSectionConfig = restaurantSections?.popularNearYou;
  const nearbySectionConfig = restaurantSections?.nearby;
  const featuredSectionText = getHomeRestaurantSectionText(
    featuredSectionConfig,
    "Featured restaurants",
    "Featured picks for you",
  );
  const offersSectionText = getHomeRestaurantSectionText(
    offersSectionConfig,
    "Offers for you",
    "Places with deals you can use today.",
  );
  const discoverNewSectionText = getHomeRestaurantSectionText(
    discoverNewSectionConfig,
    "Discover new places",
    "Fresh restaurants you may not have tried yet.",
  );
  const popularNearYouSectionText = getHomeRestaurantSectionText(
    popularNearYouSectionConfig,
    "Popular restaurants",
    "Most ordered and top rated places on Foodbela.",
  );
  const activeOffers = useMemo(
    () => (!isSearching ? (homeFeed?.activeOffers ?? []) : []),
    [homeFeed?.activeOffers, isSearching],
  );
  const homeCategoryItems = useMemo(() => {
    const cmsItems = (homeCms?.homeCategories?.items ?? [])
      .filter((item) => item.isActive !== false && item.label.trim())
      .sort((left, right) => (left.position ?? 0) - (right.position ?? 0));

    return normalizeFoodCategorySuggestions(cmsItems);
  }, [homeCms?.homeCategories?.items]);
  const homeCategoryPreviewItems = useMemo(
    () => homeCategoryItems.slice(0, 6),
    [homeCategoryItems],
  );
  const canToggleHomeCategories = homeCategoryItems.length > 6;
  // Size the category cards from the measured row width so ~4.6 fit — 4 full plus a clear
  // peek of the next — making it obvious the row scrolls horizontally (a full-width fit
  // read as a static grid). Falls back to a sensible width before the first layout.
  const [homeCategoryRowWidth, setHomeCategoryRowWidth] = useState(0);
  const homeCategoryCardWidth =
    homeCategoryRowWidth > 0
      ? Math.max(60, Math.round(homeCategoryRowWidth / 4.4) - 11)
      : 66;
  const shouldShowVoucherStrip =
    !isSearching &&
    Boolean(homeOfferStrip && homeOfferStrip.showVoucherStrip !== false);
  const shouldShowHomePromoBlock =
    !isSearching && hasRenderableHomePromoBlock(homeCms);
  const shouldShowRestaurantOfferSection =
    !isSearching &&
    Boolean(
      homeOfferStrip && homeOfferStrip.showRestaurantOfferSection !== false,
    ) &&
    isHomeRestaurantSectionActive(offersSectionConfig);
  const shouldShowNearbyRestaurantSection =
    !isSearching && isHomeRestaurantSectionActive(nearbySectionConfig);
  // The voucher strip shows ONLY single-restaurant offers (each chip maps to exactly one
  // restaurant, so tapping it opens that restaurant). Platform/area-wide and multi-
  // restaurant offers live in the CMS carousel instead.
  const stripOffers = useMemo(
    () =>
      shouldShowVoucherStrip
        ? activeOffers.filter(
            (offer) =>
              offer.scopeType === "restaurant" && Boolean(offer.restaurantId),
          )
        : [],
    [activeOffers, shouldShowVoucherStrip],
  );
  const offerLabelByRestaurantId = useMemo(
    () => buildRestaurantOfferMap(activeOffers),
    [activeOffers],
  );
  const favoriteRestaurantIdsSet = useMemo(
    () => new Set(favoriteRestaurantIdsQuery.data ?? []),
    [favoriteRestaurantIdsQuery.data],
  );
  const favoritePendingRestaurantId = toggleFavoriteMutation.isPending
    ? toggleFavoriteMutation.variables
    : null;
  const singleHorizontalCardStyle = useMemo<StyleProp<ViewStyle>>(
    () => ({
      width: Math.max(286, screenWidth - 40),
    }),
    [screenWidth],
  );

  const featuredRestaurants = useMemo(() => {
    if (isSearching) return [];
    if (!selectedLocation) return [];
    if (!isHomeRestaurantSectionActive(featuredSectionConfig)) return [];
    const homeFeatured = homeFeed?.featuredRestaurants ?? [];
    const nearbyFeatured = nearbyRestaurants.filter(
      (restaurant) => isFeaturedRestaurant(restaurant),
    );

    return openFirst((homeFeatured.length ? homeFeatured : nearbyFeatured).slice(
      0,
      getHomeRestaurantSectionLimit(featuredSectionConfig, 6),
    ));
  }, [
    featuredSectionConfig,
    homeFeed?.featuredRestaurants,
    isSearching,
    nearbyRestaurants,
    selectedLocation,
  ]);

  const offerRestaurants = useMemo(() => {
    if (!selectedLocation) return [];
    if (!shouldShowRestaurantOfferSection) return [];
    return openFirst((homeFeed?.restaurantsWithOffers ?? []).slice(
      0,
      getHomeRestaurantSectionLimit(offersSectionConfig, 8),
    ));
  }, [
    homeFeed?.restaurantsWithOffers,
    offersSectionConfig,
    selectedLocation,
    shouldShowRestaurantOfferSection,
  ]);
  const discoverNewRestaurants = useMemo(() => {
    if (isSearching || !isHomeRestaurantSectionActive(discoverNewSectionConfig)) {
      return [];
    }
    if (!selectedLocation) return [];
    return openFirst((homeFeed?.discoverNewRestaurants ?? []).slice(
      0,
      getHomeRestaurantSectionLimit(discoverNewSectionConfig, 6),
    ));
  }, [
    discoverNewSectionConfig,
    homeFeed?.discoverNewRestaurants,
    isSearching,
    selectedLocation,
  ]);
  const popularNearYouRestaurants = useMemo(() => {
    if (
      isSearching ||
      !isHomeRestaurantSectionActive(popularNearYouSectionConfig)
    ) {
      return [];
    }
    if (!selectedLocation) return [];
    return openFirst((homeFeed?.popularNearYouRestaurants ?? []).slice(
      0,
      getHomeRestaurantSectionLimit(popularNearYouSectionConfig, 6),
    ));
  }, [
    homeFeed?.popularNearYouRestaurants,
    isSearching,
    popularNearYouSectionConfig,
    selectedLocation,
  ]);
  const timeBasedSectionData = !isSearching
    ? (homeFeed?.timeBasedSection ?? null)
    : null;
  const timeBasedRestaurants = useMemo(() => {
    if (isSearching || !selectedLocation) return [];
    if (!timeBasedSectionData || timeBasedSectionData.isActive === false) {
      return [];
    }
    return openFirst(timeBasedSectionData.restaurants ?? []);
  }, [isSearching, selectedLocation, timeBasedSectionData]);
  const shouldShowTimeBasedSection = timeBasedRestaurants.length > 0;
  const timeSectionAccent = timeBasedSectionData?.accentColor || palette.secondary;
  // Admin-controlled: does the time-based rail sit above or below the Featured row? (default above)
  const topSectionOrder = getTopSectionOrder(homeCms?.topSectionOrder);

  const nearbyRestaurantsForSection = useMemo(() => {
    if (!isHomeRestaurantSectionActive(nearbySectionConfig)) return [];
    // "Nearby" means literally the closest restaurants — show them as-is (nearest first, from the
    // backend), independent of what the other sections show. Intentionally NOT de-duplicated
    // against Featured/Offers/Discover/Popular: a restaurant can be both featured AND nearby, and
    // the nearest ones must never get consumed by an upper section and vanish from here.
    return nearbyRestaurants.slice(
      0,
      getHomeRestaurantSectionLimit(nearbySectionConfig, 8),
    );
  }, [nearbyRestaurants, nearbySectionConfig]);

  const shouldShowHomeFeedSkeleton =
    !isSearching && homeQuery.isLoading && !homeFeed;
  const shouldShowSearchSkeleton =
    isSearching &&
    Boolean(selectedLocation) &&
    homeQuery.isLoading &&
    nearbyRestaurants.length === 0;
  const shouldShowNearbySkeleton =
    !isSearching &&
    Boolean(selectedLocation) &&
    homeQuery.isLoading &&
    nearbyRestaurants.length === 0;

  const bannerTone = getBannerToneStyle(homeBanner?.tone ?? null);
  const isUpdatingLocationResults = Boolean(
    isHomeFocused &&
    pendingLocationUpdateKey &&
    selectedLocation &&
    isOnline &&
    !isRefreshing &&
    !isSearching &&
    homeQuery.isFetching,
  );
  const hasCompletedCustomerOrder =
    orderPresenceQuery.data?.hasCompletedOrders === true;
  const isOrderPresenceResolved =
    !isCustomerAuthenticated ||
    orderPresenceQuery.isSuccess ||
    orderPresenceQuery.isError;
  const shouldShowHowToOrderGuide =
    Boolean(homeCms) &&
    !isSearching &&
    homeCms?.howToOrderGuide?.isActive !== false &&
    isOrderPresenceResolved &&
    !hasCompletedCustomerOrder;
  const shouldHoldNearbyEmptyState =
    !isSearching &&
    Boolean(selectedLocation) &&
    nearbyRestaurantsForSection.length === 0 &&
    !homeQuery.isError &&
    (!homeQuery.isSuccess ||
      homeQuery.isFetching ||
      isUpdatingLocationResults);
  const shimmerTranslateX = useHomeShimmer(
    isHomeFocused &&
      (shouldShowHomeFeedSkeleton ||
        shouldShowSearchSkeleton ||
        shouldShowNearbySkeleton ||
        isUpdatingLocationResults ||
        shouldHoldNearbyEmptyState),
  );

  useEffect(() => {
    if (!locationKey) {
      previousLocationKeyRef.current = "";
      setPendingLocationUpdateKey("");
      return;
    }

    const previousLocationKey = previousLocationKeyRef.current;
    if (previousLocationKey && previousLocationKey !== locationKey) {
      setPendingLocationUpdateKey(locationKey);
    }
    previousLocationKeyRef.current = locationKey;
  }, [locationKey]);

  useEffect(() => {
    if (!pendingLocationUpdateKey) {
      return;
    }

    if (!isOnline) {
      setPendingLocationUpdateKey("");
      return;
    }

    if (!homeQuery.isFetching) {
      setPendingLocationUpdateKey("");
    }
  }, [
    homeQuery.isFetching,
    isOnline,
    pendingLocationUpdateKey,
  ]);

  useEffect(() => {
    if (!homeOfferStrip) return;
    if (shouldShowVoucherStrip && stripOffers.length > 0) {
      recordHomeCmsEvent("strip_impression");
    }
    if (shouldShowHomePromoBlock) {
      recordHomeCmsEvent("block_impression");
    }
  }, [
    homeOfferStrip,
    shouldShowHomePromoBlock,
    shouldShowVoucherStrip,
    stripOffers.length,
  ]);

  useEffect(() => {
    if (!isHomeFocused || isSearching) return;
    // Show at most one modal per session. An un-voted active poll takes priority over the
    // promo modal. `homeCmsModalShown` stops it re-popping after the user closes it — the
    // vote itself is remembered on-device so it won't return in future sessions either.
    const pollWant = shouldShowPoll && !homeCmsModalShown;
    const promoWant =
      Boolean(homeCms?.modal.isActive) &&
      !(homeCms?.modal.frequency === "once_per_session" && homeCmsModalShown);
    if (!pollWant && !promoWant) return;
    const delaySeconds = pollWant
      ? 2
      : Math.max(homeCms?.modal.delaySeconds ?? 0, 0);
    const timer = setTimeout(() => {
      setShowHomeCmsModal(true);
      setHomeCmsModalShown(true);
      if (!pollWant) recordHomeCmsEvent("modal_impression");
    }, delaySeconds * 1000);

    return () => clearTimeout(timer);
  }, [
    homeCms?.modal.delaySeconds,
    homeCms?.modal.frequency,
    homeCms?.modal.isActive,
    homeCmsModalShown,
    shouldShowPoll,
    isHomeFocused,
    isSearching,
  ]);

  useEffect(() => {
    if (!isHomeFocused) return;

    const query = searchQuery.trim();
    if (query.length < 2) return;

    const timer = setTimeout(() => {
      const resultCount = nearbyRestaurants.length;
      const trackingKey = `${query.toLowerCase()}|${resultCount}`;
      if (lastTrackedSearchRef.current === trackingKey) return;
      lastTrackedSearchRef.current = trackingKey;

      void trackCustomerEvent({
        eventType: "search",
        path: "/(tabs)",
        screenName: "home",
        metadata: {
          query: query.slice(0, 80),
          scope: "restaurant_discovery",
          resultCount,
          hasResults: resultCount > 0,
        },
      });
    }, 700);

    return () => clearTimeout(timer);
  }, [isHomeFocused, nearbyRestaurants.length, searchQuery]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const refreshJobs: Promise<unknown>[] = [
        homeQuery.refetch(),
        // Separate paged query — must refresh with the feed, or its cards keep a stale
        // open/closed state while Featured shows the new one.
        allRestaurantsQuery.refetch(),
        favoriteRestaurantIdsQuery.refetch(),
      ];
      if (isCustomerAuthenticated) {
        refreshJobs.push(orderPresenceQuery.refetch());
      }
      await Promise.all(refreshJobs);
    } finally {
      setIsRefreshing(false);
    }
  };

  const goToRestaurant = (
    restaurant: DiscoverableRestaurant,
    source = "home",
  ) => {
    addRecentVisitedRestaurant({
      id: restaurant._id,
      name: restaurant.name,
      subtitle: mapRestaurantCardSubtitle(restaurant),
      imageUrl: restaurant.coverImage?.url || restaurant.logo?.url || null,
      isOpen: restaurant.isOpen !== false,
      offerLabel: offerLabelByRestaurantId.get(restaurant._id) ?? null,
      distanceKm: restaurant.distanceKm,
      avgRating: restaurant.avgRating,
      reviewCount: restaurant.reviewCount,
      lowestMenuPrice: restaurant.lowestMenuPrice,
      preparationTimeMinutes: restaurant.preparationTimeMinutes,
    });

    router.push({
      pathname: "/restaurants/[restaurantId]",
      params: { restaurantId: restaurant._id, source },
    });
  };

  const handleToggleFavorite = async (restaurantId: string) => {
    // Read auth freshly (not via closure) so the memoized cards — which ignore handler
    // identity — never act on a stale signed-out value after the user signs in.
    if (!useCustomerAuthStore.getState().accessToken) {
      router.push({
        pathname: "/sign-in",
        params: { redirectTo: "/(tabs)" },
      });
      return;
    }

    if (favoritePendingRestaurantId === restaurantId) {
      return;
    }

    try {
      await toggleFavoriteMutation.mutateAsync(restaurantId);
    } catch {
      return;
    }
  };

  const openLocationPicker = () => {
    router.push("/location-picker");
  };

  const openSearchScreen = (query?: string) => {
    router.push({
      pathname: "/search",
      params: query?.trim() ? { query: query.trim() } : { focus: "1" },
    });
  };

  const handleMissingLocationPress = () => {
    if (permissionGranted === false) {
      void openLocationPermissionSettings();
      return;
    }

    openLocationPicker();
  };

  const canOpenCustomerTarget = (target?: string | null) =>
    Boolean(
      resolveCustomerRoute(target, null) ||
      (target?.trim() ? isExternalHttpUrl(target) : false),
    );

  const openCustomerTarget = async (target?: string | null) => {
    const safeRoute = resolveCustomerRoute(target, null);
    if (safeRoute) {
      router.push(withRestaurantViewSource(safeRoute, "promo") as never);
      return;
    }

    const externalUrl = target?.trim() ?? "";
    if (isExternalHttpUrl(externalUrl)) {
      await Linking.openURL(externalUrl);
    }
  };

  const insets = useSafeAreaInsets();
  const closedStickyRevealRef = useRef(Number.POSITIVE_INFINITY);
  const closedStickyShownRef = useRef(false);
  const [closedStickyVisible, setClosedStickyVisible] = useState(false);
  const homeScrollY = useRef(new Animated.Value(0)).current;
  const [topZoneHeight, setTopZoneHeight] = useState(0);
  const [searchDockY, setSearchDockY] = useState(0);
  const [stickySearchVisible, setStickySearchVisible] = useState(false);
  const stickySearchShownRef = useRef(false);

  // Pause the closed-state countdown whenever it can't be seen: another tab focused, or the
  // app backgrounded. Together with the components unmounting while the area is OPEN, the
  // timer only ever ticks when someone is actually looking at the closed home.
  const [isAppActive, setIsAppActive] = useState(
    () => AppState.currentState === "active",
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) =>
      setIsAppActive(state === "active"),
    );
    return () => sub.remove();
  }, []);
  const closedTimerActive = isHomeFocused && isAppActive;

  const areaWindow = !isSearching ? (homeFeed?.areaServiceWindow ?? null) : null;
  // Only trust an area-CLOSED window once we actually know the user's location. On a fresh
  // install the first home fetch has no selectedLocation yet, so the backend falls back to the
  // global "All areas" window — never render that as the user's area status, or a wrong
  // "your area is closed" hero flashes before the located refetch corrects it. (The backend
  // guards this too by reporting open when it has no coordinates; this is belt-and-suspenders.)
  const hasResolvedLocation =
    typeof selectedLocation?.latitude === "number" &&
    typeof selectedLocation?.longitude === "number";
  const isAreaClosed = hasResolvedLocation && areaWindow?.isOpen === false;
  // Area is confirmed OPEN — lets the closing-soon urgency banner mount. It self-gates on the
  // 30-min window, so mounting it here whenever the area is open is safe + near-free until then.
  const isAreaOpen = hasResolvedLocation && areaWindow?.isOpen === true;
  // When the area's service window opens, auto-refetch the home feed so restaurants flip
  // from closed to open on their own — no manual pull-to-refresh or app restart needed.
  useReopenAutoRefresh(isAreaClosed ? areaWindow?.opensAtEpochMs : null, () => {
    void homeQuery.refetch();
    void allRestaurantsQuery.refetch();
  });
  // ...and the mirror: when the window CLOSES, auto-refetch so the area flips open→closed on its
  // own and the "Opens in …" countdown starts right away (no stale "open" hanging around).
  useCloseAutoRefresh(isAreaOpen ? areaWindow?.closesAtEpochMs : null, () => {
    void homeQuery.refetch();
    // "All restaurants" is its own paged query — refetch it too, or its cards keep the
    // pre-close "open" state.
    void allRestaurantsQuery.refetch();
  });

  // While Foodbela is closed in the user's area, EVERY home card shows closed — even rows
  // fetched before the close or still cached — with the area's reopen time.
  // Home shows the same restaurant in several lists that come from DIFFERENT queries (the
  // home feed vs the paged "All restaurants"). Whichever was fetched most recently wins, so
  // a restaurant can never read "open" in Featured and "closed" in All at the same time.
  const freshestAvailabilityById = useMemo(() => {
    const map = new Map<string, Pick<DiscoverableRestaurant, "isOpen" | "availability">>();
    const homeAt = homeQuery.dataUpdatedAt;
    const listAt = allRestaurantsQuery.dataUpdatedAt;
    const feedLists = homeFeed
      ? [
          homeFeed.nearbyRestaurants,
          homeFeed.featuredRestaurants,
          homeFeed.popularNearYouRestaurants,
          homeFeed.discoverNewRestaurants,
          homeFeed.restaurantsWithOffers,
        ]
      : [];
    const sources =
      homeAt >= listAt ? [allRestaurants, ...feedLists] : [...feedLists, allRestaurants];
    for (const list of sources) {
      for (const restaurant of list ?? []) {
        map.set(restaurant._id, { isOpen: restaurant.isOpen, availability: restaurant.availability });
      }
    }
    return map;
  }, [allRestaurants, allRestaurantsQuery.dataUpdatedAt, homeFeed, homeQuery.dataUpdatedAt]);

  const cardIsOpen = (restaurant: DiscoverableRestaurant) =>
    !isAreaClosed &&
    (freshestAvailabilityById.get(restaurant._id)?.isOpen ?? restaurant.isOpen) !== false;
  const cardAvailability = (restaurant: DiscoverableRestaurant) => {
    const own = freshestAvailabilityById.get(restaurant._id)?.availability ?? restaurant.availability;
    if (!(isAreaClosed && areaWindow)) return own;
    // Area closed: the card reopens at the LATER of the area reopen and the restaurant's
    // own next opening (some restaurants open after Foodbela does, e.g. 2 PM vs 12 PM).
    const ownOpensAt = own?.opensAtEpochMs ?? null;
    const areaOpensAt = areaWindow.opensAtEpochMs ?? null;
    const useOwn =
      typeof ownOpensAt === "number" && (typeof areaOpensAt !== "number" || ownOpensAt > areaOpensAt);
    return {
      isOpen: false,
      closedReason: "service_window" as const,
      opensAtLabel: useOwn ? (own?.opensAtLabel ?? areaWindow.opensAtLabel) : areaWindow.opensAtLabel,
      opensAtEpochMs: useOwn ? ownOpensAt : areaOpensAt,
    };
  };

  // Whenever the home feed is refreshed (pull, focus, auto open/close), mark every other
  // restaurant list stale too — the visible ones refetch now, Favourites/Search on next view.
  const lastHomeUpdateRef = useRef(0);
  useEffect(() => {
    const at = homeQuery.dataUpdatedAt;
    if (lastHomeUpdateRef.current && at > lastHomeUpdateRef.current) {
      void queryClient.invalidateQueries({ queryKey: ["customer", "restaurant-discovery-pages"] });
      void queryClient.invalidateQueries({ queryKey: ["customer", "favorite-restaurants"] });
    }
    lastHomeUpdateRef.current = at;
  }, [homeQuery.dataUpdatedAt, queryClient]);

  // Reveal the slim sticky "Foodbela closed" pill once the in-flow closed hero has scrolled
  // up under the top. onLayout hands us the hero's offset in the scroll content; we flip a
  // boolean only when the threshold is crossed (not every scroll frame).
  const handleClosedHeroLayout = (event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    closedStickyRevealRef.current = y + height * 0.55;
  };

  const handleHomeScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    const offsetY = contentOffset.y;
    const shouldShow = isAreaClosed && offsetY >= closedStickyRevealRef.current;
    if (shouldShow !== closedStickyShownRef.current) {
      closedStickyShownRef.current = shouldShow;
      setClosedStickyVisible(shouldShow);
    }
    // Search pins to the top once the in-flow search pill reaches the status bar.
    const shouldStick =
      searchDockY > 0 && offsetY >= searchDockY - insets.top - 8;
    if (shouldStick !== stickySearchShownRef.current) {
      stickySearchShownRef.current = shouldStick;
      setStickySearchVisible(shouldStick);
    }
    // Scroll-to-load the next page of "All restaurants" a screen before the end.
    if (
      layoutMeasurement.height + offsetY >= contentSize.height - 900 &&
      allRestaurantsQuery.hasNextPage &&
      !allRestaurantsQuery.isFetchingNextPage
    ) {
      void allRestaurantsQuery.fetchNextPage();
    }
  };
  const homeScrollHandlerRef = useRef(handleHomeScroll);
  // Live scroll offset — the Bela pull only starts when the list is at the very top.
  const homeScrollYRef = useRef(0);
  homeScrollHandlerRef.current = handleHomeScroll;
  const onHomeScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: homeScrollY } } }], {
        useNativeDriver: true,
        listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
          homeScrollYRef.current = event.nativeEvent.contentOffset.y;
          homeScrollHandlerRef.current(event);
        },
      }),
    [homeScrollY],
  );

  // Parallax + fade for the top zone, and a fade-in for the pinned search bar.
  const topZoneTravel = Math.max(1, topZoneHeight);
  const topZoneTranslateY = homeScrollY.interpolate({
    inputRange: [0, topZoneTravel],
    outputRange: [0, topZoneTravel * 0.45],
    extrapolate: "clamp",
  });
  const topZoneOpacity = homeScrollY.interpolate({
    inputRange: [0, topZoneTravel * 0.7],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });
  const stickyThreshold = Math.max(24, searchDockY - insets.top - 8);
  const stickySearchOpacity = homeScrollY.interpolate({
    inputRange: [stickyThreshold - 20, stickyThreshold],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const heroCarousel = homeCms?.heroCarousel;
  // Closed card (admin can hide it / its button per area). Once the reminder is set the big
  // card collapses to a one-line strip — it has done its job.
  const showClosedCard = homeCms?.closedNotice?.enabled !== false;
  const showNotifyButton = homeCms?.closedNotice?.notifyButton !== false;
  const openNotify = useOpenNotify(Boolean(isAreaClosed) && showClosedCard && showNotifyButton);
  const showHeroCarousel = Boolean(
    heroCarousel?.enabled && heroCarousel.slides?.length,
  );
  // First load: we don't know yet whether there is a carousel — hold its space with a
  // shimmer instead of flashing the "What are you craving?" fallback.
  const heroPending = !isSearching && !homeFeed && homeQuery.isFetching;
  const heroMedia = (showHeroCarousel && Boolean(heroCarousel)) || heroPending;
  // "Deliver to" + bell colours follow the slide on screen (admin-picked per slide).
  const [heroOverlayColor, setHeroOverlayColor] = useState("");
  const handleHeroSlideChange = useCallback(
    (slide: CustomerHomeHeroSlide | null) => setHeroOverlayColor(slide?.overlayTextColor ?? ""),
    [],
  );
  const overlay = useMemo(() => heroOverlayTheme(heroOverlayColor), [heroOverlayColor]);
  const overlayText = { color: overlay.text, textShadowColor: overlay.shadow };
  const overlaySubText = { color: overlay.subText, textShadowColor: overlay.shadow };
  const overlayGlass = { backgroundColor: overlay.glassBg, borderColor: overlay.glassBorder };
  const handlePressHeroSlide = (slide: CustomerHomeHeroSlide, index: number) => {
    if (!slide.linkEnabled || !slide.ctaPath?.trim()) return;
    void trackCustomerEvent({
      eventType: "custom",
      path: "/(tabs)",
      screenName: "home",
      metadata: {
        action: "hero_slide_click",
        slideId: slide.id,
        position: index + 1,
        ctaPath: slide.ctaPath,
      },
    });
    void openCustomerTarget(slide.ctaPath);
  };
  // Media top zone height: status bar + the admin banner shape across the full width.
  const heroZoneHeight =
    insets.top +
    44 +
    Math.round(
      screenWidth * (HERO_ASPECT_RATIO[heroCarousel?.aspectRatio ?? "16:9"] ?? 9 / 16),
    );
  // "Area, District" — never a Plus code (e.g. 8RQ2+X5), always with the district.
  const deliverToText = formatDeliverToLine(selectedLocation);
  const renderSearchPill = (variant: "dock" | "sticky") => (
    <PressableScale
      containerStyle={styles.searchPillSlot}
      style={[styles.searchPill, variant === "sticky" ? styles.searchPillSticky : null]}
      scaleTo={0.98}
      onPress={() => openSearchScreen()}
      accessibilityRole="button"
      accessibilityLabel="Search food or restaurant"
    >
      <View style={styles.searchPillIcon}>
        <Ionicons name="search" size={17} color={palette.onPrimary} />
      </View>
      <RotatingSearchPlaceholder
        active={isHomeFocused && !isSearching && (variant === "sticky") === stickySearchVisible}
        style={styles.searchPillText}
      />
    </PressableScale>
  );

  return (
    <View style={styles.screen}>
      <BelaPullToRefresh
        refreshing={isRefreshing}
        onRefresh={() => void handleRefresh()}
        scrollYRef={homeScrollYRef}
        topOffset={insets.top + 4}
      >
      <Animated.ScrollView
        onScroll={onHomeScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        // Bela draws the pull — no iOS bounce / Android glow fighting it.
        bounces={false}
        overScrollMode="never"
      >
        {/* Amber top zone: "Deliver to" + bell, then the admin hero carousel. It drifts
            slower than the content (parallax) and fades out as the search pins on top. */}
        {heroMedia ? (
          // The GIF IS the top zone: edge to edge, under the status bar, rounded bottom.
          // "Deliver to" + bell float on it; parallax + fade as the search pins on top.
          // While the home feed is still loading, the same zone shows a shimmer, so the
          // "What are you craving?" fallback never flashes before the GIF appears.
          <View
            style={[styles.topZone, styles.topZoneMedia, { height: heroZoneHeight }]}
            onLayout={(event) => setTopZoneHeight(event.nativeEvent.layout.height)}
          >
            <Animated.View
              style={[
                styles.topZoneMediaLayer,
                {
                  opacity: topZoneOpacity,
                  transform: [{ translateY: topZoneTranslateY }],
                },
              ]}
            >
              {showHeroCarousel && heroCarousel ? (
                <HomeHeroCarousel
                  carousel={heroCarousel}
                  width={screenWidth}
                  height={heroZoneHeight}
                  active={isHomeFocused && !stickySearchVisible}
                  onPressSlide={handlePressHeroSlide}
                  onActiveSlideChange={handleHeroSlideChange}
                />
              ) : (
                <View style={{ width: screenWidth, height: heroZoneHeight }}>
                  <SharedShimmerBlock
                    style={{ width: screenWidth, height: heroZoneHeight, borderRadius: 0 }}
                  />
                  <View style={[styles.heroSkeletonDots, { bottom: 14 }]} pointerEvents="none">
                    <View style={[styles.heroSkeletonDot, styles.heroSkeletonDotActive]} />
                    <View style={styles.heroSkeletonDot} />
                    <View style={styles.heroSkeletonDot} />
                  </View>
                </View>
              )}
            </Animated.View>
            <Animated.View
              pointerEvents="box-none"
              style={[
                styles.topBarOverlay,
                { top: insets.top + 8, opacity: topZoneOpacity },
              ]}
            >
              <View style={styles.topBar}>
                <PressableScale
                  onPress={openLocationPicker}
                  scaleTo={0.97}
                  containerStyle={styles.topBarAddressSlot}
                  style={[
                    styles.topBarAddress,
                    heroMedia ? styles.topBarAddressOnMedia : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Deliver to ${deliverToText}. Change location`}
                >
                  <View style={[styles.topBarPinTile, overlayGlass]}>
                    <Ionicons name="location" size={18} color={overlay.text} />
                  </View>
                  <View style={styles.topBarAddressCopy}>
                    <View style={styles.topBarLabelRow}>
                      <Text style={[styles.topBarLabel, overlayText]}>Deliver to</Text>
                      <Ionicons name="chevron-down" size={13} color={overlay.text} />
                    </View>
                    <Text numberOfLines={1} style={[styles.topBarAddressText, overlaySubText]}>
                      {deliverToText}
                    </Text>
                  </View>
                </PressableScale>
                <HomeRewardsChip active={isHomeFocused} onPress={() => router.push("/rewards" as never)} />
                <PressableScale
                  onPress={() => router.push("/notifications")}
                  scaleTo={0.92}
                  style={[
                    styles.topBarBell,
                    heroMedia ? styles.topBarBellOnMedia : null,
                    heroMedia ? overlayGlass : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={
                    unreadNotificationCount > 0
                      ? `Notifications, ${unreadNotificationCount} unread`
                      : "Notifications"
                  }
                >
                  <Ionicons name="notifications-outline" size={21} color={overlay.text} />
                  {unreadNotificationCount > 0 ? (
                    <View style={styles.bellBadge}>
                      <Text style={styles.bellBadgeText}>
                        {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
                      </Text>
                    </View>
                  ) : null}
                </PressableScale>
              </View>
            </Animated.View>
          </View>
        ) : (
          <View
            style={[styles.topZone, { paddingTop: insets.top + 8 }]}
            onLayout={(event) => setTopZoneHeight(event.nativeEvent.layout.height)}
          >
            <View style={styles.topZoneGlowA} />
            <View style={styles.topZoneGlowB} />
            <Animated.View
              style={{
                opacity: topZoneOpacity,
                transform: [{ translateY: topZoneTranslateY }],
              }}
            >
            <View style={styles.topBar}>
              <PressableScale
                onPress={openLocationPicker}
                scaleTo={0.97}
                containerStyle={styles.topBarAddressSlot}
                style={[
                  styles.topBarAddress,
                  showHeroCarousel ? styles.topBarAddressOnMedia : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Deliver to ${deliverToText}. Change location`}
              >
                <View style={styles.topBarPinTile}>
                  <Ionicons name="location" size={18} color={palette.onPrimary} />
                </View>
                <View style={styles.topBarAddressCopy}>
                  <View style={styles.topBarLabelRow}>
                    <Text style={styles.topBarLabel}>Deliver to</Text>
                    <Ionicons name="chevron-down" size={13} color={palette.onPrimary} />
                  </View>
                  <Text numberOfLines={1} style={styles.topBarAddressText}>
                    {deliverToText}
                  </Text>
                </View>
              </PressableScale>
              <HomeRewardsChip active={isHomeFocused} onPress={() => router.push("/rewards" as never)} />
              <PressableScale
                onPress={() => router.push("/notifications")}
                scaleTo={0.92}
                style={[
                  styles.topBarBell,
                  showHeroCarousel ? styles.topBarBellOnMedia : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel={
                  unreadNotificationCount > 0
                    ? `Notifications, ${unreadNotificationCount} unread`
                    : "Notifications"
                }
              >
                <Ionicons name="notifications-outline" size={21} color={palette.onPrimary} />
                {unreadNotificationCount > 0 ? (
                  <View style={styles.bellBadge}>
                    <Text style={styles.bellBadgeText}>
                      {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
                    </Text>
                  </View>
                ) : null}
              </PressableScale>
            </View>
              <View style={styles.topZoneGreeting}>
                <Text style={styles.topZoneGreetingTitle}>What are you craving?</Text>
                <Text style={styles.topZoneGreetingSubtitle}>
                  Hot food from places near you, delivered fast.
                </Text>
              </View>
            </Animated.View>
          </View>
        )}

        <View
          style={styles.searchDock}
          onLayout={(event) => setSearchDockY(event.nativeEvent.layout.y)}
        >
          {renderSearchPill("dock")}
        </View>

        <View style={styles.hero}>
          {!isSearching ? (
            <HomeDealsSection
              section={homeFeed?.dealsSection}
              theme={offerTheme}
            />
          ) : null}

          <View style={styles.searchCategoryPanel}>
            {!isSearching &&
            homeCms?.homeCategories?.isActive !== false &&
            homeCategoryPreviewItems.length > 0 ? (
              <View style={styles.homeCategoryBlock}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.homeCategoryRow}
                  onLayout={(event) =>
                    setHomeCategoryRowWidth(event.nativeEvent.layout.width)
                  }
                >
                  {homeCategoryPreviewItems.map((item, index) => (
                    <PressableScale
                      key={item.id || `${item.label}-${index}`}
                      style={[
                        styles.homeCategoryCard,
                        { width: homeCategoryCardWidth },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.label} category`}
                      onPress={() =>
                        openSearchScreen(item.searchQuery || item.label)
                      }
                    >
                      <View
                        style={[
                          styles.homeCategoryImageWrap,
                          index === 0
                            ? styles.homeCategoryImageWrapFeatured
                            : null,
                        ]}
                      >
                        <RemoteImage
                          uri={item.imageUrl}
                          style={[
                            styles.homeCategoryImage,
                            {
                              borderColor:
                                CATEGORY_TINTS[index % CATEGORY_TINTS.length],
                              borderWidth: 2,
                            },
                          ]}
                          fallbackIcon={
                            (item.icon ||
                              "restaurant-outline") as keyof typeof Ionicons.glyphMap
                          }
                          fallbackIconSize={21}
                          fallbackTint={palette.secondary}
                          fallbackBackground={item.color || "#FFF6E8"}
                          targetWidth={120}
                          accessibilityLabel={`${item.label} category`}
                        />
                      </View>
                      <Text
                        style={styles.homeCategoryName}
                        numberOfLines={1}
                      >
                        {item.label}
                      </Text>
                    </PressableScale>
                  ))}
                  {canToggleHomeCategories ? (
                    <PressableScale
                      style={[
                        styles.homeCategoryCard,
                        styles.homeCategoryMoreCard,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Show more categories"
                      onPress={() => openSearchScreen()}
                    >
                      {/* Button sits in a 52px slot (same height as the category image
                          tiles) so the "View all" label below lines up with the category
                          names — no manual centring needed. */}
                      <View style={styles.homeCategoryMoreSlot}>
                        <View style={styles.homeCategoryMoreButton}>
                          <Ionicons
                            name="arrow-forward"
                            size={16}
                            color={palette.onPrimary}
                          />
                        </View>
                      </View>
                      <Text
                        style={styles.homeCategoryName}
                        numberOfLines={1}
                      >
                        View all
                      </Text>
                    </PressableScale>
                  ) : null}
                </ScrollView>
              </View>
            ) : shouldShowHomeFeedSkeleton ? (
              <View style={styles.homeCategorySkeletonRow}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <View key={i} style={styles.homeCategoryCard}>
                    <ShimmerBlock
                      translateX={shimmerTranslateX}
                      style={styles.homeCategoryImage}
                    />
                    <ShimmerBlock
                      translateX={shimmerTranslateX}
                      style={styles.homeCategorySkeletonName}
                    />
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          {shouldShowHomeFeedSkeleton ? (
            <HomeHeroSkeleton translateX={shimmerTranslateX} />
          ) : null}

          {isAreaClosed && areaWindow && showClosedCard ? (
            <View
              onLayout={handleClosedHeroLayout}
              style={{ marginTop: 10, marginBottom: 4 }}
            >
              {showNotifyButton && openNotify.subscribed ? (
                <ClosedReminderStrip opensAtLabel={areaWindow.opensAtLabel} />
              ) : (
                <ServiceClosedHero
                  area={areaWindow}
                  showTimer
                  timerActive={closedTimerActive}
                  footer={showNotifyButton ? <NotifyWhenOpenButton /> : undefined}
                />
              )}
            </View>
          ) : null}

          {isAreaOpen && areaWindow ? (
            <ClosingSoonBanner
              closesAtEpochMs={areaWindow.closesAtEpochMs}
              active={closedTimerActive}
            />
          ) : null}

          {homeBanner ? (
            <Pressable
              style={[styles.bannerCard, { backgroundColor: bannerTone.shell }]}
              disabled={!resolveCustomerRoute(homeBanner.ctaPath, null)}
              onPress={() => {
                const path = resolveCustomerRoute(homeBanner.ctaPath, null);
                if (path) {
                  router.push(withRestaurantViewSource(path, "banner") as never);
                }
              }}
            >
              <View style={styles.bannerCopy}>
                <View
                  style={[
                    styles.bannerChip,
                    { backgroundColor: bannerTone.chip },
                  ]}
                >
                  <Ionicons
                    name="sparkles-outline"
                    size={14}
                    color={bannerTone.title}
                  />
                  <Text
                    style={[styles.bannerChipText, { color: bannerTone.title }]}
                  >
                    Featured update
                  </Text>
                </View>
                <Text style={[styles.bannerTitle, { color: bannerTone.title }]}>
                  {homeBanner.title}
                </Text>
                <Text
                  style={[
                    styles.bannerSubtitle,
                    { color: bannerTone.subtitle },
                  ]}
                >
                  {homeBanner.subtitle}
                </Text>
              </View>

              {resolveCustomerRoute(homeBanner.ctaPath, null) ? (
                <View
                  style={[
                    styles.bannerButton,
                    { backgroundColor: bannerTone.button },
                  ]}
                >
                  <Text style={styles.bannerButtonText}>
                    {homeBanner.ctaLabel}
                  </Text>
                  <Ionicons name="arrow-forward" size={15} color="#fff" />
                </View>
              ) : null}
            </Pressable>
          ) : null}

          {!isSearching && shouldShowHomePromoBlock && homeCms ? (
            <HomeCmsPromoBlock cms={homeCms} />
          ) : null}

          {!isSearching && stripOffers.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.offerChipRow}
            >
              {stripOffers.slice(0, 8).map((offer) => (
                <Pressable
                  key={offer._id}
                  style={({ pressed }) => [
                    styles.offerChip,
                    pressed ? { opacity: 0.7 } : null,
                  ]}
                  onPress={() => {
                    recordHomeCmsEvent("strip_click");
                    if (offer.restaurantId) {
                      router.push({
                        pathname: "/restaurants/[restaurantId]",
                        params: {
                          restaurantId: offer.restaurantId,
                          source: "offer_strip",
                        },
                      });
                    }
                  }}
                >
                  <Ionicons name="pricetag-outline" size={14} color="#A86300" />
                  <Text numberOfLines={1} style={styles.offerChipText}>
                    {getOfferLabel(offer)}
                  </Text>
                  <Ionicons name="chevron-forward" size={13} color="#A86300" />
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </View>

        {shouldShowHowToOrderGuide &&
        homeCms &&
        homeCms.howToOrderGuide?.placement !== "before_restaurants" ? (
          <HowToOrderGuideBlock
            cms={homeCms}
            isAnimationActive={isHomeFocused && !isSearching}
          />
        ) : null}

        {isSearching ? (
          <View style={styles.section}>
            <View style={styles.sectionHeaderWrap}>
              <SectionHeader
                plain
                title="Search results"
                subtitle={
                  selectedLocation
                    ? `${nearbyRestaurants.length} places found for "${searchQuery.trim()}"`
                    : "Set your delivery point first, then search nearby places"
                }
              />
            </View>

            {!selectedLocation ? (
              isResolvingLocation ? (
                <RestaurantListSkeleton
                  translateX={shimmerTranslateX}
                  count={3}
                  variant="nearby"
                />
              ) : (
                <EmptyStateCard
                  title={
                    permissionGranted === false
                      ? "Location permission is needed"
                      : "Choose your location first"
                  }
                  description="Set your delivery point so we can show places that deliver to you."
                  actionLabel={
                    permissionGranted === false
                      ? "Allow location"
                      : "Choose location"
                  }
                  onPress={handleMissingLocationPress}
                />
              )
            ) : shouldShowSearchSkeleton ? (
              <RestaurantListSkeleton
                translateX={shimmerTranslateX}
                count={3}
                variant="nearby"
              />
            ) : nearbyRestaurants.length > 0 ? (
              <View style={styles.verticalList}>
                {nearbyRestaurants.map((restaurant) => (
                  <RestaurantHeroCard
                    key={restaurant._id}
                    name={restaurant.name}
                    subtitle={mapRestaurantCardSubtitle(restaurant)}
                    imageUrl={
                      restaurant.coverImage?.url || restaurant.logo?.url || null
                    }
                    isOpen={cardIsOpen(restaurant)}
                    availability={cardAvailability(restaurant)}
                    customBadge={getRestaurantCustomBadge(restaurant)}
                    distanceKm={restaurant.distanceKm}
                    avgRating={restaurant.avgRating}
                    reviewCount={restaurant.reviewCount}
                    offerLabel={offerLabelByRestaurantId.get(restaurant._id)}
                    deliveryFee={restaurant.deliveryFee}
                    preparationTimeMinutes={restaurant.preparationTimeMinutes}
                    isFavorite={favoriteRestaurantIdsSet.has(restaurant._id)}
                    favoriteDisabled={
                      favoritePendingRestaurantId === restaurant._id
                    }
                    variant="nearby"
                    onToggleFavorite={() =>
                      handleToggleFavorite(restaurant._id)
                    }
                    onPress={() => goToRestaurant(restaurant, "search")}
                  />
                ))}
              </View>
            ) : (
              <EmptyStateCard
                title="No food or restaurant found"
                description="Try another food name, cuisine, or restaurant spelling. You can also clear the search and browse nearby places."
              />
            )}
          </View>
        ) : (
          <>
            {shouldShowHowToOrderGuide &&
            homeCms &&
            homeCms.howToOrderGuide?.placement === "before_restaurants" ? (
              <HowToOrderGuideBlock
                cms={homeCms}
                isAnimationActive={isHomeFocused && !isSearching}
              />
            ) : null}

            {/* One-tap reorder from the customer's last delivered orders (signed-in only). */}
            {orderAgainPlacement === "before_top_sections" ? (
              <HomeOrderAgainSection
                enabled={isHomeFocused && !isSearching}
                config={homeCms?.orderAgainSection}
              />
            ) : null}

            {(() => {
              // The 3 "top" sections rendered in the admin-set order (Featured, Live
              // time-based, Offers). Each is built once here, then emitted per the order.
              const timeBasedSectionElement =
                timeBasedSectionData && shouldShowTimeBasedSection ? (
                  <HomeTimeBasedSection
                    data={timeBasedSectionData}
                    restaurants={
                      isAreaClosed
                        ? timeBasedRestaurants.map((restaurant) => ({ ...restaurant, isOpen: false }))
                        : timeBasedRestaurants
                    }
                    accent={timeSectionAccent}
                    onPress={(restaurant) =>
                      goToRestaurant(restaurant, "live_section")
                    }
                  />
                ) : null;

              const featuredSectionElement =
                featuredRestaurants.length > 0 || shouldShowHomeFeedSkeleton ? (
                  <View style={styles.section}>
                    <View style={styles.sectionHeaderWrap}>
                      <SectionHeader
                        plain
                        title={featuredSectionText.title}
                        subtitle={featuredSectionText.subtitle}
                        onSeeAll={() =>
                          openCollection("featured", featuredSectionText.title, featuredSectionText.subtitle)
                        }
                        accentColor="#A86300"
                        emoji={featuredSectionText.emoji}
                      />
                    </View>
                    {shouldShowHomeFeedSkeleton ? (
                      <RestaurantListSkeleton
                        translateX={shimmerTranslateX}
                        horizontal
                        count={2}
                        variant="offer"
                      />
                    ) : (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.horizontalRow}
                      >
                        {featuredRestaurants.map((restaurant) => (
                          <View
                            key={restaurant._id}
                            style={[
                              styles.featuredCardWrap,
                              featuredRestaurants.length === 1
                                ? singleHorizontalCardStyle
                                : null,
                            ]}
                          >
                            <RestaurantHeroCard
                              name={restaurant.name}
                              subtitle={mapRestaurantCardSubtitle(restaurant)}
                              imageUrl={
                                restaurant.coverImage?.url ||
                                restaurant.logo?.url ||
                                null
                              }
                              isOpen={cardIsOpen(restaurant)}
                              availability={cardAvailability(restaurant)}
                              customBadge={getRestaurantCustomBadge(restaurant)}
                              distanceKm={restaurant.distanceKm}
                              avgRating={restaurant.avgRating}
                              reviewCount={restaurant.reviewCount}
                              offerLabel={offerLabelByRestaurantId.get(
                                restaurant._id,
                              )}
                              deliveryFee={restaurant.deliveryFee}
                              preparationTimeMinutes={
                                restaurant.preparationTimeMinutes
                              }
                              isFavorite={favoriteRestaurantIdsSet.has(
                                restaurant._id,
                              )}
                              favoriteDisabled={
                                favoritePendingRestaurantId === restaurant._id
                              }
                              variant="offer"
                              badge="none"
                              sponsored={
                                restaurant.discovery?.isSponsored === true
                              }
                              onToggleFavorite={() =>
                                handleToggleFavorite(restaurant._id)
                              }
                              onPress={() =>
                                goToRestaurant(restaurant, "featured")
                              }
                            />
                          </View>
                        ))}
                      </ScrollView>
                    )}
                  </View>
                ) : null;

              const offersSectionElement =
                offerRestaurants.length > 0 ? (
                  <View style={styles.section}>
                    <View style={styles.sectionHeaderWrap}>
                      <SectionHeader
                        plain
                        title={offersSectionText.title}
                        subtitle={offersSectionText.subtitle}
                        onSeeAll={() =>
                          openCollection("offers", offersSectionText.title, offersSectionText.subtitle)
                        }
                        accentColor="#A78BFA"
                        emoji={offersSectionText.emoji}
                      />
                    </View>
                    {shouldShowHomeFeedSkeleton ? (
                      <RestaurantListSkeleton
                        translateX={shimmerTranslateX}
                        horizontal
                        count={2}
                        variant="offer"
                      />
                    ) : (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.horizontalRow}
                      >
                        {offerRestaurants.map((restaurant) => (
                          <View
                            key={restaurant._id}
                            style={[
                              styles.featuredCardWrap,
                              offerRestaurants.length === 1
                                ? singleHorizontalCardStyle
                                : null,
                            ]}
                          >
                            <RestaurantHeroCard
                              name={restaurant.name}
                              subtitle={mapRestaurantCardSubtitle(restaurant)}
                              imageUrl={
                                restaurant.coverImage?.url ||
                                restaurant.logo?.url ||
                                null
                              }
                              isOpen={cardIsOpen(restaurant)}
                              availability={cardAvailability(restaurant)}
                              customBadge={getRestaurantCustomBadge(restaurant)}
                              distanceKm={restaurant.distanceKm}
                              avgRating={restaurant.avgRating}
                              reviewCount={restaurant.reviewCount}
                              offerLabel={offerLabelByRestaurantId.get(
                                restaurant._id,
                              )}
                              deliveryFee={restaurant.deliveryFee}
                              preparationTimeMinutes={
                                restaurant.preparationTimeMinutes
                              }
                              isFavorite={favoriteRestaurantIdsSet.has(
                                restaurant._id,
                              )}
                              favoriteDisabled={
                                favoritePendingRestaurantId === restaurant._id
                              }
                              variant="offer"
                              badge={
                                isFeaturedRestaurant(restaurant)
                                  ? "featured"
                                  : undefined
                              }
                              onToggleFavorite={() =>
                                handleToggleFavorite(restaurant._id)
                              }
                              onPress={() => goToRestaurant(restaurant, "offers")}
                            />
                          </View>
                        ))}
                      </ScrollView>
                    )}
                  </View>
                ) : null;

              const topSectionMap: Record<TopSectionKey, ReactNode> = {
                featured: featuredSectionElement,
                timeBased: timeBasedSectionElement,
                offers: offersSectionElement,
              };
              return topSectionOrder.map((key) => (
                <Fragment key={key}>{topSectionMap[key]}</Fragment>
              ));
            })()}

            {orderAgainPlacement === "after_top_sections" ? (
              <HomeOrderAgainSection
                enabled={isHomeFocused && !isSearching}
                config={homeCms?.orderAgainSection}
              />
            ) : null}

            {discoverNewRestaurants.length > 0 ? (
              <View style={styles.section}>
                <View style={styles.sectionHeaderWrap}>
                  <SectionHeader
                    plain
                    title={discoverNewSectionText.title}
                    subtitle={discoverNewSectionText.subtitle}
                    accentColor="#4DA3FF"
                    emoji={discoverNewSectionText.emoji}
                  />
                </View>
                {shouldShowHomeFeedSkeleton ? (
                  <RestaurantListSkeleton
                    translateX={shimmerTranslateX}
                    horizontal
                    count={2}
                    variant="nearby"
                  />
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.horizontalRow}
                  >
                    {discoverNewRestaurants.map((restaurant) => (
                      <View
                        key={restaurant._id}
                        style={[
                          styles.featuredCardWrap,
                          discoverNewRestaurants.length === 1
                            ? singleHorizontalCardStyle
                            : null,
                        ]}
                      >
                        <RestaurantHeroCard
                          name={restaurant.name}
                          subtitle={mapRestaurantCardSubtitle(restaurant)}
                          imageUrl={
                            restaurant.coverImage?.url ||
                            restaurant.logo?.url ||
                            null
                          }
                          isOpen={cardIsOpen(restaurant)}
                          availability={cardAvailability(restaurant)}
                          customBadge={getRestaurantCustomBadge(restaurant)}
                          distanceKm={restaurant.distanceKm}
                          avgRating={restaurant.avgRating}
                          reviewCount={restaurant.reviewCount}
                          offerLabel={offerLabelByRestaurantId.get(
                            restaurant._id,
                          )}
                          deliveryFee={restaurant.deliveryFee}
                          preparationTimeMinutes={
                            restaurant.preparationTimeMinutes
                          }
                          isFavorite={favoriteRestaurantIdsSet.has(
                            restaurant._id,
                          )}
                          favoriteDisabled={
                            favoritePendingRestaurantId === restaurant._id
                          }
                          variant="nearby"
                          compact
                          onToggleFavorite={() =>
                            handleToggleFavorite(restaurant._id)
                          }
                          onPress={() => goToRestaurant(restaurant, "discover_new")}
                        />
                      </View>
                    ))}
                  </ScrollView>
                )}
              </View>
            ) : null}

            {popularNearYouRestaurants.length > 0 ? (
              <View style={styles.section}>
                <View style={styles.sectionHeaderWrap}>
                  <SectionHeader
                    plain
                    title={popularNearYouSectionText.title}
                    subtitle={popularNearYouSectionText.subtitle}
                    onSeeAll={() =>
                      openCollection("popular", popularNearYouSectionText.title, popularNearYouSectionText.subtitle)
                    }
                    accentColor="#FFA940"
                    emoji={popularNearYouSectionText.emoji}
                  />
                </View>
                {shouldShowHomeFeedSkeleton ? (
                  <RestaurantListSkeleton
                    translateX={shimmerTranslateX}
                    horizontal
                    count={2}
                    variant="offer"
                  />
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.horizontalRow}
                  >
                    {popularNearYouRestaurants.map((restaurant) => (
                      <View
                        key={restaurant._id}
                        style={[
                          styles.featuredCardWrap,
                          popularNearYouRestaurants.length === 1
                            ? singleHorizontalCardStyle
                            : null,
                        ]}
                      >
                        <RestaurantHeroCard
                          name={restaurant.name}
                          subtitle={mapRestaurantCardSubtitle(restaurant)}
                          imageUrl={
                            restaurant.coverImage?.url ||
                            restaurant.logo?.url ||
                            null
                          }
                          isOpen={cardIsOpen(restaurant)}
                          availability={cardAvailability(restaurant)}
                          customBadge={getRestaurantCustomBadge(restaurant)}
                          distanceKm={restaurant.distanceKm}
                          avgRating={restaurant.avgRating}
                          reviewCount={restaurant.reviewCount}
                          offerLabel={offerLabelByRestaurantId.get(
                            restaurant._id,
                          )}
                          deliveryFee={restaurant.deliveryFee}
                          preparationTimeMinutes={
                            restaurant.preparationTimeMinutes
                          }
                          isFavorite={favoriteRestaurantIdsSet.has(
                            restaurant._id,
                          )}
                          favoriteDisabled={
                            favoritePendingRestaurantId === restaurant._id
                          }
                          variant="offer"
                          onToggleFavorite={() =>
                            handleToggleFavorite(restaurant._id)
                          }
                          onPress={() => goToRestaurant(restaurant, "popular")}
                        />
                      </View>
                    ))}
                  </ScrollView>
                )}
              </View>
            ) : null}

            {shouldShowNearbyRestaurantSection ? (
            <View style={styles.section}>
              <View style={styles.nearbySectionHeaderRow}>
                <View style={styles.nearbySectionHeaderCopy}>
                  <SectionHeader
                    plain
                    title="All restaurants"
                    subtitle={
                      allRestaurantsTotal > 0
                        ? `${allRestaurantsTotal} places deliver to you`
                        : "Every place that delivers to you"
                    }
                  />
                </View>
                <NearbyHeaderSpinner
                  visible={
                    isUpdatingLocationResults ||
                    (allRestaurantsQuery.isRefetching &&
                      !allRestaurantsQuery.isFetchingNextPage)
                  }
                />
              </View>

              {!selectedLocation ? (
                isResolvingLocation ? (
                  <RestaurantListSkeleton
                    translateX={shimmerTranslateX}
                    count={3}
                    variant="nearby"
                  />
                ) : (
                  <EmptyStateCard
                    title={
                      permissionGranted === false
                        ? "Location permission is needed"
                        : "Choose your location first"
                    }
                    description="Set your delivery point so we can show places that deliver to you."
                    actionLabel={
                      permissionGranted === false
                        ? "Allow location"
                        : "Choose location"
                    }
                    onPress={handleMissingLocationPress}
                  />
                )
              ) : allRestaurants.length === 0 &&
                (allRestaurantsQuery.isLoading || isUpdatingLocationResults) ? (
                <RestaurantListSkeleton
                  translateX={shimmerTranslateX}
                  count={3}
                  variant="nearby"
                />
              ) : allRestaurants.length === 0 && allRestaurantsQuery.isError ? (
                isOnline ? (
                  <EmptyStateCard
                    title="We could not load restaurants"
                    description="Please try again in a moment. Your saved location is still ready."
                    actionLabel="Try again"
                    onPress={() => allRestaurantsQuery.refetch()}
                  />
                ) : (
                  <EmptyStateCard
                    title="Restaurants are unavailable offline"
                    description="Connect to the internet to load places near your delivery point."
                  />
                )
              ) : allRestaurants.length > 0 ? (
                <>
                  <View style={styles.restaurantList}>
                    {allRestaurants.map((restaurant) => (
                      <RestaurantFeedRow
                        key={restaurant._id}
                        name={restaurant.name}
                        subtitle={mapRestaurantCardSubtitle(restaurant)}
                        imageUrl={
                          restaurant.coverImage?.url ||
                          restaurant.logo?.url ||
                          null
                        }
                        isOpen={cardIsOpen(restaurant)}
                        availability={cardAvailability(restaurant)}
                        customBadge={getRestaurantCustomBadge(restaurant)}
                        distanceKm={restaurant.distanceKm}
                        avgRating={restaurant.avgRating}
                        reviewCount={restaurant.reviewCount}
                        offerLabel={offerLabelByRestaurantId.get(restaurant._id)}
                        deliveryFee={restaurant.deliveryFee}
                        preparationTimeMinutes={restaurant.preparationTimeMinutes}
                        isFavorite={favoriteRestaurantIdsSet.has(restaurant._id)}
                        favoriteDisabled={
                          favoritePendingRestaurantId === restaurant._id
                        }
                        onToggleFavorite={() =>
                          handleToggleFavorite(restaurant._id)
                        }
                        onPress={() => goToRestaurant(restaurant, "home_nearby")}
                      />
                    ))}
                  </View>

                  {allRestaurantsQuery.isFetchingNextPage ? (
                    <View style={styles.listFooter}>
                      <ActivityIndicator color={palette.secondary} />
                      <Text style={styles.listFooterText}>Loading more places…</Text>
                    </View>
                  ) : allRestaurantsQuery.hasNextPage ? (
                    <Pressable
                      style={({ pressed }) => [
                        styles.loadMoreButton,
                        pressed ? styles.loadMoreButtonPressed : null,
                      ]}
                      onPress={() => void allRestaurantsQuery.fetchNextPage()}
                    >
                      <Text style={styles.loadMoreButtonText}>Show more restaurants</Text>
                      <Ionicons name="chevron-down" size={16} color={palette.foreground} />
                    </Pressable>
                  ) : allRestaurants.length > 3 ? (
                    <View style={styles.listFooter}>
                      <View style={styles.listEndRule} />
                      <Text style={styles.listFooterText}>
                        That&apos;s all {allRestaurants.length} places for now
                      </Text>
                      <View style={styles.listEndRule} />
                    </View>
                  ) : null}
                </>
              ) : (
                <EmptyStateCard
                  title={
                    isOnline
                      ? "Foodbela isn't in this area yet"
                      : "Restaurants are unavailable offline"
                  }
                  description={
                    isOnline
                      ? "We don't deliver to this location yet. Try a different delivery point where Foodbela is available."
                      : "Connect to the internet to load places near your delivery point."
                  }
                  actionLabel={isOnline ? "Change location" : undefined}
                  onPress={isOnline ? openLocationPicker : undefined}
                />
              )}
            </View>
            ) : null}
          </>
        )}
      </Animated.ScrollView>
      </BelaPullToRefresh>

      {/* Pinned search: fades in once the in-flow search pill scrolls up to the top. */}
      <Animated.View
        pointerEvents={stickySearchVisible ? "auto" : "none"}
        style={[
          styles.stickySearchBar,
          { paddingTop: insets.top + 6, opacity: stickySearchOpacity },
        ]}
      >
        <PressableScale
          onPress={openLocationPicker}
          scaleTo={0.92}
          style={styles.stickyBell}
          accessibilityRole="button"
          accessibilityLabel={`Deliver to ${deliverToText}. Change location`}
        >
          <Ionicons name="location" size={20} color={palette.onPrimary} />
        </PressableScale>
        {renderSearchPill("sticky")}
      </Animated.View>

      {/* "Are you somewhere else now?" (Bangla) — once per launch, only if far away. */}
      <HomeLocationReminder active={isHomeFocused && !isSearching} />

      <ServiceClosedStickyPill
        area={areaWindow}
        visible={closedStickyVisible}
        topOffset={insets.top + 72}
        showTimer
        timerActive={closedTimerActive}
      />
      <Modal
        visible={Boolean(
          showHomeCmsModal && (shouldShowPoll || homeCms?.modal.isActive),
        )}
        transparent
        animationType="fade"
        onRequestClose={() => setShowHomeCmsModal(false)}
      >
        {shouldShowPoll && activePoll ? (
          <HomePollModal
            poll={activePoll}
            onClose={() => setShowHomeCmsModal(false)}
            // Don't flip local state here — the modal must stay mounted to show its own
            // "thanks" screen. The vote is persisted on-device inside the modal, and
            // `homeCmsModalShown` already prevents it re-popping this session.
            onVoted={() => undefined}
          />
        ) : homeCms?.modal.isActive ? (
          <View style={styles.campaignModalOverlay}>
            <Pressable
              style={styles.campaignModalBackdrop}
              onPress={() => setShowHomeCmsModal(false)}
            />
            <View
              style={[
                styles.homeModalCard,
                {
                  backgroundColor:
                    homeCms.modal.backgroundColor || palette.surface,
                },
              ]}
            >
              <Pressable
                style={styles.campaignModalClose}
                onPress={() => setShowHomeCmsModal(false)}
              >
                <Ionicons name="close" size={18} color={palette.foreground} />
              </Pressable>

              {homeCms.modal.imageUrl ? (
                <RemoteImage
                  uri={homeCms.modal.imageUrl}
                  style={[
                    styles.homeModalImage,
                    !homeCms.modal.title.trim() &&
                    !homeCms.modal.subtitle.trim()
                      ? styles.homeModalImageOnly
                      : null,
                  ]}
                  fallbackIcon="image-outline"
                  targetWidth={screenWidth}
                  accessibilityLabel={
                    homeCms.modal.title || "Foodbela announcement"
                  }
                />
              ) : null}

              {homeCms.modal.title.trim() ? (
                <Text
                  style={[
                    styles.campaignModalTitle,
                    { color: homeCms.modal.textColor || palette.foreground },
                  ]}
                >
                  {homeCms.modal.title.trim()}
                </Text>
              ) : null}
              {homeCms.modal.subtitle.trim() ? (
                <Text
                  style={[
                    styles.campaignModalSubtitle,
                    {
                      color: homeCms.modal.textColor || palette.mutedForeground,
                    },
                  ]}
                >
                  {homeCms.modal.subtitle.trim()}
                </Text>
              ) : null}

              {canOpenCustomerTarget(homeCms.modal.ctaPath) ? (
                <PressableScale
                  scaleTo={0.97}
                  containerStyle={styles.campaignModalActionSlot}
                  style={[
                    styles.campaignModalAction,
                    {
                      backgroundColor:
                        homeCms.modal.accentColor || palette.secondary,
                    },
                  ]}
                  onPress={() => {
                    recordHomeCmsEvent("modal_click");
                    setShowHomeCmsModal(false);
                    void openCustomerTarget(homeCms.modal.ctaPath);
                  }}
                >
                  <Text style={styles.campaignModalActionText}>
                    {homeCms.modal.ctaLabel || "Explore now"}
                  </Text>
                </PressableScale>
              ) : null}
            </View>
          </View>
        ) : null}
      </Modal>
    </View>
  );
}
