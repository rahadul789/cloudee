import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  apiGet,
  apiGetWithOptionalAuth,
  apiPostWithOptionalAuth,
  apiProtectedPost,
} from "@/src/lib/api";
import { getStableCustomerInstallId } from "@/src/lib/customer-install-id";
import { useCustomerAuthStore } from "@/src/store/auth-store";

export type HypeItem = {
  id: string;
  kind: "drop" | "event" | "video" | "poll";
  title: string;
  description: string;
  imageUrl: string;
  restaurantId: string | null;
  restaurantName: string;
  /** Dish to open straight away ("Order this" → customize → cart). */
  menuItemId?: string | null;
  ctaLabel: string;
  ctaPath: string;
  externalUrl: string;
  startsAt: string | null;
  endsAt: string | null;
  limitLabel: string;
  location: string;
  youtubeId: string;
  category: "food" | "funny" | "local" | "other";
  durationLabel: string;
  likeCount: number;
  /** Older backends omit it. */
  dislikeCount?: number;
  viewCount: number;
  /** Publish time (drives the "new" dot). Older backends omit it. */
  createdAt?: string | null;
  /** Admin "Featured" pin. */
  isPinned?: boolean;
  /** event: how many tapped "Going". */
  goingCount?: number;
  /** drop: real "X grabbed · Y left" (stockTotal 0 = hide). */
  grabbedCount?: number;
  stockTotal?: number;
  // poll — counts/percent are null until you vote (or the poll closes)
  pollOptions?: { id: string; label: string; percent?: number | null; voteCount?: number | null }[];
  pollOpen?: boolean;
  myVote?: string | null;
  voteCount?: number | null;
  allowComments?: boolean;
  commentCount?: number;
};

export type HypeComment = {
  id: string;
  authorName: string;
  text: string;
  createdAt: string;
  customerId: string;
};

export type HypeFeed = {
  serverTime: string;
  drops: HypeItem[];
  events: HypeItem[];
  videos: HypeItem[];
  polls?: HypeItem[];
  myReactions: Record<string, "like" | "dislike">;
  /** Events this person marked "Going". */
  myGoing?: Record<string, boolean>;
  /** Admin-pinned items for the top of "For you" (max 3). */
  pinned?: HypeItem[];
  /** Friend quiz card (admin on/off). Missing on older backends. */
  quiz?: { enabled: boolean };
  /** Admin order of the "For you" sections (missing on older backends → default order). */
  sectionOrder?: HypeSectionKey[];
  /** All videos (the feed itself only carries the first few for the rail). */
  videoTotal?: number;
  /** Admin-managed video categories (chips). */
  videoCategories?: { id: string; label: string }[];
  /** Newest visible Hype content (bottom-tab dot). */
  latestAt?: string | null;
};

/** Rail size in the feed; the Videos tab and the watch screen page the rest. */
export const HYPE_FEED_VIDEO_LIMIT = 8;
const HYPE_VIDEO_PAGE_SIZE = 10;

export type HypeVideoPage = { items: HypeItem[]; page: number; total: number; hasMore: boolean };

/** Infinite list of videos (optionally one category) — loads 10 at a time. */
export function useHypeVideosInfiniteQuery(category: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: ["customer", "hype-videos", category],
    enabled,
    staleTime: 60_000,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const query = `page=${pageParam}&pageSize=${HYPE_VIDEO_PAGE_SIZE}${category && category !== "all" ? `&category=${encodeURIComponent(category)}` : ""}`;
      return (await apiGet<HypeVideoPage>(`/customer/hype/videos?${query}`)).data;
    },
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });
}

/** Light "anything new on Hype?" check for the bottom-tab dot. */
export function useHypeLatestQuery() {
  return useQuery({
    queryKey: ["customer", "hype-latest"],
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    queryFn: async () => (await apiGet<{ latestAt: string | null }>("/customer/hype/latest")).data,
  });
}

export type HypeSectionKey = "featured" | "quiz" | "stamps" | "videos" | "drops" | "polls" | "events";
export const DEFAULT_HYPE_SECTION_ORDER: HypeSectionKey[] = ["featured", "quiz", "stamps", "videos", "drops", "polls", "events"];

/** Admin order, ignoring unknown keys and appending any section it doesn't mention. */
export function resolveHypeSectionOrder(order?: string[] | null): HypeSectionKey[] {
  const known = new Set<string>(DEFAULT_HYPE_SECTION_ORDER);
  const list = (order ?? []).filter((key, index, all) => known.has(key) && all.indexOf(key) === index) as HypeSectionKey[];
  // Missing sections go back to their default slot (same rule as the server).
  DEFAULT_HYPE_SECTION_ORDER.forEach((key, index) => {
    if (!list.includes(key)) list.splice(Math.min(index, list.length), 0, key);
  });
  return list;
}

// Likes / dislikes apply to videos and events alike — patch whichever list holds the item.
function patchReactable(feed: HypeFeed, id: string, patch: (item: HypeItem) => HypeItem): HypeFeed {
  return {
    ...feed,
    videos: feed.videos.map((item) => (item.id === id ? patch(item) : item)),
    events: feed.events.map((item) => (item.id === id ? patch(item) : item)),
    pinned: feed.pinned?.map((item) => (item.id === id ? patch(item) : item)),
  };
}

/** "Going" on an event (tap again to undo). Optimistic, rolls back on error. */
export function useHypeGoingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { itemId: string; going: boolean }) => {
      const deviceId = await getStableCustomerInstallId().catch(() => "");
      return (
        await apiPostWithOptionalAuth<{ itemId: string; going: boolean; goingCount: number }>(
          `/customer/hype/items/${params.itemId}/going`,
          { going: params.going, deviceId },
        )
      ).data;
    },
    onMutate: async ({ itemId, going }) => {
      await queryClient.cancelQueries({ queryKey: HYPE_FEED_KEY });
      const snapshots = queryClient.getQueriesData<HypeFeed>({ queryKey: HYPE_FEED_KEY });
      queryClient.setQueriesData<HypeFeed>({ queryKey: HYPE_FEED_KEY }, (feed) => {
        if (!feed) return feed;
        const was = Boolean(feed.myGoing?.[itemId]);
        if (was === going) return feed;
        const myGoing = { ...(feed.myGoing ?? {}) };
        if (going) myGoing[itemId] = true;
        else delete myGoing[itemId];
        return {
          ...patchReactable(feed, itemId, (item) => ({
            ...item,
            goingCount: Math.max(0, (item.goingCount ?? 0) + (going ? 1 : -1)),
          })),
          myGoing,
        };
      });
      return { snapshots };
    },
    onError: (_error, _vars, context) => {
      context?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSuccess: (result) => {
      queryClient.setQueriesData<HypeFeed>({ queryKey: HYPE_FEED_KEY }, (feed) =>
        feed ? patchReactable(feed, result.itemId, (item) => ({ ...item, goingCount: result.goingCount })) : feed,
      );
    },
  });
}

/** Tell the server an order came from a Hype video / drop (it verifies restaurant + 3h window). */
export function reportHypeOrderAttribution(orderId: string, itemId: string) {
  void apiProtectedPost("/customer/hype/attribution", { orderId, itemId }).catch(() => undefined);
}

export type HypeReaction = "like" | "dislike" | "none";

const HYPE_FEED_KEY = ["customer", "hype-feed"] as const;

export function useHypeFeedQuery() {
  const customerId = useCustomerAuthStore((state) => state.customer?.id ?? "guest");
  return useQuery({
    queryKey: [...HYPE_FEED_KEY, customerId],
    staleTime: 60_000,
    queryFn: async () => {
      const deviceId = await getStableCustomerInstallId().catch(() => "");
      const response = await apiGetWithOptionalAuth<HypeFeed>(
        `/customer/hype/feed?videoLimit=${HYPE_FEED_VIDEO_LIMIT}${deviceId ? `&deviceId=${encodeURIComponent(deviceId)}` : ""}`,
      );
      return response.data;
    },
  });
}

/** Like / dislike / clear, applied optimistically to the cached feed. */
export function useHypeVideoReactionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { videoId: string; reaction: HypeReaction }) => {
      const deviceId = await getStableCustomerInstallId().catch(() => "");
      const response = await apiPostWithOptionalAuth<{
        videoId: string;
        reaction: "like" | "dislike" | null;
        likeCount: number;
        dislikeCount?: number;
      }>(`/customer/hype/items/${params.videoId}/reaction`, {
        reaction: params.reaction,
        deviceId,
      });
      return response.data;
    },
    onMutate: async ({ videoId, reaction }) => {
      await queryClient.cancelQueries({ queryKey: HYPE_FEED_KEY });
      const snapshots = queryClient.getQueriesData<HypeFeed>({ queryKey: HYPE_FEED_KEY });
      queryClient.setQueriesData<HypeFeed>({ queryKey: HYPE_FEED_KEY }, (feed) => {
        if (!feed) return feed;
        const previous = feed.myReactions[videoId] ?? null;
        const next = reaction === "none" ? null : reaction;
        const likeShift = (next === "like" ? 1 : 0) - (previous === "like" ? 1 : 0);
        const dislikeShift = (next === "dislike" ? 1 : 0) - (previous === "dislike" ? 1 : 0);
        const myReactions = { ...feed.myReactions };
        if (next) myReactions[videoId] = next;
        else delete myReactions[videoId];
        return {
          ...patchReactable(feed, videoId, (item) => ({
            ...item,
            likeCount: Math.max(0, item.likeCount + likeShift),
            dislikeCount: Math.max(0, (item.dislikeCount ?? 0) + dislikeShift),
          })),
          myReactions,
        };
      });
      return { snapshots };
    },
    onError: (_error, _vars, context) => {
      context?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSuccess: (result) => {
      queryClient.setQueriesData<HypeFeed>({ queryKey: HYPE_FEED_KEY }, (feed) =>
        feed
          ? patchReactable(feed, result.videoId, (item) => ({
              ...item,
              likeCount: result.likeCount,
              dislikeCount: result.dislikeCount ?? item.dislikeCount,
            }))
          : feed,
      );
    },
  });
}

export function recordHypeVideoView(videoId: string) {
  void apiPostWithOptionalAuth(`/customer/hype/videos/${videoId}/view`, {}).catch(() => undefined);
}

export function youtubeThumbnail(youtubeId: string) {
  return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
}

/** One vote per person; the server returns the poll with results, which we drop into the feed cache. */
export function useHypePollVoteMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { pollId: string; optionId: string }) => {
      const deviceId = await getStableCustomerInstallId().catch(() => "");
      const response = await apiPostWithOptionalAuth<{ alreadyVoted: boolean; poll: HypeItem }>(
        `/customer/hype/polls/${params.pollId}/vote`,
        { optionId: params.optionId, deviceId },
      );
      return response.data;
    },
    onSuccess: (result) => {
      queryClient.setQueriesData<HypeFeed>({ queryKey: HYPE_FEED_KEY }, (feed) =>
        feed
          ? {
              ...feed,
              polls: (feed.polls ?? []).map((poll) =>
                poll.id === result.poll.id ? { ...poll, ...result.poll, restaurantName: poll.restaurantName } : poll,
              ),
            }
          : feed,
      );
    },
  });
}

export function useHypePollCommentsQuery(pollId: string | null) {
  return useQuery({
    queryKey: ["customer", "hype-comments", pollId],
    enabled: Boolean(pollId),
    staleTime: 15_000,
    queryFn: async () => {
      const response = await apiGet<{ items: HypeComment[]; hasMore: boolean }>(
        `/customer/hype/polls/${pollId}/comments`,
      );
      return response.data;
    },
  });
}

export function useAddHypePollCommentMutation(pollId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (text: string) => {
      const response = await apiProtectedPost<HypeComment>(`/customer/hype/polls/${pollId}/comments`, { text });
      return response.data;
    },
    onSuccess: (comment) => {
      queryClient.setQueryData<{ items: HypeComment[]; hasMore: boolean }>(
        ["customer", "hype-comments", pollId],
        (current) => ({ items: [comment, ...(current?.items ?? [])], hasMore: current?.hasMore ?? false }),
      );
      queryClient.setQueriesData<HypeFeed>({ queryKey: HYPE_FEED_KEY }, (feed) =>
        feed
          ? {
              ...feed,
              polls: (feed.polls ?? []).map((poll) =>
                poll.id === pollId ? { ...poll, commentCount: (poll.commentCount ?? 0) + 1 } : poll,
              ),
            }
          : feed,
      );
    },
  });
}
