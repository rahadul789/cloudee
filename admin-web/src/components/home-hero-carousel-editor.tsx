import * as React from "react"
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  ImagePlus,
  Link2,
  Loader2,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Switch } from "@/components/ui/switch"
import {
  DEFAULT_HERO_CAROUSEL,
  uploadAdminMedia,
  type HomeHeroCarousel,
  type HomeHeroCarouselSlide,
} from "@/lib/admin-api"

// Animated hero media (GIF / animated WebP) is heavier than a still banner, so allow more
// than the global 3 MB image cap — but keep it bounded: every customer downloads this on
// the first screen. Animated WebP is ~3-5x smaller than the same GIF.
const HERO_MAX_BYTES = 6 * 1024 * 1024
const MAX_SLIDES = 8

const ASPECT_OPTIONS: Array<{ value: HomeHeroCarousel["aspectRatio"]; label: string }> = [
  { value: "16:9", label: "16:9 — wide (recommended, 1280×720)" },
  { value: "2:1", label: "2:1 — slim banner (1280×640)" },
  { value: "4:3", label: "4:3 — taller (1200×900)" },
  { value: "1:1", label: "1:1 — square (1080×1080)" },
]

function aspectPadding(ratio: HomeHeroCarousel["aspectRatio"]) {
  const [w, h] = ratio.split(":").map(Number)
  return `${(h / w) * 100}%`
}

const DEFAULT_OVERLAY = "#111111"
const OVERLAY_PRESETS = [
  { label: "Dark", value: "#111111" },
  { label: "White", value: "#FFFFFF" },
  { label: "Amber", value: "#FFB84C" },
]

function overlayIsLight(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16)
  if (!Number.isFinite(n)) return false
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6
}

// Mirrors the app overlay: text in the chosen colour, glow/glass derived from it.
function OverlayPreview({ color }: { color?: string }) {
  const text = /^#[0-9a-f]{6}$/i.test(color ?? "") ? (color as string) : DEFAULT_OVERLAY
  const light = overlayIsLight(text)
  const shadow = light ? "0 0 6px rgba(0,0,0,0.6)" : "0 0 6px rgba(255,255,255,0.9)"
  const glass = light
    ? { backgroundColor: "rgba(0,0,0,0.28)", borderColor: "rgba(255,255,255,0.35)" }
    : { backgroundColor: "rgba(255,255,255,0.22)", borderColor: "rgba(255,255,255,0.6)" }
  return (
    <div className="pointer-events-none absolute inset-x-2 top-2 flex items-center gap-1.5">
      <span className="flex size-6 items-center justify-center rounded-md border text-[11px]" style={{ ...glass, color: text }}>
        ●
      </span>
      <div className="min-w-0 flex-1 leading-tight" style={{ color: text, textShadow: shadow }}>
        <div className="text-[11px] font-bold">Deliver to ▾</div>
        <div className="truncate text-[9px] opacity-85">Your saved address</div>
      </div>
      <span className="size-6 rounded-full border" style={glass} />
    </div>
  )
}

function toLocalInput(iso?: string) {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fromLocalInput(value: string) {
  if (!value) return ""
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : date.toISOString()
}

function slideStatus(slide: HomeHeroCarouselSlide) {
  if (!slide.isActive) return { label: "Off", variant: "outline" as const }
  const now = Date.now()
  const starts = slide.startsAt ? Date.parse(slide.startsAt) : NaN
  const ends = slide.endsAt ? Date.parse(slide.endsAt) : NaN
  if (!Number.isNaN(starts) && starts > now) {
    return { label: "Scheduled", variant: "secondary" as const }
  }
  if (!Number.isNaN(ends) && ends <= now) {
    return { label: "Ended", variant: "outline" as const }
  }
  return { label: "Live", variant: "default" as const }
}

export function HomeHeroCarouselEditor({
  value,
  onChange,
}: {
  value: HomeHeroCarousel | undefined
  onChange: (next: HomeHeroCarousel) => void
}) {
  const carousel = { ...DEFAULT_HERO_CAROUSEL, ...(value ?? {}) }
  const slides = Array.isArray(carousel.slides) ? carousel.slides : []
  const [uploading, setUploading] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const update = (patch: Partial<HomeHeroCarousel>) =>
    onChange({ ...carousel, slides, ...patch })
  const updateSlide = (index: number, patch: Partial<HomeHeroCarouselSlide>) =>
    update({
      slides: slides.map((slide, i) => (i === index ? { ...slide, ...patch } : slide)),
    })
  const moveSlide = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= slides.length) return
    const next = [...slides]
    ;[next[index], next[target]] = [next[target], next[index]]
    update({ slides: next })
  }
  const removeSlide = (index: number) =>
    update({ slides: slides.filter((_, i) => i !== index) })

  async function handleUpload(file?: File | null) {
    if (!file) return
    if (slides.length >= MAX_SLIDES) {
      toast.error(`Up to ${MAX_SLIDES} slides`)
      return
    }
    setUploading(true)
    try {
      const asset = await uploadAdminMedia(
        file,
        "foodbela/admin/home-hero",
        "home_hero_carousel",
        "image",
        HERO_MAX_BYTES,
      )
      update({
        slides: [
          ...slides,
          {
            id: `slide-${Date.now().toString(36)}`,
            mediaUrl: asset.url,
            mediaPublicId: asset.publicId,
            title: "",
            linkEnabled: false,
            ctaPath: "",
            overlayTextColor: "",
            isActive: true,
            startsAt: "",
            endsAt: "",
          },
        ],
      })
      toast.success("Slide added")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <Label>Show hero carousel on home</Label>
          <p className="text-xs text-muted-foreground">
            The big animated banner at the top of the customer home (GIF, animated WebP,
            JPG or PNG).
          </p>
        </div>
        <Switch
          checked={carousel.enabled}
          onCheckedChange={(checked) => update({ enabled: checked })}
        />
      </div>

      <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label>Auto-slide</Label>
            <p className="text-xs text-muted-foreground">Moves to the next slide on its own.</p>
          </div>
          <Switch
            checked={carousel.autoPlay}
            onCheckedChange={(checked) => update({ autoPlay: checked })}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label>Show dots</Label>
            <p className="text-xs text-muted-foreground">Page indicator under the banner.</p>
          </div>
          <Switch
            checked={carousel.showDots}
            onCheckedChange={(checked) => update({ showDots: checked })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Seconds per slide</Label>
          <Input
            type="number"
            min={2}
            max={30}
            value={carousel.intervalSeconds}
            onChange={(event) => {
              const next = Math.round(Number(event.target.value))
              if (Number.isFinite(next)) {
                update({ intervalSeconds: Math.min(30, Math.max(2, next)) })
              }
            }}
          />
          <p className="text-xs text-muted-foreground">
            For a GIF, match this to the GIF&apos;s loop length so it isn&apos;t cut mid-animation.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Banner shape</Label>
          <NativeSelect
            className="w-full"
            value={carousel.aspectRatio}
            onChange={(event) =>
              update({
                aspectRatio: event.target.value as HomeHeroCarousel["aspectRatio"],
              })
            }
          >
            {ASPECT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
          <p className="text-xs text-muted-foreground">
            Used until the first slide loads. The app then sizes the banner to the first
            slide&apos;s real shape (never cropped) — upload all slides in the same shape.
          </p>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Label>Slides</Label>
            <p className="text-xs text-muted-foreground">
              Up to {MAX_SLIDES}. Max 6 MB each — animated WebP is far lighter than GIF
              (same look, faster load). Removed slides are deleted from Cloudinary when you
              save (unless another district/zone still uses the same file).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {slides.length}/{MAX_SLIDES}
            </Badge>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/gif,image/webp,image/png,image/jpeg"
              className="hidden"
              onChange={(event) => void handleUpload(event.target.files?.[0])}
            />
            <Button
              type="button"
              size="sm"
              disabled={uploading || slides.length >= MAX_SLIDES}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ImagePlus className="size-4" />
              )}
              Add slide
            </Button>
          </div>
        </div>

        {slides.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
            No slides yet. While empty the app hides the banner and shows a plain header.
          </p>
        ) : null}

        {slides.map((slide, index) => {
          const status = slideStatus(slide)
          return (
            <div key={slide.id || `${slide.mediaUrl}-${index}`} className="rounded-lg border p-3">
              <div className="grid gap-3 md:grid-cols-[240px_1fr]">
                <div
                  className="relative w-full overflow-hidden rounded-md bg-muted"
                  style={{ paddingTop: aspectPadding(carousel.aspectRatio) }}
                >
                  {/* Plain <img> so GIF / animated WebP previews animate in the admin too. */}
                  <img
                    src={slide.mediaUrl}
                    alt={slide.title || `Slide ${index + 1}`}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  <Badge variant={status.variant} className="absolute bottom-2 left-2">
                    {status.label}
                  </Badge>
                  {/* Live preview of the app's "Deliver to" overlay in the chosen colour. */}
                  <OverlayPreview color={slide.overlayTextColor} />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">Slide {index + 1}</span>
                    <div className="flex items-center gap-1">
                      <Switch
                        checked={slide.isActive}
                        onCheckedChange={(checked) => updateSlide(index, { isActive: checked })}
                        aria-label="Slide active"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={index === 0}
                        onClick={() => moveSlide(index, -1)}
                        aria-label="Move up"
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={index === slides.length - 1}
                        onClick={() => moveSlide(index, 1)}
                        aria-label="Move down"
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeSlide(index)}
                        aria-label="Remove slide"
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Accessibility label</Label>
                    <Input
                      value={slide.title}
                      maxLength={120}
                      placeholder="e.g. Weekend biryani fest — 20% off"
                      onChange={(event) => updateSlide(index, { title: event.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Text colour on this slide</Label>
                    <div className="flex flex-wrap items-center gap-2">
                      {OVERLAY_PRESETS.map((preset) => {
                        const selected =
                          (slide.overlayTextColor || DEFAULT_OVERLAY).toUpperCase() === preset.value
                        return (
                          <Button
                            key={preset.value}
                            type="button"
                            size="sm"
                            variant={selected ? "default" : "outline"}
                            onClick={() => updateSlide(index, { overlayTextColor: preset.value })}
                          >
                            <span
                              className="size-3.5 rounded-full border"
                              style={{ backgroundColor: preset.value }}
                            />
                            {preset.label}
                          </Button>
                        )
                      })}
                      <input
                        type="color"
                        aria-label="Custom text colour"
                        className="h-8 w-10 cursor-pointer rounded border bg-transparent p-0.5"
                        value={(slide.overlayTextColor || DEFAULT_OVERLAY).toLowerCase()}
                        onChange={(event) =>
                          updateSlide(index, { overlayTextColor: event.target.value.toUpperCase() })
                        }
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Colour of &ldquo;Deliver to&rdquo;, the address and the bell floating on this
                      slide. Use white for dark / night GIFs, dark for bright ones. Updates in the
                      app as each slide comes on screen (needs the new app build).
                    </p>
                  </div>

                  <div className="space-y-2 rounded-md bg-muted/40 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="flex items-center gap-1.5">
                        <Link2 className="size-3.5" /> Open a screen on tap
                      </Label>
                      <Switch
                        checked={slide.linkEnabled}
                        onCheckedChange={(checked) => updateSlide(index, { linkEnabled: checked })}
                      />
                    </div>
                    {slide.linkEnabled ? (
                      <Input
                        value={slide.ctaPath}
                        placeholder="/restaurants/<id>, /offers, /(tabs)/browse or https://…"
                        onChange={(event) => updateSlide(index, { ctaPath: event.target.value })}
                      />
                    ) : null}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5">
                        <CalendarClock className="size-3.5" /> Starts (optional)
                      </Label>
                      <Input
                        type="datetime-local"
                        value={toLocalInput(slide.startsAt)}
                        onChange={(event) =>
                          updateSlide(index, { startsAt: fromLocalInput(event.target.value) })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5">
                        <CalendarClock className="size-3.5" /> Ends (optional)
                      </Label>
                      <Input
                        type="datetime-local"
                        value={toLocalInput(slide.endsAt)}
                        onChange={(event) =>
                          updateSlide(index, { endsAt: fromLocalInput(event.target.value) })
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
