import { create } from "zustand";

type NetworkState = {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  isOnline: boolean;
  lastChangedAt: number | null;
  setNetworkState: (params: {
    isConnected: boolean | null;
    isInternetReachable: boolean | null;
  }) => void;
};

export const useNetworkStore = create<NetworkState>((set) => ({
  isConnected: null,
  isInternetReachable: null,
  isOnline: true,
  lastChangedAt: null,
  setNetworkState: ({ isConnected, isInternetReachable }) =>
    set((state) => {
      const nextIsOnline =
        Boolean(isConnected) && isInternetReachable !== false;

      if (
        state.isConnected === isConnected &&
        state.isInternetReachable === isInternetReachable &&
        state.isOnline === nextIsOnline
      ) {
        return state;
      }

      return {
        isConnected,
        isInternetReachable,
        isOnline: nextIsOnline,
        lastChangedAt: Date.now(),
      };
    }),
}));
