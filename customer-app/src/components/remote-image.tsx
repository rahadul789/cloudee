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
  PixelRatio,
  StyleSheet,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { ShimmerBlock } from "@/src/components/loading-skeleton";
import { optimizeCloudinaryImage } from "@/src/lib/image";
import { palette } from "@/src/theme/palette";

const IMAGE_SKELETON_COLOR = "#FFF0F6";
const HOME_IMAGE_SKELETON_COLOR = "#FFF0F6";
// How long a screen must stay blurred before we release its image bitmaps. Long
// enough that the tab/stack transition has finished (so we never unmount images
// mid-animation) but short enough to free memory before you scroll the next screen.
const IMAGE_MEMORY_RELEASE_DELAY = 700;

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
  /** Target display width (px). When set, the Cloudinary image is resized to it. */
  targetWidth?: number;
  children?: ReactNode;
};

// Deliberately simple, straight from the expo-image docs: render <Image> with a
// stable per-URL `recyclingKey` (the documented FlashList pattern) and cache on
// memory+disk. The only React state is "did this exact URL load / error", both
// derived from the current URL so a recycled list cell resets automatically —
// no manual reset effects, no retry/backoff, no remounting, no module caches.
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
  targetWidth,
  children,
}: Props) {
  const normalizedUri =
    typeof uri === "string" && uri.trim() ? uri.trim() : null;
  // Cloudinary-optimized source (WebP/AVIF + auto quality + optional resize). Load/error
  // tracking + recyclingKey stay keyed on the logical URL so FlashList recycling and the
  // memory-release logic are unaffected.
  const pixelWidth =
    targetWidth && targetWidth > 0
      ? Math.round(targetWidth * Math.min(PixelRatio.get(), 3))
      : undefined;
  const sourceUri = normalizedUri
    ? optimizeCloudinaryImage(normalizedUri, { width: pixelWidth }) ?? normalizedUri
    : null;
  const [loadedUri, setLoadedUri] = useState<string | null>(null);
  const [erroredUri, setErroredUri] = useState<string | null>(null);

  // Free image memory for screens you are not looking at. A frozen (blurred)
  // screen keeps its <Image> views mounted, so their decoded bitmaps stay in RAM
  // — dozens of them on Home — which starves the screen you actually scrolled to
  // (the confirmed Home→Browse jank). When the screen has been blurred long
  // enough for its transition to finish, we drop the bitmap; on return it reloads
  // instantly from the disk cache. Net effect: RAM only holds the visible screen.
  const isScreenFocused = useIsFocused();
  const [isReleased, setIsReleased] = useState(false);
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (releaseTimerRef.current) {
      clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }

    if (isScreenFocused) {
      setIsReleased(false);
      return;
    }

    releaseTimerRef.current = setTimeout(
      () => setIsReleased(true),
      IMAGE_MEMORY_RELEASE_DELAY,
    );

    return () => {
      if (releaseTimerRef.current) {
        clearTimeout(releaseTimerRef.current);
        releaseTimerRef.current = null;
      }
    };
  }, [isScreenFocused]);

  const hasFailed = normalizedUri == null || erroredUri === normalizedUri;
  const shouldShowImage = normalizedUri != null && !hasFailed && !isReleased;
  const isLoaded = normalizedUri != null && loadedUri === normalizedUri;
  const shouldShowSkeleton = showSkeleton && shouldShowImage && !isLoaded;
  // Identity key for the <Image> element. Using it as a React `key` (not just
  // expo-image's recyclingKey) means each distinct URL mounts a FRESH element that
  // paints reliably, while re-renders that keep the same URL keep the same element
  // so an in-flight load isn't interrupted. This is what fixes browse cards that
  // stayed blank until you opened a restaurant and came back (a forced remount).
  const imageKey =
    (recyclingKey === undefined ? normalizedUri : recyclingKey) ?? "no-image";

  return (
    <View
      style={[
        styles.container,
        style,
        skeletonVariant === "home-image" ? styles.homeImageContainer : null,
      ]}
    >
      {shouldShowImage ? (
        <Image
          key={imageKey}
          accessibilityLabel={accessibilityLabel}
          source={{ uri: sourceUri ?? normalizedUri }}
          style={[StyleSheet.absoluteFill, imageStyle]}
          contentFit={contentFit}
          cachePolicy="memory-disk"
          recyclingKey={recyclingKey === undefined ? normalizedUri : recyclingKey}
          transition={transition}
          onLoad={() => setLoadedUri(normalizedUri)}
          onError={() => {
            // Only fall back if this URL never displayed; ignore a stray error
            // after a successful load (a recycled cell mid-swap).
            if (loadedUri !== normalizedUri) setErroredUri(normalizedUri);
          }}
        />
      ) : (
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
      )}

      {shouldShowSkeleton ? <ShimmerBlock style={styles.fill} /> : null}

      {children}
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
