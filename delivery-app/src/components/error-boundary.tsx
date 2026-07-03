import { Component, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { palette } from "@/src/theme/palette";

type Props = { children: ReactNode };
type State = { hasError: boolean };

/**
 * Top-level crash guard. A render error anywhere below would otherwise white-screen
 * the whole app with no way out; here we show a recoverable fallback instead.
 *
 * Intentionally self-contained (static bilingual copy, only the static palette) —
 * it must keep working even if a provider/copy layer is the thing that threw. "Try
 * again" re-mounts the subtree, which recovers from transient render errors (e.g. a
 * bad frame that a refetch has since fixed).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // Kept visible in logs; a crash reporter can hook in here later.
    console.error("Rider app crashed:", error);
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View style={styles.container}>
        <Text style={styles.title}>কিছু একটা সমস্যা হয়েছে</Text>
        <Text style={styles.body}>
          অ্যাপে অপ্রত্যাশিত সমস্যা হয়েছে। আবার চেষ্টা করুন।
        </Text>
        <Text style={styles.bodyEn}>
          Something went wrong. Please try again.
        </Text>
        <Pressable
          style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null]}
          onPress={this.handleReset}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>আবার চেষ্টা করুন</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 10,
    backgroundColor: palette.background,
  },
  title: {
    fontSize: 18,
    fontWeight: "900",
    color: palette.foreground,
    textAlign: "center",
  },
  body: {
    fontSize: 14,
    fontWeight: "600",
    color: palette.mutedForeground,
    textAlign: "center",
  },
  bodyEn: {
    fontSize: 12,
    fontWeight: "500",
    color: palette.mutedForeground,
    textAlign: "center",
  },
  button: {
    marginTop: 14,
    minHeight: 48,
    paddingHorizontal: 26,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.secondary,
  },
  buttonPressed: {
    opacity: 0.88,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#fff",
  },
});
