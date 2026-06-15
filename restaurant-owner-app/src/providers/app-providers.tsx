import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PropsWithChildren, useState } from "react";
import { StyleSheet, View } from "react-native";

import { NetworkStatusBanner } from "@/src/components/network-status-banner";
import { OwnerPushBridge } from "@/src/components/owner-push-bridge";
import { OwnerSocketBridge } from "@/src/components/owner-socket-bridge";

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 20_000,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <OwnerPushBridge>
        <View style={styles.shell}>
          <OwnerSocketBridge />
          {children}
          <NetworkStatusBanner />
        </View>
      </OwnerPushBridge>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
});
