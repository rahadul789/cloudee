import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { PressableScale } from "@/src/components/pressable-scale";
import { palette } from "@/src/theme/palette";

export type AppDialogTone = "default" | "danger" | "success";

export type AppDialogAction = {
  label: string;
  onPress?: () => void;
  /** primary = amber fill, secondary = soft grey, danger = red fill. */
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
  disabled?: boolean;
};

type AppDialogProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  message?: ReactNode;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: AppDialogTone;
  /** Extra content between the message and the actions (e.g. an item preview). */
  children?: ReactNode;
  actions?: AppDialogAction[];
  /** Backdrop tap / back button closes it (default true). */
  dismissible?: boolean;
};

const TONES: Record<AppDialogTone, { bg: string; fg: string }> = {
  default: { bg: "#FFF4E0", fg: palette.secondary },
  danger: { bg: "#FDECEC", fg: "#D93025" },
  success: { bg: "#E7F7EE", fg: palette.successText },
};

// The ONE centered dialog of the customer app: soft dimmed backdrop, card springs up from
// a slight scale, tinted icon badge, title + message, stacked full-width pill actions.
// Every confirm/alert goes through this (directly, or via `appAlert`) so restyling is
// a single-file change.
export function AppDialog({
  visible,
  onClose,
  title,
  message,
  icon,
  tone = "default",
  children,
  actions = [],
  dismissible = true,
}: AppDialogProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const [rendered, setRendered] = useState(visible);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      progress.setValue(0);
      Animated.spring(progress, {
        toValue: 1,
        damping: 18,
        stiffness: 230,
        mass: 0.8,
        useNativeDriver: true,
      }).start();
      return;
    }
    Animated.timing(progress, {
      toValue: 0,
      duration: 150,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setRendered(false);
    });
  }, [progress, visible]);

  if (!rendered) return null;

  const toneColors = TONES[tone];
  const requestClose = () => {
    if (dismissible) onClose();
  };

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={requestClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: progress }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={requestClose}
            accessibilityLabel="Close dialog"
          />
        </Animated.View>

        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.card,
            {
              opacity: progress,
              transform: [
                {
                  scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }),
                },
                {
                  translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }),
                },
              ],
            },
          ]}
        >
          {dismissible ? (
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={styles.close}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={18} color={palette.mutedForeground} />
            </Pressable>
          ) : null}

          {icon ? (
            <View style={[styles.iconBadge, { backgroundColor: toneColors.bg }]}>
              <Ionicons name={icon} size={26} color={toneColors.fg} />
            </View>
          ) : null}

          <Text style={styles.title}>{title}</Text>
          {message ? (
            typeof message === "string" ? (
              <Text style={styles.message}>{message}</Text>
            ) : (
              message
            )
          ) : null}

          {children}

          {actions.length ? (
            <View style={[styles.actions, actions.length === 2 ? styles.actionsRow : null]}>
              {actions.map((action) => {
                const variant = action.variant ?? "primary";
                return (
                  <PressableScale
                    key={action.label}
                    scaleTo={0.96}
                    containerStyle={actions.length === 2 ? styles.actionFlex : null}
                    disabled={action.disabled || action.loading}
                    onPress={action.onPress}
                    accessibilityRole="button"
                    style={[
                      styles.button,
                      variant === "primary"
                        ? styles.buttonPrimary
                        : variant === "danger"
                          ? styles.buttonDanger
                          : styles.buttonSecondary,
                      action.disabled ? styles.buttonDisabled : null,
                    ]}
                  >
                    {action.loading ? (
                      <ActivityIndicator
                        size="small"
                        color={variant === "danger" ? "#FFFFFF" : palette.onPrimary}
                      />
                    ) : (
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.buttonText,
                          variant === "danger" ? styles.buttonTextDanger : null,
                        ]}
                      >
                        {action.label}
                      </Text>
                    )}
                  </PressableScale>
                );
              })}
            </View>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

/** Shared text styles so custom dialog bodies match (e.g. bold names in a message). */
const MESSAGE_STYLE = {
  fontSize: 14,
  lineHeight: 21,
  color: palette.mutedForeground,
  textAlign: "center" as const,
};

export const appDialogText = StyleSheet.create({
  message: MESSAGE_STYLE,
  strong: { fontWeight: "700", color: palette.foreground },
});

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 22 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(17, 17, 17, 0.48)" },
  card: {
    width: "100%",
    maxWidth: 380,
    alignItems: "stretch",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 18,
    borderRadius: 28,
    backgroundColor: palette.surface,
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 14,
  },
  close: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceMuted,
    zIndex: 2,
  },
  iconBadge: {
    alignSelf: "center",
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  title: {
    fontSize: 19,
    lineHeight: 25,
    fontWeight: "700",
    color: palette.foreground,
    textAlign: "center",
    paddingHorizontal: 18,
  },
  message: MESSAGE_STYLE,
  actions: { gap: 10, marginTop: 8 },
  actionsRow: { flexDirection: "row" },
  actionFlex: { flex: 1 },
  button: {
    minHeight: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  buttonPrimary: { backgroundColor: palette.primary },
  buttonSecondary: { backgroundColor: palette.surfaceMuted },
  buttonDanger: { backgroundColor: "#D93025" },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { fontSize: 14.5, lineHeight: 19, fontWeight: "700", color: palette.onPrimary },
  buttonTextDanger: { color: "#FFFFFF" },
});
