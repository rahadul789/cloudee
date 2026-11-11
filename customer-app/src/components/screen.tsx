import { PropsWithChildren } from "react";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

import { palette } from "@/src/theme/palette";

export function Screen({
  children,
  edges = ["top", "left", "right"],
}: PropsWithChildren<{
  /** Drop "top" when a screen paints its own header under the status bar. */
  edges?: Edge[];
}>) {
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: palette.background }}>
      {children}
    </SafeAreaView>
  );
}
