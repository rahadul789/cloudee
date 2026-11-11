import { useIsFocused } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { BelaPullToRefresh } from "@/src/components/bela-pull-to-refresh";
import { EmptyStateCard } from "@/src/components/empty-state-card";
import { ErrorRetryCard } from "@/src/components/error-retry-card";
import { HypeDropCard, HypeEventRow, HypeVideoTile } from "@/src/components/hype/hype-cards";
import { HypeDetailsSheet } from "@/src/components/hype/hype-details-sheet";
import { HypePollCard, HypePollCommentsSheet } from "@/src/components/hype/hype-poll";
import { StampCardTeaser } from "@/src/components/rewards/stamp-card";
import { useCustomerRewardsQuery } from "@/src/hooks/use-rewards-api";
import { HypeSegments, type HypeSegment } from "@/src/components/hype/hype-segments";
import { ShimmerBlock } from "@/src/components/loading-skeleton";
import { Screen } from "@/src/components/screen";
import { AppHeader } from "@/src/components/ui";
import { appAlert } from "@/src/lib/app-alert";
import { useHypeFeedQuery, useHypePollVoteMutation, type HypeItem } from "@/src/hooks/use-hype-api";
import { trackHypeEvent, trackHypeImpressions } from "@/src/lib/hype-analytics";
import { useCustomerAuthStore } from "@/src/store/auth-store";
import { trackCustomerEvent } from "@/src/lib/analytics";
import { resolveCustomerRoute, withRestaurantViewSource } from "@/src/lib/customer-routes";
import { getHypeReminderIds, toggleHypeReminder } from "@/src/lib/hype-reminders";
import { palette } from "@/src/theme/palette";

type Segment = HypeSegment;

function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button">
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// Mirrors the real feed order: video rail → drop card → poll → event rows.
function HypeSkeleton() {
  return (
    <View style={styles.skeleton}>
      <ShimmerBlock style={styles.skeletonTitle} />
      <View style={styles.skeletonRail}>
        {[0, 1, 2].map((index) => (
          <ShimmerBlock key={index} style={styles.skeletonTile} />
        ))}
      </View>
      <ShimmerBlock style={styles.skeletonDrop} />
      <ShimmerBlock style={styles.skeletonTitle} />
      <ShimmerBlock style={styles.skeletonRow} />
      <ShimmerBlock style={styles.skeletonRow} />
    </View>
  );
}

// Hype tab: admin-curated flash drops, what's happening in town, and food/fun videos.
export default function HypeTabScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const feedQuery = useHypeFeedQuery();
  const [segment, setSegment] = useState<Segment>("all");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [reminders, setReminders] = useState<Set<string>>(new Set());
  const [details, setDetailsState] = useState<HypeItem | null>(null);
  const [commentsFor, setCommentsFor] = useState<HypeItem | null>(null);
  const signedIn = useCustomerAuthStore((state) => Boolean(state.customer));
  const voteMutation = useHypePollVoteMutation();
  const rewardsQuery = useCustomerRewardsQuery(isFocused);
  const setDetails = useCallback((item: HypeItem | null) => {
    if (item) trackHypeEvent(item.id, "open");
    setDetailsState(item);
  }, []);
  // Content eases in (fade + small rise) every time the segment changes.
  const contentAnim = useRef(new Animated.Value(1)).current;
  const changeSegment = useCallback(
    (next: Segment) => {
      setSegment(next);
      contentAnim.setValue(0);
      Animated.timing(contentAnim, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    },
    [contentAnim],
  );

  useEffect(() => {
    void getHypeReminderIds().then(setReminders);
  }, []);

  const feed = feedQuery.data;
  const drops = useMemo(() => feed?.drops ?? [], [feed?.drops]);
  const events = useMemo(() => feed?.events ?? [], [feed?.events]);
  const videos = useMemo(() => feed?.videos ?? [], [feed?.videos]);
  const polls = useMemo(() => feed?.polls ?? [], [feed?.polls]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await feedQuery.refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [feedQuery]);

  const openItem = useCallback(
    (item: HypeItem) => {
      trackHypeEvent(item.id, "cta");
      void trackCustomerEvent({
        eventType: "custom",
        path: "/(tabs)/hype",
        screenName: "hype",
        metadata: { action: `${item.kind}_open`, itemId: item.id },
      });
      const route = resolveCustomerRoute(item.ctaPath, null);
      if (route) {
        router.push(withRestaurantViewSource(route, "hype") as never);
        return;
      }
      if (/^https?:\/\//i.test(item.ctaPath)) {
        void Linking.openURL(item.ctaPath);
        return;
      }
      if (item.restaurantId) {
        router.push({
          pathname: "/restaurants/[restaurantId]",
          params: { restaurantId: item.restaurantId, source: "hype" },
        });
      }
    },
    [router],
  );

  const openVideo = useCallback(
    (video: HypeItem) => {
      trackHypeEvent(video.id, "open");
      router.push({ pathname: "/watch/[videoId]", params: { videoId: video.id } } as never);
    },
    [router],
  );

  const handleReminder = useCallback(async (item: HypeItem) => {
    const result = await toggleHypeReminder(item);
    if (result === "scheduled") trackHypeEvent(item.id, "remind");
    if (result === "denied") {
      appAlert(
        "Notifications are off",
        "Turn on notifications for Foodbela in your phone settings to get reminders.",
      );
    } else if (result === "too_late") {
      appAlert("Already started", "This one has already started — jump in now!");
    }
    setReminders(await getHypeReminderIds());
  }, []);

  const showDrops = segment === "all" || segment === "drops";
  const showEvents = segment === "all" || segment === "events";
  const showVideos = segment === "all" || segment === "videos";
  const showPolls = segment === "all" || segment === "polls";
  const nothingAtAll = !drops.length && !events.length && !videos.length && !polls.length;
  const segmentEmpty =
    (segment === "drops" && !drops.length) ||
    (segment === "events" && !events.length) ||
    (segment === "videos" && !videos.length) ||
    (segment === "polls" && !polls.length);

  // "Seen" analytics: everything rendered for the current segment while the tab is in view.
  useEffect(() => {
    if (!isFocused || !feed) return;
    const visible = [
      ...(showVideos ? (segment === "all" ? videos.slice(0, 8) : videos) : []),
      ...(showDrops ? (segment === "all" ? drops.slice(0, 2) : drops) : []),
      ...(showPolls ? (segment === "all" ? polls.slice(0, 2) : polls) : []),
      ...(showEvents ? (segment === "all" ? events.slice(0, 3) : events) : []),
    ];
    trackHypeImpressions(visible.map((item) => item.id));
  }, [drops, events, feed, isFocused, polls, segment, showDrops, showEvents, showPolls, showVideos, videos]);

  return (
    <Screen>
      <AppHeader showBack={false} title="Hype" subtitle="What's happening in Netrakona today" />
      <View style={styles.segments}>
        <HypeSegments
          value={segment}
          onChange={changeSegment}
          counts={{ drops: drops.length, events: events.length, videos: videos.length, polls: polls.length }}
        />
      </View>

      <BelaPullToRefresh refreshing={isRefreshing} onRefresh={handleRefresh}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Stamp card teaser (signed-in): progress + scratch cards waiting — shown even when the feed is empty. */}
          {segment === "all" && rewardsQuery.data?.stamps.enabled ? (
            <StampCardTeaser rewards={rewardsQuery.data} onPress={() => router.push("/rewards" as never)} />
          ) : null}
          {feedQuery.isLoading && !feed ? (
            <HypeSkeleton />
          ) : feedQuery.isError && !feed ? (
            <ErrorRetryCard
              title="Couldn't load Hype"
              description="Check your connection and try again."
              onRetry={() => void feedQuery.refetch()}
              retrying={feedQuery.isFetching}
            />
          ) : nothingAtAll || segmentEmpty ? (
            <EmptyStateCard
              title="Nothing hyped right now"
              description="New drops, polls, events and videos land here often. Pull down to check again."
              icon="flame-outline"
              mascot={false}
            />
          ) : (
            <Animated.View
              style={[
                styles.animatedContent,
                {
                  opacity: contentAnim,
                  transform: [{ translateY: contentAnim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
                },
              ]}
            >
              {/* Videos lead the feed: the most scroll-stopping thing for a quick visit. */}
              {showVideos && videos.length ? (
                <View style={styles.section}>
                  <SectionTitle
                    title="Watch & crave"
                    action={segment === "all" ? "See all" : undefined}
                    onAction={() => changeSegment("videos")}
                  />
                  {segment === "all" ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.rail}
                    >
                      {videos.slice(0, 8).map((video) => (
                        <HypeVideoTile key={video.id} video={video} variant="rail" onPress={() => openVideo(video)} />
                      ))}
                    </ScrollView>
                  ) : (
                    videos.map((video) => (
                      <HypeVideoTile key={video.id} video={video} variant="row" onPress={() => openVideo(video)} />
                    ))
                  )}
                </View>
              ) : null}

              {showDrops && drops.length ? (
                <View style={styles.section}>
                  {segment !== "all" ? <SectionTitle title="Drops" /> : null}
                  {(segment === "all" ? drops.slice(0, 2) : drops).map((drop) => (
                    <HypeDropCard
                      key={drop.id}
                      drop={drop}
                      active={isFocused}
                      reminded={reminders.has(drop.id)}
                      onGrab={() => openItem(drop)}
                      onOpenDetails={() => setDetails(drop)}
                      onToggleReminder={() => void handleReminder(drop)}
                    />
                  ))}
                  {segment === "all" && drops.length > 2 ? (
                    <Pressable onPress={() => changeSegment("drops")} style={styles.moreButton} accessibilityRole="button">
                      <Text style={styles.moreText}>See all {drops.length} drops</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              {showPolls && polls.length ? (
                <View style={styles.section}>
                  <SectionTitle
                    title="Netrakona votes"
                    action={segment === "all" && polls.length > 2 ? "See all" : undefined}
                    onAction={() => changeSegment("polls")}
                  />
                  {(segment === "all" ? polls.slice(0, 2) : polls).map((poll) => (
                    <HypePollCard
                      key={poll.id}
                      poll={poll}
                      voting={voteMutation.isPending && voteMutation.variables?.pollId === poll.id}
                      onVote={(optionId) =>
                        voteMutation.mutate(
                          { pollId: poll.id, optionId },
                          {
                            onError: (error) =>
                              appAlert("Couldn't vote", error instanceof Error ? error.message : "Try again."),
                          },
                        )
                      }
                      onOpenComments={() => {
                        trackHypeEvent(poll.id, "open");
                        setCommentsFor(poll);
                      }}
                    />
                  ))}
                </View>
              ) : null}

              {showEvents && events.length ? (
                <View style={styles.section}>
                  <SectionTitle
                    title="Happening in Netrakona"
                    action={segment === "all" && events.length > 3 ? "See all" : undefined}
                    onAction={() => changeSegment("events")}
                  />
                  {(segment === "all" ? events.slice(0, 3) : events).map((event) => (
                    <HypeEventRow
                      key={event.id}
                      event={event}
                      reminded={reminders.has(event.id)}
                      onPress={() => setDetails(event)}
                      onToggleReminder={() => void handleReminder(event)}
                    />
                  ))}
                </View>
              ) : null}

            </Animated.View>
          )}
        </ScrollView>
      </BelaPullToRefresh>

      <HypeDetailsSheet
        item={details}
        reminded={details ? reminders.has(details.id) : false}
        onClose={() => setDetails(null)}
        onOpenTarget={(item) => {
          setDetails(null);
          openItem(item);
        }}
        onOpenWebsite={(url) => {
          void trackCustomerEvent({
            eventType: "custom",
            path: "/(tabs)/hype",
            screenName: "hype",
            metadata: { action: "website_open", itemId: details?.id ?? "", url },
          });
          if (details) trackHypeEvent(details.id, "website");
          void Linking.openURL(url).catch(() => undefined);
        }}
        onToggleReminder={(item) => void handleReminder(item)}
      />

      <HypePollCommentsSheet
        poll={commentsFor ? polls.find((poll) => poll.id === commentsFor.id) ?? commentsFor : null}
        signedIn={signedIn}
        onClose={() => setCommentsFor(null)}
        onSignIn={() => {
          setCommentsFor(null);
          router.push({ pathname: "/sign-in", params: { redirectTo: "/(tabs)/hype" } });
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  segments: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12 },
  animatedContent: { gap: 22 },
  content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 140, gap: 22 },
  section: { gap: 10 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 17, lineHeight: 23, fontWeight: "700", color: palette.foreground },
  sectionAction: { fontSize: 13.5, fontWeight: "700", color: palette.secondary },
  rail: { gap: 10 },
  moreButton: {
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#DADCE0",
    backgroundColor: palette.surface,
  },
  moreText: { fontSize: 13.5, fontWeight: "700", color: palette.foreground },
  skeleton: { gap: 12 },
  skeletonTitle: { width: "45%", height: 18, borderRadius: 8, marginTop: 4 },
  skeletonRail: { flexDirection: "row", gap: 10, overflow: "hidden" },
  skeletonTile: { width: 132, height: 176, borderRadius: 18 },
  skeletonDrop: { height: 250, borderRadius: 22, marginTop: 10 },
  skeletonRow: { height: 80, borderRadius: 18 },
});
