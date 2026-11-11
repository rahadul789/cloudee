import { Schema, model } from "mongoose"

// One row per (campaign, customer): did they press the promo's CTA button?
// Unique so repeated taps count once — admin sees "people who clicked", not taps.
const promoCtaClickSchema = new Schema(
  {
    campaignId: { type: String, required: true, trim: true },
    customerId: { type: String, required: true, trim: true },
    ctaPath: { type: String, default: "", trim: true },
  },
  { timestamps: true },
)
promoCtaClickSchema.index({ campaignId: 1, customerId: 1 }, { unique: true })

export const PromoCtaClickModel = model("PromoCtaClick", promoCtaClickSchema)

export async function recordPromoCtaClick(params: { campaignId: string; customerId: string; ctaPath?: string }) {
  const campaignId = params.campaignId.trim()
  if (!campaignId || !params.customerId) return { recorded: false }
  await PromoCtaClickModel.updateOne(
    { campaignId, customerId: params.customerId },
    { $setOnInsert: { ctaPath: (params.ctaPath ?? "").slice(0, 300) } },
    { upsert: true },
  )
  return { recorded: true }
}

/** campaignId → number of distinct customers who pressed its CTA. */
export async function countPromoCtaClicks(campaignIds: string[]) {
  const ids = [...new Set(campaignIds.filter(Boolean))]
  if (!ids.length) return new Map<string, number>()
  const rows = await PromoCtaClickModel.aggregate<{ _id: string; count: number }>([
    { $match: { campaignId: { $in: ids } } },
    { $group: { _id: "$campaignId", count: { $sum: 1 } } },
  ])
  return new Map(rows.map((row) => [row._id, row.count]))
}
