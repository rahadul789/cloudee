import { useEffect, useState } from "react";

import { AppDialog } from "@/src/components/ui/app-dialog";
import { useAppAlertStore } from "@/src/lib/app-alert";

// Renders whatever `appAlert(...)` queued, one at a time. Mounted once in the root layout.
export function AppAlertHost() {
  const current = useAppAlertStore((state) => state.current);
  const dismiss = useAppAlertStore((state) => state.dismiss);
  // Keep the last request around while the dialog animates out.
  const [shown, setShown] = useState(current);
  useEffect(() => {
    if (current) setShown(current);
  }, [current]);

  if (!shown) return null;

  const cancelButton = shown.buttons.find((button) => button.style === "cancel");
  const close = () => {
    dismiss();
    cancelButton?.onPress?.();
  };

  return (
    <AppDialog
      key={shown.id}
      visible={Boolean(current && current.id === shown.id)}
      onClose={close}
      title={shown.title}
      message={shown.message}
      icon={shown.options.icon}
      tone={shown.options.tone}
      actions={shown.buttons.map((button) => ({
        label: button.text,
        variant:
          button.style === "cancel"
            ? "secondary"
            : button.style === "destructive"
              ? "danger"
              : "primary",
        onPress: () => {
          dismiss();
          button.onPress?.();
        },
      }))}
    />
  );
}
