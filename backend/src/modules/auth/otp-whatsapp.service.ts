import { env } from "../../config/env";
import { logger } from "../../config/logger";

// WhatsApp OTP channel via Meta's WhatsApp Business Cloud API. Wired but INERT until the
// three env vars are set AND an authentication template is approved on Meta. Keep the admin
// `whatsappOtpEnabled` flag OFF until this is tested end-to-end.
//
// To finish setup:
//   1. Create a Meta WhatsApp Business App → get WHATSAPP_PHONE_NUMBER_ID + a permanent
//      WHATSAPP_ACCESS_TOKEN.
//   2. Submit an "authentication" template (with a copy-code button) → set its name as
//      WHATSAPP_OTP_TEMPLATE. Match the `components` below to that template.
//   3. Set the env vars, restart, then flip `whatsappOtpEnabled` ON in admin settings.
function getWhatsappConfig() {
  const token = env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = env.WHATSAPP_PHONE_NUMBER_ID;
  const template = env.WHATSAPP_OTP_TEMPLATE;
  return token && phoneId && template ? { token, phoneId, template } : null;
}

export function isWhatsappConfigured() {
  return Boolean(getWhatsappConfig());
}

export async function sendOtpWhatsApp(params: { phone: string; code: string }) {
  const config = getWhatsappConfig();
  if (!config) return { sent: false as const, reason: "not_configured" as const };

  const to = params.phone.replace(/\D/g, ""); // E.164 digits, e.g. 8801XXXXXXXXX

  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${config.phoneId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: config.template,
            language: { code: "en" },
            // Meta authentication template: the code fills the body {{1}} AND the copy-code
            // button. If your approved template differs, adjust these components.
            components: [
              {
                type: "body",
                parameters: [{ type: "text", text: params.code }],
              },
              {
                type: "button",
                sub_type: "url",
                index: 0,
                parameters: [{ type: "text", text: params.code }],
              },
            ],
          },
        }),
      },
    );
    if (!response.ok) {
      logger.warn(
        { status: response.status },
        "WhatsApp OTP send rejected",
      );
      return { sent: false as const, reason: "send_failed" as const };
    }
    return { sent: true as const };
  } catch (error) {
    logger.warn({ error }, "WhatsApp OTP send error");
    return { sent: false as const, reason: "error" as const };
  }
}
