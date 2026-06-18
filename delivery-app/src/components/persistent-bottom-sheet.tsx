import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { palette } from "@/src/theme/palette";

const HANDLE_ZONE_HEIGHT = 42;

export type PersistentBottomSheetHandle = {
  expand: () => void;
  collapse: () => void;
  toggle: () => void;
};

type PersistentBottomSheetProps = {
  /** Visible height of the sheet (handle + peek) when collapsed. */
  collapsedHeight: number;
  /** Total height of the sheet when fully expanded. */
  expandedHeight: number;
  /** Always-visible content rendered under the drag handle. */
  peek: ReactNode;
  /** Scrollable detail content, revealed as the sheet expands. */
  children: ReactNode;
  scrollEnabled?: boolean;
  dragEnabled?: boolean;
  peekDragHeight?: number;
  onExpandedChange?: (expanded: boolean) => void;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
};

export const PersistentBottomSheet = forwardRef<
  PersistentBottomSheetHandle,
  PersistentBottomSheetProps
>(function PersistentBottomSheet(
  {
    collapsedHeight,
    expandedHeight,
    peek,
    children,
    scrollEnabled = true,
    dragEnabled = true,
    peekDragHeight,
    onExpandedChange,
    contentContainerStyle,
    style,
  },
  ref,
) {
  const safeExpandedHeight = Math.max(expandedHeight, collapsedHeight + 80);
  const collapsedOffset = Math.max(0, safeExpandedHeight - collapsedHeight);
  const peekHeight = Math.max(0, collapsedHeight - HANDLE_ZONE_HEIGHT);
  const bodyHeight = Math.max(0, safeExpandedHeight - collapsedHeight);
  const safePeekDragHeight = Math.max(
    48,
    Math.min(peekHeight, peekDragHeight ?? Math.min(140, peekHeight)),
  );

  const translateY = useRef(new Animated.Value(collapsedOffset)).current;
  const currentOffsetRef = useRef(collapsedOffset);
  const gestureBaseRef = useRef(collapsedOffset);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const id = translateY.addListener(({ value }) => {
      currentOffsetRef.current = value;
    });
    return () => translateY.removeListener(id);
  }, [translateY]);

  const animateTo = useCallback(
    (offset: number) => {
      Animated.spring(translateY, {
        toValue: offset,
        damping: 26,
        stiffness: 240,
        mass: 0.9,
        overshootClamping: true,
        useNativeDriver: true,
      }).start();
    },
    [translateY],
  );

  const toggleExpanded = useCallback(() => {
    setExpanded((value) => !value);
  }, []);

  useEffect(() => {
    animateTo(expanded ? 0 : collapsedOffset);
  }, [animateTo, collapsedOffset, expanded]);

  useEffect(() => {
    onExpandedChange?.(expanded);
  }, [expanded, onExpandedChange]);

  useImperativeHandle(
    ref,
    () => ({
      expand: () => setExpanded(true),
      collapse: () => setExpanded(false),
      toggle: () => setExpanded((value) => !value),
    }),
    [],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (event, gesture) =>
          dragEnabled &&
          event.nativeEvent.locationY <= safePeekDragHeight &&
          Math.abs(gesture.dy) > 4 &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onMoveShouldSetPanResponderCapture: (event, gesture) =>
          dragEnabled &&
          event.nativeEvent.locationY <= safePeekDragHeight &&
          Math.abs(gesture.dy) > 12 &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.2,
        onPanResponderGrant: () => {
          gestureBaseRef.current = currentOffsetRef.current;
          translateY.stopAnimation();
        },
        onPanResponderMove: (_, gesture) => {
          const next = Math.min(
            collapsedOffset,
            Math.max(0, gestureBaseRef.current + gesture.dy),
          );
          translateY.setValue(next);
        },
        onPanResponderRelease: (_, gesture) => {
          const travelled = Math.abs(gesture.dy);

          // A near-stationary touch on the handle is a tap: toggle the sheet.
          if (travelled < 6) {
            setExpanded((value) => !value);
            return;
          }

          const movingUp = gesture.dy < 0 || gesture.vy < -0.6;
          const movingDown = gesture.dy > 0 || gesture.vy > 0.6;
          const passedMidpoint =
            currentOffsetRef.current < collapsedOffset * 0.5;

          let nextExpanded = expanded;
          if (movingUp && (passedMidpoint || gesture.vy < -0.6)) {
            nextExpanded = true;
          } else if (movingDown && (!passedMidpoint || gesture.vy > 0.6)) {
            nextExpanded = false;
          } else {
            nextExpanded = passedMidpoint;
          }

          setExpanded(nextExpanded);
          animateTo(nextExpanded ? 0 : collapsedOffset);
        },
        onPanResponderTerminate: () => {
          animateTo(expanded ? 0 : collapsedOffset);
        },
      }),
    [animateTo, collapsedOffset, dragEnabled, expanded, safePeekDragHeight, translateY],
  );

  return (
    <Animated.View
      style={[
        styles.sheet,
        {
          height: safeExpandedHeight,
          transform: [{ translateY }],
        },
        style,
      ]}
    >
      <View style={styles.handleZone} {...panResponder.panHandlers}>
        <Pressable
          style={styles.handlePressable}
          onPress={toggleExpanded}
          hitSlop={{ top: 8, bottom: 8, left: 40, right: 40 }}
        >
          <View style={styles.handle} />
        </Pressable>
      </View>

      <View style={[styles.peek, { height: peekHeight }]} {...panResponder.panHandlers}>
        {peek}
      </View>

      <ScrollView
        style={{ height: bodyHeight }}
        scrollEnabled={scrollEnabled && expanded}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.body, contentContainerStyle]}
      >
        {children}
      </ScrollView>
    </Animated.View>
  );
});

type SheetGrabberProps = {
  onPress?: () => void;
};

/** Optional tappable affordance that hints the sheet can be expanded. */
export function SheetExpandHint({ onPress }: SheetGrabberProps) {
  return (
    <Pressable style={styles.expandHint} onPress={onPress} hitSlop={8}>
      <View style={styles.handle} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: palette.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -10 },
    elevation: 22,
  },
  handleZone: {
    height: HANDLE_ZONE_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  handlePressable: {
    minWidth: 96,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#E0D3C6",
  },
  peek: {
    overflow: "hidden",
  },
  body: {
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 28,
    gap: 14,
  },
  expandHint: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
  },
});
