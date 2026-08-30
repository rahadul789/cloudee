import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getExternalDeliveryConfig } from "@/src/lib/external-delivery-api";
import { OwnerStatusBadge } from "@/src/components/owner-status-badge";
import { OwnerHeaderActions } from "@/src/components/owner-header-actions";
import { Screen } from "@/src/components/screen";
import {
  useOwnerLogoutMutation,
  useOwnerPayoutSummaryQuery,
  useOwnerStoreSettingsQuery,
  type OwnerPayoutSummary,
} from "@/src/hooks/use-owner-api";
import { useOwnerTranslation, type TranslationKey } from "@/src/i18n/translations";
import { localizeDigits } from "@/src/lib/format";
import { useOwnerAuthStore } from "@/src/store/auth-store";
import { palette } from "@/src/theme/palette";

export default function AccountScreen() {
  const router = useRouter();
  const owner = useOwnerAuthStore((state) => state.owner);
  const lifecycleStatus = useOwnerAuthStore((state) => state.restaurantLifecycleStatus);
  const storeQuery = useOwnerStoreSettingsQuery();
  const payoutQuery = useOwnerPayoutSummaryQuery();
  const logoutMutation = useOwnerLogoutMutation();
  const { language, setLanguage, t } = useOwnerTranslation();
  // "Foodbela Delivery" only appears when admin has enabled external delivery for the store.
  const externalDeliveryQuery = useQuery({
    queryKey: ["owner-external-delivery-config"],
    queryFn: getExternalDeliveryConfig,
    staleTime: 60_000,
  });
  const externalDeliveryEnabled = externalDeliveryQuery.data?.enabled === true;
  const [logoutConfirmVisible, setLogoutConfirmVisible] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const store = storeQuery.data;
  const payoutMethod = payoutQuery.data?.payoutMethod;
  const payoutMethodStatus = getPayoutMethodStatus(payoutMethod, t);
  const ownerName = owner?.fullName || t("account.ownerFallback");
  const restaurantName = store?.name || t("account.restaurantFallback");
  const initials = restaurantName
    .split(" ")
    .map((part) => part.trim().charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase() || "OW";

  async function refreshAccount() {
    setIsRefreshing(true);
    try {
      await Promise.all([
        storeQuery.refetch(),
        payoutQuery.refetch(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }

  async function signOut() {
    await logoutMutation.mutateAsync();
    router.replace("/sign-in" as never);
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refreshAccount}
            tintColor={palette.primary}
          />
        }
      >
        <View style={styles.hero}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroTitleRow}>
              <Text style={styles.kicker}>{t("account.title")}</Text>
              <OwnerStatusBadge isOnline={store?.runtime?.isOnline} />
            </View>
            <OwnerHeaderActions />
          </View>

          <View style={styles.identityCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={styles.identityCopy}>
              <Text numberOfLines={2} style={styles.name}>
                {restaurantName}
              </Text>
              <Text numberOfLines={1} style={styles.accountHolder}>
                {ownerName}
              </Text>
              <View style={styles.heroPillRow}>
                <InfoPill icon="call-outline" text={owner?.phone ?? t("account.phoneUnavailable")} />
                <InfoPill
                  icon="shield-checkmark-outline"
                  text={owner?.isPhoneVerified ? t("account.verified") : t("account.phonePending")}
                />
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader
            title={t("account.overview")}
            subtitle={t("account.overviewSubtitle")}
          />
          <View style={styles.overviewGrid}>
            <OverviewCard
              icon="restaurant-outline"
              label={t("account.overview.store")}
              value={store?.runtime?.isOnline ? t("status.online") : t("status.offline")}
              caption={store?.name ?? t("account.restaurantFallback")}
              tint="#FFF0F6"
            />
            <OverviewCard
              icon="wallet-outline"
              label={t("account.overview.payout")}
              value={payoutMethodStatus.label}
              caption={payoutMethod?.accountNumber || t("account.overview.noActiveNumber")}
              tint="#EEF8F2"
              onPress={() => router.push("/payout-method" as never)}
            />
            <OverviewCard
              icon="shield-checkmark-outline"
              label={t("account.overview.status")}
              value={lifecycleStatus || t("account.lifecyclePending")}
              caption={t("account.overview.restaurantLifecycle")}
              tint="#EAF0FF"
            />
            <OverviewCard
              icon="call-outline"
              label={t("account.overview.pickupPhone")}
              value={store?.contact?.phone || t("account.overview.notAdded")}
              caption={t("account.overview.riderSupport")}
              tint="#FFF6E3"
              onPress={() => router.push("/account-contact" as never)}
            />
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader
            title={t("account.manage")}
            subtitle={t("account.manageSubtitle")}
          />
          <View style={styles.cardStack}>
            <AccountNavCard
              icon="call-outline"
              tint="#FFF6E3"
              title={t("account.manage.contactTitle")}
              caption={store?.contact?.phone || t("account.manage.contactCaption")}
              onPress={() => router.push("/account-contact" as never)}
            />
            <AccountNavCard
              icon="phone-portrait-outline"
              tint="#FFF0F6"
              title={t("account.manage.payoutTitle")}
              caption={`${payoutMethod?.accountNumber || t("account.overview.noActiveNumber")} - ${payoutMethodStatus.label}`}
              onPress={() => router.push("/payout-method" as never)}
            />
            <AccountNavCard
              icon="restaurant-outline"
              tint="#EEF8F2"
              title={t("account.manage.prepTitle")}
              caption={
                typeof store?.preparationTimeMinutes === "number"
                  ? `${localizeDigits(String(store.preparationTimeMinutes))} ${t("account.manage.prepMinutesDefaultSuffix")}`
                  : t("account.manage.prepNoEstimate")
              }
              onPress={() => router.push("/account-preparation-time" as never)}
            />
            <AccountNavCard
              icon="ticket-outline"
              tint="#FFF0F6"
              title={t("account.manage.vouchersTitle")}
              caption={t("account.manage.vouchersCaption")}
              onPress={() => router.push("/vouchers" as never)}
            />
            <AccountNavCard
              icon="stats-chart-outline"
              tint="#EEF8F2"
              title={t("account.manage.salesTitle")}
              caption={t("account.manage.salesCaption")}
              onPress={() => router.push("/sales" as never)}
            />
            <AccountNavCard
              icon="notifications-outline"
              tint="#EAF0FF"
              title={t("account.manage.notificationsTitle")}
              caption={t("account.manage.notificationsCaption")}
              onPress={() => router.push("/notifications" as never)}
            />
            <AccountNavCard
              icon="star-outline"
              tint="#FFF7E6"
              title={t("reviews.title")}
              caption={t("reviews.subtitle")}
              onPress={() => router.push("/reviews" as never)}
            />
            {externalDeliveryEnabled ? (
              <AccountNavCard
                icon="bicycle-outline"
                tint="#EDE9FE"
                title={language === "bn" ? "ফুডবেলা ডেলিভারি" : "Foodbela Delivery"}
                caption={
                  language === "bn"
                    ? "নিজের চ্যানেলের অর্ডার আমাদের রাইডার দিয়ে ডেলিভারি করান"
                    : "Deliver your own-channel orders with our riders"
                }
                onPress={() => router.push("/external-delivery" as never)}
              />
            ) : null}
            <AccountNavCard
              icon="desktop-outline"
              tint="#EAF0FF"
              title={t("account.manage.webTitle")}
              onPress={() => router.push("/owner-web-link" as never)}
            />
            <AccountNavCard
              icon="help-buoy-outline"
              tint="#FFE4E6"
              title={t("account.manage.reportTitle")}
              onPress={() => router.push("/report-issues" as never)}
            />
          </View>

          {/* Language lives under Manage rather than as its own top-level section —
              it is a setting, not a destination. */}
          <Text style={styles.subSectionTitle}>{t("account.languageTitle")}</Text>
          <View style={styles.languageGrid}>
            <LanguageOption
              active={language === "bn"}
              title={t("account.languageBangla")}
              caption={t("account.languageBanglaCaption")}
              onPress={() => setLanguage("bn")}
            />
            <LanguageOption
              active={language === "en"}
              title={t("account.languageEnglish")}
              caption={t("account.languageEnglishCaption")}
              onPress={() => setLanguage("en")}
            />
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader
            title={t("account.session")}
            subtitle={t("account.sessionSubtitle")}
          />
          <View style={styles.cardStack}>
            <Pressable
              accessibilityRole="button"
              disabled={logoutMutation.isPending}
              style={({ pressed }) => [
                styles.logoutCard,
                logoutMutation.isPending ? styles.disabledCard : null,
                pressed && !logoutMutation.isPending ? styles.cardPressed : null,
              ]}
              onPress={() => setLogoutConfirmVisible(true)}
            >
              <View style={styles.logoutIconWrap}>
                {logoutMutation.isPending ? (
                  <ActivityIndicator size="small" color={palette.primary} />
                ) : (
                  <Ionicons name="log-out-outline" size={18} color={palette.primary} />
                )}
              </View>
              <View style={styles.navCopy}>
                <Text style={styles.logoutTitle}>{t("account.signOut")}</Text>
                <Text style={styles.navCaption}>{t("account.signOutCaption")}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.mutedForeground} />
            </Pressable>
          </View>
        </View>
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
            <Text style={styles.confirmTitle}>{t("account.signOutConfirmTitle")}</Text>
            <Text style={styles.confirmText}>
              {t("account.signOutConfirmBody")}
            </Text>
            <View style={styles.confirmActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.confirmSecondaryButton,
                  pressed ? styles.confirmButtonPressed : null,
                ]}
                onPress={() => setLogoutConfirmVisible(false)}
              >
                <Text style={styles.confirmSecondaryText}>{t("account.staySignedIn")}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.confirmPrimaryButton,
                  pressed && !logoutMutation.isPending
                    ? styles.confirmButtonPressed
                    : null,
                ]}
                disabled={logoutMutation.isPending}
                onPress={() => {
                  setLogoutConfirmVisible(false);
                  void signOut();
                }}
              >
                {logoutMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmPrimaryText}>{t("account.signOut")}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function getPayoutMethodStatus(
  payoutMethod: OwnerPayoutSummary["payoutMethod"] | undefined,
  t: (key: TranslationKey) => string,
): { label: string; tone: "success" | "warning" | "danger" } {
  if (!payoutMethod) {
    return { label: t("payouts.method.setupNeeded"), tone: "warning" };
  }

  if (payoutMethod.pendingVerificationStatus === "otp_pending") {
    return { label: t("payouts.method.otpPending"), tone: "warning" };
  }

  if (payoutMethod.pendingVerificationStatus === "admin_pending") {
    return { label: t("payouts.method.pending"), tone: "warning" };
  }

  if (payoutMethod.pendingVerificationStatus === "rejected") {
    return { label: t("payouts.method.rejected"), tone: "danger" };
  }

  if (payoutMethod.isVerified) {
    return { label: t("payouts.method.verified"), tone: "success" };
  }

  return { label: t("payouts.method.unverified"), tone: "warning" };
}

function SectionHeader({ title }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function InfoPill({
  icon,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}) {
  return (
    <View style={styles.infoPill}>
      <Ionicons name={icon} size={14} color={palette.foreground} />
      <Text numberOfLines={1} style={styles.infoPillText}>
        {text}
      </Text>
    </View>
  );
}

function OverviewCard({
  icon,
  label,
  value,
  caption,
  tint,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  caption: string;
  tint: string;
  onPress?: () => void;
}) {
  const content = (
    <>
      {onPress ? (
        <View style={styles.overviewActionCue}>
          <Ionicons name="chevron-forward" size={14} color={palette.foreground} />
        </View>
      ) : null}
      <View style={styles.overviewIconWrap}>
        <Ionicons name={icon} size={18} color={palette.foreground} />
      </View>
      <Text numberOfLines={1} style={styles.overviewValue}>
        {value}
      </Text>
      <Text style={styles.overviewLabel}>{label}</Text>
    </>
  );

  if (!onPress) {
    return <View style={[styles.overviewCard, { backgroundColor: tint }]}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.overviewCard,
        { backgroundColor: tint },
        pressed ? styles.cardPressed : null,
      ]}
      onPress={onPress}
    >
      {content}
    </Pressable>
  );
}

function LanguageOption({
  active,
  title,
  caption,
  onPress,
}: {
  active: boolean;
  title: string;
  caption: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.languageOption,
        active ? styles.languageOptionActive : null,
        pressed ? styles.cardPressed : null,
      ]}
      onPress={onPress}
    >
      <View style={styles.languageCopy}>
        <Text style={styles.languageTitle}>{title}</Text>
      </View>
      <View style={[styles.languageCheck, active ? styles.languageCheckActive : null]}>
        {active ? (
          <Ionicons name="checkmark" size={14} color="#FFFFFF" />
        ) : null}
      </View>
    </Pressable>
  );
}

function AccountNavCard({
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
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.navCard,
        highlight ? styles.navCardHighlighted : null,
        pressed ? styles.cardPressed : null,
      ]}
      onPress={onPress}
    >
      <View style={[styles.navIconWrap, { backgroundColor: tint }]}>
        <Ionicons name={icon} size={18} color={palette.foreground} />
      </View>
      <View style={styles.navCopy}>
        <Text style={styles.navTitle}>{title}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={palette.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 40,
    gap: 28,
  },
  hero: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 26,
    backgroundColor: "#0F1420",
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    gap: 18,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  heroTitleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  kicker: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.62)",
  },
  identityCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  avatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
  },
  avatarText: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  identityCopy: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: "800",
    color: palette.foreground,
  },
  accountHolder: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  heroPillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  infoPill: {
    maxWidth: "100%",
    minHeight: 30,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(31, 36, 48, 0.08)",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  infoPillText: {
    flexShrink: 1,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
    color: palette.foreground,
  },
  section: {
    paddingHorizontal: 18,
    gap: 12,
  },
  sectionHeader: {
    gap: 3,
  },
  languageGrid: {
    flexDirection: "row",
    gap: 10,
  },
  languageOption: {
    flex: 1,
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: palette.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderWidth: 1,
    borderColor: palette.border,
  },
  // With the card border gone, the active language is carried by the tinted fill and
  // the filled check circle.
  languageOptionActive: {
    backgroundColor: "#FFF7FB",
    borderColor: palette.primary,
  },
  languageCopy: {
    flex: 1,
  },
  languageTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
    color: palette.foreground,
  },
  languageCaption: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  languageCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
  },
  languageCheckActive: {
    borderColor: palette.primary,
    backgroundColor: palette.primary,
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "900",
    color: palette.foreground,
  },
  sectionSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  overviewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  overviewCard: {
    width: "48.5%",
    minHeight: 118,
    borderRadius: 22,
    padding: 13,
    gap: 5,
    justifyContent: "center",
  },
  overviewActionCue: {
    position: "absolute",
    top: 11,
    right: 11,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  overviewIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.72)",
    alignItems: "center",
    justifyContent: "center",
  },
  overviewValue: {
    marginTop: 4,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "900",
    color: palette.foreground,
  },
  overviewLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
    color: palette.foreground,
  },
  overviewCaption: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  cardStack: {
    gap: 10,
  },
  navCard: {
    minHeight: 70,
    borderRadius: 20,
    backgroundColor: palette.surface,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  navCardHighlighted: {
    backgroundColor: "#FFFCFD",
  },
  // Matches the customer app's press feedback: a small scale/lift, not a heavy fade.
  cardPressed: {
    transform: [{ scale: 0.985 }, { translateY: 1 }],
    opacity: 0.95,
  },
  subSectionTitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: palette.foreground,
  },
  navIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  navCopy: {
    flex: 1,
    gap: 2,
  },
  navTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
    color: palette.foreground,
  },
  navCaption: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  logoutCard: {
    minHeight: 70,
    borderRadius: 20,
    backgroundColor: palette.surface,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  logoutIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primarySoft,
  },
  logoutTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
    color: palette.danger,
  },
  disabledCard: {
    opacity: 0.7,
  },
  confirmOverlay: {
    flex: 1,
    justifyContent: "center",
    padding: 22,
  },
  confirmBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(31,36,48,0.45)",
  },
  confirmCard: {
    borderRadius: 24,
    backgroundColor: palette.surface,
    padding: 20,
    alignItems: "center",
    gap: 11,
    shadowColor: "rgba(31, 36, 48, 0.28)",
    shadowOpacity: 1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  confirmIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 22,
    backgroundColor: palette.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmTitle: {
    fontSize: 21,
    lineHeight: 27,
    fontWeight: "900",
    color: palette.foreground,
  },
  confirmText: {
    textAlign: "center",
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  confirmActions: {
    marginTop: 5,
    flexDirection: "row",
    gap: 10,
  },
  confirmSecondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmPrimaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 15,
    backgroundColor: palette.foreground,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmSecondaryText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: palette.foreground,
  },
  confirmPrimaryText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  confirmButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
});
