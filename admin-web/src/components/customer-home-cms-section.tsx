import * as React from "react"
import {
  BarChart3,
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Eye,
  Gift,
  GripVertical,
  Image,
  Loader2,
  MousePointerClick,
  Palette,
  Plus,
  RefreshCcw,
  Save,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { useQuery } from "@tanstack/react-query"

import { listAdminVouchers } from "@/lib/admin-api"
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes-warning"
import {
  deleteAdminMedia,
  uploadAdminMedia,
  type AdminCustomerSummary,
  type AdminRestaurantSummary,
  type PlatformContent,
} from "@/lib/admin-cms-api"
import { PollManagerSection } from "@/components/poll-manager-section"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

function formatCurrency(value?: number | null) {
  return `Tk ${Math.round(Number.isFinite(value ?? 0) ? (value ?? 0) : 0).toLocaleString()}`
}

function formatDate(value?: string | null) {
  if (!value) return "N/A"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "N/A"
  return date.toLocaleString()
}

function formatDateTimeLocalInput(value?: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

function isoFromDateTimeLocalInput(value: string) {
  if (!value.trim()) return ""
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : date.toISOString()
}

function getAudienceLabel(value?: string) {
  if (value === "selected_users") return "Selected users"
  if (value === "new_users") return "New users"
  if (value === "returning_users") return "Returning users"
  return "All users"
}

// <input type="datetime-local"> works in local time with a "YYYY-MM-DDTHH:mm" value; we store an
// absolute ISO string, so convert both ways.
function toDateTimeLocal(iso?: string): string {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fromDateTimeLocal(value: string): string {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toISOString()
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}

function TargetCheckboxList({
  title,
  emptyText,
  options,
  selectedIds,
  onToggle,
}: {
  title: string
  emptyText: string
  options: Array<{ id: string; name: string; helper?: string }>
  selectedIds: string[]
  onToggle: (id: string, checked: boolean) => void
}) {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <Label>{title}</Label>
        <Badge variant="secondary">{selectedIds.length} selected</Badge>
      </div>
      {options.length ? (
        <div className="grid max-h-56 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {options.map((option) => {
            const checked = selectedIds.includes(option.id)
            return (
              <label
                key={option.id}
                className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-sm transition ${
                  checked
                    ? "border-primary/40 bg-primary/5"
                    : "hover:bg-muted/40"
                }`}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(value) =>
                    onToggle(option.id, Boolean(value))
                  }
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {option.name}
                  </span>
                  {option.helper ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {option.helper}
                    </span>
                  ) : null}
                </span>
              </label>
            )
          })}
        </div>
      ) : (
        <div className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
          {emptyText}
        </div>
      )}
    </div>
  )
}

// Draggable horizontal cards for the SELECTED restaurants, so admins control the exact
// display order (drag to reorder). Dependency-free native HTML5 drag-and-drop.
function SortableRestaurantCards({
  options,
  selectedIds,
  onReorder,
  onRemove,
}: {
  options: Array<{ id: string; name: string }>
  selectedIds: string[]
  onReorder: (nextIds: string[]) => void
  onRemove?: (id: string) => void
}) {
  const [dragIndex, setDragIndex] = React.useState<number | null>(null)
  const nameById = React.useMemo(
    () => new Map(options.map((option) => [option.id, option.name])),
    [options]
  )
  const ordered = selectedIds.filter((id) => nameById.has(id))
  if (!ordered.length) return null

  const move = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || to >= ordered.length) return
    const next = [...ordered]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onReorder(next)
  }

  return (
    <div className="mb-3 space-y-1.5">
      <Label className="text-xs">Display order — drag to reorder</Label>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {ordered.map((id, index) => (
          <div
            key={id}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (dragIndex !== null) move(dragIndex, index)
              setDragIndex(null)
            }}
            onDragEnd={() => setDragIndex(null)}
            className={`flex min-w-[150px] max-w-[190px] shrink-0 cursor-grab items-center gap-2 rounded-lg border bg-background px-2.5 py-2 shadow-sm transition active:cursor-grabbing ${
              dragIndex === index ? "opacity-50" : ""
            }`}
          >
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
              {index + 1}
            </span>
            <GripVertical className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {nameById.get(id)}
            </span>
            {onRemove ? (
              <button
                type="button"
                onClick={() => onRemove(id)}
                className="shrink-0 text-muted-foreground transition hover:text-destructive"
                aria-label="Remove"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

function LinkToggleField({
  label,
  helper,
  value,
  onChange,
  placeholder = "/(tabs)/browse",
  defaultValue = "/(tabs)/browse",
}: {
  label: string
  helper?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  defaultValue?: string
}) {
  const enabled = Boolean(value.trim())

  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Label>{label}</Label>
          {helper ? (
            <p className="text-xs text-muted-foreground">{helper}</p>
          ) : null}
        </div>
        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Checkbox
            checked={enabled}
            onCheckedChange={(checked) => onChange(checked ? defaultValue : "")}
          />
          Link
        </label>
      </div>
      <Input
        value={value}
        disabled={!enabled}
        placeholder={
          enabled ? placeholder : "No link. App tap will not redirect."
        }
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

function CmsDetailsCard({
  title,
  description,
  icon,
  summary,
  children,
  defaultOpen = false,
  className = "",
}: {
  title: string
  description: string
  icon: React.ReactNode
  summary?: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  className?: string
}) {
  return (
    <details
      open={defaultOpen}
      className={`group min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm [&_summary::-webkit-details-marker]:hidden ${className}`}
    >
      <summary className="flex cursor-pointer items-center justify-between gap-4 px-4 py-4 transition hover:bg-muted/35">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {icon}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">
              {title}
            </span>
            <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">
              {description}
            </span>
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {summary}
          <ChevronRight className="size-4 text-muted-foreground transition group-open:rotate-90" />
        </div>
      </summary>
      <div className="border-t p-4">{children}</div>
    </details>
  )
}

// Keep in sync with PANEL_PRESETS in customer-app/src/lib/panel-theme.ts.
const PANEL_PRESET_OPTIONS = [
  { id: "neon", label: "Neon (amber)" },
  { id: "ocean", label: "Ocean" },
  { id: "sunset", label: "Sunset" },
  { id: "forest", label: "Forest" },
  { id: "grape", label: "Grape" },
  { id: "midnight", label: "Midnight" },
  { id: "mocha", label: "Mocha" },
  { id: "light", label: "Light" },
  { id: "rose", label: "Rose" },
  { id: "mint", label: "Mint" },
  { id: "sand", label: "Sand" },
]

type PanelThemeValue = NonNullable<
  PlatformContent["customerApp"]["homeCms"]["searchPanelTheme"]
>

function PanelThemePicker({
  value,
  onChange,
}: {
  value?: PanelThemeValue
  onChange: (next: PanelThemeValue) => void
}) {
  const theme: PanelThemeValue = value ?? {
    mode: "manual",
    preset: "neon",
    customColor: "#211A2E",
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Mode</Label>
          <Select
            value={theme.mode ?? "manual"}
            onValueChange={(next) =>
              onChange({ ...theme, mode: next as "manual" | "random" })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual (pick a colour)</SelectItem>
              <SelectItem value="random">Random (rotate every 5h)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {theme.mode !== "random" ? (
          <div className="space-y-1.5">
            <Label>Colour preset</Label>
            <Select
              value={theme.preset ?? "neon"}
              onValueChange={(next) => onChange({ ...theme, preset: next })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PANEL_PRESET_OPTIONS.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
                <SelectItem value="custom">Custom colour</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>
      {theme.mode !== "random" && theme.preset === "custom" ? (
        <div className="space-y-1.5">
          <Label>Custom background colour</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={theme.customColor || "#211A2E"}
              onChange={(event) =>
                onChange({ ...theme, customColor: event.target.value })
              }
              className="h-9 w-12 cursor-pointer rounded border"
            />
            <Input
              value={theme.customColor || "#211A2E"}
              onChange={(event) =>
                onChange({ ...theme, customColor: event.target.value })
              }
              className="w-40"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Text + accent colours auto-adjust for contrast.
          </p>
        </div>
      ) : null}
      {theme.mode === "random" ? (
        <p className="text-xs text-muted-foreground">
          Rotates through all presets automatically, changing every 5 hours.
        </p>
      ) : null}
    </div>
  )
}

function getModalContentMode(
  modal?: PlatformContent["customerApp"]["homeCms"]["modal"]
) {
  if (!modal?.imageUrl) return "text"
  if (!modal.title.trim() && !modal.subtitle.trim()) return "image"
  return "image_text"
}


const DEFAULT_HOME_BANNER: PlatformContent["customerApp"]["homeBanner"] = {
  isActive: false,
  title: "Fresh picks near you",
  subtitle: "Discover curated restaurants, live offers, and nearby favorites.",
  ctaLabel: "Browse all",
  ctaPath: "/(tabs)/browse",
  tone: "sky",
}

const DEFAULT_HOME_CMS: PlatformContent["customerApp"]["homeCms"] = {
  offerStrip: {
    isActive: true,
    showVoucherStrip: true,
    showRestaurantOfferSection: true,
    mode: "voucher_strip",
    title: "Fresh offers near you",
    subtitle: "Limited-time savings from restaurants around you.",
    variant: "text",
    buttonStyle: "pill",
    imageUrl: "",
    imagePublicId: "",
    carouselAutoPlayEnabled: false,
    carouselIntervalSeconds: 5,
    carouselImageUrls: [],
    carouselImages: [],
    ctaLabel: "Browse offers",
    ctaPath: "/(tabs)/browse",
    backgroundColor: "#FFF0F6",
    textColor: "#3F2432",
    accentColor: "#FF5C93",
  },
  myOfferSection: {
    enabled: true,
    activeFrom: "",
  },
  dealsSection: {
    enabled: false,
    title: "Deals for you",
    offerIds: [],
  },
  homeCategories: {
    isActive: true,
    title: "What are you craving?",
    subtitle: "Quickly find popular food around you.",
    items: [
      {
        id: "biryani",
        label: "Biryani",
        searchQuery: "biryani",
        icon: "restaurant-outline",
        color: "#FFF0F6",
        position: 1,
        isActive: true,
      },
      {
        id: "burger",
        label: "Burger",
        searchQuery: "burger",
        icon: "fast-food-outline",
        color: "#FFF5D8",
        position: 2,
        isActive: true,
      },
      {
        id: "grill-chicken",
        label: "Grill chicken",
        searchQuery: "grill chicken",
        icon: "flame-outline",
        color: "#FFE8EA",
        position: 3,
        isActive: true,
      },
      {
        id: "chicken",
        label: "Chicken",
        searchQuery: "chicken",
        icon: "flame-outline",
        color: "#EAF8F2",
        position: 4,
        isActive: true,
      },
      {
        id: "pizza",
        label: "Pizza",
        searchQuery: "pizza",
        icon: "pizza-outline",
        color: "#EDF4FF",
        position: 5,
        isActive: true,
      },
      {
        id: "fast-food",
        label: "Fast food",
        searchQuery: "fast food",
        icon: "fast-food-outline",
        color: "#FFEAF3",
        position: 6,
        isActive: true,
      },
      {
        id: "naan-ruti",
        label: "Naan ruti",
        searchQuery: "naan ruti",
        icon: "flame-outline",
        color: "#FFF4D7",
        position: 7,
        isActive: true,
      },
      {
        id: "porota",
        label: "Porota",
        searchQuery: "porota",
        icon: "restaurant-outline",
        color: "#FFF6E3",
        position: 8,
        isActive: true,
      },
      {
        id: "shawarma",
        label: "Shawarma",
        searchQuery: "shawarma",
        icon: "fast-food-outline",
        color: "#EEF5FF",
        position: 9,
        isActive: true,
      },
      {
        id: "shingara",
        label: "Shingara",
        searchQuery: "shingara",
        icon: "cafe-outline",
        color: "#F1FAF5",
        position: 10,
        isActive: true,
      },
      {
        id: "puri",
        label: "Puri",
        searchQuery: "puri",
        icon: "restaurant-outline",
        color: "#FFF0F6",
        position: 11,
        isActive: true,
      },
      {
        id: "fried-chicken",
        label: "Fried chicken",
        searchQuery: "fried chicken",
        icon: "fast-food-outline",
        color: "#FFF1E8",
        position: 12,
        isActive: true,
      },
      {
        id: "kacchi",
        label: "Kacchi",
        searchQuery: "kacchi",
        icon: "restaurant-outline",
        color: "#FFF4D7",
        position: 13,
        isActive: true,
      },
      {
        id: "khichuri",
        label: "Khichuri",
        searchQuery: "khichuri",
        icon: "nutrition-outline",
        color: "#F1FAF5",
        position: 14,
        isActive: true,
      },
      {
        id: "chinese",
        label: "Chinese",
        searchQuery: "chinese",
        icon: "restaurant-outline",
        color: "#EEF5FF",
        position: 15,
        isActive: true,
      },
      {
        id: "fish",
        label: "Fish",
        searchQuery: "fish",
        icon: "fish-outline",
        color: "#EAF7FF",
        position: 16,
        isActive: true,
      },
      {
        id: "dessert",
        label: "Dessert",
        searchQuery: "dessert",
        icon: "ice-cream-outline",
        color: "#F3EDFF",
        position: 17,
        isActive: true,
      },
      {
        id: "tea-coffee",
        label: "Tea & coffee",
        searchQuery: "tea coffee",
        icon: "cafe-outline",
        color: "#FFF1E8",
        position: 18,
        isActive: true,
      },
      {
        id: "tea-snacks",
        label: "Tea & snacks",
        searchQuery: "tea snacks",
        icon: "cafe-outline",
        color: "#FFF6E3",
        position: 19,
        isActive: true,
      },
      {
        id: "healthy",
        label: "Healthy",
        searchQuery: "healthy",
        icon: "leaf-outline",
        color: "#EAF8F0",
        position: 20,
        isActive: true,
      },
    ],
  },
  restaurantSections: {
    featured: {
      isActive: true,
      title: "Featured restaurants",
      subtitle: "Featured picks for you",
      source: "manual",
      selectedRestaurantIds: [],
      maxItems: 6,
      position: 1,
      layout: "horizontal",
      allowRepeatAcrossSections: true,
    },
    offers: {
      isActive: true,
      title: "Offers for you",
      subtitle: "Places with deals you can use today.",
      source: "auto",
      selectedRestaurantIds: [],
      maxItems: 8,
      position: 2,
      layout: "horizontal",
      allowRepeatAcrossSections: true,
    },
    discoverNew: {
      isActive: true,
      title: "Discover new places",
      subtitle: "Fresh restaurants you may not have tried yet.",
      source: "auto",
      selectedRestaurantIds: [],
      maxItems: 6,
      position: 3,
      layout: "horizontal",
      allowRepeatAcrossSections: true,
    },
    popularNearYou: {
      isActive: true,
      title: "Popular restaurants",
      subtitle: "Most ordered and top rated places on Foodbela.",
      source: "auto",
      selectedRestaurantIds: [],
      maxItems: 6,
      position: 4,
      layout: "horizontal",
      allowRepeatAcrossSections: true,
    },
    nearby: {
      isActive: true,
      title: "Nearby",
      subtitle: "Places deliver near your selected pin.",
      source: "auto",
      selectedRestaurantIds: [],
      maxItems: 8,
      position: 5,
      layout: "vertical",
      allowRepeatAcrossSections: true,
    },
  },
  timeBasedSection: {
    isActive: true,
    source: "auto",
    layout: "horizontal",
    position: 1,
    maxItems: 8,
    windows: [
      {
        id: "breakfast",
        label: "Breakfast",
        title: "Sokaler nasta",
        subtitle: "Garam garam nasta diye din shuru korun.",
        emoji: "🌅",
        icon: "cafe-outline",
        accentColor: "#FFB020",
        startHour: 5,
        endHour: 11,
        matchTags: ["breakfast", "nasta", "paratha", "tea", "coffee", "bakery"],
        selectedRestaurantIds: [],
        isActive: true,
      },
      {
        id: "lunch",
        label: "Lunch",
        title: "Dupurer khabar",
        subtitle: "Bhat, biryani ar bhorta — pet bhore khan.",
        emoji: "🍛",
        icon: "restaurant-outline",
        accentColor: "#FF5C93",
        startHour: 11,
        endHour: 16,
        matchTags: ["lunch", "rice", "biryani", "bhat", "meal", "thali"],
        selectedRestaurantIds: [],
        isActive: true,
      },
      {
        id: "snacks",
        label: "Snacks",
        title: "Bikeler adda",
        subtitle: "Cha-er shathe halka kichu mukhorochok.",
        emoji: "☕",
        icon: "fast-food-outline",
        accentColor: "#7C5CFF",
        startHour: 16,
        endHour: 19,
        matchTags: ["snacks", "fast food", "burger", "pizza", "tea", "coffee", "dessert"],
        selectedRestaurantIds: [],
        isActive: true,
      },
      {
        id: "dinner",
        label: "Dinner",
        title: "Rater khabar",
        subtitle: "Din shesh korun moja kore — garam khabar.",
        emoji: "🌙",
        icon: "moon-outline",
        accentColor: "#2B6DEF",
        startHour: 19,
        endHour: 23,
        matchTags: ["dinner", "biryani", "kebab", "grill", "rice", "curry"],
        selectedRestaurantIds: [],
        isActive: true,
      },
      {
        id: "late_night",
        label: "Late night",
        title: "Raat jaga khide",
        subtitle: "Ekhono khola — raater khide mitiye nin.",
        emoji: "✨",
        icon: "sparkles-outline",
        accentColor: "#0E7C66",
        startHour: 23,
        endHour: 5,
        matchTags: ["fast food", "burger", "pizza", "tea", "coffee", "dessert"],
        selectedRestaurantIds: [],
        isActive: true,
      },
    ],
  },
  cartRecommendations: {
    isActive: true,
    source: "both",
    title: "Recommended add-ons",
    subtitle: "Small extras that go well with this cart.",
    maxItems: 8,
  },
  modal: {
    isActive: false,
    title: "Special offer",
    subtitle: "Open the app and discover fresh deals today.",
    imageUrl: "",
    imagePublicId: "",
    ctaLabel: "Explore now",
    ctaPath: "/(tabs)/browse",
    delaySeconds: 3,
    frequency: "once_per_session",
    backgroundColor: "#FFFFFF",
    textColor: "#2B1D24",
    accentColor: "#FF5C93",
  },
  howToOrderGuide: {
    isActive: false,
    audience: "all_users",
    title: "How to order on Foodbela",
    subtitle: "Watch a 60s quick guide.",
    youtubeUrl: "",
    ctaLabel: "Watch guide",
    placement: "after_offers",
    backgroundColor: "#EDF4FF",
    textColor: "#24406F",
    accentColor: "#5D8BFF",
    guideImages: [],
  },
  pushCampaign: {
    contentType: "text",
    title: "Fresh offers are live",
    body: "Open Foodbela and discover offers near you.",
    imageUrl: "",
    imagePublicId: "",
    path: "/(tabs)/browse",
    currentCampaignId: "",
    audienceType: "all_users",
    selectedCustomerIds: [],
    customerGroupKey: "",
    restaurantScope: "all_restaurants",
    selectedRestaurantIds: [],
    abTest: {
      enabled: false,
      splitPercent: 50,
      variantBTitle: "",
      variantBBody: "",
      variantBPath: "",
    },
    lastSentAt: null,
    totalTargets: 0,
    sentCount: 0,
    disabledCount: 0,
    openCount: 0,
    recipientEvents: [],
    openEvents: [],
    receiptCheckedAt: null,
    conversionWindowDays: 7,
    scheduledAt: null,
    scheduleStatus: "none",
    scheduledByAdminId: "",
    scheduledCreatedAt: null,
    scheduleHistory: [],
    conversions: {
      orderCount: 0,
      deliveredOrderCount: 0,
      deliveredRevenue: 0,
      uniqueOrderingCustomers: 0,
      conversionRate: 0,
      refreshedAt: null,
      convertedOrders: [],
    },
    campaignHistory: [],
  },
  analytics: {
    stripImpressions: 0,
    stripClicks: 0,
    blockImpressions: 0,
    blockClicks: 0,
    modalImpressions: 0,
    modalClicks: 0,
    guideImpressions: 0,
    guideVideoClicks: 0,
    guideImageClicks: 0,
    pushOpens: 0,
    lastEventAt: null,
  },
  analyticsEvents: [],
}

const HOME_CATEGORY_ICON_OPTIONS = [
  { value: "restaurant-outline", label: "Restaurant" },
  { value: "fast-food-outline", label: "Fast food" },
  { value: "flame-outline", label: "Chicken / spicy" },
  { value: "ice-cream-outline", label: "Dessert" },
  { value: "pizza-outline", label: "Pizza" },
  { value: "cafe-outline", label: "Tea / coffee" },
  { value: "fish-outline", label: "Fish" },
  { value: "nutrition-outline", label: "Rice / bowl" },
  { value: "leaf-outline", label: "Healthy" },
  { value: "pricetag-outline", label: "Offer" },
  { value: "sparkles-outline", label: "Featured" },
] as const

type HomeRestaurantSections = NonNullable<
  PlatformContent["customerApp"]["homeCms"]["restaurantSections"]
>
type HomeRestaurantSection = HomeRestaurantSections[keyof HomeRestaurantSections]

function arrayOrDefault<T>(value: unknown, fallback: T[]) {
  return Array.isArray(value) ? (value as T[]) : fallback
}

const NO_CAROUSEL_LINK = "__none"
const CUSTOM_CAROUSEL_LINK = "__custom"

function getRestaurantIdFromCustomerPath(path?: string | null) {
  const match = path
    ?.trim()
    .match(/^\/restaurants\/([A-Za-z0-9_-]+)(?:[?#].*)?$/)
  return match?.[1] ?? ""
}

function normalizeHomeRestaurantSection(
  value: unknown,
  fallback: HomeRestaurantSection
) {
  const section = (value ?? {}) as Partial<typeof fallback>
  return {
    ...fallback,
    ...section,
    selectedRestaurantIds: arrayOrDefault(
      section.selectedRestaurantIds,
      fallback.selectedRestaurantIds ?? []
    ),
    allowRepeatAcrossSections:
      section.allowRepeatAcrossSections ??
      fallback.allowRepeatAcrossSections ??
      true,
  }
}

function normalizeContentForCms(content: PlatformContent | null) {
  if (!content) return null

  const runtimeContent = content as PlatformContent & {
    customerApp?: Partial<PlatformContent["customerApp"]>
  }
  const customerApp = runtimeContent.customerApp ?? {}
  const homeCms = (customerApp.homeCms ?? {}) as Partial<
    PlatformContent["customerApp"]["homeCms"]
  >
  const offerStrip = (homeCms.offerStrip ?? {}) as Partial<
    PlatformContent["customerApp"]["homeCms"]["offerStrip"]
  >
  const myOfferSection = (homeCms.myOfferSection ?? {}) as Partial<
    NonNullable<PlatformContent["customerApp"]["homeCms"]["myOfferSection"]>
  >
  const dealsSection = (homeCms.dealsSection ?? {}) as Partial<
    NonNullable<PlatformContent["customerApp"]["homeCms"]["dealsSection"]>
  >
  const modal = (homeCms.modal ?? {}) as Partial<
    PlatformContent["customerApp"]["homeCms"]["modal"]
  >
  const homeCategories = (homeCms.homeCategories ?? {}) as Partial<
    NonNullable<PlatformContent["customerApp"]["homeCms"]["homeCategories"]>
  >
  const restaurantSections = (homeCms.restaurantSections ?? {}) as Partial<
    NonNullable<PlatformContent["customerApp"]["homeCms"]["restaurantSections"]>
  >
  const cartRecommendations = (homeCms.cartRecommendations ?? {}) as Partial<
    NonNullable<PlatformContent["customerApp"]["homeCms"]["cartRecommendations"]>
  >
  const timeBasedSection = (homeCms.timeBasedSection ?? {}) as Partial<
    NonNullable<PlatformContent["customerApp"]["homeCms"]["timeBasedSection"]>
  >
  const howToOrderGuide = (homeCms.howToOrderGuide ?? {}) as Partial<
    PlatformContent["customerApp"]["homeCms"]["howToOrderGuide"]
  >
  const pushCampaign = (homeCms.pushCampaign ?? {}) as Partial<
    PlatformContent["customerApp"]["homeCms"]["pushCampaign"]
  >
  const analytics = (homeCms.analytics ?? {}) as Partial<
    PlatformContent["customerApp"]["homeCms"]["analytics"]
  >

  return {
    ...content,
    customerApp: {
      ...customerApp,
      homeBanner: {
        ...DEFAULT_HOME_BANNER,
        ...(customerApp.homeBanner ?? {}),
      },
      homeCms: {
        ...DEFAULT_HOME_CMS,
        ...homeCms,
        offerStrip: {
          ...DEFAULT_HOME_CMS.offerStrip,
          ...offerStrip,
          carouselImageUrls: arrayOrDefault(
            offerStrip.carouselImageUrls,
            DEFAULT_HOME_CMS.offerStrip.carouselImageUrls
          ),
          carouselImages: arrayOrDefault(
            offerStrip.carouselImages,
            DEFAULT_HOME_CMS.offerStrip.carouselImages
          ),
        },
        myOfferSection: {
          ...DEFAULT_HOME_CMS.myOfferSection,
          ...myOfferSection,
          enabled: myOfferSection.enabled ?? true,
          activeFrom:
            myOfferSection.activeFrom ||
            (myOfferSection.enabled === false ? "" : new Date().toISOString()),
        },
        dealsSection: {
          ...DEFAULT_HOME_CMS.dealsSection,
          ...dealsSection,
          enabled: dealsSection.enabled ?? false,
          title:
            dealsSection.title ||
            DEFAULT_HOME_CMS.dealsSection?.title ||
            "Deals for you",
          offerIds: arrayOrDefault(
            dealsSection.offerIds,
            DEFAULT_HOME_CMS.dealsSection?.offerIds ?? []
          ),
        },
        homeCategories: {
          ...DEFAULT_HOME_CMS.homeCategories,
          ...homeCategories,
          isActive:
            homeCategories.isActive ??
            DEFAULT_HOME_CMS.homeCategories?.isActive ??
            true,
          title:
            homeCategories.title ??
            DEFAULT_HOME_CMS.homeCategories?.title ??
            "",
          subtitle:
            homeCategories.subtitle ??
            DEFAULT_HOME_CMS.homeCategories?.subtitle ??
            "",
          items: arrayOrDefault(
            homeCategories.items,
            DEFAULT_HOME_CMS.homeCategories?.items ?? []
          ),
        },
        restaurantSections: {
          featured: normalizeHomeRestaurantSection(
            restaurantSections.featured,
            DEFAULT_HOME_CMS.restaurantSections!.featured
          ),
          offers: normalizeHomeRestaurantSection(
            restaurantSections.offers,
            DEFAULT_HOME_CMS.restaurantSections!.offers
          ),
          discoverNew: normalizeHomeRestaurantSection(
            restaurantSections.discoverNew,
            DEFAULT_HOME_CMS.restaurantSections!.discoverNew
          ),
          popularNearYou: normalizeHomeRestaurantSection(
            restaurantSections.popularNearYou,
            DEFAULT_HOME_CMS.restaurantSections!.popularNearYou
          ),
          nearby: normalizeHomeRestaurantSection(
            restaurantSections.nearby,
            DEFAULT_HOME_CMS.restaurantSections!.nearby
          ),
        },
        cartRecommendations: {
          ...DEFAULT_HOME_CMS.cartRecommendations,
          ...cartRecommendations,
          isActive:
            cartRecommendations.isActive ??
            DEFAULT_HOME_CMS.cartRecommendations?.isActive ??
            true,
          source:
            cartRecommendations.source ??
            DEFAULT_HOME_CMS.cartRecommendations?.source ??
            "both",
          title:
            cartRecommendations.title ??
            DEFAULT_HOME_CMS.cartRecommendations?.title ??
            "Recommended add-ons",
          subtitle:
            cartRecommendations.subtitle ??
            DEFAULT_HOME_CMS.cartRecommendations?.subtitle ??
            "",
          maxItems:
            cartRecommendations.maxItems ??
            DEFAULT_HOME_CMS.cartRecommendations?.maxItems ??
            8,
        },
        timeBasedSection: {
          ...DEFAULT_HOME_CMS.timeBasedSection,
          ...timeBasedSection,
          isActive:
            timeBasedSection.isActive ??
            DEFAULT_HOME_CMS.timeBasedSection?.isActive ??
            true,
          source: timeBasedSection.source ?? "auto",
          layout: timeBasedSection.layout ?? "horizontal",
          position: timeBasedSection.position ?? 1,
          maxItems: timeBasedSection.maxItems ?? 8,
          windows: arrayOrDefault(
            timeBasedSection.windows,
            DEFAULT_HOME_CMS.timeBasedSection?.windows ?? []
          ),
        },
        modal: {
          ...DEFAULT_HOME_CMS.modal,
          ...modal,
        },
        howToOrderGuide: {
          ...DEFAULT_HOME_CMS.howToOrderGuide,
          ...howToOrderGuide,
          guideImages: arrayOrDefault(
            howToOrderGuide.guideImages,
            DEFAULT_HOME_CMS.howToOrderGuide.guideImages
          ),
        },
        pushCampaign: {
          ...DEFAULT_HOME_CMS.pushCampaign,
          ...pushCampaign,
          selectedCustomerIds: arrayOrDefault(
            pushCampaign.selectedCustomerIds,
            DEFAULT_HOME_CMS.pushCampaign.selectedCustomerIds
          ),
          selectedRestaurantIds: arrayOrDefault(
            pushCampaign.selectedRestaurantIds,
            DEFAULT_HOME_CMS.pushCampaign.selectedRestaurantIds
          ),
          recipientEvents: arrayOrDefault(
            pushCampaign.recipientEvents,
            DEFAULT_HOME_CMS.pushCampaign.recipientEvents
          ),
          openEvents: arrayOrDefault(
            pushCampaign.openEvents,
            DEFAULT_HOME_CMS.pushCampaign.openEvents
          ),
          scheduleHistory: arrayOrDefault(
            pushCampaign.scheduleHistory,
            DEFAULT_HOME_CMS.pushCampaign.scheduleHistory
          ),
          campaignHistory: arrayOrDefault(
            pushCampaign.campaignHistory,
            DEFAULT_HOME_CMS.pushCampaign.campaignHistory
          ),
          abTest: {
            ...DEFAULT_HOME_CMS.pushCampaign.abTest,
            ...(pushCampaign.abTest ?? {}),
          },
          conversions: {
            ...DEFAULT_HOME_CMS.pushCampaign.conversions,
            ...(pushCampaign.conversions ?? {}),
            convertedOrders: arrayOrDefault(
              pushCampaign.conversions?.convertedOrders,
              DEFAULT_HOME_CMS.pushCampaign.conversions.convertedOrders
            ),
          },
        },
        analytics: {
          ...DEFAULT_HOME_CMS.analytics,
          ...analytics,
        },
        analyticsEvents: arrayOrDefault(
          homeCms.analyticsEvents,
          DEFAULT_HOME_CMS.analyticsEvents
        ),
      },
    },
  } satisfies PlatformContent
}

export function CustomerHomeCmsSection({
  content,
  customers,
  restaurants,
  offerRestaurants = [],
  isLoading,
  isSaving,
  isSending,
  isCheckingReceipts,
  isRefreshingConversions,
  isScheduling = false,
  isCancellingSchedule = false,
  isTestingPush = false,
  onSave,
  onSendPush,
  onCheckReceipts,
  onRefreshConversions,
  onSchedulePush,
  onCancelSchedule,
  onSendTestPush,
  hidePushCampaign = false,
}: {
  content: PlatformContent | null
  customers: AdminCustomerSummary[]
  restaurants: AdminRestaurantSummary[]
  offerRestaurants?: Array<{ id: string; name: string }>
  isLoading: boolean
  isSaving: boolean
  isSending: boolean
  isCheckingReceipts: boolean
  isRefreshingConversions: boolean
  isScheduling?: boolean
  isCancellingSchedule?: boolean
  isTestingPush?: boolean
  onSave: (content: PlatformContent) => void
  onSendPush: (content: PlatformContent) => void
  onCheckReceipts: () => void
  onRefreshConversions: () => void
  onSchedulePush?: (content: PlatformContent, scheduledAt: string) => void
  onCancelSchedule?: () => void
  onSendTestPush?: (content: PlatformContent, customerId: string) => void
  hidePushCampaign?: boolean
}) {
  const navigate = useNavigate()
  const normalizedContent = React.useMemo(
    () => normalizeContentForCms(content),
    [content]
  )
  const [draftContent, setDraftContent] =
    React.useState<PlatformContent | null>(normalizedContent)

  // Active vouchers/offers the admin can feature in the home "Deals for you" section.
  const dealsVouchersQuery = useQuery({
    queryKey: ["admin", "deals-vouchers"],
    queryFn: () => listAdminVouchers({ lifecycle: "Active", pageSize: 100 }),
    staleTime: 60_000,
  })
  const dealsVouchers = dealsVouchersQuery.data?.items ?? []
  const [uploadingKey, setUploadingKey] = React.useState("")
  const [scheduledAtInput, setScheduledAtInput] = React.useState("")
  const [testCustomerId, setTestCustomerId] = React.useState("")
  const [isPreviewVisible, setIsPreviewVisible] = React.useState(true)
  const [campaignHistoryPage, setCampaignHistoryPage] = React.useState(1)
  const [selectedCampaignId, setSelectedCampaignId] = React.useState<
    string | null
  >(null)
  const [campaignRecipientPage, setCampaignRecipientPage] = React.useState(1)
  const [campaignOpenPage, setCampaignOpenPage] = React.useState(1)
  const [campaignErrorPage, setCampaignErrorPage] = React.useState(1)
  const [modalContentMode, setModalContentMode] = React.useState<
    "text" | "image" | "image_text"
  >("text")
  const [analyticsDrawerKey, setAnalyticsDrawerKey] = React.useState<
    "offer_strip" | "promo_block" | "modal" | "guide" | "push" | null
  >(null)

  React.useEffect(() => {
    setDraftContent(normalizedContent)
    setScheduledAtInput(
      normalizedContent?.customerApp.homeCms.pushCampaign.scheduledAt?.slice(
        0,
        16
      ) ?? ""
    )
    setModalContentMode(
      getModalContentMode(normalizedContent?.customerApp.homeCms.modal)
    )
  }, [normalizedContent])

  const cms = draftContent?.customerApp.homeCms
  const hasUnsavedChanges = React.useMemo(() => {
    if (!normalizedContent || !draftContent) return false
    return (
      JSON.stringify(draftContent.customerApp.homeCms) !==
      JSON.stringify(normalizedContent.customerApp.homeCms)
    )
  }, [normalizedContent, draftContent])

  useUnsavedChangesWarning(hasUnsavedChanges && !isSaving && !uploadingKey)

  if (isLoading || !normalizedContent || !draftContent || !cms) {
    return (
      <Card>
        <CardContent className="flex min-h-40 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }
  const currentContent = draftContent
  const currentCms = cms

  function updateCms(nextCms: PlatformContent["customerApp"]["homeCms"]) {
    setIsPreviewVisible(true)
    setDraftContent({
      ...currentContent,
      customerApp: {
        ...currentContent.customerApp,
        homeCms: nextCms,
      },
    })
  }

  function updateOfferStrip<K extends keyof typeof currentCms.offerStrip>(
    key: K,
    value: (typeof currentCms.offerStrip)[K]
  ) {
    updateCms({
      ...currentCms,
      offerStrip: { ...currentCms.offerStrip, [key]: value },
    })
  }

  function updateOfferMode(value: typeof currentCms.offerStrip.mode) {
    updateCms({
      ...currentCms,
      offerStrip: {
        ...currentCms.offerStrip,
        mode: value,
        isActive: value === "promo_block" ? true : false,
        showVoucherStrip:
          value === "voucher_strip"
            ? true
            : currentCms.offerStrip.showVoucherStrip,
      },
    })
  }

  function updateMyOfferSection<K extends keyof NonNullable<typeof currentCms.myOfferSection>>(
    key: K,
    value: NonNullable<typeof currentCms.myOfferSection>[K]
  ) {
    const currentSection = (currentCms.myOfferSection ??
      DEFAULT_HOME_CMS.myOfferSection ??
      {}) as Partial<NonNullable<typeof currentCms.myOfferSection>>
    updateCms({
      ...currentCms,
      myOfferSection: {
        enabled: currentSection.enabled ?? true,
        activeFrom: currentSection.activeFrom ?? "",
        [key]: value,
      },
    })
  }

  function updateDealsSection<
    K extends keyof NonNullable<typeof currentCms.dealsSection>
  >(key: K, value: NonNullable<typeof currentCms.dealsSection>[K]) {
    const currentSection = (currentCms.dealsSection ??
      DEFAULT_HOME_CMS.dealsSection ??
      {}) as Partial<NonNullable<typeof currentCms.dealsSection>>
    updateCms({
      ...currentCms,
      dealsSection: {
        enabled: currentSection.enabled ?? false,
        title: currentSection.title ?? "Deals for you",
        offerIds: currentSection.offerIds ?? [],
        [key]: value,
      },
    })
  }

  function toggleDealsOffer(offerId: string) {
    const current = currentCms.dealsSection?.offerIds ?? []
    const isSelected = current.includes(offerId)
    // Max 6 featured; toggling off removes, toggling on appends (ignored past 6).
    const next = isSelected
      ? current.filter((id) => id !== offerId)
      : current.length >= 6
        ? current
        : [...current, offerId]
    updateDealsSection("offerIds", next)
  }

  function updateHomeCategories(
    nextCategories: NonNullable<typeof currentCms.homeCategories>
  ) {
    updateCms({ ...currentCms, homeCategories: nextCategories })
  }

  function updateHomeCategoryItem(
    index: number,
    patch: Partial<
      NonNullable<typeof currentCms.homeCategories>["items"][number]
    >
  ) {
    const currentCategories =
      currentCms.homeCategories ?? DEFAULT_HOME_CMS.homeCategories!
    updateHomeCategories({
      ...currentCategories,
      items: currentCategories.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      ),
    })
  }

  async function uploadHomeCategoryImage(index: number, file?: File | null) {
    if (!file) return
    const currentCategories =
      currentCms.homeCategories ?? DEFAULT_HOME_CMS.homeCategories!
    const previousPublicId = currentCategories.items[index]?.imagePublicId
    setUploadingKey(`category-image-${index}`)
    try {
      if (previousPublicId) {
        await deleteAdminMedia(previousPublicId).catch(() => undefined)
      }
      const asset = await uploadAdminMedia(file)
      updateHomeCategoryItem(index, {
        imageUrl: asset.url,
        imagePublicId: asset.publicId,
      })
      toast.success("Category image uploaded")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Image upload failed"
      )
    } finally {
      setUploadingKey("")
    }
  }

  async function removeHomeCategoryImage(index: number) {
    const currentCategories =
      currentCms.homeCategories ?? DEFAULT_HOME_CMS.homeCategories!
    const publicId = currentCategories.items[index]?.imagePublicId
    if (publicId) {
      await deleteAdminMedia(publicId).catch(() => undefined)
    }
    updateHomeCategoryItem(index, { imageUrl: "", imagePublicId: "" })
  }

  function updateRestaurantSection<
    K extends keyof NonNullable<typeof currentCms.restaurantSections>,
  >(
    key: K,
    patch: Partial<NonNullable<typeof currentCms.restaurantSections>[K]>
  ) {
    const currentSections =
      currentCms.restaurantSections ?? DEFAULT_HOME_CMS.restaurantSections!
    updateCms({
      ...currentCms,
      restaurantSections: {
        ...currentSections,
        [key]: {
          ...currentSections[key],
          ...patch,
        },
      },
    })
  }

  function updateCartRecommendations<
    K extends keyof NonNullable<typeof currentCms.cartRecommendations>,
  >(
    key: K,
    value: NonNullable<typeof currentCms.cartRecommendations>[K]
  ) {
    updateCms({
      ...currentCms,
      cartRecommendations: {
        ...(currentCms.cartRecommendations ??
          DEFAULT_HOME_CMS.cartRecommendations!),
        [key]: value,
      },
    })
  }

  function updateTimeBasedSection<
    K extends keyof NonNullable<typeof currentCms.timeBasedSection>,
  >(key: K, value: NonNullable<typeof currentCms.timeBasedSection>[K]) {
    updateCms({
      ...currentCms,
      timeBasedSection: {
        ...(currentCms.timeBasedSection ?? DEFAULT_HOME_CMS.timeBasedSection!),
        [key]: value,
      },
    })
  }

  function normalizeTopSectionOrder(
    order?: ("featured" | "timeBased" | "offers")[]
  ): ("featured" | "timeBased" | "offers")[] {
    const keys = ["featured", "timeBased", "offers"] as const
    const deduped = Array.from(
      new Set((order ?? []).filter((key) => keys.includes(key)))
    )
    for (const key of keys) {
      if (!deduped.includes(key)) deduped.push(key)
    }
    return deduped
  }

  function moveTopSection(index: number, direction: -1 | 1) {
    const order = normalizeTopSectionOrder(currentCms.topSectionOrder)
    const target = index + direction
    if (target < 0 || target >= order.length) return
    const next = [...order]
    ;[next[index], next[target]] = [next[target], next[index]]
    // Derive the legacy binary placement so the currently-published app (which still reads
    // `placement`) stays consistent with the new order.
    const placement =
      next.indexOf("timeBased") < next.indexOf("featured")
        ? "above_featured"
        : "below_featured"
    updateCms({
      ...currentCms,
      topSectionOrder: next,
      timeBasedSection: {
        ...(currentCms.timeBasedSection ?? DEFAULT_HOME_CMS.timeBasedSection!),
        placement,
      },
    })
  }

  function updateTimeBasedWindow(
    index: number,
    patch: Partial<
      NonNullable<
        NonNullable<typeof currentCms.timeBasedSection>["windows"]
      >[number]
    >
  ) {
    const section =
      currentCms.timeBasedSection ?? DEFAULT_HOME_CMS.timeBasedSection!
    const windows = section.windows ?? []
    updateTimeBasedSection(
      "windows",
      windows.map((window, windowIndex) =>
        windowIndex === index ? { ...window, ...patch } : window
      )
    )
  }

  function addTimeBasedWindow() {
    const section =
      currentCms.timeBasedSection ?? DEFAULT_HOME_CMS.timeBasedSection!
    const windows = section.windows ?? []
    updateTimeBasedSection("windows", [
      ...windows,
      {
        id: `window-${Date.now()}`,
        label: "New window",
        title: "New time window",
        subtitle: "",
        emoji: "",
        icon: "time-outline",
        accentColor: "#FF5C93",
        startHour: 0,
        endHour: 6,
        matchTags: [],
        selectedRestaurantIds: [],
        isActive: true,
      },
    ])
  }

  function removeTimeBasedWindow(index: number) {
    const section =
      currentCms.timeBasedSection ?? DEFAULT_HOME_CMS.timeBasedSection!
    const windows = section.windows ?? []
    updateTimeBasedSection(
      "windows",
      windows.filter((_, windowIndex) => windowIndex !== index)
    )
  }

  function updateModal<K extends keyof typeof currentCms.modal>(
    key: K,
    value: (typeof currentCms.modal)[K]
  ) {
    updateCms({ ...currentCms, modal: { ...currentCms.modal, [key]: value } })
  }


  function updatePush<K extends keyof typeof currentCms.pushCampaign>(
    key: K,
    value: (typeof currentCms.pushCampaign)[K]
  ) {
    updateCms({
      ...currentCms,
      pushCampaign: { ...currentCms.pushCampaign, [key]: value },
    })
  }

  function updateGuide<K extends keyof typeof currentCms.howToOrderGuide>(
    key: K,
    value: (typeof currentCms.howToOrderGuide)[K]
  ) {
    updateCms({
      ...currentCms,
      howToOrderGuide: { ...currentCms.howToOrderGuide, [key]: value },
    })
  }

  function updateModalContentMode(value: "text" | "image" | "image_text") {
    setModalContentMode(value)
    if (value === "text") {
      updateCms({
        ...currentCms,
        modal: {
          ...currentCms.modal,
          imageUrl: "",
          imagePublicId: "",
        },
      })
      return
    }
    if (value === "image") {
      updateCms({
        ...currentCms,
        modal: {
          ...currentCms.modal,
          title: "",
          subtitle: "",
        },
      })
    }
  }

  async function uploadOfferImage(file?: File | null) {
    if (!file) return
    setUploadingKey("offer-image")
    try {
      if (currentCms.offerStrip.imagePublicId) {
        await deleteAdminMedia(currentCms.offerStrip.imagePublicId).catch(
          () => undefined
        )
      }
      const asset = await uploadAdminMedia(file)
      updateCms({
        ...currentCms,
        offerStrip: {
          ...currentCms.offerStrip,
          imageUrl: asset.url,
          imagePublicId: asset.publicId,
        },
      })
      toast.success("Offer image uploaded")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Image upload failed"
      )
    } finally {
      setUploadingKey("")
    }
  }

  async function removeOfferImage() {
    if (currentCms.offerStrip.imagePublicId) {
      await deleteAdminMedia(currentCms.offerStrip.imagePublicId).catch(
        () => undefined
      )
    }
    updateCms({
      ...currentCms,
      offerStrip: {
        ...currentCms.offerStrip,
        imageUrl: "",
        imagePublicId: "",
      },
    })
  }

  async function uploadCarouselImage(file?: File | null) {
    if (!file) return
    setUploadingKey("carousel")
    try {
      const asset = await uploadAdminMedia(file)
      updateCms({
        ...currentCms,
        offerStrip: {
          ...currentCms.offerStrip,
          carouselImages: [
            ...currentCms.offerStrip.carouselImages,
            { ...asset, linkEnabled: false, ctaPath: "" },
          ],
          carouselImageUrls: [
            ...currentCms.offerStrip.carouselImageUrls,
            asset.url,
          ],
        },
      })
      toast.success("Carousel image uploaded")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Image upload failed"
      )
    } finally {
      setUploadingKey("")
    }
  }

  const designPresets = [
    {
      name: "Rose Pop",
      backgroundColor: "#FFF0F6",
      textColor: "#3F2432",
      accentColor: "#FF5C93",
      buttonStyle: "pill" as const,
    },
    {
      name: "Mint Fresh",
      backgroundColor: "#EAF9F4",
      textColor: "#145C49",
      accentColor: "#1EAD7B",
      buttonStyle: "soft" as const,
    },
    {
      name: "Sunny",
      backgroundColor: "#FFF5D8",
      textColor: "#6E4314",
      accentColor: "#F59E0B",
      buttonStyle: "dark" as const,
    },
    {
      name: "Sky",
      backgroundColor: "#EDF4FF",
      textColor: "#24406F",
      accentColor: "#5D8BFF",
      buttonStyle: "outline" as const,
    },
  ]

  function applyPreset(preset: (typeof designPresets)[number]) {
    updateCms({
      ...currentCms,
      offerStrip: {
        ...currentCms.offerStrip,
        backgroundColor: preset.backgroundColor,
        textColor: preset.textColor,
        accentColor: preset.accentColor,
        buttonStyle: preset.buttonStyle,
      },
    })
  }

  function applyRandomPreset() {
    const hue = Math.floor(Math.random() * 360)
    const accentHue = (hue + 22 + Math.floor(Math.random() * 46)) % 360
    const buttonStyles = ["pill", "soft", "outline", "dark"] as const
    const copyPresets = [
      {
        title: "Flash deals are live",
        subtitle: "Hot savings from nearby kitchens, ready when you are.",
        ctaLabel: "Grab deals",
      },
      {
        title: "Tonight tastes better",
        subtitle:
          "Curated picks, colorful offers, and fast delivery in one tap.",
        ctaLabel: "Order now",
      },
      {
        title: "Your food mood unlocked",
        subtitle: "Try something new with limited-time home screen offers.",
        ctaLabel: "Explore",
      },
      {
        title: "Big bites, small bill",
        subtitle: "Fresh offers for lunch, dinner, snacks, and late cravings.",
        ctaLabel: "Save today",
      },
    ]
    const copy = copyPresets[Math.floor(Math.random() * copyPresets.length)]
    updateCms({
      ...currentCms,
      offerStrip: {
        ...currentCms.offerStrip,
        ...copy,
        backgroundColor: `hsl(${hue} 92% 94%)`,
        textColor: `hsl(${hue} 44% 22%)`,
        accentColor: `hsl(${accentHue} 86% 52%)`,
        buttonStyle:
          buttonStyles[Math.floor(Math.random() * buttonStyles.length)],
      },
    })
  }

  function applyRandomGuideStyle() {
    const guidePresets = [
      {
        backgroundColor: "#EDF4FF",
        textColor: "#24406F",
        accentColor: "#5D8BFF",
        title: "New here? Order in 60 seconds",
        subtitle:
          "Watch the quick guide or swipe through the steps before ordering.",
        ctaLabel: "Watch guide",
      },
      {
        backgroundColor: "#FFF0F6",
        textColor: "#5C243D",
        accentColor: "#FF5C93",
        title: "First order made easy",
        subtitle: "A simple walkthrough for browsing, checkout, and tracking.",
        ctaLabel: "Show me",
      },
      {
        backgroundColor: "#EAF9F4",
        textColor: "#145C49",
        accentColor: "#1EAD7B",
        title: "Learn how Foodbela works",
        subtitle: "Follow the guide and place your next order with confidence.",
        ctaLabel: "Start guide",
      },
      {
        backgroundColor: "#FFF5D8",
        textColor: "#6E4314",
        accentColor: "#F59E0B",
        title: "Ordering help for everyone",
        subtitle: "Video and image steps for customers who need a little help.",
        ctaLabel: "Learn now",
      },
    ]
    const preset = guidePresets[Math.floor(Math.random() * guidePresets.length)]
    updateCms({
      ...currentCms,
      howToOrderGuide: {
        ...currentCms.howToOrderGuide,
        ...preset,
      },
    })
  }

  function updateCarouselImage(
    index: number,
    patch: Partial<(typeof currentCms.offerStrip.carouselImages)[number]>
  ) {
    updateCms({
      ...currentCms,
      offerStrip: {
        ...currentCms.offerStrip,
        carouselImages: currentCms.offerStrip.carouselImages.map(
          (image, itemIndex) =>
            itemIndex === index ? { ...image, ...patch } : image
        ),
      },
    })
  }

  async function removeCarouselImage(index: number) {
    const image = currentCms.offerStrip.carouselImages[index]
    if (image?.publicId) {
      await deleteAdminMedia(image.publicId).catch(() => undefined)
    }
    updateCms({
      ...currentCms,
      offerStrip: {
        ...currentCms.offerStrip,
        carouselImages: currentCms.offerStrip.carouselImages.filter(
          (_, itemIndex) => itemIndex !== index
        ),
        carouselImageUrls: currentCms.offerStrip.carouselImageUrls.filter(
          (_, itemIndex) => itemIndex !== index
        ),
      },
    })
  }

  async function uploadModalImage(file?: File | null) {
    if (!file) return
    setUploadingKey("modal-image")
    try {
      if (currentCms.modal.imagePublicId) {
        await deleteAdminMedia(currentCms.modal.imagePublicId).catch(
          () => undefined
        )
      }
      const asset = await uploadAdminMedia(file)
      updateCms({
        ...currentCms,
        modal: {
          ...currentCms.modal,
          imageUrl: asset.url,
          imagePublicId: asset.publicId,
        },
      })
      toast.success("Modal image uploaded")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Image upload failed"
      )
    } finally {
      setUploadingKey("")
    }
  }

  async function removeModalImage() {
    if (currentCms.modal.imagePublicId) {
      await deleteAdminMedia(currentCms.modal.imagePublicId).catch(
        () => undefined
      )
    }
    updateCms({
      ...currentCms,
      modal: {
        ...currentCms.modal,
        imageUrl: "",
        imagePublicId: "",
      },
    })
  }

  async function uploadPushImage(file?: File | null) {
    if (!file) return
    setUploadingKey("push-image")
    try {
      if (currentCms.pushCampaign.imagePublicId) {
        await deleteAdminMedia(currentCms.pushCampaign.imagePublicId).catch(
          () => undefined
        )
      }
      const asset = await uploadAdminMedia(file)
      updateCms({
        ...currentCms,
        pushCampaign: {
          ...currentCms.pushCampaign,
          imageUrl: asset.url,
          imagePublicId: asset.publicId,
          contentType:
            currentCms.pushCampaign.contentType === "text"
              ? "image_text"
              : currentCms.pushCampaign.contentType,
        },
      })
      toast.success("Push image uploaded")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Push image upload failed"
      )
    } finally {
      setUploadingKey("")
    }
  }

  async function removePushImage() {
    if (currentCms.pushCampaign.imagePublicId) {
      await deleteAdminMedia(currentCms.pushCampaign.imagePublicId).catch(
        () => undefined
      )
    }
    updateCms({
      ...currentCms,
      pushCampaign: {
        ...currentCms.pushCampaign,
        imageUrl: "",
        imagePublicId: "",
        contentType:
          currentCms.pushCampaign.contentType === "image"
            ? "text"
            : currentCms.pushCampaign.contentType,
      },
    })
  }

  async function uploadGuideImage(file?: File | null) {
    if (!file) return
    setUploadingKey("guide-image")
    try {
      const asset = await uploadAdminMedia(file)
      updateGuide("guideImages", [
        ...currentCms.howToOrderGuide.guideImages,
        {
          ...asset,
          title: `Step ${currentCms.howToOrderGuide.guideImages.length + 1}`,
        },
      ])
      toast.success("Guide image uploaded")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Guide image upload failed"
      )
    } finally {
      setUploadingKey("")
    }
  }

  async function removeGuideImage(index: number) {
    const image = currentCms.howToOrderGuide.guideImages[index]
    if (image?.publicId) {
      await deleteAdminMedia(image.publicId).catch(() => undefined)
    }
    updateGuide(
      "guideImages",
      currentCms.howToOrderGuide.guideImages.filter(
        (_, itemIndex) => itemIndex !== index
      )
    )
  }

  function updateGuideImageTitle(index: number, title: string) {
    updateGuide(
      "guideImages",
      currentCms.howToOrderGuide.guideImages.map((image, itemIndex) =>
        itemIndex === index ? { ...image, title } : image
      )
    )
  }

  function handleSendPush() {
    if (
      currentCms.pushCampaign.contentType !== "text" &&
      !currentCms.pushCampaign.imageUrl
    ) {
      toast.error("Image push er jonno age image upload korte hobe")
      return
    }
    onSendPush(currentContent)
  }

  function handleSchedulePush() {
    if (!onSchedulePush) return
    if (
      currentCms.pushCampaign.contentType !== "text" &&
      !currentCms.pushCampaign.imageUrl
    ) {
      toast.error("Image push er jonno age image upload korte hobe")
      return
    }
    if (!scheduledAtInput) {
      toast.error("Schedule time select korte hobe")
      return
    }
    onSchedulePush(currentContent, new Date(scheduledAtInput).toISOString())
  }

  function handleSendTestPush() {
    if (!onSendTestPush) return
    if (
      currentCms.pushCampaign.contentType !== "text" &&
      !currentCms.pushCampaign.imageUrl
    ) {
      toast.error("Image push er jonno age image upload korte hobe")
      return
    }
    if (!testCustomerId) {
      toast.error("Test customer select korte hobe")
      return
    }
    onSendTestPush(currentContent, testCustomerId)
  }

  const previewBlock = currentCms.offerStrip
  const previewCarouselImages = previewBlock.carouselImages.length
    ? previewBlock.carouselImages.map((image) => image.url)
    : previewBlock.carouselImageUrls
  const homeRestaurantSections =
    currentCms.restaurantSections ?? DEFAULT_HOME_CMS.restaurantSections!
  const restaurantSectionEntries = [
    {
      key: "featured" as const,
      label: "Featured",
      helper: "Paid/admin curated placement. Existing featured flags still work as fallback.",
    },
    {
      key: "offers" as const,
      label: "Offers",
      helper: "Restaurants with active vouchers or manually selected campaign picks.",
    },
    {
      key: "discoverNew" as const,
      label: "Discover new places",
      helper: "Fresh restaurants, boosted for places the customer has not tried.",
    },
    {
      key: "popularNearYou" as const,
      label: "Popular restaurants",
      helper: "Recent delivered-order popularity, rating, and open status.",
    },
    {
      key: "nearby" as const,
      label: "Nearby",
      helper: "Default location-based list shown near the bottom of home.",
    },
  ]
  const restaurantTargetOptions = restaurants.map((restaurant) => ({
    id: restaurant.id,
    name: restaurant.name,
    helper: [restaurant.city, restaurant.isOnline ? "Online" : "Offline"]
      .filter(Boolean)
      .join(" / "),
  }))
  const analyticsEvents = currentCms.analyticsEvents ?? []
  const eventLabelByType: Record<string, string> = {
    strip_impression: "Strip viewed",
    strip_click: "Strip clicked",
    block_impression: "Promo block viewed",
    block_click: "Promo block clicked",
    modal_impression: "Modal viewed",
    modal_click: "Modal clicked",
    guide_impression: "Guide viewed",
    guide_video_click: "Guide video clicked",
    guide_image_click: "Guide image clicked",
  }
  const buildCmsEventRows = (eventTypes: string[]) =>
    analyticsEvents
      .filter((event) => eventTypes.includes(event.eventType))
      .map((event) => ({
        customerId: event.customerId,
        customerName: event.customerName,
        customerPhone: event.customerPhone,
        action: eventLabelByType[event.eventType] ?? event.eventType,
        occurredAt: event.occurredAt,
        path: "",
      }))
  const analyticsGroups = [
    {
      key: "offer_strip" as const,
      title: "Offer Strip",
      description: "Voucher strip visibility and clicks.",
      metric: currentCms.analytics.stripImpressions,
      helper: `${currentCms.analytics.stripClicks} clicks`,
      rate:
        currentCms.analytics.stripImpressions > 0
          ? `${Math.round((currentCms.analytics.stripClicks / currentCms.analytics.stripImpressions) * 100)}% CTR`
          : "No CTR yet",
      events: buildCmsEventRows(["strip_impression", "strip_click"]),
    },
    {
      key: "promo_block" as const,
      title: "Promo Block",
      description: "Custom image, text, or carousel block.",
      metric: currentCms.analytics.blockImpressions,
      helper: `${currentCms.analytics.blockClicks} clicks`,
      rate:
        currentCms.analytics.blockImpressions > 0
          ? `${Math.round((currentCms.analytics.blockClicks / currentCms.analytics.blockImpressions) * 100)}% CTR`
          : "No CTR yet",
      events: buildCmsEventRows(["block_impression", "block_click"]),
    },
    {
      key: "modal" as const,
      title: "Modal",
      description: "Timed home modal engagement.",
      metric: currentCms.analytics.modalImpressions,
      helper: `${currentCms.analytics.modalClicks} clicks`,
      rate:
        currentCms.analytics.modalImpressions > 0
          ? `${Math.round((currentCms.analytics.modalClicks / currentCms.analytics.modalImpressions) * 100)}% CTR`
          : "No CTR yet",
      events: buildCmsEventRows(["modal_impression", "modal_click"]),
    },
    {
      key: "guide" as const,
      title: "How-to Guide",
      description: "Tutorial video and image step usage.",
      metric: currentCms.analytics.guideImpressions,
      helper: `${currentCms.analytics.guideVideoClicks + currentCms.analytics.guideImageClicks} clicks`,
      rate:
        currentCms.analytics.guideImpressions > 0
          ? `${Math.round(((currentCms.analytics.guideVideoClicks + currentCms.analytics.guideImageClicks) / currentCms.analytics.guideImpressions) * 100)}% engagement`
          : "No engagement yet",
      events: buildCmsEventRows([
        "guide_impression",
        "guide_video_click",
        "guide_image_click",
      ]),
    },
    {
      key: "push" as const,
      title: "Push Opens",
      description: "Customers who opened the latest promotional push.",
      metric: currentCms.pushCampaign.openCount,
      helper: `${currentCms.pushCampaign.sentCount} push sent / ${
        currentCms.pushCampaign.recipientEvents.filter(
          (event) => event.receiptStatus === "delivered_to_provider"
        ).length
      } provider delivered`,
      rate:
        currentCms.pushCampaign.sentCount > 0
          ? `${Math.round((currentCms.pushCampaign.openCount / currentCms.pushCampaign.sentCount) * 100)}% open rate`
          : "No open rate yet",
      events: [
        ...currentCms.pushCampaign.openEvents.map((event) => ({
          customerId: event.customerId,
          customerName: event.customerName,
          customerPhone: event.customerPhone,
          action: "Opened push",
          occurredAt: event.openedAt,
          path: event.path,
        })),
        ...currentCms.pushCampaign.recipientEvents.map((event) => ({
          customerId: event.customerId,
          customerName: event.customerName,
          customerPhone: event.customerPhone,
          action:
            event.status === "sent"
              ? "Push sent"
              : event.status === "in_app_only"
                ? "In-app notification only"
                : event.status === "preference_disabled"
                  ? "Preference disabled"
                  : "Push failed",
          occurredAt: event.sentAt,
          path:
            event.receiptStatus === "device_not_registered"
              ? "App uninstalled/token expired"
              : event.receiptStatus === "delivered_to_provider"
                ? "Provider accepted"
                : event.receiptStatus === "failed"
                  ? event.receiptError || "Delivery failed"
                  : `${event.expoTokenCount} token pending`,
        })),
      ].sort(
        (left, right) =>
          new Date(right.occurredAt).getTime() -
          new Date(left.occurredAt).getTime()
      ),
    },
  ]
  const selectedAnalyticsGroup =
    analyticsGroups.find((group) => group.key === analyticsDrawerKey) ?? null
  const campaignHistory = currentCms.pushCampaign.campaignHistory ?? []
  const campaignHistoryPageSize = 6
  const campaignHistoryPageCount = Math.max(
    1,
    Math.ceil(campaignHistory.length / campaignHistoryPageSize)
  )
  const safeCampaignHistoryPage = Math.min(
    campaignHistoryPage,
    campaignHistoryPageCount
  )
  const paginatedCampaignHistory = campaignHistory.slice(
    (safeCampaignHistoryPage - 1) * campaignHistoryPageSize,
    safeCampaignHistoryPage * campaignHistoryPageSize
  )
  const selectedCampaign =
    campaignHistory.find(
      (campaign) => campaign.campaignId === selectedCampaignId
    ) ?? null
  const campaignRecipients = selectedCampaign?.recipientEvents ?? []
  const campaignOpens = selectedCampaign?.openEvents ?? []
  const campaignErrors = campaignRecipients.filter(
    (event) =>
      event.status === "failed" ||
      event.status === "preference_disabled" ||
      event.receiptStatus === "failed" ||
      event.receiptStatus === "device_not_registered"
  )
  const campaignRecipientPageSize = 10
  const campaignRecipientPageCount = Math.max(
    1,
    Math.ceil(campaignRecipients.length / campaignRecipientPageSize)
  )
  const campaignOpenPageCount = Math.max(
    1,
    Math.ceil(campaignOpens.length / campaignRecipientPageSize)
  )
  const campaignErrorPageCount = Math.max(
    1,
    Math.ceil(campaignErrors.length / campaignRecipientPageSize)
  )
  const paginatedCampaignRecipients = campaignRecipients.slice(
    (Math.min(campaignRecipientPage, campaignRecipientPageCount) - 1) *
      campaignRecipientPageSize,
    Math.min(campaignRecipientPage, campaignRecipientPageCount) *
      campaignRecipientPageSize
  )
  const paginatedCampaignOpens = campaignOpens.slice(
    (Math.min(campaignOpenPage, campaignOpenPageCount) - 1) *
      campaignRecipientPageSize,
    Math.min(campaignOpenPage, campaignOpenPageCount) *
      campaignRecipientPageSize
  )
  const paginatedCampaignErrors = campaignErrors.slice(
    (Math.min(campaignErrorPage, campaignErrorPageCount) - 1) *
      campaignRecipientPageSize,
    Math.min(campaignErrorPage, campaignErrorPageCount) *
      campaignRecipientPageSize
  )
  const getRecipientStatusLabel = (
    event: (typeof campaignRecipients)[number]
  ) => {
    if (event.receiptStatus === "device_not_registered")
      return "Uninstalled/token expired"
    if (event.receiptStatus === "delivered_to_provider")
      return "Provider accepted"
    if (event.receiptStatus === "failed")
      return event.receiptError || "Delivery failed"
    if (event.status === "preference_disabled") return "Preference disabled"
    if (event.status === "in_app_only") return "In-app only"
    if (event.status === "failed") return "Failed"
    return `${event.expoTokenCount} token pending`
  }
  const openCampaignDetails = (campaignId: string) => {
    setSelectedCampaignId(campaignId)
    setCampaignRecipientPage(1)
    setCampaignOpenPage(1)
    setCampaignErrorPage(1)
  }
  const cloneCampaignToDraft = (campaign: (typeof campaignHistory)[number]) => {
    updateCms({
      ...currentCms,
      pushCampaign: {
        ...currentCms.pushCampaign,
        contentType: campaign.contentType,
        title: campaign.title,
        body: campaign.body,
        imageUrl: campaign.imageUrl,
        imagePublicId: "",
        path: campaign.path,
        audienceType:
          campaign.audienceType as typeof currentCms.pushCampaign.audienceType,
        restaurantScope:
          campaign.restaurantScope as typeof currentCms.pushCampaign.restaurantScope,
        abTest: campaign.abTest ?? currentCms.pushCampaign.abTest,
      },
    })
    setSelectedCampaignId(null)
    toast.success("Campaign copied to draft")
  }
  const resendCampaign = (campaign: (typeof campaignHistory)[number]) => {
    const nextContent: PlatformContent = {
      ...currentContent,
      customerApp: {
        ...currentContent.customerApp,
        homeCms: {
          ...currentCms,
          pushCampaign: {
            ...currentCms.pushCampaign,
            contentType: campaign.contentType,
            title: campaign.title,
            body: campaign.body,
            imageUrl: campaign.imageUrl,
            imagePublicId: "",
            path: campaign.path,
            audienceType:
              campaign.audienceType as typeof currentCms.pushCampaign.audienceType,
            restaurantScope:
              campaign.restaurantScope as typeof currentCms.pushCampaign.restaurantScope,
            abTest: campaign.abTest ?? currentCms.pushCampaign.abTest,
          },
        },
      },
    }
    onSendPush(nextContent)
    setSelectedCampaignId(null)
  }
  const exportCampaignCsv = (campaign: (typeof campaignHistory)[number]) => {
    const rows = [
      [
        "type",
        "customerName",
        "customerPhone",
        "status",
        "time",
        "pathOrReason",
      ],
      ...(campaign.recipientEvents ?? []).map((event) => [
        "recipient",
        event.customerName,
        event.customerPhone,
        getRecipientStatusLabel(event),
        event.sentAt,
        event.receiptError ?? "",
      ]),
      ...(campaign.openEvents ?? []).map((event) => [
        "open",
        event.customerName,
        event.customerPhone,
        "Opened",
        event.openedAt,
        event.path,
      ]),
      ...(campaign.conversions.convertedOrders ?? []).map((order) => [
        "converted_order",
        order.customerName,
        order.customerId,
        `${order.orderNumber} - ${order.status}`,
        order.createdAt,
        String(order.total),
      ]),
    ]
    const csv = rows
      .map((row) =>
        row
          .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${campaign.campaignId || "campaign"}-analytics.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Image className="size-5" />
            Customer Home CMS
          </CardTitle>
          <CardDescription>
            Control the customer-app home strip, replacement block/carousel,
            modal, and standalone push campaign.
          </CardDescription>
        </CardHeader>
        <CardContent
          className={`space-y-4 ${isPreviewVisible ? "xl:pr-[404px]" : ""}`}
        >
          <div className="grid gap-4">
            {hidePushCampaign ? (
              <div className="sticky top-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur xl:col-span-2">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">CMS draft</p>
                    {hasUnsavedChanges ? (
                      <Badge
                        variant="outline"
                        className="border-amber-200 bg-amber-50 text-amber-700"
                      >
                        Unsaved
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-emerald-200 bg-emerald-50 text-emerald-700"
                      >
                        Saved
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Save changes to publish the customer-app home content.
                  </p>
                </div>
                <Button
                  type="button"
                  disabled={isSaving || Boolean(uploadingKey)}
                  onClick={() => onSave(draftContent)}
                >
                  {isSaving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  Save CMS
                </Button>
              </div>
            ) : null}
            {isPreviewVisible ? (
              <Card className="xl:fixed xl:top-24 xl:right-8 xl:z-30 xl:col-start-2 xl:row-span-2 xl:max-h-[calc(100vh-7rem)] xl:w-[380px] xl:self-start xl:overflow-auto">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle>Customer-app home preview</CardTitle>
                      <CardDescription>
                        Preview shows the top home area with your current CMS
                        draft.
                      </CardDescription>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="-mt-2 -mr-2 size-8 shrink-0"
                      aria-label="Close preview"
                      onClick={() => setIsPreviewVisible(false)}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mx-auto max-w-sm overflow-hidden rounded-[28px] border bg-[#FFF7ED] shadow-sm">
                    <div className="relative space-y-3 overflow-hidden rounded-b-[28px] bg-[#FFF3E8] p-4">
                      <div className="absolute -top-12 -right-8 size-32 rounded-full bg-[#FFD7E4]" />
                      <div className="absolute -bottom-12 -left-10 size-28 rounded-full bg-[#DDEAFF]" />
                      <div className="relative flex items-center justify-between gap-3">
                        <div className="rounded-2xl bg-white/80 px-3 py-2">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase">
                            Delivery address
                          </p>
                          <p className="text-sm font-bold">
                            Netrokona, Bangladesh
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <div className="grid size-10 place-items-center rounded-full bg-[#FF5C93] text-white">
                            B
                          </div>
                          <div className="grid size-10 place-items-center rounded-full bg-white text-[#FF5C93]">
                            U
                          </div>
                        </div>
                      </div>
                      <div className="relative rounded-2xl border bg-white px-3 py-3 text-sm font-semibold text-muted-foreground">
                        Search restaurants, burgers, desserts...
                      </div>
                      {currentCms.homeCategories?.isActive ? (
                        <div className="space-y-2 rounded-2xl bg-white/70 p-2">
                          <div className="flex gap-2 overflow-hidden">
                            {currentCms.homeCategories.items
                              .filter((item) => item.isActive !== false)
                              .sort(
                                (left, right) =>
                                  (left.position ?? 0) - (right.position ?? 0)
                              )
                              .slice(0, 4)
                              .map((item) => (
                                <span
                                  key={item.id || item.label}
                                  className="shrink-0 rounded-xl px-3 py-2 text-[11px] font-black text-[#1F2430]"
                                  style={{
                                    backgroundColor: item.color || "#FFF0F6",
                                  }}
                                >
                                  {item.label}
                                </span>
                              ))}
                          </div>
                        </div>
                      ) : null}
                      {previewBlock.isActive &&
                      previewBlock.mode === "promo_block" ? (
                        previewBlock.variant === "carousel" ? (
                          <div className="relative overflow-hidden rounded-xl">
                            <div className="flex gap-2 overflow-hidden">
                              {(previewCarouselImages.length
                                ? previewCarouselImages
                                : [""]
                              )
                                .slice(0, 1)
                                .map((url, index) => (
                                  <div
                                    key={`${url}-${index}`}
                                    className="h-28 w-full shrink-0 overflow-hidden rounded-xl bg-muted"
                                  >
                                    {url ? (
                                      <img
                                        src={url}
                                        alt=""
                                        className="h-full w-full object-cover"
                                      />
                                    ) : null}
                                  </div>
                                ))}
                            </div>
                            <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1">
                              {(previewCarouselImages.length
                                ? previewCarouselImages
                                : ["", "", ""]
                              )
                                .slice(0, 4)
                                .map((_, index) => (
                                  <span
                                    key={index}
                                    className={`h-1.5 rounded-full ${index === 0 ? "w-4 bg-white" : "w-1.5 bg-white/60"}`}
                                  />
                                ))}
                            </div>
                          </div>
                        ) : (
                          <div
                            className={`flex overflow-hidden rounded-2xl ${previewBlock.variant === "image" ? "p-0" : "gap-3 p-3"}`}
                            style={{
                              backgroundColor: previewBlock.backgroundColor,
                            }}
                          >
                            {(previewBlock.variant === "image" ||
                              previewBlock.variant === "image_text") &&
                            previewBlock.imageUrl ? (
                              <img
                                src={previewBlock.imageUrl}
                                alt=""
                                className={
                                  previewBlock.variant === "image"
                                    ? "h-28 w-full object-cover"
                                    : "h-20 w-24 rounded-xl object-cover"
                                }
                              />
                            ) : null}
                            {previewBlock.variant !== "image" ? (
                              <div className="min-w-0 flex-1 space-y-1.5">
                                <span
                                  className="inline-flex rounded-full px-2 py-1 text-[10px] font-bold"
                                  style={{
                                    color: previewBlock.accentColor,
                                    backgroundColor: `${previewBlock.accentColor}22`,
                                  }}
                                >
                                  Promo
                                </span>
                                <p
                                  className="text-base leading-tight font-black"
                                  style={{ color: previewBlock.textColor }}
                                >
                                  {previewBlock.title ||
                                    "Fresh offers near you"}
                                </p>
                                <p
                                  className="line-clamp-2 text-xs font-semibold opacity-80"
                                  style={{ color: previewBlock.textColor }}
                                >
                                  {previewBlock.subtitle ||
                                    "Limited-time savings from restaurants around you."}
                                </p>
                              </div>
                            ) : null}
                          </div>
                        )
                      ) : null}
                      {previewBlock.showVoucherStrip ? (
                        <div className="flex gap-2 overflow-hidden">
                          {["Tk 100 off", "Free delivery", "20% off"].map(
                            (label) => (
                              <span
                                key={label}
                                className="shrink-0 rounded-full bg-[#FFF1F6] px-3 py-2 text-xs font-black text-[#B23B70]"
                              >
                                {label}
                              </span>
                            )
                          )}
                        </div>
                      ) : null}
                      {previewBlock.showRestaurantOfferSection !== false ? (
                        <div className="space-y-2 rounded-2xl bg-[#FFF8FB] p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-[#B23B70]">
                              Offers for you
                            </span>
                            <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-[#B23B70]">
                              Card badges stay on
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {["Sultan Biryani", "Haor Kitchen"].map((label) => (
                              <div
                                key={label}
                                className="overflow-hidden rounded-xl bg-white shadow-sm"
                              >
                                <div className="relative h-14 bg-[#FFE2EC]">
                                  <span className="absolute right-1 bottom-1 rounded-md bg-[#E4116F] px-1.5 py-0.5 text-[9px] font-black text-white">
                                    SAVE
                                  </span>
                                </div>
                                <div className="p-2">
                                  <p className="truncate text-[11px] font-black text-[#1F2430]">
                                    {label}
                                  </p>
                                  <p className="truncate text-[9px] font-semibold text-muted-foreground">
                                    Voucher visible on card
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {currentCms.howToOrderGuide.isActive ? (
                        <div
                          className="rounded-2xl p-3"
                          style={{
                            backgroundColor:
                              currentCms.howToOrderGuide.backgroundColor,
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="grid size-10 place-items-center rounded-full bg-white/70"
                              style={{
                                color: currentCms.howToOrderGuide.accentColor,
                              }}
                            >
                              <Bell className="size-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p
                                className="text-sm font-black"
                                style={{
                                  color: currentCms.howToOrderGuide.textColor,
                                }}
                              >
                                {currentCms.howToOrderGuide.title}
                              </p>
                              <p
                                className="line-clamp-2 text-xs font-semibold opacity-75"
                                style={{
                                  color: currentCms.howToOrderGuide.textColor,
                                }}
                              >
                                {currentCms.howToOrderGuide.subtitle}
                              </p>
                            </div>
                            <span
                              className="rounded-full px-3 py-1.5 text-xs font-black text-white"
                              style={{
                                backgroundColor:
                                  currentCms.howToOrderGuide.accentColor,
                              }}
                            >
                              {currentCms.howToOrderGuide.ctaLabel}
                            </span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <CmsDetailsCard
              title="Offer strip slot"
              description="Voucher strip, custom promo block, image, or carousel."
              icon={<Image className="size-5" />}
              summary={
                <div className="hidden items-center gap-2 sm:flex">
                  <Badge
                    variant={
                      cms.offerStrip.mode === "promo_block" &&
                      cms.offerStrip.isActive
                        ? "default"
                        : "outline"
                    }
                  >
                    {cms.offerStrip.mode === "promo_block" &&
                    cms.offerStrip.isActive
                      ? "Custom on"
                      : "No custom"}
                  </Badge>
                  <Badge variant="secondary">
                    {cms.offerStrip.mode.replace("_", " ")}
                  </Badge>
                </div>
              }
              defaultOpen
            >
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="flex items-center justify-between rounded-lg border p-3 lg:col-span-3">
                  <div>
                    <Label>Custom block visible</Label>
                    <p className="text-xs text-muted-foreground">
                      Controls only the custom text/image/carousel block.
                    </p>
                  </div>
                  <Switch
                    checked={
                      cms.offerStrip.mode === "promo_block" &&
                      cms.offerStrip.isActive
                    }
                    disabled={cms.offerStrip.mode !== "promo_block"}
                    onCheckedChange={(checked) =>
                      updateOfferStrip("isActive", checked)
                    }
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3 lg:col-span-3">
                  <div>
                    <Label>Show home voucher chips</Label>
                    <p className="text-xs text-muted-foreground">
                      Controls only the small horizontal voucher chips near the
                      top of customer-app home.
                    </p>
                  </div>
                  <Switch
                    checked={cms.offerStrip.showVoucherStrip}
                    onCheckedChange={(checked) =>
                      updateOfferStrip("showVoucherStrip", checked)
                    }
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3 lg:col-span-3">
                  <div>
                    <Label>Show restaurants-with-offers section</Label>
                    <p className="text-xs text-muted-foreground">
                      Controls only the "Offers for you" restaurant section.
                      Restaurant card offer badges stay visible when offers
                      exist.
                    </p>
                  </div>
                  <Switch
                    checked={
                      cms.offerStrip.showRestaurantOfferSection !== false
                    }
                    onCheckedChange={(checked) =>
                      updateOfferStrip("showRestaurantOfferSection", checked)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>CMS slot content</Label>
                  <Select
                    value={cms.offerStrip.mode}
                    onValueChange={(value) =>
                      updateOfferMode(value as typeof cms.offerStrip.mode)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hidden">No custom block</SelectItem>
                      <SelectItem value="voucher_strip">
                        Voucher strip only
                      </SelectItem>
                      <SelectItem value="promo_block">Custom block</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {cms.offerStrip.mode === "promo_block" ? (
                  <div className="space-y-2">
                    <Label>Visual</Label>
                    <Select
                      value={cms.offerStrip.variant}
                      onValueChange={(value) =>
                        updateOfferStrip(
                          "variant",
                          value as typeof cms.offerStrip.variant
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="image">Image</SelectItem>
                        <SelectItem value="image_text">Image + text</SelectItem>
                        <SelectItem value="carousel">Carousel</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                {cms.offerStrip.mode === "promo_block" ? (
                  <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                    Text and image promo blocks stay static in the customer app.
                    Carousel slides can autoplay and open a link only when a
                    slide link is enabled below.
                  </div>
                ) : null}
                {cms.offerStrip.mode === "promo_block" &&
                cms.offerStrip.variant === "carousel" ? (
                  <div className="grid gap-3 rounded-lg border p-3 lg:col-span-3 md:grid-cols-3">
                    <div className="flex items-center justify-between gap-3 md:col-span-2">
                      <div>
                        <Label>Carousel autoplay</Label>
                        <p className="text-xs text-muted-foreground">
                          Runs only while the customer home screen is visible.
                        </p>
                      </div>
                      <Switch
                        checked={cms.offerStrip.carouselAutoPlayEnabled === true}
                        onCheckedChange={(checked) =>
                          updateOfferStrip("carouselAutoPlayEnabled", checked)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Seconds per slide</Label>
                      <Input
                        type="number"
                        min={2}
                        max={30}
                        disabled={cms.offerStrip.carouselAutoPlayEnabled !== true}
                        value={cms.offerStrip.carouselIntervalSeconds ?? 5}
                        onChange={(event) => {
                          const nextValue = Number(event.target.value || 5)
                          updateOfferStrip(
                            "carouselIntervalSeconds",
                            Math.max(
                              2,
                              Math.min(
                                30,
                                Number.isFinite(nextValue)
                                  ? Math.floor(nextValue)
                                  : 5
                              )
                            )
                          )
                        }}
                      />
                    </div>
                    <div className="space-y-2 md:col-span-3">
                      <Label>Slide button label</Label>
                      <Input
                        value={cms.offerStrip.ctaLabel}
                        onChange={(event) =>
                          updateOfferStrip("ctaLabel", event.target.value)
                        }
                        placeholder="View restaurant"
                      />
                    </div>
                  </div>
                ) : null}
                {cms.offerStrip.mode === "promo_block" &&
                cms.offerStrip.variant !== "carousel" ? (
                  <div className="space-y-2">
                    <Label>Title</Label>
                    <Input
                      value={cms.offerStrip.title}
                      onChange={(event) =>
                        updateOfferStrip("title", event.target.value)
                      }
                    />
                  </div>
                ) : null}
                {cms.offerStrip.mode === "promo_block" &&
                cms.offerStrip.variant !== "carousel" ? (
                  <div className="space-y-2 lg:col-span-2">
                    <Label>Subtitle</Label>
                    <Input
                      value={cms.offerStrip.subtitle}
                      onChange={(event) =>
                        updateOfferStrip("subtitle", event.target.value)
                      }
                    />
                  </div>
                ) : null}
                {cms.offerStrip.mode === "promo_block" &&
                cms.offerStrip.variant !== "carousel" ? (
                  <div className="space-y-2 lg:col-span-3">
                    <Label>Design presets</Label>
                    <div className="flex flex-wrap gap-2">
                      {designPresets.map((preset) => (
                        <Button
                          key={preset.name}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => applyPreset(preset)}
                        >
                          <span
                            className="size-3 rounded-full"
                            style={{ backgroundColor: preset.accentColor }}
                          />
                          {preset.name}
                        </Button>
                      ))}
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={applyRandomPreset}
                      >
                        <Palette className="size-4" />
                        Random design
                      </Button>
                    </div>
                  </div>
                ) : null}
                {cms.offerStrip.mode === "promo_block" &&
                (cms.offerStrip.variant === "image" ||
                  cms.offerStrip.variant === "image_text") ? (
                  <div className="space-y-2 lg:col-span-3">
                    <Label>Cover image</Label>
                    <div className="flex flex-col gap-2 rounded-lg border p-3">
                      {cms.offerStrip.imageUrl ? (
                        <div className="flex items-center gap-3">
                          <img
                            src={cms.offerStrip.imageUrl}
                            alt=""
                            className="h-16 w-24 rounded-md object-cover"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void removeOfferImage()}
                          >
                            Remove
                          </Button>
                        </div>
                      ) : null}
                      <Input
                        type="file"
                        accept="image/*"
                        disabled={uploadingKey === "offer-image"}
                        onChange={(event) =>
                          void uploadOfferImage(event.target.files?.[0])
                        }
                      />
                      {uploadingKey === "offer-image" ? (
                        <p className="text-xs text-muted-foreground">
                          Uploading image...
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {cms.offerStrip.mode === "promo_block" &&
                cms.offerStrip.variant === "carousel" ? (
                  <div className="space-y-2 lg:col-span-3">
                    <Label>Carousel blocks</Label>
                    <div className="grid gap-2">
                      {cms.offerStrip.carouselImages.map((image, index) => {
                        const linkEnabled = image.linkEnabled === true
                        const selectedRestaurantId =
                          getRestaurantIdFromCustomerPath(image.ctaPath)
                        const hasSelectedRestaurant = restaurantTargetOptions.some(
                          (restaurant) => restaurant.id === selectedRestaurantId
                        )
                        const linkSelectValue = !linkEnabled
                          ? NO_CAROUSEL_LINK
                          : selectedRestaurantId && hasSelectedRestaurant
                            ? selectedRestaurantId
                            : image.ctaPath?.trim()
                              ? CUSTOM_CAROUSEL_LINK
                              : NO_CAROUSEL_LINK

                        return (
                          <div
                            key={`${image.publicId || image.url}-${index}`}
                            className="grid gap-3 rounded-lg border p-3 lg:grid-cols-[auto_1fr_auto]"
                          >
                            <img
                              src={image.url}
                              alt=""
                              className="h-16 w-24 rounded-md object-cover"
                            />
                            <div className="min-w-0 space-y-3">
                              <div className="min-w-0">
                                <p className="font-medium">Slide {index + 1}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {image.publicId || image.url}
                                </p>
                              </div>
                              <div className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2">
                                <div>
                                  <Label>Slide link</Label>
                                  <p className="text-xs text-muted-foreground">
                                    Optional; button appears only when enabled.
                                  </p>
                                </div>
                                <Switch
                                  checked={linkEnabled}
                                  onCheckedChange={(checked) =>
                                    updateCarouselImage(index, {
                                      linkEnabled: checked,
                                    })
                                  }
                                />
                              </div>
                              {linkEnabled ? (
                                <div className="grid gap-2 md:grid-cols-2">
                                  <div className="space-y-1.5">
                                    <Label>Restaurant link</Label>
                                    <Select
                                      value={linkSelectValue}
                                      onValueChange={(value) => {
                                        if (value === NO_CAROUSEL_LINK) {
                                          updateCarouselImage(index, {
                                            linkEnabled: false,
                                            ctaPath: "",
                                          })
                                          return
                                        }
                                        if (value === CUSTOM_CAROUSEL_LINK) {
                                          updateCarouselImage(index, {
                                            linkEnabled: true,
                                            ctaPath: image.ctaPath ?? "",
                                          })
                                          return
                                        }
                                        updateCarouselImage(index, {
                                          linkEnabled: true,
                                          ctaPath: `/restaurants/${value}`,
                                        })
                                      }}
                                    >
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value={NO_CAROUSEL_LINK}>
                                          No link
                                        </SelectItem>
                                        <SelectItem value={CUSTOM_CAROUSEL_LINK}>
                                          Custom path
                                        </SelectItem>
                                        {restaurantTargetOptions.map(
                                          (restaurant) => (
                                            <SelectItem
                                              key={restaurant.id}
                                              value={restaurant.id}
                                            >
                                              {restaurant.name}
                                            </SelectItem>
                                          )
                                        )}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label>Customer app path</Label>
                                    <Input
                                      value={image.ctaPath ?? ""}
                                      onChange={(event) =>
                                        updateCarouselImage(index, {
                                          linkEnabled: true,
                                          ctaPath: event.target.value,
                                        })
                                      }
                                      placeholder="/restaurants/restaurantId"
                                    />
                                  </div>
                                </div>
                              ) : null}
                              <div className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2">
                                <div>
                                  <Label>Sponsored badge</Label>
                                  <p className="text-xs text-muted-foreground">
                                    Shows a "Sponsored" label (top-right) on this
                                    slide.
                                  </p>
                                </div>
                                <Switch
                                  checked={image.sponsored === true}
                                  onCheckedChange={(checked) =>
                                    updateCarouselImage(index, {
                                      sponsored: checked,
                                    })
                                  }
                                />
                              </div>
                              {image.sponsored === true ? (
                                <div className="space-y-1.5">
                                  <Label>Show sponsored until</Label>
                                  <Input
                                    type="datetime-local"
                                    value={toDateTimeLocal(image.sponsoredUntil)}
                                    onChange={(event) =>
                                      updateCarouselImage(index, {
                                        sponsoredUntil: fromDateTimeLocal(
                                          event.target.value
                                        ),
                                      })
                                    }
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    Leave empty for no expiry — the badge hides
                                    automatically after this date/time.
                                  </p>
                                </div>
                              ) : null}
                            </div>
                            <div className="flex items-start justify-end">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => void removeCarouselImage(index)}
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                      <Input
                        type="file"
                        accept="image/*"
                        disabled={uploadingKey === "carousel"}
                        onChange={(event) =>
                          void uploadCarouselImage(event.target.files?.[0])
                        }
                      />
                      {uploadingKey === "carousel" ? (
                        <p className="text-xs text-muted-foreground">
                          Uploading slide...
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {cms.offerStrip.mode === "promo_block" &&
                cms.offerStrip.variant !== "carousel"
                  ? (
                      ["backgroundColor", "textColor", "accentColor"] as const
                    ).map((key) => (
                      <div className="space-y-2" key={key}>
                        <Label>{key.replace("Color", "")}</Label>
                        <Input
                          type="color"
                          value={cms.offerStrip[key]}
                          onChange={(event) =>
                            updateOfferStrip(key, event.target.value)
                          }
                        />
                      </div>
                    ))
                  : null}
              </div>
            </CmsDetailsCard>

            <CmsDetailsCard
              title="My offer profile card"
              description="Area-based visibility for the personalized offer card on the customer profile screen."
              icon={<Gift className="size-5" />}
              summary={
                <Badge
                  variant={
                    cms.myOfferSection?.enabled !== false
                      ? "default"
                      : "outline"
                  }
                >
                  {cms.myOfferSection?.enabled !== false ? "Shown" : "Hidden"}
                </Badge>
              }
            >
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label>Show My offer on profile</Label>
                  <p className="text-xs text-muted-foreground">
                    Saves for the selected district or zone. Eligibility,
                    threshold, and voucher rules still come from Settings.
                  </p>
                </div>
                <Switch
                  checked={cms.myOfferSection?.enabled !== false}
                  onCheckedChange={(checked) =>
                    updateCms({
                      ...cms,
                      myOfferSection: {
                        ...(cms.myOfferSection ?? DEFAULT_HOME_CMS.myOfferSection),
                        enabled: checked,
                        activeFrom: checked
                          ? cms.myOfferSection?.activeFrom || new Date().toISOString()
                          : cms.myOfferSection?.activeFrom || "",
                      },
                    })
                  }
                />
              </div>
              <div className="mt-3 space-y-2 rounded-lg border p-3">
                <Label>Count orders from</Label>
                <Input
                  type="datetime-local"
                  value={formatDateTimeLocalInput(cms.myOfferSection?.activeFrom)}
                  onChange={(event) =>
                    updateMyOfferSection(
                      "activeFrom",
                      isoFromDateTimeLocalInput(event.target.value)
                    )
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Delivered orders before this area activation time will not
                  count toward My offer progress.
                </p>
              </div>
            </CmsDetailsCard>
          </div>

          <CmsDetailsCard
            title="Deals for you"
            description="A curated home showcase of up to 6 offers (auto-applied or coupon), high on the home screen so customers notice and order more. Only offers valid in a customer's area appear; use the scope selector above to control it per district/zone."
            icon={<Gift className="size-5" />}
            summary={
              <div className="hidden items-center gap-2 sm:flex">
                <Badge variant={cms.dealsSection?.enabled ? "default" : "outline"}>
                  {cms.dealsSection?.enabled ? "Shown" : "Hidden"}
                </Badge>
                <Badge variant="secondary">
                  {(cms.dealsSection?.offerIds ?? []).length}/6
                </Badge>
              </div>
            }
          >
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>Show &quot;Deals for you&quot; on home</Label>
                <p className="text-xs text-muted-foreground">
                  A noticeable offers section near the top of the home screen.
                </p>
              </div>
              <Switch
                checked={cms.dealsSection?.enabled ?? false}
                onCheckedChange={(checked) =>
                  updateDealsSection("enabled", checked)
                }
              />
            </div>
            <div className="mt-3 space-y-2 rounded-lg border p-3">
              <Label>Section title</Label>
              <Input
                value={cms.dealsSection?.title ?? "Deals for you"}
                onChange={(event) =>
                  updateDealsSection("title", event.target.value)
                }
                placeholder="Deals for you"
              />
            </div>
            <div className="mt-3 space-y-1.5 rounded-lg border p-3">
              <Label>Offer cards theme</Label>
              <p className="mb-1 text-xs text-muted-foreground">
                Colour look of the offer coupon cards.
              </p>
              <PanelThemePicker
                value={currentCms.offerPanelTheme}
                onChange={(next) =>
                  updateCms({ ...currentCms, offerPanelTheme: next })
                }
              />
            </div>
            <div className="mt-3 space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <Label>Featured offers (max 6)</Label>
                <Badge variant="secondary">
                  {(cms.dealsSection?.offerIds ?? []).length} selected
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Pick the offers to feature. Display order follows selection order.
              </p>
              {dealsVouchersQuery.isLoading ? (
                <p className="text-xs text-muted-foreground">Loading offers…</p>
              ) : dealsVouchers.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No active offers found. Create vouchers/offers first.
                </p>
              ) : (
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {dealsVouchers.map((voucher) => {
                    const selectedIds = cms.dealsSection?.offerIds ?? []
                    const selected = selectedIds.includes(voucher._id)
                    const atLimit = !selected && selectedIds.length >= 6
                    const discountText =
                      voucher.type === "percentage"
                        ? `${voucher.discountValue ?? 0}% off`
                        : String(voucher.type).includes("free")
                          ? "Free delivery"
                          : `৳${voucher.discountValue ?? 0} off`
                    return (
                      <label
                        key={voucher._id}
                        className={`flex items-start gap-3 rounded-md border p-2 ${
                          atLimit ? "opacity-50" : "cursor-pointer"
                        }`}
                      >
                        <Checkbox
                          checked={selected}
                          disabled={atLimit}
                          onCheckedChange={() => toggleDealsOffer(voucher._id)}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">
                              {voucher.name || "Untitled offer"}
                            </span>
                            <Badge
                              variant="outline"
                              className="shrink-0 text-[10px]"
                            >
                              {voucher.mode === "auto"
                                ? "Auto"
                                : voucher.code || "Coupon"}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {discountText}
                            {voucher.minimumOrderAmount
                              ? ` · min ৳${voucher.minimumOrderAmount}`
                              : ""}
                          </p>
                        </div>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          </CmsDetailsCard>

          <CmsDetailsCard
            title="Home food categories"
            description="Customer home quick shortcuts. Pressing a chip opens the dedicated search screen."
            icon={<MousePointerClick className="size-5" />}
            summary={
              <div className="hidden items-center gap-2 sm:flex">
                <Badge
                  variant={cms.homeCategories?.isActive ? "default" : "outline"}
                >
                  {cms.homeCategories?.isActive ? "Active" : "Off"}
                </Badge>
                <Badge variant="secondary">
                  {
                    (cms.homeCategories?.items ?? []).filter(
                      (item) => item.isActive !== false
                    ).length
                  }{" "}
                  chips
                </Badge>
              </div>
            }
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center justify-between rounded-lg border p-3 md:col-span-2">
                <div>
                  <Label>Show categories on home</Label>
                  <p className="text-xs text-muted-foreground">
                    This only controls the home shortcut row. Browse and search
                    still work normally.
                  </p>
                </div>
                <Switch
                  checked={cms.homeCategories?.isActive !== false}
                  onCheckedChange={(checked) =>
                    updateHomeCategories({
                      ...(cms.homeCategories ??
                        DEFAULT_HOME_CMS.homeCategories!),
                      isActive: checked,
                    })
                  }
                />
              </div>
              <div className="space-y-1.5 rounded-lg border p-3 md:col-span-2">
                <Label>Search + categories panel theme</Label>
                <p className="mb-1 text-xs text-muted-foreground">
                  Background look of the home search bar + categories panel.
                </p>
                <PanelThemePicker
                  value={currentCms.searchPanelTheme}
                  onChange={(next) =>
                    updateCms({ ...currentCms, searchPanelTheme: next })
                  }
                />
              </div>
              <div className="space-y-3 md:col-span-2">
                {(cms.homeCategories?.items ?? []).map((item, index) => (
                  <div
                    key={item.id || `${item.label}-${index}`}
                    className="grid gap-2 rounded-lg border bg-muted/20 p-3 md:grid-cols-[76px_1fr_1fr_140px_84px_78px_auto] md:items-end"
                  >
                    <div className="space-y-1.5">
                      <Label>Image</Label>
                      <label
                        className="relative flex h-11 w-11 cursor-pointer items-center justify-center overflow-hidden rounded-lg border"
                        style={{ backgroundColor: item.color || "#FFF0F6" }}
                        title="Upload category image (optional — falls back to the icon)"
                      >
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-[9px] font-medium text-muted-foreground">
                            Add
                          </span>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingKey === `category-image-${index}`}
                          onChange={(event) =>
                            void uploadHomeCategoryImage(
                              index,
                              event.target.files?.[0]
                            )
                          }
                        />
                      </label>
                      {item.imageUrl ? (
                        <button
                          type="button"
                          className="text-[10px] text-muted-foreground underline"
                          onClick={() => void removeHomeCategoryImage(index)}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                    <div className="space-y-1.5">
                      <Label>Label</Label>
                      <Input
                        value={item.label}
                        onChange={(event) =>
                          updateHomeCategoryItem(index, {
                            label: event.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Search query</Label>
                      <Input
                        value={item.searchQuery}
                        onChange={(event) =>
                          updateHomeCategoryItem(index, {
                            searchQuery: event.target.value,
                          })
                        }
                        placeholder="burger, chicken, dessert"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Icon</Label>
                      <Select
                        value={item.icon || "restaurant-outline"}
                        onValueChange={(value) =>
                          updateHomeCategoryItem(index, { icon: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {HOME_CATEGORY_ICON_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Order</Label>
                      <Input
                        type="number"
                        value={item.position ?? index + 1}
                        onChange={(event) =>
                          updateHomeCategoryItem(index, {
                            position: Number(event.target.value || index + 1),
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Color</Label>
                      <Input
                        type="color"
                        value={item.color || "#FFF0F6"}
                        onChange={(event) =>
                          updateHomeCategoryItem(index, {
                            color: event.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <Switch
                        checked={item.isActive !== false}
                        onCheckedChange={(checked) =>
                          updateHomeCategoryItem(index, { isActive: checked })
                        }
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const currentCategories =
                            cms.homeCategories ??
                            DEFAULT_HOME_CMS.homeCategories!
                          updateHomeCategories({
                            ...currentCategories,
                            items: currentCategories.items.filter(
                              (_, itemIndex) => itemIndex !== index
                            ),
                          })
                        }}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    const currentCategories =
                      cms.homeCategories ?? DEFAULT_HOME_CMS.homeCategories!
                    const nextIndex = currentCategories.items.length + 1
                    updateHomeCategories({
                      ...currentCategories,
                      items: [
                        ...currentCategories.items,
                        {
                          id: `category-${Date.now()}`,
                          label: "New category",
                          searchQuery: "new",
                          icon: "restaurant-outline",
                          color: "#FFF0F6",
                          position: nextIndex,
                          isActive: true,
                        },
                      ],
                    })
                  }}
                >
                  Add category chip
                </Button>
              </div>
            </div>
          </CmsDetailsCard>

          <CmsDetailsCard
            title="Home restaurant sections"
            description="Control Featured, Offers, Discover new places, Popular restaurants, and Nearby from one place."
            icon={<Eye className="size-5" />}
            summary={
              <div className="hidden items-center gap-2 sm:flex">
                <Badge variant="secondary">
                  {
                    restaurantSectionEntries.filter(
                      (entry) => homeRestaurantSections[entry.key].isActive !== false
                    ).length
                  }{" "}
                  active
                </Badge>
              </div>
            }
          >
            <div className="mb-4 rounded-xl border bg-muted/15 p-4">
              <Label>Top section order</Label>
              <p className="mt-1 mb-3 text-xs text-muted-foreground">
                Order of the three top home sections on the app: Featured, Live
                (time-based), and Offers for you. The app renders them in exactly
                this order.
              </p>
              <div className="space-y-2">
                {normalizeTopSectionOrder(currentCms.topSectionOrder).map(
                  (key, index, order) => {
                    const label =
                      key === "featured"
                        ? "Featured restaurants"
                        : key === "timeBased"
                          ? "Live (time-based)"
                          : "Offers for you"
                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between rounded-lg border bg-background px-3 py-2"
                      >
                        <span className="text-sm font-medium">
                          {index + 1}. {label}
                        </span>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-8"
                            disabled={index === 0}
                            onClick={() => moveTopSection(index, -1)}
                            aria-label={`Move ${label} up`}
                          >
                            <ChevronUp className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-8"
                            disabled={index === order.length - 1}
                            onClick={() => moveTopSection(index, 1)}
                            aria-label={`Move ${label} down`}
                          >
                            <ChevronDown className="size-4" />
                          </Button>
                        </div>
                      </div>
                    )
                  }
                )}
              </div>
            </div>

            <div className="grid gap-4">
              {restaurantSectionEntries.map((entry) => {
                const section = homeRestaurantSections[entry.key]
                return (
                  <div
                    key={entry.key}
                    className="rounded-xl border bg-muted/15 p-4"
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Label>{entry.label}</Label>
                          <Badge
                            variant={
                              section.isActive !== false ? "default" : "outline"
                            }
                          >
                            {section.isActive !== false ? "Active" : "Off"}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {entry.helper}
                        </p>
                      </div>
                      <Switch
                        checked={section.isActive !== false}
                        onCheckedChange={(checked) =>
                          updateRestaurantSection(entry.key, {
                            isActive: checked,
                          })
                        }
                      />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="space-y-1.5 xl:col-span-2">
                        <Label>Title</Label>
                        <Input
                          value={section.title}
                          onChange={(event) =>
                            updateRestaurantSection(entry.key, {
                              title: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1.5 xl:col-span-2">
                        <Label>Subtitle</Label>
                        <Input
                          value={section.subtitle}
                          onChange={(event) =>
                            updateRestaurantSection(entry.key, {
                              subtitle: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Header emoji</Label>
                        <Input
                          value={section.emoji ?? ""}
                          maxLength={8}
                          placeholder="e.g. 🔥 (optional)"
                          onChange={(event) =>
                            updateRestaurantSection(entry.key, {
                              emoji: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Source</Label>
                        <Select
                          value={section.source ?? "auto"}
                          onValueChange={(value) =>
                            updateRestaurantSection(entry.key, {
                              source: value as typeof section.source,
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">Auto algorithm</SelectItem>
                            <SelectItem value="manual">
                              Manual restaurants
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Max items</Label>
                        <Input
                          type="number"
                          min={1}
                          max={20}
                          value={section.maxItems ?? 6}
                          onChange={(event) =>
                            updateRestaurantSection(entry.key, {
                              maxItems: Number(event.target.value || 1),
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Layout</Label>
                        <Select
                          value={section.layout ?? "horizontal"}
                          onValueChange={(value) =>
                            updateRestaurantSection(entry.key, {
                              layout: value as typeof section.layout,
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="horizontal">Horizontal</SelectItem>
                            <SelectItem value="vertical">Vertical</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border bg-background px-3 py-2 xl:col-span-2">
                        <div>
                          <Label>Allow repeat in other sections</Label>
                          <p className="text-xs text-muted-foreground">
                            Keep on so a new featured restaurant can still
                            appear in Discover new places.
                          </p>
                        </div>
                        <Switch
                          checked={section.allowRepeatAcrossSections !== false}
                          onCheckedChange={(checked) =>
                            updateRestaurantSection(entry.key, {
                              allowRepeatAcrossSections: checked,
                            })
                          }
                        />
                      </div>
                    </div>
                    {entry.key === "offers" ? (
                      <div className="mt-4 space-y-2">
                        <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                          Auto-filled with every restaurant that currently has a
                          live offer. Drag to set the display order — a restaurant
                          whose offer expires drops off automatically.
                        </p>
                        {offerRestaurants.length ? (
                          <SortableRestaurantCards
                            options={offerRestaurants}
                            selectedIds={[
                              ...(section.selectedRestaurantIds ?? []).filter(
                                (id) =>
                                  offerRestaurants.some(
                                    (restaurant) => restaurant.id === id
                                  )
                              ),
                              ...offerRestaurants
                                .filter(
                                  (restaurant) =>
                                    !(
                                      section.selectedRestaurantIds ?? []
                                    ).includes(restaurant.id)
                                )
                                .map((restaurant) => restaurant.id),
                            ]}
                            onReorder={(nextIds) =>
                              updateRestaurantSection(entry.key, {
                                selectedRestaurantIds: nextIds,
                              })
                            }
                          />
                        ) : (
                          <p className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
                            No restaurants have an active offer right now.
                          </p>
                        )}
                      </div>
                    ) : section.source === "manual" ? (
                      <div className="mt-4">
                        <SortableRestaurantCards
                          options={restaurantTargetOptions}
                          selectedIds={section.selectedRestaurantIds ?? []}
                          onReorder={(nextIds) =>
                            updateRestaurantSection(entry.key, {
                              selectedRestaurantIds: nextIds,
                            })
                          }
                          onRemove={(id) =>
                            updateRestaurantSection(entry.key, {
                              selectedRestaurantIds: (
                                section.selectedRestaurantIds ?? []
                              ).filter((item) => item !== id),
                            })
                          }
                        />
                        <TargetCheckboxList
                          title={`${entry.label} restaurants`}
                          emptyText="No restaurants available in this admin scope."
                          options={restaurantTargetOptions}
                          selectedIds={section.selectedRestaurantIds ?? []}
                          onToggle={(id, checked) =>
                            updateRestaurantSection(entry.key, {
                              selectedRestaurantIds: checked
                                ? [...(section.selectedRestaurantIds ?? []), id]
                                : (section.selectedRestaurantIds ?? []).filter(
                                    (item) => item !== id
                                  ),
                            })
                          }
                        />
                      </div>
                    ) : (
                      <p className="mt-3 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                        Auto source uses selected area, serviceability, open
                        status, offers, newness, ratings, and recent orders.
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </CmsDetailsCard>

          <CmsDetailsCard
            title="Cart recommendations"
            description="Control the compact add-on suggestion row shown below the customer cart."
            icon={<ShoppingCart className="size-5" />}
            summary={
              <div className="hidden items-center gap-2 sm:flex">
                <Badge
                  variant={
                    cms.cartRecommendations?.isActive !== false
                      ? "default"
                      : "outline"
                  }
                >
                  {cms.cartRecommendations?.isActive !== false
                    ? "Active"
                    : "Off"}
                </Badge>
                <Badge variant="secondary">
                  {(cms.cartRecommendations?.source ?? "both").toUpperCase()}
                </Badge>
              </div>
            }
          >
            <div className="grid gap-4 lg:grid-cols-4">
              <div className="flex items-center justify-between rounded-lg border p-3 lg:col-span-4">
                <div>
                  <Label>Show recommendations in cart</Label>
                  <p className="text-xs text-muted-foreground">
                    Keep this on for lightweight upsell suggestions before
                    checkout.
                  </p>
                </div>
                <Switch
                  checked={cms.cartRecommendations?.isActive !== false}
                  onCheckedChange={(checked) =>
                    updateCartRecommendations("isActive", checked)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Source</Label>
                <Select
                  value={cms.cartRecommendations?.source ?? "both"}
                  onValueChange={(value) =>
                    updateCartRecommendations(
                      "source",
                      value as NonNullable<
                        typeof cms.cartRecommendations
                      >["source"]
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Manual first + auto</SelectItem>
                    <SelectItem value="manual">Manual only</SelectItem>
                    <SelectItem value="auto">Auto only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 lg:col-span-2">
                <Label>Title</Label>
                <Input
                  value={cms.cartRecommendations?.title ?? ""}
                  onChange={(event) =>
                    updateCartRecommendations("title", event.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Max items</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={cms.cartRecommendations?.maxItems ?? 8}
                  onChange={(event) =>
                    updateCartRecommendations(
                      "maxItems",
                      Number(event.target.value || 1)
                    )
                  }
                />
              </div>
              <div className="space-y-2 lg:col-span-4">
                <Label>Subtitle</Label>
                <Input
                  value={cms.cartRecommendations?.subtitle ?? ""}
                  onChange={(event) =>
                    updateCartRecommendations("subtitle", event.target.value)
                  }
                />
              </div>
              <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground lg:col-span-4">
                Manual items are selected in restaurant-owner-web menu items.
                Both mode shows those first, then fills empty slots with
                available popular or lower-priced items from the same
                restaurant.
              </p>
            </div>
          </CmsDetailsCard>

          <CmsDetailsCard
            title="Time-based section"
            description="A single home row that swaps with the Asia/Dhaka clock (breakfast, lunch, snacks, dinner, late night). The customer app shows whichever window is live now."
            icon={<Clock className="size-5" />}
            summary={
              <div className="hidden items-center gap-2 sm:flex">
                <Badge
                  variant={
                    cms.timeBasedSection?.isActive !== false
                      ? "default"
                      : "outline"
                  }
                >
                  {cms.timeBasedSection?.isActive !== false ? "Active" : "Off"}
                </Badge>
                <Badge variant="secondary">
                  {(cms.timeBasedSection?.windows?.length ?? 0)} windows
                </Badge>
              </div>
            }
          >
            <div className="grid gap-4 lg:grid-cols-4">
              <div className="flex items-center justify-between rounded-lg border p-3 lg:col-span-4">
                <div>
                  <Label>Show time-based row on home</Label>
                  <p className="text-xs text-muted-foreground">
                    When off, the whole row is hidden no matter the time. No app
                    update needed.
                  </p>
                </div>
                <Switch
                  checked={cms.timeBasedSection?.isActive !== false}
                  onCheckedChange={(checked) =>
                    updateTimeBasedSection("isActive", checked)
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Restaurant source</Label>
                <Select
                  value={cms.timeBasedSection?.source ?? "auto"}
                  onValueChange={(value) =>
                    updateTimeBasedSection(
                      "source",
                      value as NonNullable<
                        typeof cms.timeBasedSection
                      >["source"]
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">
                      Auto (match by tags)
                    </SelectItem>
                    <SelectItem value="manual">
                      Manual (pick per window)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Layout</Label>
                <Select
                  value={cms.timeBasedSection?.layout ?? "horizontal"}
                  onValueChange={(value) =>
                    updateTimeBasedSection(
                      "layout",
                      value as NonNullable<
                        typeof cms.timeBasedSection
                      >["layout"]
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="horizontal">Horizontal</SelectItem>
                    <SelectItem value="vertical">Vertical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Placement</Label>
                <p className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  Set from <b>Top section order</b> in the Home restaurant
                  sections card above (Featured / Live / Offers).
                </p>
              </div>
              <div className="space-y-2">
                <Label>Position</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={cms.timeBasedSection?.position ?? 1}
                  onChange={(event) =>
                    updateTimeBasedSection(
                      "position",
                      Number(event.target.value || 1)
                    )
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Max items</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={cms.timeBasedSection?.maxItems ?? 8}
                  onChange={(event) =>
                    updateTimeBasedSection(
                      "maxItems",
                      Number(event.target.value || 1)
                    )
                  }
                />
              </div>

              <div className="space-y-3 lg:col-span-4">
                <div className="flex items-center justify-between">
                  <Label>Time windows</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addTimeBasedWindow}
                  >
                    <Plus className="mr-1 size-4" /> Add window
                  </Button>
                </div>

                {(cms.timeBasedSection?.windows ?? []).map((window, index) => (
                  <div
                    key={window.id || index}
                    className="space-y-3 rounded-lg border p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block size-4 rounded-full border"
                          style={{
                            backgroundColor: window.accentColor || "#FF5C93",
                          }}
                        />
                        <span className="text-sm font-medium">
                          {window.label || window.title || "Window"}
                        </span>
                        <Badge variant="secondary">
                          {(window.startHour ?? 0)}:00 –{" "}
                          {(window.endHour ?? 24)}:00
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={window.isActive !== false}
                          onCheckedChange={(checked) =>
                            updateTimeBasedWindow(index, { isActive: checked })
                          }
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeTimeBasedWindow(index)}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-4">
                      <div className="space-y-1.5 lg:col-span-2">
                        <Label className="text-xs">Title (shown)</Label>
                        <Input
                          value={window.title ?? ""}
                          onChange={(event) =>
                            updateTimeBasedWindow(index, {
                              title: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Emoji</Label>
                        <Input
                          value={window.emoji ?? ""}
                          placeholder="🍛"
                          onChange={(event) =>
                            updateTimeBasedWindow(index, {
                              emoji: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Accent color</Label>
                        <Input
                          type="color"
                          value={window.accentColor || "#FF5C93"}
                          onChange={(event) =>
                            updateTimeBasedWindow(index, {
                              accentColor: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1.5 lg:col-span-4">
                        <Label className="text-xs">Subtitle</Label>
                        <Input
                          value={window.subtitle ?? ""}
                          onChange={(event) =>
                            updateTimeBasedWindow(index, {
                              subtitle: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Start hour (0–23)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={23}
                          value={window.startHour ?? 0}
                          onChange={(event) =>
                            updateTimeBasedWindow(index, {
                              startHour: Number(event.target.value || 0),
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">End hour (1–24)</Label>
                        <Input
                          type="number"
                          min={1}
                          max={24}
                          value={window.endHour ?? 24}
                          onChange={(event) =>
                            updateTimeBasedWindow(index, {
                              endHour: Number(event.target.value || 24),
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1.5 lg:col-span-2">
                        <Label className="text-xs">
                          Match tags (comma separated)
                        </Label>
                        <Input
                          value={(window.matchTags ?? []).join(", ")}
                          placeholder="biryani, rice, lunch"
                          onChange={(event) =>
                            updateTimeBasedWindow(index, {
                              matchTags: event.target.value
                                .split(",")
                                .map((tag) => tag.trim())
                                .filter(Boolean),
                            })
                          }
                        />
                      </div>
                      {cms.timeBasedSection?.source === "manual" ? (
                        <div className="space-y-1.5 lg:col-span-4">
                          <Label className="text-xs">
                            Manual restaurant IDs (comma separated)
                          </Label>
                          <Input
                            value={(window.selectedRestaurantIds ?? []).join(
                              ", "
                            )}
                            onChange={(event) =>
                              updateTimeBasedWindow(index, {
                                selectedRestaurantIds: event.target.value
                                  .split(",")
                                  .map((id) => id.trim())
                                  .filter(Boolean),
                              })
                            }
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground lg:col-span-4">
                Hours use the Asia/Dhaka clock. If end hour is less than or equal
                to start hour, the window wraps past midnight (e.g. 23 → 5). In
                Auto mode, restaurants are matched by tags against cuisine/name;
                if none match, popular nearby places fill the row so it never
                shows empty.
              </p>
            </div>
          </CmsDetailsCard>

          <CmsDetailsCard
            title="How to order guide"
            description="YouTube tutorial or step-by-step images on home."
            icon={<MousePointerClick className="size-5" />}
            summary={
              <div className="hidden items-center gap-2 sm:flex">
                <Badge
                  variant={cms.howToOrderGuide.isActive ? "default" : "outline"}
                >
                  {cms.howToOrderGuide.isActive ? "Active" : "Off"}
                </Badge>
                <Badge variant="secondary">
                  {cms.howToOrderGuide.audience.replace("_", " ")}
                </Badge>
              </div>
            }
          >
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="flex items-center justify-between rounded-lg border p-3 lg:col-span-3">
                <div>
                  <Label>Visible on home</Label>
                  <p className="text-xs text-muted-foreground">
                    Use this for users who do not know how to place an order.
                  </p>
                </div>
                <Switch
                  checked={cms.howToOrderGuide.isActive}
                  onCheckedChange={(checked) =>
                    updateGuide("isActive", checked)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Audience</Label>
                <Select
                  value={cms.howToOrderGuide.audience}
                  onValueChange={(value) =>
                    updateGuide(
                      "audience",
                      value as typeof cms.howToOrderGuide.audience
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all_users">All users</SelectItem>
                    <SelectItem value="new_users">New users</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Placement</Label>
                <Select
                  value={cms.howToOrderGuide.placement}
                  onValueChange={(value) =>
                    updateGuide(
                      "placement",
                      value as typeof cms.howToOrderGuide.placement
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="after_search">
                      After search area
                    </SelectItem>
                    <SelectItem value="after_offers">After offers</SelectItem>
                    <SelectItem value="before_restaurants">
                      Before restaurants
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <LinkToggleField
                label="Video link"
                helper="If this is off, the guide opens no external video."
                value={cms.howToOrderGuide.youtubeUrl}
                defaultValue="https://youtube.com/"
                placeholder="https://youtube.com/..."
                onChange={(value) => updateGuide("youtubeUrl", value)}
              />
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={cms.howToOrderGuide.title}
                  onChange={(event) => updateGuide("title", event.target.value)}
                />
              </div>
              <div className="space-y-2 lg:col-span-2">
                <Label>Subtitle</Label>
                <Input
                  value={cms.howToOrderGuide.subtitle}
                  onChange={(event) =>
                    updateGuide("subtitle", event.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Button label</Label>
                <Input
                  value={cms.howToOrderGuide.ctaLabel}
                  onChange={(event) =>
                    updateGuide("ctaLabel", event.target.value)
                  }
                />
              </div>
              {(["backgroundColor", "textColor", "accentColor"] as const).map(
                (key) => (
                  <div className="space-y-2" key={key}>
                    <Label>{key.replace("Color", "")}</Label>
                    <Input
                      type="color"
                      value={cms.howToOrderGuide[key]}
                      onChange={(event) => updateGuide(key, event.target.value)}
                    />
                  </div>
                )
              )}
              <div className="flex items-end lg:col-span-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={applyRandomGuideStyle}
                >
                  <Palette className="size-4" />
                  Random guide style
                </Button>
              </div>
              <div className="space-y-2 lg:col-span-3">
                <Label>Step images</Label>
                <div className="grid gap-2">
                  {cms.howToOrderGuide.guideImages.map((image, index) => (
                    <div
                      key={`${image.publicId}-${index}`}
                      className="flex items-center justify-between gap-3 rounded-lg border p-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <img
                          src={image.url}
                          alt=""
                          className="h-14 w-20 rounded-md object-cover"
                        />
                        <Input
                          className="h-8 w-56"
                          value={image.title ?? ""}
                          placeholder={`Step ${index + 1}`}
                          onChange={(event) =>
                            updateGuideImageTitle(index, event.target.value)
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void removeGuideImage(index)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                  <Input
                    type="file"
                    accept="image/*"
                    disabled={uploadingKey === "guide-image"}
                    onChange={(event) =>
                      void uploadGuideImage(event.target.files?.[0])
                    }
                  />
                  {uploadingKey === "guide-image" ? (
                    <p className="text-xs text-muted-foreground">
                      Uploading guide image...
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </CmsDetailsCard>

          <CmsDetailsCard
            title="CMS analytics"
            description="Recent views, taps, push opens, and user-level activity."
            icon={<BarChart3 className="size-5" />}
            summary={
              <Badge variant="secondary">
                {currentCms.analytics.lastEventAt
                  ? formatDate(currentCms.analytics.lastEventAt)
                  : "No activity"}
              </Badge>
            }
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {analyticsGroups.map((group) => (
                <button
                  key={group.key}
                  type="button"
                  className="rounded-lg border bg-background p-4 text-left shadow-sm transition hover:border-primary/40 hover:bg-muted/30"
                  onClick={() => setAnalyticsDrawerKey(group.key)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {group.title}
                      </p>
                      <p className="mt-2 text-2xl font-bold">
                        {group.metric.toLocaleString()}
                      </p>
                    </div>
                    <Eye className="size-4 text-muted-foreground" />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Badge variant="secondary">{group.helper}</Badge>
                    <Badge variant="outline">{group.rate}</Badge>
                  </div>
                  <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">
                    {group.description}
                  </p>
                </button>
              ))}
            </div>
          </CmsDetailsCard>

          <CmsDetailsCard
            title="Home modal"
            description="Timed popup with text, image, both, and optional CTA."
            icon={<MousePointerClick className="size-5" />}
            summary={
              <div className="hidden items-center gap-2 sm:flex">
                <Badge variant={cms.modal.isActive ? "default" : "outline"}>
                  {cms.modal.isActive ? "Active" : "Off"}
                </Badge>
                <Badge variant="secondary">
                  {modalContentMode.replace("_", " + ")}
                </Badge>
              </div>
            }
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label>Visible</Label>
                <Switch
                  checked={cms.modal.isActive}
                  onCheckedChange={(checked) =>
                    updateModal("isActive", checked)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Content type</Label>
                <Select
                  value={modalContentMode}
                  onValueChange={(value) =>
                    updateModalContentMode(value as typeof modalContentMode)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text only</SelectItem>
                    <SelectItem value="image">Image only</SelectItem>
                    <SelectItem value="image_text">Image + text</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {modalContentMode !== "image" ? (
                <>
                  <Input
                    value={cms.modal.title}
                    onChange={(event) =>
                      updateModal("title", event.target.value)
                    }
                    placeholder="Modal title"
                  />
                  <Input
                    value={cms.modal.subtitle}
                    onChange={(event) =>
                      updateModal("subtitle", event.target.value)
                    }
                    placeholder="Modal subtitle"
                  />
                </>
              ) : null}
              {modalContentMode !== "text" ? (
                <div className="grid gap-2 rounded-lg border p-3 md:col-span-2">
                  <Label>Modal image</Label>
                  {cms.modal.imageUrl ? (
                    <div className="flex items-center gap-3">
                      <img
                        src={cms.modal.imageUrl}
                        alt=""
                        className="h-16 w-24 rounded-md object-cover"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void removeModalImage()}
                      >
                        Remove
                      </Button>
                    </div>
                  ) : null}
                  <Input
                    type="file"
                    accept="image/*"
                    disabled={uploadingKey === "modal-image"}
                    onChange={(event) =>
                      void uploadModalImage(event.target.files?.[0])
                    }
                  />
                </div>
              ) : null}
              <LinkToggleField
                label="Button link"
                helper="Turn this off to hide the modal button. Supports app routes and full https links."
                value={cms.modal.ctaPath}
                onChange={(value) => updateModal("ctaPath", value)}
                placeholder="/(tabs)/browse or https://www.youtube.com/watch?v=..."
              />
              <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                <Label>Button label</Label>
                <Input
                  value={cms.modal.ctaLabel}
                  onChange={(event) =>
                    updateModal("ctaLabel", event.target.value)
                  }
                  placeholder="Explore now"
                />
                <p className="text-xs text-muted-foreground">
                  This text appears on the modal button when the button link is
                  active.
                </p>
              </div>
              <Input
                type="number"
                min="0"
                max="3600"
                value={cms.modal.delaySeconds}
                onChange={(event) =>
                  updateModal("delaySeconds", Number(event.target.value || 0))
                }
              />
              <Select
                value={cms.modal.frequency}
                onValueChange={(value) =>
                  updateModal("frequency", value as typeof cms.modal.frequency)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="once_per_session">
                    Once per session
                  </SelectItem>
                  <SelectItem value="every_refresh">Every refresh</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CmsDetailsCard>

          <CmsDetailsCard
            title="Home poll"
            description="Create a poll with options + optional comment. Close it and create another anytime; past polls and results stay here."
            icon={<BarChart3 className="size-5" />}
          >
            <PollManagerSection />
          </CmsDetailsCard>

          {hidePushCampaign ? (
            <CmsDetailsCard
              title="Promotional push"
              description="Moved to Notifications for scheduling, A/B testing, reports, and conversions."
              icon={<Bell className="size-5" />}
              summary={<Badge variant="secondary">Dedicated screen</Badge>}
              className="xl:col-span-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
                <div>
                  <p className="text-sm font-medium">
                    Use Notifications for campaigns
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Eta CMS theke alada rakha better, karon push-er audience,
                    schedule, delivery report, and conversion analytics alada
                    workflow.
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={() => navigate("/notifications")}
                >
                  <Bell className="size-4" />
                  Open Notifications
                </Button>
              </div>
            </CmsDetailsCard>
          ) : (
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>Promotional push</CardTitle>
                <CardDescription>
                  Standalone push, not tied to coupon creation.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label>Push content</Label>
                  <Select
                    value={cms.pushCampaign.contentType}
                    onValueChange={(value) =>
                      updatePush(
                        "contentType",
                        value as typeof cms.pushCampaign.contentType
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Text only</SelectItem>
                      <SelectItem value="image">Image only</SelectItem>
                      <SelectItem value="image_text">Image + text</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input
                    value={cms.pushCampaign.title}
                    onChange={(event) =>
                      updatePush("title", event.target.value)
                    }
                    placeholder="Push title"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Body</Label>
                  <Input
                    value={cms.pushCampaign.body}
                    onChange={(event) => updatePush("body", event.target.value)}
                    placeholder="Push body"
                  />
                </div>
                {cms.pushCampaign.contentType !== "text" ? (
                  <div className="grid gap-2 rounded-lg border p-3 lg:col-span-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Label>Rich notification image</Label>
                        <p className="text-xs text-muted-foreground">
                          Supported devices will show this image larger inside
                          the notification.
                        </p>
                      </div>
                      <Badge variant="outline">
                        {cms.pushCampaign.contentType === "image"
                          ? "Image only"
                          : "Image + text"}
                      </Badge>
                    </div>
                    {cms.pushCampaign.imageUrl ? (
                      <div className="flex items-center gap-3">
                        <img
                          src={cms.pushCampaign.imageUrl}
                          alt=""
                          className="h-24 w-40 rounded-md object-cover"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void removePushImage()}
                        >
                          Remove
                        </Button>
                      </div>
                    ) : null}
                    <Input
                      type="file"
                      accept="image/*"
                      disabled={uploadingKey === "push-image"}
                      onChange={(event) =>
                        void uploadPushImage(event.target.files?.[0])
                      }
                    />
                    {uploadingKey === "push-image" ? (
                      <p className="text-xs text-muted-foreground">
                        Uploading push image...
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <LinkToggleField
                  label="Notification tap link"
                  helper="Turn off if this push should only show a message."
                  value={cms.pushCampaign.path}
                  onChange={(value) => updatePush("path", value)}
                />
                <Select
                  value={cms.pushCampaign.audienceType}
                  onValueChange={(value) =>
                    updatePush(
                      "audienceType",
                      value as typeof cms.pushCampaign.audienceType
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all_users">All users</SelectItem>
                    <SelectItem value="new_users">New users</SelectItem>
                    <SelectItem value="returning_users">
                      Returning users
                    </SelectItem>
                    <SelectItem value="selected_users">
                      Specific users
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={cms.pushCampaign.customerGroupKey || "none"}
                  onValueChange={(value) =>
                    updatePush(
                      "customerGroupKey",
                      value === "none" ? "" : value
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No smart segment</SelectItem>
                    <SelectItem value="has_push_token">
                      Users with active push token
                    </SelectItem>
                    <SelectItem value="ordered_last_30_days">
                      Ordered in last 30 days
                    </SelectItem>
                    <SelectItem value="inactive_30_days">
                      Inactive for 30 days
                    </SelectItem>
                    <SelectItem value="high_value_customers">
                      High-value customers
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={cms.pushCampaign.restaurantScope}
                  onValueChange={(value) =>
                    updatePush(
                      "restaurantScope",
                      value as typeof cms.pushCampaign.restaurantScope
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all_restaurants">
                      No restaurant filter
                    </SelectItem>
                    <SelectItem value="selected_restaurants">
                      Only users from selected restaurants
                    </SelectItem>
                  </SelectContent>
                </Select>
                <div className="space-y-2">
                  <Label>Conversion window days</Label>
                  <Input
                    type="number"
                    min="1"
                    max="30"
                    value={cms.pushCampaign.conversionWindowDays}
                    onChange={(event) =>
                      updatePush(
                        "conversionWindowDays",
                        Number(event.target.value || 7)
                      )
                    }
                  />
                </div>
                <div className="grid gap-3 rounded-lg border p-3 lg:col-span-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label>A/B testing</Label>
                      <p className="text-xs text-muted-foreground">
                        Split recipients between current push and variant B.
                      </p>
                    </div>
                    <Switch
                      checked={cms.pushCampaign.abTest.enabled}
                      onCheckedChange={(checked) =>
                        updatePush("abTest", {
                          ...cms.pushCampaign.abTest,
                          enabled: checked,
                        })
                      }
                    />
                  </div>
                  {cms.pushCampaign.abTest.enabled ? (
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Variant B title</Label>
                        <Input
                          value={cms.pushCampaign.abTest.variantBTitle}
                          onChange={(event) =>
                            updatePush("abTest", {
                              ...cms.pushCampaign.abTest,
                              variantBTitle: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Variant B body</Label>
                        <Input
                          value={cms.pushCampaign.abTest.variantBBody}
                          onChange={(event) =>
                            updatePush("abTest", {
                              ...cms.pushCampaign.abTest,
                              variantBBody: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Variant B path</Label>
                        <Input
                          value={cms.pushCampaign.abTest.variantBPath}
                          onChange={(event) =>
                            updatePush("abTest", {
                              ...cms.pushCampaign.abTest,
                              variantBPath: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Variant B split %</Label>
                        <Input
                          type="number"
                          min="1"
                          max="99"
                          value={cms.pushCampaign.abTest.splitPercent}
                          onChange={(event) =>
                            updatePush("abTest", {
                              ...cms.pushCampaign.abTest,
                              splitPercent: Number(event.target.value || 50),
                            })
                          }
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
                {cms.pushCampaign.audienceType === "selected_users" ? (
                  <TargetCheckboxList
                    title="Specific users"
                    emptyText="No users found."
                    options={customers.map((customer) => ({
                      id: customer.id,
                      name: customer.fullName,
                      helper: customer.phone,
                    }))}
                    selectedIds={cms.pushCampaign.selectedCustomerIds}
                    onToggle={(id, checked) =>
                      updatePush(
                        "selectedCustomerIds",
                        checked
                          ? [...cms.pushCampaign.selectedCustomerIds, id]
                          : cms.pushCampaign.selectedCustomerIds.filter(
                              (item) => item !== id
                            )
                      )
                    }
                  />
                ) : null}
                {cms.pushCampaign.restaurantScope === "selected_restaurants" ? (
                  <TargetCheckboxList
                    title="Specific restaurants"
                    emptyText="No restaurants found."
                    options={restaurants.map((restaurant) => ({
                      id: restaurant.id,
                      name: restaurant.name,
                      helper: restaurant.city,
                    }))}
                    selectedIds={cms.pushCampaign.selectedRestaurantIds}
                    onToggle={(id, checked) =>
                      updatePush(
                        "selectedRestaurantIds",
                        checked
                          ? [...cms.pushCampaign.selectedRestaurantIds, id]
                          : cms.pushCampaign.selectedRestaurantIds.filter(
                              (item) => item !== id
                            )
                      )
                    }
                  />
                ) : null}
                <div className="flex flex-wrap items-center gap-2 lg:col-span-3">
                  <Badge variant="outline">
                    Last sent:{" "}
                    {cms.pushCampaign.lastSentAt
                      ? formatDate(cms.pushCampaign.lastSentAt)
                      : "Never"}
                  </Badge>
                  <Badge variant="secondary">
                    Targets {cms.pushCampaign.totalTargets}
                  </Badge>
                  <Badge variant="secondary">
                    Sent {cms.pushCampaign.sentCount}
                  </Badge>
                  <Badge variant="secondary">
                    Recipients {cms.pushCampaign.recipientEvents.length}
                  </Badge>
                  <Badge variant="secondary">
                    Opened {cms.pushCampaign.openCount}
                  </Badge>
                  <Badge variant="outline">
                    Provider delivered{" "}
                    {
                      cms.pushCampaign.recipientEvents.filter(
                        (event) =>
                          event.receiptStatus === "delivered_to_provider"
                      ).length
                    }
                  </Badge>
                  <Badge variant="outline">
                    Uninstalled{" "}
                    {
                      cms.pushCampaign.recipientEvents.filter(
                        (event) =>
                          event.receiptStatus === "device_not_registered"
                      ).length
                    }
                  </Badge>
                  <Badge
                    variant={
                      cms.pushCampaign.scheduleStatus === "scheduled"
                        ? "default"
                        : "outline"
                    }
                  >
                    Schedule {cms.pushCampaign.scheduleStatus}
                  </Badge>
                  {cms.pushCampaign.scheduledAt ? (
                    <Badge variant="outline">
                      At {formatDate(cms.pushCampaign.scheduledAt)}
                    </Badge>
                  ) : null}
                  <Button
                    disabled={isSaving}
                    onClick={() => onSave(draftContent)}
                  >
                    {isSaving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : null}
                    Save CMS
                  </Button>
                  <Button
                    variant="outline"
                    disabled={isSaving || isSending}
                    onClick={handleSendPush}
                  >
                    {isSending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Bell className="size-4" />
                    )}
                    Save & send push
                  </Button>
                  <Button
                    variant="outline"
                    disabled={isCheckingReceipts}
                    onClick={onCheckReceipts}
                  >
                    {isCheckingReceipts ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RefreshCcw className="size-4" />
                    )}
                    Check delivery
                  </Button>
                  <Button
                    variant="outline"
                    disabled={isRefreshingConversions}
                    onClick={onRefreshConversions}
                  >
                    {isRefreshingConversions ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <BarChart3 className="size-4" />
                    )}
                    Refresh conversions
                  </Button>
                </div>
                <div className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_auto_auto] md:items-end lg:col-span-3">
                  <div className="space-y-2">
                    <Label>Schedule push</Label>
                    <Input
                      type="datetime-local"
                      value={scheduledAtInput}
                      onChange={(event) =>
                        setScheduledAtInput(event.target.value)
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isSaving || isScheduling}
                    onClick={handleSchedulePush}
                  >
                    {isScheduling ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : null}
                    Save & schedule
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      isCancellingSchedule ||
                      cms.pushCampaign.scheduleStatus !== "scheduled"
                    }
                    onClick={onCancelSchedule}
                  >
                    {isCancellingSchedule ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : null}
                    Cancel schedule
                  </Button>
                </div>
                {cms.pushCampaign.scheduleHistory.length ? (
                  <div className="grid gap-2 rounded-lg border p-3 lg:col-span-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">
                          Scheduled campaign timeline
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Recent schedule, cancel, sent, and failed events.
                        </p>
                      </div>
                      <Badge variant="outline">
                        {cms.pushCampaign.scheduleHistory.length} events
                      </Badge>
                    </div>
                    <div className="overflow-hidden rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Action</TableHead>
                            <TableHead>Schedule time</TableHead>
                            <TableHead>Event time</TableHead>
                            <TableHead>Note</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {cms.pushCampaign.scheduleHistory
                            .slice(0, 5)
                            .map((event, index) => (
                              <TableRow
                                key={`${event.action}-${event.occurredAt}-${index}`}
                              >
                                <TableCell>
                                  <Badge
                                    variant={
                                      event.action === "failed"
                                        ? "destructive"
                                        : event.action === "scheduled"
                                          ? "default"
                                          : "outline"
                                    }
                                  >
                                    {event.action}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {event.scheduledAt
                                    ? formatDate(event.scheduledAt)
                                    : "N/A"}
                                </TableCell>
                                <TableCell>
                                  {formatDate(event.occurredAt)}
                                </TableCell>
                                <TableCell className="max-w-64 truncate text-muted-foreground">
                                  {event.note || "No note"}
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : null}
                <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 md:grid-cols-[1fr_auto] md:items-end lg:col-span-3">
                  <div className="space-y-2">
                    <Label>Test push recipient</Label>
                    <Select
                      value={testCustomerId}
                      onValueChange={setTestCustomerId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select your customer account" />
                      </SelectTrigger>
                      <SelectContent>
                        {customers.map((customer) => (
                          <SelectItem key={customer.id} value={customer.id}>
                            {customer.fullName || "Customer"} - {customer.phone}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isTestingPush}
                    onClick={handleSendTestPush}
                  >
                    {isTestingPush ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Bell className="size-4" />
                    )}
                    Send test
                  </Button>
                </div>
                <div className="grid gap-3 md:grid-cols-4 lg:col-span-3">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">
                      Orders after push
                    </p>
                    <p className="mt-1 text-xl font-semibold">
                      {cms.pushCampaign.conversions.orderCount}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">
                      Delivered orders
                    </p>
                    <p className="mt-1 text-xl font-semibold">
                      {cms.pushCampaign.conversions.deliveredOrderCount}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">
                      Delivered revenue
                    </p>
                    <p className="mt-1 text-xl font-semibold">
                      {formatCurrency(
                        cms.pushCampaign.conversions.deliveredRevenue
                      )}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">
                      {cms.pushCampaign.conversionWindowDays} day conversion
                    </p>
                    <p className="mt-1 text-xl font-semibold">
                      {cms.pushCampaign.conversions.conversionRate}%
                    </p>
                  </div>
                </div>
                <div className="grid gap-2 rounded-lg border bg-muted/20 p-3 lg:col-span-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        Push recipients and opens
                      </p>
                      <p className="text-xs text-muted-foreground">
                        See who received the push and who opened it from the
                        analytics drawer.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setAnalyticsDrawerKey("push")}
                    >
                      <Eye className="size-4" />
                      View details
                    </Button>
                  </div>
                  {cms.pushCampaign.recipientEvents.length ||
                  cms.pushCampaign.openEvents.length ? (
                    <div className="max-h-56 overflow-auto rounded-md border bg-background">
                      {[
                        ...cms.pushCampaign.openEvents.map((event) => ({
                          customerId: event.customerId,
                          customerName: event.customerName,
                          customerPhone: event.customerPhone,
                          at: event.openedAt,
                          status: "Opened",
                          helper: event.path || "Default path",
                        })),
                        ...cms.pushCampaign.recipientEvents.map((event) => ({
                          customerId: event.customerId,
                          customerName: event.customerName,
                          customerPhone: event.customerPhone,
                          at: event.sentAt,
                          status:
                            event.receiptStatus === "delivered_to_provider"
                              ? "Provider accepted"
                              : event.receiptStatus === "device_not_registered"
                                ? "Uninstalled"
                                : event.status === "sent"
                                  ? "Sent"
                                  : event.status === "in_app_only"
                                    ? "In-app only"
                                    : event.status === "preference_disabled"
                                      ? "Disabled"
                                      : "Failed",
                          helper:
                            event.receiptError ||
                            `${event.expoTokenCount} token`,
                        })),
                      ]
                        .sort(
                          (left, right) =>
                            new Date(right.at).getTime() -
                            new Date(left.at).getTime()
                        )
                        .slice(0, 12)
                        .map((event) => (
                          <div
                            key={`${event.customerId}-${event.at}-${event.status}`}
                            className="grid gap-1 border-b px-3 py-2 text-sm last:border-b-0 md:grid-cols-[1fr_140px_120px]"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                {event.customerName || "Customer"}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {event.customerPhone || event.customerId}
                              </p>
                            </div>
                            <p className="text-xs text-muted-foreground md:text-right">
                              {event.status}
                            </p>
                            <p className="truncate text-xs text-muted-foreground md:text-right">
                              {formatDate(event.at)}
                            </p>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                      No push opens tracked yet. Send a campaign and opens will
                      appear here with customer and time.
                    </div>
                  )}
                </div>
                <div className="grid gap-2 rounded-lg border p-3 lg:col-span-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Campaign history</p>
                      <p className="text-xs text-muted-foreground">
                        Last 20 push campaigns with delivery, opens, conversion,
                        and recipient drill-down.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {campaignHistory.length} campaigns
                      </Badge>
                      {campaignHistory.length > campaignHistoryPageSize ? (
                        <Badge variant="secondary">
                          Page {safeCampaignHistoryPage}/
                          {campaignHistoryPageCount}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  {campaignHistory.length ? (
                    <div className="overflow-hidden rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Campaign</TableHead>
                            <TableHead>Audience</TableHead>
                            <TableHead>Sent</TableHead>
                            <TableHead>Open</TableHead>
                            <TableHead>Orders</TableHead>
                            <TableHead>Revenue</TableHead>
                            <TableHead className="text-right">
                              Details
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedCampaignHistory.map((campaign) => (
                            <TableRow key={campaign.campaignId}>
                              <TableCell>
                                <div className="min-w-0">
                                  <p className="truncate font-medium">
                                    {campaign.title || campaign.campaignId}
                                  </p>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {formatDate(campaign.sentAt)}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  <Badge variant="secondary">
                                    {getAudienceLabel(campaign.audienceType)}
                                  </Badge>
                                  <Badge variant="outline">
                                    {campaign.restaurantScope ===
                                    "selected_restaurants"
                                      ? "Restaurant filtered"
                                      : "No restaurant filter"}
                                  </Badge>
                                </div>
                              </TableCell>
                              <TableCell>
                                {campaign.sentCount}/{campaign.totalTargets}
                              </TableCell>
                              <TableCell>{campaign.openCount}</TableCell>
                              <TableCell>
                                {campaign.conversions.orderCount}
                              </TableCell>
                              <TableCell>
                                {formatCurrency(
                                  campaign.conversions.deliveredRevenue
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    openCampaignDetails(campaign.campaignId)
                                  }
                                >
                                  <Eye className="size-4" />
                                  View
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                      No campaign history yet. Send a push campaign to start
                      tracking history.
                    </div>
                  )}
                  {campaignHistory.length > campaignHistoryPageSize ? (
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={safeCampaignHistoryPage <= 1}
                        onClick={() =>
                          setCampaignHistoryPage((page) =>
                            Math.max(1, page - 1)
                          )
                        }
                      >
                        <ChevronLeft className="size-4" />
                        Previous
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={
                          safeCampaignHistoryPage >= campaignHistoryPageCount
                        }
                        onClick={() =>
                          setCampaignHistoryPage((page) =>
                            Math.min(campaignHistoryPageCount, page + 1)
                          )
                        }
                      >
                        Next
                        <ChevronRight className="size-4" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
      <Sheet
        open={Boolean(selectedAnalyticsGroup)}
        onOpenChange={(open) => !open && setAnalyticsDrawerKey(null)}
      >
        <SheetContent className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-3xl! md:max-w-6xl!">
          <div className="border-b px-6 py-5">
            <SheetHeader>
              <SheetTitle>
                {selectedAnalyticsGroup?.title ?? "CMS analytics"}
              </SheetTitle>
              <SheetDescription>
                {selectedAnalyticsGroup?.description ??
                  "Recent customer activity for this CMS surface."}
              </SheetDescription>
            </SheetHeader>
          </div>
          <div className="grid gap-3 border-b p-6 sm:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Primary metric
              </p>
              <p className="mt-2 text-2xl font-bold">
                {selectedAnalyticsGroup?.metric.toLocaleString() ?? 0}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Secondary
              </p>
              <p className="mt-2 text-lg font-semibold">
                {selectedAnalyticsGroup?.helper ?? "N/A"}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs font-medium text-muted-foreground">Rate</p>
              <p className="mt-2 text-lg font-semibold">
                {selectedAnalyticsGroup?.rate ?? "N/A"}
              </p>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-6">
            {selectedAnalyticsGroup?.events.length ? (
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Path</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedAnalyticsGroup.events.map((event, index) => (
                      <TableRow
                        key={`${event.customerId}-${event.occurredAt}-${index}`}
                      >
                        <TableCell>
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {event.customerName || "Unknown user"}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {event.customerPhone ||
                                event.customerId ||
                                "Anonymous event"}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>{event.action}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatDate(event.occurredAt)}
                        </TableCell>
                        <TableCell className="max-w-40 truncate text-muted-foreground">
                          {event.path || "N/A"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="grid min-h-56 place-items-center rounded-lg border border-dashed text-center">
                <div className="space-y-2">
                  <BarChart3 className="mx-auto size-8 text-muted-foreground" />
                  <p className="font-medium">No detailed events yet</p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    New customer interactions will appear here with user,
                    action, and timestamp.
                  </p>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
      <Sheet
        open={Boolean(selectedCampaign)}
        onOpenChange={(open) => !open && setSelectedCampaignId(null)}
      >
        <SheetContent className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-3xl! md:max-w-6xl!">
          <div className="border-b px-6 py-5">
            <SheetHeader>
              <SheetTitle>
                {selectedCampaign?.title || "Campaign details"}
              </SheetTitle>
              <SheetDescription>
                {selectedCampaign
                  ? `${formatDate(selectedCampaign.sentAt)} - ${getAudienceLabel(selectedCampaign.audienceType)} - ${selectedCampaign.path || "No path"}`
                  : "Push campaign delivery, open, and conversion details."}
              </SheetDescription>
            </SheetHeader>
            {selectedCampaign ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => exportCampaignCsv(selectedCampaign)}
                >
                  Export CSV
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => cloneCampaignToDraft(selectedCampaign)}
                >
                  Clone to draft
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={isSending}
                  onClick={() => resendCampaign(selectedCampaign)}
                >
                  {isSending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Bell className="size-4" />
                  )}
                  Resend
                </Button>
              </div>
            ) : null}
          </div>
          {selectedCampaign ? (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Campaign creative
                    </CardTitle>
                    <CardDescription>
                      Message and CTA used for this send.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedCampaign.imageUrl ? (
                      <img
                        src={selectedCampaign.imageUrl}
                        alt=""
                        className="h-40 w-full rounded-lg object-cover"
                      />
                    ) : null}
                    <div className="rounded-lg border p-3">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">
                          {selectedCampaign.contentType.replace("_", " + ")}
                        </Badge>
                        <Badge variant="outline">
                          {selectedCampaign.path || "No CTA path"}
                        </Badge>
                        {selectedCampaign.abTest?.enabled ? (
                          <Badge variant="default">
                            A/B test {selectedCampaign.abTest.splitPercent}% B
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-3 font-semibold">
                        {selectedCampaign.title}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {selectedCampaign.body}
                      </p>
                    </div>
                    <div className="grid gap-2 text-sm">
                      <InfoRow
                        label="Audience"
                        value={getAudienceLabel(selectedCampaign.audienceType)}
                      />
                      <InfoRow
                        label="Restaurant filter"
                        value={
                          selectedCampaign.restaurantScope ===
                          "selected_restaurants"
                            ? "Selected restaurants"
                            : "No restaurant filter"
                        }
                      />
                      <InfoRow
                        label="Conversion window"
                        value={`${selectedCampaign.conversionWindowDays} days`}
                      />
                      <InfoRow
                        label="Receipt checked"
                        value={
                          selectedCampaign.receiptCheckedAt
                            ? formatDate(selectedCampaign.receiptCheckedAt)
                            : "Not checked"
                        }
                      />
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Targets</p>
                    <p className="mt-1 text-2xl font-semibold">
                      {selectedCampaign.totalTargets}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Sent {selectedCampaign.sentCount}
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Opens</p>
                    <p className="mt-1 text-2xl font-semibold">
                      {selectedCampaign.openCount}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedCampaign.sentCount
                        ? Math.round(
                            (selectedCampaign.openCount /
                              selectedCampaign.sentCount) *
                              100
                          )
                        : 0}
                      % open rate
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Orders</p>
                    <p className="mt-1 text-2xl font-semibold">
                      {selectedCampaign.conversions.orderCount}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedCampaign.conversions.deliveredOrderCount}{" "}
                      delivered
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">
                      Delivered revenue
                    </p>
                    <p className="mt-1 text-2xl font-semibold">
                      {formatCurrency(
                        selectedCampaign.conversions.deliveredRevenue
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedCampaign.conversions.conversionRate}% conversion
                    </p>
                  </div>
                </div>
              </div>

              <Tabs defaultValue="recipients" className="mt-6">
                <TabsList className="w-full justify-start overflow-x-auto">
                  <TabsTrigger value="recipients">Recipients</TabsTrigger>
                  <TabsTrigger value="opens">Opens</TabsTrigger>
                  <TabsTrigger value="conversions">Conversions</TabsTrigger>
                  <TabsTrigger value="errors">Errors</TabsTrigger>
                </TabsList>

                <TabsContent value="recipients" className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">
                      {campaignRecipients.length} recipient records
                    </p>
                    <Badge variant="outline">
                      Page{" "}
                      {Math.min(
                        campaignRecipientPage,
                        campaignRecipientPageCount
                      )}
                      /{campaignRecipientPageCount}
                    </Badge>
                  </div>
                  <div className="overflow-hidden rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Customer</TableHead>
                          <TableHead>Variant</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Tokens</TableHead>
                          <TableHead>Sent at</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedCampaignRecipients.map((event) => (
                          <TableRow key={`${event.customerId}-${event.sentAt}`}>
                            <TableCell>
                              <div className="min-w-0">
                                <p className="truncate font-medium">
                                  {event.customerName || "Customer"}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {event.customerPhone || event.customerId}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>{event.variant ?? "A"}</TableCell>
                            <TableCell>
                              {getRecipientStatusLabel(event)}
                            </TableCell>
                            <TableCell>{event.expoTokenCount}</TableCell>
                            <TableCell className="whitespace-nowrap text-muted-foreground">
                              {formatDate(event.sentAt)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={campaignRecipientPage <= 1}
                      onClick={() =>
                        setCampaignRecipientPage((page) =>
                          Math.max(1, page - 1)
                        )
                      }
                    >
                      <ChevronLeft className="size-4" />
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={
                        campaignRecipientPage >= campaignRecipientPageCount
                      }
                      onClick={() =>
                        setCampaignRecipientPage((page) =>
                          Math.min(campaignRecipientPageCount, page + 1)
                        )
                      }
                    >
                      Next
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="opens" className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">
                      {campaignOpens.length} open records
                    </p>
                    <Badge variant="outline">
                      Page {Math.min(campaignOpenPage, campaignOpenPageCount)}/
                      {campaignOpenPageCount}
                    </Badge>
                  </div>
                  {campaignOpens.length ? (
                    <div className="overflow-hidden rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Customer</TableHead>
                            <TableHead>Variant</TableHead>
                            <TableHead>Path</TableHead>
                            <TableHead>Opened at</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedCampaignOpens.map((event) => (
                            <TableRow
                              key={`${event.customerId}-${event.openedAt}`}
                            >
                              <TableCell>
                                <div className="min-w-0">
                                  <p className="truncate font-medium">
                                    {event.customerName || "Customer"}
                                  </p>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {event.customerPhone || event.customerId}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell>{event.variant ?? "A"}</TableCell>
                              <TableCell className="max-w-56 truncate text-muted-foreground">
                                {event.path || "Default path"}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-muted-foreground">
                                {formatDate(event.openedAt)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                      No opens tracked for this campaign.
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={campaignOpenPage <= 1}
                      onClick={() =>
                        setCampaignOpenPage((page) => Math.max(1, page - 1))
                      }
                    >
                      <ChevronLeft className="size-4" />
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={campaignOpenPage >= campaignOpenPageCount}
                      onClick={() =>
                        setCampaignOpenPage((page) =>
                          Math.min(campaignOpenPageCount, page + 1)
                        )
                      }
                    >
                      Next
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="conversions" className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <div className="rounded-lg border p-4">
                      <p className="text-xs text-muted-foreground">Orders</p>
                      <p className="mt-1 text-xl font-semibold">
                        {selectedCampaign.conversions.orderCount}
                      </p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-xs text-muted-foreground">Delivered</p>
                      <p className="mt-1 text-xl font-semibold">
                        {selectedCampaign.conversions.deliveredOrderCount}
                      </p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-xs text-muted-foreground">Revenue</p>
                      <p className="mt-1 text-xl font-semibold">
                        {formatCurrency(
                          selectedCampaign.conversions.deliveredRevenue
                        )}
                      </p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-xs text-muted-foreground">
                        Unique customers
                      </p>
                      <p className="mt-1 text-xl font-semibold">
                        {selectedCampaign.conversions.uniqueOrderingCustomers}
                      </p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-xs text-muted-foreground">Rate</p>
                      <p className="mt-1 text-xl font-semibold">
                        {selectedCampaign.conversions.conversionRate}%
                      </p>
                    </div>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
                    Conversion is calculated from orders placed by campaign
                    recipients within {selectedCampaign.conversionWindowDays}{" "}
                    days after send time. Last refreshed:{" "}
                    {selectedCampaign.conversions.refreshedAt
                      ? formatDate(selectedCampaign.conversions.refreshedAt)
                      : "Not refreshed yet"}
                    .
                  </div>
                  {selectedCampaign.conversions.convertedOrders?.length ? (
                    <div className="overflow-hidden rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Order</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Total</TableHead>
                            <TableHead>Created</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedCampaign.conversions.convertedOrders
                            .slice(0, 20)
                            .map((order) => (
                              <TableRow key={order.orderId}>
                                <TableCell className="font-medium">
                                  {order.orderNumber || order.orderId}
                                </TableCell>
                                <TableCell>
                                  <div className="min-w-0">
                                    <p className="truncate">
                                      {order.customerName || "Customer"}
                                    </p>
                                    <p className="truncate text-xs text-muted-foreground">
                                      {order.customerId}
                                    </p>
                                  </div>
                                </TableCell>
                                <TableCell>{order.status}</TableCell>
                                <TableCell>
                                  {formatCurrency(order.total)}
                                </TableCell>
                                <TableCell className="whitespace-nowrap text-muted-foreground">
                                  {formatDate(order.createdAt)}
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                      No converted order rows stored yet. Click Refresh
                      conversions after campaign traffic starts.
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="errors" className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">
                      {campaignErrors.length} failed or blocked delivery records
                    </p>
                    <Badge variant="outline">
                      Page {Math.min(campaignErrorPage, campaignErrorPageCount)}
                      /{campaignErrorPageCount}
                    </Badge>
                  </div>
                  {campaignErrors.length ? (
                    <div className="overflow-hidden rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Customer</TableHead>
                            <TableHead>Reason</TableHead>
                            <TableHead>Checked</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedCampaignErrors.map((event) => (
                            <TableRow
                              key={`${event.customerId}-${event.sentAt}-${event.receiptStatus}`}
                            >
                              <TableCell>
                                <div className="min-w-0">
                                  <p className="truncate font-medium">
                                    {event.customerName || "Customer"}
                                  </p>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {event.customerPhone || event.customerId}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell>
                                {getRecipientStatusLabel(event)}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-muted-foreground">
                                {event.receiptCheckedAt
                                  ? formatDate(event.receiptCheckedAt)
                                  : "Not checked"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                      No delivery errors found for this campaign.
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={campaignErrorPage <= 1}
                      onClick={() =>
                        setCampaignErrorPage((page) => Math.max(1, page - 1))
                      }
                    >
                      <ChevronLeft className="size-4" />
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={campaignErrorPage >= campaignErrorPageCount}
                      onClick={() =>
                        setCampaignErrorPage((page) =>
                          Math.min(campaignErrorPageCount, page + 1)
                        )
                      }
                    >
                      Next
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  )
}
