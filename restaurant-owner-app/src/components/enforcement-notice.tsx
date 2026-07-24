import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import {
  useOwnerStoreSettingsQuery,
  type OwnerEnforcement,
  type OwnerEnforcementStatus,
} from "@/src/hooks/use-owner-api";
import {
  useOwnerTranslation,
  type TranslationKey,
} from "@/src/i18n/translations";
import { formatDateTime } from "@/src/lib/format";
import { palette } from "@/src/theme/palette";

type EnforcementCopy = {
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
  tone: "warning" | "danger";
};

const ENFORCEMENT_COPY: Record<
  Exclude<OwnerEnforcementStatus, "active">,
  EnforcementCopy
> = {
  // `under_review` does NOT block ordering or going online — it is informational,
  // so it must not be styled or worded like a suspension.
  under_review: {
    titleKey: "enforcement.underReview.title",
    bodyKey: "enforcement.underReview.body",
    tone: "warning",
  },
  quality_hold: {
    titleKey: "enforcement.qualityHold.title",
    bodyKey: "enforcement.qualityHold.body",
    tone: "danger",
  },
  temporarily_suspended: {
    titleKey: "enforcement.suspended.title",
    bodyKey: "enforcement.suspended.body",
    tone: "danger",
  },
  permanently_disabled: {
    titleKey: "enforcement.disabled.title",
    bodyKey: "enforcement.disabled.body",
    tone: "danger",
  },
};

/**
 * Reads the enforcement state from `/owner/store-settings` — the single (uncached)
 * source of truth. Any screen can call this; react-query dedupes the request.
 */
export function useOwnerEnforcement(enabled = true): OwnerEnforcement | null {
  const storeQuery = useOwnerStoreSettingsQuery(enabled);
  const enforcement = storeQuery.data?.enforcement;

  if (!enforcement || enforcement.effectiveStatus === "active") {
    return null;
  }

  return enforcement;
}

export function EnforcementNotice({
  variant = "card",
  enabled = true,
}: {
  variant?: "card" | "strip";
  enabled?: boolean;
}) {
  const { t } = useOwnerTranslation();
  const enforcement = useOwnerEnforcement(enabled);

  if (!enforcement) return null;

  const status = enforcement.effectiveStatus as Exclude<
    OwnerEnforcementStatus,
    "active"
  >;
  const copy = ENFORCEMENT_COPY[status];
  if (!copy) return null;

  const isDanger = copy.tone === "danger";
  const accent = isDanger ? palette.danger : palette.warning;
  const surface = isDanger ? palette.dangerSoft : palette.warningSoft;
  const endsAt = formatDateTime(enforcement.expiresAt);

  if (variant === "strip") {
    return (
      <View
        style={[
          styles.strip,
          { backgroundColor: surface, borderColor: accent },
        ]}
      >
        <Ionicons name="warning" size={14} color={accent} />
        <Text numberOfLines={1} style={[styles.stripText, { color: accent }]}>
          {t(copy.titleKey)}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[styles.card, { backgroundColor: surface, borderColor: accent }]}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.cardIcon, { backgroundColor: accent }]}>
          <Ionicons name="warning" size={16} color="#FFFFFF" />
        </View>
        <View style={styles.cardHeaderCopy}>
          <Text style={[styles.cardTitle, { color: accent }]}>
            {t(copy.titleKey)}
          </Text>
          <Text style={styles.cardBody}>{t(copy.bodyKey)}</Text>
        </View>
      </View>

      {enforcement.ownerNote ? (
        <View style={styles.noteBox}>
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={14}
            color={palette.foreground}
          />
          <Text style={styles.noteText}>{enforcement.ownerNote}</Text>
        </View>
      ) : null}

      {endsAt ? (
        <View style={styles.untilRow}>
          <Ionicons name="time-outline" size={14} color={accent} />
          <Text style={[styles.untilText, { color: accent }]}>
            {t("enforcement.until")} {endsAt}
          </Text>
        </View>
      ) : null}
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
  noteBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    borderRadius: 13,
    backgroundColor: "rgba(255, 255, 255, 0.75)",
    padding: 10,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    color: palette.foreground,
  },
  untilRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  untilText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "900",
  },
  strip: {
    // Owns its own bottom spacing so a screen can host it in a zero-height wrapper
    // that collapses completely when there is no enforcement to show.
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  stripText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "900",
  },
});
