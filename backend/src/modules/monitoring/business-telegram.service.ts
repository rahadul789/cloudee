import { env } from "../../config/env";
import { logger } from "../../config/logger";

// Business-growth Telegram notifications, each routed to its own dedicated bot on purpose:
//   - new external delivery requests -> the dedicated External bot
//   - new customer signups           -> the dedicated Business bot
// Both are fire-and-forget: a Telegram hiccup must never break the order/signup flow.

type TelegramTarget = { token: string; chatId: string };

// External requests -> dedicated External bot only (base bot as a last-resort safety net).
function getExternalTarget(): TelegramTarget | null {
  const token = env.TELEGRAM_EXTERNAL_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_EXTERNAL_CHAT_ID || env.TELEGRAM_CHAT_ID;
  return token && chatId ? { token, chatId } : null;
}

// New-user signups go to the dedicated Business bot only.
function getBusinessTarget(): TelegramTarget | null {
  const token = env.TELEGRAM_BUSINESS_BOT_TOKEN;
  const chatId = env.TELEGRAM_BUSINESS_CHAT_ID;
  return token && chatId ? { token, chatId } : null;
}

function dhakaTimestamp() {
  return new Date().toLocaleString("en-GB", { timeZone: "Asia/Dhaka" });
}

async function sendTelegram(target: TelegramTarget | null, text: string) {
  if (!target) return { sent: false as const, reason: "not_configured" as const };

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${target.token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: target.chatId,
          text,
          disable_web_page_preview: true,
        }),
      },
    );
    if (!response.ok) {
      logger.warn({ status: response.status }, "Business Telegram send failed");
      return { sent: false as const, reason: "send_failed" as const };
    }
    return { sent: true as const };
  } catch (error) {
    logger.warn({ error }, "Business Telegram send error");
    return { sent: false as const, reason: "error" as const };
  }
}

function formatTk(value: number) {
  return `Tk ${Math.round(Number(value) || 0).toLocaleString("en-US")}`;
}

// New external delivery request -> OPS bot channel. Callers `void` this.
export async function notifyExternalDeliveryRequest(params: {
  restaurantName: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  dropAddress: string;
  orderValue: number;
  deliveryFee: number;
  paymentMode: "cod" | "online";
}) {
  const text = [
    "🛵 New external delivery request",
    `Restaurant: ${params.restaurantName}`,
    `Order: ${params.orderNumber}`,
    `Customer: ${params.customerName} (${params.customerPhone})`,
    `Drop: ${params.dropAddress}`,
    `Order value: ${formatTk(params.orderValue)}`,
    `Delivery fee: ${formatTk(params.deliveryFee)}`,
    `Payment: ${params.paymentMode === "online" ? "Online" : "Cash"}`,
    dhakaTimestamp(),
  ].join("\n");

  return sendTelegram(getExternalTarget(), text);
}

// New customer signup -> dedicated Business bot channel. Callers `void` this.
export async function notifyNewCustomerSignup(params: {
  fullName: string;
  phone: string;
  referredBy?: string | null;
}) {
  const text = [
    "🎉 New customer signup",
    `Name: ${params.fullName || "—"}`,
    `Phone: ${params.phone}`,
    params.referredBy ? `Referred by: ${params.referredBy}` : "",
    dhakaTimestamp(),
  ]
    .filter(Boolean)
    .join("\n");

  return sendTelegram(getBusinessTarget(), text);
}
