import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiProtectedGet, apiProtectedPost } from "@/src/lib/api";
import {
  makeClientMessageId,
  markAllIncomingRead,
  upsertChatMessage,
  type OrderChatMessage,
  type OrderChatThread,
} from "@/src/lib/order-chat";
import { useCustomerAuthStore } from "@/src/store/auth-store";

export const orderChatKey = (orderId?: string) => ["customer", "order-chat", orderId ?? ""] as const;

// Thread + unread count. Live updates arrive over the socket (see use-customer-socket); the
// slow poll is only a safety net if the socket drops while the chat is open.
export function useCustomerOrderChatQuery(orderId?: string, enabled = true, pollMs: number | false = false) {
  const isAuthenticated = useCustomerAuthStore((state) => Boolean(state.accessToken));
  return useQuery({
    queryKey: orderChatKey(orderId),
    enabled: Boolean(orderId) && enabled && isAuthenticated,
    staleTime: 15_000,
    // The chat screen passes a short interval when the socket is down (see chat.tsx).
    refetchInterval: enabled ? pollMs : false,
    queryFn: async () => {
      const response = await apiProtectedGet<OrderChatThread>(`/customer/orders/${orderId}/chat`);
      return response.data;
    },
  });
}

export function useCustomerSendOrderChatMutation(orderId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { text: string; clientMessageId: string }) => {
      const response = await apiProtectedPost<OrderChatMessage>(
        `/customer/orders/${orderId}/chat`,
        input,
      );
      return response.data;
    },
    // Optimistic bubble so the chat feels instant; replaced by the server copy on success.
    onMutate: (input) => {
      queryClient.setQueryData<OrderChatThread>(orderChatKey(orderId), (thread) =>
        thread
          ? upsertChatMessage(
              thread,
              {
                id: "",
                orderId: orderId ?? "",
                senderRole: "customer",
                text: input.text,
                createdAt: new Date().toISOString(),
                readAt: null,
                clientMessageId: input.clientMessageId,
                pending: true,
              },
              "customer",
            )
          : thread,
      );
    },
    onSuccess: (message) => {
      queryClient.setQueryData<OrderChatThread>(orderChatKey(orderId), (thread) =>
        thread ? upsertChatMessage(thread, message, "customer") : thread,
      );
    },
    onError: (_error, input) => {
      queryClient.setQueryData<OrderChatThread>(orderChatKey(orderId), (thread) =>
        thread
          ? {
              ...thread,
              messages: thread.messages.map((message) =>
                message.clientMessageId === input.clientMessageId
                  ? { ...message, pending: false, failed: true }
                  : message,
              ),
            }
          : thread,
      );
    },
  });
}

export function useCustomerMarkOrderChatReadMutation(orderId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await apiProtectedPost(`/customer/orders/${orderId}/chat/read`);
    },
    onMutate: () => {
      queryClient.setQueryData<OrderChatThread>(orderChatKey(orderId), (thread) =>
        thread ? markAllIncomingRead(thread, "customer") : thread,
      );
    },
  });
}

export { makeClientMessageId };
