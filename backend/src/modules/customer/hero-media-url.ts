// Home hero slides are delivered to the app as-is, but the customer app appends
// `f_auto,q_auto[,w_…]` to every Cloudinary `/image/upload/` URL. For an animated WebP that is
// already optimised this is pointless AND can break: Cloudinary refuses to transform large
// animations ("400 File size too large … Maximum is 10485760") and the app shows a fallback icon.
//
// Cloudinary also serves the same asset at the short URL without `image/upload`
// (https://res.cloudinary.com/<cloud>/<version>/<public_id>.webp), which the app's optimiser
// leaves untouched. So we hand out that form for pre-optimised animated WebP — works on the
// already-published app build with no app update. GIFs keep the normal URL (f_auto turns them
// into much lighter WebP).

const CLOUDINARY_UPLOAD = /^(https:\/\/res\.cloudinary\.com\/[^/]+)\/image\/upload\/(.+)$/i;
// first path segment is a transformation (f_auto, w_300, c_limit, …) → leave the URL alone
const TRANSFORM_SEGMENT = /(^|,)[a-z]{1,3}_[^/]*$/i;

export function heroSlideDeliveryUrl(url: unknown): string {
  if (typeof url !== "string") return "";
  const trimmed = url.trim();
  const match = CLOUDINARY_UPLOAD.exec(trimmed);
  if (!match) return trimmed;
  const [, origin, rest] = match;
  const [pathOnly] = rest.split(/[?#]/);
  if (!/\.webp$/i.test(pathOnly)) return trimmed;
  const firstSegment = rest.split("/")[0] ?? "";
  if (!/^v\d+$/.test(firstSegment) && TRANSFORM_SEGMENT.test(firstSegment)) return trimmed;
  return `${origin}/${rest}`;
}
