const DEV_API_BASE_URL = "http://localhost:5000/api/v1";

type AppEnvironment = "development" | "preview" | "production";

function resolveAppEnvironment(): AppEnvironment {
  const value = process.env.EXPO_PUBLIC_APP_ENV?.trim().toLowerCase();

  if (value === "development" || value === "preview" || value === "production") {
    return value;
  }

  return __DEV__ ? "development" : "production";
}

function normalizeApiBaseUrl(value?: string) {
  const normalized = value
    ?.trim()
    .replace(/[,\s]+$/, "")
    .replace(/\/+$/, "");
  if (!normalized) return null;

  if (!/^https?:\/\/[^/\s]+(?:\/.*)?$/i.test(normalized)) {
    throw new Error("EXPO_PUBLIC_API_BASE_URL must be a valid http(s) URL.");
  }

  return normalized;
}

function isPrivateOrLocalHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "127.0.0.1" ||
    host.endsWith(".local")
  ) {
    return true;
  }

  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;

  const octets = match.slice(1).map(Number);
  if (octets.some((part) => part < 0 || part > 255)) return true;

  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function getHostnameFromUrl(value: string) {
  const match = value.match(/^https?:\/\/([^/:?#\s]+)/i);
  return match?.[1] ?? "";
}

function assertProductionApiBaseUrl(value: string) {
  if (!value.toLowerCase().startsWith("https://")) {
    throw new Error("Production customer app builds must use an HTTPS API URL.");
  }

  const hostname = getHostnameFromUrl(value);
  if (!hostname || isPrivateOrLocalHost(hostname)) {
    throw new Error(
      "Production customer app builds cannot use localhost or a private API URL.",
    );
  }
}

export const APP_ENV = resolveAppEnvironment();

const configuredApiBaseUrl = normalizeApiBaseUrl(
  process.env.EXPO_PUBLIC_API_BASE_URL,
);

if (APP_ENV === "production" && !configuredApiBaseUrl) {
  throw new Error(
    "EXPO_PUBLIC_API_BASE_URL is required for production customer app builds.",
  );
}

if (APP_ENV === "production" && configuredApiBaseUrl) {
  assertProductionApiBaseUrl(configuredApiBaseUrl);
}

export const API_BASE_URL = configuredApiBaseUrl ?? DEV_API_BASE_URL;
