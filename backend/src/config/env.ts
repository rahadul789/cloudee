import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  API_PREFIX: z.string().default("/api/v1"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  MONGODB_MAX_POOL_SIZE: z.coerce.number().int().positive().default(25),
  MONGODB_MIN_POOL_SIZE: z.coerce.number().int().min(0).default(0),
  MONGODB_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  MONGODB_SERVER_SELECTION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(10000),
  MONGODB_SOCKET_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
  MONGODB_WAIT_QUEUE_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  MONGODB_MAX_IDLE_TIME_MS: z.coerce.number().int().positive().default(60000),
  MONGODB_HEALTHCHECK_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  MONGODB_WATCHDOG_INTERVAL_MS: z.coerce.number().int().positive().default(15000),
  MONGODB_WATCHDOG_FAILURE_THRESHOLD: z.coerce
    .number()
    .int()
    .positive()
    .default(3),
  MONGODB_DISCONNECT_GRACE_MS: z.coerce.number().int().positive().default(45000),
  DB_STARTUP_MAINTENANCE_ENABLED: z
    .string()
    .optional()
    .transform((value) =>
      value === undefined
        ? process.env.NODE_ENV !== "production"
        : value !== "false",
    ),
  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),
  CUSTOMER_APP: z.string().default("http://192.168.1.6:8081"),
  DELIVERY_APP: z.string().default("http://192.168.1.6:8082"),
  RESTAURANT_APP: z.string().default("http://192.168.1.6:8083"),
  ADMIN_PANEL_ORIGIN: z.string().default("http://localhost:5174"),
  JWT_ACCESS_SECRET: z.string().min(1, "JWT_ACCESS_SECRET is required"),
  JWT_REFRESH_SECRET: z.string().min(1, "JWT_REFRESH_SECRET is required"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("45m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("3650d"),
  ADMIN_BOOTSTRAP_EMAIL: z.string().email().default("admin@foodbela.com"),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().min(6).default("Admin@123456"),
  ADMIN_BOOTSTRAP_NAME: z.string().default("Foodbela Admin"),
  ADMIN_BOOTSTRAP_ENABLED: z
    .string()
    .default("false")
    .transform((value) => value === "true"),
  ADMIN_AUTH_COOKIE_SECURE: z
    .string()
    .default("false")
    .transform((value) => value === "true"),
  ADMIN_AUTH_COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
  OWNER_AUTH_COOKIE_SECURE: z
    .string()
    .default("false")
    .transform((value) => value === "true"),
  OWNER_AUTH_COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
  CLOUDINARY_CLOUD_NAME: z.string().min(1, "CLOUDINARY_CLOUD_NAME is required"),
  CLOUDINARY_API_KEY: z.string().min(1, "CLOUDINARY_API_KEY is required"),
  CLOUDINARY_API_SECRET: z.string().min(1, "CLOUDINARY_API_SECRET is required"),
  BACKEND_PUBLIC_URL: z.string().url().default("http://localhost:5000"),
  BKASH_BASE_URL: z.string().optional(),
  BKASH_USERNAME: z.string().optional(),
  BKASH_PASSWORD: z.string().optional(),
  BKASH_APP_KEY: z.string().optional(),
  BKASH_APP_SECRET: z.string().optional(),
  GOOGLE_MAPS_API_KEY: optionalTrimmedString,
  METRICS_ENABLED: z
    .string()
    .default("true")
    .transform((value) => value === "true"),
  METRICS_PATH: z.string().default("/metrics"),
  METRICS_AUTH_TOKEN: z.string().optional(),
  RATE_LIMIT_ENABLED: z
    .string()
    .default("true")
    .transform((value) => value !== "false"),
  RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(2000),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  SERVICE_AREAS_ENABLED: z
    .string()
    .default("true")
    .transform((value) => value !== "false"),
  MOCK_OTP_ENABLED: z
    .string()
    .default("true")
    .transform((value) => value === "true"),
  MOCK_OTP_CODE: z
    .string()
    .regex(/^\d{4,6}$/)
    .default("123456"),
  OTP_EXPIRY_SECONDS: z.coerce.number().int().positive().default(300),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(0).default(60),
  SMS_API_URL: z.string().url().default("https://api.sms.net.bd/sendsms"),
  SMS_API_KEY: z.string().optional(),
  SMS_SENDER_ID: z.string().optional(),
  // Boot default for the active SMS gateway; the admin panel (auth.otp.smsProvider)
  // overrides this at runtime. Secrets/IDs for the new provider live below.
  SMS_PROVIDER: z.enum(["smsbd", "sslwireless"]).default("smsbd"),
  SSL_SMS_API_URL: z
    .string()
    .url()
    .default("https://smsplus.sslwireless.com/api/v3/send-sms"),
  SSL_SMS_API_TOKEN: z.string().optional(),
  SSL_SMS_SID_MASKING: z.string().optional(),
  SSL_SMS_SID_NONMASKING: z.string().optional(),
  // SSL Wireless requires every NON-MASKING SMS to start with the brand in brackets:
  // "(Brand) <body>". Defaults to the platform/branding name when unset.
  SSL_SMS_BRAND_NAME: z.string().optional(),
  ALERTS_ENABLED: z
    .string()
    .default("false")
    .transform((value) => value === "true"),
  ALERT_CHECK_INTERVAL_SECONDS: z.coerce.number().int().positive().default(60),
  ALERT_COOLDOWN_MINUTES: z.coerce.number().int().positive().default(30),
  ALERT_RECIPIENT_EMAILS: z.string().optional(),
  ALERT_FROM_EMAIL: z.string().email().optional(),
  ALERT_FROM_NAME: z.string().default("Foodbela Monitor"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_SECURE: z
    .string()
    .default("true")
    .transform((value) => value !== "false"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  TELEGRAM_BOT_TOKEN: optionalTrimmedString,
  TELEGRAM_CHAT_ID: optionalTrimmedString,
  TELEGRAM_OPS_BOT_TOKEN: optionalTrimmedString,
  TELEGRAM_OPS_CHAT_ID: optionalTrimmedString,
  TELEGRAM_SYSTEM_BOT_TOKEN: optionalTrimmedString,
  TELEGRAM_SYSTEM_CHAT_ID: optionalTrimmedString,
  TELEGRAM_OTP_BOT_TOKEN: optionalTrimmedString,
  TELEGRAM_OTP_CHAT_ID: optionalTrimmedString,
  // Dedicated "Foodbela External" bot — new external-delivery requests.
  TELEGRAM_EXTERNAL_BOT_TOKEN: optionalTrimmedString,
  TELEGRAM_EXTERNAL_CHAT_ID: optionalTrimmedString,
  // Dedicated "Foodbela Business" bot — new customer signups.
  TELEGRAM_BUSINESS_BOT_TOKEN: optionalTrimmedString,
  TELEGRAM_BUSINESS_CHAT_ID: optionalTrimmedString,
  WHATSAPP_ACCESS_TOKEN: optionalTrimmedString,
  WHATSAPP_PHONE_NUMBER_ID: optionalTrimmedString,
  WHATSAPP_OTP_TEMPLATE: optionalTrimmedString,
  ADMIN_WEB_BASE_URL: z.string().url().default("https://admin.foodbela.com"),
  ALERT_BACKEND_HEALTH_URL: z.string().url().optional(),
  ALERT_METRICS_URL: z.string().url().default("http://backend:5000/metrics"),
  ALERT_SSL_HOSTS: z
    .string()
    .default(
      "foodbela.com,www.foodbela.com,api.foodbela.com,owner.foodbela.com,admin.foodbela.com",
    ),
  ALERT_SSL_EXPIRY_DAYS: z.coerce.number().int().positive().default(14),
  ALERT_MEMORY_RSS_MB: z.coerce.number().int().positive().default(900),
  ALERT_CPU_PERCENT: z.coerce.number().int().positive().default(85),
  ALERT_5XX_THRESHOLD: z.coerce.number().int().min(1).default(5),
  ALERT_RATE_LIMIT_THRESHOLD: z.coerce.number().int().min(1).default(20),
  ALERT_SMS_LOW_BALANCE: z.coerce.number().min(0).default(100),
  ALERT_REFUND_PENDING_MINUTES: z.coerce.number().int().positive().default(120),
  ALERT_SUPPORT_SLA_OVERDUE_MINUTES: z.coerce.number().int().min(0).default(15),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(`Environment validation failed:\n${issues}`);
}

export const env = parsed.data;
