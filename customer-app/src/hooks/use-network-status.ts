import { useNetworkStore } from "@/src/store/network-store";

export function useIsOnline() {
  return useNetworkStore((state) => state.isOnline);
}
