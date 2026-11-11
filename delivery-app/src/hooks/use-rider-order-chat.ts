import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiGet, apiPost } from "@/src/lib/api";
import {
  makeClientMessageId,
  markAllIncomingRead,
  upsertChatMessage,
  type OrderChatMessage,
  type OrderChatThread,
} from "@/src/lib/order-chat";

export const riderOrderChatKey = (orderId?: string) => ["rider", "order-chat", orderId ?? ""] as const;

export function useRiderOrderChatQuery(
  orderId?: string,
  enabled = true,
  pollMs: number | false = false,
) {
  return useQuery({
    queryKey: riderOrderChatKey(orderId),
    enabled: Boolean(orderId) && enabled,
    staleTime: 15_000,
    // Socket keeps it live; the poll is only a fallback while the chat screen is open.
    refetchInterval: pollMs,
    queryFn: async () => {
      const response = await apiGet<OrderChatThread>(`/rider/orders/${orderId}/chat`);
      return response.data;
    },
  });
}

export function useRiderSendOrderChatMutation(orderId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { text: string; clientMessageId: string }) => {
      const response = await apiPost<OrderChatMessage>(`/rider/orders/${orderId}/chat`, input);
      return response.data;
    },
    onMutate: (input) => {
      queryClient.setQueryData<OrderChatThread>(riderOrderChatKey(orderId), (thread) =>
        thread
          ? upsertChatMessage(
              thread,
              {
                id: "",
                orderId: orderId ?? "",
                senderRole: "rider",
                text: input.text,
                createdAt: new Date().toISOString(),
                readAt: null,
                clientMessageId: input.clientMessageId,
                pending: true,
              },
              "rider",
            )
          : thread,
      );
    },
    onSuccess: (message) => {
      queryClient.setQueryData<OrderChatThread>(riderOrderChatKey(orderId), (thread) =>
        thread ? upsertChatMessage(thread, message, "rider") : thread,
      );
    },
    onError: (_error, input) => {
      queryClient.setQueryData<OrderChatThread>(riderOrderChatKey(orderId), (thread) =>
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

export function useRiderMarkOrderChatReadMutation(orderId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await apiPost(`/rider/orders/${orderId}/chat/read`);
    },
    onMutate: () => {
      queryClient.setQueryData<OrderChatThread>(riderOrderChatKey(orderId), (thread) =>
        thread ? markAllIncomingRead(thread, "rider") : thread,
      );
    },
  });
}

export { makeClientMessageId };
