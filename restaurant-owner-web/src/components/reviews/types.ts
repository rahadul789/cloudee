export type ReviewSource = "App" | "Web"
export type ReviewStatus = "new" | "replied" | "flagged"
export type ReviewDatePreset =
  | "today"
  | "yesterday"
  | "last7Days"
  | "last30Days"
  | "last90Days"
  | "thisMonth"
  | "lastMonth"
  | "lifetime"
  | "custom"

export type ReviewUser = {
  name: string
  isAnonymous: boolean
}

export type ReviewOrderInfo = {
  id: string
  orderNumber: string
  items: string[]
}

export type ReviewReply = {
  message: string
  createdAt: string
  updatedAt?: string | null
}

export type Review = {
  id: string
  rating: 1 | 2 | 3 | 4 | 5
  comment: string
  createdAt: string
  user: ReviewUser
  orderInfo?: ReviewOrderInfo | null
  source: ReviewSource
  reply?: ReviewReply | null
  status: ReviewStatus
}

export function getInitialReviews(): Review[] {
  return [
    {
      id: "review-01",
      rating: 5,
      comment:
        "Burger was hot, fries stayed crispy, and delivery was faster than expected.",
      createdAt: "2026-04-11T07:25:00.000Z",
      user: { name: "Nusrat Jahan", isAnonymous: false },
      orderInfo: {
        id: "order-01",
        orderNumber: "FB-2401",
        items: ["Classic Chicken Burger", "Coke"],
      },
      source: "App",
      reply: null,
      status: "new",
    },
    {
      id: "review-02",
      rating: 4,
      comment:
        "Combo was good overall. Please keep sauces inside the bag next time.",
      createdAt: "2026-04-10T18:10:00.000Z",
      user: { name: "Fahim Rahman", isAnonymous: false },
      orderInfo: {
        id: "order-02",
        orderNumber: "FB-2402",
        items: ["Beef Burger"],
      },
      source: "Web",
      reply: {
        message:
          "Thanks for the feedback. We have already reminded the packing team.",
        createdAt: "2026-04-10T18:42:00.000Z",
        updatedAt: null,
      },
      status: "replied",
    },
    {
      id: "review-03",
      rating: 2,
      comment:
        "Food tasted okay but the rider was late and the drink arrived warm.",
      createdAt: "2026-04-10T14:20:00.000Z",
      user: { name: "Anonymous", isAnonymous: true },
      orderInfo: {
        id: "order-03",
        orderNumber: "FB-2403",
        items: ["Zinger Combo"],
      },
      source: "App",
      reply: null,
      status: "flagged",
    },
    {
      id: "review-04",
      rating: 5,
      comment: "",
      createdAt: "2026-04-09T20:12:00.000Z",
      user: { name: "Imran Hossain", isAnonymous: false },
      orderInfo: {
        id: "order-04",
        orderNumber: "FB-2404",
        items: ["Classic Chicken Burger", "French Fries"],
      },
      source: "App",
      reply: null,
      status: "new",
    },
    {
      id: "review-05",
      rating: 3,
      comment:
        "Packing was neat but fries were a little salty for me.",
      createdAt: "2026-04-08T12:30:00.000Z",
      user: { name: "Rafsan Chowdhury", isAnonymous: false },
      orderInfo: {
        id: "order-05",
        orderNumber: "FB-2405",
        items: ["Beef Burger"],
      },
      source: "Web",
      reply: {
        message:
          "Appreciate the honest note. We will share this with the kitchen team.",
        createdAt: "2026-04-08T13:05:00.000Z",
        updatedAt: "2026-04-08T13:18:00.000Z",
      },
      status: "replied",
    },
    {
      id: "review-06",
      rating: 4,
      comment:
        "Delivery was smooth and burger portion was satisfying.",
      createdAt: "2026-04-07T19:45:00.000Z",
      user: { name: "Tania Sultana", isAnonymous: false },
      orderInfo: {
        id: "order-06",
        orderNumber: "FB-2399",
        items: ["Zinger Combo"],
      },
      source: "App",
      reply: null,
      status: "new",
    },
    {
      id: "review-07",
      rating: 1,
      comment:
        "Very disappointing experience today. The item was missing from the order.",
      createdAt: "2026-04-06T17:18:00.000Z",
      user: { name: "Maisha Noor", isAnonymous: false },
      orderInfo: {
        id: "order-07",
        orderNumber: "FB-2398",
        items: ["Classic Chicken Burger"],
      },
      source: "Web",
      reply: null,
      status: "flagged",
    },
    {
      id: "review-08",
      rating: 5,
      comment: "Loved it.",
      createdAt: "2026-04-05T21:02:00.000Z",
      user: { name: "Tahsin Ahmed", isAnonymous: false },
      orderInfo: null,
      source: "App",
      reply: {
        message: "Thank you for the support. Hope to serve you again soon.",
        createdAt: "2026-04-05T21:24:00.000Z",
        updatedAt: null,
      },
      status: "replied",
    },
  ]
}
