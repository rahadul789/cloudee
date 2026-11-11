import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
  viewCount: number;
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
};

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
        `/customer/hype/feed${deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : ""}`,
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
      }>(`/customer/hype/videos/${params.videoId}/reaction`, {
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
        const myReactions = { ...feed.myReactions };
        if (next) myReactions[videoId] = next;
        else delete myReactions[videoId];
        return {
          ...feed,
          myReactions,
          videos: feed.videos.map((video) =>
            video.id === videoId
              ? { ...video, likeCount: Math.max(0, video.likeCount + likeShift) }
              : video,
          ),
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
          ? {
              ...feed,
              videos: feed.videos.map((video) =>
                video.id === result.videoId ? { ...video, likeCount: result.likeCount } : video,
              ),
            }
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
