import {
  applyChatRead,
  markAllIncomingRead,
  upsertChatMessage,
  type OrderChatMessage,
  type OrderChatThread,
} from "./order-chat";

const thread = (messages: OrderChatMessage[] = [], unreadCount = 0): OrderChatThread => ({
  orderId: "o1",
  orderNumber: "100",
  status: "PickedUp",
  canSend: true,
  closedReason: null,
  counterpart: { role: "rider", name: "Rafi" },
  messages,
  unreadCount,
});
const msg = (over: Partial<OrderChatMessage>): OrderChatMessage => ({
  id: "",
  orderId: "o1",
  senderRole: "customer",
  text: "hi",
  createdAt: "2026-11-08T10:00:00.000Z",
  readAt: null,
  clientMessageId: "",
  ...over,
});

describe("order chat cache helpers", () => {
  it("replaces an optimistic message with the server copy (no duplicate)", () => {
    const optimistic = msg({ clientMessageId: "c1", pending: true });
    const confirmed = msg({ id: "m1", clientMessageId: "c1" });
    const next = upsertChatMessage(thread([optimistic]), confirmed, "customer");
    expect(next.messages).toHaveLength(1);
    expect(next.messages[0].id).toBe("m1");
    expect(next.messages[0].pending).toBe(false);
  });

  it("counts an incoming rider message as unread and keeps time order", () => {
    const early = msg({ id: "m1", createdAt: "2026-11-08T10:00:00.000Z" });
    const incoming = msg({ id: "m0", senderRole: "rider", createdAt: "2026-11-08T09:59:00.000Z" });
    const next = upsertChatMessage(thread([early]), incoming, "customer");
    expect(next.unreadCount).toBe(1);
    expect(next.messages.map((m) => m.id)).toEqual(["m0", "m1"]);
  });

  it("ignores a socket echo of a message we already have", () => {
    const existing = msg({ id: "m1", senderRole: "rider" });
    const next = upsertChatMessage(thread([existing], 1), existing, "customer");
    expect(next.messages).toHaveLength(1);
    expect(next.unreadCount).toBe(1);
  });

  it("stamps read receipts on our own messages when the rider reads", () => {
    const mine = msg({ id: "m1" });
    const next = applyChatRead(thread([mine]), "rider", "2026-11-08T10:05:00.000Z");
    expect(next.messages[0].readAt).toBe("2026-11-08T10:05:00.000Z");
  });

  it("clears unread when the viewer opens the chat", () => {
    const incoming = msg({ id: "m1", senderRole: "rider" });
    const next = markAllIncomingRead(thread([incoming], 1), "customer");
    expect(next.unreadCount).toBe(0);
    expect(next.messages[0].readAt).not.toBeNull();
  });
});
