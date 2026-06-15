import NetInfo from "@react-native-community/netinfo";
import { onlineManager } from "@tanstack/react-query";
import { useEffect } from "react";

import { useNetworkStore } from "@/src/store/network-store";

export function NetworkStateBridge() {
  useEffect(() => {
    let isMounted = true;
    const setNetworkState = useNetworkStore.getState().setNetworkState;

    const syncState = (state: {
      isConnected: boolean | null;
      isInternetReachable: boolean | null;
    }) => {
      const isOnline = Boolean(state.isConnected) && state.isInternetReachable !== false;
      onlineManager.setOnline(isOnline);

      if (isMounted) {
        setNetworkState(state);
      }
    };

    const unsubscribe = NetInfo.addEventListener((state) => {
      syncState({
        isConnected: state.isConnected,
        isInternetReachable: state.isInternetReachable,
      });
    });

    void NetInfo.fetch().then((state) => {
      syncState({
        isConnected: state.isConnected,
        isInternetReachable: state.isInternetReachable,
      });
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  return null;
}
