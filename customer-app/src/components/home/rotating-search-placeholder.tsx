import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  type StyleProp,
  type TextStyle,
} from "react-native";

// Playful, rotating search-bar placeholder. Cycles only while `active` (home focused and
// not already searching) so the timer is paused everywhere else. Isolated into its own
// component so the 1-line text swap re-renders just this node, never the whole home feed.
const PLACEHOLDERS = [
  "Search food or restaurant",
  "Craving biryani? 🍛",
  "Late-night cravings? 🌙",
  "Find your comfort food 🔥",
  "Something sweet? 🍰",
  "Hungry? Let's fix that 🍔",
];

export function RotatingSearchPlaceholder({
  active,
  style,
}: {
  active: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const [index, setIndex] = useState(0);
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setIndex((current) => (current + 1) % PLACEHOLDERS.length);
    }, 3200);
    return () => clearInterval(id);
  }, [active]);

  // Each new hint rises up from the bottom (native-driver only). Using useLayoutEffect (not
  // useEffect) resets opacity/translateY BEFORE the frame paints — otherwise the new text
  // flashes at full opacity for one frame before snapping down, which read as a stutter.
  // Smooth easing keeps the rise buttery.
  useLayoutEffect(() => {
    opacity.setValue(0);
    translateY.setValue(14);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [index, opacity, translateY]);

  return (
    <Animated.Text
      style={[style, { opacity, transform: [{ translateY }] }]}
      numberOfLines={1}
    >
      {PLACEHOLDERS[index]}
    </Animated.Text>
  );
}
