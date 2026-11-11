import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { RemoteImage } from "@/src/components/remote-image";
import { youtubeThumbnail, type HypeItem } from "@/src/hooks/use-hype-api";
import { palette } from "@/src/theme/palette";

const AMBER = palette.primary;

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function splitDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    hours: pad(Math.floor(total / 3600)),
    minutes: pad(Math.floor((total % 3600) / 60)),
    seconds: pad(total % 60),
  };
}

function formatClock(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// ── Drop: dark card + live countdown. Ticks only while the screen is focused. ──
export function HypeDropCard({
  drop,
  active,
  reminded,
  onGrab,
  onToggleReminder,
  onOpenDetails,
}: {
  drop: HypeItem;
  active: boolean;
  reminded: boolean;
  onGrab: () => void;
  onToggleReminder: () => void;
  onOpenDetails?: () => void;
}) {
  const now = useNow(active);
  const startsAt = drop.startsAt ? new Date(drop.startsAt).getTime() : 0;
  const endsAt = drop.endsAt ? new Date(drop.endsAt).getTime() : 0;
  const isLive = startsAt <= now;
  const ended = endsAt <= now;
  const target = isLive ? endsAt : startsAt;
  const parts = splitDuration(target - now);
  const span = Math.max(1, endsAt - startsAt);
  const progress = isLive && startsAt ? Math.min(1, Math.max(0, (now - startsAt) / span)) : 0;

  return (
    <View style={styles.dropCard}>
      {drop.imageUrl ? (
        <RemoteImage uri={drop.imageUrl} style={styles.dropImage} contentFit="cover" showSkeleton={false} />
      ) : null}
      <View style={styles.dropTopRow}>
        <View style={[styles.dropBadge, !isLive ? styles.dropBadgeSoon : null]}>
          <Ionicons name={isLive ? "flash" : "time-outline"} size={12} color={palette.onPrimary} />
          <Text style={styles.dropBadgeText}>{ended ? "ENDED" : isLive ? "LIVE DROP" : "COMING SOON"}</Text>
        </View>
        {drop.limitLabel ? <Text style={styles.dropLimit}>{drop.limitLabel}</Text> : null}
      </View>
      <Pressable
        style={styles.dropCopy}
        onPress={onOpenDetails}
        disabled={!onOpenDetails}
        accessibilityRole="button"
        accessibilityHint="Shows full details"
      >
        <Text style={styles.dropTitle}>{drop.title}</Text>
        <Text style={styles.dropMeta} numberOfLines={2}>
          {[drop.restaurantName, isLive ? `ends ${formatClock(drop.endsAt)}` : `starts ${formatClock(drop.startsAt)}`]
            .filter(Boolean)
            .join(" · ")}
        </Text>
        {drop.description ? (
          <Text style={styles.dropDescription} numberOfLines={2}>
            {drop.description}
          </Text>
        ) : null}
        {onOpenDetails ? (
          <View style={styles.detailsHint}>
            <Text style={styles.detailsHintText}>Details</Text>
            <Ionicons name="chevron-forward" size={13} color="#FFB84C" />
          </View>
        ) : null}
      </Pressable>
      <View style={styles.countdownRow} accessibilityLabel={`${parts.hours} hours ${parts.minutes} minutes ${parts.seconds} seconds ${isLive ? "left" : "to start"}`}>
        {[
          [parts.hours, "HRS"],
          [parts.minutes, "MIN"],
          [parts.seconds, "SEC"],
        ].map(([value, label]) => (
          <View key={label} style={styles.countdownBox}>
            <Text style={styles.countdownValue}>{value}</Text>
            <Text style={styles.countdownLabel}>{label}</Text>
          </View>
        ))}
      </View>
      {isLive ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      ) : null}
      {isLive ? (
        <Pressable
          style={({ pressed }) => [styles.dropButton, pressed ? styles.pressed : null]}
          onPress={onGrab}
          disabled={ended}
          accessibilityRole="button"
        >
          <Text style={styles.dropButtonText}>{drop.ctaLabel || "Grab the deal"}</Text>
          <Ionicons name="arrow-forward" size={16} color={palette.onPrimary} />
        </Pressable>
      ) : (
        <Pressable
          style={({ pressed }) => [styles.dropButton, reminded ? styles.dropButtonQuiet : null, pressed ? styles.pressed : null]}
          onPress={onToggleReminder}
          accessibilityRole="button"
        >
          <Ionicons name={reminded ? "notifications" : "notifications-outline"} size={16} color={reminded ? "#FFFFFF" : palette.onPrimary} />
          <Text style={[styles.dropButtonText, reminded ? styles.dropButtonTextQuiet : null]}>
            {reminded ? "We'll remind you" : "Notify me"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// ── Event row: date tile + title + "Remind me". ──
export function HypeEventRow({
  event,
  reminded,
  onPress,
  onToggleReminder,
}: {
  event: HypeItem;
  reminded: boolean;
  onPress: () => void;
  onToggleReminder: () => void;
}) {
  const date = event.startsAt ? new Date(event.startsAt) : null;
  const started = date ? date.getTime() <= Date.now() : false;
  return (
    <Pressable
      style={({ pressed }) => [styles.eventRow, pressed ? styles.pressedSoft : null]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={styles.eventDate}>
        <Text style={styles.eventMonth}>
          {date ? date.toLocaleDateString("en-US", { month: "short" }).toUpperCase() : ""}
        </Text>
        <Text style={styles.eventDay}>{date ? date.getDate() : ""}</Text>
      </View>
      <View style={styles.eventCopy}>
        <Text style={styles.eventTitle} numberOfLines={1}>
          {event.title}
        </Text>
        <Text style={styles.eventMeta} numberOfLines={2}>
          {[formatClock(event.startsAt), event.location || event.restaurantName, event.description]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>
      {started ? (
        <View style={styles.eventNow}>
          <Text style={styles.eventNowText}>Now</Text>
        </View>
      ) : (
        <Pressable
          onPress={onToggleReminder}
          hitSlop={6}
          style={({ pressed }) => [styles.remindButton, reminded ? styles.remindButtonOn : null, pressed ? styles.pressed : null]}
          accessibilityRole="button"
          accessibilityLabel={reminded ? "Cancel reminder" : "Remind me"}
        >
          <Ionicons
            name={reminded ? "notifications" : "notifications-outline"}
            size={14}
            color={palette.foreground}
          />
          <Text style={styles.remindText}>{reminded ? "Set" : "Remind"}</Text>
        </Pressable>
      )}
    </Pressable>
  );
}

// ── Video thumbnail (rail tile or full-width list row). ──
export function HypeVideoTile({
  video,
  variant,
  onPress,
}: {
  video: HypeItem;
  variant: "rail" | "row";
  onPress: () => void;
}) {
  const thumb = video.imageUrl || youtubeThumbnail(video.youtubeId);
  if (variant === "rail") {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.railTile, pressed ? styles.pressed : null]} accessibilityRole="button" accessibilityLabel={`Play ${video.title}`}>
        <RemoteImage uri={thumb} style={styles.railImage} contentFit="cover" />
        <View style={styles.railShade} />
        <View style={styles.playDot}>
          <Ionicons name="play" size={18} color={palette.onPrimary} />
        </View>
        <Text style={styles.railTitle} numberOfLines={2}>
          {video.title}
        </Text>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.videoRow, pressed ? styles.pressedSoft : null]} accessibilityRole="button" accessibilityLabel={`Play ${video.title}`}>
      <View style={styles.videoRowThumbWrap}>
        <RemoteImage uri={thumb} style={styles.videoRowThumb} contentFit="cover" />
        <View style={styles.playDotSmall}>
          <Ionicons name="play" size={13} color={palette.onPrimary} />
        </View>
        {video.durationLabel ? <Text style={styles.duration}>{video.durationLabel}</Text> : null}
      </View>
      <View style={styles.videoRowCopy}>
        <Text style={styles.videoRowTitle} numberOfLines={2}>
          {video.title}
        </Text>
        <Text style={styles.videoRowMeta} numberOfLines={1}>
          {[video.restaurantName, `${video.likeCount} likes`].filter(Boolean).join(" · ")}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  pressedSoft: { opacity: 0.8 },

  dropCard: {
    overflow: "hidden",
    gap: 12,
    padding: 16,
    borderRadius: 22,
    backgroundColor: "#111111",
  },
  dropImage: { ...StyleSheet.absoluteFillObject, opacity: 0.28 },
  dropTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dropBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 13,
    backgroundColor: AMBER,
  },
  dropBadgeSoon: { backgroundColor: "#FFE2AE" },
  dropBadgeText: { fontSize: 11.5, fontWeight: "800", color: palette.onPrimary, letterSpacing: 0.3 },
  dropLimit: { fontSize: 12, color: "#C9CCD1" },
  dropCopy: { gap: 4 },
  dropTitle: { fontSize: 21, lineHeight: 27, fontWeight: "800", color: "#FFFFFF" },
  dropMeta: { fontSize: 13, lineHeight: 18, color: "#C9CCD1" },
  detailsHint: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 2 },
  detailsHintText: { fontSize: 12.5, fontWeight: "700", color: "#FFB84C" },
  dropDescription: { fontSize: 13, lineHeight: 18, color: "#E3E4E7" },
  countdownRow: { flexDirection: "row", gap: 8 },
  countdownBox: {
    flex: 1,
    height: 58,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  countdownValue: { fontSize: 21, lineHeight: 26, fontWeight: "800", color: "#FFFFFF", fontVariant: ["tabular-nums"] },
  countdownLabel: { fontSize: 10, fontWeight: "700", color: "#C9CCD1", letterSpacing: 0.6 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.14)", overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: AMBER },
  dropButton: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 15,
    backgroundColor: AMBER,
  },
  dropButtonQuiet: { backgroundColor: "rgba(255,255,255,0.12)" },
  dropButtonText: { fontSize: 15, fontWeight: "700", color: palette.onPrimary },
  dropButtonTextQuiet: { color: "#FFFFFF" },

  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 18,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E6E6E6",
  },
  eventDate: {
    width: 52,
    height: 56,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primarySoft,
  },
  eventMonth: { fontSize: 11, fontWeight: "700", color: palette.secondary },
  eventDay: { fontSize: 20, lineHeight: 24, fontWeight: "800", color: palette.foreground },
  eventCopy: { flex: 1, minWidth: 0, gap: 2 },
  eventTitle: { fontSize: 14.5, lineHeight: 19, fontWeight: "700", color: palette.foreground },
  eventMeta: { fontSize: 12, lineHeight: 16, color: palette.mutedForeground },
  remindButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 34,
    paddingHorizontal: 11,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#DADCE0",
    backgroundColor: palette.surface,
  },
  remindButtonOn: { borderColor: palette.primary, backgroundColor: palette.primarySoft },
  remindText: { fontSize: 12, fontWeight: "700", color: palette.foreground },
  eventNow: { height: 28, paddingHorizontal: 10, borderRadius: 14, justifyContent: "center", backgroundColor: "#E7F7EE" },
  eventNowText: { fontSize: 12, fontWeight: "700", color: palette.successText },

  railTile: { width: 132, height: 176, borderRadius: 18, overflow: "hidden", backgroundColor: "#1E1E1E" },
  railImage: { ...StyleSheet.absoluteFillObject },
  railShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.28)" },
  playDot: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: AMBER,
  },
  railTitle: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 10,
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  videoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    borderRadius: 18,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E6E6E6",
  },
  videoRowThumbWrap: { width: 124, height: 70, borderRadius: 12, overflow: "hidden", backgroundColor: "#1E1E1E" },
  videoRowThumb: { width: 124, height: 70 },
  playDotSmall: {
    position: "absolute",
    top: 21,
    left: 48,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: AMBER,
  },
  duration: {
    position: "absolute",
    right: 6,
    bottom: 6,
    paddingHorizontal: 5,
    borderRadius: 6,
    overflow: "hidden",
    fontSize: 10.5,
    color: "#FFFFFF",
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  videoRowCopy: { flex: 1, minWidth: 0, gap: 3 },
  videoRowTitle: { fontSize: 13.5, lineHeight: 18, fontWeight: "700", color: palette.foreground },
  videoRowMeta: { fontSize: 11.5, color: palette.mutedForeground },
});
