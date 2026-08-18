import { Redirect, useLocalSearchParams } from "expo-router";

// The full rider order-details SCREEN has been retired — everything it showed (map, route,
// distance/ETA, timeline, items, actions, "can't deliver") now lives in the home map's
// bottom sheet. Keeping a heavy screen mounted for each order hurt performance, so this route
// just forwards any deep-link / notification / list tap that still points at /orders/:id to
// the home map with that order pre-selected (the sheet opens on it). The old implementation
// is preserved in git history if it's ever needed again.
export default function RiderOrderDetailsRedirect() {
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  return (
    <Redirect
      href={{ pathname: "/(app)/map", params: orderId ? { orderId } : {} }}
    />
  );
}
