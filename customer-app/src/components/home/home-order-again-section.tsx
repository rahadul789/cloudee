import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

import { ReorderCartSwitchModal } from "@/src/components/orders/reorder-cart-switch-modal";
import { PressableScale } from "@/src/components/pressable-scale";
import { RemoteImage } from "@/src/components/remote-image";
import { SectionHeading } from "@/src/components/ui";
import {
  useCustomerHistoryOrdersPreviewQuery,
  useCustomerReorderMutation,
} from "@/src/hooks/use-customer-api";
import { formatCurrency } from "@/src/lib/currency";
import { closedReorderBanner, failedReorderBanner } from "@/src/lib/reorder-messages";
import { buildOrderAgainEntries, type OrderAgainEntry } from "@/src/lib/order-again";
import { useAppBannerStore } from "@/src/store/app-banner-store";
import { useCustomerAuthStore } from "@/src/store/auth-store";
import { palette } from "@/src/theme/palette";
import type { CustomerHomeOrderAgainSection } from "@/src/types/restaurant";

/**
 * Home "Order again" rail: the customer's last delivered order per restaurant with a
 * one-tap Reorder (same flow as the Orders tab: rebuilds the cart from the order, skips
 * items that are gone, asks before replacing a cart from another restaurant).
 * Renders nothing for guests or customers without delivered orders.
 */
export function HomeOrderAgainSection({
  enabled = true,
  config,
}: {
  enabled?: boolean;
  /** Admin settings (homeCms.orderAgainSection); absent → defaults. */
  config?: Partial<CustomerHomeOrderAgainSection> | null;
}) {
  const sectionOn = config?.enabled !== false;
  const maxItems = Math.min(10, Math.max(3, config?.maxItems ?? 6));
  const router = useRouter();
  const signedIn = useCustomerAuthStore((state) => Boolean(state.accessToken));
  // Fetch a bit more than shown: several recent orders can be from the same restaurant.
  const historyQuery = useCustomerHistoryOrdersPreviewQuery(enabled && signedIn && sectionOn, 20);
  const reorderMutation = useCustomerReorderMutation();
  const showBanner = useAppBannerStore((state) => state.showBanner);
  const [busyOrderId, setBusyOrderId] = useState("");
  const [conflict, setConflict] = useState<{
    entry: OrderAgainEntry;
    currentRestaurantName: string;
    incomingRestaurantName: string;
    previewItemName: string;
  } | null>(null);

  const entries = useMemo(
    () => buildOrderAgainEntries(historyQuery.data ?? [], maxItems, config?.maxAgeDays ?? 60),
    [config?.maxAgeDays, historyQuery.data, maxItems],
  );

  const reorder = async (entry: OrderAgainEntry, forceReplace = false) => {
    if (busyOrderId) return;
    void Haptics.selectionAsync().catch(() => undefined);
    setBusyOrderId(entry.order._id);
    try {
      const result = await reorderMutation.mutateAsync({
        order: {
          _id: entry.order._id,
          orderNumber: entry.order.orderNumber ?? "",
          restaurantId: entry.restaurantId,
          itemsSnapshot: entry.order.itemsSnapshot,
        },
        forceReplace,
      });
      if (result.status === "conflict") {
        setConflict({
          entry,
          currentRestaurantName: result.currentRestaurantName,
          incomingRestaurantName: result.incomingRestaurantName,
          previewItemName: result.previewItemName,
        });
        return;
      }
      if (result.status === "closed") {
        showBanner(closedReorderBanner(result));
        return;
      }
      if (result.status === "empty") {
        showBanner({
          title: "Couldn't reorder",
          description: "Those items aren't available right now.",
          tone: "warning",
        });
        return;
      }
      showBanner({
        title: result.skippedCount > 0 ? "Added what's still available" : "Added to your cart",
        description:
          result.skippedCount > 0
            ? `${result.addedItemCount} added · ${result.skippedCount} no longer available.`
            : `${entry.restaurantName} · ${result.addedItemCount} item${result.addedItemCount === 1 ? "" : "s"}`,
        tone: result.skippedCount > 0 ? "warning" : "success",
      });
      router.push({ pathname: "/(tabs)/cart", params: { view: "active" } });
    } catch {
      showBanner(failedReorderBanner);
    } finally {
      setBusyOrderId("");
    }
  };

  if (!sectionOn || !signedIn || entries.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionHeading
        title={config?.title?.trim() || "Order again"}
        subtitle={config?.subtitle?.trim() || "Your favourites, one tap away"}
        icon="refresh-circle-outline"
        style={styles.heading}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {entries.map((entry) => {
          const busy = busyOrderId === entry.order._id;
          return (
            <PressableScale
              key={entry.order._id}
              scaleTo={0.97}
              style={styles.card}
              onPress={() =>
                router.push({
                  pathname: "/restaurants/[restaurantId]",
                  params: { restaurantId: entry.restaurantId, source: "order_again" },
                })
              }
              accessibilityLabel={`${entry.restaurantName}, ${entry.itemsLabel}`}
            >
              <RemoteImage
                uri={entry.imageUrl}
                style={styles.photo}
                fallbackIcon="restaurant-outline"
                fallbackIconSize={20}
                fallbackTint={palette.secondary}
                targetWidth={140}
                accessibilityLabel={`${entry.restaurantName} photo`}
              />
              <View style={styles.copy}>
                <Text style={styles.name} numberOfLines={1}>
                  {entry.restaurantName}
                </Text>
                <Text style={styles.items} numberOfLines={1}>
                  {entry.itemsLabel}
                </Text>
                <View style={styles.footer}>
                  <Text style={styles.total}>{formatCurrency(entry.total)}</Text>
                  <PressableScale
                    scaleTo={0.94}
                    style={styles.reorderButton}
                    onPress={(event) => {
                      event.stopPropagation();
                      void reorder(entry);
                    }}
                    disabled={Boolean(busyOrderId)}
                    accessibilityRole="button"
                    accessibilityLabel={`Reorder from ${entry.restaurantName}`}
                    hitSlop={6}
                  >
                    {busy ? (
                      <ActivityIndicator size="small" color={palette.onPrimary} />
                    ) : (
                      <>
                        <Ionicons name="refresh" size={13} color={palette.onPrimary} />
                        <Text style={styles.reorderText}>Reorder</Text>
                      </>
                    )}
                  </PressableScale>
                </View>
              </View>
            </PressableScale>
          );
        })}
      </ScrollView>

      <ReorderCartSwitchModal
        visible={Boolean(conflict)}
        previewItemName={conflict?.previewItemName ?? "Delivered items"}
        currentRestaurantName={conflict?.currentRestaurantName ?? "your current cart"}
        incomingRestaurantName={conflict?.incomingRestaurantName ?? "this restaurant"}
        onClose={() => setConflict(null)}
        onConfirm={() => {
          const entry = conflict?.entry;
          setConflict(null);
          if (entry) void reorder(entry, true);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Same rhythm as the other home sections (home-screen.styles `section`).
  section: { paddingTop: 24, gap: 14 },
  heading: { paddingHorizontal: 16 },
  row: { paddingHorizontal: 16, gap: 12 },
  card: {
    width: 260,
    flexDirection: "row",
    gap: 10,
    padding: 10,
    borderRadius: 18,
    backgroundColor: palette.surface,
  },
  photo: { width: 64, height: 64, borderRadius: 14 },
  copy: { flex: 1, minWidth: 0, gap: 1 },
  name: { fontSize: 14.5, lineHeight: 19, fontWeight: "700", color: palette.foreground },
  items: { fontSize: 12.5, lineHeight: 17, color: palette.mutedForeground },
  footer: {
    marginTop: "auto",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  total: { fontSize: 13, lineHeight: 17, fontWeight: "700", color: palette.foreground },
  reorderButton: {
    minWidth: 82,
    height: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: palette.primary,
  },
  reorderText: { fontSize: 12, lineHeight: 15, fontWeight: "700", color: palette.onPrimary },
});
