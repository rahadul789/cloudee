// Injects Cloudinary delivery transformations into a Cloudinary image URL so we serve a
// modern format (WebP/AVIF via f_auto), an auto-tuned quality (q_auto), and — when a
// target width is known — a resized image (w_<width>,c_limit,dpr_auto) instead of the
// original full-resolution upload. This is the single biggest image win: payloads drop
// 50–80%, so images load faster and use far less bandwidth, decode time, and RAM.
//
// No-op (returns the URL unchanged) for any non-Cloudinary URL, or one that already
// carries a transformation — so it's safe to call on every image everywhere.
export function optimizeCloudinaryImage(
  url: string | null | undefined,
  options?: { width?: number },
): string | null | undefined {
  if (!url || typeof url !== "string") return url;

  const marker = "/image/upload/";
  const markerIndex = url.indexOf(marker);
  if (markerIndex === -1) return url; // not a Cloudinary upload URL

  const afterMarker = url.slice(markerIndex + marker.length);
  const firstSegment = afterMarker.split("/")[0] ?? "";
  // If the first path segment after /upload/ already looks like a transformation
  // (f_/q_/w_/dpr_/c_ tokens), leave it alone to avoid stacking transforms.
  if (/(^|,)(f_|q_|w_|dpr_|c_|e_|g_)/.test(firstSegment)) return url;

  // width here is the target in DEVICE PIXELS (caller already applied pixel ratio), so
  // we resize with an explicit w_ instead of relying on Cloudinary's dpr_auto client
  // hint (which native image libraries don't reliably send).
  const transforms = ["f_auto", "q_auto"];
  if (options?.width && options.width > 0) {
    transforms.push(`w_${Math.round(options.width)}`, "c_limit");
  }

  return `${url.slice(0, markerIndex + marker.length)}${transforms.join(",")}/${afterMarker}`;
}
