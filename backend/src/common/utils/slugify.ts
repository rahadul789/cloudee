export function slugify(value: string) {
  // Keep letters/numbers of ANY script (\p{L}/\p{N}) so non-Latin names — e.g. Bangla
  // ("ছোট বড় পিস" → "ছোট-বড়-পিস") — produce a real, non-empty slug instead of an empty
  // string. An empty slug used to fail the required + unique slug constraints on create.
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
}
