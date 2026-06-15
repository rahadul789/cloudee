import { Ionicons } from "@expo/vector-icons";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
  useColorScheme,
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
}: AppBottomSheetProps) {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const dimensions = useWindowDimensions();
  const screenHeight = dimensions.height || Dimensions.get("window").height;
  const translateY = useRef(new Animated.Value(screenHeight)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [rendered, setRendered] = useState(visible);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const normalizedSnapPoints = useMemo(() => {
    const unique = [
      ...new Set(
        snapPoints
          .map((point) => normalizeSnapPoint(point, screenHeight))
          .sort((a, b) => a - b),
      ),
    ];
    return unique.length ? unique : [0.72];
  }, [screenHeight, snapPoints]);

  const [activeSnapIndex, setActiveSnapIndex] = useState(() =>
    getInitialSnapIndex(normalizedSnapPoints, initialSnapPoint),
  );

  useEffect(() => {
    if (!visible) return;
    setActiveSnapIndex(getInitialSnapIndex(normalizedSnapPoints, initialSnapPoint));
  }, [initialSnapPoint, normalizedSnapPoints, visible]);

  const activeSnapPoint =
    normalizedSnapPoints[Math.min(activeSnapIndex, normalizedSnapPoints.length - 1)] ?? 0.72;
  const topGap = Math.max(insets.top + 28, 56);
  const sheetHeight = Math.min(screenHeight * activeSnapPoint, screenHeight - topGap);
  const keyboardLift = keyboardHeight
    ? Math.min(keyboardHeight * 0.35, screenHeight * 0.14)
    : 0;
  const isDark = colorScheme === "dark";

  const surfaceColor = isDark ? "#191C24" : palette.background;
  const textColor = isDark ? "#F6F7FB" : palette.foreground;
  const mutedTextColor = isDark ? "#ADB3C4" : palette.mutedForeground;
  const borderColor = isDark ? "rgba(255,255,255,0.1)" : palette.border;

  const animateOpen = useCallback(() => {
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
  }, [backdropOpacity, screenHeight, translateY]);

  const animateClosed = useCallback(
    (afterClose?: () => void) => {
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
    },
    [backdropOpacity, keyboardLift, sheetHeight, translateY],
  );

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
  }, [animateClosed, rendered, visible]);

  useEffect(() => {
    if (visible && rendered) {
      animateOpen();
    }
  }, [animateOpen, rendered, sheetHeight, visible]);

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
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dy) > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_, gesture) => {
          translateY.setValue(gesture.dy >= 0 ? gesture.dy : gesture.dy * 0.14);
        },
        onPanResponderRelease: (_, gesture) => {
          const shouldClose =
            enablePanDownToClose &&
            (gesture.dy > 70 || gesture.vy > 1.1);

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
    [
      activeSnapIndex,
      enablePanDownToClose,
      normalizedSnapPoints.length,
      requestClose,
      translateY,
    ],
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
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
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
              borderColor,
              transform: [{ translateY }],
            },
            sheetStyle,
          ]}
        >
          <View style={styles.dragArea} {...panResponder.panHandlers}>
            <View style={[styles.handle, { backgroundColor: isDark ? "#3A4050" : "#D8CDD3" }]} />
            {title || subtitle || leadingIcon ? (
              <View style={styles.header}>
                {leadingIcon ? (
                  <View
                    style={[
                      styles.leadingIcon,
                    { backgroundColor: isDark ? "#252A36" : "#FFEAF2" },
                    ]}
                  >
                    <Ionicons name={leadingIcon} size={18} color={palette.primary} />
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
                <Pressable
                  style={[
                    styles.closeButton,
                    { backgroundColor: isDark ? "#252A36" : palette.surfaceMuted },
                  ]}
                  onPress={requestClose}
                >
                  <Ionicons name="close" size={18} color={textColor} />
                </Pressable>
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
                  paddingBottom: Math.max(insets.bottom, 12),
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
    backgroundColor: "rgba(17, 13, 16, 0.34)",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    overflow: "hidden",
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -10 },
    elevation: 18,
  },
  dragArea: {
    paddingTop: 0,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 999,
    marginTop: 12,
    marginBottom: 13,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  leadingIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "900",
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
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
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: palette.surface,
  },
});
