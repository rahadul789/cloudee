import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";

import {
  useOwnerStoreSettingsQuery,
  type OwnerStoreSettings,
} from "@/src/hooks/use-owner-api";
import { useOwnerTranslation } from "@/src/i18n/translations";
import { palette } from "@/src/theme/palette";

type OwnerServiceHours = NonNullable<OwnerStoreSettings["serviceHours"]>;

// Android needs this flag for LayoutAnimation to actually animate.
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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
 * Compact service-window chip that expands (with a smooth layout animation) into the
 * full explanation when the owner taps it. Collapsed, it still shows the live state
 * (open/closed) and the daily window. Purely informational — never blocks going online.
 */
export function ServiceHoursNotice({ enabled = true }: { enabled?: boolean }) {
  const { t } = useOwnerTranslation();
  const serviceHours = useOwnerServiceHours(enabled);
  const [expanded, setExpanded] = useState(false);

  if (!serviceHours) return null;

  const isClosed = !serviceHours.isOpenNow;
  const accent = isClosed ? palette.warning : palette.success;
  const surface = isClosed ? palette.warningSoft : palette.successSoft;
  const range = `${serviceHours.openLabel} – ${serviceHours.closeLabel}`;

  function toggle() {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(
        220,
        LayoutAnimation.Types.easeInEaseOut,
        LayoutAnimation.Properties.opacity,
      ),
    );
    setExpanded((value) => !value);
  }

  return (
    <Pressable
      onPress={toggle}
      accessibilityRole="button"
      style={[styles.card, { backgroundColor: surface, borderColor: accent }]}
    >
      <View style={styles.compactRow}>
        <View style={[styles.cardIcon, { backgroundColor: accent }]}>
          <Ionicons name="time-outline" size={16} color="#FFFFFF" />
        </View>

        <View style={styles.compactCopy}>
          <View style={styles.stateRow}>
            <View style={[styles.stateDot, { backgroundColor: accent }]} />
            <Text style={[styles.stateText, { color: accent }]}>
              {isClosed
                ? t("serviceHours.closedTitle")
                : t("serviceHours.openTitle")}
            </Text>
          </View>
          <Text style={styles.compactRange} numberOfLines={1}>
            {t("serviceHours.hoursLabel")}:{" "}
            <Text style={[styles.rangeStrong, { color: accent }]}>{range}</Text>
          </Text>
        </View>

        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={accent}
        />
      </View>

      {expanded ? (
        <View style={styles.details}>
          <View style={[styles.divider, { backgroundColor: accent }]} />
          <View style={styles.detailRow}>
            <Ionicons name="alarm-outline" size={14} color={accent} />
            <Text style={styles.detailLabel}>
              {t("serviceHours.hoursLabel")}
            </Text>
            <Text style={[styles.detailValue, { color: accent }]}>{range}</Text>
          </View>
          <Text style={styles.cardBody}>
            {isClosed
              ? t("serviceHours.closedBody")
              : t("serviceHours.openBody")}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 13,
  },
  compactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  cardIcon: {
    width: 30,
    height: 30,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  compactCopy: {
    flex: 1,
    gap: 2,
  },
  stateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  stateDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  stateText: {
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: "900",
  },
  compactRange: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: palette.foreground,
  },
  rangeStrong: {
    fontWeight: "900",
  },
  details: {
    marginTop: 11,
    gap: 9,
  },
  divider: {
    height: 1,
    opacity: 0.22,
    borderRadius: 1,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  detailLabel: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: palette.foreground,
  },
  detailValue: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "900",
  },
  cardBody: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    color: palette.foreground,
  },
});
