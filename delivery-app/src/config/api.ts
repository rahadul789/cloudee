const rawApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim()
  .replace(/[,\s]+$/, "")
  .replace(/\/+$/, "");
const isDevBuild =
  typeof __DEV__ === "boolean" ? __DEV__ : process.env.NODE_ENV !== "production";

export const API_BASE_URL = rawApiBaseUrl || (isDevBuild ? "http://localhost:5000/api/v1" : "");

if (!API_BASE_URL) {
  throw new Error("EXPO_PUBLIC_API_BASE_URL is required for production delivery-app builds.");
}

if (!isDevBuild && !API_BASE_URL.startsWith("https://")) {
  throw new Error("EXPO_PUBLIC_API_BASE_URL must use HTTPS in production delivery-app builds.");
}

export function resolveSocketUrl() {
  if (API_BASE_URL.includes("/api/v1")) {
    return API_BASE_URL.replace(/\/api\/v1\/?$/, "");
  }

  return API_BASE_URL;
}
