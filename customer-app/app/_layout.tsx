import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import { AppBootstrapGate } from "@/src/components/app-bootstrap-gate";
import { CustomerAnalyticsBridge } from "@/src/components/customer-analytics-bridge";
import { DeferredMount } from "@/src/components/deferred-mount";
import { OtaUpdateGate } from "@/src/components/ota-update-gate";
import { AppProviders } from "@/src/providers/app-providers";
import { Sentry, initSentry, setSentryUser } from "@/src/lib/sentry";
import { useCustomerAuthStore } from "@/src/store/auth-store";

// Wire crash reporting before the first render, so even a startup crash is captured.
// No-op unless EXPO_PUBLIC_SENTRY_DSN is configured (preview/production builds).
initSentry();

function RootLayout() {
  // Keep the crash-report user in sync with the signed-in customer (id only, no PII).
  useEffect(() => {
    setSentryUser(useCustomerAuthStore.getState().customer?.id ?? null);
    return useCustomerAuthStore.subscribe((state) =>
      setSentryUser(state.customer?.id ?? null),
    );
  }, []);

  return (
    <AppProviders>
      <StatusBar style="dark" />
      <AppBootstrapGate>
        <DeferredMount>
          <CustomerAnalyticsBridge />
        </DeferredMount>
        <Stack
          screenOptions={{
            headerShown: false,
            freezeOnBlur: true,
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="verify" />
          <Stack.Screen name="checkout" />
          <Stack.Screen name="bkash-payment" />
          <Stack.Screen name="profile-edit" />
          <Stack.Screen name="profile-password" />
          <Stack.Screen name="payment-preferences" />
          <Stack.Screen name="referrals" />
          <Stack.Screen name="privacy-policy" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="offers" />
          <Stack.Screen name="offer-details" />
          <Stack.Screen name="support" />
          <Stack.Screen name="support-chat" />
          <Stack.Screen name="favorite-restaurants" />
          <Stack.Screen name="search" />
          <Stack.Screen name="order-help" />
          <Stack.Screen name="promo-details" />
          <Stack.Screen name="voucher-help" />
          <Stack.Screen name="payment-refunds" />
          <Stack.Screen name="orders/[orderId]" />
          <Stack.Screen name="orders/[orderId]/tracking" />
          <Stack.Screen name="restaurants/[restaurantId]" />
          <Stack.Screen
            name="location-picker"
            options={{ presentation: "card" }}
          />
        </Stack>
        <OtaUpdateGate />
      </AppBootstrapGate>
    </AppProviders>
  );
}

// Sentry.wrap adds the error/touch context provider. It is a harmless pass-through when
// Sentry is not initialised (no DSN), so it is always safe to keep.
export default Sentry.wrap(RootLayout);
