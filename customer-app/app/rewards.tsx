import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BelaPullToRefresh } from "@/src/components/bela-pull-to-refresh";
import { EmptyStateCard } from "@/src/components/empty-state-card";
import { ErrorRetryCard } from "@/src/components/error-retry-card";
import { ShimmerBlock } from "@/src/components/loading-skeleton";
import { MysteryBoxReveal } from "@/src/components/rewards/mystery-box-reveal";
import { CoinCounter, CoinIcon } from "@/src/components/rewards/reward-tokens";
import { SpinTicket } from "@/src/components/rewards/spin-ticket";
import { SpinWheel, type SpinWheelHandle } from "@/src/components/rewards/spin-wheel";
import { StampGrid, stampHeadline } from "@/src/components/rewards/stamp-card";
import { Screen } from "@/src/components/screen";
import { AppHeader } from "@/src/components/ui";
import { useCustomerCustomOfferRequestMutation } from "@/src/hooks/use-customer-api";
import {
  useBuyStampMutation,
  useCustomerRewardsQuery,
  useOpenBoxMutation,
  useRefreshRewards,
  useSpinMutation,
  useUnlockSpinMutation,
  type SpinItem,
  type SpinPrize,
} from "@/src/hooks/use-rewards-api";
import { appAlert } from "@/src/lib/app-alert";
import { playRewardSound, preloadRewardSounds, rewardHaptics } from "@/src/lib/reward-sounds";
import { syncSpinReadyNotifications } from "@/src/lib/rewards-notify";
import { useCustomerAuthStore } from "@/src/store/auth-store";
import { palette } from "@/src/theme/palette";

function prizeText(prize: SpinPrize) {
  if (prize.type === "coins") return `🪙 +${prize.amount} coins`;
  if (prize.type === "bonus_stamp") return "📮 +1 stamp";
  if (prize.type === "free_delivery") return `🛵 Free delivery${prize.voucherCode ? ` · ${prize.voucherCode}` : ""}`;
  if (prize.type === "discount") return `💸 ${prize.label}${prize.voucherCode ? ` · ${prize.voucherCode}` : ""}`;
  return "😄 Better luck next time";
}

// Bela Rewards: stamps → mystery box, spins → coins/stamps/vouchers, coins → stamps or early spins.
export default function RewardsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isFocused = useIsFocused();
  const signedIn = useCustomerAuthStore((state) => Boolean(state.accessToken));
  const rewardsQuery = useCustomerRewardsQuery();
  const refresh = useRefreshRewards();
  const spinMutation = useSpinMutation();
  const unlockSpin = useUnlockSpinMutation();
  const buyStamp = useBuyStampMutation();
  const openBox = useOpenBoxMutation();
  const claim = useCustomerCustomOfferRequestMutation();
  const wheelRef = useRef<SpinWheelHandle>(null);
  const [code, setCode] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [activeSpin, setActiveSpin] = useState<SpinItem | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [spinResult, setSpinResult] = useState<SpinPrize | null>(null);
  const [reveal, setReveal] = useState<{ amount: number | null; code: string } | null>(null);

  const rewards = rewardsQuery.data;

  useEffect(() => {
    if (rewards) void syncSpinReadyNotifications(rewards.spins.items, rewards.spins.localNotify);
  }, [rewards]);
  useEffect(() => {
    preloadRewardSounds();
  }, []);

  if (!signedIn) {
    return (
      <Screen>
        <AppHeader title="Rewards" />
        <View style={styles.pad}>
          <EmptyStateCard
            title="Sign in to collect rewards"
            description="Every delivered order gives you a stamp and a spin."
            actionLabel="Sign in"
            onPress={() => router.push({ pathname: "/sign-in", params: { redirectTo: "/rewards" } })}
          />
        </View>
      </Screen>
    );
  }

  const readyBox = rewards?.boxes.find((box) => box.status === "ready");
  // Only spins still to use — results aren't listed (the wheel already showed them).
  const pendingSpins = rewards?.spins.items.filter((spin) => spin.status === "unscratched") ?? [];
  const waitingBox = rewards?.boxes.find((box) => box.status === "requested");
  // Ready = no unlock time or already past it (only the first one animates).
  const firstReadyIndex = pendingSpins.findIndex(
    (spin) => !spin.unlocksAt || new Date(spin.unlocksAt).getTime() <= Date.now(),
  );
  const openSpin = (spin: SpinItem) => {
    setSpinResult(null);
    setActiveSpin(spin);
  };
  const coins = rewards?.coins;
  const canBuyStamp = Boolean(
    rewards &&
      coins &&
      rewards.stamps.status !== "eligible" &&
      !readyBox &&
      !waitingBox &&
      coins.balance >= coins.stampPrice &&
      coins.stampsBoughtThisCard < coins.maxStampsPerCard,
  );

  const startSpin = async () => {
    if (!activeSpin || spinning) return;
    setSpinning(true);
    setSpinResult(null);
    try {
      const result = await spinMutation.mutateAsync({ spinId: activeSpin.id });
      if (result.prize) {
        await wheelRef.current?.spinTo(result.prize.id);
        if (result.prize.type === "fun") {
          playRewardSound("lose");
          rewardHaptics.lose();
        } else {
          playRewardSound("win");
          rewardHaptics.win();
        }
        setSpinResult(result.prize);
      }
    } catch (error) {
      appAlert("Couldn't spin", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setSpinning(false);
      refresh();
    }
  };

  // Coins only UNLOCK the spin; the wheel then waits for the customer to spin it.
  const openEarly = (spin: SpinItem) => {
    if (!coins) return;
    if (coins.balance < coins.skipCost) {
      appAlert("Not enough coins", `You need ${coins.skipCost} coins to open a spin early.`);
      return;
    }
    appAlert("Open now?", `Use ${coins.skipCost} coins to unlock this spin right away.`, [
      { text: "Wait", style: "cancel" },
      {
        text: `Use ${coins.skipCost} 🪙`,
        onPress: () =>
          unlockSpin.mutate(spin.id, {
            onSuccess: (unlocked) => {
              rewardHaptics.knock();
              setSpinResult(null);
              setActiveSpin(unlocked);
              refresh();
            },
            onError: (error) => appAlert("Couldn't open", error instanceof Error ? error.message : "Please try again."),
          }),
      },
    ]);
  };

  const doClaim = () => {
    claim.mutate(
      { requestedCode: code.trim().toUpperCase() },
      {
        onSuccess: async () => {
          setCode("");
          const fresh = await rewardsQuery.refetch();
          const box = fresh.data?.boxes.find((item) => item.status === "ready");
          if (box) {
            // Auto mode: open straight away with the animation.
            setReveal({ amount: null, code: "" });
            openBox.mutate(box.id, {
              onSuccess: (opened) => setReveal({ amount: opened.prizeAmount, code: opened.voucherCode }),
              onError: () => setReveal(null),
            });
          } else {
            appAlert("Box claimed 🎁", "We'll check it soon — you can open it here once it's approved.");
          }
        },
        onError: (error) => appAlert("Couldn't claim", error instanceof Error ? error.message : "Please try again."),
      },
    );
  };

  const doOpenBox = (boxId: string) => {
    setReveal({ amount: null, code: "" });
    openBox.mutate(boxId, {
      onSuccess: (opened) => setReveal({ amount: opened.prizeAmount, code: opened.voucherCode }),
      onError: (error) => {
        setReveal(null);
        appAlert("Couldn't open", error instanceof Error ? error.message : "Please try again.");
      },
    });
  };

  // backdrop 20 + card 20 padding on each side
  const wheelSize = Math.min(width - 84, 320);

  return (
    <Screen>
      <AppHeader title="Rewards" subtitle="Order · collect · win" right={coins ? <CoinCounter balance={coins.balance} /> : undefined} />
      <BelaPullToRefresh
        refreshing={refreshing}
        onRefresh={async () => {
          setRefreshing(true);
          try {
            await rewardsQuery.refetch();
          } finally {
            setRefreshing(false);
          }
        }}
      >
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}>
          {rewardsQuery.isLoading && !rewards ? (
            <View style={styles.gap}>
              <ShimmerBlock style={styles.skeletonCard} />
              <ShimmerBlock style={styles.skeletonRow} />
              <ShimmerBlock style={styles.skeletonRow} />
            </View>
          ) : rewardsQuery.isError && !rewards ? (
            <ErrorRetryCard
              title="Couldn't load rewards"
              description="Check your connection and try again."
              onRetry={() => void rewardsQuery.refetch()}
              retrying={rewardsQuery.isFetching}
            />
          ) : rewards ? (
            <>
              {rewards.testMode ? (
                <View style={styles.testBanner}>
                  <Text style={styles.testText}>🧪 TEST MODE — spins open fast, nothing here counts for real.</Text>
                </View>
              ) : null}

              {/* 📮 Stamp card */}
              <View style={[styles.card, rewards.stamps.status === "eligible" || readyBox ? styles.cardHot : null]}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>📮 Stamp card</Text>
                  <Text style={styles.cardCount}>
                    {rewards.stamps.completed}/{rewards.stamps.target}
                  </Text>
                </View>
                <StampGrid completed={rewards.stamps.completed} target={rewards.stamps.target} />
                <Text style={styles.headline}>{stampHeadline(rewards)}</Text>
                {rewards.stamps.extra > 0 ? (
                  <Text style={styles.small}>+{rewards.stamps.extra} extra stamp{rewards.stamps.extra === 1 ? "" : "s"} saved for your next card</Text>
                ) : null}

                {readyBox ? (
                  <Pressable onPress={() => doOpenBox(readyBox.id)} style={({ pressed }) => [styles.primary, pressed ? styles.pressed : null]} accessibilityRole="button">
                    <Ionicons name="gift" size={18} color={palette.onPrimary} />
                    <Text style={styles.primaryText}>Open mystery box</Text>
                  </Pressable>
                ) : waitingBox ? (
                  <View style={styles.note}>
                    <Ionicons name="hourglass-outline" size={16} color={palette.warningText} />
                    <Text style={styles.noteText}>Claimed — you can open it here once it&apos;s approved.</Text>
                  </View>
                ) : rewards.stamps.status === "eligible" ? (
                  <View style={styles.gap}>
                    <Text style={styles.boxRange}>
                      🎁 Mystery box · ৳{rewards.stamps.boxRange.min} – ৳{rewards.stamps.boxRange.max} inside
                    </Text>
                    <TextInput
                      value={code}
                      onChangeText={(value) =>
                        setCode(value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, rewards.stamps.requestedCodeMaxLength))
                      }
                      placeholder="Your own code (optional) e.g. RAHIM"
                      placeholderTextColor={palette.placeholder}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      style={styles.input}
                    />
                    <Pressable onPress={doClaim} disabled={claim.isPending} style={({ pressed }) => [styles.primary, pressed ? styles.pressed : null]} accessibilityRole="button">
                      {claim.isPending ? (
                        <ActivityIndicator color={palette.onPrimary} />
                      ) : (
                        <>
                          <Ionicons name="gift" size={18} color={palette.onPrimary} />
                          <Text style={styles.primaryText}>Claim mystery box</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                ) : coins ? (
                  <Pressable
                    onPress={() =>
                      buyStamp.mutate(undefined, {
                        onError: (error) => appAlert("Couldn't buy", error instanceof Error ? error.message : "Please try again."),
                      })
                    }
                    disabled={!canBuyStamp || buyStamp.isPending}
                    style={({ pressed }) => [styles.secondary, !canBuyStamp ? styles.disabled : null, pressed ? styles.pressed : null]}
                    accessibilityRole="button"
                  >
                    {buyStamp.isPending ? (
                      <ActivityIndicator color={palette.foreground} />
                    ) : (
                      <>
                        <Text style={styles.secondaryText}>Buy a stamp ·</Text>
                        <CoinIcon size={16} />
                        <Text style={styles.secondaryText}>{coins.stampPrice}</Text>
                        <Text style={styles.smallInline}>
                          ({coins.stampsBoughtThisCard}/{coins.maxStampsPerCard} this card)
                        </Text>
                      </>
                    )}
                  </Pressable>
                ) : null}
              </View>

              {/* 🎡 Spins */}
              <View style={styles.gap}>
                <View style={styles.sectionRow}>
                  <Text style={styles.sectionTitle}>🎡 Spins</Text>
                  {pendingSpins.length > 0 ? (
                    <View style={styles.spinCounter}>
                      {rewards.spins.readyCount > 0 ? (
                        <View style={[styles.counterPill, styles.counterPillHot]}>
                          <Text style={styles.counterHotText}>{rewards.spins.readyCount} ready</Text>
                        </View>
                      ) : null}
                      {rewards.spins.lockedCount > 0 ? (
                        <View style={styles.counterPill}>
                          <Text style={styles.counterText}>🔒 {rewards.spins.lockedCount}</Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
                {pendingSpins.length === 0 ? (
                  <View style={styles.emptySpins}>
                    <Text style={styles.small}>
                      Every delivered order{rewards.spins.minOrderAmount ? ` over ৳${rewards.spins.minOrderAmount}` : ""} gives you a spin.
                    </Text>
                  </View>
                ) : (
                  pendingSpins.map((spin, index) => (
                    <SpinTicket
                      key={spin.id}
                      spin={spin}
                      active={isFocused && !activeSpin}
                      animate={index === firstReadyIndex}
                      unlockHours={rewards.spins.unlockHours}
                      skipCost={coins?.skipCost ?? 0}
                      onSpin={openSpin}
                      onSkip={openEarly}
                    />
                  ))
                )}
              </View>

              {/* How it works */}
              <View style={styles.howCard}>
                <Text style={styles.howTitle}>How it works</Text>
                <Text style={styles.howLine}>📮 Every delivered order = 1 stamp. {rewards.stamps.target} stamps = 🎁 mystery box.</Text>
                <Text style={styles.howLine}>🎡 Every order also gives a spin — it opens after {rewards.spins.unlockHours}h, or right away for coins.</Text>
                <Text style={styles.howLine}>🪙 Use coins to buy stamps or open spins early. Coins last {coins?.expiryDays} days.</Text>
              </View>

              <Pressable onPress={() => router.push("/offers")} style={({ pressed }) => [styles.vouchersRow, pressed ? styles.pressed : null]} accessibilityRole="button">
                <Ionicons name="pricetags-outline" size={18} color={palette.foreground} />
                <Text style={styles.vouchersText}>My vouchers</Text>
                <Ionicons name="chevron-forward" size={18} color={palette.mutedForeground} />
              </Pressable>
            </>
          ) : null}
        </ScrollView>
      </BelaPullToRefresh>

      {/* Spin modal */}
      <Modal visible={Boolean(activeSpin)} transparent animationType="fade" onRequestClose={() => !spinning && setActiveSpin(null)} statusBarTranslucent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalKicker}>BELA ARCADE</Text>
              <Text style={styles.modalTitle}>
                {spinResult ? (spinResult.type === "fun" ? "So close!" : "JACKPOT!") : spinning ? "Spinning…" : "SPIN & WIN"}
              </Text>
            </View>
            {rewards ? (
              <SpinWheel
                ref={wheelRef}
                segments={rewards.spins.wheel}
                size={wheelSize}
                canFlick={!spinning && !spinResult}
                onFlick={() => void startSpin()}
                mode={spinning ? "spinning" : spinResult ? (spinResult.type === "fun" ? "lose" : "win") : "idle"}
              />
            ) : null}
            {!spinResult && !spinning ? <Text style={styles.modalHint}>Swipe the wheel or tap the hub</Text> : null}
            {spinResult ? (
              <View style={[styles.resultBox, spinResult.type === "fun" ? styles.resultBoxLose : null]}>
                <Text style={[styles.resultText, spinResult.type === "fun" ? styles.resultTextLose : null]}>
                  {prizeText(spinResult)}
                </Text>
                {spinResult.voucherCode ? <Text style={styles.resultSub}>Saved to your vouchers</Text> : null}
              </View>
            ) : null}
            {spinResult || !activeSpin || activeSpin.status === "scratched" ? (
              <Pressable onPress={() => { setActiveSpin(null); setSpinResult(null); }} style={({ pressed }) => [styles.primary, styles.modalButton, pressed ? styles.pressed : null]} accessibilityRole="button">
                <Text style={styles.primaryText}>Done</Text>
              </Pressable>
            ) : spinning ? (
              <View style={[styles.primary, styles.modalButton, styles.disabled]}>
                <ActivityIndicator color={palette.onPrimary} />
                <Text style={styles.primaryText}>Good luck…</Text>
              </View>
            ) : (
              <Pressable onPress={() => void startSpin()} style={({ pressed }) => [styles.primary, styles.modalButton, pressed ? styles.pressed : null]} accessibilityRole="button">
                <Ionicons name="sync" size={18} color={palette.onPrimary} />
                <Text style={styles.primaryText}>SPIN</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>

      <MysteryBoxReveal
        visible={Boolean(reveal)}
        prizeAmount={reveal?.amount ?? null}
        voucherCode={reveal?.code ?? ""}
        onClose={() => {
          setReveal(null);
          refresh();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16 },
  testBanner: { padding: 10, borderRadius: 12, backgroundColor: "#EDE7FF", borderWidth: 1, borderColor: "#B9A6F5" },
  testText: { fontSize: 12.5, fontWeight: "800", color: "#4B2BB3", textAlign: "center" },
  pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.5 },
  content: { paddingHorizontal: 16, paddingTop: 6, gap: 18 },
  gap: { gap: 10 },
  card: { gap: 14, padding: 18, borderRadius: 24, backgroundColor: palette.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: "#E3E4E7" },
  cardHot: { borderWidth: 1.5, borderColor: palette.primary },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { fontSize: 18, fontWeight: "800", color: palette.foreground },
  cardCount: { fontSize: 14, fontWeight: "800", color: palette.secondary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, overflow: "hidden", backgroundColor: palette.primarySoft },
  headline: { fontSize: 15, fontWeight: "700", textAlign: "center", color: palette.foreground },
  boxRange: { fontSize: 13.5, fontWeight: "700", textAlign: "center", color: palette.secondary },
  small: { fontSize: 12.5, lineHeight: 18, textAlign: "center", color: palette.mutedForeground },
  smallInline: { fontSize: 11.5, color: palette.mutedForeground },
  input: { minHeight: 48, borderRadius: 14, borderWidth: 1.5, borderColor: "#E3E4E7", paddingHorizontal: 12, fontSize: 15, fontWeight: "700", letterSpacing: 1, color: palette.foreground },
  primary: { height: 52, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: palette.primary },
  primaryText: { fontSize: 16, fontWeight: "800", color: palette.onPrimary },
  secondary: { height: 46, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: "#DADCE0", backgroundColor: palette.surface },
  secondaryText: { fontSize: 14, fontWeight: "700", color: palette.foreground },
  note: { flexDirection: "row", gap: 8, padding: 12, borderRadius: 14, backgroundColor: "#FFF1DD" },
  noteText: { flex: 1, fontSize: 13, lineHeight: 18, color: palette.warningText },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: palette.foreground },
  emptySpins: { padding: 18, borderRadius: 18, borderWidth: 1.5, borderStyle: "dashed", borderColor: "#D5D7DB" },
  spinCounter: { flexDirection: "row", gap: 6 },
  counterPill: { height: 24, paddingHorizontal: 10, borderRadius: 12, justifyContent: "center", backgroundColor: "#EEEFF2" },
  counterPillHot: { backgroundColor: "#111111" },
  counterText: { fontSize: 12, fontWeight: "700", color: palette.foreground, fontVariant: ["tabular-nums"] },
  counterHotText: { fontSize: 12, fontWeight: "700", color: palette.primary, fontVariant: ["tabular-nums"] },
  howCard: { gap: 6, padding: 16, borderRadius: 18, backgroundColor: palette.primarySoft },
  howTitle: { fontSize: 14.5, fontWeight: "800", color: palette.foreground },
  howLine: { fontSize: 13, lineHeight: 19, color: palette.foreground },
  vouchersRow: { flexDirection: "row", alignItems: "center", gap: 10, height: 54, paddingHorizontal: 16, borderRadius: 16, backgroundColor: palette.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: "#E3E4E7" },
  vouchersText: { flex: 1, fontSize: 15, fontWeight: "700", color: palette.foreground },
  skeletonCard: { height: 260, borderRadius: 24 },
  skeletonRow: { height: 66, borderRadius: 18 },
  modalBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20, backgroundColor: "rgba(10,10,12,0.78)" },
  // Arcade cabinet: dark card that frames the marquee wheel.
  modalCard: {
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
    gap: 16,
    padding: 20,
    borderRadius: 30,
    backgroundColor: "#0E0E12",
    borderWidth: 1,
    borderColor: "rgba(255,184,76,0.35)",
  },
  modalHead: { alignItems: "center", gap: 2 },
  modalKicker: { fontSize: 11, fontWeight: "700", letterSpacing: 2.5, color: "#8A8F98" },
  modalTitle: { fontSize: 24, fontWeight: "700", letterSpacing: 1, color: palette.primary },
  modalHint: { fontSize: 12.5, color: "#9AA0A6" },
  modalButton: { alignSelf: "stretch" },
  resultBox: { alignSelf: "stretch", alignItems: "center", gap: 4, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 18, backgroundColor: palette.primary },
  resultBoxLose: { backgroundColor: "#22222A" },
  resultText: { fontSize: 18, fontWeight: "700", color: palette.onPrimary, textAlign: "center" },
  resultTextLose: { color: "#E3E5E8" },
  resultSub: { fontSize: 12.5, color: "rgba(17,17,17,0.7)" },
  oddsCard: { width: "100%", maxWidth: 360, gap: 10, padding: 20, borderRadius: 24, backgroundColor: palette.surface },
  oddsRow: { flexDirection: "row", justifyContent: "space-between" },
  oddsLabel: { fontSize: 14, color: palette.foreground },
  oddsValue: { fontSize: 14, fontWeight: "800", color: palette.foreground },
});
