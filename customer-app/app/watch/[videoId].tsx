import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import { EmptyStateCard } from "@/src/components/empty-state-card";
import { compactCount, HypeVideoTile } from "@/src/components/hype/hype-cards";
import { Screen } from "@/src/components/screen";
import { YoutubePlayer } from "@/src/components/youtube-player";
import { AppHeader } from "@/src/components/ui";
import {
  recordHypeVideoView,
  useHypeFeedQuery,
  useHypeVideoReactionMutation,
  useHypeVideosInfiniteQuery,
  type HypeItem,
} from "@/src/hooks/use-hype-api";
import { apiGet } from "@/src/lib/api";
import { buildUpNext } from "@/src/lib/hype-up-next";
import { isNewVideo, useHypeSeenStore } from "@/src/store/hype-seen-store";
import { palette } from "@/src/theme/palette";

const FALLBACK_CATEGORIES = [
  { id: "food", label: "Food" },
  { id: "funny", label: "Funny" },
  { id: "local", label: "Netrakona" },
  { id: "other", label: "More" },
];
const AUTOPLAY_SECONDS = 3;

type Row = { type: "upnext" } | { type: "video"; video: HypeItem } | { type: "empty" };

// Description clamped to 3 lines with a "Show more / Show less" toggle (only when it overflows).
function VideoDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  return (
    <View>
      {/* Invisible full-length copy, only to count lines (Android clamps onTextLayout to numberOfLines). */}
      <Text
        style={[styles.description, styles.measure]}
        onTextLayout={(event) => setOverflows(event.nativeEvent.lines.length > 3)}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        {text}
      </Text>
      <Pressable onPress={() => setExpanded((value) => !value)} disabled={!overflows} accessibilityRole="button">
        <Text style={styles.description} numberOfLines={expanded ? undefined : 3}>
          {text}
        </Text>
        {overflows ? <Text style={styles.moreToggle}>{expanded ? "Show less" : "Show more"}</Text> : null}
      </Pressable>
    </View>
  );
}

// Gently pulsing "Order this" so it gets noticed (native driver; stops when unmounted).
function OrderThisButton({ label, restaurantName, onPress }: { label: string; restaurantName: string; onPress: () => void }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.delay(900),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View style={{ transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] }) }] }}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.orderButton, pressed ? styles.pressed : null]}
        accessibilityRole="button"
        accessibilityLabel={`${label} from ${restaurantName}`}
      >
        <Animated.View
          pointerEvents="none"
          style={[styles.orderGlow, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.35] }) }]}
        />
        <View style={styles.orderIcon}>
          <Ionicons name="bag-handle" size={18} color={palette.primary} />
        </View>
        <View style={styles.orderCopy}>
          <Text style={styles.orderText}>{label}</Text>
          {restaurantName ? (
            <Text style={styles.orderSub} numberOfLines={1}>
              from {restaurantName}
            </Text>
          ) : null}
        </View>
        <Ionicons name="arrow-forward" size={18} color={palette.onPrimary} />
      </Pressable>
    </Animated.View>
  );
}

// Watch screen (YouTube-style):
//   • player pinned on top; category chips + "Up next" + Autoplay switch stick right under it
//   • Next plays the following video in order (never ping-pongs); autoplay starts it when one ends
//   • "Up next" pages 10 at a time; unwatched new videos carry a dot that clears once played
export default function HypeVideoScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { videoId } = useLocalSearchParams<{ videoId?: string }>();
  const feedQuery = useHypeFeedQuery();
  const reaction = useHypeVideoReactionMutation();
  const [category, setCategory] = useState("all");
  const listRef = useRef<FlatList<Row>>(null);
  const watched = useHypeSeenStore((state) => state.watched);
  const autoplay = useHypeSeenStore((state) => state.autoplay !== false);
  const setAutoplay = useHypeSeenStore((state) => state.setAutoplay);
  const markWatched = useHypeSeenStore((state) => state.markWatched);
  const hydrateSeen = useHypeSeenStore((state) => state.hydrate);
  useEffect(() => {
    void hydrateSeen();
  }, [hydrateSeen]);

  const listQuery = useHypeVideosInfiniteQuery(category);
  const listed = useMemo(() => listQuery.data?.pages.flatMap((page) => page.items) ?? [], [listQuery.data]);

  // The playing video: from the feed rail or the loaded list, otherwise fetched on its own.
  const known = useMemo(
    () => (feedQuery.data?.videos ?? []).concat(listed).find((item) => item.id === videoId) ?? null,
    [feedQuery.data?.videos, listed, videoId],
  );
  const singleQuery = useQuery({
    queryKey: ["customer", "hype-video", videoId],
    enabled: Boolean(videoId),
    staleTime: 60_000,
    queryFn: async () => (await apiGet<HypeItem>(`/customer/hype/videos/${videoId}`)).data,
  });
  const video = singleQuery.data ?? known;
  const mine = videoId ? feedQuery.data?.myReactions?.[videoId] ?? null : null;

  const categories = useMemo(() => {
    const list = feedQuery.data?.videoCategories?.length ? feedQuery.data.videoCategories : FALLBACK_CATEGORIES;
    return [{ id: "all", label: "All" }, ...list];
  }, [feedQuery.data?.videoCategories]);

  // Played this session → Next moves forward instead of bouncing between two videos.
  const [played, setPlayed] = useState<Set<string>>(() => new Set());
  // A new video resets any running autoplay countdown.
  const [countdown, setCountdown] = useState<number | null>(null);
  const [shownVideoId, setShownVideoId] = useState(videoId);
  if (shownVideoId !== videoId) {
    setShownVideoId(videoId);
    setCountdown(null);
  }
  useEffect(() => {
    if (!videoId) return;
    setPlayed((current) => (current.has(videoId) ? current : new Set(current).add(videoId)));
    recordHypeVideoView(videoId);
    markWatched(videoId);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [markWatched, videoId]);

  const upNext = useMemo(() => buildUpNext(listed, videoId, played), [listed, played, videoId]);
  const nextVideo = upNext[0] ?? null;

  const play = (next: HypeItem) => router.setParams({ videoId: next.id });

  // When a video ends: a short "Playing next" countdown (Cancel / Play now), then the next one.
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      if (nextVideo) router.setParams({ videoId: nextVideo.id });
      return;
    }
    const timer = setTimeout(() => setCountdown((value) => (value === null ? null : value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [countdown, nextVideo, router]);

  const react = (next: "like" | "dislike") => {
    if (!video) return;
    reaction.mutate(
      { videoId: video.id, reaction: mine === next ? "none" : next },
      {
        onSuccess: (result) =>
          queryClient.setQueryData<HypeItem>(["customer", "hype-video", video.id], (current) =>
            current ? { ...current, likeCount: result.likeCount } : current,
          ),
      },
    );
  };

  const openOrder = () => {
    if (!video?.restaurantId) return;
    // Remember the tap so an order at this restaurant (within 3h) counts for this video.
    useHypeSeenStore.getState().setOrderIntent({ itemId: video.id, restaurantId: video.restaurantId, at: Date.now() });
    router.push({
      pathname: "/restaurants/[restaurantId]",
      // With a dish set, the restaurant opens straight on it (customize → add to cart).
      params: {
        restaurantId: video.restaurantId,
        source: "hype_video",
        ...(video.menuItemId ? { itemId: video.menuItemId } : {}),
      },
    });
  };

  const rows: Row[] = useMemo(() => {
    const base: Row[] = [{ type: "upnext" }];
    if (upNext.length) return base.concat(upNext.map((item) => ({ type: "video", video: item }) as Row));
    if (!listQuery.isLoading) base.push({ type: "empty" });
    return base;
  }, [listQuery.isLoading, upNext]);

  const header = !video ? (
    feedQuery.isLoading || singleQuery.isLoading ? (
      <ActivityIndicator style={styles.loader} color={palette.foreground} />
    ) : (
      <View style={styles.pad}>
        <EmptyStateCard
          title="Video not available"
          description="It may have been removed. Try another one below."
          icon="videocam-off-outline"
          mascot={false}
        />
      </View>
    )
  ) : (
    <View style={styles.info}>
      <Text style={styles.title}>{video.title}</Text>
      <Text style={styles.meta}>
        {[`${compactCount(video.viewCount)} views`, video.restaurantName].filter(Boolean).join(" · ")}
      </Text>
      {video.description ? <VideoDescription key={video.id} text={video.description} /> : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actions}>
        <View style={styles.likeGroup}>
          <Pressable
            onPress={() => react("like")}
            style={({ pressed }) => [styles.likeHalf, mine === "like" ? styles.actionOn : null, pressed ? styles.pressed : null]}
            accessibilityRole="button"
            accessibilityLabel={mine === "like" ? "Remove like" : "Like"}
            accessibilityState={{ selected: mine === "like" }}
          >
            <Ionicons name={mine === "like" ? "thumbs-up" : "thumbs-up-outline"} size={18} color={palette.foreground} />
            <Text style={styles.actionText}>{compactCount(video.likeCount)}</Text>
          </Pressable>
          <View style={styles.likeDivider} />
          <Pressable
            onPress={() => react("dislike")}
            style={({ pressed }) => [styles.likeHalf, mine === "dislike" ? styles.actionOn : null, pressed ? styles.pressed : null]}
            accessibilityRole="button"
            accessibilityLabel={mine === "dislike" ? "Remove dislike" : "Dislike"}
            accessibilityState={{ selected: mine === "dislike" }}
          >
            <Ionicons name={mine === "dislike" ? "thumbs-down" : "thumbs-down-outline"} size={18} color={palette.foreground} />
          </Pressable>
        </View>
        <Pressable
          onPress={() =>
            void Share.share({
              message: `${video.title} — watch on Foodbela: https://youtu.be/${video.youtubeId}`,
            }).catch(() => undefined)
          }
          style={({ pressed }) => [styles.action, pressed ? styles.pressed : null]}
          accessibilityRole="button"
        >
          <Ionicons name="share-social-outline" size={18} color={palette.foreground} />
          <Text style={styles.actionText}>Share</Text>
        </Pressable>
        <Pressable
          onPress={() => nextVideo && play(nextVideo)}
          disabled={!nextVideo}
          style={({ pressed }) => [styles.action, !nextVideo ? styles.disabled : null, pressed ? styles.pressed : null]}
          accessibilityRole="button"
          accessibilityLabel="Next video"
        >
          <Ionicons name="play-skip-forward" size={18} color={palette.foreground} />
          <Text style={styles.actionText}>Next</Text>
        </Pressable>
      </ScrollView>

      {video.restaurantId ? (
        <OrderThisButton label={video.ctaLabel || "Order this"} restaurantName={video.restaurantName} onPress={openOrder} />
      ) : null}
    </View>
  );

  return (
    <Screen>
      <AppHeader title="Watch & crave" subtitle="Food, fun & Netrakona" />
      {/* Player stays pinned on top while everything below scrolls (YouTube-style). */}
      {video ? (
        <View style={styles.playerDock}>
          <YoutubePlayer
            key={video.youtubeId}
            youtubeId={video.youtubeId}
            onEnded={() => {
              if (autoplay && nextVideo) setCountdown(AUTOPLAY_SECONDS);
            }}
          />
          {countdown !== null && nextVideo ? (
            <View style={styles.upNextOverlay}>
              <Text style={styles.upNextLabel}>Playing next in {countdown}…</Text>
              <Text style={styles.upNextTitle} numberOfLines={2}>
                {nextVideo.title}
              </Text>
              <View style={styles.upNextActions}>
                <Pressable onPress={() => setCountdown(null)} style={styles.upNextCancel} accessibilityRole="button">
                  <Text style={styles.upNextCancelText}>Cancel</Text>
                </Pressable>
                <Pressable onPress={() => play(nextVideo)} style={styles.upNextPlay} accessibilityRole="button">
                  <Ionicons name="play" size={14} color={palette.onPrimary} />
                  <Text style={styles.upNextPlayText}>Play now</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
      {/* Category chips: always visible under the player. Kept OUTSIDE the list on purpose —
          as a FlatList sticky header, Android stopped delivering taps to them once stuck. */}
      <View style={styles.chipsBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.chips}
        >
          {categories.map((item) => {
            const active = item.id === category;
            return (
              <Pressable
                key={item.id}
                onPress={() => {
                  setCategory(item.id);
                  listRef.current?.scrollToOffset({ offset: 0, animated: true });
                }}
                hitSlop={4}
                style={[styles.chip, active ? styles.chipActive : null]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(row, index) => (row.type === "video" ? row.video.id : `${row.type}-${index}`)}
        ListHeaderComponent={header}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if (listQuery.hasNextPage && !listQuery.isFetchingNextPage) void listQuery.fetchNextPage();
        }}
        initialNumToRender={6}
        windowSize={7}
        removeClippedSubviews
        renderItem={({ item: row }) => {
          if (row.type === "upnext") {
            return (
              <View style={styles.upNextRow}>
                <Text style={styles.upNext}>Up next</Text>
                <View style={styles.autoplay}>
                  <Text style={styles.autoplayText}>Autoplay</Text>
                  <Switch
                    value={autoplay}
                    onValueChange={setAutoplay}
                    trackColor={{ false: "#D5D7DB", true: palette.primary }}
                    thumbColor="#FFFFFF"
                    accessibilityLabel="Autoplay next video"
                  />
                </View>
              </View>
            );
          }
          if (row.type === "empty") {
            return <Text style={styles.empty}>No more videos in this category</Text>;
          }
          return (
            <View style={styles.rowPad}>
              <HypeVideoTile
                video={row.video}
                variant="row"
                isNew={isNewVideo(row.video.createdAt, row.video.id, watched)}
                onPress={() => play(row.video)}
              />
            </View>
          );
        }}
        ListFooterComponent={
          listQuery.isFetchingNextPage || (listQuery.isLoading && !upNext.length) ? (
            <ActivityIndicator style={styles.footerLoader} color={palette.mutedForeground} />
          ) : null
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  playerDock: { backgroundColor: "#000000", zIndex: 2 },
  upNextOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 20,
    backgroundColor: "rgba(0,0,0,0.8)",
  },
  upNextLabel: { fontSize: 13, fontWeight: "700", color: palette.primary },
  upNextTitle: { fontSize: 16, lineHeight: 22, fontWeight: "700", color: "#FFFFFF", textAlign: "center" },
  upNextActions: { flexDirection: "row", gap: 10, marginTop: 6 },
  upNextCancel: {
    height: 38,
    paddingHorizontal: 16,
    borderRadius: 19,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
  },
  upNextCancelText: { fontSize: 13.5, fontWeight: "700", color: "#FFFFFF" },
  upNextPlay: {
    height: 38,
    paddingHorizontal: 16,
    borderRadius: 19,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: palette.primary,
  },
  upNextPlayText: { fontSize: 13.5, fontWeight: "700", color: palette.onPrimary },
  content: { paddingBottom: 48 },
  pad: { paddingHorizontal: 16 },
  loader: { marginTop: 60 },
  info: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, gap: 8 },
  title: { fontSize: 18, lineHeight: 25, fontWeight: "700", color: palette.foreground },
  meta: { fontSize: 12.5, color: palette.mutedForeground, marginTop: -4 },
  description: { fontSize: 13.5, lineHeight: 19, color: palette.foreground },
  measure: { position: "absolute", left: 0, right: 0, opacity: 0 },
  moreToggle: { marginTop: 2, fontSize: 13, fontWeight: "700", color: palette.secondary },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2 },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.4 },
  likeGroup: {
    flexDirection: "row",
    alignItems: "center",
    height: 38,
    borderRadius: 19,
    backgroundColor: palette.surfaceMuted,
    overflow: "hidden",
  },
  likeHalf: { height: 38, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 6 },
  likeDivider: { width: StyleSheet.hairlineWidth, height: 20, backgroundColor: "#C9CBCF" },
  action: {
    height: 38,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 19,
    backgroundColor: palette.surfaceMuted,
  },
  actionOn: { backgroundColor: palette.primarySoft },
  actionText: { fontSize: 13.5, fontWeight: "700", color: palette.foreground },
  orderButton: {
    marginTop: 4,
    minHeight: 56,
    paddingHorizontal: 12,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: palette.primary,
    overflow: "hidden",
  },
  orderGlow: { ...StyleSheet.absoluteFillObject, backgroundColor: "#FFFFFF" },
  orderIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111111",
  },
  orderCopy: { flex: 1, minWidth: 0 },
  orderText: { fontSize: 15.5, fontWeight: "700", color: palette.onPrimary },
  orderSub: { fontSize: 12, color: palette.onPrimary, opacity: 0.75 },
  chipsBar: {
    paddingVertical: 8,
    backgroundColor: palette.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ECECEE",
  },
  chips: { gap: 8, paddingHorizontal: 16 },
  chip: {
    height: 34,
    paddingHorizontal: 13,
    borderRadius: 17,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E3E4E7",
    backgroundColor: palette.surface,
  },
  chipActive: { borderColor: palette.foreground, backgroundColor: palette.foreground },
  chipText: { fontSize: 12.5, fontWeight: "500", color: palette.foreground },
  chipTextActive: { fontWeight: "700", color: "#FFFFFF" },
  upNextRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#ECECEE",
  },
  upNext: { fontSize: 14, fontWeight: "700", color: palette.foreground },
  autoplay: { flexDirection: "row", alignItems: "center", gap: 4 },
  autoplayText: { fontSize: 12.5, fontWeight: "500", color: palette.mutedForeground },
  rowPad: { paddingHorizontal: 16, paddingTop: 10 },
  empty: { padding: 24, textAlign: "center", fontSize: 13.5, color: palette.mutedForeground },
  footerLoader: { marginVertical: 18 },
});
