import * as Application from "expo-application";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const CUSTOMER_INSTALL_ID_KEY = "foodbela.customer.installId";
const HARDWARE_ID_PREFIX = "hw:";

function createInstallId() {
  return `${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

// Hardware-anchored device id. Unlike the random fallback (stored only in SecureStore,
// which is wiped on uninstall / "clear data"), this re-derives to the SAME value after a
// reinstall, so one physical device stays recognizable for first-order / referral fraud
// checks even when the user switches phone numbers or reinstalls the app.
//   - Android: SSAID (Settings.Secure.ANDROID_ID) — stable per device + app signing key,
//     survives reinstall, resets only on factory reset.
//   - iOS: identifierForVendor — stable while any app from this vendor is installed.
async function getHardwareDeviceId(): Promise<string | null> {
  try {
    if (Platform.OS === "android") {
      const androidId = Application.getAndroidId();
      return androidId ? `${HARDWARE_ID_PREFIX}android-${androidId}` : null;
    }
    if (Platform.OS === "ios") {
      const vendorId = await Application.getIosIdForVendorAsync();
      return vendorId ? `${HARDWARE_ID_PREFIX}ios-${vendorId}` : null;
    }
  } catch {
    // Fall through to the SecureStore fallback below.
  }
  return null;
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
  const hardwareId = await getHardwareDeviceId();
  const existingId = await getStoredInstallId();

  // Prefer the hardware-anchored id whenever the platform exposes one. It always wins, and
  // we migrate any legacy random id over to it so the same device converges to a single,
  // reinstall-proof identity that the backend fraud checks can match across accounts.
  if (hardwareId) {
    if (existingId !== hardwareId) {
      await setStoredInstallId(hardwareId);
    }
    return hardwareId;
  }

  // No hardware id available (e.g. web) — keep the stable random fallback.
  if (existingId) return existingId;

  const nextId = createInstallId();
  await setStoredInstallId(nextId);
  return nextId;
}
