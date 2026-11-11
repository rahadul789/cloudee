import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { EmptyStateCard } from "@/src/components/empty-state-card";
import { HypeVideoTile } from "@/src/components/hype/hype-cards";
import { Screen } from "@/src/components/screen";
import { YoutubePlayer } from "@/src/components/youtube-player";
import { AppHeader } from "@/src/components/ui";
import {
  recordHypeVideoView,
  useHypeFeedQuery,
  useHypeVideoReactionMutation,
} from "@/src/hooks/use-hype-api";
import { palette } from "@/src/theme/palette";

const CATEGORY_LABEL: Record<string, string> = {
  all: "All",
  food: "Food",
  funny: "Funny",
  local: "Netrakona",
  other: "More",
};

export default function HypeVideoScreen() {
  const router = useRouter();
  const { videoId } = useLocalSearchParams<{ videoId?: string }>();
  const feedQuery = useHypeFeedQuery();
  const reaction = useHypeVideoReactionMutation();
  const [category, setCategory] = useState("all");
  const scrollRef = useRef<ScrollView>(null);

  const videos = useMemo(() => feedQuery.data?.videos ?? [], [feedQuery.data?.videos]);
  const video = videos.find((item) => item.id === videoId) ?? null;
  const mine = videoId ? feedQuery.data?.myReactions?.[videoId] ?? null : null;
  const categories = useMemo(
    () => ["all", ...Array.from(new Set(videos.map((item) => item.category)))],
    [videos],
  );
  const more = videos.filter(
    (item) => item.id !== videoId && (category === "all" || item.category === category),
  );

  // One view per open (counted server-side, never shown as a dislike-style signal).
  useEffect(() => {
    if (videoId) recordHypeVideoView(videoId);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [videoId]);


  const react = (next: "like" | "dislike") => {
    if (!video) return;
    reaction.mutate({ videoId: video.id, reaction: mine === next ? "none" : next });
  };

  const openOrder = () => {
    if (!video?.restaurantId) return;
    router.push({
      pathname: "/restaurants/[restaurantId]",
      params: { restaurantId: video.restaurantId, source: "hype_video" },
    });
  };

  return (
    <Screen>
      <AppHeader title="Watch & crave" subtitle="Food, fun & Netrakona" />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!video ? (
          feedQuery.isLoading ? (
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
          <>
            <YoutubePlayer youtubeId={video.youtubeId} />

            <View style={styles.info}>
              <Text style={styles.title}>{video.title}</Text>
              <Text style={styles.meta}>
                {[video.restaurantName, `${video.viewCount} views`].filter(Boolean).join(" · ")}
              </Text>
              {video.description ? <Text style={styles.description}>{video.description}</Text> : null}

              <View style={styles.actions}>
                <Pressable
                  onPress={() => react("like")}
                  style={({ pressed }) => [styles.likeButton, mine === "like" ? styles.likeButtonOn : null, pressed ? styles.pressed : null]}
                  accessibilityRole="button"
                  accessibilityLabel={mine === "like" ? "Remove like" : "Like"}
                  accessibilityState={{ selected: mine === "like" }}
                >
                  <Ionicons name={mine === "like" ? "thumbs-up" : "thumbs-up-outline"} size={18} color={palette.foreground} />
                  <Text style={styles.likeText}>{video.likeCount}</Text>
                </Pressable>
                <Pressable
                  onPress={() => react("dislike")}
                  style={({ pressed }) => [styles.iconButton, mine === "dislike" ? styles.iconButtonOn : null, pressed ? styles.pressed : null]}
                  accessibilityRole="button"
                  accessibilityLabel={mine === "dislike" ? "Remove dislike" : "Dislike"}
                  accessibilityState={{ selected: mine === "dislike" }}
                >
                  <Ionicons name={mine === "dislike" ? "thumbs-down" : "thumbs-down-outline"} size={18} color={palette.foreground} />
                </Pressable>
                <Pressable
                  onPress={() =>
                    void Share.share({
                      message: `${video.title} — watch on Foodbela: https://youtu.be/${video.youtubeId}`,
                    }).catch(() => undefined)
                  }
                  style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]}
                  accessibilityRole="button"
                  accessibilityLabel="Share"
                >
                  <Ionicons name="share-social-outline" size={18} color={palette.foreground} />
                </Pressable>
                {video.restaurantId ? (
                  <Pressable
                    onPress={openOrder}
                    style={({ pressed }) => [styles.orderButton, pressed ? styles.pressed : null]}
                    accessibilityRole="button"
                  >
                    <Ionicons name="bag-handle-outline" size={16} color={palette.onPrimary} />
                    <Text style={styles.orderText}>{video.ctaLabel || "Order this"}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </>
        )}

        {videos.length > 1 ? (
          <View style={styles.moreSection}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {categories.map((key) => {
                const active = key === category;
                return (
                  <Pressable
                    key={key}
                    onPress={() => setCategory(key)}
                    style={[styles.chip, active ? styles.chipActive : null]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
                      {CATEGORY_LABEL[key] ?? key}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {more.map((item) => (
              <HypeVideoTile
                key={item.id}
                video={item}
                variant="row"
                onPress={() => router.setParams({ videoId: item.id })}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 48 },
  pad: { paddingHorizontal: 16 },
  loader: { marginTop: 60 },
  info: { paddingHorizontal: 16, paddingTop: 14, gap: 6 },
  title: { fontSize: 18, lineHeight: 24, fontWeight: "700", color: palette.foreground },
  meta: { fontSize: 12.5, color: palette.mutedForeground },
  description: { fontSize: 13.5, lineHeight: 19, color: palette.foreground, marginTop: 2 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.97 }] },
  likeButton: {
    height: 42,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: "#DADCE0",
    backgroundColor: palette.surface,
  },
  likeButtonOn: { borderColor: palette.primary, backgroundColor: palette.primarySoft },
  likeText: { fontSize: 13.5, fontWeight: "700", color: palette.foreground },
  iconButton: {
    width: 44,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#DADCE0",
    backgroundColor: palette.surface,
  },
  iconButtonOn: { borderColor: palette.foreground, backgroundColor: palette.surfaceMuted },
  orderButton: {
    marginLeft: "auto",
    height: 42,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 14,
    backgroundColor: palette.primary,
  },
  orderText: { fontSize: 13.5, fontWeight: "700", color: palette.onPrimary },
  moreSection: { paddingHorizontal: 16, paddingTop: 22, gap: 10 },
  chips: { gap: 8 },
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
});
