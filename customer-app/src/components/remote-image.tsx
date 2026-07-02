import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { Image, type ImageContentFit } from "expo-image";
import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { ShimmerBlock } from "@/src/components/loading-skeleton";
import { palette } from "@/src/theme/palette";

const IMAGE_SKELETON_COLOR = "#FFF0F6";
const HOME_IMAGE_SKELETON_COLOR = "#FFF0F6";
const HOME_IMAGE_SKELETON_HIGHLIGHT = "rgba(255,255,255,0.72)";
const loadedImageUris = new Set<string>();
const failedImageUris = new Set<string>();

type IoniconName = ComponentProps<typeof Ionicons>["name"];

type Props = {
  uri?: string | null;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  fallbackIcon?: IoniconName;
  fallbackIconSize?: number;
  fallbackTint?: string;
  showSkeleton?: boolean;
  skeletonVariant?: "default" | "home-image";
  transition?: number;
  recyclingKey?: string | null;
  accessibilityLabel?: string;
  children?: ReactNode;
};

export function RemoteImage({
  uri,
  style,
  imageStyle,
  contentFit = "cover",
  fallbackIcon = "image-outline",
  fallbackIconSize = 24,
  fallbackTint = palette.secondary,
  showSkeleton = true,
  skeletonVariant = "default",
  transition = 180,
  recyclingKey,
  accessibilityLabel,
  children,
}: Props) {
  const normalizedUri =
    typeof uri === "string" && uri.trim() ? uri.trim() : null;
  const [isLoaded, setIsLoaded] = useState(
    normalizedUri ? loadedImageUris.has(normalizedUri) : false,
  );
  const [hasFailed, setHasFailed] = useState(
    normalizedUri ? failedImageUris.has(normalizedUri) : true,
  );

  useEffect(() => {
    if (!normalizedUri) {
      setIsLoaded(false);
      setHasFailed(true);
      return;
    }

    setIsLoaded(loadedImageUris.has(normalizedUri));
    setHasFailed(failedImageUris.has(normalizedUri));
  }, [normalizedUri]);

  const shouldShowImage = Boolean(normalizedUri && !hasFailed);
  const shouldShowSkeleton = showSkeleton && shouldShowImage && !isLoaded;
  const shouldShowFallback = !shouldShowImage;
  const effectiveRecyclingKey =
    recyclingKey === undefined ? normalizedUri : recyclingKey;

  const markLoaded = () => {
    if (normalizedUri) {
      loadedImageUris.add(normalizedUri);
      failedImageUris.delete(normalizedUri);
    }
    setIsLoaded(true);
    setHasFailed(false);
  };

  return (
    <View
      style={[
        styles.container,
        style,
        skeletonVariant === "home-image" ? styles.homeImageContainer : null,
      ]}
    >
      {normalizedUri && !hasFailed ? (
        <Image
          accessibilityLabel={accessibilityLabel}
          source={{ uri: normalizedUri }}
          style={[StyleSheet.absoluteFill, imageStyle]}
          contentFit={contentFit}
          cachePolicy="memory-disk"
          recyclingKey={effectiveRecyclingKey}
          transition={transition}
          onDisplay={markLoaded}
          onLoad={markLoaded}
          onError={() => {
            if (normalizedUri && loadedImageUris.has(normalizedUri)) {
              setIsLoaded(true);
              setHasFailed(false);
              return;
            }

            if (normalizedUri) {
              failedImageUris.add(normalizedUri);
            }
            setIsLoaded(false);
            setHasFailed(true);
          }}
        />
      ) : null}

      {shouldShowSkeleton ? (
        skeletonVariant === "home-image" ? (
          <HomeImageShimmer />
        ) : (
          <ShimmerBlock style={styles.fill} />
        )
      ) : null}

      {shouldShowFallback ? (
        <View
          style={[
            styles.fallback,
            skeletonVariant === "home-image" ? styles.homeImageFallback : null,
          ]}
        >
          <Ionicons
            name={fallbackIcon}
            size={fallbackIconSize}
            color={fallbackTint}
          />
        </View>
      ) : null}

      {children}
    </View>
  );
}

function HomeImageShimmer() {
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const isFocused = useIsFocused();

  useEffect(() => {
    if (!isFocused) {
      shimmerAnim.stopAnimation();
      return;
    }

    const shimmerLoop = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1250,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
        isInteraction: false,
      }),
    );

    shimmerAnim.setValue(0);
    shimmerLoop.start();

    return () => {
      shimmerLoop.stop();
      shimmerAnim.stopAnimation();
    };
  }, [isFocused, shimmerAnim]);

  const translateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-220, 220],
  });

  return (
    <View style={styles.homeImageShimmer}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.homeImageHighlight,
          { transform: [{ translateX }, { rotate: "10deg" }] },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    backgroundColor: IMAGE_SKELETON_COLOR,
  },
  homeImageContainer: {
    backgroundColor: HOME_IMAGE_SKELETON_COLOR,
  },
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
  homeImageShimmer: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
    backgroundColor: HOME_IMAGE_SKELETON_COLOR,
  },
  homeImageHighlight: {
    position: "absolute",
    top: -16,
    bottom: -16,
    width: 82,
    backgroundColor: HOME_IMAGE_SKELETON_HIGHLIGHT,
  },
  fallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: IMAGE_SKELETON_COLOR,
  },
  homeImageFallback: {
    backgroundColor: HOME_IMAGE_SKELETON_COLOR,
  },
});
