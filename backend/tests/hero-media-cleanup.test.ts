import {
  collectHeroMediaRefs,
  publicIdFromCloudinaryUrl,
  removedHeroMedia,
} from "../src/modules/public/hero-media-cleanup"

const url = (id: string, ext = "webp") => `https://res.cloudinary.com/jzc7lig4/image/upload/v1794337069/${id}.${ext}`
const slide = (id: string, withPublicId = true) => ({
  mediaUrl: url(id),
  mediaPublicId: withPublicId ? id : "",
})
const content = (global: unknown[], overrides: Record<string, unknown[]> = {}) => ({
  customerApp: {
    homeCms: { heroCarousel: { slides: global } },
    homeCmsAreaOverrides: Object.fromEntries(
      Object.entries(overrides).map(([key, slides]) => [key, { heroCarousel: { slides } }]),
    ),
  },
})

const A = "foodbela/admin/home-hero/aaa"
const B = "foodbela/admin/home-hero/bbb"

describe("publicIdFromCloudinaryUrl", () => {
  it("handles normal, short and transformed URLs", () => {
    expect(publicIdFromCloudinaryUrl(url(A))).toBe(A)
    expect(publicIdFromCloudinaryUrl(`https://res.cloudinary.com/x/v1/${A}.gif`)).toBe(A)
    expect(publicIdFromCloudinaryUrl(`https://res.cloudinary.com/x/image/upload/f_auto,q_auto/v1/${A}.gif`)).toBe(A)
    expect(publicIdFromCloudinaryUrl("https://media.giphy.com/media/x/giphy.gif")).toBe("")
  })
})

describe("hero media references", () => {
  it("collects hero files from global + every area override (and ignores other folders/hosts)", () => {
    const refs = collectHeroMediaRefs(
      content([slide(A), { mediaUrl: "https://media.giphy.com/media/x/giphy.gif" }], {
        "zone:1": [slide(B, false)],
        "zone:2": [slide("foodbela/restaurants/cover")],
      }),
    )
    expect([...refs].sort()).toEqual([A, B])
  })

  it("marks a file removed only when no scope uses it anymore", () => {
    const before = content([slide(A), slide(B)], { "zone:1": [slide(B)] })
    // A deleted everywhere; B removed globally but still used by zone:1
    const after = content([], { "zone:1": [slide(B)] })
    expect(removedHeroMedia(before, after)).toEqual([A])
  })

  it("removes nothing when slides are only reordered", () => {
    expect(removedHeroMedia(content([slide(A), slide(B)]), content([slide(B), slide(A)]))).toEqual([])
  })
})
