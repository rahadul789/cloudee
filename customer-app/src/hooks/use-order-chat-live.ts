import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { orderChatKey } from "@/src/hooks/use-order-chat";
import { getFreshCustomerAccessToken } from "@/src/lib/api";
import {
  applyChatRead,
  upsertChatMessage,
  type ChatRole,
  type OrderChatMessage,
  type OrderChatThread,
} from "@/src/lib/order-chat";
import { connectCustomerSocket, getCustomerSocket } from "@/src/lib/socket-client";
import { useCustomerAuthStore } from "@/src/store/auth-store";

// Keeps an OPEN chat screen live on its own, independent of the app-wide socket bridge:
//  • listens for this order's messages/read receipts directly on the socket,
//  • makes sure the socket is connected (and joined) while the chat is open,
//  • refetches the thread after every (re)connect so nothing sent during a drop is missed.
// Returns whether the socket is live, so the screen can fall back to fast polling when not.
export function useOrderChatLive(orderId: string | undefined, active: boolean) {
  const queryClient = useQueryClient();
  const customerId = useCustomerAuthStore((state) => state.customer?.id ?? "");
  const [isLive, setIsLive] = useState(() => getCustomerSocket().connected);

  useEffect(() => {
    if (!orderId || !active || !customerId) return;
    const socket = getCustomerSocket();
    const key = orderChatKey(orderId);

    const handleConnect = () => {
      setIsLive(true);
      socket.emit("customer:join", customerId);
      void queryClient.invalidateQueries({ queryKey: key });
    };
    const handleDisconnect = () => setIsLive(false);
    const handleMessage = (event: { orderId?: string; message?: OrderChatMessage }) => {
      if (event?.orderId !== orderId || !event.message) return;
      queryClient.setQueryData<OrderChatThread>(key, (thread) =>
        thread ? upsertChatMessage(thread, event.message as OrderChatMessage, "customer") : thread,
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
      socket.emit("customer:join", customerId);
    } else {
      void getFreshCustomerAccessToken().then((token) => {
        if (token) connectCustomerSocket(customerId, token);
      });
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("order.chat.message", handleMessage);
      socket.off("order.chat.read", handleRead);
    };
  }, [active, customerId, orderId, queryClient]);

  return isLive;
}
