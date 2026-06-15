export type AppNotificationType =
  | "new-order"
  | "order-update"
  | "payout"
  | "promotion"
  | "support"
  | "review"
  | "system"

export type AppNotification = {
  id: string
  type: AppNotificationType
  eventType?: string
  entityType?: "order" | "payout" | "promotion" | "review" | "support_case" | "system"
  entityId?: string
  title: string
  description: string
  createdAt: string
  read: boolean
  actionPath?: string
}

export const initialNotifications: AppNotification[] = [
  {
    id: "notif-01",
    type: "new-order",
    title: "New order received",
    description: "FB-2401 is waiting for confirmation.",
    createdAt: "2026-04-10T08:05:00.000Z",
    read: false,
    eventType: "order.created",
    entityType: "order",
    entityId: "order-01",
    actionPath: "/orders?order=order-01",
  },
  {
    id: "notif-02",
    type: "review",
    title: "New customer review",
    description: "A customer left a 4-star review for Meet Point.",
    createdAt: "2026-04-10T07:15:00.000Z",
    read: false,
    eventType: "review.created",
    entityType: "review",
    entityId: "review-02",
    actionPath: "/reviews?review=review-02",
  },
  {
    id: "notif-03",
    type: "system",
    title: "Store opened successfully",
    description: "Your restaurant is currently visible to Foodbela customers.",
    createdAt: "2026-04-10T06:50:00.000Z",
    read: true,
    eventType: "store.opened",
    entityType: "system",
    entityId: "store-runtime",
    actionPath: "/",
  },
  {
    id: "notif-04",
    type: "payout",
    title: "Payout completed",
    description: "Your latest bKash payout of 12,850tk has been completed.",
    createdAt: "2026-04-09T11:20:00.000Z",
    read: false,
    eventType: "payout.completed",
    entityType: "payout",
    entityId: "payout-02",
    actionPath: "/payouts",
  },
  {
    id: "notif-05",
    type: "promotion",
    title: "Admin voucher activated",
    description: "A platform-funded free delivery voucher is now live for your store.",
    createdAt: "2026-04-08T15:10:00.000Z",
    read: true,
    eventType: "voucher.activated",
    entityType: "promotion",
    entityId: "voucher-03",
    actionPath: "/promotions",
  },
  {
    id: "notif-06",
    type: "support",
    title: "Support replied to your report",
    description: "Your latest report has been updated by the Foodbela support team.",
    createdAt: "2026-04-07T13:45:00.000Z",
    read: true,
    eventType: "support.updated",
    entityType: "support_case",
    entityId: "SUP-1043",
    actionPath: "/support",
  },
]
