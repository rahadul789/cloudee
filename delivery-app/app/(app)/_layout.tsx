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
        tabBarShowLabel: true,
        tabBarLabelPosition: "below-icon",
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          height: 72 + tabBarBottomPadding,
          paddingTop: 10,
          paddingBottom: tabBarBottomPadding,
          paddingHorizontal: 10,
          backgroundColor: "rgba(255,248,243,0.98)",
          borderTopWidth: 1,
          borderColor: "rgba(255,122,89,0.08)",
          borderTopLeftRadius: 30,
          borderTopRightRadius: 30,
          shadowColor: palette.shadow,
          shadowOpacity: 1,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 14 },
          elevation: 7,
        },
        tabBarItemStyle: {
          borderRadius: 24,
          marginHorizontal: 2,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          lineHeight: 15,
          fontWeight: "700",
          marginTop: 3,
          marginBottom: 2,
        },
      }}
      >
      <Tabs.Screen
        name="available"
        options={{
          title: copy.tabs.available,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon color={color} focused={focused} activeName="storefront" inactiveName="storefront-outline" accentColor="#FFE3D5" />
          ),
        }}
      />
      <Tabs.Screen
        name="active"
        options={{
          title: copy.tabs.active,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon color={color} focused={focused} activeName="flash" inactiveName="flash-outline" accentColor="#FFD7E8" />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: copy.tabs.map,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon color={color} focused={focused} activeName="map" inactiveName="map-outline" accentColor="#DDE8FF" />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: copy.tabs.history,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon color={color} focused={focused} activeName="time" inactiveName="time-outline" accentColor="#E2FFF0" />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: copy.tabs.profile,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon color={color} focused={focused} activeName="person-circle" inactiveName="person-circle-outline" accentColor="#FFF1C8" />
          ),
        }}
      />
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
