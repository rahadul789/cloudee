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

export const useNetworkStore = create<NetworkStore>((set) => ({
  status: "online",
  isOnline: true,
  isConnected: null,
  isInternetReachable: null,
  message: "",
  setOnline: (isOnline) =>
    set((state) =>
      state.isOnline === isOnline
        ? state
        : {
            isOnline,
            status: isOnline ? "online" : "offline",
            message: isOnline ? "" : "You appear to be offline. Reconnect and try again.",
          },
    ),
  markSlow: (message = "Connection is taking longer than usual. We are still trying.") =>
    set((state) =>
      state.status === "offline" || state.status === "server"
        ? state
        : {
            status: "slow",
            isOnline: true,
            message,
          },
    ),
  markOffline: (message = "You appear to be offline. Reconnect and try again.") =>
    set({
      status: "offline",
      isOnline: false,
      message,
    }),
  markServerIssue: (
    message = "Unable to reach Foodbela server. Please check the backend URL or try again.",
  ) =>
    set({
      status: "server",
      isOnline: true,
      message,
    }),
  markOnline: () =>
    set({
      status: "online",
      isOnline: true,
      message: "",
    }),
  setNetworkState: ({ isConnected, isInternetReachable }) => {
    const isOnline = Boolean(isConnected) && isInternetReachable !== false;
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
