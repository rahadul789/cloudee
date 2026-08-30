export const MAX_IMAGE_SIZE_MB = 3
export const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024

// Recommended dimensions shown to owners at each upload point so images stay crisp in the
// customer app. Kept here so the hint text and any future validation stay in one place.
export const IMAGE_GUIDANCE = {
  cover: {
    label: "Cover image",
    recommended: "1600 × 900 px (16:9)",
    minWidth: 1200,
    minHeight: 675,
  },
  logo: {
    label: "Logo / profile",
    recommended: "512 × 512 px (square)",
    minWidth: 400,
    minHeight: 400,
  },
  menu: {
    label: "Menu item photo",
    recommended: "800 × 800 px (square)",
    minWidth: 600,
    minHeight: 600,
  },
} as const

export function imageHint(kind: keyof typeof IMAGE_GUIDANCE) {
  const g = IMAGE_GUIDANCE[kind]
  return `Recommended ${g.recommended} · max ${MAX_IMAGE_SIZE_MB} MB`
}

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
