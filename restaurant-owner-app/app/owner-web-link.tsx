import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Screen } from "@/src/components/screen";
import { useOwnerPlatformContentQuery, useOwnerStoreSettingsQuery } from "@/src/hooks/use-owner-api";
import { palette } from "@/src/theme/palette";

export default function OwnerWebLinkScreen() {
  const router = useRouter();
  const platformContentQuery = useOwnerPlatformContentQuery();
  const storeQuery = useOwnerStoreSettingsQuery();
  const webDashboardUrl =
    platformContentQuery.data?.operations?.ownerApp?.webDashboardUrl?.trim() || "";
  const restaurantName = storeQuery.data?.name || "your restaurant";
  const shareMessage = `Open ${restaurantName} owner dashboard: ${webDashboardUrl}`;

  async function openDashboard() {
    if (!webDashboardUrl) {
      Alert.alert("Link not configured", "Ask admin to add the owner dashboard URL.");
      return;
    }

    const canOpen = await Linking.canOpenURL(webDashboardUrl);
    if (!canOpen) {
      Alert.alert("Cannot open link", webDashboardUrl);
      return;
    }

    await Linking.openURL(webDashboardUrl);
  }

  async function shareDashboard() {
    if (!webDashboardUrl) {
      Alert.alert("Link not configured", "Ask admin to add the owner dashboard URL.");
      return;
    }

    await Share.share({
      message: shareMessage,
      url: webDashboardUrl,
      title: "Owner dashboard link",
    });
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" hitSlop={10} style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={21} color={palette.foreground} />
          </Pressable>
          <Text style={styles.title}>Owner web dashboard</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Ionicons name="desktop-outline" size={28} color="#FFFFFF" />
          </View>
          <Text style={styles.heroTitle}>Manage from a bigger screen</Text>
          <Text style={styles.heroText}>
            Share this link with your trusted device to manage menu, reports, settings,
            orders, and promotions from the owner web dashboard.
          </Text>
        </View>

        <View style={styles.linkCard}>
          <View style={styles.linkTop}>
            <View>
              <Text style={styles.linkLabel}>Dashboard URL</Text>
              <Text style={styles.linkHint}>Long press the link to copy it.</Text>
            </View>
            {platformContentQuery.isLoading ? (
              <ActivityIndicator size="small" color={palette.primary} />
            ) : (
              <Ionicons name="link-outline" size={20} color={palette.primary} />
            )}
          </View>

          <Text selectable style={styles.urlText}>
            {webDashboardUrl || "Owner web dashboard URL is not configured yet."}
          </Text>
        </View>

        <View style={styles.actionGrid}>
          <ActionButton
            icon="open-outline"
            title="Open"
            caption="Launch in browser"
            onPress={openDashboard}
            disabled={!webDashboardUrl}
          />
          <ActionButton
            icon="share-social-outline"
            title="Share"
            caption="Copy or send"
            onPress={shareDashboard}
            disabled={!webDashboardUrl}
          />
        </View>

        <View style={styles.noteCard}>
          <Ionicons name="shield-checkmark-outline" size={18} color={palette.info} />
          <Text style={styles.noteText}>
            The dashboard still requires owner sign-in. Sharing this URL does not give
            anyone access without the owner account.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

function ActionButton({
  icon,
  title,
  caption,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  caption: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={[styles.actionButton, disabled ? styles.disabled : null]}
      onPress={onPress}
    >
      <View style={styles.actionIconWrap}>
        <Ionicons name={icon} size={19} color={palette.foreground} />
      </View>
      <Text style={styles.actionTitle}>{title}</Text>
      <Text style={styles.actionCaption}>{caption}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 18,
    paddingBottom: 44,
    gap: 16,
  },
  header: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "900",
    color: palette.foreground,
  },
  headerSpacer: {
    width: 40,
  },
  heroCard: {
    borderRadius: 26,
    backgroundColor: palette.foreground,
    padding: 20,
    gap: 10,
  },
  heroIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  heroText: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "700",
    color: "#F7D9CF",
  },
  linkCard: {
    borderRadius: 22,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 15,
    gap: 13,
  },
  linkTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  linkLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: palette.foreground,
  },
  linkHint: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  urlText: {
    borderRadius: 16,
    backgroundColor: palette.surfaceMuted,
    padding: 13,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "800",
    color: palette.foreground,
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  actionButton: {
    flex: 1,
    minHeight: 120,
    borderRadius: 22,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 13,
    justifyContent: "center",
    gap: 6,
  },
  actionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: palette.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
    color: palette.foreground,
  },
  actionCaption: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  noteCard: {
    borderRadius: 18,
    backgroundColor: palette.infoSoft,
    padding: 13,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    color: palette.info,
  },
  disabled: {
    opacity: 0.55,
  },
});
