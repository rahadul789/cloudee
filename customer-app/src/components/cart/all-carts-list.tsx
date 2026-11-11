import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { PressableScale } from "@/src/components/pressable-scale";
import { appAlert } from "@/src/lib/app-alert";
import { RemoteImage } from "@/src/components/remote-image";
import { AppHeader } from "@/src/components/ui";
import { formatCurrency } from "@/src/lib/currency";
import {
  getCartItemCount,
  getCartSubtotal,
  type RestaurantCart,
} from "@/src/lib/multi-cart";
import { palette } from "@/src/theme/palette";

const MAX_LINES = 3;

// Multi-cart overview ("Your carts") in a receipt style: each restaurant is a ticket with an
// amber edge, its item lines (qty × name … price), a perforated rule, then the subtotal with
// "Add" (back to the restaurant) and "Review" (open this cart for checkout).
export function AllCartsList({
  carts,
  deliverTo,
  bottomInset,
  onOpen,
  onRemove,
  onAddMore,
}: {
  carts: RestaurantCart[];
  deliverTo: string;
  bottomInset: number;
  onOpen: (restaurantId: string) => void;
  onRemove: (restaurantId: string) => void;
  onAddMore: (restaurantId: string) => void;
}) {
  const grandTotal = carts.reduce((sum, cart) => sum + getCartSubtotal(cart.items), 0);

  const confirmRemove = (cart: RestaurantCart) =>
    appAlert(
      "Remove this cart?",
      `All items from ${cart.restaurant.restaurantName} will be removed.`,
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => onRemove(cart.restaurant.restaurantId),
        },
      ],
      { icon: "trash-outline", tone: "danger" },
    );

  return (
    <View style={styles.root}>
      <AppHeader showBack={false} title="Your carts" subtitle={`Deliver to · ${deliverTo}`} />
      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: bottomInset + 96 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.overview}>
          <View style={styles.overviewIcon}>
            <Ionicons name="layers-outline" size={18} color={palette.onPrimary} />
          </View>
          <View style={styles.overviewCopy}>
            <Text style={styles.overviewTitle}>
              {carts.length} restaurant carts
            </Text>
            <Text style={styles.overviewSub}>Each one is ordered separately</Text>
          </View>
          <Text style={styles.overviewTotal}>{formatCurrency(grandTotal)}</Text>
        </View>

        {carts.map((cart) => {
          const id = cart.restaurant.restaurantId;
          const count = getCartItemCount(cart.items);
          const lines = cart.items.slice(0, MAX_LINES);
          const more = cart.items.length - lines.length;
          return (
            <View key={id} style={styles.ticket}>
              <View style={styles.edge} />
              <View style={styles.ticketBody}>
                <View style={styles.head}>
                  <RemoteImage
                    uri={cart.restaurant.logoUrl}
                    style={styles.logo}
                    fallbackIcon="restaurant-outline"
                    fallbackIconSize={18}
                    targetWidth={88}
                    accessibilityLabel={`${cart.restaurant.restaurantName} logo`}
                  />
                  <View style={styles.headCopy}>
                    <Text style={styles.name} numberOfLines={1}>
                      {cart.restaurant.restaurantName}
                    </Text>
                    <Text style={styles.meta}>
                      {count} item{count === 1 ? "" : "s"}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => confirmRemove(cart)}
                    hitSlop={8}
                    style={({ pressed }) => [styles.trash, pressed ? styles.pressed : null]}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${cart.restaurant.restaurantName} cart`}
                  >
                    <Ionicons name="trash-outline" size={17} color="#D93838" />
                  </Pressable>
                </View>

                <View style={styles.lines}>
                  {lines.map((item) => (
                    <View key={item.key} style={styles.line}>
                      <Text style={styles.qty}>{item.quantity}×</Text>
                      <Text style={styles.lineName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.linePrice}>
                        {formatCurrency(item.quantity * item.unitPrice)}
                      </Text>
                    </View>
                  ))}
                  {more > 0 ? (
                    <Text style={styles.more}>
                      +{more} more item{more === 1 ? "" : "s"}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.rule} />

                <View style={styles.footer}>
                  <View style={styles.totalCopy}>
                    <Text style={styles.totalLabel}>Subtotal</Text>
                    <Text style={styles.total}>{formatCurrency(getCartSubtotal(cart.items))}</Text>
                  </View>
                  <Pressable
                    onPress={() => onAddMore(id)}
                    style={({ pressed }) => [styles.add, pressed ? styles.pressed : null]}
                    accessibilityRole="button"
                    accessibilityLabel={`Add more from ${cart.restaurant.restaurantName}`}
                  >
                    <Ionicons name="add" size={16} color={palette.foreground} />
                    <Text style={styles.addText}>Add</Text>
                  </Pressable>
                  <PressableScale
                    scaleTo={0.97}
                    style={styles.review}
                    onPress={() => onOpen(id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Review ${cart.restaurant.restaurantName} cart`}
                  >
                    <Text style={styles.reviewText}>Review</Text>
                    <Ionicons name="arrow-forward" size={16} color={palette.onPrimary} />
                  </PressableScale>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  list: { padding: 16, gap: 12 },
  overview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "#FFF4E0",
  },
  overviewIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
  },
  overviewCopy: { flex: 1, minWidth: 0, gap: 1 },
  overviewTitle: { fontSize: 15, lineHeight: 20, fontWeight: "700", color: palette.foreground },
  overviewSub: { fontSize: 12.5, lineHeight: 17, color: palette.mutedForeground },
  overviewTotal: { fontSize: 17, lineHeight: 22, fontWeight: "700", color: palette.foreground },
  ticket: {
    flexDirection: "row",
    overflow: "hidden",
    borderRadius: 18,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E6E6E6",
  },
  edge: { width: 5, backgroundColor: palette.primary },
  ticketBody: { flex: 1, padding: 14, gap: 12 },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 44, height: 44, borderRadius: 12, backgroundColor: palette.surfaceMuted },
  headCopy: { flex: 1, minWidth: 0, gap: 1 },
  name: { fontSize: 15.5, lineHeight: 20, fontWeight: "700", color: palette.foreground },
  meta: { fontSize: 12.5, lineHeight: 17, color: palette.mutedForeground },
  trash: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FDF0F0",
  },
  lines: { gap: 7 },
  line: { flexDirection: "row", alignItems: "center", gap: 8 },
  qty: {
    minWidth: 30,
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: palette.secondary,
    backgroundColor: "#FFF4E0",
    textAlign: "center",
  },
  lineName: { flex: 1, fontSize: 13.5, lineHeight: 18, color: palette.foreground },
  linePrice: { fontSize: 13.5, lineHeight: 18, fontWeight: "500", color: palette.foreground },
  more: { fontSize: 12.5, lineHeight: 17, fontWeight: "500", color: palette.mutedForeground },
  rule: { borderTopWidth: 1.5, borderStyle: "dashed", borderColor: "#E9E2D6" },
  footer: { flexDirection: "row", alignItems: "center", gap: 8 },
  totalCopy: { flex: 1, gap: 0 },
  totalLabel: { fontSize: 11.5, lineHeight: 15, color: palette.mutedForeground },
  total: { fontSize: 17, lineHeight: 22, fontWeight: "700", color: palette.foreground },
  add: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderWidth: 1,
    borderColor: "#E3E4E6",
    backgroundColor: palette.surface,
  },
  addText: { fontSize: 13.5, lineHeight: 18, fontWeight: "700", color: palette.foreground },
  review: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: palette.primary,
  },
  reviewText: { fontSize: 14, lineHeight: 18, fontWeight: "700", color: palette.onPrimary },
  pressed: { opacity: 0.75 },
});
