import { QueryClientProvider } from "@tanstack/react-query";
import { PropsWithChildren } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { CustomerLocationSync } from "@/src/components/customer-location-sync";
import { DeferredMount } from "@/src/components/deferred-mount";
import { NetworkStateBridge } from "@/src/components/network-state-bridge";
import { AppBannerHost } from "@/src/components/app-banner-host";
import { OfflineBanner } from "@/src/components/offline-banner";
import { CustomerPushBridge } from "@/src/components/customer-push-bridge";
import { CustomerSocketBridge } from "@/src/components/customer-socket-bridge";
import { LiveOrderFloatingButton } from "@/src/components/live-order-floating-button";
import { queryClient } from "@/src/lib/query-client";

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <CustomerPushBridge>
            {/* Critical for first paint: network state, location sync, offline notice. */}
            <NetworkStateBridge />
            <CustomerLocationSync />
            <OfflineBanner />
            {children}
            {/* Non-critical: mounted ~1.2s after first paint so startup stays fast.
                The live-order socket, in-app banner host and floating button do not
                affect the initial screen — matches the owner app's light startup. */}
            <DeferredMount>
              <CustomerSocketBridge />
              <AppBannerHost />
              <LiveOrderFloatingButton />
            </DeferredMount>
          </CustomerPushBridge>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
