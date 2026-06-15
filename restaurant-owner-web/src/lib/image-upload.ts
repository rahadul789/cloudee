export const MAX_IMAGE_SIZE_MB = 5
export const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024

export type ImageValidationResult =
  | { ok: true }
  | { ok: false; title: string; description: string }

export function validateImageFile(file: File): ImageValidationResult {
  if (!file.type.startsWith("image/")) {
    return {
      ok: false,
      title: "Invalid file type",
      description: "Please upload a JPG, PNG, or WebP image.",
    }
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return {
      ok: false,
      title: "Image is too large",
      description: `Please upload an image smaller than ${MAX_IMAGE_SIZE_MB} MB.`,
    }
  }

  return { ok: true }
}
