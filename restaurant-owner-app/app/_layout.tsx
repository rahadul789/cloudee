import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { AppProviders } from "@/src/providers/app-providers";

export default function RootLayout() {
  return (
    <AppProviders>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, freezeOnBlur: true }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="account-contact" />
        <Stack.Screen name="account-preparation-time" />
        <Stack.Screen name="owner-web-link" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="payout-method" />
        <Stack.Screen name="payout-method-verify" />
        <Stack.Screen name="vouchers" />
        <Stack.Screen name="orders/[orderId]" />
      </Stack>
    </AppProviders>
  );
}
