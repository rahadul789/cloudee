import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useOwnerTranslation } from "@/src/i18n/translations";
import { useOwnerAuthStore } from "@/src/store/auth-store";
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
      <Ionicons name={focused ? activeName : inactiveName} size={22} color={color} />
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { t } = useOwnerTranslation();
  const isHydrated = useOwnerAuthStore((state) => state.isHydrated);
  const accessToken = useOwnerAuthStore((state) => state.accessToken);

  if (!isHydrated) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="small" color={palette.primary} />
      </View>
    );
  }

  if (!accessToken) {
    return <Redirect href={"/sign-in" as never} />;
  }

  const tabBarBottomPadding = Math.max(insets.bottom, 12);

  return (
    <View style={styles.shell}>
      <Tabs
      screenOptions={{
        headerShown: false,
        animation: "fade",
        transitionSpec: {
          animation: "timing",
          config: { duration: 90 },
        },
        freezeOnBlur: true,
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
        name="today"
        options={{
          title: t("tabs.today"),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon color={color} focused={focused} activeName="speedometer" inactiveName="speedometer-outline" accentColor="#FFE3D5" />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: t("tabs.orders"),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon color={color} focused={focused} activeName="receipt" inactiveName="receipt-outline" accentColor="#E2FFF0" />
          ),
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: t("tabs.menu"),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon color={color} focused={focused} activeName="fast-food" inactiveName="fast-food-outline" accentColor="#FFF1C8" />
          ),
        }}
      />
      <Tabs.Screen
        name="payouts"
        options={{
          title: t("tabs.payouts"),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon color={color} focused={focused} activeName="wallet" inactiveName="wallet-outline" accentColor="#FFD7E8" />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t("tabs.account"),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon color={color} focused={focused} activeName="person-circle" inactiveName="person-circle-outline" accentColor="#DDE8FF" />
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
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
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
