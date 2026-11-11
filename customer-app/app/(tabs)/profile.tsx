import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  InteractionManager,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import { EmptyStateCard } from "@/src/components/empty-state-card";
import { AccountRewardsCard } from "@/src/components/rewards/account-rewards-card";
import { BelaPullToRefresh } from "@/src/components/bela-pull-to-refresh";
import { ShimmerBlock } from "@/src/components/loading-skeleton";
import { PressableScale } from "@/src/components/pressable-scale";
import { OfflineNoticeCard } from "@/src/components/offline-notice-card";
import { RemoteImage } from "@/src/components/remote-image";
import { Screen } from "@/src/components/screen";
import { AppDialog } from "@/src/components/ui";
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
import { dedupeById } from "@/src/lib/dedupe";
import { formatDeliveryAddress } from "@/src/lib/location-address";
import { isTrustedYoutubeUrl } from "@/src/lib/youtube-url";
import { useIsOnline } from "@/src/hooks/use-network-status";
import { useCustomerAuthStore } from "@/src/store/auth-store";
import { useLocationStore } from "@/src/store/location-store";
import { usePaymentPreferencesStore } from "@/src/store/payment-preferences-store";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  const insets = useSafeAreaInsets();
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
  const activeOfferCount = activePersonalOffers.length;
  const customOfferSummary = customOfferSummaryQuery.data;
  const shouldShowCustomOfferSection =
    customOfferSummary?.enabled !== false &&
    customOfferSummary?.profileSectionEnabled !== false;
  const favoriteCount = favoriteRestaurantIdsQuery.data?.length ?? 0;
  const referralSummary = referralSummaryQuery.data;
  const isReferralSummaryLoading =
    Boolean(customer) &&
    (!deferredProfileWorkReady || referralSummaryQuery.isLoading);
  const shouldShowReferral = referralSummary?.enabled === true;
  const referralRewardLabel = referralSummary
    ? `Tk ${Math.round(referralSummary.rewardAmount)}`
    : "Reward";
  const referralBadge = referralSummary ? `৳${Math.round(referralSummary.rewardAmount)}` : undefined;

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
  const openRewards = useCallback(() => navigate("/rewards"), [navigate]);
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
            <View style={[styles.hero, { paddingTop: insets.top + 10 }]}>
              <View style={styles.heroTopRow}>
                <Text style={styles.heroTitle}>Account</Text>
                <PressableScale
                  scaleTo={0.92}
                  style={styles.heroIconButton}
                  onPress={openNotifications}
                  accessibilityRole="button"
                  accessibilityLabel={
                    unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"
                  }
                >
                  <Ionicons name="notifications-outline" size={20} color={palette.onPrimary} />
                  {unreadCount > 0 ? (
                    <View style={styles.heroBadge}>
                      <Text style={styles.heroBadgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
                    </View>
                  ) : null}
                </PressableScale>
              </View>

              <View style={styles.identityRow}>
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
                  <Text style={styles.name} numberOfLines={1}>
                    {displayName}
                  </Text>
                  <View style={styles.phoneRow}>
                    <Text style={styles.phoneText} numberOfLines={1}>
                      {customer.phone}
                    </Text>
                    <View style={styles.verifiedChip}>
                      <Ionicons name="checkmark-circle" size={12} color={palette.successText} />
                      <Text style={styles.verifiedText}>Verified</Text>
                    </View>
                  </View>
                </View>
                <PressableScale
                  scaleTo={0.92}
                  style={styles.editButton}
                  onPress={openProfileEdit}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Edit profile"
                >
                  <Ionicons name="create-outline" size={15} color={palette.onPrimary} />
                  <Text style={styles.editButtonText}>Edit</Text>
                </PressableScale>
              </View>

              <PressableScale
                scaleTo={0.98}
                style={styles.locationBar}
                onPress={openLocationPicker}
                accessibilityRole="button"
                accessibilityLabel="Change delivery point"
              >
                <Ionicons name="location" size={15} color={palette.onPrimary} />
                <Text style={styles.locationText} numberOfLines={1}>
                  {heroLocationText}
                </Text>
                <Text style={styles.locationAction}>Change</Text>
              </PressableScale>
            </View>
          );
        case "offer":
          return (
            <View style={styles.gutter}>
              <AccountRewardsCard onOpenRewards={openRewards} />
            </View>
          );
        case "overview":
          return (
            <View style={styles.gutter}>
              <View style={styles.quickRow}>
                <QuickTile
                  icon="pricetags-outline"
                  label="Vouchers"
                  badge={activeOfferCount}
                  onPress={openOffers}
                />
                <QuickTile
                  icon="heart-outline"
                  label="Favourites"
                  badge={favoriteCount}
                  badgeMuted
                  onPress={openFavoriteRestaurants}
                />
                {isReferralSummaryLoading ? (
                  <ShimmerBlock style={styles.quickTileSkeleton} />
                ) : shouldShowReferral ? (
                  <QuickTile
                    icon="gift-outline"
                    label="Refer"
                    badgeText={referralBadge}
                    onPress={openReferrals}
                  />
                ) : null}
                <QuickTile icon="headset-outline" label="Help" onPress={openSupport} />
              </View>
              {!isOnline ? (
                <View style={styles.noticeWrap}>
                  <OfflineNoticeCard description="Showing your saved profile details. Reconnect to refresh alerts and update account changes." />
                </View>
              ) : null}
            </View>
          );
        case "preferences":
          return (
            <View style={styles.groups}>
              <SettingsGroup title="Account">
                <SettingsRow
                  icon="person-outline"
                  title="Personal info"
                  caption={displayName}
                  onPress={openProfileEdit}
                />
                <SettingsRow
                  icon="location-outline"
                  title="Delivery point"
                  caption={heroLocationText}
                  onPress={openLocationPicker}
                />
                <SettingsRow
                  icon={preferredPaymentMethod === "Bkash" ? "phone-portrait-outline" : "cash-outline"}
                  imageSource={preferredPaymentMethod === "Bkash" ? bkashLogo : undefined}
                  title="Default payment"
                  caption={preferredPaymentMethod === "Bkash" ? paymentSettings.bkashLabel : "Cash on delivery"}
                  onPress={openPaymentPreferences}
                />
                <SettingsRow
                  icon="lock-closed-outline"
                  title={customer.hasPassword ? "Change password" : "Add password"}
                  onPress={openProfilePassword}
                  last
                />
              </SettingsGroup>

              <SettingsGroup title="Notifications">
                <SettingsRow
                  icon="notifications-outline"
                  title="Notifications center"
                  value={unreadCount > 0 ? `${unreadCount > 99 ? "99+" : unreadCount} new` : undefined}
                  onPress={openNotifications}
                />
                <View style={[styles.row, styles.rowLast]}>
                  <View style={styles.rowIcon}>
                    <Ionicons name="megaphone-outline" size={18} color={palette.foreground} />
                  </View>
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle}>Offers & promotions</Text>
                    <Text style={styles.rowCaption} numberOfLines={1}>
                      Vouchers, deals and campaign alerts
                    </Text>
                  </View>
                  <Switch
                    value={promotionsEnabled}
                    onValueChange={togglePromotions}
                    trackColor={{ true: palette.primary, false: "#DADCE0" }}
                    thumbColor="#ffffff"
                    accessibilityLabel="Offers and promotions notifications"
                  />
                </View>
              </SettingsGroup>

              <SettingsGroup title="Help & info">
                {isReferralSummaryLoading ? (
                  <SettingsRowSkeleton />
                ) : shouldShowReferral ? (
                  <SettingsRow
                    icon="gift-outline"
                    title="Refer & earn"
                    value={referralRewardLabel}
                    valueAccent
                    onPress={openReferrals}
                  />
                ) : null}
                <SettingsRow
                  icon="logo-youtube"
                  iconColor="#FF0000"
                  title="How to order"
                  caption="Quick video guide"
                  trailingIcon="open-outline"
                  onPress={openHowToOrder}
                />
                <SettingsRow
                  icon="shield-checkmark-outline"
                  title="Privacy policy"
                  onPress={openPrivacyPolicy}
                  last
                />
              </SettingsGroup>
            </View>
          );
        case "history":
          return (
            <View style={styles.groups}>
              <SettingsGroup title="Previous numbers">
                {customer.previousPhones?.map((entry, index) => (
                  <View
                    key={`${entry.phone}-${index}`}
                    style={[
                      styles.row,
                      index === (customer.previousPhones?.length ?? 0) - 1 ? styles.rowLast : null,
                    ]}
                  >
                    <View style={styles.rowIcon}>
                      <Ionicons name="time-outline" size={18} color={palette.mutedForeground} />
                    </View>
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowTitle}>{entry.phone}</Text>
                      <Text style={styles.rowCaption}>
                        {entry.changedAt ? formatDateTimeAmPm(entry.changedAt) : "Change date unavailable"}
                      </Text>
                    </View>
                  </View>
                ))}
              </SettingsGroup>
            </View>
          );
        case "account":
          return (
            <View style={styles.groups}>
              <View style={styles.groupCard}>
                <Pressable
                  style={({ pressed }) => [
                    styles.row,
                    styles.rowLast,
                    logoutMutation.isPending ? styles.disabled : null,
                    pressed && !logoutMutation.isPending ? styles.rowPressed : null,
                  ]}
                  disabled={logoutMutation.isPending}
                  onPress={showLogoutConfirm}
                  accessibilityRole="button"
                >
                  <View style={[styles.rowIcon, styles.dangerIcon]}>
                    {logoutMutation.isPending ? (
                      <ActivityIndicator size="small" color={DANGER} />
                    ) : (
                      <Ionicons name="log-out-outline" size={18} color={DANGER} />
                    )}
                  </View>
                  <View style={styles.rowCopy}>
                    <Text style={[styles.rowTitle, styles.dangerText]}>Sign out</Text>
                  </View>
                </Pressable>
              </View>
              <Text style={styles.footer}>
                Foodbela{APP_VERSION ? ` · v${APP_VERSION}` : ""}
              </Text>
            </View>
          );
        default:
          return null;
      }
    },
    [
      activeOfferCount,
      customer,
      displayName,
      favoriteCount,
      heroLocationText,
      initials,
      insets.top,
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
      openRewards,
      openSignIn,
      openSupport,
      paymentSettings.bkashLabel,
      preferredPaymentMethod,
      promotionsEnabled,
      referralBadge,
      referralRewardLabel,
      shouldShowReferral,
      showLogoutConfirm,
      togglePromotions,
      unreadCount,
    ],
  );

  return (
    <Screen edges={["left", "right"]}>
      <BelaPullToRefresh refreshing={isRefreshing} onRefresh={handleRefresh}>
        <ScrollView
          contentContainerStyle={[styles.container, !customer ? styles.guestContainer : null]}
          showsVerticalScrollIndicator={false}
        >
          {profileListItems.map((item, index) => (
            <View key={keyExtractor(item)}>
              {index > 0 ? <View style={styles.separator} /> : null}
              {renderProfileItem({ item })}
            </View>
          ))}
        </ScrollView>
      </BelaPullToRefresh>

      <AppDialog
        visible={logoutConfirmVisible}
        onClose={() => setLogoutConfirmVisible(false)}
        icon="log-out-outline"
        title="Sign out?"
        message="You can still browse restaurants as a guest. Sign in again when you want to checkout or view orders."
        actions={[
          { label: "Stay signed in", variant: "secondary", onPress: () => setLogoutConfirmVisible(false) },
          {
            label: "Sign out",
            loading: logoutMutation.isPending,
            onPress: () => {
              setLogoutConfirmVisible(false);
              logoutMutation.mutate();
            },
          },
        ]}
      />
    </Screen>
  );
}

const DANGER = "#D93025";
const APP_VERSION = Constants.expoConfig?.version ?? "";

const QuickTile = memo(function QuickTile({
  icon,
  label,
  badge = 0,
  badgeText,
  badgeMuted = false,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  badge?: number;
  /** Text badge on the icon (e.g. "৳25") — same spot/shape as the count badge. */
  badgeText?: string;
  badgeMuted?: boolean;
  onPress: () => void;
}) {
  const shown = badgeText || (badge > 0 ? (badge > 99 ? "99+" : String(badge)) : "");
  return (
    <PressableScale
      scaleTo={0.95}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={shown ? `${label}, ${shown}` : label}
      containerStyle={styles.quickSlot}
      style={styles.quickTile}
    >
      <View style={styles.quickIcon}>
        <Ionicons name={icon} size={20} color={palette.onPrimary} />
        {shown ? (
          <View
            style={[
              styles.quickBadge,
              badgeText ? styles.quickBadgeWide : null,
              badgeMuted ? styles.quickBadgeMuted : null,
            ]}
          >
            <Text
              style={[styles.quickBadgeText, badgeMuted ? styles.quickBadgeTextMuted : null]}
              numberOfLines={1}
            >
              {shown}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.quickLabel} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
});

const SettingsGroup = memo(function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.groupCard}>{children}</View>
    </View>
  );
});

const SettingsRow = memo(function SettingsRow({
  icon,
  imageSource,
  title,
  caption,
  value,
  valueAccent = false,
  onPress,
  last = false,
  iconColor = palette.foreground,
  trailingIcon = "chevron-forward",
}: {
  icon: keyof typeof Ionicons.glyphMap;
  imageSource?: number;
  title: string;
  caption?: string;
  value?: string;
  valueAccent?: boolean;
  onPress: () => void;
  last?: boolean;
  iconColor?: string;
  trailingIcon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, last ? styles.rowLast : null, pressed ? styles.rowPressed : null]}
    >
      <View style={styles.rowIcon}>
        {imageSource ? (
          <Image source={imageSource} resizeMode="contain" style={styles.rowLogo} />
        ) : (
          <Ionicons name={icon} size={18} color={iconColor} />
        )}
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {caption ? (
          <Text style={styles.rowCaption} numberOfLines={1}>
            {caption}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text style={[styles.rowValue, valueAccent ? styles.rowValueAccent : null]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      <Ionicons name={trailingIcon} size={17} color="#B0B4BA" />
    </Pressable>
  );
});

const SettingsRowSkeleton = memo(function SettingsRowSkeleton() {
  return (
    <View style={styles.row}>
      <ShimmerBlock style={styles.rowIconSkeleton} />
      <View style={styles.rowCopy}>
        <ShimmerBlock style={styles.rowTitleSkeleton} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingBottom: 40 },
  guestContainer: { justifyContent: "center" },
  emptyWrap: { justifyContent: "center", paddingHorizontal: 20 },
  separator: { height: 20 },
  gutter: { paddingHorizontal: 16 },
  noticeWrap: { marginTop: 12 },

  // hero — flat amber, no decorative glows
  hero: {
    paddingHorizontal: 16,
    paddingBottom: 18,
    gap: 16,
    backgroundColor: palette.primary,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  heroTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroTitle: { fontSize: 22, lineHeight: 28, fontWeight: "700", color: palette.onPrimary },
  heroIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  heroBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E5484D",
    borderWidth: 2,
    borderColor: palette.primary,
  },
  heroBadgeText: { fontSize: 9.5, lineHeight: 11, fontWeight: "700", color: "#FFFFFF" },
  identityRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
  },
  avatarImage: { width: "100%", height: "100%" },
  avatarText: { fontSize: 21, lineHeight: 26, fontWeight: "700", color: palette.secondary },
  identityCopy: { flex: 1, minWidth: 0, gap: 4 },
  name: { fontSize: 19, lineHeight: 24, fontWeight: "700", color: palette.onPrimary },
  phoneRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  phoneText: { flexShrink: 1, fontSize: 13.5, lineHeight: 18, fontWeight: "500", color: "rgba(17,17,17,0.75)" },
  verifiedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.75)",
  },
  verifiedText: { fontSize: 10.5, fontWeight: "700", color: palette.successText },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  editButtonText: { fontSize: 13, fontWeight: "700", color: palette.onPrimary },
  locationBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  locationText: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: "500", color: palette.onPrimary },
  locationAction: { fontSize: 12.5, fontWeight: "700", color: palette.onPrimary, textDecorationLine: "underline" },

  // quick tiles
  quickRow: { flexDirection: "row", gap: 10 },
  // PressableScale wraps in an Animated.View: flex must live on the outer slot.
  quickSlot: { flex: 1, minWidth: 0 },
  quickTile: {
    alignItems: "center",
    gap: 6,
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 4,
    minHeight: 92,
    borderRadius: 18,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E3E4E7",
  },
  quickTileSkeleton: { flex: 1, minHeight: 92, borderRadius: 18 },
  quickIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primarySoft,
  },
  quickBadge: {
    position: "absolute",
    top: -6,
    right: -8,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
    borderWidth: 2,
    borderColor: palette.surface,
  },
  quickBadgeMuted: { backgroundColor: "#EEEFF2" },
  quickBadgeText: { fontSize: 10.5, lineHeight: 12, fontWeight: "700", color: palette.onPrimary },
  quickBadgeTextMuted: { color: palette.foreground },
  quickLabel: { fontSize: 12.5, fontWeight: "700", color: palette.foreground },
  // Text badge ("৳25") hangs further right so it doesn't cover the icon.
  quickBadgeWide: { right: -18 },

  // grouped settings
  groups: { paddingHorizontal: 16, gap: 20 },
  group: { gap: 8 },
  groupTitle: {
    paddingHorizontal: 4,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: palette.mutedForeground,
  },
  groupCard: {
    overflow: "hidden",
    borderRadius: 18,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E3E4E7",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ECEDEF",
  },
  rowLast: { borderBottomWidth: 0 },
  rowPressed: { backgroundColor: "#F7F7F8" },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceMuted,
  },
  rowLogo: { width: 24, height: 24 },
  rowCopy: { flex: 1, minWidth: 0, gap: 1 },
  rowTitle: { fontSize: 15, lineHeight: 20, fontWeight: "500", color: palette.foreground },
  rowCaption: { fontSize: 12.5, lineHeight: 17, color: palette.mutedForeground },
  rowValue: { maxWidth: 110, fontSize: 13, fontWeight: "500", color: palette.mutedForeground },
  rowValueAccent: { fontWeight: "700", color: palette.secondary },
  rowIconSkeleton: { width: 36, height: 36, borderRadius: 12 },
  rowTitleSkeleton: { width: "50%", height: 14, borderRadius: 7 },
  dangerIcon: { backgroundColor: "#FDECEA" },
  dangerText: { color: DANGER, fontWeight: "700" },
  disabled: { opacity: 0.6 },
  footer: { textAlign: "center", fontSize: 12, color: "#9AA0A6" },
});
