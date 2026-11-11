import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { palette } from "@/src/theme/palette";

type IconName = keyof typeof Ionicons.glyphMap;

const TAB_META: Record<string, { label: string; icon: IconName; iconActive: IconName }> = {
  index: { label: "Home", icon: "home-outline", iconActive: "home" },
  hype: { label: "Hype", icon: "flame-outline", iconActive: "flame" },
  orders: { label: "Orders", icon: "receipt-outline", iconActive: "receipt" },
  profile: { label: "Account", icon: "person-outline", iconActive: "person" },
};
// Retired / hidden routes that must never render a tab button.
const HIDDEN_TABS = new Set(["browse", "favorites"]);
const BLOB = 46;

// Floating, interactive bottom bar: rounded card hovering above the screen edge, an amber
// "blob" that springs between tabs behind the active icon, a little bounce + haptic tick on
// every press, and the cart as a raised amber button in the middle with a live count.
export function ModernTabBar({
  state,
  navigation,
  cartCount,
}: BottomTabBarProps & { cartCount: number }) {
  const insets = useSafeAreaInsets();
  const routes = state.routes.filter((route) => !HIDDEN_TABS.has(route.name));
  const activeKey = state.routes[state.index]?.key;
  const activeIndex = routes.findIndex((route) => route.key === activeKey);
  const activeName = routes[activeIndex]?.name;
  const [barWidth, setBarWidth] = useState(0);
  const slot = barWidth > 0 ? barWidth / Math.max(routes.length, 1) : 0;

  const blobX = useRef(new Animated.Value(0)).current;
  const blobOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!slot || activeIndex < 0) return;
    const showBlob = activeName !== "cart";
    Animated.parallel([
      Animated.spring(blobX, {
        toValue: slot * activeIndex + slot / 2 - BLOB / 2,
        useNativeDriver: true,
        friction: 8,
        tension: 90,
      }),
      Animated.timing(blobOpacity, {
        toValue: showBlob ? 1 : 0,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start();
  }, [activeIndex, activeName, blobOpacity, blobX, slot]);

  return (
    <View style={[styles.outer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View
        style={styles.bar}
        onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
      >
        {slot ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.blob, { opacity: blobOpacity, transform: [{ translateX: blobX }] }]}
          />
        ) : null}
        {routes.map((route) => {
          const focused = route.key === activeKey;
          const onPress = () => {
            void Haptics.selectionAsync().catch(() => undefined);
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };
          const onLongPress = () =>
            navigation.emit({ type: "tabLongPress", target: route.key });

          if (route.name === "cart") {
            return (
              <CartButton
                key={route.key}
                focused={focused}
                count={cartCount}
                onPress={onPress}
                onLongPress={onLongPress}
              />
            );
          }
          const meta = TAB_META[route.name] ?? {
            label: route.name,
            icon: "ellipse-outline" as IconName,
            iconActive: "ellipse" as IconName,
          };
          return (
            <TabButton
              key={route.key}
              label={meta.label}
              icon={focused ? meta.iconActive : meta.icon}
              focused={focused}
              onPress={onPress}
              onLongPress={onLongPress}
            />
          );
        })}
      </View>
    </View>
  );
}

function TabButton({
  label,
  icon,
  focused,
  onPress,
  onLongPress,
}: {
  label: string;
  icon: IconName;
  focused: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!focused) return;
    scale.setValue(0.82);
    Animated.spring(scale, {
      toValue: 1,
      friction: 4,
      tension: 160,
      useNativeDriver: true,
    }).start();
  }, [focused, scale]);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.tab}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      hitSlop={4}
    >
      <Animated.View style={[styles.iconSlot, { transform: [{ scale }] }]}>
        <Ionicons
          name={icon}
          size={22}
          color={focused ? palette.onPrimary : palette.mutedForeground}
        />
      </Animated.View>
      <Text
        style={[styles.label, focused ? styles.labelActive : null]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function CartButton({
  focused,
  count,
  onPress,
  onLongPress,
}: {
  focused: boolean;
  count: number;
  onPress: () => void;
  onLongPress: () => void;
}) {
  // Pop the badge whenever the count goes up.
  const pop = useRef(new Animated.Value(1)).current;
  const lastCount = useRef(count);
  useEffect(() => {
    if (count > lastCount.current) {
      pop.setValue(1.35);
      Animated.spring(pop, {
        toValue: 1,
        friction: 4,
        tension: 160,
        useNativeDriver: true,
      }).start();
    }
    lastCount.current = count;
  }, [count, pop]);

  return (
    <View style={styles.tab} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        hitSlop={6}
        accessibilityRole="tab"
        accessibilityLabel={count > 0 ? `Cart, ${count} ${count === 1 ? "item" : "items"}` : "Cart"}
        accessibilityState={{ selected: focused }}
        style={({ pressed }) => [
          styles.cartFab,
          focused ? styles.cartFabFocused : null,
          pressed ? styles.cartFabPressed : null,
        ]}
      >
        <Ionicons name={focused ? "bag" : "bag-outline"} size={24} color={palette.onPrimary} />
        {count > 0 ? (
          <Animated.View style={[styles.badge, { transform: [{ scale: pop }] }]}>
            <Text style={styles.badgeText}>{count > 99 ? "99+" : count}</Text>
          </Animated.View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    paddingHorizontal: 12,
    paddingTop: 6,
    backgroundColor: "transparent",
  },
  bar: {
    height: 66,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 24,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E6E6E6",
    shadowColor: "#000000",
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  blob: {
    position: "absolute",
    top: 7,
    left: 0,
    width: BLOB,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.primary,
  },
  tab: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  iconSlot: {
    height: 32,
    width: BLOB,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500",
    color: palette.mutedForeground,
  },
  labelActive: {
    fontWeight: "700",
    color: palette.foreground,
  },
  cartFab: {
    marginTop: -30,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
    borderWidth: 4,
    borderColor: palette.surface,
    shadowColor: "#A86300",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  cartFabFocused: {
    borderColor: "#FFF1DC",
  },
  cartFabPressed: {
    transform: [{ scale: 0.92 }],
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.foreground,
    borderWidth: 2,
    borderColor: palette.surface,
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "700",
    color: palette.surface,
  },
});
