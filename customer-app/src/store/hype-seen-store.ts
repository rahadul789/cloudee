import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

// What this phone has already seen on the Hype tab:
//   • lastSeenAt — newest Hype content the user has opened the tab after → bottom-tab dot
//   • watched    — video ids already played → "new" dot on video tiles
// Local only (no account needed), small and best-effort.

const STORAGE_KEY = "foodbela.hype.seen.v1";
const MAX_WATCHED = 300;
/** A video keeps its "new" dot for this long after publishing, until this phone plays it. */
export const NEW_VIDEO_WINDOW_MS = 14 * 24 * 60 * 60_000;

/** Last "Order this" tap on a Hype video / drop — matched to the next order at that restaurant. */
export type HypeOrderIntent = { itemId: string; restaurantId: string; at: number };
export const HYPE_ORDER_INTENT_TTL_MS = 3 * 60 * 60_000;

type Persisted = {
  lastSeenAt: string | null;
  watched: string[];
  orderIntent?: HypeOrderIntent | null;
  /** Watch screen: play the next video automatically (YouTube-style toggle, on by default). */
  autoplay?: boolean;
};

type HypeSeenState = Persisted & {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  markSeen: (latestAt: string | null | undefined) => void;
  markWatched: (videoId: string) => void;
  setOrderIntent: (intent: HypeOrderIntent | null) => void;
  /** Returns the intent for this restaurant (if still fresh) and clears it. */
  takeOrderIntent: (restaurantId: string) => HypeOrderIntent | null;
  setAutoplay: (on: boolean) => void;
};

function persist(state: Persisted) {
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => undefined);
}

function snapshot(state: Persisted): Persisted {
  return { lastSeenAt: state.lastSeenAt, watched: state.watched, orderIntent: state.orderIntent ?? null, autoplay: state.autoplay !== false };
}

export const useHypeSeenStore = create<HypeSeenState>((set, get) => ({
  lastSeenAt: null,
  watched: [],
  orderIntent: null,
  autoplay: true,
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as Partial<Persisted>) : {};
      set({
        lastSeenAt: typeof parsed.lastSeenAt === "string" ? parsed.lastSeenAt : null,
        watched: Array.isArray(parsed.watched) ? parsed.watched.slice(-MAX_WATCHED) : [],
        orderIntent: parsed.orderIntent ?? null,
        autoplay: parsed.autoplay !== false,
        hydrated: true,
      });
    } catch {
      set({ hydrated: true });
    }
  },
  markSeen: (latestAt) => {
    if (!latestAt) return;
    const current = get().lastSeenAt;
    if (current && Date.parse(current) >= Date.parse(latestAt)) return;
    set({ lastSeenAt: latestAt });
    persist(snapshot(get()));
  },
  markWatched: (videoId) => {
    if (!videoId || get().watched.includes(videoId)) return;
    const watched = [...get().watched, videoId].slice(-MAX_WATCHED);
    set({ watched });
    persist(snapshot(get()));
  },
  setOrderIntent: (intent) => {
    set({ orderIntent: intent });
    persist(snapshot(get()));
  },
  takeOrderIntent: (restaurantId) => {
    const intent = get().orderIntent;
    if (!intent) return null;
    const fresh = Date.now() - intent.at < HYPE_ORDER_INTENT_TTL_MS;
    if (!fresh || intent.restaurantId !== restaurantId) {
      if (!fresh) get().setOrderIntent(null);
      return null;
    }
    get().setOrderIntent(null);
    return intent;
  },
  setAutoplay: (on) => {
    set({ autoplay: on });
    persist(snapshot(get()));
  },
}));

/** True when there is Hype content newer than what this phone has seen. */
export function hasUnseenHype(latestAt: string | null | undefined, lastSeenAt: string | null) {
  if (!latestAt) return false;
  if (!lastSeenAt) return true;
  return Date.parse(latestAt) > Date.parse(lastSeenAt);
}

/** "New" dot on a video: published recently and not played on this phone yet. */
export function isNewVideo(createdAt: string | null | undefined, videoId: string, watched: string[], now = Date.now()) {
  if (!createdAt) return false;
  const at = Date.parse(createdAt);
  return Number.isFinite(at) && now - at < NEW_VIDEO_WINDOW_MS && !watched.includes(videoId);
}
