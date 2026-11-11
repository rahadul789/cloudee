import { Tabs } from "expo-router";

import { ModernTabBar } from "@/src/components/navigation/modern-tab-bar";
import { getAllCartsItemCount, useCartStore } from "@/src/store/cart-store";
import { palette } from "@/src/theme/palette";

export default function TabsLayout() {
  const cartItemCount = useCartStore((state) => getAllCartsItemCount(state));

  return (
    <Tabs
      tabBar={(props) => <ModernTabBar {...props} cartCount={cartItemCount} />}
      screenOptions={{
        headerShown: false,
        // No tab is frozen on blur. Two reasons:
        //  1) Freezing a FlashList and unfreezing it on return scrambles its
        //     recycling pool → janky scrolls after a tab switch.
        //  2) A frozen screen can't run effects, so its images could never
        //     release their memory. RemoteImage frees a blurred screen's decoded
        //     bitmaps after a short delay (see remote-image.tsx) — that only
        //     works while the screen stays live, and it's what keeps RAM bounded
        //     to the visible tab.
        // Instant tab switching (the bottom-tab standard). The previous "fade"
        // animation could race react-native-screens' scene attach in release
        // builds and leave the target tab blank until you re-navigated.
        animation: "none",
        freezeOnBlur: false,
        sceneStyle: {
          backgroundColor: palette.background,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="hype" options={{ title: "Hype" }} />
      <Tabs.Screen name="cart" options={{ title: "Cart" }} />
      <Tabs.Screen name="orders" options={{ title: "Orders" }} />
      <Tabs.Screen name="profile" options={{ title: "Account" }} />
      {/* Retired tab: route kept only so old links redirect to search; no button. */}
      <Tabs.Screen name="browse" options={{ href: null }} />
      {/* Favourites now lives at /favorite-restaurants (Account); this keeps old links working. */}
      <Tabs.Screen name="favorites" options={{ href: null }} />
    </Tabs>
  );
}
