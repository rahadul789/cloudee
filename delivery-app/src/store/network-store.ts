import { create } from "zustand";

type NetworkStore = {
  status: "online" | "slow" | "offline" | "server";
  isOnline: boolean;
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  message: string;
  setOnline: (isOnline: boolean) => void;
  markSlow: (message?: string) => void;
  markOffline: (message?: string) => void;
  markServerIssue: (message?: string) => void;
  markOnline: () => void;
  setNetworkState: (state: {
    isConnected: boolean | null;
    isInternetReachable: boolean | null;
  }) => void;
};

// Transient problem states (slow / server) must PERSIST this long before the bar shows
// them, and any recovery cancels the pending change. This stops the status bar from
// blinking on momentary per-request churn — a slow request that immediately recovers
// never flips the UI.
const TRANSIENT_DEBOUNCE_MS = 2500;
let pendingTransientTimer: ReturnType<typeof setTimeout> | null = null;
function cancelPendingTransient() {
  if (pendingTransientTimer) {
    clearTimeout(pendingTransientTimer);
    pendingTransientTimer = null;
  }
}

export const useNetworkStore = create<NetworkStore>((set, get) => ({
  status: "online",
  isOnline: true,
  isConnected: null,
  isInternetReachable: null,
  message: "",
  setOnline: (isOnline) => {
    if (isOnline) cancelPendingTransient();
    set((state) =>
      state.isOnline === isOnline
        ? state
        : {
            isOnline,
            status: isOnline ? "online" : "offline",
            message: isOnline ? "" : "You appear to be offline. Reconnect and try again.",
          },
    );
  },
  markSlow: (message = "Connection is taking longer than usual. We are still trying.") => {
    const status = get().status;
    if (status === "offline" || status === "server" || status === "slow") return;
    if (pendingTransientTimer) return;
    pendingTransientTimer = setTimeout(() => {
      pendingTransientTimer = null;
      const current = get().status;
      if (current === "offline" || current === "server") return;
      set({ status: "slow", isOnline: true, message });
    }, TRANSIENT_DEBOUNCE_MS);
  },
  markOffline: (message = "You appear to be offline. Reconnect and try again.") => {
    cancelPendingTransient();
    set({
      status: "offline",
      isOnline: false,
      message,
    });
  },
  markServerIssue: (
    message = "Unable to reach Foodbela server. Please check the backend URL or try again.",
  ) => {
    if (get().status === "server") return;
    cancelPendingTransient();
    pendingTransientTimer = setTimeout(() => {
      pendingTransientTimer = null;
      if (get().status === "offline") return;
      set({ status: "server", isOnline: true, message });
    }, TRANSIENT_DEBOUNCE_MS);
  },
  markOnline: () => {
    cancelPendingTransient();
    set({
      status: "online",
      isOnline: true,
      message: "",
    });
  },
  setNetworkState: ({ isConnected, isInternetReachable }) => {
    const isOnline = Boolean(isConnected) && isInternetReachable !== false;
    if (isOnline) cancelPendingTransient();
    set((state) => {
      if (!isOnline) {
        if (
          state.status === "offline" &&
          state.isOnline === false &&
          state.isConnected === isConnected &&
          state.isInternetReachable === isInternetReachable
        ) {
          return state;
        }

        return {
          status: "offline",
          isOnline: false,
          isConnected,
          isInternetReachable,
          message: "You appear to be offline. Reconnect and try again.",
        };
      }

      if (
        state.status === "server" ||
        state.status === "slow"
      ) {
        return {
          ...state,
          isOnline: true,
          isConnected,
          isInternetReachable,
        };
      }

      if (
        state.status === "online" &&
        state.isOnline === true &&
        state.isConnected === isConnected &&
        state.isInternetReachable === isInternetReachable
      ) {
        return state;
      }

      return {
        status: "online",
        isOnline: true,
        isConnected,
        isInternetReachable,
        message: "",
      };
    });
  },
}));

export function setDeliveryNetworkOnline(isOnline: boolean) {
  if (isOnline) {
    useNetworkStore.getState().markOnline();
    return;
  }

  useNetworkStore.getState().markOffline();
}
