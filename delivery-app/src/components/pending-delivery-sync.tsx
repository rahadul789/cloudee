import NetInfo from "@react-native-community/netinfo";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Alert, AppState } from "react-native";

import { apiPost } from "@/src/lib/api";
import { getCopy } from "@/src/lib/copy";
import {
  getPendingDeliveries,
  isRetryableDeliveryError,
  loadPendingDeliveries,
  removePendingDelivery,
} from "@/src/lib/pending-deliveries";

// Sends queued "Delivered" taps when the network returns: on reconnect, on app resume and
// every 20s while something is waiting. One send at a time; nothing runs when the queue is
// empty (no timers, no requests).
export function PendingDeliverySync() {
  const queryClient = useQueryClient();
  const sending = useRef(false);

  useEffect(() => {
    let alive = true;
    const flush = async () => {
      if (sending.current) return;
      await loadPendingDeliveries();
      const items = getPendingDeliveries();
      if (!items.length) return;
      sending.current = true;
      try {
        for (const item of items) {
          if (!alive) return;
          try {
            await apiPost(`/rider/orders/${item.orderId}/deliver`, item.code ? { code: item.code } : {});
            await removePendingDelivery(item.orderId);
            void queryClient.invalidateQueries({ queryKey: ["rider"] });
          } catch (error) {
            if (isRetryableDeliveryError(error)) return; // still offline → try again later
            // The server refused (e.g. wrong code). Tell the rider; don't keep retrying.
            await removePendingDelivery(item.orderId);
            void queryClient.invalidateQueries({ queryKey: ["rider"] });
            const t = getCopy().pendingDelivery;
            Alert.alert(t.failedTitle, error instanceof Error ? error.message : t.failedBody);
          }
        }
      } finally {
        sending.current = false;
      }
    };

    void flush();
    const net = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) void flush();
    });
    const app = AppState.addEventListener("change", (next) => {
      if (next === "active") void flush();
    });
    const timer = setInterval(() => {
      if (getPendingDeliveries().length && AppState.currentState === "active") void flush();
    }, 20_000);
    return () => {
      alive = false;
      net();
      app.remove();
      clearInterval(timer);
    };
  }, [queryClient]);

  return null;
}
