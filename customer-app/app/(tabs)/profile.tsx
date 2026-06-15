import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { EmptyStateCard } from "@/src/components/empty-state-card";
import { ShimmerBlock } from "@/src/components/loading-skeleton";
import { OfflineNoticeCard } from "@/src/components/offline-notice-card";
import { RemoteImage } from "@/src/components/remote-image";
import { Screen } from "@/src/components/screen";
import {
  useCustomerFavoriteRestaurantIdsQuery,
  useCustomerLogoutMutation,
  useCustomerNotificationsInfiniteQuery,
  useCustomerNotificationsQuery,
  useCustomerPaymentSettingsQuery,
  useCustomerProfileQuery,
  useCustomerReferralSummaryQuery,
} from "@/src/hooks/use-customer-api";
import { formatDateTimeAmPm } from "@/src/lib/date-time";
import { formatDeliveryAddress } from "@/src/lib/location-address";
import { useIsOnline } from "@/src/hooks/use-network-status";
import { useCustomerAuthStore } from "@/src/store/auth-store";
import { useLocationStore } from "@/src/store/location-store";
import {
  usePaymentPreferencesStore,
} from "@/src/store/payment-preferences-store";
import { palette } from "@/src/theme/palette";

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

export default function ProfileScreen() {
  const router = useRouter();
  const [logoutConfirmVisible, setLogoutConfirmVisible] = useState(false);
  const customer = useCustomerAuthStore((state) => state.customer);
  useCustomerProfileQuery();
  const logoutMutation = useCustomerLogoutMutation();
  const notificationsQuery = useCustomerNotificationsQuery();
  const personalOffersQuery = useCustomerNotificationsInfiniteQuery(
    Boolean(customer),
    3,
    "personal_offers",
  );
  const favoriteRestaurantIdsQuery = useCustomerFavoriteRestaurantIdsQuery();
  const paymentSettingsQuery = useCustomerPaymentSettingsQuery();
  const referralSummaryQuery = useCustomerReferralSummaryQuery(Boolean(customer));
  const selectedLocation = useLocationStore((state) => state.selectedLocation);
  const preferredPaymentMethod = usePaymentPreferencesStore(
    (state) => state.preferredPaymentMethod,
  );
  const isOnline = useIsOnline();
  const unreadCount = notificationsQuery.data?.unreadCount ?? 0;
  const personalOffers = useMemo(
    () => personalOffersQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [personalOffersQuery.data?.pages],
  );
  const highlightedOffer = personalOffers[0];
  const highlightedOfferExpired = isPersonalOfferExpired(highlightedOffer);
  const favoriteCount = favoriteRestaurantIdsQuery.data?.length ?? 0;
  const referralSummary = referralSummaryQuery.data;
  const isReferralSummaryLoading = Boolean(customer) && referralSummaryQuery.isLoading;
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

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          !customer ? styles.guestContainer : null,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {!customer ? (
          <View style={styles.emptyWrap}>
            <EmptyStateCard
              title="You are not signed in"
              description="Sign in with your phone to unlock checkout, favorites, and order history."
              actionLabel="Sign in"
              onPress={() =>
                router.push({
                  pathname: "/sign-in",
                  params: { redirectTo: "/(tabs)/profile" },
                })
              }
            />
          </View>
        ) : (
          <>
            <View style={styles.hero}>
              <View style={styles.heroGlowPrimary} />
              <View style={styles.heroGlowSecondary} />

              <View style={styles.heroTopRow}>
                <Text style={styles.kicker}>Profile</Text>
                <Pressable style={styles.heroGhostButton} onPress={() => router.push("/notifications")}>
                  <Ionicons name="notifications-outline" size={16} color={palette.foreground} />
                  <Text style={styles.heroGhostButtonText}>Alerts</Text>
                  {unreadCount > 0 ? (
                    <View style={styles.heroGhostBadge}>
                      <Text style={styles.heroGhostBadgeText}>
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              </View>

              <View style={styles.identityCard}>
                <View style={styles.avatar}>
                  {customer?.profileImage?.url ? (
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
                    <Pressable
                      style={styles.nameEditButton}
                      onPress={() => router.push("/profile-edit")}
                      hitSlop={8}
                    >
                      <Ionicons
                        name="create-outline"
                        size={17}
                        color={palette.foreground}
                      />
                    </Pressable>
                  </View>
                  <Text style={styles.subtitle}>
                    Keep your account, notifications, rewards, and support details in one place.
                  </Text>

                  <View style={styles.heroPillRow}>
                    <InfoPill
                      icon="location-outline"
                      text={heroLocationText}
                      onPress={() => router.push("/location-picker")}
                    />
                  </View>
                </View>
              </View>
            </View>

            <Pressable
              style={styles.offerPeekCard}
              onPress={() => router.push("/offers")}
            >
              <View style={styles.offerPeekIcon}>
                <Ionicons name="ticket-outline" size={21} color={palette.secondary} />
              </View>
              <View style={styles.offerPeekCopy}>
                <Text style={styles.offerPeekLabel}>My offers</Text>
                <Text style={styles.offerPeekTitle} numberOfLines={1}>
                  {highlightedOffer
                    ? `${highlightedOfferExpired ? "Expired: " : ""}${highlightedOffer.voucherLabel || highlightedOffer.title}`
                    : personalOffersQuery.isLoading
                      ? "Checking personal vouchers"
                      : "No personal voucher yet"}
                </Text>
                <Text style={styles.offerPeekMeta} numberOfLines={1}>
                  {highlightedOffer
                    ? highlightedOffer.voucherCode ||
                      (highlightedOffer.voucherId ? "Auto applied" : highlightedOffer.description)
                    : "Order more to unlock personal offers."}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.mutedForeground} />
            </Pressable>

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
                  onPress={() => router.push("/favorite-restaurants")}
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
                    onPress={() => router.push("/referrals")}
                  />
                ) : null}
                <OverviewCard
                  icon="help-circle-outline"
                  label="Help center"
                  value="Open"
                  caption="Support and guides"
                  tint="#E8FFF1"
                  onPress={() => router.push("/support")}
                />
              </View>
            </View>

            <View style={styles.section}>
              <SectionHeader
                title="Preferences"
                subtitle="Open a section to manage the details."
              />

              <View style={styles.cardStack}>
                <ProfileNavCard
                  icon={preferredPaymentMethod === "Bkash" ? "phone-portrait-outline" : "cash-outline"}
                  tint="#FFF0F6"
                  title="Default payment method"
                  caption={
                    preferredPaymentMethod === "Bkash"
                      ? paymentSettings.bkashLabel
                      : "Cash on delivery"
                  }
                  onPress={() => router.push("/payment-preferences")}
                />
                <ProfileNavCard
                  icon="person-outline"
                  tint="#FFE7F1"
                  title="Personal info"
                  onPress={() => router.push("/profile-edit")}
                />
                <ProfileNavCard
                  icon="location-outline"
                  tint="#FFF0E8"
                  title="Delivery point"
                  onPress={() => router.push("/location-picker")}
                />
                <ProfileNavCard
                  icon="lock-closed-outline"
                  tint="#EEF8F2"
                  title={customer.hasPassword ? "Change password" : "Add password"}
                  onPress={() => router.push("/profile-password")}
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
                    onPress={() => router.push("/referrals")}
                  />
                ) : null}
                <ProfileNavCard
                  icon="reader-outline"
                  tint="#E8FFF1"
                  title="How to order"
                  caption="Step-by-step Foodbela guide"
                  onPress={() => router.push("/order-help")}
                />
                <ProfileNavCard
                  icon="notifications-outline"
                  tint="#EEF5FF"
                  title="Notifications center"
                  onPress={() => router.push("/notifications")}
                />
                <ProfileNavCard
                  icon="help-circle-outline"
                  tint="#FFF0E8"
                  title="Help center"
                  onPress={() => router.push("/support")}
                />
                <ProfileNavCard
                  icon="shield-checkmark-outline"
                  tint="#EEF8F2"
                  title="Privacy policy"
                  onPress={() => router.push("/privacy-policy")}
                />
              </View>
            </View>

            {(customer.previousPhones?.length ?? 0) > 0 ? (
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
                          index < (customer.previousPhones?.length ?? 0) - 1 ? styles.historyRowBorder : null,
                        ]}
                      >
                        <View style={styles.historyDot} />
                        <View style={styles.historyCopy}>
                          <Text style={styles.historyTitle}>{entry.phone}</Text>
                          <Text style={styles.historyMeta}>
                            {entry.changedAt ? formatDateTimeAmPm(entry.changedAt) : "Change date unavailable"}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            ) : null}

            <View style={styles.section}>
              <SectionHeader
                title="Account"
                subtitle="Sign out when you want to return to guest browsing."
              />
              <View style={styles.cardStack}>
                <Pressable
                  style={[
                    styles.logoutCard,
                    logoutMutation.isPending ? styles.disabledCard : null,
                  ]}
                  disabled={logoutMutation.isPending}
                  onPress={() => setLogoutConfirmVisible(true)}
                >
                  <View style={styles.logoutIconWrap}>
                    {logoutMutation.isPending ? (
                      <ActivityIndicator size="small" color={palette.primary} />
                    ) : (
                      <Ionicons name="log-out-outline" size={18} color={palette.primary} />
                    )}
                  </View>
                  <View style={styles.logoutCopy}>
                    <Text style={styles.logoutTitle}>Sign out</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={palette.mutedForeground} />
                </Pressable>
              </View>
            </View>
          </>
        )}
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
              <Ionicons name="log-out-outline" size={26} color={palette.primary} />
            </View>
            <Text style={styles.confirmTitle}>Sign out?</Text>
            <Text style={styles.confirmText}>
              You can still browse restaurants as a guest. Sign in again when
              you want to checkout or view orders.
            </Text>
            <View style={styles.confirmActions}>
              <Pressable
                style={styles.confirmSecondaryButton}
                onPress={() => setLogoutConfirmVisible(false)}
              >
                <Text style={styles.confirmSecondaryText}>Stay signed in</Text>
              </Pressable>
              <Pressable
                style={styles.confirmPrimaryButton}
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

function SectionHeader({
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
}

function InfoPill({
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
        <Ionicons name="chevron-forward" size={13} color={palette.mutedForeground} />
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable style={styles.infoPill} onPress={onPress}>
        {content}
      </Pressable>
    );
  }

  return (
    <View style={styles.infoPill}>
      {content}
    </View>
  );
}

function OverviewCard({
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
    <Pressable
      style={cardStyle}
      onPress={onPress}
      accessibilityRole="button"
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
    </Pressable>
  );
}

function ReferralOverviewCardSkeleton() {
  return (
    <View style={[styles.overviewCard, styles.referralSkeletonCard]}>
      <ShimmerBlock style={styles.referralSkeletonIcon} />
      <ShimmerBlock style={styles.referralSkeletonValue} />
      <ShimmerBlock style={styles.referralSkeletonLabel} />
      <ShimmerBlock style={styles.referralSkeletonCaption} />
    </View>
  );
}

function ProfileNavCard({
  icon,
  tint,
  title,
  caption,
  onPress,
  highlight = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  title: string;
  caption?: string;
  onPress: () => void;
  highlight?: boolean;
}) {
  return (
    <Pressable
      style={[styles.navCard, highlight ? styles.navCardHighlighted : null]}
      onPress={onPress}
    >
      <View style={[styles.navIconWrap, { backgroundColor: tint }]}>
        <Ionicons name={icon} size={18} color={palette.foreground} />
      </View>
      <View style={styles.navCopy}>
        <Text style={styles.navTitle}>{title}</Text>
        {caption ? <Text style={styles.navCaption}>{caption}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={palette.mutedForeground} />
    </Pressable>
  );
}

function ReferralNavCardSkeleton() {
  return (
    <View style={[styles.navCard, styles.navCardHighlighted]}>
      <ShimmerBlock style={styles.referralNavSkeletonIcon} />
      <View style={styles.navCopy}>
        <ShimmerBlock style={styles.referralNavSkeletonTitle} />
        <ShimmerBlock style={styles.referralNavSkeletonCaption} />
      </View>
      <ShimmerBlock style={styles.referralNavSkeletonChevron} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingBottom: 40,
    gap: 28,
  },
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
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
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
    fontSize: 31,
    lineHeight: 37,
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
  },
  infoPillText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    color: palette.foreground,
    maxWidth: 210,
  },
  offerPeekCard: {
    marginHorizontal: 20,
    marginTop: -6,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255, 122, 89, 0.16)",
    backgroundColor: palette.surface,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: palette.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  offerPeekIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: "#FFF0F6",
    alignItems: "center",
    justifyContent: "center",
  },
  offerPeekCopy: {
    flex: 1,
    gap: 2,
  },
  offerPeekLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    color: palette.secondary,
  },
  offerPeekTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    color: palette.foreground,
  },
  offerPeekMeta: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    color: palette.mutedForeground,
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
    shadowColor: palette.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  overviewCardWide: {
    width: "100%",
    minHeight: 112,
  },
  overviewCardHighlighted: {
    borderWidth: 1,
    borderColor: "rgba(228, 17, 111, 0.34)",
    shadowOpacity: 0.14,
  },
  referralSkeletonCard: {
    backgroundColor: "#F0F7FF",
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
  latestOrderCard: {
    marginTop: 2,
    marginHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 28,
    backgroundColor: palette.surface,
    shadowColor: palette.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  latestOrderIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  latestOrderCopy: {
    flex: 1,
    gap: 2,
  },
  latestOrderLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: palette.secondary,
  },
  latestOrderTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    color: palette.foreground,
  },
  latestOrderMeta: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  latestOrderAmountWrap: {
    alignItems: "flex-end",
    gap: 4,
  },
  latestOrderAmount: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
    color: palette.foreground,
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
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  navCardHighlighted: {
    borderWidth: 1,
    borderColor: "rgba(216, 27, 96, 0.22)",
    backgroundColor: "#FFF7FB",
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
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
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
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
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
});
