import { useIsFocused } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Animated, Easing, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { BelaPullToRefresh } from "@/src/components/bela-pull-to-refresh";
import { EmptyStateCard } from "@/src/components/empty-state-card";
import { ErrorRetryCard } from "@/src/components/error-retry-card";
import { HypeDropCard, HypeEventRow, HypeVideoTile } from "@/src/components/hype/hype-cards";
import { HypeDetailsSheet } from "@/src/components/hype/hype-details-sheet";
import { HypePollCard, HypePollCommentsSheet } from "@/src/components/hype/hype-poll";
import { StampCardTeaser } from "@/src/components/rewards/stamp-card";
import { QuizHypeCard } from "@/src/components/quiz/quiz-hype-card";
import { useCustomerQuizQuery } from "@/src/hooks/use-quiz-api";
import { useCustomerRewardsQuery } from "@/src/hooks/use-rewards-api";
import { HypeSegments, type HypeSegment } from "@/src/components/hype/hype-segments";
import { ShimmerBlock } from "@/src/components/loading-skeleton";
import { Screen } from "@/src/components/screen";
import { AppHeader } from "@/src/components/ui";
import { appAlert } from "@/src/lib/app-alert";
import {
  resolveHypeSectionOrder,
  useHypeFeedQuery,
  useHypePollVoteMutation,
  useHypeVideoReactionMutation,
  useHypeVideosInfiniteQuery,
  useHypeGoingMutation,
  type HypeItem,
  type HypeSectionKey,
} from "@/src/hooks/use-hype-api";
import { trackHypeEvent, trackHypeImpressions } from "@/src/lib/hype-analytics";
import { useCustomerAuthStore } from "@/src/store/auth-store";
import { isNewVideo, useHypeSeenStore } from "@/src/store/hype-seen-store";
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

// Last section order / quiz flag seen this session, so the first-load skeleton matches the feed.
let lastSectionOrder: string[] | undefined;
let lastQuizEnabled = false;

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
  const quizEnabled = Boolean(feedQuery.data?.quiz?.enabled);
  // Videos tab pages 10 at a time (the feed itself only carries the rail's first few).
  const videosListQuery = useHypeVideosInfiniteQuery("all", segment === "videos");
  const pagedVideos = useMemo(
    () => videosListQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [videosListQuery.data],
  );
  const watchedVideos = useHypeSeenStore((state) => state.watched);
  const markHypeSeen = useHypeSeenStore((state) => state.markSeen);
  const hydrateSeen = useHypeSeenStore((state) => state.hydrate);
  useEffect(() => {
    void hydrateSeen();
  }, [hydrateSeen]);
  // Opening the tab = the newest content is "seen" (clears the bottom-tab dot).
  useEffect(() => {
    if (isFocused && feedQuery.data?.latestAt) markHypeSeen(feedQuery.data.latestAt);
  }, [feedQuery.data?.latestAt, isFocused, markHypeSeen]);
  const eventReaction = useHypeVideoReactionMutation();
  if (feedQuery.data) {
    lastSectionOrder = feedQuery.data.sectionOrder ?? lastSectionOrder;
    lastQuizEnabled = quizEnabled;
  }
  const sectionOrder = useMemo(
    () => resolveHypeSectionOrder(feedQuery.data?.sectionOrder ?? lastSectionOrder),
    [feedQuery.data?.sectionOrder],
  );
  const quizQuery = useCustomerQuizQuery(quizEnabled && isFocused);
  const openQuiz = useCallback(() => {
    void trackCustomerEvent({
      eventType: "custom",
      path: "/(tabs)/hype",
      screenName: "hype",
      metadata: { action: "quiz_card_open" },
    });
    if (!signedIn) {
      router.push({ pathname: "/sign-in", params: { redirectTo: "/quiz" } });
      return;
    }
    router.push("/quiz" as never);
  }, [router, signedIn]);
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
        // Remember the tap so an order at this restaurant (within 3h) counts for this item.
        useHypeSeenStore.getState().setOrderIntent({ itemId: item.id, restaurantId: item.restaurantId, at: Date.now() });
        router.push({
          pathname: "/restaurants/[restaurantId]",
          params: {
            restaurantId: item.restaurantId,
            source: "hype",
            ...(item.menuItemId ? { itemId: item.menuItemId } : {}),
          },
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

  const goingMutation = useHypeGoingMutation();
  const toggleGoing = useCallback(
    (event: HypeItem) => {
      goingMutation.mutate({ itemId: event.id, going: !feed?.myGoing?.[event.id] });
    },
    [feed?.myGoing, goingMutation],
  );

  const reactToEvent = useCallback(
    (event: HypeItem, next: "like" | "dislike") => {
      const mine = feed?.myReactions?.[event.id] ?? null;
      eventReaction.mutate({ videoId: event.id, reaction: mine === next ? "none" : next });
    },
    [eventReaction, feed?.myReactions],
  );

  // One renderer per section so the "For you" feed follows the admin order.
  // skeleton = placeholder while the feed loads (same shape and order as the real thing).
  const renderSection = (key: HypeSectionKey, skeleton: boolean): ReactNode => {
    const all = segment === "all";
    // In "For you", pinned items already sit in Featured — don't show them twice.
    const pinnedIds = new Set((feed?.pinned ?? []).map((item) => item.id));
    const unpinned = (item: HypeItem) => !pinnedIds.has(item.id);
    switch (key) {
      case "featured": {
        // Admin-pinned items, always on top (max 3), each in its usual card.
        if (!all || skeleton) return null;
        const pinned = feed?.pinned ?? [];
        if (!pinned.length) return null;
        return (
          <View style={styles.section}>
            <SectionTitle title="📌 Featured" />
            {pinned.map((item) =>
              item.kind === "video" ? (
                <HypeVideoTile
                  key={item.id}
                  video={item}
                  variant="row"
                  isNew={isNewVideo(item.createdAt, item.id, watchedVideos)}
                  onPress={() => openVideo(item)}
                />
              ) : item.kind === "drop" ? (
                <HypeDropCard
                  key={item.id}
                  drop={item}
                  active={isFocused}
                  reminded={reminders.has(item.id)}
                  onGrab={() => openItem(item)}
                  onOpenDetails={() => setDetails(item)}
                  onToggleReminder={() => void handleReminder(item)}
                />
              ) : item.kind === "event" ? (
                <HypeEventRow
                  key={item.id}
                  event={item}
                  reminded={reminders.has(item.id)}
                  myReaction={feed?.myReactions?.[item.id] ?? null}
                  going={Boolean(feed?.myGoing?.[item.id])}
                  onPress={() => setDetails(item)}
                  onToggleReminder={() => void handleReminder(item)}
                  onReact={(next) => reactToEvent(item, next)}
                  onToggleGoing={() => toggleGoing(item)}
                />
              ) : (
                <HypePollCard
                  key={item.id}
                  poll={item}
                  voting={voteMutation.isPending && voteMutation.variables?.pollId === item.id}
                  onVote={(optionId) =>
                    voteMutation.mutate(
                      { pollId: item.id, optionId },
                      { onError: (error) => appAlert("Couldn't vote", error instanceof Error ? error.message : "Try again.") },
                    )
                  }
                  onOpenComments={() => {
                    trackHypeEvent(item.id, "open");
                    setCommentsFor(item);
                  }}
                />
              ),
            )}
          </View>
        );
      }
      case "quiz":
        if (!all) return null;
        if (skeleton) return lastQuizEnabled ? <ShimmerBlock style={styles.skeletonQuiz} /> : null;
        return quizEnabled ? <QuizHypeCard quiz={quizQuery.data?.quiz ?? null} onPress={openQuiz} active={isFocused} /> : null;
      case "stamps":
        // Stamp teaser comes from rewards (not the feed), so it can show even while the feed loads.
        if (!all || !rewardsQuery.data?.stamps.enabled) return null;
        return <StampCardTeaser rewards={rewardsQuery.data} onPress={() => router.push("/rewards" as never)} />;
      case "videos":
        if (skeleton) {
          return (
            <View style={styles.skeleton}>
              <ShimmerBlock style={styles.skeletonTitle} />
              <View style={styles.skeletonRail}>
                {[0, 1, 2].map((index) => (
                  <ShimmerBlock key={index} style={styles.skeletonTile} />
                ))}
              </View>
            </View>
          );
        }
        if (!showVideos || !videos.length) return null;
        return (
          <View style={styles.section}>
            <SectionTitle title="Watch & crave" action={all ? "See all" : undefined} onAction={() => changeSegment("videos")} />
            {all ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
                {videos.filter(unpinned).slice(0, 8).map((video) => (
                  <HypeVideoTile
                    key={video.id}
                    video={video}
                    variant="rail"
                    isNew={isNewVideo(video.createdAt, video.id, watchedVideos)}
                    onPress={() => openVideo(video)}
                  />
                ))}
              </ScrollView>
            ) : (
              <>
                {(pagedVideos.length ? pagedVideos : videos).map((video) => (
                  <HypeVideoTile
                    key={video.id}
                    video={video}
                    variant="row"
                    isNew={isNewVideo(video.createdAt, video.id, watchedVideos)}
                    onPress={() => openVideo(video)}
                  />
                ))}
                {videosListQuery.isFetchingNextPage ? <ActivityIndicator color={palette.mutedForeground} /> : null}
              </>
            )}
          </View>
        );
      case "drops":
        if (skeleton) return <ShimmerBlock style={styles.skeletonDrop} />;
        if (!showDrops || !drops.length) return null;
        return (
          <View style={styles.section}>
            {!all ? <SectionTitle title="Drops" /> : null}
            {(all ? drops.filter(unpinned).slice(0, 2) : drops).map((drop) => (
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
            {all && drops.length > 2 ? (
              <Pressable onPress={() => changeSegment("drops")} style={styles.moreButton} accessibilityRole="button">
                <Text style={styles.moreText}>See all {drops.length} drops</Text>
              </Pressable>
            ) : null}
          </View>
        );
      case "polls":
        if (skeleton) {
          return (
            <View style={styles.skeleton}>
              <ShimmerBlock style={styles.skeletonTitle} />
              <ShimmerBlock style={styles.skeletonPoll} />
            </View>
          );
        }
        if (!showPolls || !polls.length) return null;
        return (
          <View style={styles.section}>
            <SectionTitle
              title="Netrakona votes"
              action={all && polls.length > 2 ? "See all" : undefined}
              onAction={() => changeSegment("polls")}
            />
            {(all ? polls.filter(unpinned).slice(0, 2) : polls).map((poll) => (
              <HypePollCard
                key={poll.id}
                poll={poll}
                voting={voteMutation.isPending && voteMutation.variables?.pollId === poll.id}
                onVote={(optionId) =>
                  voteMutation.mutate(
                    { pollId: poll.id, optionId },
                    { onError: (error) => appAlert("Couldn't vote", error instanceof Error ? error.message : "Try again.") },
                  )
                }
                onOpenComments={() => {
                  trackHypeEvent(poll.id, "open");
                  setCommentsFor(poll);
                }}
              />
            ))}
          </View>
        );
      case "events":
        if (skeleton) {
          return (
            <View style={styles.skeleton}>
              <ShimmerBlock style={styles.skeletonTitle} />
              <ShimmerBlock style={styles.skeletonRow} />
              <ShimmerBlock style={styles.skeletonRow} />
            </View>
          );
        }
        if (!showEvents || !events.length) return null;
        return (
          <View style={styles.section}>
            <SectionTitle
              title="Happening in Netrakona"
              action={all && events.length > 3 ? "See all" : undefined}
              onAction={() => changeSegment("events")}
            />
            {(all ? events.filter(unpinned).slice(0, 3) : events).map((event) => (
              <HypeEventRow
                key={event.id}
                event={event}
                reminded={reminders.has(event.id)}
                myReaction={feed?.myReactions?.[event.id] ?? null}
                going={Boolean(feed?.myGoing?.[event.id])}
                onPress={() => setDetails(event)}
                onToggleReminder={() => void handleReminder(event)}
                onReact={(next) => reactToEvent(event, next)}
                onToggleGoing={() => toggleGoing(event)}
              />
            ))}
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <Screen>
      <AppHeader showBack={false} title="Hype" subtitle="What's happening in Netrakona today" />
      <View style={styles.segments}>
        <HypeSegments
          value={segment}
          onChange={changeSegment}
          counts={{ drops: drops.length, events: events.length, videos: feed?.videoTotal ?? videos.length, polls: polls.length }}
        />
      </View>

      <BelaPullToRefresh refreshing={isRefreshing} onRefresh={handleRefresh}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={200}
          onScroll={(event) => {
            // Infinite scroll for the Videos tab: fetch the next 10 near the bottom.
            if (segment !== "videos" || !videosListQuery.hasNextPage || videosListQuery.isFetchingNextPage) return;
            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
            if (contentOffset.y + layoutMeasurement.height > contentSize.height - 600) void videosListQuery.fetchNextPage();
          }}
        >
          {feedQuery.isLoading && !feed ? (
            // Skeleton follows the same (admin) section order as the real feed.
            <View style={styles.animatedContent}>
              {sectionOrder.map((key) => {
                const node = renderSection(key, true);
                return node ? <View key={key}>{node}</View> : null;
              })}
            </View>
          ) : feedQuery.isError && !feed ? (
            <>
              {segment === "all" ? renderSection("stamps", false) : null}
              <ErrorRetryCard
                title="Couldn't load Hype"
                description="Check your connection and try again."
                onRetry={() => void feedQuery.refetch()}
                retrying={feedQuery.isFetching}
              />
            </>
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
              {(segment === "all" ? sectionOrder : [segment as HypeSectionKey]).map((key) => {
                const node = renderSection(key, false);
                return node ? <View key={key}>{node}</View> : null;
              })}
              {nothingAtAll || segmentEmpty ? (
                <EmptyStateCard
                  title="Nothing hyped right now"
                  description="New drops, polls, events and videos land here often. Pull down to check again."
                  icon="flame-outline"
                  mascot={false}
                />
              ) : null}
            </Animated.View>
          )}
        </ScrollView>
      </BelaPullToRefresh>

      <HypeDetailsSheet
        // Live copy from the feed so counts update while the sheet is open.
        item={details ? events.find((event) => event.id === details.id) ?? drops.find((drop) => drop.id === details.id) ?? details : null}
        reminded={details ? reminders.has(details.id) : false}
        myReaction={details ? feed?.myReactions?.[details.id] ?? null : null}
        going={details ? Boolean(feed?.myGoing?.[details.id]) : false}
        onReact={(item, next) => reactToEvent(item, next)}
        onToggleGoing={(item) => toggleGoing(item)}
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
  skeletonQuiz: { height: 128, borderRadius: 24 },
  skeletonPoll: { height: 200, borderRadius: 22 },
});
