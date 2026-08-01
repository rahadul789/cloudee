import type { Order } from "@/components/orders/types"

type OrderSeed = Omit<
  Order,
  | "restaurantSubtotal"
  | "ownerDiscountCost"
  | "platformDiscountCost"
  | "restaurantNetSales"
  | "customerPaidTotal"
  | "appliedVouchers"
  | "isUrgent"
> &
  Partial<
    Pick<
      Order,
      | "restaurantSubtotal"
      | "ownerDiscountCost"
      | "platformDiscountCost"
      | "restaurantNetSales"
      | "customerPaidTotal"
      | "appliedVouchers"
      | "isUrgent"
    >
  >

function withFinancialDefaults(order: OrderSeed): Order {
  const restaurantSubtotal = order.restaurantSubtotal ?? order.subtotal
  const ownerDiscountCost = order.ownerDiscountCost ?? order.discount
  const platformDiscountCost = order.platformDiscountCost ?? 0
  const restaurantNetSales =
    order.restaurantNetSales ??
    Math.max(0, restaurantSubtotal - ownerDiscountCost)
  const customerPaidTotal =
    order.customerPaidTotal ??
    Math.max(0, order.subtotal + order.deliveryFee - order.discount)

  return {
    ...order,
    restaurantSubtotal,
    ownerDiscountCost,
    platformDiscountCost,
    restaurantNetSales,
    customerPaidTotal,
    appliedVouchers: order.appliedVouchers ?? [],
    isUrgent: order.isUrgent ?? false,
  }
}

const initialOrderSeeds: OrderSeed[] = [
  {
    id: "order-01",
    orderNumber: "FB-2401",
    customer: {
      name: "Nusrat Jahan",
      phone: "01712345601",
      address: "House 12, Road 3, Dhanmondi, Dhaka",
    },
    rider: null,
    items: [
      { id: "line-01", name: "Classic Chicken Burger", quantity: 2, unitPrice: 220, addOns: [] },
      { id: "line-02", name: "Coke", quantity: 1, unitPrice: 50, addOns: [] },
    ],
    subtotal: 490,
    deliveryFee: 35,
    discount: 20,
    total: 505,
    paymentMethod: "Bkash",
    currentStatus: "New",
    kitchenNote: "Pack sauces separately.",
    timestamps: {
      placedAt: "2026-04-10T08:05:00.000Z",
      acceptedAt: null,
      preparingAt: null,
      readyForPickupAt: null,
      pickedUpAt: null,
      deliveredAt: null,
      rejectedAt: null,
      cancelledAt: null,
    },
    history: [{ id: "hist-01", status: "New", updatedAt: "2026-04-10T08:05:00.000Z", updatedBy: "customer" }],
  },
  {
    id: "order-02",
    orderNumber: "FB-2402",
    customer: {
      name: "Fahim Rahman",
      phone: "01712345602",
      address: "Block C, Bashundhara R/A, Dhaka",
    },
    rider: null,
    items: [
      {
        id: "line-03",
        name: "Beef Burger",
        quantity: 1,
        unitPrice: 320,
        variantLabel: "Medium",
        addOns: [{ id: "addon-01", name: "Cheese Slice", price: 30 }],
      },
    ],
    subtotal: 350,
    deliveryFee: 40,
    discount: 0,
    total: 390,
    paymentMethod: "Cash",
    currentStatus: "Accepted",
    kitchenNote: "",
    timestamps: {
      placedAt: "2026-04-10T07:58:00.000Z",
      acceptedAt: "2026-04-10T08:00:00.000Z",
      preparingAt: null,
      readyForPickupAt: null,
      pickedUpAt: null,
      deliveredAt: null,
      rejectedAt: null,
      cancelledAt: null,
    },
    history: [
      { id: "hist-02", status: "New", updatedAt: "2026-04-10T07:58:00.000Z", updatedBy: "customer" },
      { id: "hist-03", status: "Accepted", updatedAt: "2026-04-10T08:00:00.000Z", updatedBy: "owner" },
    ],
  },
  {
    id: "order-03",
    orderNumber: "FB-2403",
    customer: {
      name: "Sadia Islam",
      phone: "01712345603",
      address: "Mirpur DOHS, Dhaka",
    },
    rider: null,
    items: [
      {
        id: "line-04",
        name: "Zinger Combo",
        quantity: 1,
        unitPrice: 390,
        variantLabel: "Regular",
        addOns: [{ id: "addon-02", name: "Orange Juice", price: 30 }],
      },
    ],
    subtotal: 420,
    deliveryFee: 35,
    discount: 25,
    total: 430,
    paymentMethod: "Bkash",
    currentStatus: "Preparing",
    kitchenNote: "No onions in burger.",
    timestamps: {
      placedAt: "2026-04-10T07:35:00.000Z",
      acceptedAt: "2026-04-10T07:38:00.000Z",
      preparingAt: "2026-04-10T07:44:00.000Z",
      readyForPickupAt: null,
      pickedUpAt: null,
      deliveredAt: null,
      rejectedAt: null,
      cancelledAt: null,
    },
    history: [
      { id: "hist-04", status: "New", updatedAt: "2026-04-10T07:35:00.000Z", updatedBy: "customer" },
      { id: "hist-05", status: "Accepted", updatedAt: "2026-04-10T07:38:00.000Z", updatedBy: "owner" },
      { id: "hist-06", status: "Preparing", updatedAt: "2026-04-10T07:44:00.000Z", updatedBy: "owner" },
    ],
  },
  {
    id: "order-04",
    orderNumber: "FB-2404",
    customer: {
      name: "Imran Hossain",
      phone: "01712345604",
      address: "Aftabnagar, Dhaka",
    },
    rider: null,
    items: [
      { id: "line-05", name: "Classic Chicken Burger", quantity: 1, unitPrice: 220, addOns: [] },
      {
        id: "line-06",
        name: "French Fries",
        quantity: 1,
        unitPrice: 140,
        addOns: [{ id: "addon-03", name: "Peri Mayo", price: 25 }],
      },
    ],
    subtotal: 385,
    deliveryFee: 35,
    discount: 0,
    total: 420,
    paymentMethod: "Bkash",
    currentStatus: "ReadyForPickup",
    kitchenNote: "",
    timestamps: {
      placedAt: "2026-04-10T07:10:00.000Z",
      acceptedAt: "2026-04-10T07:12:00.000Z",
      preparingAt: "2026-04-10T07:18:00.000Z",
      readyForPickupAt: "2026-04-10T07:31:00.000Z",
      pickedUpAt: null,
      deliveredAt: null,
      rejectedAt: null,
      cancelledAt: null,
    },
    history: [
      { id: "hist-07", status: "New", updatedAt: "2026-04-10T07:10:00.000Z", updatedBy: "customer" },
      { id: "hist-08", status: "Accepted", updatedAt: "2026-04-10T07:12:00.000Z", updatedBy: "owner" },
      { id: "hist-09", status: "Preparing", updatedAt: "2026-04-10T07:18:00.000Z", updatedBy: "owner" },
      { id: "hist-10", status: "ReadyForPickup", updatedAt: "2026-04-10T07:31:00.000Z", updatedBy: "owner" },
    ],
  },
  {
    id: "order-05",
    orderNumber: "FB-2405",
    customer: {
      name: "Rafsan Chowdhury",
      phone: "01712345605",
      address: "Mohammadpur, Dhaka",
    },
    rider: { id: "rider-01", name: "Sohel Rana", phone: "01812345601" },
    items: [
      { id: "line-07", name: "Beef Burger", quantity: 2, unitPrice: 390, variantLabel: "Large", addOns: [] },
    ],
    subtotal: 780,
    deliveryFee: 45,
    discount: 50,
    total: 775,
    paymentMethod: "Bkash",
    currentStatus: "PickedUp",
    kitchenNote: "Extra tissue and forks.",
    timestamps: {
      placedAt: "2026-04-10T06:55:00.000Z",
      acceptedAt: "2026-04-10T06:58:00.000Z",
      preparingAt: "2026-04-10T07:04:00.000Z",
      readyForPickupAt: "2026-04-10T07:20:00.000Z",
      pickedUpAt: "2026-04-10T07:29:00.000Z",
      deliveredAt: null,
      rejectedAt: null,
      cancelledAt: null,
    },
    history: [
      { id: "hist-11", status: "New", updatedAt: "2026-04-10T06:55:00.000Z", updatedBy: "customer" },
      { id: "hist-12", status: "Accepted", updatedAt: "2026-04-10T06:58:00.000Z", updatedBy: "owner" },
      { id: "hist-13", status: "Preparing", updatedAt: "2026-04-10T07:04:00.000Z", updatedBy: "owner" },
      { id: "hist-14", status: "ReadyForPickup", updatedAt: "2026-04-10T07:20:00.000Z", updatedBy: "owner" },
      { id: "hist-15", status: "PickedUp", updatedAt: "2026-04-10T07:29:00.000Z", updatedBy: "rider" },
    ],
  },
  {
    id: "order-06",
    orderNumber: "FB-2399",
    customer: {
      name: "Tania Sultana",
      phone: "01712345606",
      address: "Banani, Dhaka",
    },
    rider: { id: "rider-02", name: "Rasel Mia", phone: "01812345602" },
    items: [
      {
        id: "line-08",
        name: "Zinger Combo",
        quantity: 1,
        unitPrice: 460,
        variantLabel: "Large",
        addOns: [{ id: "addon-04", name: "Extra Patty", price: 80 }],
      },
    ],
    subtotal: 540,
    deliveryFee: 40,
    discount: 30,
    total: 550,
    paymentMethod: "Bkash",
    currentStatus: "Delivered",
    kitchenNote: "",
    timestamps: {
      placedAt: "2026-04-10T05:50:00.000Z",
      acceptedAt: "2026-04-10T05:52:00.000Z",
      preparingAt: "2026-04-10T05:58:00.000Z",
      readyForPickupAt: "2026-04-10T06:12:00.000Z",
      pickedUpAt: "2026-04-10T06:18:00.000Z",
      deliveredAt: "2026-04-10T06:42:00.000Z",
      rejectedAt: null,
      cancelledAt: null,
    },
    history: [
      { id: "hist-16", status: "New", updatedAt: "2026-04-10T05:50:00.000Z", updatedBy: "customer" },
      { id: "hist-17", status: "Accepted", updatedAt: "2026-04-10T05:52:00.000Z", updatedBy: "owner" },
      { id: "hist-18", status: "Preparing", updatedAt: "2026-04-10T05:58:00.000Z", updatedBy: "owner" },
      { id: "hist-19", status: "ReadyForPickup", updatedAt: "2026-04-10T06:12:00.000Z", updatedBy: "owner" },
      { id: "hist-20", status: "PickedUp", updatedAt: "2026-04-10T06:18:00.000Z", updatedBy: "rider" },
      { id: "hist-21", status: "Delivered", updatedAt: "2026-04-10T06:42:00.000Z", updatedBy: "system" },
    ],
  },
  {
    id: "order-07",
    orderNumber: "FB-2398",
    customer: {
      name: "Maisha Noor",
      phone: "01712345607",
      address: "Uttara Sector 7, Dhaka",
    },
    rider: null,
    items: [{ id: "line-09", name: "Classic Chicken Burger", quantity: 1, unitPrice: 220, addOns: [] }],
    subtotal: 220,
    deliveryFee: 35,
    discount: 0,
    total: 255,
    paymentMethod: "Cash",
    currentStatus: "Rejected",
    kitchenNote: "",
    timestamps: {
      placedAt: "2026-04-10T05:20:00.000Z",
      acceptedAt: null,
      preparingAt: null,
      readyForPickupAt: null,
      pickedUpAt: null,
      deliveredAt: null,
      rejectedAt: "2026-04-10T05:23:00.000Z",
      cancelledAt: null,
    },
    history: [
      { id: "hist-22", status: "New", updatedAt: "2026-04-10T05:20:00.000Z", updatedBy: "customer" },
      {
        id: "hist-23",
        status: "Rejected",
        updatedAt: "2026-04-10T05:23:00.000Z",
        updatedBy: "owner",
        note: "Kitchen temporarily overloaded.",
      },
    ],
  },
  {
    id: "order-08",
    orderNumber: "FB-2397",
    customer: {
      name: "Tahsin Ahmed",
      phone: "01712345608",
      address: "Banasree, Dhaka",
    },
    rider: null,
    items: [{ id: "line-10", name: "French Fries", quantity: 2, unitPrice: 140, addOns: [] }],
    subtotal: 280,
    deliveryFee: 30,
    discount: 10,
    total: 300,
    paymentMethod: "Bkash",
    currentStatus: "Cancelled",
    kitchenNote: "",
    timestamps: {
      placedAt: "2026-04-10T04:45:00.000Z",
      acceptedAt: "2026-04-10T04:47:00.000Z",
      preparingAt: null,
      readyForPickupAt: null,
      pickedUpAt: null,
      deliveredAt: null,
      rejectedAt: null,
      cancelledAt: "2026-04-10T04:50:00.000Z",
    },
    history: [
      { id: "hist-24", status: "New", updatedAt: "2026-04-10T04:45:00.000Z", updatedBy: "customer" },
      { id: "hist-25", status: "Accepted", updatedAt: "2026-04-10T04:47:00.000Z", updatedBy: "owner" },
      {
        id: "hist-26",
        status: "Cancelled",
        updatedAt: "2026-04-10T04:50:00.000Z",
        updatedBy: "customer",
        note: "Customer changed delivery address.",
      },
    ],
  },
]

export const initialOrders: Order[] = initialOrderSeeds.map(withFinancialDefaults)
