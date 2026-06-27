import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyStateCard } from "@/src/components/empty-state-card";
import { Screen } from "@/src/components/screen";
import {
  type CustomerReferralReward,
  useCustomerReferralSummaryQuery,
} from "@/src/hooks/use-customer-api";
import { formatDateTimeAmPm } from "@/src/lib/date-time";
import { useCustomerAuthStore } from "@/src/store/auth-store";
import { palette } from "@/src/theme/palette";

function buildReferralLink(referralCode: string) {
  return `foodbela://checkout?ref=${encodeURIComponent(referralCode)}`;
}

export default function ReferralsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const customer = useCustomerAuthStore((state) => state.customer);
  const summaryQuery = useCustomerReferralSummaryQuery(Boolean(customer));
  const summary = summaryQuery.data;

  async function handleShare() {
    if (!summary?.referralCode || !summary.enabled) return;

    const link = summary.shareLink?.trim() || buildReferralLink(summary.referralCode);
    const fallbackMessage = `Use my Foodbela referral code ${summary.referralCode} at checkout before your first delivered order. After your first delivered order, I get a Tk ${summary.rewardAmount} reward voucher. ${link}`;
    const message = summary.shareMessage?.trim() || fallbackMessage;
    await Share.share({
      message,
      url: link,
    });
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingBottom: Math.max(insets.bottom, 18) + 28 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <Pressable
            style={({ pressed }) => [
              styles.backButton,
              pressed
                ? {
                    transform: [{ scale: 0.97 }, { translateY: 1 }],
                    opacity: 0.92,
                  }
                : null,
            ]}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={21} color={palette.foreground} />
          </Pressable>
          <Text style={styles.topBarTitle}>Refer & earn</Text>
          <View style={styles.topBarSpacer} />
        </View>

        {!customer ? (
          <View style={styles.emptyWrap}>
            <EmptyStateCard
              title="Sign in to invite friends"
              description="Your referral code appears here after sign-in."
              actionLabel="Sign in"
              onPress={() =>
                router.replace({
                  pathname: "/sign-in",
                  params: { redirectTo: "/referrals" },
                })
              }
            />
          </View>
        ) : summaryQuery.isLoading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="small" color={palette.primary} />
            <Text style={styles.loadingText}>Loading referral rewards</Text>
          </View>
        ) : summaryQuery.isError || !summary ? (
          <View style={styles.emptyWrap}>
            <EmptyStateCard
              title="Could not load referrals"
              description="Reconnect and try again."
              actionLabel="Retry"
              onPress={() => summaryQuery.refetch()}
            />
          </View>
        ) : (
          <>
            <View style={styles.hero}>
              <View style={styles.heroIcon}>
                <Ionicons name="gift-outline" size={26} color="#FFFFFF" />
              </View>
              <Text style={styles.heroTitle}>
                {summary.enabled
                  ? `Share Foodbela. Earn Tk ${summary.rewardAmount}.`
                  : "Referral program is paused"}
              </Text>
              <Text style={styles.heroText}>
                {summary.enabled
                  ? "Reward unlocks after your friend places a first delivered order."
                  : "Your code stays ready. New referral rewards are currently turned off."}
              </Text>

              <View style={styles.codeCard}>
                <View style={styles.codeCopy}>
                  <Text style={styles.codeLabel}>Your code</Text>
                  <Text style={styles.codeValue}>{summary.referralCode}</Text>
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.shareButton,
                    !summary.enabled ? styles.shareButtonDisabled : null,
                    pressed && summary.enabled
                      ? {
                          transform: [{ scale: 0.985 }, { translateY: 1 }],
                          opacity: 0.96,
                        }
                      : null,
                  ]}
                  onPress={handleShare}
                  disabled={!summary.enabled}
                >
                  <Ionicons name="share-social-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.shareButtonText}>Share</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.statsGrid}>
              <StatCard label="Invited" value={`${summary.totalReferrals}`} tint="#FFE8F0" />
              <StatCard label="Rewarded" value={`${summary.rewardedReferrals}`} tint="#EAF8F0" />
              <StatCard
                label="This month"
                value={`${summary.monthlyRewardCount}/${summary.monthlyRewardCap}`}
                tint="#FFF4D8"
              />
            </View>

            <View style={styles.ruleCard}>
              <Text style={styles.ruleCardTitle}>How your code is used</Text>
              <RuleRow icon="share-social-outline" text="Share your code with a friend." />
              <RuleRow icon="phone-portrait-outline" text="Your friend signs in with a verified phone number." />
              <RuleRow icon="ticket-outline" text={`They enter ${summary.referralCode} in checkout before their first delivered order.`} />
              <RuleRow icon="bicycle-outline" text="Their first order is delivered." />
              <RuleRow
                icon="gift-outline"
                text={`You get Tk ${summary.rewardAmount} voucher for orders over Tk ${summary.minimumOrderAmount}`}
              />
            </View>

            <View style={styles.ruleCard}>
              <Text style={styles.ruleCardTitle}>Conditions</Text>
              <RuleRow
                icon="calendar-outline"
                text={`Maximum ${summary.monthlyRewardCap} referral rewards per month`}
              />
              <RuleRow
                icon="close-circle-outline"
                text="Cancelled, rejected, or refunded orders do not count."
              />
              <RuleRow
                icon="shield-checkmark-outline"
                text="Self-referral, same device, or suspicious activity may be rejected or reviewed."
              />
              <RuleRow
                icon="pricetag-outline"
                text={`Reward vouchers are one-time use, not stackable, and expire in ${summary.rewardExpiryDays} days.`}
              />
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Reward activity</Text>
            </View>

            {summary.rewards.length ? (
              <View style={styles.rewardList}>
                {summary.rewards.map((reward, index) => (
                  <RewardRow key={`${reward.referredAt}-${index}`} reward={reward} />
                ))}
              </View>
            ) : (
              <View style={styles.noRewardsCard}>
                <Ionicons name="sparkles-outline" size={22} color={palette.secondary} />
                <Text style={styles.noRewardsTitle}>No invites yet</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function StatCard({ label, value, tint }: { label: string; value: string; tint: string }) {
  return (
    <View style={[styles.statCard, { backgroundColor: tint }]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function RuleRow({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.ruleRow}>
      <View style={styles.ruleIcon}>
        <Ionicons name={icon} size={18} color={palette.foreground} />
      </View>
      <Text style={styles.ruleText}>{text}</Text>
    </View>
  );
}

function RewardRow({ reward }: { reward: CustomerReferralReward }) {
  const isRewarded = reward.status === "rewarded";
  const isReview = reward.status === "under_review";
  const isSkipped =
    reward.status === "capped" ||
    reward.status === "disabled" ||
    reward.status === "rejected";
  const title =
    reward.status === "rewarded"
      ? "Reward unlocked"
      : reward.status === "capped"
        ? "Monthly cap reached"
        : reward.status === "disabled"
          ? "Program was paused"
          : reward.status === "under_review"
            ? "Under review"
            : reward.status === "rejected"
              ? "Not eligible"
              : "Waiting for first order";
  const supportHint =
    reward.status === "rejected" || reward.status === "under_review"
      ? "If you believe this was a mistake, contact Foodbela support from Profile > Support."
      : "";
  const skippedMessage =
    reward.skippedReason ||
    (reward.status === "rejected"
      ? "Referral reward was blocked by Foodbela rules. Self-referral, same phone/device, or suspicious activity may not receive rewards."
      : "");

  return (
    <View style={styles.rewardRow}>
      <View
        style={[
          styles.rewardIcon,
          isRewarded ? styles.rewardIconSuccess : null,
          isSkipped ? styles.rewardIconMuted : null,
        ]}
      >
        <Ionicons
          name={
            isRewarded
              ? "ticket-outline"
              : isReview
                ? "shield-checkmark-outline"
                : isSkipped
                  ? "close-circle-outline"
                  : "time-outline"
          }
          size={18}
          color={
            isRewarded
              ? palette.successText
              : isSkipped
                ? palette.mutedForeground
                : palette.warningText
          }
        />
      </View>
      <View style={styles.rewardCopy}>
        <Text style={styles.rewardTitle}>{title}</Text>
        <Text style={styles.rewardMeta}>
          {reward.referredCustomerName} joined
          {reward.referredAt ? ` on ${formatDateTimeAmPm(reward.referredAt)}` : ""}
        </Text>
        {(isSkipped || isReview) && skippedMessage ? (
          <Text style={styles.rewardSkipped}>{skippedMessage}</Text>
        ) : null}
        {supportHint ? (
          <Text style={styles.rewardSupportHint}>{supportHint}</Text>
        ) : null}
        {reward.voucher ? (
          <Text style={styles.rewardVoucher}>
            Code {reward.voucher.code}
            {reward.voucher.expiresAt
              ? ` · expires ${formatDateTimeAmPm(reward.voucher.expiresAt)}`
              : ""}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 18,
  },
  topBar: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
    shadowColor: palette.shadow,
    shadowOpacity: 0.8,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  topBarTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
    color: palette.foreground,
  },
  topBarSpacer: {
    width: 42,
  },
  emptyWrap: {
    paddingTop: 60,
  },
  loadingCard: {
    minHeight: 180,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: palette.surface,
  },
  loadingText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  hero: {
    overflow: "hidden",
    borderRadius: 30,
    backgroundColor: palette.foreground,
    padding: 20,
    gap: 12,
  },
  heroIcon: {
    width: 50,
    height: 50,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.secondary,
  },
  heroTitle: {
    fontSize: 29,
    lineHeight: 35,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  heroText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    color: "rgba(255,255,255,0.76)",
  },
  codeCard: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    padding: 14,
  },
  codeCopy: {
    flex: 1,
    gap: 2,
  },
  codeLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
    textTransform: "uppercase",
    color: palette.mutedForeground,
  },
  codeValue: {
    fontSize: 25,
    lineHeight: 30,
    fontWeight: "900",
    color: palette.foreground,
  },
  shareButton: {
    minHeight: 46,
    borderRadius: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: palette.secondary,
    paddingHorizontal: 14,
  },
  shareButtonDisabled: {
    opacity: 0.55,
  },
  shareButtonText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  statsGrid: {
    flexDirection: "row",
    gap: 10,
  },
  statCard: {
    flex: 1,
    minHeight: 82,
    borderRadius: 22,
    justifyContent: "center",
    padding: 14,
    gap: 2,
  },
  statValue: {
    fontSize: 25,
    lineHeight: 30,
    fontWeight: "900",
    color: palette.foreground,
  },
  statLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    color: palette.mutedForeground,
  },
  ruleCard: {
    borderRadius: 24,
    backgroundColor: palette.surface,
    padding: 14,
    gap: 10,
    shadowColor: palette.shadow,
    shadowOpacity: 0.9,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  ruleCardTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
    color: palette.foreground,
  },
  ruleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  ruleIcon: {
    width: 38,
    height: 38,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF1E8",
  },
  ruleText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
    color: palette.foreground,
  },
  sectionHeader: {
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "900",
    color: palette.foreground,
  },
  rewardList: {
    gap: 10,
  },
  rewardRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: 22,
    backgroundColor: palette.surface,
    padding: 14,
  },
  rewardIcon: {
    width: 40,
    height: 40,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.warningSurface,
  },
  rewardIconSuccess: {
    backgroundColor: palette.successSurface,
  },
  rewardIconMuted: {
    backgroundColor: "#F2F2F2",
  },
  rewardCopy: {
    flex: 1,
    gap: 2,
  },
  rewardTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
    color: palette.foreground,
  },
  rewardMeta: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  rewardVoucher: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "800",
    color: palette.secondary,
  },
  rewardSkipped: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  rewardSupportHint: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "800",
    color: palette.secondary,
  },
  noRewardsCard: {
    minHeight: 120,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: palette.surface,
  },
  noRewardsTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "800",
    color: palette.foreground,
  },
});
