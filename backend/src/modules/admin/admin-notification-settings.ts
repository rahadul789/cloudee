import { getPlatformContent } from "../public/content.service";

export type AdminNotificationSettings = {
  orderPlaced: boolean;
  customerOrderUpdates: boolean;
  orderDelays: boolean;
  preparationDelays: boolean;
  riderDelays: boolean;
  deliveryDelays: boolean;
  paymentExceptions: boolean;
  payoutRequests: boolean;
  support: boolean;
  security: boolean;
  campaigns: boolean;
};

export type AdminNotificationSettingKey = keyof AdminNotificationSettings;

export const defaultAdminNotificationSettings: AdminNotificationSettings = {
  orderPlaced: true,
  customerOrderUpdates: false,
  orderDelays: true,
  preparationDelays: true,
  riderDelays: true,
  deliveryDelays: true,
  paymentExceptions: true,
  payoutRequests: true,
  support: true,
  security: true,
  campaigns: true,
};

export async function getAdminNotificationSettings() {
  const content = await getPlatformContent();
  return {
    ...defaultAdminNotificationSettings,
    ...(content.operations?.adminNotifications ?? {}),
  };
}

export function classifyAdminAlertType(
  alertType: string,
): AdminNotificationSettingKey {
  if (alertType === "order_placed" || alertType === "order_created") {
    return "orderPlaced";
  }
  if (alertType.startsWith("payment_") || alertType.startsWith("payment.")) {
    return "paymentExceptions";
  }
  if (alertType === "payout_request" || alertType.startsWith("payout_")) {
    return "payoutRequests";
  }
  if (alertType.startsWith("support_")) return "support";
  if (alertType === "otp_abuse" || alertType === "referral_fraud") {
    return "security";
  }
  if (
    alertType === "prep_start_late" ||
    alertType === "food_prepare_late"
  ) {
    return "preparationDelays";
  }
  if (
    alertType.startsWith("rider_") ||
    alertType === "rider_tracking_stale"
  ) {
    return "riderDelays";
  }
  if (alertType.startsWith("delivery_")) return "deliveryDelays";
  if (
    alertType.startsWith("order_") ||
    alertType.startsWith("restaurant_") ||
    alertType === "owner_response_late"
  ) {
    return "orderDelays";
  }
  return "security";
}

export function classifyOwnerNotification(
  type: string,
  eventType: string,
): AdminNotificationSettingKey {
  if (eventType === "order.created") return "orderPlaced";
  if (type === "payout" || eventType.startsWith("payout.")) {
    return "payoutRequests";
  }
  if (type === "support" || eventType.includes("support")) return "support";
  if (type === "promotion" || eventType.includes("campaign")) {
    return "campaigns";
  }
  return "security";
}

export function classifyCustomerNotification(type: string) {
  if (["order_status", "rider_assigned", "rider_near"].includes(type)) {
    return "customerOrderUpdates" satisfies AdminNotificationSettingKey;
  }
  if (["promotion", "voucher", "campaign"].includes(type)) {
    return "campaigns" satisfies AdminNotificationSettingKey;
  }
  if (type === "support" || type.includes("support")) {
    return "support" satisfies AdminNotificationSettingKey;
  }
  return "security" satisfies AdminNotificationSettingKey;
}

export function isAdminNotificationCategoryEnabled(
  settings: AdminNotificationSettings,
  key: AdminNotificationSettingKey,
) {
  return settings[key] !== false;
}

export function isAdminNotificationItemEnabled(
  item: Record<string, unknown>,
  settings: AdminNotificationSettings,
) {
  const source = typeof item.source === "string" ? item.source : "";
  const type = typeof item.type === "string" ? item.type : "";
  const eventType =
    typeof item.eventType === "string" ? item.eventType : "";

  if (source === "ops") {
    return isAdminNotificationCategoryEnabled(
      settings,
      classifyAdminAlertType(type),
    );
  }

  if (source === "owner") {
    return isAdminNotificationCategoryEnabled(
      settings,
      classifyOwnerNotification(type, eventType),
    );
  }

  if (source === "customer") {
    return isAdminNotificationCategoryEnabled(
      settings,
      classifyCustomerNotification(type),
    );
  }

  if (source === "campaign" || source === "scheduled") {
    return isAdminNotificationCategoryEnabled(settings, "campaigns");
  }

  return true;
}
