import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { PropsWithChildren, useEffect, useRef } from "react";
import { Platform } from "react-native";

import {
  useRegisterRiderPushTokenMutation,
} from "@/src/hooks/use-rider-api";
import { useNetworkStatus } from "@/src/hooks/use-network-status";
import {
  clearCurrentRiderExpoPushToken,
  setCurrentRiderExpoPushToken,
} from "@/src/lib/rider-push-token-state";
import { useRiderAuthStore } from "@/src/store/auth-store";

const PUSH_DEBUG_ENABLED =
  __DEV__ &&
  Boolean(
    (Constants.expoConfig?.extra as { enablePushDebug?: boolean } | undefined)
      ?.enablePushDebug,
  );

function logRiderPushDebug(message: string, details?: unknown) {
  if (!PUSH_DEBUG_ENABLED) return;

  if (details !== undefined) {
    console.log(message, details);
    return;
  }

  console.log(message);
}

function resolveNotificationPath(path?: unknown) {
  if (typeof path !== "string" || !path.startsWith("/")) {
    return "/(app)/available";
  }

  const allowedStaticPaths = new Set([
    "/(app)/available",
    "/(app)/active",
    "/(app)/map",
    "/(app)/history",
    "/(app)/profile",
    "/notifications",
  ]);

  if (allowedStaticPaths.has(path)) {
    return path;
  }

  const orderMatch = path.match(/^\/orders\/([A-Za-z0-9_-]{6,80})$/);
  if (orderMatch) {
    return path;
  }

  return "/(app)/available";
}

function resolveNotificationTarget(data?: Record<string, unknown> | null) {
  const directPath = data?.path ?? data?.actionPath ?? data?.route;
  const directOrderId =
    typeof data?.orderId === "string"
      ? data.orderId
      : typeof data?.entityType === "string" &&
          data.entityType.toLowerCase() === "order" &&
          typeof data?.entityId === "string"
        ? data.entityId
        : "";

  if (directOrderId) {
    return resolveNotificationPath(`/orders/${directOrderId}`);
  }

  return resolveNotificationPath(directPath);
}

function getOrderIdFromPath(path: string) {
  const match = path.match(/^\/orders\/([A-Za-z0-9_-]{6,80})$/);
  return match?.[1] ?? "";
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
      ?.projectId ??
      "");

  return easProjectId || undefined;
}

async function registerForPushNotificationsAsync() {
  if (!Device.isDevice) {
    logRiderPushDebug("[rider-push] Physical device not available for push registration.");
    return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#0f766e",
    });
    // Dedicated channel for a brand-new delivery assignment. Android plays the CHANNEL's
    // sound on the lock screen; the rider can also override it in the phone's notification
    // settings for this channel (WhatsApp-style).
    await Notifications.setNotificationChannelAsync("new-delivery", {
      name: "New deliveries",
      importance: Notifications.AndroidImportance.MAX,
      sound: "new_delivery.mp3",
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#0f766e",
    });
    // Late/urgent "hurry up" reminders (pickup or delivery running late).
    await Notifications.setNotificationChannelAsync("delivery-late", {
      name: "Delivery reminders",
      importance: Notifications.AndroidImportance.MAX,
      sound: "delivery_hurry.mp3",
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#0f766e",
    });
    // General: the common chime for every other rider notification.
    await Notifications.setNotificationChannelAsync("general", {
      name: "General",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "common.mp3",
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#0f766e",
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const permissionResult = await Notifications.requestPermissionsAsync();
    finalStatus = permissionResult.status;
  }

  if (finalStatus !== "granted") {
    logRiderPushDebug("[rider-push] Notification permission not granted.");
    return null;
  }

  const projectId = await getExpoProjectId();

  try {
    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    logRiderPushDebug("[rider-push] Expo push token acquired.");
    return token.data;
  } catch (error) {
    logRiderPushDebug("[rider-push] Failed to get Expo push token.", error);
    return null;
  }
}

export function RiderPushBridge({ children }: PropsWithChildren) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const rider = useRiderAuthStore((state) => state.rider);
  const isOnline = useNetworkStatus();
  const registerMutation = useRegisterRiderPushTokenMutation();
  const tokenRef = useRef("");

  useEffect(() => {
    void Notifications.setAutoServerRegistrationEnabledAsync(false).catch((error) => {
      logRiderPushDebug("[rider-push] Failed to disable Expo auto server registration.", error);
    });
  }, []);

  useEffect(() => {
    const openTarget = (data?: Record<string, unknown> | null) => {
      const target = resolveNotificationTarget(data);
      const orderId = getOrderIdFromPath(target);

      if (orderId) {
        void queryClient.invalidateQueries({ queryKey: ["rider", "order", orderId] });
        void queryClient.invalidateQueries({ queryKey: ["rider", "orders"] });
        void queryClient.invalidateQueries({ queryKey: ["rider", "live-map"] });
      }

      router.push(target as never);
    };

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        openTarget(response.notification.request.content.data);
        void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
      }
    );

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      openTarget(response.notification.request.content.data);
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    });

    return () => {
      responseSubscription.remove();
    };
  }, [queryClient, router]);

  useEffect(() => {
    if (!rider?.id) {
      if (tokenRef.current) {
        tokenRef.current = "";
        clearCurrentRiderExpoPushToken();
      }
      return;
    }

    if (!isOnline) {
      logRiderPushDebug("[rider-push] Device appears offline. Push registration skipped for now.");
      return;
    }

    const run = async () => {
      const expoPushToken = await registerForPushNotificationsAsync();

      if (!expoPushToken || tokenRef.current === expoPushToken) {
        if (!expoPushToken) {
          logRiderPushDebug("[rider-push] Push token unavailable. Registration skipped.");
        }
        return;
      }

      await registerMutation.mutateAsync({
        expoPushToken,
        platform: Platform.OS === "ios" ? "ios" : "android",
        deviceId: Constants.sessionId,
        appVersion: Constants.expoConfig?.version,
      });

      tokenRef.current = expoPushToken;
      setCurrentRiderExpoPushToken(expoPushToken);
      logRiderPushDebug("[rider-push] Push token registered with backend.");
    };

    void run().catch((error) => {
      logRiderPushDebug("[rider-push] Push registration failed.", error);
    });
  }, [isOnline, registerMutation, rider?.id]);

  return children;
}
