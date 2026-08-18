import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { PropsWithChildren, useEffect } from "react";
import { Platform } from "react-native";

import {
  useRegisterOwnerPushTokenMutation,
  useUnregisterOwnerPushTokenMutation,
} from "@/src/hooks/use-owner-api";
import { useOwnerLanguageStore } from "@/src/i18n/language-store";
import { useOwnerAuthStore } from "@/src/store/auth-store";

const PUSH_DEBUG_ENABLED =
  __DEV__ &&
  Boolean(
    (Constants.expoConfig?.extra as { enablePushDebug?: boolean } | undefined)
      ?.enablePushDebug,
  );

function logOwnerPushDebug(message: string, details?: unknown) {
  if (!PUSH_DEBUG_ENABLED) return;

  if (details !== undefined) {
    console.log(message, details);
    return;
  }

  console.log(message);
}

function resolveNotificationPath(path?: unknown) {
  if (typeof path !== "string" || !path.startsWith("/")) {
    return "/(tabs)/today";
  }

  const allowedStaticPaths = new Set([
    "/(tabs)/today",
    "/(tabs)/orders",
    "/(tabs)/menu",
    "/(tabs)/payouts",
    "/(tabs)/account",
    "/notifications",
  ]);

  if (allowedStaticPaths.has(path)) {
    return path;
  }

  const orderMatch = path.match(/^\/orders\/([A-Za-z0-9_-]{6,80})$/);
  if (orderMatch) {
    return path;
  }

  return "/(tabs)/today";
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function getExpoProjectId() {
  const easProjectId =
    Constants.easConfig?.projectId ??
    ((Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas
      ?.projectId ?? "");

  return easProjectId || undefined;
}

async function registerForPushNotificationsAsync() {
  const isDevice = (Constants as unknown as { isDevice?: boolean }).isDevice !== false;

  if (!isDevice) {
    logOwnerPushDebug("[owner-push] Physical device not available for push registration.");
    return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF6392",
    });
    // Dedicated channel for new orders with the Bangla voice sound. Android plays the
    // CHANNEL's sound on the lock screen; the owner can also override it in the phone's
    // notification settings for this channel (WhatsApp-style).
    await Notifications.setNotificationChannelAsync("new-orders", {
      name: "New orders",
      importance: Notifications.AndroidImportance.MAX,
      sound: "new_order.mp3",
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF6392",
    });
    // Auto-cancel warning: an order is about to be auto-cancelled — its own urgent tone.
    await Notifications.setNotificationChannelAsync("auto-cancel", {
      name: "Order auto-cancel warnings",
      importance: Notifications.AndroidImportance.MAX,
      sound: "auto_cancel_warning.mp3",
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF6392",
    });
    // General: the common chime for every other owner notification.
    await Notifications.setNotificationChannelAsync("general", {
      name: "General",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "common.mp3",
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF6392",
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const permissionResult = await Notifications.requestPermissionsAsync();
    finalStatus = permissionResult.status;
  }

  if (finalStatus !== "granted") {
    logOwnerPushDebug("[owner-push] Notification permission not granted.");
    return null;
  }

  const projectId = await getExpoProjectId();

  try {
    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    logOwnerPushDebug("[owner-push] Expo push token acquired.");
    return token.data;
  } catch (error) {
    logOwnerPushDebug("[owner-push] Failed to get Expo push token.", error);
    return null;
  }
}

export function OwnerPushBridge({ children }: PropsWithChildren) {
  const router = useRouter();
  const owner = useOwnerAuthStore((state) => state.owner);
  const registeredPushToken = useOwnerAuthStore((state) => state.registeredPushToken);
  const registeredPushLanguage = useOwnerAuthStore(
    (state) => state.registeredPushLanguage,
  );
  const setRegisteredPushToken = useOwnerAuthStore((state) => state.setRegisteredPushToken);
  const language = useOwnerLanguageStore((state) => state.language);
  const registerMutation = useRegisterOwnerPushTokenMutation();
  const unregisterMutation = useUnregisterOwnerPushTokenMutation();

  useEffect(() => {
    void Notifications.setAutoServerRegistrationEnabledAsync(false).catch((error) => {
      logOwnerPushDebug("[owner-push] Failed to disable Expo auto server registration.", error);
    });
  }, []);

  useEffect(() => {
    const openPath = (path?: unknown) => {
      router.push(resolveNotificationPath(path) as never);
    };

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        openPath(response.notification.request.content.data?.path);
        void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
      },
    );

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      openPath(response.notification.request.content.data?.path);
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    });

    return () => {
      responseSubscription.remove();
    };
  }, [router]);

  useEffect(() => {
    if (!owner?.id) {
      return;
    }

    const run = async () => {
      const expoPushToken = await registerForPushNotificationsAsync();

      if (!expoPushToken) {
        if (!expoPushToken) {
          logOwnerPushDebug("[owner-push] Push token unavailable. Registration skipped.");
        }
        return;
      }

      if (registeredPushToken === expoPushToken && registeredPushLanguage === language) {
        return;
      }

      if (registeredPushToken && registeredPushToken !== expoPushToken) {
        await unregisterMutation
          .mutateAsync({ expoPushToken: registeredPushToken })
          .catch(() => undefined);
      }

      await registerMutation.mutateAsync({
        expoPushToken,
        platform: Platform.OS === "ios" ? "ios" : "android",
        deviceId: Constants.sessionId,
        appVersion: Constants.expoConfig?.version,
        language,
      });

      setRegisteredPushToken(expoPushToken, language);
      logOwnerPushDebug("[owner-push] Push token registered with backend.");
    };

    void run().catch((error) => {
      logOwnerPushDebug("[owner-push] Push registration failed.", error);
    });
  }, [
    owner?.id,
    language,
    registerMutation,
    registeredPushLanguage,
    registeredPushToken,
    setRegisteredPushToken,
    unregisterMutation,
  ]);

  return children;
}
