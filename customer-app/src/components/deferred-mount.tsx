import { type ReactNode, useEffect, useState } from "react";
import { InteractionManager } from "react-native";

/**
 * Mounts its children only AFTER the first paint + initial interactions settle,
 * plus a small extra delay. Used to keep non-critical global widgets (live-order
 * floating button, in-app banner host, socket bridge, analytics) off the
 * critical startup path so the app shell appears as fast as the owner app.
 */
export function DeferredMount({
  children,
  delayMs = 1200,
}: {
  children: ReactNode;
  delayMs?: number;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const interaction = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => setReady(true), delayMs);
    });

    return () => {
      interaction.cancel();
      if (timer) clearTimeout(timer);
    };
  }, [delayMs]);

  return ready ? <>{children}</> : null;
}
