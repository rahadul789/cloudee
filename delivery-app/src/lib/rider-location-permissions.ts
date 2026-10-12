import * as Location from "expo-location";
import { Linking, Platform } from "react-native";

import { getRiderLocationPayload } from "@/src/lib/rider-location-payload";
export { getRiderLocationPayload, type RiderLocationPayload } from "@/src/lib/rider-location-payload";

export async function getRiderForegroundPermission() {
  return Location.getForegroundPermissionsAsync();
}

export async function requestRiderForegroundPermission() {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.status === "granted") {
    return current;
  }

  return Location.requestForegroundPermissionsAsync();
}

export async function requestRiderBackgroundPermission() {
  if (Platform.OS === "web") {
    return null;
  }

  const foreground = await Location.getForegroundPermissionsAsync();
  if (foreground.status !== "granted") {
    return null;
  }

  const current = await Location.getBackgroundPermissionsAsync();
  if (current.status === "granted") {
    return current;
  }

  return Location.requestBackgroundPermissionsAsync();
}

export async function getCurrentRiderLocationPayload(
  options: Location.LocationOptions = {},
) {
  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
    ...options,
  });

  return getRiderLocationPayload(position);
}

export async function getBestAvailableRiderLocationPayload(
  options: Location.LocationOptions = {},
) {
  try {
    return await getCurrentRiderLocationPayload(options);
  } catch (error) {
    const fallbackPosition = await Location.getLastKnownPositionAsync({
      maxAge: 2 * 60 * 1000,
    });

    if (fallbackPosition) {
      return getRiderLocationPayload(fallbackPosition);
    }

    throw error;
  }
}

export function openRiderLocationSettings() {
  return Linking.openSettings();
}
