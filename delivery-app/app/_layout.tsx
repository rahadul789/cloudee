import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { AppBootstrapGate } from "@/src/components/app-bootstrap-gate";
import { AppProviders } from "@/src/providers/app-providers";

export default function RootLayout() {
  return (
    <AppProviders>
      <StatusBar style="dark" />
      <AppBootstrapGate>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="verify" />
          <Stack.Screen name="(app)" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="orders/[orderId]" />
        </Stack>
      </AppBootstrapGate>
    </AppProviders>
  );
}
