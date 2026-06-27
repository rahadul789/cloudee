import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  type StyleProp,
  Text,
  View,
  type ViewStyle,
  useWindowDimensions,
} from "react-native";

import { EmptyStateCard } from "@/src/components/empty-state-card";
import {
  getBannerToneStyle,
  HomeCmsPromoBlock,
  HowToOrderGuideBlock,
  recordHomeCmsEvent,
} from "@/src/components/home/home-cms-blocks";
import { styles } from "@/src/components/home/home-screen.styles";
import { RemoteImage } from "@/src/components/remote-image";
import { RestaurantHeroCard } from "@/src/components/restaurant-hero-card";
import { Screen } from "@/src/components/screen";
import { SectionHeader } from "@/src/components/section-header";
import {
  useCustomerDiscoveryHomeQuery,
  useCustomerFavoriteRestaurantIdsQuery,
  useCustomerOrderPresenceQuery,
  useNearbyRestaurantsQuery,
  useCustomerToggleFavoriteRestaurantMutation,
} from "@/src/hooks/use-customer-api";
import { useCustomerAuthStore } from "@/src/store/auth-store";
import { useBrowseHistoryStore } from "@/src/store/browse-history-store";
import { getCartItemCount, useCartStore } from "@/src/store/cart-store";
import { useIsOnline } from "@/src/hooks/use-network-status";
import { useLocationStore } from "@/src/store/location-store";
import { palette } from "@/src/theme/palette";
import { trackCustomerEvent } from "@/src/lib/analytics";
import { resolveCustomerRoute } from "@/src/lib/customer-routes";
import { normalizeFoodCategorySuggestions } from "@/src/lib/food-categories";
import { formatCustomerAddressLine } from "@/src/lib/location-address";
import { openLocationPermissionSettings } from "@/src/lib/location-permissions";
import type {
  CustomerHomeCms,
  CustomerHomeRestaurantSectionConfig,
  CustomerVoucherOffer,
  DiscoverableRestaurant,
} from "@/src/types/restaurant";

function isExternalHttpUrl(value?: string | null) {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

// Expands a #RGB/#RRGGBB color into an 8-digit hex with the given alpha so the
// time-based section can tint its header from the admin-set accent color.
function withAlpha(hex: string | undefined, alpha: number) {
  const normalized = (hex ?? "").replace("#", "").trim();
  if (normalized.length !== 3 && normalized.length !== 6) return hex ?? "#FF5C93";
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

function getOfferLabel(offer: CustomerVoucherOffer) {
  let value = "Offer available";

  if (offer.type === "free_delivery") {
    value = "Free delivery";
  } else if (
    offer.type === "percentage" &&
    typeof offer.discountValue === "number"
  ) {
    value = `${offer.discountValue}% off`;
  } else if (typeof offer.discountValue === "number") {
    value = `Tk ${offer.discountValue} off`;
  }

  return offer.code ? `${offer.code} - ${value}` : value;
}

function buildRestaurantOfferMap(offers: CustomerVoucherOffer[]) {
  const next = new Map<string, string>();

  for (const offer of offers) {
    const restaurantIds = [
      ...(offer.restaurantIds ?? []),
      offer.restaurantId ?? "",
    ].filter(Boolean);

    for (const restaurantId of restaurantIds) {
      if (!next.has(restaurantId)) {
        next.set(restaurantId, getOfferLabel(offer));
      }
    }
  }

  return next;
}

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
      }),
    );

    rotateAnim.setValue(0);
    rotateLoop.start();

    return () => {
      rotateLoop.stop();
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
      }),
    );

    shimmerAnim.setValue(0);
    shimmerLoop.start();

    return () => {
      shimmerLoop.stop();
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
        <RestaurantCardSkeleton
          key={item}
          translateX={translateX}
          variant={variant}
        />
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
  const customer = useCustomerAuthStore((state) => state.customer);
  const isAuthenticated = useCustomerAuthStore((state) =>
    Boolean(state.accessToken),
  );
  const selectedLocation = useLocationStore((state) => state.selectedLocation);
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
  const cartItemCount = useCartStore((state) =>
    isHomeFocused ? getCartItemCount(state.items) : 0,
  );
  const isSearching = searchQuery.trim().length > 0;

  const homeQuery = useCustomerDiscoveryHomeQuery({
    latitude: selectedLocation?.latitude,
    longitude: selectedLocation?.longitude,
  });
  // Skip the separate /customer/restaurants call when admin has turned the
  // Nearby section off. Defaults to enabled until the home feed (which carries
  // the section config) loads, so the common (active) case still fetches in
  // parallel without a waterfall.
  const isNearbySectionEnabled =
    homeQuery.data?.homeCms?.restaurantSections?.nearby?.isActive !== false;
  // radiusKm intentionally omitted: the backend resolves the effective delivery
  // range (service zone, else the admin-set fallback) inside the same request,
  // so there is no extra "fetch radius first" round-trip and the admin stays in
  // full control without an app update.
  const nearbyRestaurantsQuery = useNearbyRestaurantsQuery({
    latitude: selectedLocation?.latitude,
    longitude: selectedLocation?.longitude,
    search: searchQuery,
    enabled: isNearbySectionEnabled,
  });

  const favoriteRestaurantIdsQuery = useCustomerFavoriteRestaurantIdsQuery();
  const orderPresenceQuery = useCustomerOrderPresenceQuery(
    isAuthenticated && !isSearching,
  );
  const toggleFavoriteMutation = useCustomerToggleFavoriteRestaurantMutation();

  const nearbyRestaurants = useMemo(
    () => nearbyRestaurantsQuery.data ?? [],
    [nearbyRestaurantsQuery.data],
  );
  const homeFeed = homeQuery.data;
  const homeBanner = !isSearching ? (homeFeed?.homeBanner ?? null) : null;
  const homeCms = !isSearching ? (homeFeed?.homeCms ?? null) : null;
  const homeOfferStrip = homeCms?.offerStrip;
  const restaurantSections = homeCms?.restaurantSections;
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
  const nearbySectionText = getHomeRestaurantSectionText(
    nearbySectionConfig,
    "Nearby",
    selectedLocation
      ? `${nearbyRestaurants.length} places deliver near your selected pin`
      : "Set your location to see places near you",
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
  const stripOffers = useMemo(
    () => (shouldShowVoucherStrip ? activeOffers : []),
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

  const profileInitials = useMemo(() => {
    const name = customer?.fullName?.trim() ?? "";
    const initials = name
      .split(" ")
      .filter(Boolean)
      .map((part) => part.charAt(0))
      .join("")
      .slice(0, 2)
      .toUpperCase();

    return initials || "CU";
  }, [customer?.fullName]);
  const selectedDeliveryAddressTop =
    selectedLocation?.addressDetails?.trim() || "";
  const selectedDeliveryAddressBottom = formatCustomerAddressLine(
    selectedLocation?.address,
    "Select your exact delivery point",
  );

  const featuredRestaurants = useMemo(() => {
    if (isSearching) return [];
    if (!selectedLocation) return [];
    if (!isHomeRestaurantSectionActive(featuredSectionConfig)) return [];
    const homeFeatured = homeFeed?.featuredRestaurants ?? [];
    const nearbyFeatured = nearbyRestaurants.filter(
      (restaurant) => isFeaturedRestaurant(restaurant),
    );

    return (homeFeatured.length ? homeFeatured : nearbyFeatured).slice(
      0,
      getHomeRestaurantSectionLimit(featuredSectionConfig, 6),
    );
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
    return (homeFeed?.restaurantsWithOffers ?? []).slice(
      0,
      getHomeRestaurantSectionLimit(offersSectionConfig, 8),
    );
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
    return (homeFeed?.discoverNewRestaurants ?? []).slice(
      0,
      getHomeRestaurantSectionLimit(discoverNewSectionConfig, 6),
    );
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
    return (homeFeed?.popularNearYouRestaurants ?? []).slice(
      0,
      getHomeRestaurantSectionLimit(popularNearYouSectionConfig, 6),
    );
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
    return timeBasedSectionData.restaurants ?? [];
  }, [isSearching, selectedLocation, timeBasedSectionData]);
  const shouldShowTimeBasedSection = timeBasedRestaurants.length > 0;
  const timeSectionAccent = timeBasedSectionData?.accentColor || palette.secondary;

  const nearbyRestaurantsForSection = useMemo(() => {
    if (!isHomeRestaurantSectionActive(nearbySectionConfig)) return [];
    const featuredIds = new Set(
      featuredRestaurants.map((restaurant) => restaurant._id),
    );
    const offerIds = new Set(
      offerRestaurants.map((restaurant) => restaurant._id),
    );
    const discoverNewIds = new Set(
      discoverNewRestaurants.map((restaurant) => restaurant._id),
    );
    const popularNearYouIds = new Set(
      popularNearYouRestaurants.map((restaurant) => restaurant._id),
    );
    const filtered = nearbyRestaurants.filter(
      (restaurant) =>
        !featuredIds.has(restaurant._id) &&
        !offerIds.has(restaurant._id) &&
        !discoverNewIds.has(restaurant._id) &&
        !popularNearYouIds.has(restaurant._id),
    );

    return (filtered.length ? filtered : nearbyRestaurants).slice(
      0,
      getHomeRestaurantSectionLimit(nearbySectionConfig, 8),
    );
  }, [
    discoverNewRestaurants,
    featuredRestaurants,
    nearbyRestaurants,
    nearbySectionConfig,
    offerRestaurants,
    popularNearYouRestaurants,
  ]);

  const shouldShowHomeFeedSkeleton =
    !isSearching && homeQuery.isLoading && !homeFeed;
  const shouldShowSearchSkeleton =
    isSearching &&
    Boolean(selectedLocation) &&
    nearbyRestaurantsQuery.isLoading &&
    nearbyRestaurants.length === 0;
  const shouldShowNearbySkeleton =
    !isSearching &&
    Boolean(selectedLocation) &&
    nearbyRestaurantsQuery.isLoading &&
    nearbyRestaurants.length === 0;
  const shimmerTranslateX = useHomeShimmer(
    isHomeFocused &&
      (shouldShowHomeFeedSkeleton ||
      shouldShowSearchSkeleton ||
      shouldShowNearbySkeleton),
  );

  const bannerTone = getBannerToneStyle(homeBanner?.tone ?? null);
  const shouldShowHowToOrderGuide =
    Boolean(homeCms) &&
    !isSearching &&
    (!isAuthenticated ||
      (orderPresenceQuery.isSuccess &&
        !orderPresenceQuery.data.hasCompletedOrders));
  const isUpdatingLocationResults = Boolean(
    isHomeFocused &&
    pendingLocationUpdateKey &&
    selectedLocation &&
    isOnline &&
    !isRefreshing &&
    !isSearching &&
    (nearbyRestaurantsQuery.isFetching || homeQuery.isFetching),
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

    if (!nearbyRestaurantsQuery.isFetching && !homeQuery.isFetching) {
      setPendingLocationUpdateKey("");
    }
  }, [
    homeQuery.isFetching,
    isOnline,
    nearbyRestaurantsQuery.isFetching,
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
    if (!isHomeFocused || !homeCms?.modal.isActive || isSearching) return;
    if (homeCms.modal.frequency === "once_per_session" && homeCmsModalShown)
      return;
    const timer = setTimeout(
      () => {
        setShowHomeCmsModal(true);
        setHomeCmsModalShown(true);
        recordHomeCmsEvent("modal_impression");
      },
      Math.max(homeCms.modal.delaySeconds ?? 0, 0) * 1000,
    );

    return () => clearTimeout(timer);
  }, [
    homeCms?.modal.delaySeconds,
    homeCms?.modal.frequency,
    homeCms?.modal.isActive,
    homeCmsModalShown,
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
      await Promise.all([
        homeQuery.refetch(),
        nearbyRestaurantsQuery.refetch(),
        favoriteRestaurantIdsQuery.refetch(),
        ...(isAuthenticated && !isSearching
          ? [orderPresenceQuery.refetch()]
          : []),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const goToRestaurant = (restaurant: DiscoverableRestaurant) => {
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
      params: { restaurantId: restaurant._id },
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
      router.push(safeRoute as never);
      return;
    }

    const externalUrl = target?.trim() ?? "";
    if (isExternalHttpUrl(externalUrl)) {
      await Linking.openURL(externalUrl);
    }
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={palette.primary}
            colors={[palette.primary, palette.secondary, "#FF5C93"]}
          />
        }
      >
        <View style={styles.hero}>
          <View style={styles.heroOrbPrimary} />
          <View style={styles.heroOrbSecondary} />

          <View style={styles.heroTopRow}>
            <Pressable onPress={openLocationPicker} style={styles.addressBlock}>
              <Text style={styles.addressLabel}>DELIVERY ADDRESS</Text>
              <View style={styles.addressRow}>
                <Ionicons name="location" size={16} color={palette.secondary} />
                <Text numberOfLines={1} style={styles.addressValue}>
                  {selectedDeliveryAddressTop ||
                    selectedLocation?.label ||
                    "Choose your location"}
                </Text>
                <Ionicons
                  name="chevron-down"
                  size={16}
                  color={palette.foreground}
                />
              </View>
              <Text numberOfLines={1} style={styles.addressSubtext}>
                {selectedDeliveryAddressTop
                  ? selectedDeliveryAddressBottom
                  : selectedLocation?.address
                    ? formatCustomerAddressLine(selectedLocation.address)
                    : "Select your exact delivery point"}
              </Text>
            </Pressable>

            <View style={styles.actions}>
              <Pressable
                onPress={() => router.push("/(tabs)/cart")}
                style={styles.cartBubble}
              >
                <Ionicons name="bag-handle-outline" size={18} color="#fff" />
                {cartItemCount > 0 ? (
                  <View style={styles.cartCounter}>
                    <Text style={styles.cartCounterText}>{cartItemCount}</Text>
                  </View>
                ) : null}
              </Pressable>

              <Pressable
                onPress={() => router.push("/(tabs)/profile")}
                style={[
                  styles.profileBubble,
                  customer && !customer.profileImage?.url
                    ? styles.profileBubbleSignedIn
                    : null,
                ]}
              >
                {customer?.profileImage?.url ? (
                  <RemoteImage
                    uri={customer.profileImage.url}
                    style={styles.profileImage}
                    fallbackIcon="person-outline"
                    fallbackIconSize={18}
                    accessibilityLabel="Profile photo"
                  />
                ) : customer ? (
                  <Text style={styles.profileBubbleText}>
                    {profileInitials}
                  </Text>
                ) : (
                  <Ionicons
                    name="person-outline"
                    size={18}
                    color={palette.secondary}
                  />
                )}
              </Pressable>
            </View>
          </View>

          <View style={styles.searchCategoryPanel}>
            <Pressable
              style={styles.searchBar}
              onPress={() => openSearchScreen()}
            >
              <View style={styles.searchIconBubble}>
                <Ionicons name="search" size={17} color={palette.secondary} />
              </View>
              <Text style={styles.searchInput}>Search food or restaurant</Text>
              <Ionicons
                name="arrow-forward"
                size={15}
                color={palette.placeholder}
              />
            </Pressable>

            {!isSearching &&
            homeCms?.homeCategories?.isActive !== false &&
            homeCategoryPreviewItems.length > 0 ? (
              <View style={styles.homeCategoryBlock}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.homeCategoryRow}
                >
                  {homeCategoryPreviewItems.map((item, index) => (
                    <Pressable
                      key={item.id || `${item.label}-${index}`}
                      style={[
                        styles.homeCategoryChip,
                        { backgroundColor: item.color || "#FFF0F6" },
                      ]}
                      onPress={() =>
                        openSearchScreen(item.searchQuery || item.label)
                      }
                    >
                      <View style={styles.homeCategoryIconWrap}>
                        <Ionicons
                          name={
                            (item.icon ||
                              "restaurant-outline") as keyof typeof Ionicons.glyphMap
                          }
                          size={14}
                          color={palette.foreground}
                        />
                      </View>
                      <Text
                        style={styles.homeCategoryChipText}
                        numberOfLines={1}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  ))}
                  {canToggleHomeCategories ? (
                    <Pressable
                      style={styles.homeCategoryMoreChip}
                      accessibilityRole="button"
                      accessibilityLabel="Show more categories"
                      onPress={() => openSearchScreen()}
                    >
                      <Ionicons
                        name="arrow-forward"
                        size={17}
                        color={palette.surface}
                      />
                    </Pressable>
                  ) : null}
                </ScrollView>
              </View>
            ) : shouldShowHomeFeedSkeleton ? (
              <View style={styles.skeletonChipRow}>
                <ShimmerBlock
                  translateX={shimmerTranslateX}
                  style={styles.skeletonChipWide}
                />
                <ShimmerBlock
                  translateX={shimmerTranslateX}
                  style={styles.skeletonChip}
                />
                <ShimmerBlock
                  translateX={shimmerTranslateX}
                  style={styles.skeletonChipSmall}
                />
              </View>
            ) : null}
          </View>

          {shouldShowHomeFeedSkeleton ? (
            <HomeHeroSkeleton translateX={shimmerTranslateX} />
          ) : null}

          {homeBanner ? (
            <Pressable
              style={[styles.bannerCard, { backgroundColor: bannerTone.shell }]}
              disabled={!resolveCustomerRoute(homeBanner.ctaPath, null)}
              onPress={() => {
                const path = resolveCustomerRoute(homeBanner.ctaPath, null);
                if (path) router.push(path as never);
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
                  style={styles.offerChip}
                  onPress={() => recordHomeCmsEvent("strip_click")}
                >
                  <Ionicons name="pricetag-outline" size={14} color="#FF5C93" />
                  <Text numberOfLines={1} style={styles.offerChipText}>
                    {getOfferLabel(offer)}
                  </Text>
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
                title="Search results"
                subtitle={
                  selectedLocation
                    ? `${nearbyRestaurants.length} places found for "${searchQuery.trim()}"`
                    : "Set your delivery point first, then search nearby places"
                }
              />
            </View>

            {!selectedLocation ? (
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
                    isOpen={restaurant.isOpen !== false}
                    distanceKm={restaurant.distanceKm}
                    avgRating={restaurant.avgRating}
                    reviewCount={restaurant.reviewCount}
                    offerLabel={offerLabelByRestaurantId.get(restaurant._id)}
                    lowestMenuPrice={restaurant.lowestMenuPrice}
                    preparationTimeMinutes={restaurant.preparationTimeMinutes}
                    isFavorite={favoriteRestaurantIdsSet.has(restaurant._id)}
                    favoriteDisabled={
                      favoritePendingRestaurantId === restaurant._id
                    }
                    variant="nearby"
                    onToggleFavorite={() =>
                      handleToggleFavorite(restaurant._id)
                    }
                    onPress={() => goToRestaurant(restaurant)}
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

            {shouldShowTimeBasedSection ? (
              <View style={styles.section}>
                <View style={styles.timeSectionHeader}>
                  <View style={styles.timeSectionTitleRow}>
                    {timeBasedSectionData?.emoji ? (
                      <Text style={styles.timeSectionEmoji}>
                        {timeBasedSectionData.emoji}
                      </Text>
                    ) : (
                      <Ionicons
                        name={
                          (timeBasedSectionData?.icon ||
                            "time-outline") as keyof typeof Ionicons.glyphMap
                        }
                        size={18}
                        color={timeSectionAccent}
                      />
                    )}
                    <Text style={styles.timeSectionTitle} numberOfLines={1}>
                      {timeBasedSectionData?.title}
                    </Text>
                    <View
                      style={[
                        styles.timeSectionLivePill,
                        { backgroundColor: withAlpha(timeSectionAccent, 0.14) },
                      ]}
                    >
                      <View
                        style={[
                          styles.timeSectionLiveDot,
                          { backgroundColor: timeSectionAccent },
                        ]}
                      />
                      <Text
                        style={[
                          styles.timeSectionLiveText,
                          { color: timeSectionAccent },
                        ]}
                      >
                        Live
                      </Text>
                    </View>
                  </View>
                  {timeBasedSectionData?.subtitle ? (
                    <Text style={styles.timeSectionSubtitle} numberOfLines={1}>
                      {timeBasedSectionData.subtitle}
                    </Text>
                  ) : null}
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.timeCompactRow}
                >
                  {timeBasedRestaurants.map((restaurant) => (
                    <Pressable
                      key={restaurant._id}
                      style={({ pressed }) => [
                        styles.timeCompactCard,
                        pressed ? styles.timeCompactCardPressed : null,
                      ]}
                      onPress={() => goToRestaurant(restaurant)}
                    >
                      <View style={styles.timeCompactImage}>
                        <RemoteImage
                          uri={
                            restaurant.coverImage?.url ||
                            restaurant.logo?.url ||
                            null
                          }
                          style={{ width: "100%", height: "100%" }}
                          fallbackIcon="restaurant-outline"
                          accessibilityLabel={restaurant.name}
                        />
                        {restaurant.isOpen === false ? (
                          <View style={styles.timeCompactClosed}>
                            <Text style={styles.timeCompactClosedText}>
                              Closed
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.timeCompactCopy}>
                        <Text style={styles.timeCompactName} numberOfLines={1}>
                          {restaurant.name}
                        </Text>
                        <View style={styles.timeCompactMetaRow}>
                          {typeof restaurant.avgRating === "number" &&
                          restaurant.avgRating > 0 ? (
                            <>
                              <Ionicons
                                name="star"
                                size={11}
                                color={palette.amber}
                              />
                              <Text style={styles.timeCompactMetaText}>
                                {restaurant.avgRating.toFixed(1)}
                              </Text>
                              {typeof restaurant.distanceKm === "number" ? (
                                <Text style={styles.timeCompactDot}>·</Text>
                              ) : null}
                            </>
                          ) : null}
                          {typeof restaurant.distanceKm === "number" ? (
                            <Text style={styles.timeCompactMetaText}>
                              {restaurant.distanceKm.toFixed(1)} km
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {featuredRestaurants.length > 0 || shouldShowHomeFeedSkeleton ? (
              <View style={styles.section}>
                <View style={styles.sectionHeaderWrap}>
                  <SectionHeader
                    title={featuredSectionText.title}
                    subtitle={featuredSectionText.subtitle}
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
                          isOpen={restaurant.isOpen !== false}
                          distanceKm={restaurant.distanceKm}
                          avgRating={restaurant.avgRating}
                          reviewCount={restaurant.reviewCount}
                          offerLabel={offerLabelByRestaurantId.get(
                            restaurant._id,
                          )}
                          lowestMenuPrice={restaurant.lowestMenuPrice}
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
                          onToggleFavorite={() =>
                            handleToggleFavorite(restaurant._id)
                          }
                          onPress={() => goToRestaurant(restaurant)}
                        />
                      </View>
                    ))}
                  </ScrollView>
                )}
              </View>
            ) : null}

            {offerRestaurants.length > 0 ? (
              <View style={styles.section}>
                <View style={styles.sectionHeaderWrap}>
                  <SectionHeader
                    title={offersSectionText.title}
                    subtitle={offersSectionText.subtitle}
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
                          isOpen={restaurant.isOpen !== false}
                          distanceKm={restaurant.distanceKm}
                          avgRating={restaurant.avgRating}
                          reviewCount={restaurant.reviewCount}
                          offerLabel={offerLabelByRestaurantId.get(
                            restaurant._id,
                          )}
                          lowestMenuPrice={restaurant.lowestMenuPrice}
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
                          onPress={() => goToRestaurant(restaurant)}
                        />
                      </View>
                    ))}
                  </ScrollView>
                )}
              </View>
            ) : null}

            {discoverNewRestaurants.length > 0 ? (
              <View style={styles.section}>
                <View style={styles.sectionHeaderWrap}>
                  <SectionHeader
                    title={discoverNewSectionText.title}
                    subtitle={discoverNewSectionText.subtitle}
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
                          isOpen={restaurant.isOpen !== false}
                          distanceKm={restaurant.distanceKm}
                          avgRating={restaurant.avgRating}
                          reviewCount={restaurant.reviewCount}
                          offerLabel={offerLabelByRestaurantId.get(
                            restaurant._id,
                          )}
                          lowestMenuPrice={restaurant.lowestMenuPrice}
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
                          onToggleFavorite={() =>
                            handleToggleFavorite(restaurant._id)
                          }
                          onPress={() => goToRestaurant(restaurant)}
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
                    title={popularNearYouSectionText.title}
                    subtitle={popularNearYouSectionText.subtitle}
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
                          isOpen={restaurant.isOpen !== false}
                          distanceKm={restaurant.distanceKm}
                          avgRating={restaurant.avgRating}
                          reviewCount={restaurant.reviewCount}
                          offerLabel={offerLabelByRestaurantId.get(
                            restaurant._id,
                          )}
                          lowestMenuPrice={restaurant.lowestMenuPrice}
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
                          onPress={() => goToRestaurant(restaurant)}
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
                    title={nearbySectionText.title}
                    subtitle={nearbySectionText.subtitle}
                  />
                </View>
                <NearbyHeaderSpinner visible={isUpdatingLocationResults} />
              </View>

              {!selectedLocation ? (
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
              ) : shouldShowNearbySkeleton ? (
                <RestaurantListSkeleton
                  translateX={shimmerTranslateX}
                  count={3}
                  variant="nearby"
                />
              ) : nearbyRestaurantsQuery.isError ? (
                isOnline ? (
                  <EmptyStateCard
                    title="We could not load nearby restaurants"
                    description="Please try again in a moment. Your saved location is still ready."
                    actionLabel="Try again"
                    onPress={() => nearbyRestaurantsQuery.refetch()}
                  />
                ) : (
                  <EmptyStateCard
                    title="Nearby restaurants are unavailable offline"
                    description="Connect to the internet to refresh places near your delivery point."
                  />
                )
              ) : nearbyRestaurantsForSection.length > 0 ? (
                <>
                  <View style={styles.verticalList}>
                    {nearbyRestaurantsForSection.map((restaurant) => (
                      <RestaurantHeroCard
                        key={restaurant._id}
                        name={restaurant.name}
                        subtitle={mapRestaurantCardSubtitle(restaurant)}
                        imageUrl={
                          restaurant.coverImage?.url ||
                          restaurant.logo?.url ||
                          null
                        }
                        isOpen={restaurant.isOpen !== false}
                        distanceKm={restaurant.distanceKm}
                        avgRating={restaurant.avgRating}
                        reviewCount={restaurant.reviewCount}
                        offerLabel={offerLabelByRestaurantId.get(
                          restaurant._id,
                        )}
                        lowestMenuPrice={restaurant.lowestMenuPrice}
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
                        onToggleFavorite={() =>
                          handleToggleFavorite(restaurant._id)
                        }
                        onPress={() => goToRestaurant(restaurant)}
                      />
                    ))}
                  </View>

                  <Pressable
                    style={({ pressed }) => [
                      styles.browseAllButton,
                      pressed
                        ? {
                            transform: [{ scale: 0.985 }, { translateY: 1 }],
                            opacity: 0.96,
                          }
                        : null,
                    ]}
                    onPress={() => router.push("/(tabs)/browse")}
                  >
                    <Text style={styles.browseAllButtonText}>
                      Browse all restaurants
                    </Text>
                    <Ionicons
                      name="arrow-forward"
                      size={16}
                      color={palette.foreground}
                    />
                  </Pressable>
                </>
              ) : isUpdatingLocationResults ? null : (
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
      </ScrollView>
      <Modal
        visible={Boolean(showHomeCmsModal && homeCms?.modal.isActive)}
        transparent
        animationType="fade"
        onRequestClose={() => setShowHomeCmsModal(false)}
      >
        {homeCms?.modal.isActive ? (
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
                <Pressable
                  style={[
                    styles.campaignModalAction,
                    {
                      backgroundColor:
                        homeCms.modal.accentColor || palette.primary,
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
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
      </Modal>
    </Screen>
  );
}
