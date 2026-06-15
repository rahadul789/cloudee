import * as Location from "expo-location";
import { Linking } from "react-native";

export async function openLocationPermissionSettings() {
  try {
    await Linking.openSettings();
  } catch {
    await Location.requestForegroundPermissionsAsync().catch(() => undefined);
  }
}
