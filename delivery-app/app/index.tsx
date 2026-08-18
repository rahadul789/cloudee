import { Redirect } from "expo-router";

import { useRiderAuthStore } from "@/src/store/auth-store";

export default function Index() {
  const isHydrated = useRiderAuthStore((state: { isHydrated: boolean }) => state.isHydrated);
  const rider = useRiderAuthStore((state: { rider: unknown }) => state.rider);

  if (!isHydrated) {
    return null;
  }

  if (!rider) {
    return <Redirect href="/sign-in" />;
  }

  return <Redirect href="/(app)/map" />;
}
