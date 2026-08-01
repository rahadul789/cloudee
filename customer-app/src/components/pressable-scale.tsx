import { useRef } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

// A Pressable that springs down on press-in and back on release (native-driver only, so
// it never touches the JS thread). Drop-in replacement wherever a tap should feel tactile.
// The scale lives on an outer Animated.View; the inner Pressable keeps its own layout/style.
export function PressableScale({
  children,
  scaleTo = 0.93,
  containerStyle,
  onPressIn,
  onPressOut,
  ...pressableProps
}: PressableProps & {
  scaleTo?: number;
  containerStyle?: StyleProp<ViewStyle>;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const spring = (toValue: number) =>
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      speed: 40,
      bounciness: 8,
    }).start();

  return (
    <Animated.View style={[containerStyle, { transform: [{ scale }] }]}>
      <Pressable
        onPressIn={(event) => {
          spring(scaleTo);
          onPressIn?.(event);
        }}
        onPressOut={(event) => {
          spring(1);
          onPressOut?.(event);
        }}
        {...pressableProps}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

// Kept so callers can reference a shared no-op style if needed.
export const pressableScaleStyles = StyleSheet.create({});
