import { env } from "../../config/env";
import { logger } from "../../config/logger";

// Dedicated "Foodbela Support" Telegram bot — separate from the OTP/ops/system bots. Set
// TELEGRAM_SUPPORT_BOT_TOKEN + TELEGRAM_SUPPORT_CHAT_ID (a group the support team is in).
// Fire-and-forget: a Telegram hiccup must never break the customer's support submission.
function getSupportTelegramTarget() {
  const token = env.TELEGRAM_SUPPORT_BOT_TOKEN;
  const chatId = env.TELEGRAM_SUPPORT_CHAT_ID;
  return token && chatId ? { token, chatId } : null;
}

export function isSupportTelegramConfigured() {
  return Boolean(getSupportTelegramTarget());
}

export async function sendSupportCaseToTelegram(params: {
  supportCaseId: string;
  customerName: string;
  customerPhone: string;
  subject: string;
  message: string;
  attachmentCount?: number;
}) {
  const target = getSupportTelegramTarget();
  if (!target) return { sent: false as const, reason: "not_configured" as const };

  const text = [
    "🎧 নতুন কাস্টমার সাপোর্ট",
    `নাম: ${params.customerName || "Customer"}`,
    params.customerPhone ? `ফোন: ${params.customerPhone}` : "",
    params.subject ? `বিষয়: ${params.subject}` : "",
    params.message ? `\n${params.message.slice(0, 500)}` : "",
    params.attachmentCount
      ? `\n📎 ${params.attachmentCount} attachment`
      : "",
    `\n${new Date().toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}`,
  ]
    .filter(Boolean)
    .join("\n");

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
      logger.warn({ status: response.status }, "Support Telegram send failed");
      return { sent: false as const, reason: "send_failed" as const };
    }
    return { sent: true as const };
  } catch (error) {
    logger.warn({ error }, "Support Telegram send error");
    return { sent: false as const, reason: "error" as const };
  }
}
