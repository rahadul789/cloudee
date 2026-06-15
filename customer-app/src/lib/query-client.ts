import { QueryClient } from "@tanstack/react-query";

import { useNetworkStore } from "@/src/store/network-store";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (failureCount) => {
        if (!useNetworkStore.getState().isOnline) {
          return false;
        }
        return failureCount < 1;
      },
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
    },
  },
});
