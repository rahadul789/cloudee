import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getCartItemCount, useCartStore } from "@/src/store/cart-store";
import { palette } from "@/src/theme/palette";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const cartItemCount = useCartStore((state) => getCartItemCount(state.items));
  const tabBarBottomPadding = Math.max(insets.bottom, 12);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // No tab is frozen on blur. Two reasons:
        //  1) Freezing a FlashList and unfreezing it on return scrambles its
        //     recycling pool → janky scrolls after a tab switch.
        //  2) A frozen screen can't run effects, so its images could never
        //     release their memory. RemoteImage frees a blurred screen's decoded
        //     bitmaps after a short delay (see remote-image.tsx) — that only
        //     works while the screen stays live, and it's what keeps RAM bounded
        //     to the visible tab (the real cause of the Home→Browse jank).
        // Background cost is already minimal: the skeleton shimmer that used to
        // run in blurred tabs was removed (see loading-skeleton.tsx).
        animation: "fade",
        transitionSpec: {
          animation: "timing",
          config: { duration: 90 },
        },
        freezeOnBlur: false,
        sceneStyle: {
          backgroundColor: palette.background,
        },
        tabBarActiveTintColor: palette.secondary,
        tabBarInactiveTintColor: palette.mutedForeground,
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: 11,
          lineHeight: 15,
          fontWeight: "700",
          marginTop: 3,
          marginBottom: 2,
        },
        tabBarStyle: {
          height: 72 + tabBarBottomPadding,
          paddingTop: 10,
          paddingBottom: tabBarBottomPadding,
          paddingHorizontal: 10,
          borderTopWidth: 1,
          borderColor: "rgba(255,122,89,0.08)",
          backgroundColor: "rgba(255,248,243,0.98)",
          borderTopLeftRadius: 30,
          borderTopRightRadius: 30,
          shadowColor: palette.shadow,
          shadowOffset: { width: 0, height: 14 },
          shadowOpacity: 1,
          shadowRadius: 24,
          elevation: 7,
        },
        tabBarItemStyle: {
          borderRadius: 24,
          marginHorizontal: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              color={color}
              focused={focused}
              name={focused ? "home" : "home-outline"}
              accentColor="#FFE3D5"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: "Browse",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              color={color}
              focused={focused}
              name={focused ? "compass" : "compass-outline"}
              accentColor="#DDE8FF"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: "Cart",
          tabBarBadge: cartItemCount > 0 ? cartItemCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: palette.secondary,
            color: palette.surface,
            fontSize: 11,
            lineHeight: 15,
            fontWeight: "700",
          },
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              color={color}
              focused={focused}
              name={focused ? "bag" : "bag-outline"}
              accentColor="#FFD7E8"
              emphasized
            />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: "Orders",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              color={color}
              focused={focused}
              name={focused ? "receipt" : "receipt-outline"}
              accentColor="#E2FFF0"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              color={color}
              focused={focused}
              name={focused ? "person" : "person-outline"}
              accentColor="#FFF1C8"
            />
          ),
        }}
      />
    </Tabs>
  );
}

type TabIconProps = {
  color: string;
  focused: boolean;
  name: keyof typeof Ionicons.glyphMap;
  accentColor: string;
  emphasized?: boolean;
};

function TabIcon({
  color,
  focused,
  name,
  accentColor,
  emphasized = false,
}: TabIconProps) {
  return (
    <View
      style={[
        styles.iconWrap,
        focused ? { backgroundColor: accentColor } : styles.iconWrapIdle,
        emphasized && focused ? styles.iconWrapEmphasized : null,
      ]}
    >
      <Ionicons name={name} size={22} color={color} />
      {emphasized ? (
        <View style={[styles.cartSpark, focused ? styles.cartSparkActive : null]}>
          <Text style={styles.cartSparkText}>+</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 44,
    height: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapIdle: {
    backgroundColor: "transparent",
  },
  iconWrapEmphasized: {
    shadowColor: "rgba(255, 99, 146, 0.28)",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 14,
    elevation: 4,
  },
  cartSpark: {
    position: "absolute",
    top: -3,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceMuted,
  },
  cartSparkActive: {
    backgroundColor: palette.surface,
  },
  cartSparkText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    color: palette.foreground,
  },
});
