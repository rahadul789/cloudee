import { appStateStorage } from "@/src/lib/app-storage";

export type BkashPaymentDraftItem = {
  itemId: string;
  quantity: number;
  selectedVariantOptions?: { groupName: string; optionLabel: string }[];
  selectedAddOnOptions?: { groupName: string; optionLabel: string }[];
};

export type BkashPaymentDraft = {
  sessionId: string;
  paymentUrl: string;
  paymentID: string;
  clientOrderId: string;
  restaurantId: string;
  voucherCode?: string;
  note?: string;
  walletNumber: string;
  amount: number;
  expiresAt: string;
  items: BkashPaymentDraftItem[];
  deliveryAddress: {
    label: string;
    addressLine: string;
    addressDetails?: string;
    latitude: number;
    longitude: number;
  };
};

const DRAFT_KEY_PREFIX = "foodbela.customer.bkashPaymentDraft.";

function draftKey(sessionId: string) {
  return `${DRAFT_KEY_PREFIX}${sessionId}`;
}

function isDraftItem(value: unknown): value is BkashPaymentDraftItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<BkashPaymentDraftItem>;
  return (
    typeof item.itemId === "string" &&
    item.itemId.length > 0 &&
    typeof item.quantity === "number" &&
    Number.isFinite(item.quantity) &&
    item.quantity > 0
  );
}

function isBkashPaymentDraft(value: unknown): value is BkashPaymentDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<BkashPaymentDraft>;
  const address = draft.deliveryAddress;

  return (
    typeof draft.sessionId === "string" &&
    typeof draft.paymentUrl === "string" &&
    typeof draft.paymentID === "string" &&
    typeof draft.clientOrderId === "string" &&
    typeof draft.restaurantId === "string" &&
    typeof draft.walletNumber === "string" &&
    typeof draft.amount === "number" &&
    typeof draft.expiresAt === "string" &&
    Array.isArray(draft.items) &&
    draft.items.every(isDraftItem) &&
    Boolean(address) &&
    typeof address?.label === "string" &&
    typeof address.addressLine === "string" &&
    typeof address.latitude === "number" &&
    typeof address.longitude === "number"
  );
}

export async function saveBkashPaymentDraft(draft: BkashPaymentDraft) {
  await appStateStorage.setItem(draftKey(draft.sessionId), JSON.stringify(draft));
}

export async function getBkashPaymentDraft(sessionId: string) {
  const rawValue = await appStateStorage.getItem(draftKey(sessionId));
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    return isBkashPaymentDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearBkashPaymentDraft(sessionId: string) {
  await appStateStorage.removeItem(draftKey(sessionId));
}
