import { QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { NetworkStatusBanner } from "@/src/components/network-status-banner";
import { NetworkStateBridge } from "@/src/components/network-state-bridge";
import { RiderLocationController } from "@/src/components/rider-location-controller";
import { PendingDeliverySync } from "@/src/components/pending-delivery-sync";
import { AppUpdateGate } from "@/src/components/app-update-gate";
import { RiderPushBridge } from "@/src/components/rider-push-bridge";
import { RiderSocketBridge } from "@/src/components/rider-socket-bridge";
import { queryClient } from "@/src/lib/query-client";
// Registers the background location TaskManager task (used by RiderLocationController).
import "@/src/lib/rider-background-location";

// One controller owns online rider presence and active delivery tracking, including
// the native foreground service used while the app is backgrounded.
export function AppProviders({ children }: PropsWithChildren) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <NetworkStateBridge />
          <RiderPushBridge>
            <View style={styles.shell}>
              <RiderSocketBridge />
              <PendingDeliverySync />
              <AppUpdateGate />
              <RiderLocationController>{children}</RiderLocationController>
              <NetworkStatusBanner />
            </View>
          </RiderPushBridge>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
});
