import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
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

import { AppBottomSheet } from "@/src/components/app-bottom-sheet";
import { OwnerStatusBadge } from "@/src/components/owner-status-badge";
import { OwnerHeaderActions } from "@/src/components/owner-header-actions";
import { Screen } from "@/src/components/screen";
import { StatusPill, type StatusTone } from "@/src/components/status-pill";
import {
  type OwnerPayoutHistory,
  type OwnerPayoutSummary,
  type OwnerPayoutTransaction,
  useOwnerDashboardSummaryQuery,
  useOwnerPayoutHistoryQuery,
  useOwnerPayoutSummaryQuery,
  useOwnerPayoutTransactionsQuery,
} from "@/src/hooks/use-owner-api";
import {
  type TranslationKey,
  useOwnerTranslation,
} from "@/src/i18n/translations";
import { formatCurrency, localizeDigits } from "@/src/lib/format";
import { palette } from "@/src/theme/palette";

type PayoutTab = "cycle" | "lifetime" | "history";
const PAYOUT_HISTORY_PAGE_STEP = 8;

const payoutTabs: {
  key: PayoutTab;
  labelKey: TranslationKey;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: "cycle", labelKey: "payouts.tabs.cycle", icon: "repeat-outline" },
  { key: "lifetime", labelKey: "payouts.tabs.lifetime", icon: "trending-up-outline" },
  { key: "history", labelKey: "payouts.tabs.history", icon: "receipt-outline" },
];

export default function PayoutsScreen() {
  const { language, t } = useOwnerTranslation();
  const payoutQuery = useOwnerPayoutSummaryQuery();
  const [isRefreshing, setIsRefreshing] = useState(false);
  // The statement is per-payout: opened from a "View statement" button inside a payout's
  // detail sheet, scoped to that specific payout.
  const [statementPayout, setStatementPayout] = useState<OwnerPayoutHistory | null>(null);
  const [statementTab, setStatementTab] = useState<"breakdown" | "topSellers">("breakdown");
  // The exact per-payout order rows — same endpoint the owner-web uses, so totals match 100%.
  const statementTxQuery = useOwnerPayoutTransactionsQuery(
    statementPayout?._id ?? null,
    Boolean(statementPayout),
  );
  const statementOrderTx = (statementTxQuery.data?.items ?? []).filter(
    (transaction) => transaction.type !== "payout",
  );
  const statementTotals = statementOrderTx.reduce(
    (totals, transaction) => ({
      gross: totals.gross + transaction.grossAmount,
      commission: totals.commission + transaction.commission,
      discount: totals.discount + transaction.discountCost,
      net: totals.net + transaction.netAmount,
    }),
    { gross: 0, commission: 0, discount: 0, net: 0 },
  );
  // Best sellers WITHIN this payout's orders (from the backend), not today's dashboard data.
  const statementTopItems = statementTxQuery.data?.topItems ?? [];
  const [activeTab, setActiveTab] = useState<PayoutTab>("cycle");
  const [selectedPayout, setSelectedPayout] = useState<OwnerPayoutHistory | null>(null);
  const [historyPageSize, setHistoryPageSize] = useState(PAYOUT_HISTORY_PAGE_STEP);
  const payoutHistoryQuery = useOwnerPayoutHistoryQuery(true, historyPageSize);
  // Today's best sellers — shares the home dashboard's cached query (no extra request) and
  // fits the same-day settlement model ("what sold today").
  const dashboardQuery = useOwnerDashboardSummaryQuery();
  const summary = payoutQuery.data;
  const history = payoutHistoryQuery.data?.items ?? [];
  const canLoadMoreHistory = Boolean(
    payoutHistoryQuery.data?.total &&
      history.length < payoutHistoryQuery.data.total &&
      !payoutHistoryQuery.isFetching,
  );
  const payoutMethod = summary?.payoutMethod;
  const payoutMethodStatus = getPayoutMethodStatus(payoutMethod, t);
  const nextPayoutLabel = getNextPayoutLabel(
    summary?.nextSettlementAvailableAt,
    summary?.availableBalance,
    language,
    t,
  );
  const lastPayoutLabel =
    summary?.lastPayout?.status === "completed"
      ? (summary.lastPayout.processedAt ?? summary.lastPayout.requestedAt)
      : null;

  async function refreshPayouts() {
    setIsRefreshing(true);
    try {
      await Promise.all([
        payoutQuery.refetch(),
        payoutHistoryQuery.refetch(),
        dashboardQuery.refetch(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refreshPayouts}
            tintColor={palette.primary}
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{t("payouts.title")}</Text>
              <OwnerStatusBadge />
            </View>
            <Text style={styles.subtitle}>
              {t("payouts.subtitle")}
            </Text>
          </View>
          <OwnerHeaderActions />
        </View>

        {payoutQuery.isLoading ? (
          <View style={styles.feedbackCard}>
            <ActivityIndicator size="small" color={palette.primary} />
            <Text style={styles.feedbackText}>{t("payouts.loadingSummary")}</Text>
          </View>
        ) : (
          <>
            <View style={styles.balanceCard}>
              <View style={styles.balanceTopRow}>
                <View>
                  <Text style={styles.balanceLabel}>{t("payouts.availableForPayout")}</Text>
                  <Text style={styles.balanceValue}>
                    {formatCurrency(summary?.availableBalance)}
                  </Text>
                </View>
                <View style={styles.balanceIconWrap}>
                  <Ionicons name="wallet-outline" size={24} color="#FFFFFF" />
                </View>
              </View>
              <View style={styles.balanceDivider} />
              <View style={styles.balanceMetaGrid}>
                <View style={styles.balanceMetaItem}>
                  <Text style={styles.balanceMetaLabel}>{t("payouts.lastPaid")}</Text>
                  <Text style={styles.balanceMetaValue}>
                    {lastPayoutLabel
                      ? formatDate(lastPayoutLabel, language)
                      : t("payouts.noPayoutYet")}
                  </Text>
                </View>
                <View style={styles.balanceMetaItem}>
                  <Text style={styles.balanceMetaLabel}>{t("payouts.nextPayout")}</Text>
                  <Text style={styles.balanceMetaValue}>{nextPayoutLabel}</Text>
                </View>
              </View>
              <View style={styles.balanceMethodCard}>
                <View style={styles.balanceMethodIcon}>
                  <Ionicons name="phone-portrait-outline" size={18} color="#FFFFFF" />
                </View>
                <View style={styles.balanceMethodBody}>
                  <Text style={styles.balanceMethodLabel}>{t("payouts.bkashPayoutNumber")}</Text>
                  <Text style={styles.balanceMethodValue}>
                    {payoutMethod?.accountNumber || t("payouts.notActiveYet")}
                  </Text>
                  {payoutMethodStatus.detail ? (
                    <Text style={styles.balanceMethodDetail}>
                      {payoutMethodStatus.detail}
                    </Text>
                  ) : null}
                </View>
                <View
                  style={[
                    styles.balanceStatusChip,
                    payoutMethodStatus.tone === "success"
                      ? styles.balanceStatusSuccess
                      : payoutMethodStatus.tone === "danger"
                        ? styles.balanceStatusDanger
                        : styles.balanceStatusWarning,
                  ]}
                >
                  <Text style={styles.balanceStatusText}>
                    {payoutMethodStatus.label}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.tabRow}>
              {payoutTabs.map((tab) => {
                const isActive = activeTab === tab.key;

                return (
                  <Pressable
                    key={tab.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    onPress={() => setActiveTab(tab.key)}
                    style={({ pressed }) => [
                      styles.tabButton,
                      isActive && styles.tabButtonActive,
                      pressed && styles.tabButtonPressed,
                    ]}
                  >
                    <Ionicons
                      name={tab.icon}
                      size={16}
                      color={isActive ? "#FFFFFF" : palette.mutedForeground}
                    />
                    <Text
                      style={[
                        styles.tabButtonText,
                        isActive && styles.tabButtonTextActive,
                      ]}
                    >
                      {t(tab.labelKey)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {activeTab === "cycle" ? (
              <View style={styles.sectionBlock}>
                <Text style={styles.sectionTitle}>{t("payouts.currentCycle")}</Text>
                <View style={styles.noticeCard}>
                  <Ionicons
                    name="information-circle-outline"
                    size={20}
                    color={palette.info}
                  />
                  <Text style={styles.noticeText}>
                    {t("payouts.cycleNotice")}
                  </Text>
                </View>
                <View style={styles.grid}>
                  <SummaryTile
                    label={t("payouts.readyNow")}
                    value={formatCurrency(summary?.availableBalance)}
                    icon="cash-outline"
                    tone="success"
                  />
                  <SummaryTile
                    label={t("payouts.pending")}
                    value={formatCurrency(summary?.pendingBalance)}
                    icon="time-outline"
                    tone="warning"
                  />
                  <SummaryTile
                    label={t("payouts.inPayout")}
                    value={formatCurrency(summary?.requestedPayoutBalance)}
                    icon="hourglass-outline"
                    tone="info"
                  />
                  <SummaryTile
                    label={t("payouts.paidOut")}
                    value={formatCurrency(summary?.paidOutBalance)}
                    icon="checkmark-done-outline"
                    tone="neutral"
                  />
                </View>
              </View>
            ) : null}

            {activeTab === "lifetime" ? (
              <View style={styles.sectionBlock}>
                <Text style={styles.sectionTitle}>{t("payouts.lifetimeKpi")}</Text>
                <View style={styles.grid}>
                  <SummaryTile
                    label={t("payouts.foodSales")}
                    value={formatCurrency(summary?.lifetimeGrossAmount)}
                    icon="restaurant-outline"
                    tone="primary"
                  />
                  <SummaryTile
                    label={t("payouts.commission")}
                    value={`-${formatCurrency(summary?.lifetimeCommission)}`}
                    icon="remove-circle-outline"
                    tone="danger"
                  />
                  <SummaryTile
                    label={t("payouts.ownerDiscount")}
                    value={`-${formatCurrency(summary?.lifetimeDiscountCost)}`}
                    icon="pricetag-outline"
                    tone="warning"
                  />
                  <SummaryTile
                    label={t("payouts.netEarning")}
                    value={formatCurrency(summary?.lifetimeNetEarnings)}
                    icon="trending-up-outline"
                    tone="success"
                  />
                </View>
              </View>
            ) : null}

            {activeTab === "history" ? (
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>{t("payouts.historyTitle")}</Text>
                    <Text style={styles.sectionSubtitle}>
                      {t("payouts.historySubtitle")}
                    </Text>
                  </View>
                  {payoutHistoryQuery.isFetching ? (
                    <ActivityIndicator size="small" color={palette.primary} />
                  ) : null}
                </View>
                {/* Payouts are admin-initiated (settled centrally), so the owner view is
                    read-only — no self-service request button. */}
                {history.length ? (
                  <View style={styles.historyList}>
                    {history.map((payout) => (
                      <PayoutHistoryRow
                        key={payout._id}
                        payout={payout}
                        language={language}
                        t={t}
                        onPress={() => setSelectedPayout(payout)}
                      />
                    ))}
                    <View style={styles.historyFooter}>
                      {payoutHistoryQuery.isFetching ? (
                        <ActivityIndicator size="small" color={palette.primary} />
                      ) : canLoadMoreHistory ? (
                        <Pressable
                          accessibilityRole="button"
                          style={({ pressed }) => [
                            styles.loadMoreButton,
                            pressed ? styles.loadMoreButtonPressed : null,
                          ]}
                          onPress={() =>
                            setHistoryPageSize((current) => current + PAYOUT_HISTORY_PAGE_STEP)
                          }
                        >
                          <Text style={styles.loadMoreText}>{t("payouts.showMorePayouts")}</Text>
                          <Ionicons name="chevron-down" size={16} color={palette.foreground} />
                        </Pressable>
                      ) : (
                        <Text style={styles.endOfListText}>{t("payouts.allHistoryLoaded")}</Text>
                      )}
                    </View>
                  </View>
                ) : (
                  <View style={styles.emptyHistory}>
                    <Ionicons
                      name="receipt-outline"
                      size={24}
                      color={palette.mutedForeground}
                    />
                    <Text style={styles.emptyHistoryTitle}>{t("payouts.noPayoutsYet")}</Text>
                    <Text style={styles.emptyHistoryText}>
                      {t("payouts.noPayoutsYetBody")}
                    </Text>
                  </View>
                )}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <AppBottomSheet
        visible={Boolean(selectedPayout)}
        onClose={() => setSelectedPayout(null)}
        title={t("payouts.detailsTitle")}
        subtitle={
          selectedPayout
            ? `${formatCurrency(selectedPayout.amount)} - ${formatPayoutStatus(selectedPayout.status, t)}`
            : undefined
        }
        leadingIcon="receipt-outline"
        snapPoints={[0.68, 0.9]}
      >
        {selectedPayout ? (
          <PayoutDetailsSheet
            payout={selectedPayout}
            language={language}
            t={t}
            onViewStatement={() => {
              const payout = selectedPayout;
              setSelectedPayout(null);
              setStatementTab("breakdown");
              setStatementPayout(payout);
            }}
          />
        ) : null}
      </AppBottomSheet>

      {/* Per-payout statement — opened from a payout's detail sheet, scoped to that payout.
          Read-only, in-app (no native PDF/print dependency → OTA-updatable). */}
      <Modal
        visible={Boolean(statementPayout)}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setStatementPayout(null)}
      >
        {statementPayout ? (
          <Screen>
            <View style={styles.statementHeader}>
              <View style={styles.statementHeaderCopy}>
                <Text style={styles.statementTitle}>{t("payouts.statement")}</Text>
                <Text style={styles.statementSubtitle} numberOfLines={1}>
                  {dashboardQuery.data?.restaurant?.name
                    ? `${dashboardQuery.data.restaurant.name} · `
                    : ""}
                  {formatDate(
                    statementPayout.processedAt ?? statementPayout.requestedAt,
                    language,
                  )}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => setStatementPayout(null)}
                style={styles.statementClose}
              >
                <Ionicons name="close" size={22} color={palette.foreground} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.statementContent}>
              <View style={styles.statementBalanceCard}>
                <Text style={styles.statementBalanceLabel}>{t("payouts.amount")}</Text>
                <Text style={styles.statementBalanceValue}>
                  {formatCurrency(statementPayout.amount)}
                </Text>
                <View style={styles.statementStatusRow}>
                  <StatusPill
                    label={formatPayoutStatus(statementPayout.status, t)}
                    tone={getPayoutStatusTone(statementPayout.status)}
                  />
                  {payoutMethod?.type ? (
                    <View style={styles.statementMethodChip}>
                      <Ionicons
                        name={
                          payoutMethod.type === "bank" ? "card-outline" : "wallet-outline"
                        }
                        size={13}
                        color={palette.mutedForeground}
                      />
                      <Text style={styles.statementMethodChipText}>
                        {payoutMethod.type === "bank" ? "Bank" : "bKash"}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.statementBalanceMetaRow}>
                  <View style={styles.statementBalanceMetaItem}>
                    <Text style={styles.statementMetaLabel}>{t("payouts.requested")}</Text>
                    <Text style={styles.statementMetaValue}>
                      {formatDate(statementPayout.requestedAt, language)}
                    </Text>
                  </View>
                  <View style={styles.statementBalanceMetaItem}>
                    <Text style={styles.statementMetaLabel}>{t("payouts.processed")}</Text>
                    <Text style={styles.statementMetaValue}>
                      {statementPayout.processedAt
                        ? formatDate(statementPayout.processedAt, language)
                        : "--"}
                    </Text>
                  </View>
                </View>
                {statementPayout.providerTransactionId ? (
                  <View style={styles.statementRefRow}>
                    <Text style={styles.statementMetaLabel}>{t("payouts.transactionId")}</Text>
                    <Text style={styles.statementRefValue} numberOfLines={1}>
                      {statementPayout.providerTransactionId}
                    </Text>
                  </View>
                ) : null}
                {statementPayout.batchReference ? (
                  <View style={styles.statementRefRow}>
                    <Text style={styles.statementMetaLabel}>{t("payouts.batch")}</Text>
                    <Text style={styles.statementRefValue} numberOfLines={1}>
                      {statementPayout.batchReference}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Separate views: the per-payout order breakdown (100% synced with the web)
                  and, behind its own tab, the top-selling items. */}
              <View style={styles.statementToggle}>
                <Pressable
                  style={[
                    styles.statementToggleBtn,
                    statementTab === "breakdown" ? styles.statementToggleBtnActive : null,
                  ]}
                  onPress={() => setStatementTab("breakdown")}
                >
                  <Text
                    style={[
                      styles.statementToggleText,
                      statementTab === "breakdown" ? styles.statementToggleTextActive : null,
                    ]}
                  >
                    {t("payouts.orderBreakdown")}
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.statementToggleBtn,
                    statementTab === "topSellers" ? styles.statementToggleBtnActive : null,
                  ]}
                  onPress={() => setStatementTab("topSellers")}
                >
                  <Text
                    style={[
                      styles.statementToggleText,
                      statementTab === "topSellers" ? styles.statementToggleTextActive : null,
                    ]}
                  >
                    {t("payouts.topSellers")}
                  </Text>
                </Pressable>
              </View>

              {statementTab === "breakdown" ? (
                <>
                  <View style={styles.statTileRow}>
                    <StatTile
                      label={t("payouts.orders")}
                      value={localizeDigits(String(statementOrderTx.length))}
                    />
                    <StatTile
                      label={t("payouts.foodSales")}
                      value={formatCurrency(statementTotals.gross)}
                    />
                  </View>
                  <View style={styles.statTileRow}>
                    <StatTile
                      label={t("payouts.commission")}
                      value={`-${formatCurrency(statementTotals.commission)}`}
                      tone="danger"
                    />
                    <StatTile
                      label={t("payouts.ownerDiscount")}
                      value={`-${formatCurrency(statementTotals.discount)}`}
                      tone="warning"
                    />
                  </View>
                  <View style={styles.statementEarningCard}>
                    <Text style={styles.statementEarningLabel}>{t("payouts.ownerEarning")}</Text>
                    <Text style={styles.statementEarningValue}>
                      {formatCurrency(statementTotals.net)}
                    </Text>
                  </View>

                  <View style={styles.statementSection}>
                    <Text style={styles.statementSectionTitle}>
                      {t("payouts.includedOrders")}
                    </Text>
                    {statementTxQuery.isLoading ? (
                      <ActivityIndicator size="small" color={palette.primary} />
                    ) : statementOrderTx.length ? (
                      <View style={styles.txTable}>
                        <View style={styles.txHeaderRow}>
                          <Text style={[styles.txHeadCell, styles.txColOrder]} numberOfLines={1}>
                            {t("payouts.orderCol")}
                          </Text>
                          <Text style={[styles.txHeadCell, styles.txColNum]} numberOfLines={1}>
                            {t("payouts.foodSales")}
                          </Text>
                          <Text style={[styles.txHeadCell, styles.txColNum]} numberOfLines={1}>
                            {t("payouts.commission")}
                          </Text>
                          <Text style={[styles.txHeadCell, styles.txColNum]} numberOfLines={1}>
                            {t("payouts.ownerEarning")}
                          </Text>
                        </View>
                        {statementOrderTx.map((transaction) => (
                          <StatementOrderRow key={transaction.id} transaction={transaction} />
                        ))}
                      </View>
                    ) : (
                      <Text style={styles.statementEmpty}>{t("payouts.noTransactions")}</Text>
                    )}
                  </View>
                </>
              ) : (
                <View style={styles.statementSection}>
                  <Text style={styles.statementSectionTitle}>{t("payouts.topSellers")}</Text>
                  {statementTxQuery.isLoading ? (
                    <ActivityIndicator size="small" color={palette.primary} />
                  ) : statementTopItems.length ? (
                    statementTopItems.map((item, index) => (
                      <View key={`${item.id}-${index}`} style={styles.statementItemRow}>
                        <Text style={styles.statementItemRank}>{index + 1}</Text>
                        <View style={styles.statementItemBody}>
                          <Text style={styles.statementItemName} numberOfLines={1}>
                            {item.name}
                          </Text>
                          <Text style={styles.statementItemMeta}>
                            {localizeDigits(String(item.quantity))} {t("payouts.sold")}
                          </Text>
                        </View>
                        <Text style={styles.statementItemValue}>
                          {formatCurrency(item.revenue)}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.statementEmpty}>{t("payouts.topSellersEmpty")}</Text>
                  )}
                </View>
              )}
            </ScrollView>
          </Screen>
        ) : null}
      </Modal>
    </Screen>
  );
}

function getPayoutMethodStatus(
  payoutMethod?: OwnerPayoutSummary["payoutMethod"],
  t?: (key: TranslationKey) => string,
): { label: string; tone: "success" | "warning" | "danger"; detail: string } {
  const text = t ?? ((key: TranslationKey) => key);
  if (!payoutMethod) {
    return {
      label: text("payouts.method.setupNeeded"),
      tone: "warning",
      detail: text("payouts.method.addFromAccount"),
    };
  }

  if (payoutMethod.pendingVerificationStatus === "otp_pending") {
    return {
      label: text("payouts.method.otpPending"),
      tone: "warning",
      detail: `${text("payouts.method.newNumber")} ${payoutMethod.pendingAccountNumber ?? ""} ${text("payouts.method.needsOtp")}`,
    };
  }

  if (payoutMethod.pendingVerificationStatus === "admin_pending") {
    return {
      label: text("payouts.method.pending"),
      tone: "warning",
      detail: `${text("payouts.method.newNumber")} ${payoutMethod.pendingAccountNumber ?? ""} ${text("payouts.method.waitingAdmin")}`,
    };
  }

  if (payoutMethod.pendingVerificationStatus === "rejected") {
    return {
      label: text("payouts.method.rejected"),
      tone: "danger",
      detail: payoutMethod.pendingAdminNote
        ? `${text("payouts.method.lastRejected")} ${payoutMethod.pendingAdminNote}`
        : text("payouts.method.rejectedDetail"),
    };
  }

  if (payoutMethod.isVerified) {
    return {
      label: text("payouts.method.verified"),
      tone: "success",
      detail: text("payouts.method.activeForPayouts"),
    };
  }

  return {
    label: text("payouts.method.unverified"),
    tone: "warning",
    detail: text("payouts.method.verifyFromAccount"),
  };
}

function StatementLine({
  label,
  value,
  negative,
  strong,
}: {
  label: string;
  value: string;
  negative?: boolean;
  strong?: boolean;
}) {
  return (
    <View style={styles.statementLine}>
      <Text style={[styles.statementLineLabel, strong ? styles.statementLineStrong : null]}>
        {label}
      </Text>
      <Text
        style={[
          styles.statementLineValue,
          negative ? styles.statementLineNegative : null,
          strong ? styles.statementLineStrong : null,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger" | "warning" | "success";
}) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statTileLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[
          styles.statTileValue,
          tone === "danger"
            ? styles.statTextDanger
            : tone === "warning"
              ? styles.statTextWarning
              : tone === "success"
                ? styles.statTextSuccess
                : null,
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function StatementOrderRow({ transaction }: { transaction: OwnerPayoutTransaction }) {
  return (
    <View style={styles.txDataRow}>
      <View style={styles.txColOrder}>
        <Text style={styles.txOrderNum} numberOfLines={1}>
          {transaction.orderNumber}
        </Text>
        {transaction.orderStatus ? (
          <Text style={styles.txOrderStatus} numberOfLines={1}>
            {transaction.orderStatus}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.txCell, styles.txColNum]} numberOfLines={1}>
        {formatCurrency(transaction.grossAmount)}
      </Text>
      <Text style={[styles.txCell, styles.txColNum, styles.statTextDanger]} numberOfLines={1}>
        -{formatCurrency(transaction.commission)}
      </Text>
      <Text style={[styles.txCell, styles.txColNum, styles.statTextSuccess]} numberOfLines={1}>
        {formatCurrency(transaction.netAmount)}
      </Text>
    </View>
  );
}

function SummaryTile({
  label,
  value,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone?: "neutral" | "success" | "warning" | "danger" | "info" | "primary";
}) {
  const colors = tileToneStyles[tone];

  return (
    <View style={styles.tile}>
      <View style={[styles.tileIconWrap, { backgroundColor: colors.bg }]}>
        <Ionicons name={icon} size={18} color={colors.text} />
      </View>
      <Text numberOfLines={1} style={styles.tileValue}>
        {value}
      </Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

function PayoutHistoryRow({
  payout,
  onPress,
  language,
  t,
}: {
  payout: OwnerPayoutHistory;
  onPress: () => void;
  language: "bn" | "en";
  t: (key: TranslationKey) => string;
}) {
  const reference =
    payout.providerTransactionId ||
    payout.providerReference ||
    payout.batchReference ||
    payout._id;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.historyRow,
        pressed ? styles.historyRowPressed : null,
      ]}
    >
      <View style={styles.historyIconWrap}>
        <Ionicons name="receipt-outline" size={17} color={palette.primary} />
      </View>
      <View style={styles.historyBody}>
        <View style={styles.historyTopRow}>
          <Text style={styles.historyAmount}>
            {formatCurrency(payout.amount)}
          </Text>
          <StatusPill
            label={formatPayoutStatus(payout.status, t)}
            tone={getPayoutStatusTone(payout.status)}
          />
        </View>
        <Text style={styles.historyMeta}>
          {formatDate(payout.processedAt ?? payout.requestedAt, language)} - {reference}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={palette.mutedForeground} />
    </Pressable>
  );
}

function PayoutDetailsSheet({
  payout,
  language,
  t,
  onViewStatement,
}: {
  payout: OwnerPayoutHistory;
  language: "bn" | "en";
  t: (key: TranslationKey) => string;
  onViewStatement: () => void;
}) {
  const reference =
    payout.providerTransactionId ||
    payout.providerReference ||
    payout.batchReference ||
    payout._id;

  return (
    <View style={styles.sheetContent}>
      <View style={styles.sheetHero}>
        <View>
          <Text style={styles.sheetLabel}>{t("payouts.amount")}</Text>
          <Text style={styles.sheetAmount}>{formatCurrency(payout.amount)}</Text>
        </View>
        <StatusPill
          label={formatPayoutStatus(payout.status, t)}
          tone={getPayoutStatusTone(payout.status)}
        />
      </View>

      <View style={styles.detailCard}>
        <DetailLine label={t("payouts.reference")} value={reference} icon="barcode-outline" />
        <DetailLine
          label={t("payouts.requested")}
          value={formatDateTime(payout.requestedAt, language)}
          icon="calendar-outline"
        />
        <DetailLine
          label={t("payouts.processed")}
          value={formatDateTime(payout.processedAt, language)}
          icon="checkmark-circle-outline"
        />
        {payout.providerReference ? (
          <DetailLine
            label={t("payouts.providerRef")}
            value={payout.providerReference}
            icon="card-outline"
          />
        ) : null}
        {payout.providerTransactionId ? (
          <DetailLine
            label={t("payouts.transactionId")}
            value={payout.providerTransactionId}
            icon="receipt-outline"
          />
        ) : null}
        {payout.paymentProofUrl ? (
          <DetailLine
            label={t("payouts.proof")}
            value={payout.paymentProofUrl}
            icon="document-text-outline"
          />
        ) : null}
      </View>

      {payout.processingNote || payout.failureReason ? (
        <View style={styles.noteCard}>
          <Ionicons
            name={payout.failureReason ? "warning-outline" : "information-circle-outline"}
            size={18}
            color={payout.failureReason ? palette.danger : palette.info}
          />
          <View style={styles.noteBody}>
            <Text style={styles.noteTitle}>
              {payout.failureReason ? t("payouts.failureReason") : t("payouts.adminNote")}
            </Text>
            <Text style={styles.noteText}>
              {payout.failureReason || payout.processingNote}
            </Text>
          </View>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={onViewStatement}
        style={({ pressed }) => [
          styles.downloadButton,
          pressed ? styles.downloadButtonPressed : null,
        ]}
      >
        <Ionicons name="document-text-outline" size={17} color={palette.foreground} />
        <Text style={styles.downloadButtonText}>{t("payouts.viewStatement")}</Text>
      </Pressable>
    </View>
  );
}

function DetailLine({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.detailLine}>
      <View style={styles.detailIcon}>
        <Ionicons name={icon} size={16} color={palette.primary} />
      </View>
      <View style={styles.detailTextWrap}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value || "--"}</Text>
      </View>
    </View>
  );
}

function dateLocale(language: "bn" | "en") {
  return language === "bn" ? "bn-BD" : "en-GB";
}

function formatDate(value?: string | null, language: "bn" | "en" = "en") {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";

  // Full month name: the abbreviated Bangla months read badly and got squeezed in the
  // narrow balance columns. The label wraps instead of truncating.
  return new Intl.DateTimeFormat(dateLocale(language), {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value?: string | null, language: "bn" | "en" = "en") {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";

  return date.toLocaleString(dateLocale(language));
}

function getNextPayoutLabel(
  value: string | null | undefined,
  availableBalance: number | undefined,
  language: "bn" | "en",
  t: (key: TranslationKey) => string,
) {
  if (!value) {
    return (availableBalance ?? 0) > 0
      ? t("payouts.eligibleNow")
      : t("payouts.waitingEligibleBalance");
  }
  return formatDate(value, language);
}

function formatPayoutStatus(
  status: OwnerPayoutHistory["status"],
  t: (key: TranslationKey) => string,
) {
  const key = `payouts.status.${status}` as TranslationKey;
  return t(key);
}

function getPayoutStatusTone(status: OwnerPayoutHistory["status"]): StatusTone {
  if (status === "completed") return "success";
  if (status === "processing") return "info";
  if (status === "pending") return "warning";
  return "danger";
}

const tileToneStyles = {
  neutral: { bg: palette.surfaceMuted, text: palette.foreground },
  success: { bg: palette.successSoft, text: palette.success },
  warning: { bg: palette.warningSoft, text: palette.warning },
  danger: { bg: palette.dangerSoft, text: palette.danger },
  info: { bg: palette.infoSoft, text: palette.info },
  primary: { bg: palette.primarySoft, text: palette.primary },
} as const;

const styles = StyleSheet.create({
  content: {
    padding: 18,
    gap: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headerCopy: {
    flex: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  title: {
    fontSize: 24,
    lineHeight: 32,
    paddingTop: 2,
    fontWeight: "900",
    color: palette.foreground,
  },
  subtitle: {
    marginTop: 3,
    maxWidth: 260,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  feedbackCard: {
    minHeight: 260,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: palette.surface,
  },
  feedbackText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  balanceCard: {
    borderRadius: 24,
    backgroundColor: palette.foreground,
    padding: 20,
    gap: 12,
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  balanceTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
  },
  balanceIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  balanceDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  balanceMetaGrid: {
    flexDirection: "row",
    gap: 10,
  },
  balanceMetaItem: {
    flex: 1,
    // Without minWidth:0 a long Bangla label cannot shrink inside the flex row and
    // gets clipped instead of wrapping.
    minWidth: 0,
    gap: 3,
  },
  balanceMetaLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
    color: "#F7D9CF",
    textTransform: "uppercase",
  },
  balanceMetaValue: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  balanceLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    color: "#F7D9CF",
    textTransform: "uppercase",
  },
  balanceValue: {
    fontSize: 31,
    lineHeight: 38,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  balanceHint: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    color: "#F7D9CF",
  },
  balanceMethodCard: {
    marginTop: 4,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.1)",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  balanceMethodIcon: {
    width: 36,
    height: 36,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  balanceMethodBody: {
    flex: 1,
    gap: 2,
  },
  balanceMethodLabel: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "900",
    color: "#F7D9CF",
    textTransform: "uppercase",
  },
  balanceMethodValue: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  balanceMethodDetail: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    color: "#F7D9CF",
  },
  balanceStatusChip: {
    minHeight: 28,
    borderRadius: 11,
    paddingHorizontal: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  balanceStatusSuccess: {
    backgroundColor: "rgba(34,197,94,0.24)",
  },
  balanceStatusWarning: {
    backgroundColor: "rgba(245,158,11,0.24)",
  },
  balanceStatusDanger: {
    backgroundColor: "rgba(239,68,68,0.24)",
  },
  balanceStatusText: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  noticeCard: {
    borderRadius: 18,
    backgroundColor: palette.infoSoft,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    color: palette.info,
  },
  tabRow: {
    flexDirection: "row",
    gap: 8,
    borderRadius: 14,
    backgroundColor: palette.surface,
    padding: 6,
  },
  tabButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  tabButtonActive: {
    backgroundColor: palette.primary,
    shadowColor: palette.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  tabButtonPressed: {
    opacity: 0.78,
  },
  tabButtonText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "900",
    color: palette.mutedForeground,
  },
  tabButtonTextActive: {
    color: "#FFFFFF",
  },
  sectionBlock: {
    gap: 10,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  tile: {
    // Robust 2-up grid on every phone width: flexBasis < 50% so exactly two fit per row
    // (the 10px gap can't push the second onto its own line the way width:"48.5%" did on
    // narrow screens), and flexGrow lets the pair fill the row equally.
    flexBasis: "46%",
    flexGrow: 1,
    minWidth: 0,
    minHeight: 96,
    borderRadius: 18,
    backgroundColor: palette.surface,
    padding: 13,
    justifyContent: "center",
    gap: 5,
  },
  tileIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  tileValue: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "900",
    color: palette.foreground,
  },
  tileLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
    color: palette.mutedForeground,
  },
  sectionCard: {
    borderRadius: 20,
    backgroundColor: palette.surface,
    padding: 15,
    gap: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900",
    color: palette.foreground,
  },
  topSellersCard: {
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 15,
    gap: 12,
  },
  topSellersHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  topSellersIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.warningSoft,
  },
  topSellerList: {
    gap: 10,
  },
  topSellerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  topSellerRank: {
    width: 24,
    height: 24,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primarySoft,
  },
  topSellerRankText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
    color: palette.primary,
  },
  topSellerBody: {
    flex: 1,
    minWidth: 0,
  },
  topSellerName: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "800",
    color: palette.foreground,
  },
  topSellerMeta: {
    marginTop: 1,
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  topSellerRevenue: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
    color: palette.foreground,
  },
  topSellersEmpty: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  downloadButton: {
    minHeight: 48,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  downloadButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.99 }],
  },
  downloadButtonDisabled: {
    opacity: 0.6,
  },
  downloadButtonText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
    color: palette.foreground,
  },
  // ── statement modal ──
  statementHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  statementHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  statementTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "900",
    color: palette.foreground,
  },
  statementSubtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  statementClose: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceMuted,
  },
  statementContent: {
    padding: 18,
    gap: 14,
    paddingBottom: 40,
  },
  statementBalanceCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 16,
    gap: 4,
  },
  statementBalanceLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    textTransform: "uppercase",
    color: palette.mutedForeground,
  },
  statementBalanceValue: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "900",
    color: palette.foreground,
  },
  statementBalanceMetaRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 10,
  },
  statementBalanceMetaItem: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: palette.surfaceMuted,
    padding: 10,
    gap: 2,
  },
  statementMetaLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
    color: palette.mutedForeground,
  },
  statementMetaValue: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
    color: palette.foreground,
  },
  statementStatusRow: {
    flexDirection: "row",
    marginTop: 10,
  },
  statementRefRow: {
    marginTop: 12,
    gap: 2,
  },
  statementRefValue: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
    color: palette.foreground,
  },
  statementMethodChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statementMethodChipText: {
    fontSize: 11.5,
    fontWeight: "800",
    color: palette.mutedForeground,
  },
  statementToggle: {
    flexDirection: "row",
    gap: 6,
    borderRadius: 14,
    backgroundColor: palette.surfaceMuted,
    padding: 4,
  },
  statementToggleBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  statementToggleBtnActive: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  statementToggleText: {
    fontSize: 13,
    fontWeight: "800",
    color: palette.mutedForeground,
  },
  statementToggleTextActive: {
    color: palette.foreground,
  },
  statTileRow: {
    flexDirection: "row",
    gap: 12,
  },
  statTile: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 12,
    gap: 3,
  },
  statTileLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
    color: palette.mutedForeground,
  },
  statTileValue: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900",
    color: palette.foreground,
  },
  statTextDanger: { color: palette.danger },
  statTextWarning: { color: palette.warning },
  statTextSuccess: { color: palette.success },
  statementEarningCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#BFE6D1",
    backgroundColor: palette.successSoft,
    padding: 14,
    gap: 3,
  },
  statementEarningLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
    textTransform: "uppercase",
    color: palette.success,
  },
  statementEarningValue: {
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "900",
    color: palette.success,
  },
  statementEmpty: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: palette.mutedForeground,
    paddingVertical: 6,
  },
  txTable: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    overflow: "hidden",
  },
  txHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  txHeadCell: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "800",
    color: palette.mutedForeground,
  },
  txDataRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  txColOrder: {
    flex: 1.5,
    minWidth: 0,
  },
  txColNum: {
    flex: 1,
    textAlign: "right",
  },
  txOrderNum: {
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "800",
    color: palette.foreground,
  },
  txOrderStatus: {
    marginTop: 1,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  txCell: {
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "800",
    color: palette.foreground,
  },
  statementSection: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 15,
    gap: 10,
  },
  statementSectionTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
    color: palette.foreground,
  },
  statementDivider: {
    height: 1,
    backgroundColor: palette.border,
    marginVertical: 2,
  },
  statementLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  statementLineLabel: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  statementLineValue: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
    color: palette.foreground,
  },
  statementLineNegative: {
    color: palette.danger,
  },
  statementLineStrong: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
    color: palette.foreground,
  },
  statementItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  statementItemRank: {
    width: 22,
    fontSize: 13,
    fontWeight: "900",
    color: palette.primary,
  },
  statementItemBody: {
    flex: 1,
    minWidth: 0,
  },
  statementItemName: {
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: "800",
    color: palette.foreground,
  },
  statementItemMeta: {
    marginTop: 1,
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  statementItemValue: {
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: "900",
    color: palette.foreground,
  },
  sectionSubtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  requestCard: {
    borderRadius: 18,
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 12,
    gap: 12,
  },
  requestCopy: {
    gap: 3,
  },
  requestTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
    color: palette.foreground,
  },
  requestText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  requestWarning: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "900",
    color: palette.warning,
  },
  requestInfo: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "900",
    color: palette.info,
  },
  requestButton: {
    minHeight: 48,
    borderRadius: 15,
    backgroundColor: palette.foreground,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  requestButtonDisabled: {
    opacity: 0.55,
  },
  requestButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  requestButtonText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  methodBody: {
    gap: 4,
  },
  methodTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
    color: palette.foreground,
  },
  methodText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  methodWarning: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "800",
    color: palette.warning,
  },
  methodDanger: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "800",
    color: palette.danger,
  },
  methodActionButton: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: palette.foreground,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  methodActionPressed: {
    opacity: 0.78,
  },
  methodActionText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  methodSheetContent: {
    gap: 14,
  },
  inputGroup: {
    gap: 7,
  },
  inputLabel: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "900",
    color: palette.foreground,
  },
  textInput: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 14,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    color: palette.foreground,
  },
  otpCard: {
    borderRadius: 18,
    backgroundColor: palette.primarySoft,
    padding: 14,
    gap: 10,
  },
  otpTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
    color: palette.foreground,
  },
  otpText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  sheetPrimaryButton: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: palette.foreground,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  sheetPrimaryText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  disabledButton: {
    opacity: 0.7,
  },
  historyList: {
    gap: 10,
  },
  historyFooter: {
    minHeight: 58,
    alignItems: "center",
    justifyContent: "center",
  },
  loadMoreButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  loadMoreButton: {
    minHeight: 44,
    borderRadius: 15,
    paddingHorizontal: 15,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadMoreText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: palette.foreground,
  },
  endOfListText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderRadius: 17,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 12,
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  historyRowPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
  historyIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primarySoft,
  },
  historyBody: {
    flex: 1,
    gap: 4,
  },
  historyTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  historyAmount: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
    color: palette.foreground,
  },
  historyMeta: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  sheetContent: {
    gap: 14,
  },
  sheetHero: {
    borderRadius: 22,
    backgroundColor: palette.foreground,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sheetLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "900",
    color: "#F7D9CF",
    textTransform: "uppercase",
  },
  sheetAmount: {
    marginTop: 3,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  detailCard: {
    borderRadius: 20,
    backgroundColor: palette.surfaceMuted,
    padding: 12,
    gap: 9,
  },
  detailLine: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: palette.surface,
    padding: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  detailIcon: {
    width: 34,
    height: 34,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primarySoft,
  },
  detailTextWrap: {
    flex: 1,
    gap: 2,
  },
  detailLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
    color: palette.mutedForeground,
  },
  detailValue: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: palette.foreground,
  },
  noteCard: {
    borderRadius: 18,
    backgroundColor: palette.infoSoft,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  noteBody: {
    flex: 1,
    gap: 3,
  },
  noteTitle: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "900",
    color: palette.foreground,
  },
  noteText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  emptyHistory: {
    minHeight: 150,
    borderRadius: 18,
    backgroundColor: palette.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: 18,
  },
  emptyHistoryTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
    color: palette.foreground,
  },
  emptyHistoryText: {
    textAlign: "center",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
});
