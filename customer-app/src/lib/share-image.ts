import {
  StorageAccessFramework,
  EncodingType,
  deleteAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import type { RefObject } from "react";
import { Platform, type View } from "react-native";
import { captureRef } from "react-native-view-shot";

// Turn a rendered view into a PNG, then share it (any app) or save it to the phone.
// The card is 9:16 so it fits Instagram / Facebook stories without cropping.

export async function captureStoryImage(ref: RefObject<View | null>) {
  if (!ref.current) throw new Error("ছবি এখনো তৈরি হয়নি, আবার চেষ্টা করো।");
  // Captured at the device's own pixel density (sharp text); the view itself is 9:16.
  return captureRef(ref, { format: "png", quality: 1, result: "tmpfile" });
}

/** Removes a captured temp PNG once it's been shared / saved (repeat captures would pile up). */
export function discardImageFile(uri: string | null) {
  if (!uri) return;
  void deleteAsync(uri, { idempotent: true }).catch(() => undefined);
}

export async function shareImageFile(uri: string, dialogTitle: string) {
  if (!(await Sharing.isAvailableAsync())) throw new Error("এই ফোনে share করা যাচ্ছে না।");
  await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle, UTI: "public.png" });
}

export type SaveImageResult = "gallery" | "folder" | "cancelled";

/**
 * Android 13+: saves straight to the gallery (no permission needed). Older Android: the app
 * doesn't hold storage permission, so the user picks a folder once (e.g. Download / Pictures).
 */
export async function saveImageFile(uri: string, fileName: string): Promise<SaveImageResult> {
  const oldAndroid = Platform.OS === "android" && Number(Platform.Version) < 33;
  if (!oldAndroid) {
    const permission = await MediaLibrary.requestPermissionsAsync(true);
    if (!permission.granted) throw new Error("ছবি save করার অনুমতি দাও (Settings → Foodbela → Photos)।");
    await MediaLibrary.saveToLibraryAsync(uri);
    return "gallery";
  }
  const access = await StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!access.granted) return "cancelled";
  const target = await StorageAccessFramework.createFileAsync(access.directoryUri, fileName, "image/png");
  const base64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
  await writeAsStringAsync(target, base64, { encoding: EncodingType.Base64 });
  return "folder";
}
