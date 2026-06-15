import { PropsWithChildren } from "react";
import { SafeAreaView } from "react-native-safe-area-context";

import { palette } from "@/src/theme/palette";

export function Screen({ children }: PropsWithChildren) {
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: palette.background }}
    >
      {children}
    </SafeAreaView>
  );
}
