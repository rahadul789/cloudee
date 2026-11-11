import * as Haptics from "expo-haptics";
import LottieView from "lottie-react-native";
import {
  cloneElement,
  forwardRef,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  type ReactElement,
  type RefObject,
} from "react";
import {
  Animated,
  Easing,
  Image,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { palette } from "@/src/theme/palette";

const MASCOT = require("../../assets/bela_mascot_lottie.json");
const MASCOT_PNG = require("../../assets/bela_mascot.png");
// Android Lottie crashes on non-embedded image assets → fall back to the static PNG.
const MASCOT_HAS_EXTERNAL_IMAGES = Array.isArray(MASCOT?.assets)
  ? MASCOT.assets.some(
      (asset: { p?: string }) =>
        typeof asset?.p === "string" && asset.p.length > 0 && !asset.p.startsWith("data:"),
    )
  : false;

const THRESHOLD = 80; // pull (after resistance) that triggers a refresh
const MAX_PULL = 140;
const HOLD = 76; // resting pull while refreshing
const MIN_REFRESH_MS = 900;
const RING = 52;
const BUBBLE = 42;

function resist(distance: number) {
  if (distance <= 0) return 0;
  return Math.min(MAX_PULL, distance * 0.55);
}

/**
 * Follow-the-finger pull-to-refresh with Bela, built exactly as the RNGH docs prescribe:
 *   <GestureDetector pan>            ← our pull gesture on a wrapper View
 *     <View>
 *       <GestureDetector native>     ← Gesture.Native() on the PLAIN react-native ScrollView
 *         <ScrollView/>
 * with `pan.simultaneousWithExternalGesture(native)` so scrolling and pulling coexist.
 * (Native must NOT be put on RNGH's own ScrollView, and the two gestures must NOT share a
 * detector — that's what broke the earlier attempts.)
 *
 * Pull only counts when the gesture STARTED at the very top (scrollYRef ≈ 0).
 * Bela grows small → big with the pull, the arc winds with the finger, a haptic tick marks
 * the threshold, and on release the arc spins until `refreshing` becomes false.
 */
export function BelaPullToRefresh({
  refreshing,
  onRefresh,
  scrollYRef: externalScrollYRef,
  topOffset = 6,
  children,
}: {
  refreshing: boolean;
  onRefresh: () => void | Promise<unknown>;
  /**
   * Live scroll offset. Only needed when the child's onScroll is an `Animated.event`
   * (can't be wrapped) — feed it from that event's `listener`. Otherwise it's tracked here.
   */
  scrollYRef?: RefObject<number>;
  /** Where Bela parks, measured from the TOP OF THE LIST (home: under the status bar). */
  topOffset?: number;
  /**
   * The scrollable: a plain RN ScrollView / Animated.ScrollView, or a FlatList / FlashList
   * (RNGH's own ScrollView is NOT allowed). Its `refreshControl` is removed automatically.
   */
  children: ReactElement;
}) {
  const internalScrollYRef = useRef(0);
  const scrollYRef = externalScrollYRef ?? internalScrollYRef;
  const pull = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  // 1 = shown, 0 = vanished in place (used for the end-of-refresh fade/shrink).
  const exit = useRef(new Animated.Value(1)).current;
  const spinLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  // Never leave the spinner loop running after unmount (e.g. leaving the screen mid-refresh).
  useEffect(() => () => spinLoopRef.current?.stop(), []);
  const startedAtTopRef = useRef(false);
  const pastRef = useRef(false);
  const triggeredAtRef = useRef(0);
  const refreshingRef = useRef(refreshing);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const settle = (toValue: number) =>
    Animated.spring(pull, {
      toValue,
      damping: 16,
      stiffness: 180,
      mass: 0.8,
      useNativeDriver: true,
    }).start();

  const startSpin = () => {
    spinLoopRef.current?.stop();
    spin.setValue(0);
    spinLoopRef.current = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 800, easing: Easing.linear, useNativeDriver: true }),
    );
    spinLoopRef.current.start();
  };

  useEffect(() => {
    refreshingRef.current = refreshing;
    if (refreshing) {
      if (!triggeredAtRef.current) triggeredAtRef.current = Date.now();
      settle(HOLD);
      startSpin();
      return;
    }
    if (!triggeredAtRef.current) return;
    const wait = Math.max(0, MIN_REFRESH_MS - (Date.now() - triggeredAtRef.current));
    const timer = setTimeout(() => {
      // Native-style finish: Bela does NOT fly back up — she shrinks and fades out right
      // where she is; only then is the pull position reset (invisibly).
      Animated.timing(exit, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        spinLoopRef.current?.stop();
        pull.setValue(0);
        exit.setValue(1);
        triggeredAtRef.current = 0;
      });
    }, wait);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshing]);

  useEffect(() => () => spinLoopRef.current?.stop(), []);

  const { pan, native } = useMemo(() => {
    const nativeGesture = Gesture.Native();
    const panGesture = Gesture.Pan()
      .runOnJS(true)
      .simultaneousWithExternalGesture(nativeGesture)
      // downward drags only; sideways (carousels) or upward drags fail the pull
      .activeOffsetY(10)
      .failOffsetY(-10)
      .failOffsetX([-18, 18])
      .onStart(() => {
        startedAtTopRef.current =
          (scrollYRef.current ?? 0) <= 1 && !refreshingRef.current && !triggeredAtRef.current;
        if (startedAtTopRef.current) exit.setValue(1);
        pastRef.current = false;
      })
      .onUpdate((event) => {
        if (!startedAtTopRef.current || refreshingRef.current) return;
        const distance = resist(event.translationY);
        pull.setValue(distance);
        const past = distance >= THRESHOLD;
        if (past !== pastRef.current) {
          pastRef.current = past;
          if (past) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
        }
      })
      .onEnd(() => {
        if (!startedAtTopRef.current || refreshingRef.current) return;
        if (pastRef.current) {
          triggeredAtRef.current = Date.now();
          settle(HOLD);
          startSpin();
          void onRefreshRef.current();
        } else {
          settle(0);
        }
      })
      .onFinalize(() => {
        // cancelled/failed mid-pull → spring back
        if (startedAtTopRef.current && !refreshingRef.current && !triggeredAtRef.current) settle(0);
        startedAtTopRef.current = false;
        pastRef.current = false;
      });
    return { pan: panGesture, native: nativeGesture };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const translateY = pull.interpolate({
    inputRange: [0, MAX_PULL],
    outputRange: [-RING - 8, MAX_PULL - RING * 0.6],
    extrapolate: "clamp",
  });
  const scale = pull.interpolate({
    inputRange: [0, THRESHOLD, MAX_PULL],
    outputRange: [0.35, 1, 1.15],
    extrapolate: "clamp",
  });
  const opacity = pull.interpolate({ inputRange: [0, 20], outputRange: [0, 1], extrapolate: "clamp" });
  const windTurn = pull.interpolate({ inputRange: [0, MAX_PULL], outputRange: ["0deg", "320deg"] });
  const spinTurn = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  // Lists (FlatList / FlashList) render their own ScrollView: hand them one that carries
  // the native gesture. Plain ScrollViews get the native detector directly.
  const NativeScroll = useMemo(
    () =>
      forwardRef<ScrollView, ScrollViewProps>(function BelaNativeScroll(props, ref) {
        return (
          <GestureDetector gesture={native}>
            <ScrollView {...props} ref={ref} />
          </GestureDetector>
        );
      }),
    [native],
  );
  const renderScrollComponent = useMemo(() => {
    function renderBelaScroll(props: ScrollViewProps) {
      return <NativeScroll {...props} />;
    }
    return renderBelaScroll;
  }, [NativeScroll]);

  let content: ReactElement = children;
  if (isValidElement(children)) {
    const childProps = children.props as Record<string, unknown>;
    const isPlainScrollView = children.type === ScrollView || children.type === Animated.ScrollView;
    const ownOnScroll = childProps.onScroll;
    // Wrap a function onScroll so we always know the offset; an Animated.event object
    // can't be wrapped — then the screen passes scrollYRef from its listener.
    const onScroll =
      typeof ownOnScroll === "function" || ownOnScroll === undefined
        ? (event: NativeSyntheticEvent<NativeScrollEvent>) => {
            scrollYRef.current = event.nativeEvent.contentOffset.y;
            (ownOnScroll as ((e: NativeSyntheticEvent<NativeScrollEvent>) => void) | undefined)?.(event);
          }
        : ownOnScroll;
    const injected: Record<string, unknown> = {
      refreshControl: undefined,
      onScroll,
      scrollEventThrottle: (childProps.scrollEventThrottle as number | undefined) ?? 16,
      // Bela draws the pull — no iOS bounce / Android glow fighting it.
      bounces: false,
      overScrollMode: "never",
    };
    if (!isPlainScrollView) injected.renderScrollComponent = renderScrollComponent;
    const cloned = cloneElement(children, injected);
    content = isPlainScrollView ? <GestureDetector gesture={native}>{cloned}</GestureDetector> : cloned;
  }

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.fill} collapsable={false}>
        {content}

      <View pointerEvents="none" style={[styles.layer, { top: topOffset }]}>
        <Animated.View
          style={[
            styles.disc,
            {
              opacity: Animated.multiply(opacity, exit),
              transform: [
                { translateY },
                { scale: Animated.multiply(scale, exit.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] })) },
              ],
            },
          ]}
        >
          <View style={styles.track} />
          <Animated.View style={[styles.arc, { transform: [{ rotate: windTurn }, { rotate: spinTurn }] }]} />
          <View style={styles.bubble}>
            {MASCOT_HAS_EXTERNAL_IMAGES ? (
              <Image source={MASCOT_PNG} style={styles.mascot} resizeMode="contain" />
            ) : (
              <LottieView source={MASCOT} autoPlay loop style={styles.mascot} />
            )}
          </View>
        </Animated.View>
      </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  layer: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 100,
    elevation: 100,
  },
  // One opaque white disc carries the shadow (no elevation on the transparent children,
  // or Android shows the shadow through them as a dark background).
  disc: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
    shadowColor: "#000000",
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  track: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RING / 2,
    borderWidth: 3,
    borderColor: "rgba(255,184,76,0.22)",
  },
  arc: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RING / 2,
    borderWidth: 3,
    borderColor: "transparent",
    borderTopColor: palette.primary,
    borderRightColor: palette.primary,
  },
  bubble: {
    width: BUBBLE,
    height: BUBBLE,
    borderRadius: BUBBLE / 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: palette.surface,
  },
  mascot: { width: BUBBLE - 2, height: BUBBLE - 2 },
});
