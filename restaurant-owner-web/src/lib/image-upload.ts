import { api } from "@/lib/api"

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

// Uploads a file to Cloudinary via a signed request and returns the hosted URL + publicId.
// IMPORTANT: callers must store the returned `url` (a real https Cloudinary URL) — never a local
// `blob:`/object URL, which only works in the uploader's own browser tab and shows nowhere else
// (customer app, other devices, after refresh).
export async function uploadImageToCloudinary(
  file: File,
  folder: string,
): Promise<{ url: string; publicId: string }> {
  const signature = await api.post<{
    cloudName: string
    folder: string
    timestamp: number
    signature: string
    apiKey: string
    resourceType: string
  }>("/media/upload-signature", { folder, resourceType: "image" })

  const formData = new FormData()
  formData.append("file", file)
  formData.append("api_key", signature.apiKey)
  formData.append("timestamp", String(signature.timestamp))
  formData.append("signature", signature.signature)
  formData.append("folder", signature.folder)

  const uploadResponse = await fetch(
    `https://api.cloudinary.com/v1_1/${signature.cloudName}/${signature.resourceType}/upload`,
    { method: "POST", body: formData },
  )

  if (!uploadResponse.ok) {
    const errorPayload = (await uploadResponse
      .json()
      .catch(() => null)) as { error?: { message?: string } } | null
    throw new Error(errorPayload?.error?.message || "Upload failed")
  }

  const uploaded = (await uploadResponse.json()) as {
    secure_url?: string
    public_id?: string
  }

  if (!uploaded.secure_url) {
    throw new Error("Upload failed")
  }

  return { url: uploaded.secure_url, publicId: uploaded.public_id ?? "" }
}
