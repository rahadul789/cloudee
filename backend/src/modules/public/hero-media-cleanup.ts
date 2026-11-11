// Home hero carousel media lifecycle: when a slide's GIF/WebP is no longer used anywhere
// (global CMS or any district/zone override), delete it from Cloudinary.
//
// Rules (safety first):
//  · Runs AFTER a successful CMS save (never on the admin's 🗑️ click — unsaved edits / undo).
//  · Only touches files in the hero folder (HERO_FOLDER) — nothing else can ever be deleted.
//  · A file still referenced by ANY scope is kept (same GIF can be shared across zones).
//  · Uploaded-but-never-saved hero files are swept after ORPHAN_GRACE_MS.
//  · Rollback strips slides whose file was already deleted, so no broken slide comes back.
//  · Best-effort: failures are logged, never break the save.

import { deleteCloudinaryAsset } from "../../common/utils/cloudinary"
import { logger } from "../../config/logger"
import { MediaAssetModel } from "../media/media.model"

export const HERO_FOLDER = "foodbela/admin/home-hero/"
export const HERO_MEDIA_CONTEXT = "home_hero_carousel"
export const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000

type AnyRecord = Record<string, any>

/** Cloudinary public id from a delivery URL (".../upload/[transforms/][v123/]<id>.<ext>"). */
export function publicIdFromCloudinaryUrl(url: unknown): string {
  if (typeof url !== "string") return ""
  const match = /res\.cloudinary\.com\/[^/]+\/(?:image\/upload\/)?(.+)$/i.exec(url.trim())
  if (!match) return ""
  const segments = match[1].split(/[?#]/)[0].split("/")
  // drop transformation segments and the version segment
  while (segments.length > 1 && (/^v\d+$/.test(segments[0]) || /(^|,)[a-z]{1,3}_[^/]*$/i.test(segments[0]))) {
    const isVersion = /^v\d+$/.test(segments[0])
    segments.shift()
    if (isVersion) break
  }
  return segments.join("/").replace(/\.[a-z0-9]+$/i, "")
}

function slidePublicId(slide: AnyRecord | null | undefined): string {
  if (!slide) return ""
  const explicit = typeof slide.mediaPublicId === "string" ? slide.mediaPublicId.trim() : ""
  return explicit || publicIdFromCloudinaryUrl(slide.mediaUrl)
}

function heroSlidesOf(homeCms: AnyRecord | null | undefined): AnyRecord[] {
  const slides = homeCms?.heroCarousel?.slides
  return Array.isArray(slides) ? slides : []
}

/** Every hero-folder public id referenced by the global CMS + all area overrides. */
export function collectHeroMediaRefs(content: AnyRecord | null | undefined): Set<string> {
  const refs = new Set<string>()
  const app = content?.customerApp ?? {}
  const scopes: AnyRecord[] = [app.homeCms, ...Object.values((app.homeCmsAreaOverrides ?? {}) as AnyRecord)]
  for (const homeCms of scopes) {
    for (const slide of heroSlidesOf(homeCms)) {
      const id = slidePublicId(slide)
      if (id.startsWith(HERO_FOLDER)) refs.add(id)
    }
  }
  return refs
}

/** Hero files used before the save and used nowhere after it. */
export function removedHeroMedia(previous: AnyRecord | null | undefined, next: AnyRecord | null | undefined) {
  const after = collectHeroMediaRefs(next)
  return [...collectHeroMediaRefs(previous)].filter((id) => !after.has(id))
}

async function destroyHeroMedia(publicId: string, reason: string) {
  if (!publicId.startsWith(HERO_FOLDER)) return false
  const record = await MediaAssetModel.findOne({ publicId }).select({ resourceType: 1 }).lean()
  const result = await deleteCloudinaryAsset({
    publicId,
    resourceType: (record as AnyRecord | null)?.resourceType || "image",
  })
  await MediaAssetModel.updateOne({ publicId }, { $set: { deletedAt: new Date() } })
  logger.info({ publicId, reason, cloudinaryDeleted: result.deleted }, "Hero media removed")
  return result.deleted
}

/** After a CMS save: delete hero files no longer referenced anywhere + sweep old orphans. */
export async function cleanupHeroMediaAfterSave(previous: AnyRecord | null | undefined, next: AnyRecord) {
  try {
    const stillUsed = collectHeroMediaRefs(next)
    for (const publicId of removedHeroMedia(previous, next)) {
      await destroyHeroMedia(publicId, "slide_removed")
    }
    const orphans = await MediaAssetModel.find({
      context: HERO_MEDIA_CONTEXT,
      deletedAt: null,
      createdAt: { $lt: new Date(Date.now() - ORPHAN_GRACE_MS) },
    })
      .select({ publicId: 1 })
      .limit(50)
      .lean()
    for (const orphan of orphans) {
      const publicId = String((orphan as AnyRecord).publicId ?? "")
      if (publicId && !stillUsed.has(publicId)) await destroyHeroMedia(publicId, "never_used")
    }
  } catch (error) {
    logger.warn({ error }, "Hero media cleanup failed (content was saved)")
  }
}

/** Rollback guard: drop slides whose hero file was already deleted (no broken slides). */
export async function stripDeletedHeroSlides<T extends AnyRecord>(content: T): Promise<T> {
  const refs = [...collectHeroMediaRefs(content)]
  if (!refs.length) return content
  const deleted = await MediaAssetModel.find({ publicId: { $in: refs }, deletedAt: { $ne: null } })
    .select({ publicId: 1 })
    .lean()
  const gone = new Set(deleted.map((row) => String((row as AnyRecord).publicId)))
  if (!gone.size) return content
  const app = (content as AnyRecord).customerApp ?? {}
  const strip = (homeCms: AnyRecord | null | undefined) => {
    if (!homeCms?.heroCarousel || !Array.isArray(homeCms.heroCarousel.slides)) return
    homeCms.heroCarousel.slides = homeCms.heroCarousel.slides.filter(
      (slide: AnyRecord) => !gone.has(slidePublicId(slide)),
    )
  }
  strip(app.homeCms)
  for (const override of Object.values((app.homeCmsAreaOverrides ?? {}) as AnyRecord)) strip(override)
  return content
}
