import { QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { NetworkStatusBanner } from "@/src/components/network-status-banner";
import { NetworkStateBridge } from "@/src/components/network-state-bridge";
import { RiderLocationController } from "@/src/components/rider-location-controller";
import { RiderPushBridge } from "@/src/components/rider-push-bridge";
import { RiderSocketBridge } from "@/src/components/rider-socket-bridge";
import { queryClient } from "@/src/lib/query-client";

// LIVE TRACKING (rebuilt): RiderLocationController is the single, foreground location
// producer — it publishes the rider's position during an active delivery. Background
// continuity (foreground-service) is added in a later step.
export function AppProviders({ children }: PropsWithChildren) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <NetworkStateBridge />
          <RiderPushBridge>
            <View style={styles.shell}>
              <RiderSocketBridge />
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
