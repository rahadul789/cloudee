import crypto from "node:crypto"

import { env } from "../../config/env"
import { fetchWithTimeout } from "./fetch-with-timeout"

// Signed Cloudinary delete. Error-safe: returns { deleted: false } on any network/API failure so
// callers can treat cleanup as best-effort. Lives in a neutral util (no domain imports) so both
// owner/business and customer services can use it without a circular import.
export async function deleteCloudinaryAsset(params: {
  publicId: string
  resourceType?: string
}) {
  const timestamp = Math.floor(Date.now() / 1000)
  const resourceType = params.resourceType ?? "image"
  const signatureBase = `public_id=${params.publicId}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`
  const signature = crypto.createHash("sha1").update(signatureBase).digest("hex")
  const body = new URLSearchParams({
    public_id: params.publicId,
    timestamp: String(timestamp),
    api_key: env.CLOUDINARY_API_KEY,
    signature,
  })
  const response = await fetchWithTimeout(
    `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/${resourceType}/destroy`,
    {
      method: "POST",
      body,
      timeoutMs: 5_000,
    }
  ).catch(() => null)

  if (!response?.ok) {
    return { deleted: false }
  }

  const payload = (await response.json()) as { result?: string }
  return { deleted: payload.result === "ok" || payload.result === "not found" }
}

// Replace-on-update cleanup for single "current-state" images (restaurant cover/logo, owner &
// customer profile pics) that have NO history/rollback/snapshot dependency. Call it AFTER the DB
// save succeeds. No-ops when there is no previous image or the image did not actually change.
// Fire-and-forget: a Cloudinary delete failure must never break the update that already succeeded.
// Do NOT use for menu images (order snapshots), CMS images (version rollback), push, or attachments.
export function replaceCloudinaryImage(oldPublicId?: string, newPublicId?: string) {
  const oldId = (oldPublicId ?? "").trim()
  const newId = (newPublicId ?? "").trim()
  if (!oldId || oldId === newId) return
  void deleteCloudinaryAsset({ publicId: oldId }).catch(() => undefined)
}
