// Rider ↔ customer order chat: shared types + pure cache helpers (unit-tested).

export type ChatRole = "customer" | "rider";

export type OrderChatMessage = {
  id: string;
  orderId: string;
  senderRole: ChatRole;
  text: string;
  createdAt: string;
  readAt: string | null;
  clientMessageId: string;
  /** Client-only: optimistic message not yet confirmed by the server. */
  pending?: boolean;
  /** Client-only: send failed (tap to retry). */
  failed?: boolean;
};

export type OrderChatThread = {
  orderId: string;
  orderNumber: string;
  status: string;
  canSend: boolean;
  closedReason: "no_rider" | "order_finished" | null;
  counterpart: { role: ChatRole; name: string };
  messages: OrderChatMessage[];
  unreadCount: number;
};

export const CUSTOMER_QUICK_REPLIES = [
  "Please call me when you arrive",
  "I'm coming down",
  "Leave it at the gate",
  "Where are you now?",
  "Thank you!",
] as const;

function sameMessage(left: OrderChatMessage, right: OrderChatMessage) {
  if (left.id && right.id && left.id === right.id) return true;
  return Boolean(
    left.clientMessageId &&
      right.clientMessageId &&
      left.clientMessageId === right.clientMessageId &&
      left.senderRole === right.senderRole,
  );
}

/** Insert or replace a message (socket echo, optimistic confirm), keeping time order. */
export function upsertChatMessage(
  thread: OrderChatThread,
  message: OrderChatMessage,
  viewerRole: ChatRole,
): OrderChatThread {
  const index = thread.messages.findIndex((existing) => sameMessage(existing, message));
  if (index >= 0) {
    const messages = [...thread.messages];
    messages[index] = { ...messages[index], ...message, pending: false, failed: false };
    return { ...thread, messages };
  }
  const messages = [...thread.messages, message].sort(
    (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt),
  );
  const incomingUnread = message.senderRole !== viewerRole && !message.readAt ? 1 : 0;
  return { ...thread, messages, unreadCount: thread.unreadCount + incomingUnread };
}

/** The other side read our messages → stamp readAt on everything we sent. */
export function applyChatRead(
  thread: OrderChatThread,
  readerRole: ChatRole,
  readAt: string,
): OrderChatThread {
  return {
    ...thread,
    messages: thread.messages.map((message) =>
      message.senderRole !== readerRole && !message.readAt ? { ...message, readAt } : message,
    ),
    unreadCount: readerRole === thread.counterpart.role ? thread.unreadCount : 0,
  };
}

export function markAllIncomingRead(thread: OrderChatThread, viewerRole: ChatRole) {
  const now = new Date().toISOString();
  return {
    ...thread,
    unreadCount: 0,
    messages: thread.messages.map((message) =>
      message.senderRole !== viewerRole && !message.readAt ? { ...message, readAt: now } : message,
    ),
  };
}

export function makeClientMessageId() {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
