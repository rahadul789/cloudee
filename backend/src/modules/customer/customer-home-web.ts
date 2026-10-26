// Explicit zone content only: neither district nor global campaigns are web deals.
export function getAreaWebDeals(
  content: Record<string, any>,
  area?: { zoneId?: string; districtId?: string } | null,
) {
  if (!area?.zoneId) return null;
  const overrides = content.customerApp?.homeCmsAreaOverrides ?? {};
  const sourceScope = `zone:${area.zoneId}`;
  const strip = overrides[sourceScope]?.offerStrip;
  if (!strip?.isActive || strip.mode === "hidden") return null;
  // CMS keeps prior single-image values when switching to carousel. They are not slides.
  const carousel = strip.carouselImages?.length ? strip.carouselImages : (strip.carouselImageUrls || []).map((url: string) => ({ url }));
  const hasContent = strip.variant === "carousel"
    ? carousel.some((slide: { url?: string }) => Boolean(slide.url?.trim()))
    : strip.variant !== "text" && Boolean(strip.imageUrl?.trim());
  if (!hasContent) return null;
  return { zoneId: area.zoneId, sourceScope, offerStrip: strip };
}
