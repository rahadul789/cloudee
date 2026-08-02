import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  InteractionManager,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import { EmptyStateCard } from "@/src/components/empty-state-card";
import { ShimmerBlock } from "@/src/components/loading-skeleton";
import { PressableScale } from "@/src/components/pressable-scale";
import { OfflineNoticeCard } from "@/src/components/offline-notice-card";
import { RemoteImage } from "@/src/components/remote-image";
import { Screen } from "@/src/components/screen";
import {
  useCustomerFavoriteRestaurantIdsQuery,
  useCustomerCustomOfferSummaryQuery,
  useCustomerHowToOrderGuideQuery,
  useCustomerLogoutMutation,
  useCustomerNotificationsInfiniteQuery,
  useCustomerNotificationsQuery,
  useCustomerPaymentSettingsQuery,
  useCustomerProfileQuery,
  useCustomerProfileUpdateMutation,
  useCustomerReferralSummaryQuery,
} from "@/src/hooks/use-customer-api";
import { formatDateTimeAmPm } from "@/src/lib/date-time";
import {
  formatOfferExpiry,
  getOfferAmountLabel,
  getOfferCodeLabel,
} from "@/src/lib/customer-offer-copy";
import { dedupeById } from "@/src/lib/dedupe";
import { formatDeliveryAddress } from "@/src/lib/location-address";
import { isTrustedYoutubeUrl } from "@/src/lib/youtube-url";
import { useIsOnline } from "@/src/hooks/use-network-status";
import { useCustomerAuthStore } from "@/src/store/auth-store";
import { useLocationStore } from "@/src/store/location-store";
import { usePaymentPreferencesStore } from "@/src/store/payment-preferences-store";
import { palette } from "@/src/theme/palette";

const bkashLogo = require("../../assets/images/bkash.png");

type ProfileListItem =
  | "guest"
  | "hero"
  | "offer"
  | "overview"
  | "preferences"
  | "history"
  | "account";

function getCustomerDisplayName(fullName?: string | null) {
  const trimmed = fullName?.trim() ?? "";
  if (!trimmed || trimmed.toLowerCase() === "foodbela user") {
    return "Your name";
  }
  return trimmed;
}

function isPersonalOfferExpired(offer?: { voucherExpiresAt?: string | null }) {
  if (!offer?.voucherExpiresAt) return false;
  const date = new Date(offer.voucherExpiresAt);
  return !Number.isNaN(date.getTime()) && date.getTime() <= Date.now();
}

function isPersonalOfferUsed(offer?: { voucherUsageStatus?: string | null }) {
  return offer?.voucherUsageStatus === "used";
}

function useDeferredProfileWork(enabled: boolean) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setReady(false);
      return;
    }

    const fallbackTimer = setTimeout(() => setReady(true), 900);
    const task = InteractionManager.runAfterInteractions(() => {
      clearTimeout(fallbackTimer);
      setReady(true);
    });

    return () => {
      clearTimeout(fallbackTimer);
      task.cancel();
    };
  }, [enabled]);

  return ready;
}

export default function ProfileScreen() {
  const router = useRouter();
  const navigate = useCallback(
    (target: Parameters<typeof router.push>[0]) => {
      InteractionManager.runAfterInteractions(() => {
        router.push(target);
      });
    },
    [router],
  );
  const [logoutConfirmVisible, setLogoutConfirmVisible] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const customer = useCustomerAuthStore((state) => state.customer);
  const deferredProfileWorkReady = useDeferredProfileWork(Boolean(customer));
  const profileQuery = useCustomerProfileQuery(Boolean(customer));
  const logoutMutation = useCustomerLogoutMutation();
  const profileUpdateMutation = useCustomerProfileUpdateMutation();
  const serverPromotionsEnabled =
    customer?.notificationSettings?.promotions !== false;
  // Track the toggle locally so the Switch flips in the same commit as the tap.
  // Relying on the mutation's async isPending caused the knob to snap back to the
  // server value for a frame before re-applying — the "back then switch" glitch.
  const [optimisticPromotions, setOptimisticPromotions] = useState<
    boolean | null
  >(null);
  const promotionsEnabled = optimisticPromotions ?? serverPromotionsEnabled;
  const togglePromotions = useCallback(
    (next: boolean) => {
      setOptimisticPromotions(next);
      profileUpdateMutation.mutate(
        { notificationSettings: { promotions: next } },
        {
          // Server is authoritative once it responds; on failure fall back to it.
          onSuccess: () => setOptimisticPromotions(null),
          onError: () => setOptimisticPromotions(null),
        },
      );
    },
    [profileUpdateMutation],
  );
  const notificationsQuery = useCustomerNotificationsQuery(
    deferredProfileWorkReady,
  );
  const personalOffersQuery = useCustomerNotificationsInfiniteQuery(
    deferredProfileWorkReady,
    3,
    "personal_offers",
  );
  const customOfferSummaryQuery = useCustomerCustomOfferSummaryQuery(
    deferredProfileWorkReady,
  );
  const favoriteRestaurantIdsQuery = useCustomerFavoriteRestaurantIdsQuery(
    deferredProfileWorkReady,
  );
  const paymentSettingsQuery = useCustomerPaymentSettingsQuery();
  const howToOrderGuideQuery = useCustomerHowToOrderGuideQuery(
    deferredProfileWorkReady,
  );
  const referralSummaryQuery = useCustomerReferralSummaryQuery(
    deferredProfileWorkReady,
  );
  const selectedLocation = useLocationStore((state) => state.selectedLocation);
  const preferredPaymentMethod = usePaymentPreferencesStore(
    (state) => state.preferredPaymentMethod,
  );
  const isOnline = useIsOnline();
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        profileQuery.refetch(),
        notificationsQuery.refetch(),
        personalOffersQuery.refetch(),
        customOfferSummaryQuery.refetch(),
        favoriteRestaurantIdsQuery.refetch(),
        paymentSettingsQuery.refetch(),
        referralSummaryQuery.refetch(),
        howToOrderGuideQuery.refetch(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [
    customOfferSummaryQuery,
    favoriteRestaurantIdsQuery,
    howToOrderGuideQuery,
    notificationsQuery,
    paymentSettingsQuery,
    personalOffersQuery,
    profileQuery,
    referralSummaryQuery,
  ]);
  const unreadCount = notificationsQuery.data?.unreadCount ?? 0;
  const personalOffers = useMemo(
    () =>
      dedupeById(
        personalOffersQuery.data?.pages.flatMap((page) => page.items) ?? [],
      ),
    [personalOffersQuery.data?.pages],
  );
  const activePersonalOffers = useMemo(
    () =>
      personalOffers
        .filter(
          (offer) =>
            !isPersonalOfferExpired(offer) && !isPersonalOfferUsed(offer),
        )
        .sort(
          (left, right) =>
            new Date(right.createdAt ?? 0).getTime() -
            new Date(left.createdAt ?? 0).getTime(),
        ),
    [personalOffers],
  );
  const activeHighlightedOffer = activePersonalOffers[0];
  const activeOfferCount = activePersonalOffers.length;
  const customOfferSummary = customOfferSummaryQuery.data;
  const customOfferProgressPercent = Math.round(
    Math.max(0, Math.min(customOfferSummary?.progressRatio ?? 0, 1)) * 100,
  );
  const shouldShowCustomOfferSection =
    customOfferSummary?.enabled !== false &&
    customOfferSummary?.profileSectionEnabled !== false;
  const canRequestCustomOffer =
    customOfferSummary?.enabled !== false &&
    customOfferSummary?.status === "eligible";
  const customOfferTitle = useMemo(() => {
    if (customOfferSummary?.status === "requested") {
      return "Request sent";
    }
    if (customOfferSummary?.status === "eligible") {
      return "Offer unlocked";
    }
    if (activeHighlightedOffer) {
      return getOfferCodeLabel(activeHighlightedOffer);
    }
    if (customOfferSummary?.status === "ready") {
      return getOfferCodeLabel(customOfferSummary);
    }
    return "My offer";
  }, [customOfferSummary, activeHighlightedOffer]);
  const customOfferMeta = useMemo(() => {
    if (customOfferSummary?.status === "requested") {
      return "In review";
    }
    if (customOfferSummary?.status === "eligible") {
      return activeOfferCount > 0
        ? "Request your next voucher"
        : "Ready to request";
    }
    if (activeHighlightedOffer) {
      return `${getOfferAmountLabel(activeHighlightedOffer)} - ${formatOfferExpiry(
        activeHighlightedOffer.voucherExpiresAt,
      )}`;
    }
    if (customOfferSummary?.status === "ready") {
      return `${getOfferAmountLabel(customOfferSummary)} - ${formatOfferExpiry(
        customOfferSummary.voucherExpiresAt,
      )}`;
    }
    if (!deferredProfileWorkReady || customOfferSummaryQuery.isLoading) {
      return "Checking orders";
    }
    const remaining = customOfferSummary?.remainingOrderCount ?? 10;
    return `${remaining} ${remaining === 1 ? "order" : "orders"} left`;
  }, [
    customOfferSummary,
    customOfferSummaryQuery.isLoading,
    deferredProfileWorkReady,
    activeHighlightedOffer,
    activeOfferCount,
  ]);
  const favoriteCount = favoriteRestaurantIdsQuery.data?.length ?? 0;
  const referralSummary = referralSummaryQuery.data;
  const isReferralSummaryLoading =
    Boolean(customer) &&
    (!deferredProfileWorkReady || referralSummaryQuery.isLoading);
  const shouldShowReferral = referralSummary?.enabled === true;
  const referralRewardLabel = referralSummary
    ? `Tk ${Math.round(referralSummary.rewardAmount)}`
    : "Reward";

  const displayName = useMemo(
    () => getCustomerDisplayName(customer?.fullName),
    [customer?.fullName],
  );
  const heroLocationText = useMemo(() => {
    const typedAddress = selectedLocation?.addressDetails?.trim();
    return (
      typedAddress ||
      formatDeliveryAddress(selectedLocation, "Set delivery point")
    );
  }, [selectedLocation]);
  const initials = useMemo(() => {
    const base = displayName
      .split(" ")
      .map((part) => part.trim().charAt(0))
      .join("")
      .slice(0, 2)
      .toUpperCase();

    if (base) return base;
    return customer?.phone?.slice(-2) ?? "CU";
  }, [customer?.phone, displayName]);
  const paymentSettings = paymentSettingsQuery.data ?? {
    cashOnDeliveryEnabled: true,
    bkashEnabled: false,
    bkashLabel: "bKash",
    bkashSubtitle: "Continue to the official hosted payment page.",
    bkashRefundEtaMinutes: 60,
  };
  const howToOrderYoutubeUrl = isTrustedYoutubeUrl(
    howToOrderGuideQuery.data?.youtubeUrl,
  )
    ? howToOrderGuideQuery.data?.youtubeUrl.trim()
    : "";
  const openHowToOrder = useCallback(() => {
    if (!howToOrderYoutubeUrl) {
      navigate("/order-help");
      return;
    }

    void Linking.openURL(howToOrderYoutubeUrl).catch(() => {
      navigate("/order-help");
    });
  }, [howToOrderYoutubeUrl, navigate]);
  const openSignIn = useCallback(() => {
    navigate({
      pathname: "/sign-in",
      params: { redirectTo: "/(tabs)/profile" },
    });
  }, [navigate]);
  const openNotifications = useCallback(
    () => navigate("/notifications"),
    [navigate],
  );
  const openOffers = useCallback(() => navigate("/offers"), [navigate]);
  const openProfileEdit = useCallback(
    () => navigate("/profile-edit"),
    [navigate],
  );
  const openLocationPicker = useCallback(
    () => navigate("/location-picker"),
    [navigate],
  );
  const openFavoriteRestaurants = useCallback(
    () => navigate("/favorite-restaurants"),
    [navigate],
  );
  const openReferrals = useCallback(() => navigate("/referrals"), [navigate]);
  const openSupport = useCallback(() => navigate("/support"), [navigate]);
  const openPaymentPreferences = useCallback(
    () => navigate("/payment-preferences"),
    [navigate],
  );
  const openProfilePassword = useCallback(
    () => navigate("/profile-password"),
    [navigate],
  );
  const openPrivacyPolicy = useCallback(
    () => navigate("/privacy-policy"),
    [navigate],
  );
  const showLogoutConfirm = useCallback(() => {
    setLogoutConfirmVisible(true);
  }, []);
  const profileListItems = useMemo<ProfileListItem[]>(() => {
    if (!customer) {
      return ["guest"];
    }

    const items: ProfileListItem[] = shouldShowCustomOfferSection
      ? ["hero", "offer", "overview"]
      : ["hero", "overview"];
    if (deferredProfileWorkReady) {
      items.push("preferences");
      if ((customer.previousPhones?.length ?? 0) > 0) {
        items.push("history");
      }
      items.push("account");
    }

    return items;
  }, [customer, deferredProfileWorkReady, shouldShowCustomOfferSection]);
  const keyExtractor = useCallback((item: ProfileListItem) => item, []);
  const renderProfileItem = useCallback(
    ({ item }: { item: ProfileListItem }) => {
      if (item === "guest") {
        return (
          <View style={styles.emptyWrap}>
            <EmptyStateCard
              title="You are not signed in"
              description="Sign in with your phone to unlock checkout, favorites, and order history."
              actionLabel="Sign in"
              onPress={openSignIn}
            />
          </View>
        );
      }

      if (!customer) {
        return null;
      }

      switch (item) {
        case "hero":
          return (
            <View style={styles.hero}>
              <View pointerEvents="none" style={styles.heroGlowPrimary} />
              <View pointerEvents="none" style={styles.heroGlowSecondary} />
              <View style={styles.heroTopRow}>
                <Text style={styles.kicker}>Profile</Text>
                <PressableScale
                  scaleTo={0.95}
                  style={styles.heroGhostButton}
                  onPress={openNotifications}
                >
                  <Ionicons
                    name="notifications-outline"
                    size={16}
                    color={palette.foreground}
                  />
                  <Text style={styles.heroGhostButtonText}>Alerts</Text>
                  {unreadCount > 0 ? (
                    <View style={styles.heroGhostBadge}>
                      <Text style={styles.heroGhostBadgeText}>
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </Text>
                    </View>
                  ) : null}
                </PressableScale>
              </View>

              <View style={styles.identityCard}>
                <View style={styles.avatar}>
                  {customer.profileImage?.url ? (
                    <RemoteImage
                      uri={customer.profileImage.url}
                      style={styles.avatarImage}
                      fallbackIcon="person-outline"
                      fallbackIconSize={24}
                      accessibilityLabel="Profile photo"
                    />
                  ) : (
                    <Text style={styles.avatarText}>{initials}</Text>
                  )}
                </View>

                <View style={styles.identityCopy}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={2}>
                      {displayName}
                    </Text>
                    <PressableScale
                      scaleTo={0.9}
                      style={styles.nameEditButton}
                      onPress={openProfileEdit}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel="Edit your name"
                    >
                      <Ionicons
                        name="create-outline"
                        size={17}
                        color={palette.foreground}
                      />
                    </PressableScale>
                  </View>
                  <Text style={styles.subtitle}>
                    Keep your account, notifications, rewards, and support
                    details in one place.
                  </Text>

                  <View style={styles.heroPillRow}>
                    <InfoPill
                      icon="location-outline"
                      text={heroLocationText}
                      onPress={openLocationPicker}
                    />
                  </View>
                </View>
              </View>
            </View>
          );
        case "offer":
          return (
            <PressableScale
              scaleTo={0.98}
              style={styles.offerPeekCard}
              onPress={openOffers}
            >
              {activeOfferCount > 0 ? (
                <View style={styles.offerCountBadge}>
                  <Text style={styles.offerCountBadgeText}>
                    {activeOfferCount}
                  </Text>
                </View>
              ) : null}
              <View style={styles.offerPeekHeader}>
                <View style={styles.offerPeekIcon}>
                  <Ionicons
                    name="ticket-outline"
                    size={21}
                    color={palette.secondary}
                  />
                </View>
                <View style={styles.offerPeekCopy}>
                  <Text style={styles.offerPeekLabel}>My offer</Text>
                  <Text style={styles.offerPeekTitle} numberOfLines={1}>
                    {customOfferTitle}
                  </Text>
                  <Text style={styles.offerPeekMeta} numberOfLines={1}>
                    {customOfferMeta}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#D7DBE5" />
              </View>

              <View style={styles.offerProgressHeader}>
                <Text style={styles.offerProgressLabel}>
                  {customOfferSummary?.status === "ready" ||
                  activeHighlightedOffer
                    ? "Ready"
                    : customOfferSummary?.status === "requested"
                      ? "Request sent"
                      : canRequestCustomOffer
                        ? "Ready to request"
                        : `${customOfferSummary?.remainingOrderCount ?? 10} ${
                            (customOfferSummary?.remainingOrderCount ?? 10) ===
                            1
                              ? "order"
                              : "orders"
                          } left to unlock`}
                </Text>
                <Text style={styles.offerProgressCount}>
                  {customOfferSummary?.completedOrderCount ?? 0}/
                  {customOfferSummary?.targetOrderCount ?? 10}
                </Text>
              </View>
              <View style={styles.offerProgressTrack}>
                <View
                  style={[
                    styles.offerProgressFill,
                    { width: `${customOfferProgressPercent}%` },
                  ]}
                />
              </View>
              <Text style={styles.offerDetailHint}>View</Text>
            </PressableScale>
          );
        case "overview":
          return (
            <View style={styles.section}>
              <SectionHeader
                title="Overview"
                subtitle="Quick signals for the things you use most."
              />

              {!isOnline ? (
                <View style={styles.sectionNoticeWrap}>
                  <OfflineNoticeCard description="Showing your saved profile details. Reconnect to refresh alerts and update account changes." />
                </View>
              ) : null}

              <View style={styles.overviewGrid}>
                <OverviewCard
                  icon="call-outline"
                  label="Phone"
                  value={customer.phone}
                  caption="Verified"
                  tint="#E8F1FF"
                />
                <OverviewCard
                  icon="heart-outline"
                  label="Favorites"
                  value={`${favoriteCount}`}
                  caption="Saved restaurants"
                  tint="#FFF1C9"
                  onPress={openFavoriteRestaurants}
                />
                {isReferralSummaryLoading ? (
                  <ReferralOverviewCardSkeleton />
                ) : shouldShowReferral ? (
                  <OverviewCard
                    icon="gift-outline"
                    label="Refer"
                    value={referralRewardLabel}
                    caption="Per reward"
                    tint="#FFF0F6"
                    highlight
                    onPress={openReferrals}
                  />
                ) : null}
                <OverviewCard
                  icon="help-circle-outline"
                  label="Help center"
                  value="Open"
                  caption="Support and guides"
                  tint="#E8FFF1"
                  onPress={openSupport}
                />
              </View>
            </View>
          );
        case "preferences":
          return (
            <View style={styles.section}>
              <SectionHeader
                title="Preferences"
                subtitle="Open a section to manage the details."
              />

              <View style={styles.cardStack}>
                <ProfileNavCard
                  icon={
                    preferredPaymentMethod === "Bkash"
                      ? "phone-portrait-outline"
                      : "cash-outline"
                  }
                  imageSource={
                    preferredPaymentMethod === "Bkash" ? bkashLogo : undefined
                  }
                  tint="#FFF0F6"
                  title="Default payment method"
                  caption={
                    preferredPaymentMethod === "Bkash"
                      ? paymentSettings.bkashLabel
                      : "Cash on delivery"
                  }
                  onPress={openPaymentPreferences}
                />
                <ProfileNavCard
                  icon="person-outline"
                  tint="#FFE7F1"
                  title="Personal info"
                  onPress={openProfileEdit}
                />
                <ProfileNavCard
                  icon="location-outline"
                  tint="#FFF0E8"
                  title="Delivery point"
                  onPress={openLocationPicker}
                />
                <ProfileNavCard
                  icon="lock-closed-outline"
                  tint="#EEF8F2"
                  title={
                    customer.hasPassword ? "Change password" : "Add password"
                  }
                  onPress={openProfilePassword}
                />
                {isReferralSummaryLoading ? (
                  <ReferralNavCardSkeleton />
                ) : shouldShowReferral ? (
                  <ProfileNavCard
                    icon="gift-outline"
                    tint="#FFF0F6"
                    title="Refer & earn"
                    caption={`${referralRewardLabel} reward available`}
                    highlight
                    onPress={openReferrals}
                  />
                ) : null}
                <ProfileNavCard
                  icon="logo-youtube"
                  iconColor="#FF0000"
                  tint="#FFECEC"
                  trailingIcon="open-outline"
                  title="How to order"
                  caption="Watch the quick video guide"
                  onPress={openHowToOrder}
                />
                <ProfileNavCard
                  icon="notifications-outline"
                  tint="#EEF5FF"
                  title="Notifications center"
                  onPress={openNotifications}
                />
                <View style={styles.navCard}>
                  <View
                    style={[styles.navIconWrap, { backgroundColor: "#FFF3E0" }]}
                  >
                    <Ionicons
                      name="megaphone-outline"
                      size={18}
                      color={palette.foreground}
                    />
                  </View>
                  <View style={styles.navCopy}>
                    <Text style={styles.navTitle}>
                      Promotional notifications
                    </Text>
                    <Text style={styles.navCaption}>
                      Offers, vouchers and campaign updates
                    </Text>
                  </View>
                  <Switch
                    value={promotionsEnabled}
                    onValueChange={togglePromotions}
                    trackColor={{ true: palette.secondary, false: "#E4D7DE" }}
                    thumbColor="#ffffff"
                  />
                </View>
                <ProfileNavCard
                  icon="help-circle-outline"
                  tint="#FFF0E8"
                  title="Help center"
                  onPress={openSupport}
                />
                <ProfileNavCard
                  icon="shield-checkmark-outline"
                  tint="#EEF8F2"
                  title="Privacy policy"
                  onPress={openPrivacyPolicy}
                />
              </View>
            </View>
          );
        case "history":
          return (
            <View style={styles.section}>
              <SectionHeader
                title="Account history"
                subtitle="Past verified numbers tied to this account."
              />
              <View style={styles.cardStack}>
                <View style={styles.historyCard}>
                  {customer.previousPhones?.map((entry, index) => (
                    <View
                      key={`${entry.phone}-${index}`}
                      style={[
                        styles.historyRow,
                        index < (customer.previousPhones?.length ?? 0) - 1
                          ? styles.historyRowBorder
                          : null,
                      ]}
                    >
                      <View style={styles.historyDot} />
                      <View style={styles.historyCopy}>
                        <Text style={styles.historyTitle}>{entry.phone}</Text>
                        <Text style={styles.historyMeta}>
                          {entry.changedAt
                            ? formatDateTimeAmPm(entry.changedAt)
                            : "Change date unavailable"}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          );
        case "account":
          return (
            <View style={styles.section}>
              <SectionHeader
                title="Account"
                subtitle="Sign out when from this device."
              />
              <View style={styles.cardStack}>
                <Pressable
                  style={({ pressed }) => [
                    styles.logoutCard,
                    logoutMutation.isPending ? styles.disabledCard : null,
                    pressed && !logoutMutation.isPending
                      ? styles.navCardPressed
                      : null,
                  ]}
                  disabled={logoutMutation.isPending}
                  onPress={showLogoutConfirm}
                >
                  <View style={styles.logoutIconWrap}>
                    {logoutMutation.isPending ? (
                      <ActivityIndicator size="small" color={palette.primary} />
                    ) : (
                      <Ionicons
                        name="log-out-outline"
                        size={18}
                        color={palette.primary}
                      />
                    )}
                  </View>
                  <View style={styles.logoutCopy}>
                    <Text style={styles.logoutTitle}>Sign out</Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={palette.mutedForeground}
                  />
                </Pressable>
              </View>
            </View>
          );
        default:
          return null;
      }
    },
    [
      activeOfferCount,
      canRequestCustomOffer,
      customer,
      customOfferMeta,
      customOfferProgressPercent,
      customOfferSummary?.completedOrderCount,
      customOfferSummary?.remainingOrderCount,
      customOfferSummary?.status,
      customOfferSummary?.targetOrderCount,
      customOfferTitle,
      displayName,
      favoriteCount,
      activeHighlightedOffer,
      heroLocationText,
      initials,
      isOnline,
      isReferralSummaryLoading,
      logoutMutation.isPending,
      openFavoriteRestaurants,
      openHowToOrder,
      openLocationPicker,
      openNotifications,
      openOffers,
      openPaymentPreferences,
      openPrivacyPolicy,
      openProfileEdit,
      openProfilePassword,
      openReferrals,
      openSignIn,
      openSupport,
      paymentSettings.bkashLabel,
      preferredPaymentMethod,
      promotionsEnabled,
      togglePromotions,
      referralRewardLabel,
      shouldShowReferral,
      showLogoutConfirm,
      unreadCount,
    ],
  );

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          !customer ? styles.guestContainer : null,
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={palette.secondary}
            colors={[palette.secondary]}
          />
        }
      >
        {profileListItems.map((item, index) => (
          <View key={keyExtractor(item)}>
            {index > 0 ? <ProfileListSeparator /> : null}
            {renderProfileItem({ item })}
          </View>
        ))}
      </ScrollView>

      <Modal
        visible={logoutConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLogoutConfirmVisible(false)}
      >
        <View style={styles.confirmOverlay}>
          <Pressable
            style={styles.confirmBackdrop}
            onPress={() => setLogoutConfirmVisible(false)}
          />
          <View style={styles.confirmCard}>
            <View style={styles.confirmIconWrap}>
              <Ionicons
                name="log-out-outline"
                size={26}
                color={palette.primary}
              />
            </View>
            <Text style={styles.confirmTitle}>Sign out?</Text>
            <Text style={styles.confirmText}>
              You can still browse restaurants as a guest. Sign in again when
              you want to checkout or view orders.
            </Text>
            <View style={styles.confirmActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.confirmSecondaryButton,
                  pressed && styles.confirmButtonPressed,
                ]}
                onPress={() => setLogoutConfirmVisible(false)}
              >
                <Text style={styles.confirmSecondaryText}>Stay signed in</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.confirmPrimaryButton,
                  pressed && styles.confirmButtonPressed,
                ]}
                disabled={logoutMutation.isPending}
                onPress={() => {
                  setLogoutConfirmVisible(false);
                  logoutMutation.mutate();
                }}
              >
                {logoutMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.confirmPrimaryText}>Sign out</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const ProfileListSeparator = memo(function ProfileListSeparator() {
  return <View style={styles.profileListSeparator} />;
});

const SectionHeader = memo(function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
    </View>
  );
});

const InfoPill = memo(function InfoPill({
  icon,
  text,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  onPress?: () => void;
}) {
  const content = (
    <>
      <Ionicons name={icon} size={14} color={palette.foreground} />
      <Text style={styles.infoPillText} numberOfLines={1}>
        {text}
      </Text>
      {onPress ? (
        <Ionicons
          name="chevron-forward"
          size={13}
          color={palette.mutedForeground}
        />
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <PressableScale
        scaleTo={0.95}
        style={styles.infoPill}
        onPress={onPress}
        accessibilityRole="button"
      >
        {content}
      </PressableScale>
    );
  }

  return <View style={styles.infoPill}>{content}</View>;
});

const OverviewCard = memo(function OverviewCard({
  icon,
  label,
  value,
  caption,
  tint,
  wide = false,
  onPress,
  highlight = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  caption: string;
  tint: string;
  wide?: boolean;
  onPress?: () => void;
  highlight?: boolean;
}) {
  const cardStyle = [
    styles.overviewCard,
    wide ? styles.overviewCardWide : null,
    highlight ? styles.overviewCardHighlighted : null,
    { backgroundColor: tint },
  ];

  if (!onPress) {
    return (
      <View style={cardStyle}>
        <View style={styles.overviewIconWrap}>
          <Ionicons name={icon} size={18} color={palette.foreground} />
        </View>
        <Text style={styles.overviewValue} numberOfLines={1}>
          {value}
        </Text>
        <Text style={styles.overviewLabel}>{label}</Text>
        <Text style={styles.overviewCaption}>{caption}</Text>
      </View>
    );
  }

  return (
    <PressableScale
      scaleTo={0.97}
      onPress={onPress}
      accessibilityRole="button"
      containerStyle={wide ? styles.overviewCardSlotWide : styles.overviewCardSlot}
      style={[
        styles.overviewCard,
        styles.overviewCardFill,
        wide ? styles.overviewCardWide : null,
        highlight ? styles.overviewCardHighlighted : null,
        { backgroundColor: tint },
      ]}
    >
      <View style={styles.overviewActionCue}>
        <Ionicons name="chevron-forward" size={14} color={palette.foreground} />
      </View>
      <View style={styles.overviewIconWrap}>
        <Ionicons name={icon} size={18} color={palette.foreground} />
      </View>
      <Text style={styles.overviewValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.overviewLabel}>{label}</Text>
      <Text style={styles.overviewCaption}>{caption}</Text>
    </PressableScale>
  );
});

const ReferralOverviewCardSkeleton = memo(
  function ReferralOverviewCardSkeleton() {
    return (
      <View style={[styles.overviewCard, styles.referralSkeletonCard]}>
        <ShimmerBlock style={styles.referralSkeletonIcon} />
        <ShimmerBlock style={styles.referralSkeletonValue} />
        <ShimmerBlock style={styles.referralSkeletonLabel} />
        <ShimmerBlock style={styles.referralSkeletonCaption} />
      </View>
    );
  },
);

const ProfileNavCard = memo(function ProfileNavCard({
  icon,
  imageSource,
  tint,
  title,
  caption,
  onPress,
  highlight = false,
  iconColor = palette.foreground,
  trailingIcon = "chevron-forward",
}: {
  icon: keyof typeof Ionicons.glyphMap;
  imageSource?: number;
  tint: string;
  title: string;
  caption?: string;
  onPress: () => void;
  highlight?: boolean;
  iconColor?: string;
  trailingIcon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <PressableScale
      scaleTo={0.97}
      accessibilityRole="button"
      style={[
        styles.navCard,
        highlight ? styles.navCardHighlighted : null,
      ]}
      onPress={onPress}
    >
      <View style={[styles.navIconWrap, { backgroundColor: tint }]}>
        {imageSource ? (
          <Image
            source={imageSource}
            resizeMode="contain"
            style={styles.navLogoImage}
          />
        ) : (
          <Ionicons name={icon} size={18} color={iconColor} />
        )}
      </View>
      <View style={styles.navCopy}>
        <Text style={styles.navTitle}>{title}</Text>
        {caption ? <Text style={styles.navCaption}>{caption}</Text> : null}
      </View>
      <Ionicons name={trailingIcon} size={18} color={palette.mutedForeground} />
    </PressableScale>
  );
});

const ReferralNavCardSkeleton = memo(function ReferralNavCardSkeleton() {
  return (
    <View style={[styles.navCard, styles.referralNavSkeletonCard]}>
      <ShimmerBlock style={styles.referralNavSkeletonIcon} />
      <View style={styles.navCopy}>
        <ShimmerBlock style={styles.referralNavSkeletonTitle} />
        <ShimmerBlock style={styles.referralNavSkeletonCaption} />
      </View>
      <ShimmerBlock style={styles.referralNavSkeletonChevron} />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  profileListSeparator: { height: 28 },
  guestContainer: {
    justifyContent: "center",
  },
  emptyWrap: {
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  hero: {
    overflow: "hidden",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 24,
    backgroundColor: palette.heroBackground,
    borderBottomLeftRadius: 34,
    borderBottomRightRadius: 34,
    gap: 18,
  },
  heroGlowPrimary: {
    position: "absolute",
    top: -54,
    right: -28,
    width: 170,
    height: 170,
    borderRadius: 999,
    backgroundColor: palette.heroOrbPrimary,
  },
  heroGlowSecondary: {
    position: "absolute",
    bottom: -62,
    left: -40,
    width: 160,
    height: 160,
    borderRadius: 999,
    backgroundColor: palette.heroOrbSecondary,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  kicker: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: palette.primary,
  },
  heroGhostButton: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.84)",
  },
  heroGhostBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.secondary,
  },
  heroGhostBadgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "800",
    color: "#fff",
  },
  heroGhostButtonText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    color: palette.foreground,
  },
  identityCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.86)",
    shadowColor: palette.shadow,
    borderWidth: 1,
    borderColor: "rgba(31, 36, 48, 0.06)",
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 999,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF8DB1",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarText: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
    color: palette.surface,
  },
  identityCopy: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  name: {
    flex: 1,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    color: palette.foreground,
  },
  nameEditButton: {
    width: 34,
    height: 34,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(31, 36, 48, 0.08)",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "500",
    color: palette.mutedForeground,
  },
  heroPillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  infoPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: palette.surface,
    maxWidth: "100%",
    flexShrink: 1,
  },
  infoPillText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    color: palette.foreground,
    flexShrink: 1,
    minWidth: 0,
  },
  offerPeekCard: {
    position: "relative",
    marginHorizontal: 20,
    marginTop: -6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    backgroundColor: "#171923",
    padding: 12,
    gap: 9,
  },
  offerCountBadge: {
    position: "absolute",
    top: -8,
    right: -8,
    zIndex: 2,
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: "#171923",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 7,
    backgroundColor: palette.secondary,
  },
  offerCountBadgeText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  offerPeekHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  offerPeekIcon: {
    width: 40,
    height: 40,
    borderRadius: 15,
    backgroundColor: "rgba(255, 92, 147, 0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  offerPeekCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  offerPeekLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    color: "#FF8FBC",
  },
  offerPeekTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  offerPeekMeta: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    color: "#C9CEDA",
  },
  offerCodeChip: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    marginTop: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255, 143, 188, 0.35)",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  offerCodeChipLabel: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "800",
    color: "#FFB6D1",
    textTransform: "uppercase",
  },
  offerCodeChipValue: {
    maxWidth: 132,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 0,
  },
  offerProgressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  offerProgressLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
    color: "#C9CEDA",
    textTransform: "uppercase",
  },
  offerProgressCount: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  offerProgressTrack: {
    height: 7,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.14)",
  },
  offerProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: palette.secondary,
  },
  offerDetailHint: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  offerDetailsProgressCard: {
    width: "100%",
    gap: 8,
    borderRadius: 18,
    backgroundColor: "#FFF7FA",
    padding: 14,
  },
  offerCodeFieldWrap: {
    width: "100%",
    gap: 7,
    alignItems: "stretch",
  },
  offerCodeReadOnly: {
    width: "100%",
    gap: 6,
    borderRadius: 16,
    backgroundColor: "#F7F8FA",
    padding: 12,
  },
  offerCodeLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    color: palette.foreground,
  },
  offerCodeInput: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    color: palette.foreground,
  },
  offerCodeValue: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    color: palette.secondary,
  },
  offerActionRow: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  offerActionText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  offerActionButton: {
    minWidth: 78,
    minHeight: 38,
    borderRadius: 999,
    paddingHorizontal: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.secondary,
  },
  offerActionButtonMuted: {
    backgroundColor: "#C9CDD5",
  },
  offerActionButtonText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  section: { gap: 14 },
  sectionHeader: {
    paddingHorizontal: 20,
    gap: 3,
  },
  sectionTitle: {
    fontSize: 21,
    lineHeight: 27,
    fontWeight: "800",
    color: palette.foreground,
  },
  sectionSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "500",
    color: palette.mutedForeground,
  },
  overviewGrid: {
    paddingHorizontal: 20,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  sectionNoticeWrap: {
    paddingHorizontal: 20,
  },
  overviewCard: {
    position: "relative",
    width: "48%",
    minHeight: 132,
    padding: 16,
    borderRadius: 28,
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(31, 36, 48, 0.06)",
    shadowColor: palette.shadow,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  overviewCardWide: {
    width: "100%",
    minHeight: 112,
  },
  // PressableScale wraps the card in an Animated.View; the grid width must live on that
  // outer view (containerStyle), while the inner Pressable fills it (else "48%" resolves
  // against a shrink-to-fit box ≈ 0).
  overviewCardSlot: {
    width: "48%",
  },
  overviewCardSlotWide: {
    width: "100%",
  },
  overviewCardFill: {
    width: "100%",
  },
  overviewCardHighlighted: {
    borderWidth: 1,
    borderColor: "rgba(228, 17, 111, 0.34)",
    shadowOpacity: 0,
  },
  referralSkeletonCard: {
    backgroundColor: "#F0F7FF",
    borderWidth: 0,
  },
  referralSkeletonIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  referralSkeletonValue: {
    width: "52%",
    height: 22,
    borderRadius: 11,
  },
  referralSkeletonLabel: {
    width: "46%",
    height: 15,
    borderRadius: 8,
  },
  referralSkeletonCaption: {
    width: "64%",
    height: 12,
    borderRadius: 6,
  },
  overviewIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.82)",
  },
  overviewActionCue: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 26,
    height: 26,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.68)",
  },
  overviewValue: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "800",
    color: palette.foreground,
  },
  overviewLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: palette.foreground,
  },
  overviewCaption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  cardStack: {
    paddingHorizontal: 20,
    gap: 12,
  },
  navCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 28,
    backgroundColor: palette.surface,
    shadowColor: palette.shadow,
    borderWidth: 1,
    borderColor: "rgba(31, 36, 48, 0.06)",
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  navCardPressed: {
    transform: [{ scale: 0.985 }, { translateY: 1 }],
    opacity: 0.95,
  },
  iconButtonPressed: {
    transform: [{ scale: 0.94 }],
    opacity: 0.9,
  },
  navCardHighlighted: {
    borderWidth: 1,
    borderColor: "rgba(216, 27, 96, 0.22)",
    backgroundColor: "#FFF7FB",
  },
  referralNavSkeletonCard: {
    borderWidth: 0,
    backgroundColor: palette.surface,
  },
  referralNavSkeletonIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  referralNavSkeletonTitle: {
    width: "46%",
    height: 16,
    borderRadius: 8,
  },
  referralNavSkeletonCaption: {
    marginTop: 4,
    width: "62%",
    height: 12,
    borderRadius: 6,
  },
  referralNavSkeletonChevron: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  navIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  navLogoImage: {
    width: 26,
    height: 26,
  },
  navCopy: {
    flex: 1,
    gap: 0,
  },
  navTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    color: palette.foreground,
  },
  navCaption: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  historyCard: {
    borderRadius: 28,
    backgroundColor: palette.surface,
    padding: 16,
    shadowColor: palette.shadow,
    borderWidth: 1,
    borderColor: "rgba(31, 36, 48, 0.06)",
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 10,
  },
  historyRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  historyDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: palette.primary,
    marginTop: 5,
  },
  historyCopy: { flex: 1, gap: 2 },
  historyTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: palette.foreground,
  },
  historyMeta: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  logoutCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 28,
    backgroundColor: palette.surface,
    shadowColor: palette.shadow,
    borderWidth: 1,
    borderColor: "rgba(31, 36, 48, 0.06)",
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  disabledCard: {
    opacity: 0.65,
  },
  logoutIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFEAF3",
  },
  logoutCopy: {
    flex: 1,
  },
  logoutTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: palette.foreground,
  },
  confirmOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  confirmBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(31, 36, 48, 0.42)",
  },
  confirmCard: {
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    gap: 12,
    borderRadius: 24,
    backgroundColor: palette.surface,
    padding: 20,
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  confirmIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFEAF3",
  },
  confirmTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
    color: palette.foreground,
  },
  confirmText: {
    textAlign: "center",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "500",
    color: palette.mutedForeground,
  },
  confirmActions: {
    width: "100%",
    gap: 10,
    marginTop: 4,
  },
  confirmSecondaryButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  confirmSecondaryText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    color: palette.foreground,
  },
  confirmPrimaryButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: palette.secondary,
  },
  confirmPrimaryText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    color: "#fff",
  },
  confirmButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
});
