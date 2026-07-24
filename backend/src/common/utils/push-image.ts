// Push-notification image optimizer.
//
// Android/FCM downloads a notification's big-picture image on the device the moment the
// push arrives, with a short timeout. A large original (a few MB / huge dimensions) often
// fails to download in time and Android silently drops it — which is why promo-push images
// "sometimes show, sometimes don't". Serving a small, capped version fixes that.
//
// The transform is deliberately conservative so nothing can visually break later:
//   - c_limit  → only DOWNSCALES images larger than the cap; never crops, never upscales.
//   - w/h 1024 → neither side exceeds 1024px (keeps the file small, aspect ratio intact).
//   - q_auto   → Cloudinary picks a good quality/size trade-off.
//   - f_jpg    → a small, universally FCM-friendly format.
//
// Only Cloudinary delivery URLs are touched; anything else is returned unchanged. This is
// used ONLY for the notification tray image — the in-app notification screen keeps the full
// original URL.
const PUSH_IMAGE_TRANSFORM = "w_1024,h_1024,c_limit,q_auto:good,f_jpg"
const CLOUDINARY_UPLOAD_MARKER = "/upload/"

export function optimizePushImageUrl(imageUrl?: string | null): string {
  const url = (imageUrl ?? "").trim()
  if (!url) return ""

  const markerIndex = url.indexOf(CLOUDINARY_UPLOAD_MARKER)
  if (markerIndex === -1) return url

  const insertAt = markerIndex + CLOUDINARY_UPLOAD_MARKER.length
  const rest = url.slice(insertAt)

  // Never stack our own transform if this URL was already optimized.
  if (rest.startsWith(PUSH_IMAGE_TRANSFORM)) return url

  return `${url.slice(0, insertAt)}${PUSH_IMAGE_TRANSFORM}/${rest}`
}
