const rawApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim()
  .replace(/[,\s]+$/, "")
  .replace(/\/+$/, "");
const isDevBuild = __DEV__;

export const API_BASE_URL =
  rawApiBaseUrl || (isDevBuild ? "http://localhost:5000/api/v1" : "");

if (!API_BASE_URL) {
  throw new Error(
    "EXPO_PUBLIC_API_BASE_URL is required for production restaurant-owner-app builds.",
  );
}

if (!isDevBuild && !API_BASE_URL.startsWith("https://")) {
  throw new Error(
    "EXPO_PUBLIC_API_BASE_URL must use HTTPS in production restaurant-owner-app builds.",
  );
}

export function getSocketBaseUrl() {
  return API_BASE_URL.replace(/\/api\/v1\/?$/, "");
}
