import { StyleSheet, Text, View } from "react-native";

import { useOwnerStoreSettingsQuery } from "@/src/hooks/use-owner-api";
import { useOwnerTranslation } from "@/src/i18n/translations";
import { palette } from "@/src/theme/palette";

export function OwnerStatusBadge({ isOnline }: { isOnline?: boolean }) {
  const storeQuery = useOwnerStoreSettingsQuery(isOnline === undefined);
  const { t } = useOwnerTranslation();
  const resolvedOnline = isOnline ?? storeQuery.data?.runtime?.isOnline;
  const hasStatus = typeof resolvedOnline === "boolean";

  return (
    <View
      style={[
        styles.badge,
        !hasStatus
          ? styles.badgeNeutral
          : resolvedOnline
            ? styles.badgeOnline
            : styles.badgeOffline,
      ]}
    >
      <View
        style={[
          styles.dot,
          !hasStatus
            ? styles.dotNeutral
            : resolvedOnline
              ? styles.dotOnline
              : styles.dotOffline,
        ]}
      />
      <Text
        style={[
          styles.text,
          !hasStatus
            ? styles.textNeutral
            : resolvedOnline
              ? styles.textOnline
              : styles.textOffline,
        ]}
      >
        {!hasStatus
          ? t("status.unknown")
          : resolvedOnline
            ? t("status.online")
            : t("status.offline")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  badgeOnline: {
    backgroundColor: palette.successSoft,
  },
  badgeOffline: {
    backgroundColor: palette.dangerSoft,
  },
  badgeNeutral: {
    backgroundColor: palette.surfaceMuted,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  dotOnline: {
    backgroundColor: palette.success,
  },
  dotOffline: {
    backgroundColor: palette.danger,
  },
  dotNeutral: {
    backgroundColor: palette.mutedForeground,
  },
  text: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
  },
  textOnline: {
    color: palette.success,
  },
  textOffline: {
    color: palette.danger,
  },
  textNeutral: {
    color: palette.mutedForeground,
  },
});
