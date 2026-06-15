export type OrderStatus =
  | "New"
  | "Accepted"
  | "Preparing"
  | "ReadyForPickup"
  | "PickedUp"
  | "Delivered"
  | "Rejected"
  | "Cancelled"

export type OrderActor = "owner" | "rider" | "system" | "customer"

export type OrderPaymentMethod = "Cash" | "Bkash"

export type OrderTimestampKey =
  | "placedAt"
  | "acceptedAt"
  | "preparingAt"
  | "readyForPickupAt"
  | "pickedUpAt"
  | "deliveredAt"
  | "rejectedAt"
  | "cancelledAt"

export type OrderStatusTimestamps = {
  placedAt: string
  acceptedAt: string | null
  preparingAt: string | null
  readyForPickupAt: string | null
  pickedUpAt: string | null
  deliveredAt: string | null
  rejectedAt: string | null
  cancelledAt: string | null
}

export type OrderStatusHistoryItem = {
  id: string
  status: OrderStatus
  updatedAt: string
  updatedBy: OrderActor
  note?: string
}

export type OrderLineItemAddOn = {
  id: string
  name: string
  price: number
}

export type OrderLineItem = {
  id: string
  name: string
  quantity: number
  unitPrice: number
  variantLabel?: string | null
  addOns: OrderLineItemAddOn[]
}

export type OrderVoucherSnapshot = {
  id?: string
  code?: string
  name?: string
  type?: string
  fundedBy?: string
  discountAmount?: number
  totalDiscountAmount?: number
  ownerDiscountCost?: number
}

export type OrderCustomer = {
  name: string
  phone: string
  address: string
}

export type OrderRider = {
  id: string
  name: string
  phone: string
} | null

export type OrderAutoCancelSnapshot = {
  enabled: boolean
  applies: boolean
  autoCancelAfterMinutes: number
  notifyBeforeMinutes: number
  autoCancelAt: string | null
  remainingSeconds: number | null
}

export type OrderPreparationTiming = {
  phase: "not_started" | "accepted" | "preparing" | "preparing_late" | "completed" | string
  label: string
  baseMinutes: number
  extraMinutes: number
  totalMinutes: number
  maxExtraMinutes: number
  startedAt: string | null
  targetStartAt: string | null
  targetReadyAt: string | null
  remainingSeconds: number | null
  lateBySeconds: number
  canExtend: boolean
  extensionOptions: number[]
  autoStarted: boolean
}

export type Order = {
  id: string
  orderNumber: string
  customer: OrderCustomer
  rider: OrderRider
  items: OrderLineItem[]
  subtotal: number
  deliveryFee: number
  discount: number
  total: number
  restaurantSubtotal: number
  ownerDiscountCost: number
  platformDiscountCost: number
  restaurantNetSales: number
  customerPaidTotal: number
  paymentMethod: OrderPaymentMethod
  currentStatus: OrderStatus
  cancelledBy?: string
  terminalReason?: string
  kitchenNote: string
  timestamps: OrderStatusTimestamps
  autoCancel?: OrderAutoCancelSnapshot
  preparationTiming?: OrderPreparationTiming
  appliedVouchers: OrderVoucherSnapshot[]
  history: OrderStatusHistoryItem[]
}

export function getOwnerOrderSubtotal(order: Order) {
  return (
    order.restaurantSubtotal ||
    order.subtotal ||
    Math.max(0, getOwnerOrderCustomerPaidTotal(order) - order.deliveryFee + order.discount)
  )
}

export function getOwnerOrderNetSales(order: Order) {
  return order.restaurantNetSales || Math.max(0, getOwnerOrderSubtotal(order) - order.ownerDiscountCost)
}

export function getOwnerOrderCustomerPaidTotal(order: Order) {
  return order.customerPaidTotal || Math.max(0, order.subtotal + order.deliveryFee - order.discount)
}

export type OrderOperationalTiming = {
  phaseLabel: string
  primaryLabel: string
  secondaryLabel: string
  tone: "neutral" | "warning" | "critical" | "success"
  lateByMinutes: number | null
  remainingMinutes: number | null
  remainingSeconds?: number | null
}

export const liveOrderStatuses: OrderStatus[] = [
  "New",
  "Accepted",
  "Preparing",
  "ReadyForPickup",
  "PickedUp",
]

export const historyOrderStatuses: OrderStatus[] = [
  "Delivered",
  "Rejected",
  "Cancelled",
]

export const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
  New: ["Accepted", "Rejected"],
  Accepted: ["Preparing", "Cancelled"],
  Preparing: ["ReadyForPickup", "Cancelled"],
  ReadyForPickup: ["PickedUp"],
  PickedUp: ["Delivered"],
  Delivered: [],
  Rejected: [],
  Cancelled: [],
}

export const terminalOrderStatuses: OrderStatus[] = [
  "Delivered",
  "Rejected",
  "Cancelled",
]

export const actorAllowedTransitions: Record<
  OrderActor,
  Partial<Record<OrderStatus, OrderStatus[]>>
> = {
  owner: {
    New: ["Accepted", "Rejected"],
    Accepted: ["Preparing", "Cancelled"],
    Preparing: ["ReadyForPickup", "Cancelled"],
  },
  rider: {
    ReadyForPickup: ["PickedUp"],
  },
  system: {
    PickedUp: ["Delivered"],
    New: ["Cancelled"],
    Accepted: ["Cancelled"],
    Preparing: ["Cancelled"],
    ReadyForPickup: ["Cancelled"],
  },
  customer: {
    New: ["Cancelled"],
    Accepted: ["Cancelled"],
  },
}

export function canActorTransitionOrder(
  actor: OrderActor,
  currentStatus: OrderStatus,
  nextStatus: OrderStatus
) {
  return actorAllowedTransitions[actor][currentStatus]?.includes(nextStatus) ?? false
}

export const orderStatusLabels: Record<OrderStatus, string> = {
  New: "New",
  Accepted: "Accepted",
  Preparing: "Preparing",
  ReadyForPickup: "Ready for Pickup",
  PickedUp: "On the Way",
  Delivered: "Delivered",
  Rejected: "Rejected",
  Cancelled: "Cancelled",
}

export const orderStatusTimestampKey: Record<OrderStatus, OrderTimestampKey> = {
  New: "placedAt",
  Accepted: "acceptedAt",
  Preparing: "preparingAt",
  ReadyForPickup: "readyForPickupAt",
  PickedUp: "pickedUpAt",
  Delivered: "deliveredAt",
  Rejected: "rejectedAt",
  Cancelled: "cancelledAt",
}

export function formatOrderMoney(amount: number) {
  return `${Math.round(amount).toLocaleString()}tk`
}

export function getOrderItemsCount(order: Order) {
  return order.items.reduce((total, item) => total + item.quantity, 0)
}
