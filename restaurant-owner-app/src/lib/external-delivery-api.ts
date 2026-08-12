import { apiGet, apiPost } from "./api";

export type ExternalSettlementStatus =
  | "pending"
  | "collected"
  | "reconciled"
  | "settled"
  | "held"
  | "cancelled";

export type OwnerExternalDeliveryConfig = {
  enabled: boolean;
  deliveryFeeTaka: number;
};

export type OwnerExternalDelivery = {
  orderId: string;
  restaurantId: string;
  orderNumber: string;
  status: string;
  riderId: string;
  riderName: string;
  customerName: string;
  customerPhone: string;
  drop: { address: string };
  orderValue: number;
  deliveryFee: number;
  collectAmount: number;
  netToOwner: number;
  paymentMode: "cod" | "online";
  settlementStatus: ExternalSettlementStatus;
  collectedAt: string | null;
  reconciledAt: string | null;
  settledAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type CreateExternalDeliveryResult = {
  orderId: string;
  orderNumber: string;
  status: string;
  deliveryFee: number;
  orderValue: number;
  collectAmount: number;
  netToOwner: number;
  paymentMode: "cod" | "online";
  settlementStatus: ExternalSettlementStatus;
  drop: { address: string };
  createdAt: string;
};

export type CreateExternalDeliveryInput = {
  customerName: string;
  customerPhone: string;
  dropAddress: string;
  orderValue: number;
  paymentMode: "cod" | "online";
};

export async function getExternalDeliveryConfig() {
  const response = await apiGet<OwnerExternalDeliveryConfig>(
    "/owner/external-deliveries/config",
  );
  return response.data;
}

export async function createExternalDelivery(body: CreateExternalDeliveryInput) {
  const response = await apiPost<CreateExternalDeliveryResult>(
    "/owner/external-deliveries",
    body,
  );
  return response.data;
}

export async function listExternalDeliveries(params?: {
  tab?: "live" | "history";
  page?: number;
  pageSize?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params?.tab) searchParams.set("tab", params.tab);
  if (params?.page) searchParams.set("page", `${params.page}`);
  if (params?.pageSize) searchParams.set("pageSize", `${params.pageSize}`);
  const query = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const response = await apiGet<{
    items: OwnerExternalDelivery[];
    total: number;
    page: number;
    pageSize: number;
  }>(`/owner/external-deliveries${query}`);
  return response.data;
}

export async function cancelExternalDelivery(orderId: string, reason?: string) {
  const response = await apiPost<OwnerExternalDelivery>(
    `/owner/external-deliveries/${orderId}/cancel`,
    { reason },
  );
  return response.data;
}
