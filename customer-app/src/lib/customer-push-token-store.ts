import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const REGISTERED_CUSTOMER_PUSH_TOKEN_KEY =
  "foodbela.customer.registeredPushToken";

type RegisteredCustomerPushToken = {
  customerId: string;
  expoPushToken: string;
  registeredAt: string;
};

function isRegisteredCustomerPushToken(
  value: unknown,
): value is RegisteredCustomerPushToken {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RegisteredCustomerPushToken>;
  return (
    typeof candidate.customerId === "string" &&
    candidate.customerId.length > 0 &&
    typeof candidate.expoPushToken === "string" &&
    candidate.expoPushToken.length > 0
  );
}

async function getStoredValue() {
  if (Platform.OS === "web") {
    return globalThis.localStorage?.getItem(
      REGISTERED_CUSTOMER_PUSH_TOKEN_KEY,
    ) ?? null;
  }

  return SecureStore.getItemAsync(REGISTERED_CUSTOMER_PUSH_TOKEN_KEY);
}

async function setStoredValue(value: string) {
  if (Platform.OS === "web") {
    globalThis.localStorage?.setItem(REGISTERED_CUSTOMER_PUSH_TOKEN_KEY, value);
    return;
  }

  await SecureStore.setItemAsync(REGISTERED_CUSTOMER_PUSH_TOKEN_KEY, value);
}

export async function getRegisteredCustomerPushToken() {
  const rawValue = await getStoredValue();
  if (!rawValue) return null;

  try {
    const parsedValue = JSON.parse(rawValue) as unknown;
    return isRegisteredCustomerPushToken(parsedValue) ? parsedValue : null;
  } catch {
    return null;
  }
}

export async function saveRegisteredCustomerPushToken(params: {
  customerId: string;
  expoPushToken: string;
}) {
  await setStoredValue(
    JSON.stringify({
      customerId: params.customerId,
      expoPushToken: params.expoPushToken,
      registeredAt: new Date().toISOString(),
    } satisfies RegisteredCustomerPushToken),
  );
}

export async function clearRegisteredCustomerPushToken() {
  if (Platform.OS === "web") {
    globalThis.localStorage?.removeItem(REGISTERED_CUSTOMER_PUSH_TOKEN_KEY);
    return;
  }

  await SecureStore.deleteItemAsync(REGISTERED_CUSTOMER_PUSH_TOKEN_KEY);
}
