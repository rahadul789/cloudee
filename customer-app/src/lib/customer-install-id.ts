import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const CUSTOMER_INSTALL_ID_KEY = "foodbela.customer.installId";

function createInstallId() {
  return `${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

async function getStoredInstallId() {
  if (Platform.OS === "web") {
    return globalThis.localStorage?.getItem(CUSTOMER_INSTALL_ID_KEY) ?? null;
  }

  return SecureStore.getItemAsync(CUSTOMER_INSTALL_ID_KEY);
}

async function setStoredInstallId(value: string) {
  if (Platform.OS === "web") {
    globalThis.localStorage?.setItem(CUSTOMER_INSTALL_ID_KEY, value);
    return;
  }

  await SecureStore.setItemAsync(CUSTOMER_INSTALL_ID_KEY, value);
}

export async function getStableCustomerInstallId() {
  const existingId = await getStoredInstallId();
  if (existingId) return existingId;

  const nextId = createInstallId();
  await setStoredInstallId(nextId);
  return nextId;
}
