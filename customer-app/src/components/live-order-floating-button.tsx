import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter, useSegments } from "expo-router";
import { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCustomerActiveOrderQuery } from "@/src/hooks/use-customer-api";

const LIVE_STATUSES = ["New", "Accepted", "Preparing", "ReadyForPickup", "PickedUp"];
const BUTTON_SIZE = 48;
const EDGE_MARGIN = 16;
const TAP_MOVE_TOLERANCE = 8;
const DRAG_RELEASE_PRESS_GUARD_MS = 120;

export const LIVE_ORDER_FLOATING_REFERENCE = "Neon Live Pill";

export function LiveOrderFloatingButton() {
  const router = useRouter();
  const pathname = usePathname();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const pulse = useRef(new Animated.Value(0)).current;
  const pulseTrail = useRef(new Animated.Value(0)).current;
  const pan = useRef(new Animated.ValueXY()).current;
  const dragStartRef = useRef({ x: 0, y: 0 });
  const currentPositionRef = useRef({ x: 0, y: 0 });
  const movedRef = useRef(false);
  const ignorePressUntilRef = useRef(0);
  const activeOrderQuery = useCustomerActiveOrderQuery();
  const order = activeOrderQuery.data;
  const isTabsScreen = segments[0] === "(tabs)";
  const bottomOffset = isTabsScreen
    ? Math.max(insets.bottom, 12) + 102
    : Math.max(insets.bottom, 16) + 28;
  const defaultX = Math.max(EDGE_MARGIN, width - BUTTON_SIZE - EDGE_MARGIN);
  const defaultY = Math.min(
    Math.max(EDGE_MARGIN + insets.top + 112, height * 0.28),
    Math.max(EDGE_MARGIN + insets.top, height - BUTTON_SIZE - bottomOffset),
  );
  const bounds = useMemo(
    () => ({
      minX: EDGE_MARGIN,
      maxX: Math.max(EDGE_MARGIN, width - BUTTON_SIZE - EDGE_MARGIN),
      minY: EDGE_MARGIN + insets.top,
      maxY: Math.max(
        EDGE_MARGIN + insets.top,
        height - BUTTON_SIZE - bottomOffset,
      ),
    }),
    [bottomOffset, height, insets.top, width],
  );

  useEffect(() => {
    pan.setValue({ x: defaultX, y: defaultY });
    currentPositionRef.current = { x: defaultX, y: defaultY };
  }, [defaultX, defaultY, pan]);

  useEffect(() => {
    if (!order) {
      pulse.stopAnimation();
      pulseTrail.stopAnimation();
      pulse.setValue(0);
      pulseTrail.setValue(0);
      return;
    }

    let timeout: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;

    const runPulse = () => {
      if (!isMounted) return;
      pulse.setValue(0);
      pulseTrail.setValue(0);
      Animated.stagger(150, [
        Animated.timing(pulse, {
          toValue: 1,
          duration: 820,
          useNativeDriver: true,
        }),
        Animated.timing(pulseTrail, {
          toValue: 1,
          duration: 980,
          useNativeDriver: true,
        }),
      ]).start(() => {
        if (!isMounted) return;
        timeout = setTimeout(runPulse, 3800);
      });
    };

    runPulse();

    return () => {
      isMounted = false;
      if (timeout) clearTimeout(timeout);
      pulse.stopAnimation();
      pulseTrail.stopAnimation();
    };
  }, [order, pulse, pulseTrail]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3,
        onPanResponderGrant: () => {
          dragStartRef.current = currentPositionRef.current;
          movedRef.current = false;
          pan.stopAnimation((value) => {
            dragStartRef.current = value;
            currentPositionRef.current = value;
          });
        },
        onPanResponderMove: (_, gesture) => {
          if (
            Math.abs(gesture.dx) > TAP_MOVE_TOLERANCE ||
            Math.abs(gesture.dy) > TAP_MOVE_TOLERANCE
          ) {
            movedRef.current = true;
          }

          const nextX = Math.min(
            bounds.maxX,
            Math.max(bounds.minX, dragStartRef.current.x + gesture.dx),
          );
          const nextY = Math.min(
            bounds.maxY,
            Math.max(bounds.minY, dragStartRef.current.y + gesture.dy),
          );
          currentPositionRef.current = { x: nextX, y: nextY };
          pan.setValue({ x: nextX, y: nextY });
        },
        onPanResponderRelease: (_, gesture) => {
          const didMove =
            movedRef.current ||
            Math.abs(gesture.dx) > TAP_MOVE_TOLERANCE ||
            Math.abs(gesture.dy) > TAP_MOVE_TOLERANCE;
          const releasedX = Math.min(
            bounds.maxX,
            Math.max(bounds.minX, dragStartRef.current.x + gesture.dx),
          );
          const releasedY = Math.min(
            bounds.maxY,
            Math.max(bounds.minY, dragStartRef.current.y + gesture.dy),
          );
          const snapX =
            releasedX + BUTTON_SIZE / 2 > width / 2 ? bounds.maxX : bounds.minX;
          currentPositionRef.current = { x: snapX, y: releasedY };
          movedRef.current = false;
          if (didMove) {
            ignorePressUntilRef.current = Date.now() + DRAG_RELEASE_PRESS_GUARD_MS;
          }

          Animated.spring(pan, {
            toValue: { x: snapX, y: releasedY },
            useNativeDriver: false,
            tension: 120,
            friction: 15,
          }).start();
        },
        onPanResponderTerminate: () => {
          movedRef.current = false;
        },
      }),
    [bounds.maxX, bounds.maxY, bounds.minX, bounds.minY, pan, width],
  );

  if (!order || !LIVE_STATUSES.includes(order.status)) {
    return null;
  }

  const targetPath = `/orders/${order._id}/tracking`;
  if (pathname === targetPath || pathname === `/orders/${order._id}`) {
    return null;
  }

  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.62],
  });
  const pulseOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.24, 0],
  });
  const pulseTrailScale = pulseTrail.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.92],
  });
  const pulseTrailOpacity = pulseTrail.interpolate({
    inputRange: [0, 1],
    outputRange: [0.18, 0],
  });

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          transform: [{ translateX: pan.x }, { translateY: pan.y }],
        },
      ]}
      {...panResponder.panHandlers}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.livePulse,
          {
            opacity: pulseOpacity,
            transform: [{ scale: pulseScale }],
          },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.livePulseTrail,
          {
            opacity: pulseTrailOpacity,
            transform: [{ scale: pulseTrailScale }],
          },
        ]}
      />
      <Pressable
        style={styles.button}
        onPress={() => {
          if (Date.now() < ignorePressUntilRef.current) {
            return;
          }

          router.push({
            pathname: "/orders/[orderId]/tracking",
            params: { orderId: order._id },
          });
        }}
      >
        <View style={styles.innerGlow} />
        <Ionicons name="radio-outline" size={19} color="#fff" />
        <View style={styles.liveDot} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 45,
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    shadowColor: "#FF6392",
    shadowOpacity: 0.34,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  livePulse: {
    position: "absolute",
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: "#FF6392",
  },
  livePulseTrail: {
    position: "absolute",
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: "#FFD1E0",
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 99, 146, 0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.46)",
    overflow: "hidden",
  },
  innerGlow: {
    position: "absolute",
    top: -16,
    right: -12,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255, 255, 255, 0.22)",
  },
  liveDot: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#52F2B3",
    borderWidth: 1,
    borderColor: "#fff",
  },
});
