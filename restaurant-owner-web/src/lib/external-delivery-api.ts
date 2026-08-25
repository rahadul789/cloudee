import { api } from "./api"

export type ExternalSettlementStatus =
  | "pending"
  | "collected"
  | "reconciled"
  | "settled"
  | "held"
  | "cancelled"

export type OwnerExternalDeliveryConfig = {
  enabled: boolean
  deliveryFeeTaka: number
}

export type OwnerExternalDelivery = {
  orderId: string
  restaurantId: string
  orderNumber: string
  status: string
  riderId: string
  riderName: string
  customerName: string
  customerPhone: string
  drop: { address: string }
  orderValue: number
  deliveryFee: number
  collectAmount: number
  netToOwner: number
  paymentMode: "cod" | "online"
  settlementStatus: ExternalSettlementStatus
  collectedAt: string | null
  reconciledAt: string | null
  settledAt: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type CreateExternalDeliveryResult = {
  orderId: string
  orderNumber: string
  status: string
  source: "external"
  deliveryFee: number
  orderValue: number
  collectAmount: number
  netToOwner: number
  paymentMode: "cod" | "online"
  settlementStatus: ExternalSettlementStatus
  drop: { address: string }
  createdAt: string
}

export type CreateExternalDeliveryInput = {
  customerName: string
  customerPhone: string
  dropAddress: string
  orderValue: number
  paymentMode: "cod" | "online"
}

export function getExternalDeliveryConfig() {
  return api.get<OwnerExternalDeliveryConfig>("/owner/external-deliveries/config")
}

export function createExternalDelivery(body: CreateExternalDeliveryInput) {
  return api.post<CreateExternalDeliveryResult>("/owner/external-deliveries", body)
}

export function listExternalDeliveries(params?: {
  tab?: "live" | "history"
  from?: string
  to?: string
  page?: number
  pageSize?: number
}) {
  const searchParams = new URLSearchParams()
  if (params?.tab) searchParams.set("tab", params.tab)
  if (params?.from) searchParams.set("from", params.from)
  if (params?.to) searchParams.set("to", params.to)
  if (params?.page) searchParams.set("page", `${params.page}`)
  if (params?.pageSize) searchParams.set("pageSize", `${params.pageSize}`)
  const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
  return api.get<{
    items: OwnerExternalDelivery[]
    total: number
    page: number
    pageSize: number
  }>(`/owner/external-deliveries${query}`)
}

export type OwnerExternalDeliveryStats = {
  requests: number
  delivered: number
  orderValue: number
  youReceive: number
}

export function getExternalDeliveryStats(params?: { from?: string; to?: string }) {
  const searchParams = new URLSearchParams()
  if (params?.from) searchParams.set("from", params.from)
  if (params?.to) searchParams.set("to", params.to)
  const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
  return api.get<OwnerExternalDeliveryStats>(`/owner/external-deliveries/stats${query}`)
}

export function cancelExternalDelivery(orderId: string, reason?: string) {
  return api.post<OwnerExternalDelivery>(
    `/owner/external-deliveries/${orderId}/cancel`,
    { reason }
  )
}
