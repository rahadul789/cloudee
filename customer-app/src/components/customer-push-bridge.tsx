import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { usePathname, useRouter } from "expo-router";
import { PropsWithChildren, useEffect, useRef } from "react";
import { Platform } from "react-native";

import {
  useRegisterCustomerPushTokenMutation,
  useUnregisterCustomerPushTokenMutation,
} from "@/src/hooks/use-customer-api";
import { apiPost } from "@/src/lib/api";
import {
  clearRegisteredCustomerPushToken,
  saveRegisteredCustomerPushToken,
} from "@/src/lib/customer-push-token-store";
import { getStableCustomerInstallId } from "@/src/lib/customer-install-id";
import {
  getCustomerOrderIdFromPath,
  refreshCustomerOrderCacheForPath,
} from "@/src/lib/customer-order-cache";
import { resolveCustomerPushRoute } from "@/src/lib/customer-routes";
import { queryClient } from "@/src/lib/query-client";
import { useIsOnline } from "@/src/hooks/use-network-status";
import { useCustomerAuthStore } from "@/src/store/auth-store";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const PUSH_AUTH_SETTLE_DELAY_MS = 700;
const PUSH_DEBUG_ENABLED =
  __DEV__ &&
  Boolean(
    (Constants.expoConfig?.extra as { enablePushDebug?: boolean } | undefined)
      ?.enablePushDebug,
  );

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isOrderRoute(path: string) {
  return /^\/orders\/[A-Za-z0-9_-]+(?:\/tracking)?$/.test(path);
}

function getRoutePathname(path: string) {
  return path.split(/[?#]/, 1)[0] || path;
}

function isAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /auth|unauthorized|access token|session/i.test(message);
}

function logPushDebug(message: string, details?: unknown) {
  if (!PUSH_DEBUG_ENABLED) return;
  if (details === undefined) {
    console.log(message);
    return;
  }
  console.log(message, details);
}

async function getExpoProjectId() {
  const easProjectId =
    Constants.easConfig?.projectId ??
    ((Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
      "");

  return easProjectId || undefined;
}

async function registerForPushNotificationsAsync() {
  if (!Device.isDevice) {
    logPushDebug("[push] Physical device not available for push registration.");
    return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#0EA5E9",
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const permissionResult = await Notifications.requestPermissionsAsync();
    finalStatus = permissionResult.status;
  }

  if (finalStatus !== "granted") {
    logPushDebug("[push] Notification permission not granted.");
    return null;
  }

  const projectId = await getExpoProjectId();
  try {
    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );

    logPushDebug("[push] Expo push token acquired.");
    return token.data;
  } catch (error) {
    logPushDebug("[push] Failed to get Expo push token.", error);
    return null;
  }
}

export function CustomerPushBridge({ children }: PropsWithChildren) {
  const router = useRouter();
  const pathname = usePathname();
  const customer = useCustomerAuthStore((state) => state.customer);
  const isHydrated = useCustomerAuthStore((state) => state.isHydrated);
  const accessToken = useCustomerAuthStore((state) => state.accessToken);
  const isOnline = useIsOnline();
  const registerMutation = useRegisterCustomerPushTokenMutation();
  const unregisterMutation = useUnregisterCustomerPushTokenMutation();
  const tokenRef = useRef("");
  const registeredKeyRef = useRef("");
  const failedAuthKeyRef = useRef("");
  const inFlightKeyRef = useRef("");
  const currentPathRef = useRef(pathname);
  const recentNavigationRef = useRef<{ key: string; openedAt: number } | null>(
    null,
  );
  const registerPushTokenRef = useRef(registerMutation.mutateAsync);
  const unregisterPushTokenRef = useRef(unregisterMutation.mutateAsync);

  useEffect(() => {
    currentPathRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    registerPushTokenRef.current = registerMutation.mutateAsync;
  }, [registerMutation.mutateAsync]);

  useEffect(() => {
    unregisterPushTokenRef.current = unregisterMutation.mutateAsync;
  }, [unregisterMutation.mutateAsync]);

  useEffect(() => {
    void Notifications.setAutoServerRegistrationEnabledAsync(false).catch((error) => {
      logPushDebug("[push] Failed to disable Expo auto server registration.", error);
    });
  }, []);

  useEffect(() => {
    const recordOpen = (data?: Record<string, unknown>) => {
      if (!data) return;
      const pushTarget = resolveCustomerPushRoute(data);
      const orderId = getCustomerOrderIdFromPath(pushTarget);

      if (orderId) {
        void refreshCustomerOrderCacheForPath(queryClient, pushTarget, 0);
        void queryClient.invalidateQueries({ queryKey: ["customer", "orders"] });
      }

      void apiPost("/customer/push-events/open", {
        source: data.source,
        notificationId: data.notificationId,
        campaignId: data.campaignId,
        voucherId: data.voucherId,
        path: data.path,
        variant: data.variant,
      })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["customer", "notifications"] });
        })
        .catch(() => undefined);
    };

    const openNotificationTarget = async (data?: Record<string, unknown>) => {
      const target = resolveCustomerPushRoute(data);
      const navigationKey = `${String(data?.notificationId ?? data?.campaignId ?? "")}:${target}`;
      const recentNavigation = recentNavigationRef.current;
      const now = Date.now();

      if (
        recentNavigation?.key === navigationKey &&
        now - recentNavigation.openedAt < 1500
      ) {
        return;
      }

      recentNavigationRef.current = { key: navigationKey, openedAt: now };

      const currentPath = currentPathRef.current;

      if (currentPath === target) {
        return;
      }

      if (isOrderRoute(target)) {
        await refreshCustomerOrderCacheForPath(queryClient, target);
      }

      if (
        currentPath === "/notifications" ||
        (currentPath === "/promo-details" && getRoutePathname(target) === "/promo-details") ||
        (isOrderRoute(currentPath) && isOrderRoute(target))
      ) {
        router.replace(target as never);
        return;
      }

      router.push(target as never);
    };

    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      void notification;
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        recordOpen(data);
        void openNotificationTarget(data);
        void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
      }
    );

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = response.notification.request.content.data;
      recordOpen(data);
      void openNotificationTarget(data);
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    });

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, [router]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (!customer?.id || !accessToken) {
      tokenRef.current = "";
      registeredKeyRef.current = "";
      failedAuthKeyRef.current = "";
      inFlightKeyRef.current = "";
      return;
    }

    if (!isOnline) {
      logPushDebug("[push] Device appears offline. Push registration skipped for now.");
      return;
    }

    const run = async () => {
      await wait(PUSH_AUTH_SETTLE_DELAY_MS);

      const settledAuth = useCustomerAuthStore.getState();
      if (
        settledAuth.customer?.id !== customer.id ||
        settledAuth.accessToken !== accessToken ||
        !settledAuth.accessToken
      ) {
        logPushDebug("[push] Auth changed before push registration. Skipped.");
        return;
      }

      const expoPushToken = await registerForPushNotificationsAsync();

      if (!expoPushToken || tokenRef.current === expoPushToken) {
        if (!expoPushToken) {
          logPushDebug("[push] Push token unavailable. Registration skipped.");
        }
        return;
      }

      const currentAuth = useCustomerAuthStore.getState();
      if (
        currentAuth.customer?.id !== customer.id ||
        currentAuth.accessToken !== accessToken ||
        !currentAuth.accessToken
      ) {
        logPushDebug("[push] Auth changed after push token acquisition. Skipped.");
        return;
      }

      const registrationKey = `${customer.id}:${expoPushToken}:${accessToken}`;
      if (
        registeredKeyRef.current === registrationKey ||
        failedAuthKeyRef.current === registrationKey ||
        inFlightKeyRef.current === registrationKey
      ) {
        return;
      }

      inFlightKeyRef.current = registrationKey;

      try {
        await registerPushTokenRef.current({
          expoPushToken,
          platform: Platform.OS === "ios" ? "ios" : "android",
          deviceId: await getStableCustomerInstallId(),
          appVersion: Constants.expoConfig?.version,
        });
      } catch (error) {
        if (isAuthError(error)) {
          failedAuthKeyRef.current = registrationKey;
        }
        throw error;
      } finally {
        if (inFlightKeyRef.current === registrationKey) {
          inFlightKeyRef.current = "";
        }
      }

      registeredKeyRef.current = registrationKey;
      failedAuthKeyRef.current = "";
      tokenRef.current = expoPushToken;
      await saveRegisteredCustomerPushToken({
        customerId: customer.id,
        expoPushToken,
      }).catch((error) => {
        logPushDebug("[push] Failed to persist registered push token.", error);
      });
      logPushDebug("[push] Push token registered with backend.");
    };

    void run().catch((error) => {
      if (isAuthError(error)) {
        logPushDebug("[push] Push registration skipped until authentication is ready.");
        return;
      }

      logPushDebug("[push] Push registration failed.", error);
    });
  }, [accessToken, customer?.id, isHydrated, isOnline]);

  useEffect(() => {
    if (!isHydrated || customer?.id || !accessToken || !tokenRef.current) {
      return;
    }

    const expoPushToken = tokenRef.current;
    tokenRef.current = "";
    registeredKeyRef.current = "";
    failedAuthKeyRef.current = "";
    inFlightKeyRef.current = "";

    void unregisterPushTokenRef
      .current({ expoPushToken })
      .then(() => clearRegisteredCustomerPushToken())
      .catch(() => undefined);
  }, [accessToken, customer?.id, isHydrated]);

  return children;
}
