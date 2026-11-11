import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Keyboard,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { palette } from "@/src/theme/palette";

type AppBottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  subtitle?: string;
  leadingIcon?: keyof typeof Ionicons.glyphMap;
  snapPoints?: number[];
  initialSnapPoint?: number;
  footer?: ReactNode;
  scroll?: boolean;
  enablePanDownToClose?: boolean;
  closeOnBackdropPress?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  sheetStyle?: StyleProp<ViewStyle>;
  /** Round "×" at the header's right (default true when there is a header). */
  showCloseButton?: boolean;
};

function normalizeSnapPoint(value: number, screenHeight: number) {
  if (value > 1) {
    return Math.max(0.28, Math.min(0.95, value / screenHeight));
  }

  return Math.max(0.28, Math.min(0.95, value));
}

function getInitialSnapIndex(points: number[], initialSnapPoint?: number) {
  if (typeof initialSnapPoint !== "number") {
    return 0;
  }

  const index = points.findIndex((point) => Math.abs(point - initialSnapPoint) < 0.015);
  return index >= 0 ? index : 0;
}

export function AppBottomSheet({
  visible,
  onClose,
  children,
  title,
  subtitle,
  leadingIcon,
  snapPoints = [0.72],
  initialSnapPoint,
  footer,
  scroll = true,
  enablePanDownToClose = true,
  closeOnBackdropPress = true,
  contentContainerStyle,
  sheetStyle,
  showCloseButton = true,
}: AppBottomSheetProps) {
  const insets = useSafeAreaInsets();
  const dimensions = useWindowDimensions();
  const screenHeight = dimensions.height || Dimensions.get("window").height;
  const translateY = useRef(new Animated.Value(screenHeight)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [rendered, setRendered] = useState(visible);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Callers pass `snapPoints` as an inline array literal, so the reference changes
  // on every render. Key the memo on the serialized values instead so an unchanged
  // set of snap points keeps a stable reference — otherwise the "reset to initial
  // snap" effect below would fire on every parent re-render, collapsing a sheet the
  // user has expanded and replaying the open animation (the "close then reopen" jank).
  const snapPointsKey = snapPoints.join(",");
  const normalizedSnapPoints = useMemo(() => {
    const unique = Array.from(
      new Set(snapPoints.map((point) => normalizeSnapPoint(point, screenHeight)).sort((a, b) => a - b)),
    );
    return unique.length ? unique : [0.72];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenHeight, snapPointsKey]);

  const [activeSnapIndex, setActiveSnapIndex] = useState(() =>
    getInitialSnapIndex(normalizedSnapPoints, initialSnapPoint),
  );

  useEffect(() => {
    if (!visible) return;
    setActiveSnapIndex(getInitialSnapIndex(normalizedSnapPoints, initialSnapPoint));
  }, [initialSnapPoint, normalizedSnapPoints, visible]);

  const activeSnapPoint = normalizedSnapPoints[Math.min(activeSnapIndex, normalizedSnapPoints.length - 1)] ?? 0.72;
  const topGap = Math.max(insets.top + 28, 56);
  // Lift the sheet by the FULL keyboard height (the old 32% cap left a footer input — e.g.
  // the poll comment box — under taller keyboards) and shrink it so it still fits on screen.
  const keyboardLift = keyboardHeight > 0 ? keyboardHeight : 0;
  const sheetHeight = Math.min(
    screenHeight * activeSnapPoint,
    screenHeight - topGap - keyboardLift,
  );
  const surfaceColor = palette.background;
  const textColor = palette.foreground;
  const mutedTextColor = palette.mutedForeground;
  const borderColor = palette.border;

  const animateOpen = () => {
    translateY.setValue(screenHeight);
    backdropOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        damping: 24,
        stiffness: 220,
        mass: 0.9,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const animateClosed = useCallback((afterClose?: () => void) => {
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 160,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: sheetHeight + keyboardLift + 40,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        afterClose?.();
      }
    });
  }, [backdropOpacity, keyboardLift, sheetHeight, translateY]);

  const requestClose = useCallback(() => {
    if (!enablePanDownToClose && !closeOnBackdropPress) return;
    animateClosed(() => {
      setRendered(false);
      onClose();
    });
  }, [animateClosed, closeOnBackdropPress, enablePanDownToClose, onClose]);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      return;
    }

    if (rendered) {
      animateClosed(() => setRendered(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (visible && rendered) {
      animateOpen();
    }
    // Intentionally NOT keyed on sheetHeight: the open animation slides from the
    // bottom regardless of height, and re-running it on a snap/height change would
    // replay that slide-in (reads as a close-then-reopen). Snap changes resize the
    // sheet via layout while the pan spring keeps translateY at 0.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rendered, visible]);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dy) > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_, gesture) => {
          if (gesture.dy >= 0) {
            translateY.setValue(gesture.dy);
            return;
          }

          translateY.setValue(gesture.dy * 0.14);
        },
        onPanResponderRelease: (_, gesture) => {
          const shouldClose =
            enablePanDownToClose && (gesture.dy > 70 || gesture.vy > 1.1);

          if (shouldClose) {
            requestClose();
            return;
          }

          if (gesture.dy < -54 && activeSnapIndex < normalizedSnapPoints.length - 1) {
            setActiveSnapIndex((index) => Math.min(normalizedSnapPoints.length - 1, index + 1));
          } else if (gesture.dy > 54 && activeSnapIndex > 0) {
            setActiveSnapIndex((index) => Math.max(0, index - 1));
          }

          Animated.spring(translateY, {
            toValue: 0,
            tension: 90,
            friction: 12,
            useNativeDriver: true,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateY, {
            toValue: 0,
            tension: 90,
            friction: 12,
            useNativeDriver: true,
          }).start();
        },
      }),
    [activeSnapIndex, enablePanDownToClose, normalizedSnapPoints.length, requestClose, translateY],
  );

  if (!rendered) {
    return null;
  }

  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.content, contentContainerStyle]}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, contentContainerStyle]}>{children}</View>
  );

  return (
    <Modal visible={rendered} transparent animationType="none" onRequestClose={requestClose}>
      <View style={styles.modalRoot}>
        <Animated.View
          style={[
            styles.backdrop,
            {
              opacity: backdropOpacity,
            },
          ]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            disabled={!closeOnBackdropPress}
            onPress={requestClose}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              height: sheetHeight,
              marginBottom: keyboardLift,
              backgroundColor: surfaceColor,
              transform: [{ translateY }],
            },
            sheetStyle,
          ]}
        >
          <View style={styles.dragArea} {...panResponder.panHandlers}>
            <View style={styles.handle} />
            {(title || subtitle || leadingIcon) ? (
              <View style={styles.header}>
                {leadingIcon ? (
                  <View style={styles.leadingIcon}>
                    <Ionicons name={leadingIcon} size={18} color={palette.secondary} />
                  </View>
                ) : null}
                <View style={styles.headerCopy}>
                  {title ? (
                    <Text style={[styles.title, { color: textColor }]} numberOfLines={1}>
                      {title}
                    </Text>
                  ) : null}
                  {subtitle ? (
                    <Text style={[styles.subtitle, { color: mutedTextColor }]} numberOfLines={2}>
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
                {showCloseButton ? (
                  <Pressable
                    onPress={() =>
                      animateClosed(() => {
                        setRendered(false);
                        onClose();
                      })
                    }
                    hitSlop={10}
                    style={({ pressed }) => [styles.closeButton, pressed ? styles.closePressed : null]}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                  >
                    <Ionicons name="close" size={18} color={palette.foreground} />
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>

          <View style={styles.body}>{body}</View>

          {footer ? (
            <View
              style={[
                styles.footer,
                {
                  borderTopColor: borderColor,
                  paddingBottom: keyboardLift > 0 ? 10 : Math.max(insets.bottom, 12),
                },
              ]}
            >
              {footer}
            </View>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(17, 17, 17, 0.48)",
  },
  // Modern sheet: big 28px top radius, no outline, soft upward shadow.
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 0,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 18,
  },
  dragArea: {
    paddingTop: 0,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4.5,
    borderRadius: 999,
    marginTop: 10,
    marginBottom: 12,
    backgroundColor: "#D5D7DB",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  leadingIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primarySoft,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  closePressed: { opacity: 0.7 },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 19,
    lineHeight: 25,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400",
  },
  body: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 18,
    gap: 14,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: palette.surface,
  },
});
