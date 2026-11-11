import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

import { RemoteImage } from "@/src/components/remote-image";
import type {
  CustomerHomeHeroCarousel,
  CustomerHomeHeroSlide,
} from "@/src/types/restaurant";

export const HERO_ASPECT_RATIO: Record<NonNullable<CustomerHomeHeroCarousel["aspectRatio"]>, number> = {
  "16:9": 9 / 16,
  "2:1": 1 / 2,
  "4:3": 3 / 4,
  "1:1": 1,
};

// Admin-driven top-of-home banner, edge to edge. Slides can be GIF / animated WebP / still
// images (expo-image animates GIF + animated WebP natively). The banner height follows the
// FIRST slide's real media shape (measured on load) so it is never cropped; other slides are
// fitted inside ("contain") — upload all slides in the same shape for a seamless look.
// Auto-advances only while the home tab is focused (`active`), pausing after a manual swipe.
export const HomeHeroCarousel = memo(function HomeHeroCarousel({
  carousel,
  width,
  height: fixedHeight,
  active,
  onPressSlide,
  onActiveSlideChange,
}: {
  carousel: CustomerHomeHeroCarousel;
  width: number;
  /** Fixed banner height. When set the media FILLS the box (cover) — used when the
   *  carousel is the whole home top zone. Without it the height follows the media. */
  height?: number;
  active: boolean;
  onPressSlide: (slide: CustomerHomeHeroSlide, index: number) => void;
  /** Fires with the slide now on screen (e.g. to recolour the overlay on top of it). */
  onActiveSlideChange?: (slide: CustomerHomeHeroSlide | null) => void;
}) {
  const slides = carousel.slides;
  const [mediaRatio, setMediaRatio] = useState<number | null>(null);
  const firstSlideUrl = slides[0]?.mediaUrl;
  useEffect(() => {
    setMediaRatio(null);
  }, [firstSlideUrl]);
  const ratio =
    mediaRatio ?? HERO_ASPECT_RATIO[carousel.aspectRatio ?? "16:9"] ?? 9 / 16;
  const fill = typeof fixedHeight === "number" && fixedHeight > 0;
  const height = fill ? Math.round(fixedHeight) : Math.round(width * ratio);
  const listRef = useRef<FlatList<CustomerHomeHeroSlide>>(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const activeSlide = slides.length ? slides[index % slides.length] : null;
  useEffect(() => {
    onActiveSlideChange?.(activeSlide);
  }, [activeSlide, onActiveSlideChange]);
  const pausedUntilRef = useRef(0);
  const intervalMs = Math.max(2, carousel.intervalSeconds ?? 4) * 1000;
  const canAutoPlay = carousel.autoPlay !== false && slides.length > 1 && active;

  // Endless left→right loop: a copy of the first slide sits after the last one. Auto-play
  // always moves forward; on landing on the copy we silently jump back to the real first
  // slide (no reverse rewind across every slide).
  const loopSlides = useMemo(
    () => (slides.length > 1 ? [...slides, slides[0]] : slides),
    [slides],
  );
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    },
    [],
  );
  const jumpToStart = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    indexRef.current = 0;
    setIndex(0);
  }, []);

  useEffect(() => {
    if (!canAutoPlay) return;
    const timer = setInterval(() => {
      if (Date.now() < pausedUntilRef.current) return;
      const next = indexRef.current + 1;
      listRef.current?.scrollToOffset({ offset: next * width, animated: true });
      indexRef.current = next;
      setIndex(next % slides.length);
      if (next >= slides.length) {
        if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
        resetTimerRef.current = setTimeout(jumpToStart, 450);
      }
    }, intervalMs);
    return () => clearInterval(timer);
  }, [canAutoPlay, intervalMs, jumpToStart, slides.length, width]);

  // Keep the index valid when the admin removes slides while the app is open.
  useEffect(() => {
    if (indexRef.current >= slides.length) {
      indexRef.current = 0;
      setIndex(0);
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, [slides.length]);

  const handleMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(event.nativeEvent.contentOffset.x / Math.max(width, 1));
      if (next >= slides.length) {
        jumpToStart();
        return;
      }
      indexRef.current = next;
      setIndex(next);
    },
    [jumpToStart, slides.length, width],
  );

  if (!slides.length) return null;

  return (
    <View style={[styles.wrap, { width, height }]}>
      <FlatList
        ref={listRef}
        data={loopSlides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(slide, slideIndex) => `${slide.id || slide.mediaUrl}-${slideIndex}`}
        onScrollBeginDrag={() => {
          pausedUntilRef.current = Date.now() + intervalMs * 1.5;
        }}
        onMomentumScrollEnd={handleMomentumEnd}
        getItemLayout={(_, itemIndex) => ({
          length: width,
          offset: width * itemIndex,
          index: itemIndex,
        })}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        windowSize={3}
        renderItem={({ item, index: itemIndex }) => {
          const tappable = Boolean(item.linkEnabled && item.ctaPath?.trim());
          return (
            <Pressable
              disabled={!tappable}
              onPress={() => onPressSlide(item, itemIndex % slides.length)}
              accessibilityRole={tappable ? "button" : "image"}
              accessibilityLabel={item.title || `Promotion ${itemIndex + 1}`}
              style={{ width, height }}
            >
              <RemoteImage
                uri={item.mediaUrl}
                style={styles.media}
                contentFit={fill ? "cover" : "contain"}
                showSkeleton={false}
                fallbackIcon="image-outline"
                fallbackBackground="transparent"
                onLoadSize={
                  itemIndex === 0 && !fill
                    ? ({ width: mediaWidth, height: mediaHeight }) => {
                        const next = mediaHeight / mediaWidth;
                        if (Number.isFinite(next) && next > 0.2 && next < 2.5) {
                          setMediaRatio((current) =>
                            current && Math.abs(current - next) < 0.001 ? current : next,
                          );
                        }
                      }
                    : undefined
                }
                targetWidth={width}
                transition={120}
                accessibilityLabel={item.title || `Promotion ${itemIndex + 1}`}
              />
            </Pressable>
          );
        }}
      />
      {carousel.showDots === true && slides.length > 1 ? (
        <View pointerEvents="none" style={styles.dots}>
          {slides.map((slide, dotIndex) => (
            <View
              key={slide.id || dotIndex}
              style={[styles.dot, dotIndex === index ? styles.dotActive : null]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
  },
  media: {
    width: "100%",
    height: "100%",
  },
  dots: {
    position: "absolute",
    bottom: 10,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(17,17,17,0.28)",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.6)",
  },
  dotActive: {
    width: 18,
    backgroundColor: "#FFFFFF",
  },
});
