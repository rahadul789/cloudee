import { env } from "../../config/env";
import { logger } from "../../config/logger";

// Dedicated "Foodbela OTP" bot — separate from the ops/system alert bots. Its group must be
// tightly restricted (anyone in it can read login codes). Fire-and-forget: a Telegram hiccup
// must never break the OTP/login flow.
function getOtpTelegramTarget() {
  const token = env.TELEGRAM_OTP_BOT_TOKEN;
  const chatId = env.TELEGRAM_OTP_CHAT_ID;
  return token && chatId ? { token, chatId } : null;
}

export function isOtpTelegramConfigured() {
  return Boolean(getOtpTelegramTarget());
}

export async function sendOtpToTelegram(params: {
  phone: string;
  code: string;
  kind: "resend" | "call_request";
  resendCount?: number;
}) {
  const target = getOtpTelegramTarget();
  if (!target) return { sent: false as const, reason: "not_configured" as const };

  const header =
    params.kind === "call_request" ? "🔴 CALL REQUESTED" : "📱 OTP resend";
  const text = [
    header,
    `Phone: ${params.phone}`,
    `Code: ${params.code}`,
    params.resendCount ? `Resend #${params.resendCount}` : "",
    new Date().toLocaleString("en-GB", { timeZone: "Asia/Dhaka" }),
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
      logger.warn({ status: response.status }, "OTP Telegram send failed");
      return { sent: false as const, reason: "send_failed" as const };
    }
    return { sent: true as const };
  } catch (error) {
    logger.warn({ error }, "OTP Telegram send error");
    return { sent: false as const, reason: "error" as const };
  }
}
