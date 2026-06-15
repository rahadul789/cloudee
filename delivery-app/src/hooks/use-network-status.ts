import { useNetworkStore } from "@/src/store/network-store";

export function useNetworkStatus() {
  return useNetworkStore((state) => state.isOnline);
}
