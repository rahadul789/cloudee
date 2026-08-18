import {
  dedupeAdminNotificationItems,
  shouldLoadAdminRecipientSource,
} from "../src/modules/admin/admin-notification-feed";

describe("admin notification feed", () => {
  it("keeps recipient-owned notifications out of the default admin inbox", () => {
    expect(shouldLoadAdminRecipientSource({}, "customer")).toBe(false);
    expect(shouldLoadAdminRecipientSource({ source: "all", kind: "all" }, "owner")).toBe(
      false,
    );
    expect(shouldLoadAdminRecipientSource({ source: "all" }, "rider")).toBe(false);
  });

  it("loads recipient history only when an admin explicitly requests it", () => {
    expect(
      shouldLoadAdminRecipientSource({ kind: "notifications" }, "customer"),
    ).toBe(true);
    expect(shouldLoadAdminRecipientSource({ source: "owner" }, "owner")).toBe(true);
    expect(shouldLoadAdminRecipientSource({ source: "owner" }, "rider")).toBe(false);
    expect(
      shouldLoadAdminRecipientSource({ recipientType: "riders" }, "rider"),
    ).toBe(true);
    expect(
      shouldLoadAdminRecipientSource({ recipientType: "riders" }, "customer"),
    ).toBe(false);
  });

  it("collapses translated owner copies of the same business event", () => {
    const items = dedupeAdminNotificationItems([
      {
        id: "english-copy",
        source: "owner",
        recipientId: "owner-1",
        eventType: "order.prep_start_late",
        entityId: "order-1",
        title: "Preparation is late",
        createdAt: "2026-08-17T10:00:00.000Z",
      },
      {
        id: "bangla-copy",
        source: "owner",
        recipientId: "owner-1",
        eventType: "order.prep_start_late",
        entityId: "order-1",
        title: "প্রস্তুতিতে দেরি হচ্ছে",
        createdAt: "2026-08-17T10:00:01.000Z",
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("bangla-copy");
  });

  it("prefers the admin alert over a translated recipient copy", () => {
    const items = dedupeAdminNotificationItems([
      {
        id: "owner-copy",
        source: "owner",
        recipientId: "owner-1",
        eventType: "order.owner_response_late",
        entityType: "order",
        entityId: "order-1",
        title: "রেস্তোরাঁর উত্তর প্রয়োজন",
        createdAt: "2026-08-17T10:00:01.000Z",
      },
      {
        id: "admin-alert",
        source: "ops",
        type: "owner_response_late",
        entityType: "order",
        entityId: "order-1",
        title: "Restaurant response is late",
        metadata: { orderNumber: "FB-1" },
        createdAt: "2026-08-17T10:00:00.000Z",
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("admin-alert");
  });

  it("keeps one detailed record for the same campaign", () => {
    const items = dedupeAdminNotificationItems([
      {
        id: "campaign-1",
        campaignId: "campaign-1",
        source: "campaign",
        deliveryStatus: "campaign",
        createdAt: "2026-08-17T10:00:01.000Z",
      },
      {
        id: "campaign-1",
        campaignId: "campaign-1",
        source: "scheduled",
        deliveryStatus: "sent",
        scheduledAt: "2026-08-17T09:59:00.000Z",
        sentAt: "2026-08-17T10:00:00.000Z",
        createdAt: "2026-08-17T10:00:00.000Z",
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]?.source).toBe("scheduled");
  });
});
