import { create } from "zustand";

type AppBannerTone = "info" | "success" | "warning";

export type AppBanner = {
  id: string;
  title: string;
  description: string;
  tone: AppBannerTone;
  emoji?: string;
  path?: string;
  actionLabel?: string;
  dedupeKey?: string;
};

type AppBannerStore = {
  banner: AppBanner | null;
  lastDedupeKey: string;
  lastShownAt: number;
  showBanner: (banner: Omit<AppBanner, "id">) => void;
  dismissBanner: () => void;
};

const createBannerId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const useAppBannerStore = create<AppBannerStore>((set) => ({
  banner: null,
  lastDedupeKey: "",
  lastShownAt: 0,
  showBanner: (banner) =>
    set((state) => {
      const now = Date.now();
      const dedupeKey =
        banner.dedupeKey ??
        `${banner.tone}:${banner.title}:${banner.description}:${banner.path ?? ""}`;
      if (state.lastDedupeKey === dedupeKey && now - state.lastShownAt < 8000) {
        return state;
      }

      return {
        banner: {
          id: createBannerId(),
          ...banner,
          dedupeKey,
        },
        lastDedupeKey: dedupeKey,
        lastShownAt: now,
      };
    }),
  dismissBanner: () => set({ banner: null }),
}));
