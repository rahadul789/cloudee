import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";

import { AppDialog } from "@/src/components/ui";
import { formatDeliverToLine } from "@/src/lib/location-address";
import {
  formatBanglaDistance,
  shouldShowLocationReminder,
  type LocationReminderState,
} from "@/src/lib/location-reminder";
import { calculateDistanceMeters } from "@/src/lib/order-tracking";
import { useLocationStore } from "@/src/store/location-store";

const STATE_KEY = "foodbela-location-reminder-v1";
// Once per app launch at most (module scope survives screen remounts).
let checkedThisLaunch = false;

async function loadState(): Promise<LocationReminderState> {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<LocationReminderState>) : {};
    return {
      lastPromptAt: Number(parsed.lastPromptAt) || 0,
      snoozedLocationId: typeof parsed.snoozedLocationId === "string" ? parsed.snoozedLocationId : "",
      snoozedAt: Number(parsed.snoozedAt) || 0,
    };
  } catch {
    return { lastPromptAt: 0, snoozedLocationId: "", snoozedAt: 0 };
  }
}

async function saveState(patch: Partial<LocationReminderState>) {
  const current = await loadState();
  try {
    await AsyncStorage.setItem(STATE_KEY, JSON.stringify({ ...current, ...patch }));
  } catch {
    // best effort
  }
}

/**
 * On app open: if the phone is clearly somewhere else than the selected delivery address,
 * ask (in Bangla) whether to switch — restaurants, delivery fee and ETA all depend on it.
 * Uses location only if permission was ALREADY granted (never prompts), once per launch,
 * max once per 6h, and "keep this address" silences it for that address for a day.
 */
export function HomeLocationReminder({ active }: { active: boolean }) {
  const router = useRouter();
  const selectedLocation = useLocationStore((state) => state.selectedLocation);
  const setCurrentCoordinates = useLocationStore((state) => state.setCurrentCoordinates);
  const [prompt, setPrompt] = useState<{ distanceKm: number; locationId: string } | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    if (!active || !selectedLocation || checkedThisLaunch || runningRef.current) return;
    runningRef.current = true;
    const selected = selectedLocation;
    void (async () => {
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (permission.status !== "granted") return;
        const position =
          (await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000 })) ??
          (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        if (!position) return;
        checkedThisLaunch = true;
        const here = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        setCurrentCoordinates(here);
        const distanceKm =
          calculateDistanceMeters(here, { latitude: selected.latitude, longitude: selected.longitude }) / 1000;
        const state = await loadState();
        if (
          shouldShowLocationReminder({
            distanceKm,
            now: Date.now(),
            selectedLocationId: selected.id,
            state,
          })
        ) {
          await saveState({ lastPromptAt: Date.now() });
          setPrompt({ distanceKm, locationId: selected.id });
        }
      } catch {
        // location unavailable — never block the home screen
      } finally {
        runningRef.current = false;
      }
    })();
  }, [active, selectedLocation, setCurrentCoordinates]);

  if (!prompt) return null;

  const keep = () => {
    void saveState({ snoozedLocationId: prompt.locationId, snoozedAt: Date.now() });
    setPrompt(null);
  };

  return (
    <AppDialog
      visible
      onClose={keep}
      icon="navigate-outline"
      title="আপনি কি এখন অন্য জায়গায়? 📍"
      message={`আপনার এখনকার লোকেশন বাছাই করা ঠিকানা (${formatDeliverToLine(selectedLocation)}) থেকে ${formatBanglaDistance(prompt.distanceKm)} দূরে। সঠিক রেস্টুরেন্ট, ডেলিভারি চার্জ আর সময় দেখতে ঠিকানাটা আপডেট করে নিন।`}
      actions={[
        { label: "আগেরটাই থাক", variant: "secondary", onPress: keep },
        {
          label: "ঠিকানা আপডেট করি",
          onPress: () => {
            setPrompt(null);
            router.push({ pathname: "/location-picker", params: { useCurrent: "1" } });
          },
        },
      ]}
    />
  );
}
