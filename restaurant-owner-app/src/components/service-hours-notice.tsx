import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import {
  useOwnerStoreSettingsQuery,
  type OwnerStoreSettings,
} from "@/src/hooks/use-owner-api";
import { useOwnerTranslation } from "@/src/i18n/translations";
import { palette } from "@/src/theme/palette";

type OwnerServiceHours = NonNullable<OwnerStoreSettings["serviceHours"]>;

/**
 * Reads the platform/zone service window from `/owner/store-settings` — the same
 * uncached source of truth the enforcement notice uses. Returns null when the
 * window is not enforced, so callers can render nothing.
 */
export function useOwnerServiceHours(enabled = true): OwnerServiceHours | null {
  const storeQuery = useOwnerStoreSettingsQuery(enabled);
  const serviceHours = storeQuery.data?.serviceHours;

  if (!serviceHours || !serviceHours.enabled) {
    return null;
  }

  return serviceHours;
}

/**
 * Explains why customers may see the restaurant as closed even while it is toggled
 * online — the platform/zone only serves orders inside a fixed daily window. Purely
 * informational; it never blocks the owner from going online.
 */
export function ServiceHoursNotice({ enabled = true }: { enabled?: boolean }) {
  const { t } = useOwnerTranslation();
  const serviceHours = useOwnerServiceHours(enabled);

  if (!serviceHours) return null;

  const isClosed = !serviceHours.isOpenNow;
  const accent = isClosed ? palette.warning : palette.success;
  const surface = isClosed ? palette.warningSoft : palette.successSoft;
  const range = `${serviceHours.openLabel} – ${serviceHours.closeLabel}`;

  return (
    <View
      style={[styles.card, { backgroundColor: surface, borderColor: accent }]}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.cardIcon, { backgroundColor: accent }]}>
          <Ionicons name="time-outline" size={16} color="#FFFFFF" />
        </View>
        <View style={styles.cardHeaderCopy}>
          <Text style={[styles.cardTitle, { color: accent }]}>
            {isClosed
              ? t("serviceHours.closedTitle")
              : t("serviceHours.openTitle")}
          </Text>
          <Text style={styles.cardBody}>
            {isClosed
              ? t("serviceHours.closedBody")
              : t("serviceHours.openBody")}
          </Text>
        </View>
      </View>

      <View style={styles.rangeRow}>
        <Ionicons name="alarm-outline" size={14} color={accent} />
        <Text style={styles.rangeLabel}>{t("serviceHours.hoursLabel")}</Text>
        <Text style={[styles.rangeValue, { color: accent }]}>{range}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  cardIcon: {
    width: 30,
    height: 30,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  cardHeaderCopy: {
    flex: 1,
    gap: 3,
  },
  cardTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
  },
  cardBody: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    color: palette.foreground,
  },
  rangeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  rangeLabel: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: palette.foreground,
  },
  rangeValue: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "900",
  },
});
