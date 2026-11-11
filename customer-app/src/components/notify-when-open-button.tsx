import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { ActivityIndicator, Linking, StyleSheet, Text, View } from "react-native";

import { PressableScale } from "@/src/components/pressable-scale";
import { apiDelete, apiProtectedGet, apiProtectedPost } from "@/src/lib/api";
import { appAlert } from "@/src/lib/app-alert";
import { useCustomerAuthStore } from "@/src/store/auth-store";
import { useLocationStore } from "@/src/store/location-store";

type OpenNotifyStatus = {
  subscribed: boolean;
  notifyAt: string | null;
  opensAtLabel: string | null;
  result?: "scheduled" | "already_open" | "unknown_reopen";
};

const OPEN_NOTIFY_KEY = ["customer", "open-notify"] as const;

// Make sure the "we're open" push can actually be shown. The in-app notification is
// created either way, so a denied permission only loses the banner — tell the user once.
async function ensureNotificationPermission() {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.status === "granted") return;
    const asked = await Notifications.requestPermissionsAsync();
    if (asked.status === "granted") return;
    appAlert(
      "Turn on notifications",
      "We saved your reminder, but notifications are off for Foodbela, so you'll only see it inside the app.",
      [
        { text: "Not now", style: "cancel" },
        { text: "Open settings", onPress: () => void Linking.openSettings() },
      ],
      { icon: "notifications-off-outline" },
    );
  } catch {
    // permission APIs unavailable (simulator) — nothing to do
  }
}

/**
 * Shared reminder state. React Query dedupes the status fetch, so the home screen, the
 * button and the slim strip all read the same cache (subscribing in one updates the others).
 */
export function useOpenNotify(active = true) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const signedIn = useCustomerAuthStore((state) => Boolean(state.accessToken));
  const location = useLocationStore((state) => state.selectedLocation);

  const statusQuery = useQuery({
    queryKey: OPEN_NOTIFY_KEY,
    queryFn: async () =>
      (await apiProtectedGet<OpenNotifyStatus>("/customer/open-notify")).data,
    enabled: signedIn && active,
    staleTime: 60_000,
  });

  const subscribe = useMutation({
    mutationFn: async () =>
      (
        await apiProtectedPost<OpenNotifyStatus>("/customer/open-notify", {
          latitude: location?.latitude,
          longitude: location?.longitude,
        })
      ).data,
    onSuccess: (data) => {
      queryClient.setQueryData(OPEN_NOTIFY_KEY, data);
      if (data.result === "already_open") {
        appAlert("Foodbela is open", "Restaurants near you are taking orders right now.", undefined, {
          icon: "checkmark-circle-outline",
          tone: "success",
        });
        void queryClient.invalidateQueries({ queryKey: ["customer"] });
        return;
      }
      if (data.result === "unknown_reopen") {
        appAlert(
          "Couldn't set a reminder",
          "We don't know the reopening time for your area yet. Please check back a little later.",
          undefined,
          { icon: "time-outline" },
        );
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      void ensureNotificationPermission();
    },
    onError: () =>
      appAlert("Something went wrong", "Couldn't save your reminder. Please try again.", undefined, {
        icon: "cloud-offline-outline",
      }),
  });

  const cancel = useMutation({
    mutationFn: async () => (await apiDelete<OpenNotifyStatus>("/customer/open-notify")).data,
    onSuccess: (data) => queryClient.setQueryData(OPEN_NOTIFY_KEY, data),
  });

  const subscribed = signedIn && statusQuery.data?.subscribed === true;
  const busy = subscribe.isPending || cancel.isPending;
  const canSubscribe =
    typeof location?.latitude === "number" && typeof location?.longitude === "number";

  const toggle = () => {
    if (busy) return;
    if (!signedIn) {
      router.push({ pathname: "/sign-in", params: { redirectTo: "/(tabs)" } });
      return;
    }
    if (subscribed) {
      cancel.mutate();
      return;
    }
    if (!canSubscribe) {
      router.push("/location-picker");
      return;
    }
    subscribe.mutate();
  };

  return { signedIn, subscribed, busy, opensAtLabel: statusQuery.data?.opensAtLabel ?? null, toggle };
}

/**
 * "Notify me when open" — sits inside the Foodbela-closed hero. Signed-in customers get a
 * push at the area's reopen time; guests are sent to sign in first (pushes are per account).
 * Step 1 of the pre-order plan: it also measures demand while closed (admin stats).
 */
export function NotifyWhenOpenButton() {
  const { signedIn, subscribed, busy, opensAtLabel, toggle: handlePress } = useOpenNotify();

  return (
    <View style={styles.wrap}>
      <PressableScale
        scaleTo={0.97}
        onPress={handlePress}
        disabled={busy}
        style={[styles.button, subscribed ? styles.buttonDone : null]}
        accessibilityRole="button"
        accessibilityLabel={subscribed ? "Cancel the reminder" : "Notify me when Foodbela opens"}
      >
        {busy ? (
          <ActivityIndicator size="small" color={subscribed ? "#FFFFFF" : "#111111"} />
        ) : (
          <>
            <Ionicons
              name={subscribed ? "notifications" : "notifications-outline"}
              size={17}
              color={subscribed ? "#FFFFFF" : "#111111"}
            />
            <Text style={[styles.buttonText, subscribed ? styles.buttonTextDone : null]}>
              {subscribed ? "We'll notify you" : "Notify me when open"}
            </Text>
          </>
        )}
      </PressableScale>
      <Text style={styles.hint}>
        {subscribed
          ? `Reminder set${opensAtLabel ? ` for ${opensAtLabel}` : ""} · tap to cancel`
          : signedIn
            ? "We'll ping you the moment we open."
            : "Sign in to get a ping when we open."}
      </Text>
    </View>
  );
}

/**
 * Once the reminder is set the big closed card has done its job — home shows this one-line
 * strip instead (moon · opening time · bell · Cancel). Tapping Cancel brings the card back.
 */
export function ClosedReminderStrip({ opensAtLabel }: { opensAtLabel?: string | null }) {
  const { busy, toggle, opensAtLabel: reminderLabel } = useOpenNotify();
  const label = reminderLabel || opensAtLabel;
  return (
    <View style={styles.strip}>
      <View style={styles.stripMoon}>
        <Ionicons name="moon" size={14} color="#111111" />
      </View>
      <Text style={styles.stripText} numberOfLines={1}>
        Closed{label ? ` · we'll ping you at ${label}` : " · we'll ping you when we open"}
      </Text>
      <PressableScale
        scaleTo={0.94}
        onPress={toggle}
        disabled={busy}
        hitSlop={8}
        style={styles.stripCancel}
        accessibilityRole="button"
        accessibilityLabel="Cancel the reminder"
      >
        {busy ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Text style={styles.stripCancelText}>Cancel</Text>
        )}
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    marginHorizontal: 16,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 8,
    paddingRight: 6,
    borderRadius: 23,
    backgroundColor: "#1C1C21",
  },
  stripMoon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFB84C",
  },
  stripText: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: "500", color: "#FFFFFF" },
  stripCancel: {
    minWidth: 64,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  stripCancelText: { fontSize: 12.5, fontWeight: "700", color: "#FFFFFF" },
  // Lives inside the dark closed card: brand amber pill (dark text), outlined once set.
  wrap: { flexDirection: "row", alignItems: "center", gap: 12 },
  button: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 15,
    borderRadius: 999,
    backgroundColor: "#FFB84C",
  },
  buttonDone: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
  },
  buttonText: { fontSize: 13.5, lineHeight: 18, fontWeight: "700", color: "#111111" },
  buttonTextDone: { color: "#FFFFFF" },
  hint: { flex: 1, fontSize: 11.5, lineHeight: 15, color: "rgba(255,255,255,0.6)" },
});
