import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { AppBootstrapGate } from "@/src/components/app-bootstrap-gate";
import { CustomerAnalyticsBridge } from "@/src/components/customer-analytics-bridge";
import { AppProviders } from "@/src/providers/app-providers";

export default function RootLayout() {
  return (
    <AppProviders>
      <StatusBar style="dark" />
      <AppBootstrapGate>
        <CustomerAnalyticsBridge />
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
      </AppBootstrapGate>
    </AppProviders>
  );
}
