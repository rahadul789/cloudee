import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDeliveryCopy } from "@/src/lib/copy";
import { useRiderAuthStore } from "@/src/store/auth-store";
import { palette } from "@/src/theme/palette";

function TabIcon({
  color,
  focused,
  activeName,
  inactiveName,
  accentColor,
}: {
  color: string;
  focused: boolean;
  activeName: keyof typeof Ionicons.glyphMap;
  inactiveName: keyof typeof Ionicons.glyphMap;
  accentColor: string;
}) {
  return (
    <View style={[styles.tabIconShell, focused ? { backgroundColor: accentColor } : styles.tabIconShellIdle]}>
      <Ionicons
        name={focused ? activeName : inactiveName}
        color={color}
        size={22}
      />
    </View>
  );
}

export default function AppLayout() {
  const { copy } = useDeliveryCopy();
  const insets = useSafeAreaInsets();
  const isHydrated = useRiderAuthStore((state) => state.isHydrated);
  const rider = useRiderAuthStore((state) => state.rider);
  const accessToken = useRiderAuthStore((state) => state.accessToken);

  if (!isHydrated) {
    return null;
  }

  if (!rider || !accessToken) {
    return <Redirect href="/sign-in" />;
  }

  const tabBarBottomPadding = Math.max(insets.bottom, 12);

  return (
    <View style={styles.shell}>
      <Tabs
      screenOptions={{
        headerShown: false,
        animation: "fade",
        sceneStyle: {
          backgroundColor: palette.background,
        },
        tabBarActiveTintColor: palette.secondary,
        tabBarInactiveTintColor: palette.mutedForeground,
        // Bottom tabs are replaced by the slide-out RiderSidebar (opened from the header
        // menu button), so the tab bar itself is hidden — the screens remain routes.
        tabBarStyle: { display: "none" },
      }}
      >
      {/* 3 tabs: Home (map + offers/tasks sheet), My Rides (rides + history), Account.
          "available" and "active" are folded into the Home sheet — kept as routes but
          hidden from the tab bar via href: null. */}
      <Tabs.Screen
        name="map"
        options={{
          title: copy.tabs.home,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon color={color} focused={focused} activeName="home" inactiveName="home-outline" accentColor="#DDE8FF" />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: copy.tabs.myRides,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon color={color} focused={focused} activeName="stats-chart" inactiveName="stats-chart-outline" accentColor="#E2FFF0" />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: copy.tabs.account,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon color={color} focused={focused} activeName="person-circle" inactiveName="person-circle-outline" accentColor="#FFF1C8" />
          ),
        }}
      />
      <Tabs.Screen name="available" options={{ href: null }} />
      <Tabs.Screen name="active" options={{ href: null }} />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: palette.background,
  },
  tabIconShell: {
    width: 44,
    height: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  tabIconShellIdle: {
    backgroundColor: "transparent",
  },
});
