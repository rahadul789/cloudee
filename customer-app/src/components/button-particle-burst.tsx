import { useLayoutEffect, useRef, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";

import { palette } from "@/src/theme/palette";

const BUTTON_BURST_PARTICLES = [
  { x: 0, y: -1, distance: 24 },
  { x: 0.72, y: -0.72, distance: 22 },
  { x: 1, y: 0, distance: 20 },
  { x: 0.72, y: 0.72, distance: 22 },
  { x: 0, y: 1, distance: 20 },
  { x: -0.72, y: 0.72, distance: 22 },
  { x: -1, y: 0, distance: 20 },
  { x: -0.72, y: -0.72, distance: 22 },
] as const;

export function ButtonParticleBurst({
  triggerKey,
  tint = palette.secondary,
  onComplete,
}: {
  triggerKey: number;
  tint?: string;
  onComplete?: (triggerKey: number) => void;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const activeRunRef = useRef(0);
  const [hiddenTriggerKey, setHiddenTriggerKey] = useState(0);

  useLayoutEffect(() => {
    if (triggerKey <= 0) {
      setHiddenTriggerKey(0);
      return;
    }

    const runId = activeRunRef.current + 1;
    activeRunRef.current = runId;
    setHiddenTriggerKey((current) => (current === triggerKey ? 0 : current));
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 320,
      useNativeDriver: true,
    });

    animation.start(({ finished }) => {
      if (finished && activeRunRef.current === runId) {
        setHiddenTriggerKey(triggerKey);
        onComplete?.(triggerKey);
      }
    });

    return () => {
      animation.stop();
      if (activeRunRef.current === runId) {
        activeRunRef.current = runId + 1;
      }
    };
  }, [onComplete, progress, triggerKey]);

  if (triggerKey <= 0 || hiddenTriggerKey === triggerKey) return null;

  const opacity = progress.interpolate({
    inputRange: [0, 0.12, 1],
    outputRange: [0, 1, 0],
  });

  return (
    <View pointerEvents="none" style={styles.layer}>
      {BUTTON_BURST_PARTICLES.map((particle, index) => (
        <Animated.View
          key={`${triggerKey}-${index}`}
          style={[
            styles.dot,
            {
              backgroundColor: index % 3 === 0 ? palette.surface : tint,
              opacity,
              transform: [
                {
                  translateX: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, particle.x * particle.distance],
                  }),
                },
                {
                  translateY: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, particle.y * particle.distance],
                  }),
                },
                {
                  scale: progress.interpolate({
                    inputRange: [0, 0.34, 1],
                    outputRange: [0.6, 1, 0.2],
                  }),
                },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: "absolute",
    left: -16,
    right: -16,
    top: -16,
    bottom: -16,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
    zIndex: 10,
  },
  dot: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 5,
    height: 5,
    marginLeft: -2.5,
    marginTop: -2.5,
    borderRadius: 3,
  },
});
