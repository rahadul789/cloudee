import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { riderOrderChatKey } from "@/src/hooks/use-rider-order-chat";
import { getFreshRiderAccessToken } from "@/src/lib/api";
import {
  applyChatRead,
  upsertChatMessage,
  type ChatRole,
  type OrderChatMessage,
  type OrderChatThread,
} from "@/src/lib/order-chat";
import { connectRiderSocket, getRiderSocket } from "@/src/lib/socket-client";
import { useRiderAuthStore } from "@/src/store/auth-store";

// Keeps an OPEN rider chat live on its own (direct socket listener, ensure-connected,
// refetch after every reconnect). Returns socket liveness for the polling fallback.
export function useRiderOrderChatLive(orderId: string | undefined, active: boolean) {
  const queryClient = useQueryClient();
  const riderId = useRiderAuthStore((state: { rider: { id?: string } | null }) => state.rider?.id ?? "");
  const [isLive, setIsLive] = useState(() => getRiderSocket().connected);

  useEffect(() => {
    if (!orderId || !active || !riderId) return;
    const socket = getRiderSocket();
    const key = riderOrderChatKey(orderId);

    const handleConnect = () => {
      setIsLive(true);
      socket.emit("rider:join", riderId);
      void queryClient.invalidateQueries({ queryKey: key });
    };
    const handleDisconnect = () => setIsLive(false);
    const handleMessage = (event: { orderId?: string; message?: OrderChatMessage }) => {
      if (event?.orderId !== orderId || !event.message) return;
      queryClient.setQueryData<OrderChatThread>(key, (thread) =>
        thread ? upsertChatMessage(thread, event.message as OrderChatMessage, "rider") : thread,
      );
    };
    const handleRead = (event: { orderId?: string; readerRole?: ChatRole; readAt?: string }) => {
      if (event?.orderId !== orderId || !event.readerRole || !event.readAt) return;
      queryClient.setQueryData<OrderChatThread>(key, (thread) =>
        thread ? applyChatRead(thread, event.readerRole as ChatRole, event.readAt as string) : thread,
      );
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("order.chat.message", handleMessage);
    socket.on("order.chat.read", handleRead);
    setIsLive(socket.connected);

    if (socket.connected) {
      socket.emit("rider:join", riderId);
    } else {
      void getFreshRiderAccessToken().then((token) => {
        if (token) connectRiderSocket(riderId, token);
      });
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("order.chat.message", handleMessage);
      socket.off("order.chat.read", handleRead);
    };
  }, [active, orderId, queryClient, riderId]);

  return isLive;
}
