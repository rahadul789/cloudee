import type { Ionicons } from "@expo/vector-icons";
import { create } from "zustand";

import type { AppDialogTone } from "@/src/components/ui/app-dialog";

// Drop-in replacement for `Alert.alert` that renders the app's own AppDialog (mounted
// once by <AppAlertHost/> in the root layout) instead of the grey native OS dialog.
// Same button shape as React Native's Alert: { text, style: "cancel" | "destructive", onPress }.

export type AppAlertButton = {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
};

export type AppAlertOptions = {
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: AppDialogTone;
};

type AppAlertRequest = {
  id: number;
  title: string;
  message?: string;
  buttons: AppAlertButton[];
  options: AppAlertOptions;
};

type AppAlertState = {
  current: AppAlertRequest | null;
  queue: AppAlertRequest[];
  show: (request: AppAlertRequest) => void;
  dismiss: () => void;
};

let nextId = 1;

export const useAppAlertStore = create<AppAlertState>((set) => ({
  current: null,
  queue: [],
  show: (request) =>
    set((state) =>
      state.current ? { queue: [...state.queue, request] } : { current: request },
    ),
  dismiss: () =>
    set((state) => ({ current: state.queue[0] ?? null, queue: state.queue.slice(1) })),
}));

export function appAlert(
  title: string,
  message?: string,
  buttons?: AppAlertButton[],
  options: AppAlertOptions = {},
) {
  const resolvedButtons = buttons?.length ? buttons : [{ text: "OK" }];
  const hasDestructive = resolvedButtons.some((button) => button.style === "destructive");
  useAppAlertStore.getState().show({
    id: nextId++,
    title,
    message,
    buttons: resolvedButtons,
    options: {
      tone: options.tone ?? (hasDestructive ? "danger" : "default"),
      icon: options.icon ?? (hasDestructive ? "alert-circle-outline" : "information-circle-outline"),
    },
  });
}
