import { QueryClient } from "@tanstack/react-query";

import { ApiRequestError } from "@/src/lib/api";
import { useNetworkStore } from "@/src/store/network-store";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) => {
        if (!useNetworkStore.getState().isOnline) {
          return false;
        }
        if (
          error instanceof ApiRequestError &&
          typeof error.status === "number" &&
          error.status >= 400 &&
          error.status < 500
        ) {
          return false;
        }
        return failureCount < 1;
      },
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
    },
  },
});
