// Rider ↔ customer order chat (rider side): types + pure cache helpers.
// Mirrors customer-app/src/lib/order-chat.ts (keep the two in sync).

export type ChatRole = "customer" | "rider";

export type OrderChatMessage = {
  id: string;
  orderId: string;
  senderRole: ChatRole;
  text: string;
  createdAt: string;
  readAt: string | null;
  clientMessageId: string;
  pending?: boolean;
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

// One-tap replies riders actually need on the road (Bangla-first app).
export const RIDER_QUICK_REPLIES = {
  bn: [
    "আমি পৌঁছে গেছি",
    "৫ মিনিটের মধ্যে আসছি",
    "লোকেশন খুঁজে পাচ্ছি না, একটু বলবেন?",
    "নিচে আসবেন প্লিজ",
    "অর্ডার পিকআপ করেছি, আসছি",
  ],
  en: [
    "I've arrived",
    "Coming in 5 minutes",
    "I can't find the location, can you guide me?",
    "Please come down",
    "Picked up your order, on my way",
  ],
} as const;

function sameMessage(left: OrderChatMessage, right: OrderChatMessage) {
  if (left.id && right.id && left.id === right.id) return true;
  return Boolean(
    left.clientMessageId &&
      right.clientMessageId &&
      left.clientMessageId === right.clientMessageId &&
      left.senderRole === right.senderRole,
  );
}

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

let openChatOrderId = "";
export function setOpenChatOrderId(orderId: string) {
  openChatOrderId = orderId;
}
export function getOpenChatOrderId() {
  return openChatOrderId;
}

export function makeClientMessageId() {
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
