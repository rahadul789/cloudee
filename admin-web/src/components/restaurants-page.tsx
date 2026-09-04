import * as React from "react"
import L from "leaflet"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet"
import {
  BarChart3,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Coins,
  Copy,
  Crosshair,
  Eye,
  EyeOff,
  FileCheck2,
  FileText,
  FileUp,
  Loader2,
  LogIn,
  MoreHorizontal,
  PackageCheck,
  Percent,
  Plus,
  RotateCcw,
  Search,
  Star,
  Store,
  TableConfig,
  TicketPercent,
  Trash2,
  UserCheck,
  Users,
  X,
  XCircle,
} from "lucide-react"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import "leaflet/dist/leaflet.css"

import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { generatePinPassword, isPinPassword } from "@/lib/pin-password"
import {
  approveReviewCase,
  assignAdminOrderRider,
  createAdminRestaurant,
  deleteAdminRestaurant,
  deleteAdminRestaurantReview,
  getAdminFinancePayoutBatchStatement,
  getAdminServiceAreas,
  getAdminRestaurant,
  impersonateRestaurantOwner,
  listAdminRestaurantPromotions,
  listAdminRestaurants,
  listAdminRestaurantOrders,
  listAdminRidersAssignmentOptions,
  listReviewCases,
  reconcileAdminRestaurantFinance,
  rejectReviewCase,
  restoreAdminRestaurantReview,
  startReviewCase,
  updateAdminOrderStatus,
  updateAdminRestaurantCommission,
  updateAdminRestaurantPricingModel,
  updateAdminRestaurantMinimumOrder,
  updateAdminRestaurantDeliveryPricing,
  updateAdminRestaurantEnforcement,
  updateAdminRestaurantMerchandising,
  updateAdminRestaurantPayoutStatus,
  updateAdminRestaurantVisibility,
  uploadAdminMedia,
  type AdminRestaurantDocumentAttachment,
  type AdminFinancePayoutStatement,
  type AdminRestaurantOrderHistoryItem,
  type AdminRestaurantCreateInput,
  type AdminRestaurantDetails,
  type AdminRestaurantSummary,
  type AdminRestaurantVoucher,
  type AdminServiceZone,
  type AdminVoucherLifecycle,
  type AdminVoucherMode,
  type AdminRiderAssignmentOption,
  type AdminRestaurantOrderDateFilterPreset,
  type ReviewCase,
} from "@/lib/admin-api"
import { printReportInFrame } from "@/lib/export-utils"
import {
  buildAdminPayoutStatementHtml,
  getAdminPayoutStatementTitle,
} from "@/lib/payout-statement-export"
import { AdminDateRangeFilter } from "@/components/admin-date-range-filter"
import { PayoutStatementDrawer } from "@/components/payout-statement-drawer"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type VisibilityFilter = "all" | "visible" | "hidden"
type RuntimeFilter = "all" | "online" | "offline"
type RestaurantSort =
  | "newestUpdated"
  | "mostOrders"
  | "highestRating"
  | "completionHigh"
type RestaurantOrderPreset = Extract<
  AdminRestaurantOrderDateFilterPreset,
  | "today"
  | "yesterday"
  | "last7Days"
  | "last30Days"
  | "last90Days"
  | "thisMonth"
  | "lastMonth"
  | "lifetime"
  | "custom"
>
type RestaurantOrderStatusFilter = "all" | "live" | "delivered" | "cancelled"
type RestaurantOrderSort = "newest" | "oldest" | "highestValue"
type PromotionModeFilter = "all" | AdminVoucherMode
type PromotionTypeFilter = "all" | "flat" | "percentage" | "free-delivery"
type PromotionSort =
  | "newestUpdated"
  | "highestUses"
  | "highestDiscount"
  | "endingSoon"
type AdminOrderNextStatus =
  | "Accepted"
  | "Rejected"
  | "Preparing"
  | "ReadyForPickup"
  | "Cancelled"
type RestaurantColumnKey =
  | "restaurant"
  | "owner"
  | "status"
  | "orders"
  | "performance"
  | "rating"
  | "media"
  | "commission"

const PRESET_TAGS = [
  "Burger",
  "Fast Food",
  "Halal",
  "Family Meals",
  "Late Night",
  "Coffee",
  "Dessert",
  "Combo",
]

const PRESET_CUISINES = [
  "Fast Food",
  "Burger",
  "Cafe",
  "Pizza",
  "Chinese",
  "Dessert",
  "Rice Bowl",
  "Bakery",
]

const MAX_CUISINES = 3
const PREPARATION_TIME_OPTIONS = [10, 15, 20, 25, 30, 35, 40, 45, 50, 60]
const NETROKONA_COORDINATES = { latitude: 24.8831, longitude: 90.7282 }
const BANGLADESH_PHONE_PATTERN = /^01\d{9}$/
const restaurantMarkerIcon = L.divIcon({
  className: "",
  html: '<div class="size-5 rounded-full border-2 border-background bg-primary shadow-md"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
})
const RESTAURANT_TABLE_COLUMNS: Array<{
  key: RestaurantColumnKey
  label: string
}> = [
  { key: "restaurant", label: "Restaurant" },
  { key: "owner", label: "Owner" },
  { key: "status", label: "Status" },
  { key: "orders", label: "Orders" },
  { key: "performance", label: "Performance" },
  { key: "rating", label: "Rating" },
  { key: "media", label: "Media" },
  { key: "commission", label: "Commission" },
]
const defaultColumnVisibility: Record<RestaurantColumnKey, boolean> = {
  restaurant: true,
  owner: true,
  status: true,
  orders: true,
  performance: true,
  rating: true,
  media: true,
  commission: true,
}

const defaultCreateFormBase: Omit<AdminRestaurantCreateInput, "temporaryPassword"> = {
  ownerFullName: "",
  ownerPhone: "",
  ownerEmail: "",
  name: "",
  phone: "",
  email: "",
  payoutBkashNumber: "",
  cuisineTypes: [],
  tags: [],
  address: "",
  city: "Netrokona",
  latitude: null,
  longitude: null,
  serviceZoneId: "",
  preparationTimeMinutes: 30,
  commissionRate: 15,
  isVisible: true,
  documents: [],
}

function createDefaultRestaurantForm(): AdminRestaurantCreateInput {
  return {
    ...defaultCreateFormBase,
    temporaryPassword: generatePinPassword(),
  }
}

const RESTAURANT_DOCUMENT_OPTIONS: Array<{
  type: AdminRestaurantDocumentAttachment["type"]
  label: string
  helper: string
}> = [
  {
    type: "nid",
    label: "NID",
    helper: "Owner national ID scan or clear photo.",
  },
  {
    type: "trade_license",
    label: "Trade License",
    helper: "Restaurant trade license or renewal copy.",
  },
  {
    type: "tin",
    label: "TIN",
    helper: "Tax identification certificate.",
  },
  {
    type: "bin_vat",
    label: "BIN/VAT",
    helper: "BIN or VAT registration document.",
  },
]

const DOCUMENT_UPLOAD_ACCEPT = "image/*,application/pdf"
const MAX_DOCUMENT_SIZE_MB = 10
const MAX_DOCUMENT_SIZE_BYTES = MAX_DOCUMENT_SIZE_MB * 1024 * 1024

function validateRestaurantDocumentFile(file: File) {
  const isAllowedType =
    file.type.startsWith("image/") || file.type === "application/pdf"

  if (!isAllowedType) {
    return {
      ok: false as const,
      title: "Invalid document type",
      description: "Upload a PDF, JPG, PNG, or WebP file.",
    }
  }

  if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
    return {
      ok: false as const,
      title: "Document is too large",
      description: `Please upload a file smaller than ${MAX_DOCUMENT_SIZE_MB} MB.`,
    }
  }

  return { ok: true as const }
}

function formatDate(value?: string | null) {
  if (!value) return "N/A"
  return new Date(value).toLocaleString()
}

function formatShortDate(value?: string | null) {
  if (!value) return "N/A"
  return new Date(value).toLocaleDateString()
}

function formatCurrency(value: number) {
  return `Tk ${Math.round(value).toLocaleString()}`
}

function formatAuditMetadataValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : "Not set"
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`
}

function sanitizeBangladeshPhone(value: string) {
  return value.replace(/\D/g, "").slice(0, 11)
}

function isValidBangladeshPhone(value: string) {
  return BANGLADESH_PHONE_PATTERN.test(value)
}

function getVoucherId(voucher: AdminRestaurantVoucher) {
  return `${voucher._id}`
}

function normalizeVoucherType(type: AdminRestaurantVoucher["type"]) {
  return type === "free_delivery" ? "free-delivery" : type
}

function getVoucherLifecycleStatus(voucher: AdminRestaurantVoucher) {
  if (voucher.status === "Draft") return "Draft"

  const now = Date.now()
  const startsAt = new Date(voucher.startsAt).getTime()
  const endsAt = new Date(voucher.endsAt).getTime()

  if (Number.isFinite(startsAt) && now < startsAt) return "Scheduled"
  if (Number.isFinite(endsAt) && now > endsAt) return "Expired"
  return "Active"
}

function getVoucherLifecycleBadgeClass(status: string) {
  if (status === "Active")
    return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (status === "Scheduled") return "border-sky-200 bg-sky-50 text-sky-700"
  if (status === "Expired") return "border-rose-200 bg-rose-50 text-rose-700"
  return "border-slate-200 bg-slate-100 text-slate-700"
}

function getVoucherTypeLabel(type: AdminRestaurantVoucher["type"]) {
  switch (normalizeVoucherType(type)) {
    case "flat":
      return "Flat Discount"
    case "percentage":
      return "Percentage Discount"
    case "bogo":
      return "Buy One Get One"
    case "free-delivery":
      return "Free Delivery"
    default:
      return "Threshold Discount"
  }
}

function getVoucherModeLabel(mode: AdminRestaurantVoucher["mode"]) {
  return mode === "auto" ? "Auto Applied" : "Coupon Code"
}

function getVoucherFundingLabel(fundedBy: AdminRestaurantVoucher["fundedBy"]) {
  if (fundedBy === "platform") return "Platform funded"
  if (fundedBy === "shared") return "Shared funding"
  return "Owner funded"
}

function formatVoucherDiscount(voucher: AdminRestaurantVoucher) {
  const type = normalizeVoucherType(voucher.type)
  if (type === "free-delivery") return "Delivery fee waived"
  if (type === "bogo") return "BOGO"
  if (type === "percentage") return `${voucher.discountValue ?? 0}% off`
  return `${voucher.discountValue ?? 0}tk off`
}

function OptionalLabel({
  htmlFor,
  children,
}: {
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <Label htmlFor={htmlFor} className="flex items-center gap-1">
      <span>{children}</span>
      <span className="text-xs font-normal text-muted-foreground">
        (optional)
      </span>
    </Label>
  )
}

function getOrderStatusBadgeClass(status: string) {
  if (status === "New") return "border-amber-200 bg-amber-50 text-amber-700"
  if (status === "Accepted" || status === "Preparing") {
    return "border-sky-200 bg-sky-50 text-sky-700"
  }
  if (status === "ReadyForPickup" || status === "PickedUp") {
    return "border-violet-200 bg-violet-50 text-violet-700"
  }
  if (status === "Delivered") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700"
  }
  return "border-rose-200 bg-rose-50 text-rose-700"
}

function getPayoutStatusBadgeClass(status: string) {
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (status === "processing") return "border-sky-200 bg-sky-50 text-sky-700"
  if (status === "failed") return "border-rose-200 bg-rose-50 text-rose-700"
  return "border-amber-200 bg-amber-50 text-amber-700"
}

function getNextAdminOrderAction(status: string) {
  if (status === "New") {
    return { label: "Accept", nextStatus: "Accepted" as const, icon: UserCheck }
  }
  if (status === "Accepted") {
    return {
      label: "Mark Preparing",
      nextStatus: "Preparing" as const,
      icon: Clock3,
    }
  }
  if (status === "Preparing") {
    return {
      label: "Ready for Pickup",
      nextStatus: "ReadyForPickup" as const,
      icon: PackageCheck,
    }
  }
  return null
}

function restaurantStatusBadge(restaurant: AdminRestaurantSummary) {
  if (restaurant.enforcement?.isRestricted) {
    return (
      <Badge
        variant="outline"
        className="border-rose-200 bg-rose-50 text-rose-700"
      >
        {restaurant.enforcement.effectiveStatus.replaceAll("_", " ")}
      </Badge>
    )
  }

  if (restaurant.enforcement?.effectiveStatus === "under_review") {
    return (
      <Badge
        variant="outline"
        className="border-amber-200 bg-amber-50 text-amber-700"
      >
        Under review
      </Badge>
    )
  }

  if (!restaurant.isVisible) {
    return (
      <Badge
        variant="outline"
        className="border-slate-200 bg-slate-50 text-slate-700"
      >
        Hidden
      </Badge>
    )
  }

  if (restaurant.isOnline) {
    return (
      <Badge
        variant="outline"
        className="border-emerald-200 bg-emerald-50 text-emerald-700"
      >
        Online
      </Badge>
    )
  }

  return (
    <Badge
      variant="outline"
      className="border-amber-200 bg-amber-50 text-amber-700"
    >
      Offline
    </Badge>
  )
}

function draftRestaurantName(reviewCase: ReviewCase) {
  const draft = reviewCase.submittedSnapshot as {
    basicInfo?: {
      restaurantName?: string
      fullName?: string
      phone?: string
      email?: string
    }
    location?: {
      address?: string
      city?: string
    }
  }

  return {
    restaurantName: draft.basicInfo?.restaurantName || "Unnamed restaurant",
    ownerName: draft.basicInfo?.fullName || "Owner",
    phone: draft.basicInfo?.phone || "",
    email: draft.basicInfo?.email || "",
    address: draft.location?.address || "",
    city: draft.location?.city || "",
  }
}

function StatCard({
  label,
  value,
  helper,
}: {
  label: string
  value: string
  helper: string
}) {
  return (
    <Card>
      <CardContent className="pt-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  )
}

function MapClickHandler({
  onSelect,
}: {
  onSelect: (latitude: number, longitude: number) => void
}) {
  useMapEvents({
    click(event) {
      onSelect(
        Number(event.latlng.lat.toFixed(6)),
        Number(event.latlng.lng.toFixed(6))
      )
    },
  })
  return null
}

function MapViewSync({
  latitude,
  longitude,
}: {
  latitude: number
  longitude: number
}) {
  const map = useMap()

  React.useEffect(() => {
    map.setView([latitude, longitude], map.getZoom(), { animate: true })
  }, [latitude, longitude, map])

  return null
}

function LocationPickerMap({
  latitude,
  longitude,
  onSelect,
}: {
  latitude: number | null | undefined
  longitude: number | null | undefined
  onSelect: (latitude: number, longitude: number) => void
}) {
  const centerLatitude = latitude ?? NETROKONA_COORDINATES.latitude
  const centerLongitude = longitude ?? NETROKONA_COORDINATES.longitude

  return (
    <div className="overflow-hidden rounded-lg border">
      <MapContainer
        center={[centerLatitude, centerLongitude]}
        zoom={14}
        scrollWheelZoom={false}
        className="h-72 w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapClickHandler onSelect={onSelect} />
        <MapViewSync latitude={centerLatitude} longitude={centerLongitude} />
        {latitude !== null &&
        latitude !== undefined &&
        longitude !== null &&
        longitude !== undefined ? (
          <Marker
            position={[latitude, longitude]}
            icon={restaurantMarkerIcon}
          />
        ) : null}
      </MapContainer>
    </div>
  )
}

function ChipInput({
  label,
  inputId,
  value,
  inputValue,
  setInputValue,
  suggestions,
  placeholder,
  addLabel,
  maxItems,
  onAdd,
  onRemove,
}: {
  label: string
  inputId: string
  value: string[]
  inputValue: string
  setInputValue: (value: string) => void
  suggestions: string[]
  placeholder: string
  addLabel: string
  maxItems?: number
  onAdd: (value: string) => void
  onRemove: (value: string) => void
}) {
  const canAdd = maxItems === undefined || value.length < maxItems
  const suggestionLabel =
    label === "Cuisine types" ? "Suggested Cuisines" : "Suggested Tags"

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      <div className="rounded-lg border bg-muted/15 p-4">
        <div className="flex min-h-10 flex-wrap gap-2">
          {value.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onRemove(item)}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary transition hover:bg-primary/15"
            >
              {item}
              <Trash2 className="size-3.5" />
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Input
            id={inputId}
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault()
                onAdd(inputValue)
              }
            }}
            placeholder={placeholder}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => onAdd(inputValue)}
            disabled={!canAdd}
          >
            {addLabel}
          </Button>
        </div>
        {maxItems ? (
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>Choose up to {maxItems} cuisine types.</span>
            <span>
              {value.length}/{maxItems} selected
            </span>
          </div>
        ) : null}
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            {suggestionLabel}
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions
              .filter((item) => !value.includes(item))
              .map((item) => (
                <Button
                  key={item}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onAdd(item)}
                  disabled={!canAdd}
                >
                  {item}
                </Button>
              ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function AddRestaurantDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = React.useState<AdminRestaurantCreateInput>(() =>
    createDefaultRestaurantForm()
  )
  const [cuisineInput, setCuisineInput] = React.useState("")
  const [tagInput, setTagInput] = React.useState("")
  const [isLocating, setIsLocating] = React.useState(false)
  const [uploadingDocumentType, setUploadingDocumentType] =
    React.useState<AdminRestaurantDocumentAttachment["type"] | null>(null)
  const [formErrors, setFormErrors] = React.useState<
    Partial<Record<keyof AdminRestaurantCreateInput, string>>
  >({})
  const [useOwnerPhoneForRestaurant, setUseOwnerPhoneForRestaurant] =
    React.useState(true)
  const [useOwnerPhoneForBkash, setUseOwnerPhoneForBkash] =
    React.useState(true)
  const serviceAreasQuery = useQuery({
    queryKey: ["admin-service-areas", "restaurant-create"],
    queryFn: getAdminServiceAreas,
    staleTime: 60_000,
  })
  const serviceZones = React.useMemo(
    () =>
      (serviceAreasQuery.data?.zones ?? []).filter(
        (zone: AdminServiceZone) => zone.status === "active"
      ),
    [serviceAreasQuery.data?.zones]
  )

  React.useEffect(() => {
    if (!form.serviceZoneId && serviceZones[0]?.id) {
      const zone = serviceZones[0]
      setForm((current) => ({
        ...current,
        serviceZoneId: zone.id,
        city: zone.districtName || current.city,
        latitude: zone.center?.latitude ?? current.latitude,
        longitude: zone.center?.longitude ?? current.longitude,
      }))
    }
  }, [form.serviceZoneId, serviceZones])

  const createMutation = useMutation({
    mutationFn: createAdminRestaurant,
    onSuccess: () => {
      toast.success("Restaurant added successfully.")
      setForm(createDefaultRestaurantForm())
      setUseOwnerPhoneForRestaurant(true)
      setUseOwnerPhoneForBkash(true)
      setCuisineInput("")
      setTagInput("")
      setFormErrors({})
      onOpenChange(false)
      void queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not add restaurant."
      )
    },
  })

  function updateForm<K extends keyof AdminRestaurantCreateInput>(
    key: K,
    value: AdminRestaurantCreateInput[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }))
    setFormErrors((current) => {
      if (!current[key]) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  function regenerateOwnerPin() {
    updateForm("temporaryPassword", generatePinPassword())
  }

  async function copyOwnerPin() {
    try {
      await navigator.clipboard.writeText(form.temporaryPassword)
      toast.success("Temporary PIN copied.")
    } catch {
      toast.error("Could not copy PIN.")
    }
  }

  function selectServiceZone(zoneId: string) {
    const zone = serviceZones.find((item) => item.id === zoneId)
    setForm((current) => ({
      ...current,
      serviceZoneId: zoneId,
      city: zone?.districtName || current.city,
      latitude: zone?.center?.latitude ?? current.latitude,
      longitude: zone?.center?.longitude ?? current.longitude,
    }))
  }

  function addCuisine(rawValue: string) {
    const nextCuisine = rawValue.trim()
    if (!nextCuisine) return
    const currentCuisines = form.cuisineTypes ?? []

    if (currentCuisines.includes(nextCuisine)) {
      setCuisineInput("")
      return
    }
    if (currentCuisines.length >= MAX_CUISINES) {
      toast.error(`You can choose up to ${MAX_CUISINES} cuisines.`)
      return
    }

    updateForm("cuisineTypes", [...currentCuisines, nextCuisine])
    setCuisineInput("")
  }

  function removeCuisine(cuisine: string) {
    updateForm(
      "cuisineTypes",
      (form.cuisineTypes ?? []).filter((item) => item !== cuisine)
    )
  }

  function addTag(rawValue: string) {
    const nextTag = rawValue.trim()
    if (!nextTag) return
    const currentTags = form.tags ?? []
    if (currentTags.includes(nextTag)) {
      setTagInput("")
      return
    }

    updateForm("tags", [...currentTags, nextTag])
    setTagInput("")
  }

  function removeTag(tag: string) {
    updateForm(
      "tags",
      (form.tags ?? []).filter((item) => item !== tag)
    )
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      toast.error("Current location is not available in this browser.")
      return
    }

    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        updateForm("latitude", Number(position.coords.latitude.toFixed(6)))
        updateForm("longitude", Number(position.coords.longitude.toFixed(6)))
        setIsLocating(false)
      },
      () => {
        toast.error("Could not read current location.")
        setIsLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  function upsertDocument(document: AdminRestaurantDocumentAttachment) {
    setForm((current) => ({
      ...current,
      documents: [
        ...(current.documents ?? []).filter(
          (item) => item.type !== document.type
        ),
        document,
      ],
    }))
  }

  function removeDocument(type: AdminRestaurantDocumentAttachment["type"]) {
    setForm((current) => ({
      ...current,
      documents: (current.documents ?? []).filter((item) => item.type !== type),
    }))
  }

  async function handleDocumentUpload(
    type: AdminRestaurantDocumentAttachment["type"],
    file?: File | null
  ) {
    if (!file) return

    const validation = validateRestaurantDocumentFile(file)
    if (!validation.ok) {
      toast.error(validation.title, {
        description: validation.description,
      })
      return
    }

    const option = RESTAURANT_DOCUMENT_OPTIONS.find((item) => item.type === type)
    setUploadingDocumentType(type)
    try {
      const asset = await uploadAdminMedia(
        file,
        "foodbela/admin/restaurant-documents",
        "restaurant_document",
        "auto"
      )
      upsertDocument({
        type,
        label: option?.label ?? type,
        url: asset.url,
        publicId: asset.publicId,
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        resourceType: "auto",
        uploadedAt: new Date().toISOString(),
      })
      toast.success(`${option?.label ?? "Document"} uploaded`)
    } catch (error) {
      toast.error("Document upload failed", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      })
    } finally {
      setUploadingDocumentType(null)
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const ownerPhone = sanitizeBangladeshPhone(form.ownerPhone)
    const restaurantPhone = useOwnerPhoneForRestaurant
      ? ownerPhone
      : sanitizeBangladeshPhone(form.phone ?? "")
    const payoutBkashNumber = useOwnerPhoneForBkash
      ? ownerPhone
      : sanitizeBangladeshPhone(form.payoutBkashNumber ?? "")
    const nextErrors: Partial<Record<keyof AdminRestaurantCreateInput, string>> = {}

    if (form.ownerFullName.trim().length < 2) {
      nextErrors.ownerFullName = "Owner name must be at least 2 characters."
    }
    if (!isValidBangladeshPhone(ownerPhone)) {
      nextErrors.ownerPhone = "Enter a valid 11-digit owner phone number."
    }
    if (!isPinPassword(form.temporaryPassword)) {
      nextErrors.temporaryPassword =
        "Temporary password must be a 6-digit PIN."
    }
    if (form.name.trim().length < 2) {
      nextErrors.name = "Restaurant name must be at least 2 characters."
    }
    if (!isValidBangladeshPhone(restaurantPhone)) {
      nextErrors.phone = "Enter a valid restaurant contact number."
    }
    if (!isValidBangladeshPhone(payoutBkashNumber)) {
      nextErrors.payoutBkashNumber = "Enter a valid bKash payout number."
    }
    if (!(form.cuisineTypes ?? []).length) {
      nextErrors.cuisineTypes = "Choose at least one cuisine type."
    }
    if (!form.address?.trim()) {
      nextErrors.address = "Restaurant address is required."
    }

    if (Object.keys(nextErrors).length) {
      setFormErrors(nextErrors)
      const firstMessage = Object.values(nextErrors)[0]
      if (firstMessage) toast.error(firstMessage)
      return
    }

    if (!isValidBangladeshPhone(ownerPhone)) {
      toast.error("Enter a valid owner phone number.")
      return
    }
    if (!isValidBangladeshPhone(restaurantPhone)) {
      toast.error("Enter a valid restaurant contact number.")
      return
    }
    if (!isValidBangladeshPhone(payoutBkashNumber)) {
      toast.error("Enter a valid bKash payout number.")
      return
    }
    if (!(form.cuisineTypes ?? []).length) {
      toast.error("Choose at least one cuisine type.")
      return
    }

    createMutation.mutate({
      ...form,
      ownerPhone,
      city: form.city || undefined,
      ownerEmail: form.ownerEmail || undefined,
      email: form.email || undefined,
      phone: restaurantPhone,
      payoutBkashNumber,
      address: form.address?.trim(),
      documents: form.documents ?? [],
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)] min-h-0 flex-col overflow-hidden md:max-w-2xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>Add Restaurant</DialogTitle>
          <DialogDescription>
            Create an approved restaurant profile with an owner account.
          </DialogDescription>
        </DialogHeader>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit} noValidate>
          <ScrollArea className="-mx-1 h-full min-h-0 flex-1 px-1 pr-3">
            <div className="space-y-5 pb-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="owner-name">Owner name</Label>
                  <Input
                    id="owner-name"
                    value={form.ownerFullName}
                    onChange={(event) =>
                      updateForm("ownerFullName", event.target.value)
                    }
                    aria-invalid={Boolean(formErrors.ownerFullName)}
                  />
                  {formErrors.ownerFullName ? (
                    <p className="text-sm text-destructive">
                      {formErrors.ownerFullName}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="owner-phone">Owner phone</Label>
                  <Input
                    id="owner-phone"
                    value={form.ownerPhone}
                    onChange={(event) =>
                      updateForm(
                        "ownerPhone",
                        sanitizeBangladeshPhone(event.target.value)
                      )
                    }
                    inputMode="numeric"
                    maxLength={11}
                    aria-invalid={Boolean(formErrors.ownerPhone)}
                  />
                  {formErrors.ownerPhone ? (
                    <p className="text-sm text-destructive">
                      {formErrors.ownerPhone}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <OptionalLabel htmlFor="owner-email">
                    Owner email
                  </OptionalLabel>
                  <Input
                    id="owner-email"
                    type="email"
                    value={form.ownerEmail}
                    onChange={(event) =>
                      updateForm("ownerEmail", event.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="owner-password">Temporary password</Label>
                  <div className="flex gap-2">
                    <Input
                      id="owner-password"
                      value={form.temporaryPassword}
                      onChange={(event) =>
                        updateForm(
                          "temporaryPassword",
                          event.target.value.replace(/\D/g, "").slice(0, 6)
                        )
                      }
                      inputMode="numeric"
                      maxLength={6}
                      aria-invalid={Boolean(formErrors.temporaryPassword)}
                    />
                    <Button type="button" variant="outline" size="icon" onClick={regenerateOwnerPin}>
                      <RotateCcw className="size-4" />
                      <span className="sr-only">Generate new PIN</span>
                    </Button>
                    <Button type="button" variant="outline" size="icon" onClick={() => void copyOwnerPin()}>
                      <Copy className="size-4" />
                      <span className="sr-only">Copy PIN</span>
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Owner can sign in with phone number and this 6-digit PIN.
                  </p>
                  {formErrors.temporaryPassword ? (
                    <p className="text-sm text-destructive">
                      {formErrors.temporaryPassword}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="restaurant-name">Restaurant name</Label>
                  <Input
                    id="restaurant-name"
                    value={form.name}
                    onChange={(event) => updateForm("name", event.target.value)}
                    aria-invalid={Boolean(formErrors.name)}
                  />
                  {formErrors.name ? (
                    <p className="text-sm text-destructive">
                      {formErrors.name}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="restaurant-phone">
                    Restaurant contact number
                  </Label>
                  <label
                    htmlFor="same-restaurant-phone"
                    className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3 text-sm"
                  >
                    <Checkbox
                      id="same-restaurant-phone"
                      checked={useOwnerPhoneForRestaurant}
                      onCheckedChange={(checked) => {
                        const nextValue = checked === true
                        setUseOwnerPhoneForRestaurant(nextValue)
                        if (nextValue) {
                          updateForm("phone", sanitizeBangladeshPhone(form.ownerPhone))
                        } else {
                          updateForm("phone", "")
                        }
                      }}
                    />
                    <span>
                      <span className="block font-medium">
                        Use owner phone for restaurant contact
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        Foodbela will contact this number if restaurant support
                        is needed.
                      </span>
                    </span>
                  </label>
                  <Input
                    id="restaurant-phone"
                    value={
                      useOwnerPhoneForRestaurant
                        ? sanitizeBangladeshPhone(form.ownerPhone)
                        : form.phone
                    }
                    onChange={(event) =>
                      updateForm(
                        "phone",
                        sanitizeBangladeshPhone(event.target.value)
                      )
                    }
                    disabled={useOwnerPhoneForRestaurant}
                    inputMode="numeric"
                    maxLength={11}
                    aria-invalid={Boolean(formErrors.phone)}
                  />
                  {formErrors.phone ? (
                    <p className="text-sm text-destructive">
                      {formErrors.phone}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="payout-bkash-number">bKash payout number</Label>
                  <label
                    htmlFor="same-bkash-phone"
                    className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3 text-sm"
                  >
                    <Checkbox
                      id="same-bkash-phone"
                      checked={useOwnerPhoneForBkash}
                      onCheckedChange={(checked) => {
                        const nextValue = checked === true
                        setUseOwnerPhoneForBkash(nextValue)
                        if (nextValue) {
                          updateForm(
                            "payoutBkashNumber",
                            sanitizeBangladeshPhone(form.ownerPhone)
                          )
                        } else {
                          updateForm("payoutBkashNumber", "")
                        }
                      }}
                    />
                    <span>
                      <span className="block font-medium">
                        Use owner phone as bKash number
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        If payout will go to another bKash wallet, uncheck this
                        and enter the wallet number.
                      </span>
                    </span>
                  </label>
                  <Input
                    id="payout-bkash-number"
                    value={
                      useOwnerPhoneForBkash
                        ? sanitizeBangladeshPhone(form.ownerPhone)
                        : form.payoutBkashNumber
                    }
                    onChange={(event) =>
                      updateForm(
                        "payoutBkashNumber",
                        sanitizeBangladeshPhone(event.target.value)
                      )
                    }
                    disabled={useOwnerPhoneForBkash}
                    inputMode="numeric"
                    maxLength={11}
                    placeholder="01XXXXXXXXX"
                    aria-invalid={Boolean(formErrors.payoutBkashNumber)}
                  />
                  {formErrors.payoutBkashNumber ? (
                    <p className="text-sm text-destructive">
                      {formErrors.payoutBkashNumber}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <OptionalLabel htmlFor="restaurant-email">
                    Restaurant email
                  </OptionalLabel>
                  <Input
                    id="restaurant-email"
                    type="email"
                    value={form.email}
                    onChange={(event) =>
                      updateForm("email", event.target.value)
                    }
                  />
                </div>
                <div className="md:col-span-2">
                  <ChipInput
                    label="Cuisine types"
                    inputId="restaurant-cuisines"
                    value={form.cuisineTypes ?? []}
                    inputValue={cuisineInput}
                    setInputValue={setCuisineInput}
                    suggestions={PRESET_CUISINES}
                    placeholder="Type a cuisine and press Enter"
                    addLabel="Add Cuisine"
                    maxItems={MAX_CUISINES}
                    onAdd={addCuisine}
                    onRemove={removeCuisine}
                  />
                  {formErrors.cuisineTypes ? (
                    <p className="mt-2 text-sm text-destructive">
                      {formErrors.cuisineTypes}
                    </p>
                  ) : null}
                </div>
                <div className="md:col-span-2">
                  <ChipInput
                    label="Tags"
                    inputId="restaurant-tags"
                    value={form.tags ?? []}
                    inputValue={tagInput}
                    setInputValue={setTagInput}
                    suggestions={PRESET_TAGS}
                    placeholder="Type a tag and press Enter"
                    addLabel="Add Tag"
                    onAdd={addTag}
                    onRemove={removeTag}
                  />
                </div>
                <div className="space-y-3 md:col-span-2">
                  <div>
                    <OptionalLabel htmlFor="restaurant-documents">
                      Documents attached
                    </OptionalLabel>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {RESTAURANT_DOCUMENT_OPTIONS.map((option) => {
                        const attached = (form.documents ?? []).some(
                          (document) => document.type === option.type
                        )
                        return (
                          <span
                            key={option.type}
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                              attached
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-border bg-background text-muted-foreground"
                            }`}
                          >
                            <span
                              className={`flex size-3.5 items-center justify-center rounded-[4px] border ${
                                attached
                                  ? "border-emerald-500 bg-emerald-500"
                                  : "border-muted-foreground/40 bg-background"
                              }`}
                            >
                              {attached ? (
                                <FileCheck2 className="size-2.5 text-white" />
                              ) : null}
                            </span>
                            {option.label}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                  <div
                    id="restaurant-documents"
                    className="grid gap-3 md:grid-cols-2"
                  >
                    {RESTAURANT_DOCUMENT_OPTIONS.map((option) => {
                      const document = (form.documents ?? []).find(
                        (item) => item.type === option.type
                      )
                      const isUploading = uploadingDocumentType === option.type
                      return (
                        <div
                          key={option.type}
                          className="rounded-xl border bg-muted/15 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 text-sm font-semibold">
                                <FileText className="size-4 text-primary" />
                                {option.label}
                              </div>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                {option.helper}
                              </p>
                            </div>
                            {document ? (
                              <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                                Attached
                              </Badge>
                            ) : null}
                          </div>
                          {document ? (
                            <a
                              href={document.url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-3 block truncate rounded-lg bg-background px-3 py-2 text-xs font-medium hover:bg-muted"
                            >
                              {document.fileName || document.url}
                            </a>
                          ) : null}
                          <div className="mt-3 flex flex-wrap gap-2">
                            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-medium transition hover:bg-muted/60">
                              {isUploading ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <FileUp className="size-4" />
                              )}
                              {document ? "Replace" : "Upload"}
                              <input
                                type="file"
                                accept={DOCUMENT_UPLOAD_ACCEPT}
                                disabled={isUploading}
                                className="hidden"
                                onChange={(event) => {
                                  void handleDocumentUpload(
                                    option.type,
                                    event.target.files?.[0] ?? null
                                  )
                                  event.target.value = ""
                                }}
                              />
                            </label>
                            {document ? (
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => removeDocument(option.type)}
                                disabled={isUploading}
                              >
                                <Trash2 className="size-4" />
                                Remove
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="restaurant-zone">Service area</Label>
                  <Select
                    value={form.serviceZoneId || serviceZones[0]?.id || ""}
                    onValueChange={selectServiceZone}
                  >
                    <SelectTrigger id="restaurant-zone" className="w-full">
                      <SelectValue
                        placeholder={
                          serviceAreasQuery.isLoading
                            ? "Loading service areas"
                            : "Choose service area"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {serviceZones.map((zone) => (
                        <SelectItem key={zone.id} value={zone.id}>
                          {zone.districtName} / {zone.name} - {zone.radiusKm} km
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Finance, dispatch, delivery fee, and admin filters will use this zone.
                  </p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="restaurant-address">Address</Label>
                  <Input
                    id="restaurant-address"
                    value={form.address}
                    onChange={(event) =>
                      updateForm("address", event.target.value)
                    }
                    aria-invalid={Boolean(formErrors.address)}
                    placeholder="House, road, area, landmark"
                  />
                  {formErrors.address ? (
                    <p className="text-sm text-destructive">
                      {formErrors.address}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Use the pickup address customers and riders should
                      recognize.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="prep-time">Prep time minutes</Label>
                  <Select
                    value={`${form.preparationTimeMinutes ?? 30}`}
                    onValueChange={(value) =>
                      updateForm("preparationTimeMinutes", Number(value))
                    }
                  >
                    <SelectTrigger id="prep-time" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PREPARATION_TIME_OPTIONS.map((minutes) => (
                        <SelectItem key={minutes} value={`${minutes}`}>
                          {minutes} minutes
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <OptionalLabel htmlFor="commission-rate">
                    Commission rate
                  </OptionalLabel>
                  <Input
                    id="commission-rate"
                    type="number"
                    min={0}
                    max={100}
                    value={form.commissionRate ?? 15}
                    onChange={(event) =>
                      updateForm("commissionRate", Number(event.target.value))
                    }
                  />
                </div>
                <div className="space-y-3 md:col-span-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <OptionalLabel htmlFor="restaurant-latitude">
                        Current location coordinates
                      </OptionalLabel>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Click on the map to set latitude and longitude.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={useCurrentLocation}
                      disabled={isLocating}
                    >
                      {isLocating ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Crosshair className="size-4" />
                      )}
                      Current location
                    </Button>
                  </div>
                  <LocationPickerMap
                    latitude={form.latitude}
                    longitude={form.longitude}
                    onSelect={(latitude, longitude) => {
                      updateForm("latitude", latitude)
                      updateForm("longitude", longitude)
                    }}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <OptionalLabel htmlFor="restaurant-latitude">
                        Latitude
                      </OptionalLabel>
                      <Input
                        id="restaurant-latitude"
                        type="number"
                        step="0.000001"
                        value={form.latitude ?? ""}
                        onChange={(event) =>
                          updateForm(
                            "latitude",
                            event.target.value
                              ? Number(event.target.value)
                              : null
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <OptionalLabel htmlFor="restaurant-longitude">
                        Longitude
                      </OptionalLabel>
                      <Input
                        id="restaurant-longitude"
                        type="number"
                        step="0.000001"
                        value={form.longitude ?? ""}
                        onChange={(event) =>
                          updateForm(
                            "longitude",
                            event.target.value
                              ? Number(event.target.value)
                              : null
                          )
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="shrink-0 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || uploadingDocumentType !== null}
            >
              {createMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Add Restaurant
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RestaurantDetailsSheet({
  restaurantId,
  open,
  onOpenChange,
}: {
  restaurantId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [commissionDraft, setCommissionDraft] = React.useState("")
  const [pricingModelDraft, setPricingModelDraft] = React.useState<
    "commission" | "markup"
  >("commission")
  const [markupPercentDraft, setMarkupPercentDraft] = React.useState("0")
  const [featuredPositionDraft, setFeaturedPositionDraft] = React.useState("1")
  const [deliveryBaseFeeDraft, setDeliveryBaseFeeDraft] = React.useState("20")
  const [deliveryStartsAfterDraft, setDeliveryStartsAfterDraft] =
    React.useState("2")
  const [deliveryStepMetersDraft, setDeliveryStepMetersDraft] =
    React.useState("500")
  const [deliveryStepAmountDraft, setDeliveryStepAmountDraft] =
    React.useState("5")
  const [customerNoteEnabledDraft, setCustomerNoteEnabledDraft] =
    React.useState(false)
  const [customerNoteLabelDraft, setCustomerNoteLabelDraft] =
    React.useState("Order note")
  const [customerNotePlaceholderDraft, setCustomerNotePlaceholderDraft] =
    React.useState("Cake name, message, or any restaurant instruction")
  const [customBadgeEnabledDraft, setCustomBadgeEnabledDraft] =
    React.useState(false)
  const [customBadgeLabelDraft, setCustomBadgeLabelDraft] = React.useState("")
  const [payoutActionTarget, setPayoutActionTarget] = React.useState<{
    payoutId: string
    status: "completed" | "failed"
    expectedStatus: string
    amount: number
  } | null>(null)
  const [payoutProviderReference, setPayoutProviderReference] = React.useState("")
  const [payoutProviderPayoutId, setPayoutProviderPayoutId] = React.useState("")
  const [payoutProviderTransactionId, setPayoutProviderTransactionId] = React.useState("")
  const [payoutPaymentProofUrl, setPayoutPaymentProofUrl] = React.useState("")
  const [payoutProcessingNote, setPayoutProcessingNote] = React.useState("")
  const [payoutNotifyOwnerSms, setPayoutNotifyOwnerSms] = React.useState(false)
  const [payoutChecklist, setPayoutChecklist] = React.useState({
    methodVerified: false,
    amountMatched: false,
    referenceReady: false,
  })
  const [payoutStatement, setPayoutStatement] =
    React.useState<AdminFinancePayoutStatement | null>(null)
  const [payoutStatementReviewed, setPayoutStatementReviewed] =
    React.useState(false)
  const [payoutStatementError, setPayoutStatementError] = React.useState("")
  const [payoutStatementDrawerOpen, setPayoutStatementDrawerOpen] =
    React.useState(false)
  const [detailsPreset, setDetailsPreset] =
    React.useState<RestaurantOrderPreset>("last7Days")
  const [detailsFrom, setDetailsFrom] = React.useState("")
  const [detailsTo, setDetailsTo] = React.useState("")
  const detailsQuery = useQuery({
    queryKey: [
      "admin-restaurant-details",
      restaurantId,
      detailsPreset,
      detailsFrom,
      detailsTo,
    ],
    queryFn: () =>
      getAdminRestaurant(restaurantId, {
        preset: detailsPreset,
        from: detailsPreset === "custom" ? detailsFrom : undefined,
        to: detailsPreset === "custom" ? detailsTo : undefined,
      }),
    enabled: open && Boolean(restaurantId),
  })
  const details = detailsQuery.data

  React.useEffect(() => {
    if (!details) return
    setCommissionDraft(`${details.commissionRate}`)
    setPricingModelDraft(details.pricingModel === "markup" ? "markup" : "commission")
    setMarkupPercentDraft(`${details.platformMarkupPercent ?? 0}`)
    setFeaturedPositionDraft(`${details.featuredPosition ?? 1}`)
    setDeliveryBaseFeeDraft(`${details.deliveryPricing.override.baseFeeTaka ?? 20}`)
    setDeliveryStartsAfterDraft(
      `${details.deliveryPricing.override.surchargeStartsAfterKm ?? 2}`
    )
    setDeliveryStepMetersDraft(
      `${details.deliveryPricing.override.surchargeStepMeters ?? 500}`
    )
    setDeliveryStepAmountDraft(
      `${details.deliveryPricing.override.surchargeAmountTaka ?? 5}`
    )
    setCustomerNoteEnabledDraft(details.merchandising.customerNote.enabled)
    setCustomerNoteLabelDraft(details.merchandising.customerNote.label || "Order note")
    setCustomerNotePlaceholderDraft(
      details.merchandising.customerNote.placeholder ||
        "Cake name, message, or any restaurant instruction"
    )
    setCustomBadgeEnabledDraft(details.merchandising.customBadge?.enabled === true)
    setCustomBadgeLabelDraft(details.merchandising.customBadge?.label ?? "")
  }, [details])

  React.useEffect(() => {
    if (detailsPreset !== "custom") {
      setDetailsFrom("")
      setDetailsTo("")
    }
  }, [detailsPreset])

  const visibilityMutation = useMutation({
    mutationFn: updateAdminRestaurantVisibility,
    onSuccess: () => {
      toast.success("Restaurant visibility updated.")
      void queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] })
      void queryClient.invalidateQueries({
        queryKey: ["admin-restaurant-details", restaurantId],
      })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Visibility update failed."
      )
    },
  })

  const merchandisingMutation = useMutation({
    mutationFn: updateAdminRestaurantMerchandising,
    onSuccess: () => {
      toast.success("Restaurant merchandising updated.")
      void queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] })
      void queryClient.invalidateQueries({
        queryKey: ["admin-restaurant-details", restaurantId],
      })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Merchandising update failed."
      )
    },
  })

  const commissionMutation = useMutation({
    mutationFn: updateAdminRestaurantCommission,
    onSuccess: () => {
      toast.success("Commission updated.")
      void queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] })
      void queryClient.invalidateQueries({
        queryKey: ["admin-restaurant-details", restaurantId],
      })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Commission update failed."
      )
    },
  })

  const pricingModelMutation = useMutation({
    mutationFn: updateAdminRestaurantPricingModel,
    onSuccess: () => {
      toast.success("Pricing model updated.")
      void queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] })
      void queryClient.invalidateQueries({
        queryKey: ["admin-restaurant-details", restaurantId],
      })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Pricing model update failed."
      )
    },
  })

  const deliveryPricingMutation = useMutation({
    mutationFn: updateAdminRestaurantDeliveryPricing,
    onSuccess: () => {
      toast.success("Delivery pricing updated.")
      void queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] })
      void queryClient.invalidateQueries({
        queryKey: ["admin-restaurant-details", restaurantId],
      })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Delivery pricing update failed."
      )
    },
  })

  const enforcementMutation = useMutation({
    mutationFn: updateAdminRestaurantEnforcement,
    onSuccess: () => {
      toast.success("Restaurant enforcement updated.")
      void queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] })
      void queryClient.invalidateQueries({
        queryKey: ["admin-restaurant-details", restaurantId],
      })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Enforcement update failed."
      )
    },
  })

  const reconcileMutation = useMutation({
    mutationFn: reconcileAdminRestaurantFinance,
    onSuccess: (result) => {
      toast.success(
        `Finance reconciled. ${result.created} created, ${result.updated} updated.`
      )
      void queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] })
      void queryClient.invalidateQueries({
        queryKey: ["admin-restaurant-details", restaurantId],
      })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Finance reconcile failed."
      )
    },
  })

  const payoutStatusMutation = useMutation({
    mutationFn: updateAdminRestaurantPayoutStatus,
    onSuccess: () => {
      toast.success("Payout status updated.")
      void queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] })
      void queryClient.invalidateQueries({
        queryKey: ["admin-restaurant-details", restaurantId],
      })
      void queryClient.invalidateQueries({ queryKey: ["admin-payments"] })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Payout status update failed."
      )
    },
  })

  const payoutStatementMutation = useMutation({
    mutationFn: getAdminFinancePayoutBatchStatement,
    onSuccess: (statement) => {
      setPayoutStatement(statement)
      setPayoutStatementDrawerOpen(true)
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Payout statement could not be loaded."
      )
    },
  })

  function printPayoutStatement(statement: AdminFinancePayoutStatement) {
    const printed = printReportInFrame(
      getAdminPayoutStatementTitle(statement),
      buildAdminPayoutStatementHtml(statement)
    )
    if (!printed) toast.error("Unable to prepare payout statement.")
  }

  async function downloadPayoutActionStatement() {
    if (!payoutActionTarget) return
    try {
      const statement = await getAdminFinancePayoutBatchStatement(
        payoutActionTarget.payoutId
      )
      printPayoutStatement(statement)
      setPayoutStatement(statement)
      setPayoutStatementReviewed(false)
      setPayoutStatementError("")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Payout statement could not be loaded."
      )
    }
  }

  function updateCommission() {
    const commissionRate = Number(commissionDraft)
    if (Number.isNaN(commissionRate)) return
    commissionMutation.mutate({ restaurantId, commissionRate })
  }

  function savePricingModel() {
    if (pricingModelDraft === "markup") {
      const platformMarkupPercent = Number(markupPercentDraft)
      if (Number.isNaN(platformMarkupPercent)) return
      pricingModelMutation.mutate({
        restaurantId,
        pricingModel: "markup",
        platformMarkupPercent,
      })
      return
    }
    pricingModelMutation.mutate({ restaurantId, pricingModel: "commission" })
  }

  function updateDeliveryPricing(enabled: boolean) {
    const baseFeeTaka = Number(deliveryBaseFeeDraft)
    const surchargeStartsAfterKm = Number(deliveryStartsAfterDraft)
    const surchargeStepMeters = Number(deliveryStepMetersDraft)
    const surchargeAmountTaka = Number(deliveryStepAmountDraft)
    if (
      [baseFeeTaka, surchargeStartsAfterKm, surchargeStepMeters, surchargeAmountTaka].some(
        (value) => Number.isNaN(value)
      )
    ) {
      return
    }
    deliveryPricingMutation.mutate({
      restaurantId,
      enabled,
      baseFeeTaka,
      distanceSurchargeEnabled:
        details?.deliveryPricing.override.distanceSurchargeEnabled === true,
      surchargeStartsAfterKm,
      surchargeStepMeters,
      surchargeAmountTaka,
    })
  }

  function updateDistanceSurcharge(enabled: boolean) {
    const baseFeeTaka = Number(deliveryBaseFeeDraft)
    const surchargeStartsAfterKm = Number(deliveryStartsAfterDraft)
    const surchargeStepMeters = Number(deliveryStepMetersDraft)
    const surchargeAmountTaka = Number(deliveryStepAmountDraft)
    if (
      [baseFeeTaka, surchargeStartsAfterKm, surchargeStepMeters, surchargeAmountTaka].some(
        (value) => Number.isNaN(value)
      )
    ) {
      return
    }
    deliveryPricingMutation.mutate({
      restaurantId,
      enabled: details?.deliveryPricing.override.enabled === true,
      baseFeeTaka,
      distanceSurchargeEnabled: enabled,
      surchargeStartsAfterKm,
      surchargeStepMeters,
      surchargeAmountTaka,
    })
  }

  function getFeaturedPositionDraftValue() {
    const featuredPosition = Number(featuredPositionDraft)
    if (!Number.isFinite(featuredPosition)) return 1
    return Math.max(1, Math.floor(featuredPosition))
  }

  function updateCustomerNoteSetting(enabled = customerNoteEnabledDraft) {
    merchandisingMutation.mutate({
      restaurantId,
      isFeatured: details?.isFeatured === true,
      featuredPosition:
        details?.isFeatured === true ? getFeaturedPositionDraftValue() : null,
      customerNote: {
        enabled,
        label: customerNoteLabelDraft.trim() || "Order note",
        placeholder:
          customerNotePlaceholderDraft.trim() ||
          "Cake name, message, or any restaurant instruction",
      },
    })
  }

  function updateCustomBadgeSetting(enabled = customBadgeEnabledDraft) {
    merchandisingMutation.mutate({
      restaurantId,
      isFeatured: details?.isFeatured === true,
      featuredPosition:
        details?.isFeatured === true ? getFeaturedPositionDraftValue() : null,
      customBadge: {
        enabled,
        label: customBadgeLabelDraft.trim(),
      },
    })
  }

  function openPayoutStatusAction(
    payoutId: string,
    status: "processing" | "completed" | "failed",
    expectedStatus: string,
    amount: number
  ) {
    if (status === "processing") {
      payoutStatusMutation.mutate({
        restaurantId,
        payoutId,
        status,
        expectedStatus,
        processingNote: "Approved for payout processing",
      })
      return
    }

    setPayoutActionTarget({ payoutId, status, expectedStatus, amount })
    setPayoutProviderReference("")
    setPayoutProviderPayoutId("")
    setPayoutProviderTransactionId("")
    setPayoutPaymentProofUrl("")
    setPayoutProcessingNote("")
    setPayoutNotifyOwnerSms(false)
    setPayoutChecklist({
      methodVerified: false,
      amountMatched: false,
      referenceReady: false,
    })
    setPayoutStatement(null)
    setPayoutStatementReviewed(false)
    setPayoutStatementError("")
  }

  function submitPayoutStatusAction() {
    if (!payoutActionTarget) return
    if (
      payoutActionTarget.status === "completed" &&
      (!payoutStatement || !payoutStatementReviewed)
    ) {
      setPayoutStatementError("Download and check the payout statement before completing payout.")
      return
    }
    payoutStatusMutation.mutate(
      {
        restaurantId,
        payoutId: payoutActionTarget.payoutId,
        status: payoutActionTarget.status,
        expectedStatus: payoutActionTarget.expectedStatus,
        providerReference: payoutProviderReference || undefined,
        providerPayoutId: payoutProviderPayoutId || undefined,
        providerTransactionId: payoutProviderTransactionId || undefined,
        paymentProofUrl: payoutPaymentProofUrl || undefined,
        processingNote: payoutProcessingNote || undefined,
        statementReviewed:
          payoutActionTarget.status === "completed" ? payoutStatementReviewed : undefined,
        statementChecksum:
          payoutActionTarget.status === "completed"
            ? payoutStatement?.statementChecksum
            : undefined,
        notifyOwnerSms:
          payoutActionTarget.status === "completed" ? payoutNotifyOwnerSms : false,
        failureReason:
          payoutActionTarget.status === "failed"
            ? payoutProcessingNote || "Marked failed by admin"
            : undefined,
      },
      {
        onSuccess: () => setPayoutActionTarget(null),
      }
    )
  }

  const payoutChecklistComplete =
    payoutActionTarget?.status !== "completed" ||
    (payoutChecklist.methodVerified &&
      payoutChecklist.amountMatched &&
      payoutChecklist.referenceReady)

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-3xl! md:max-w-6xl!">
        <SheetHeader className="border-b">
          <SheetTitle>{details?.name ?? "Restaurant details"}</SheetTitle>
          <SheetDescription>
            Profile, owner, menu, finance, support, and admin controls.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          {detailsQuery.isPending ? (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading restaurant details...
            </div>
          ) : details ? (
            <RestaurantDetailsContent
              details={details}
              commissionDraft={commissionDraft}
              setCommissionDraft={setCommissionDraft}
              featuredPositionDraft={featuredPositionDraft}
              setFeaturedPositionDraft={setFeaturedPositionDraft}
              visibilityPending={visibilityMutation.isPending}
              merchandisingPending={merchandisingMutation.isPending}
              commissionPending={commissionMutation.isPending}
              deliveryPricingPending={deliveryPricingMutation.isPending}
              deliveryBaseFeeDraft={deliveryBaseFeeDraft}
              setDeliveryBaseFeeDraft={setDeliveryBaseFeeDraft}
              deliveryStartsAfterDraft={deliveryStartsAfterDraft}
              setDeliveryStartsAfterDraft={setDeliveryStartsAfterDraft}
              deliveryStepMetersDraft={deliveryStepMetersDraft}
              setDeliveryStepMetersDraft={setDeliveryStepMetersDraft}
              deliveryStepAmountDraft={deliveryStepAmountDraft}
              setDeliveryStepAmountDraft={setDeliveryStepAmountDraft}
              customerNoteEnabledDraft={customerNoteEnabledDraft}
              customerNoteLabelDraft={customerNoteLabelDraft}
              setCustomerNoteLabelDraft={setCustomerNoteLabelDraft}
              customerNotePlaceholderDraft={customerNotePlaceholderDraft}
              setCustomerNotePlaceholderDraft={setCustomerNotePlaceholderDraft}
              customBadgeEnabledDraft={customBadgeEnabledDraft}
              customBadgeLabelDraft={customBadgeLabelDraft}
              setCustomBadgeLabelDraft={setCustomBadgeLabelDraft}
              reconcilePending={reconcileMutation.isPending}
              payoutStatusPending={payoutStatusMutation.isPending}
              enforcementPending={enforcementMutation.isPending}
              onEnforcementSave={(payload) =>
                enforcementMutation.mutate({ restaurantId, ...payload })
              }
              onVisibilityChange={(isVisible) =>
                visibilityMutation.mutate({ restaurantId, isVisible })
              }
              onFeatureChange={(isFeatured) =>
                merchandisingMutation.mutate({
                  restaurantId,
                  isFeatured,
                  featuredPosition: isFeatured
                    ? getFeaturedPositionDraftValue()
                    : null,
                })
              }
              onSponsoredChange={(isSponsored) =>
                merchandisingMutation.mutate({
                  restaurantId,
                  // Preserve the current featured placement while toggling the
                  // independent sponsored disclosure badge.
                  isFeatured: details.isFeatured === true,
                  featuredPosition:
                    details.isFeatured === true
                      ? getFeaturedPositionDraftValue()
                      : null,
                  isSponsored,
                })
              }
              onCustomerNoteSave={() => updateCustomerNoteSetting()}
              onCustomerNoteToggle={(enabled) => {
                setCustomerNoteEnabledDraft(enabled)
                updateCustomerNoteSetting(enabled)
              }}
              onCustomBadgeSave={() => updateCustomBadgeSetting()}
              onCustomBadgeToggle={(enabled) => {
                setCustomBadgeEnabledDraft(enabled)
                updateCustomBadgeSetting(enabled)
              }}
              onCommissionSave={updateCommission}
              pricingModelDraft={pricingModelDraft}
              setPricingModelDraft={setPricingModelDraft}
              markupPercentDraft={markupPercentDraft}
              setMarkupPercentDraft={setMarkupPercentDraft}
              pricingModelPending={pricingModelMutation.isPending}
              onPricingModelSave={savePricingModel}
              onDeliveryPricingSave={() =>
                updateDeliveryPricing(
                  details?.deliveryPricing.override.enabled === true
                )
              }
              onDeliveryPricingToggle={updateDeliveryPricing}
              onDistanceSurchargeToggle={updateDistanceSurcharge}
              onFeaturedPositionSave={() =>
                merchandisingMutation.mutate({
                  restaurantId,
                  isFeatured: true,
                  featuredPosition: getFeaturedPositionDraftValue(),
                })
              }
              onReconcileFinance={() => reconcileMutation.mutate(restaurantId)}
              onPayoutStatusChange={(payoutId, status, expectedStatus, amount) =>
                openPayoutStatusAction(payoutId, status, expectedStatus, amount)
              }
              onPayoutStatementView={(payoutId) =>
                payoutStatementMutation.mutate(payoutId)
              }
              payoutStatementPending={payoutStatementMutation.isPending}
              detailsPreset={detailsPreset}
              detailsFrom={detailsFrom}
              detailsTo={detailsTo}
              setDetailsPreset={setDetailsPreset}
              setDetailsRange={({ from, to }) => {
                setDetailsFrom(from)
                setDetailsTo(to)
              }}
            />
          ) : (
            <div className="p-4 text-sm text-muted-foreground">
              Restaurant details are not available.
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
    <Dialog
      open={Boolean(payoutActionTarget)}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setPayoutActionTarget(null)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {payoutActionTarget?.status === "completed"
              ? "Complete payout"
              : "Fail payout"}
          </DialogTitle>
          <DialogDescription>
            {payoutActionTarget?.status === "completed"
              ? "Add bKash or bank transaction reference before marking this payout completed."
              : "Record why this payout failed so the owner and audit trail stay clear."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {payoutActionTarget?.status === "completed" ? (
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="mb-3 text-sm font-medium">Admin payout checklist</div>
              <div className="grid gap-3 text-sm">
                {[
                  ["methodVerified", "Verified payout method and account holder"],
                  ["amountMatched", `Matched payable amount: ${formatCurrency(payoutActionTarget.amount)}`],
                  ["referenceReady", "Transaction reference will be added before completion"],
                ].map(([key, label]) => (
                  <label key={key} className="flex items-center gap-3">
                    <Checkbox
                      checked={payoutChecklist[key as keyof typeof payoutChecklist]}
                      onCheckedChange={(checked) =>
                        setPayoutChecklist((current) => ({
                          ...current,
                          [key]: checked === true,
                        }))
                      }
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          {payoutActionTarget?.status === "completed" ? (
            <div className="rounded-xl border bg-muted/20 p-4 text-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-medium">Transaction statement</div>
                  <div className="text-muted-foreground">
                    Download the order breakdown before completing payout.
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void downloadPayoutActionStatement()}
                >
                  <FileText className="size-4" />
                  Download PDF
                </Button>
              </div>
              <label className="mt-3 flex items-start gap-3">
                <Checkbox
                  checked={payoutStatementReviewed}
                  disabled={!payoutStatement}
                  onCheckedChange={(checked) => {
                    setPayoutStatementReviewed(checked === true)
                    setPayoutStatementError("")
                  }}
                />
                <span>
                  <span className="block font-medium">I checked this statement</span>
                  <span className="text-muted-foreground">
                    {payoutStatement
                      ? `Checksum ${payoutStatement.statementChecksum.slice(0, 16)}`
                      : "Download first to unlock this confirmation."}
                  </span>
                </span>
              </label>
              {payoutStatementError ? (
                <p className="mt-2 text-xs font-medium text-destructive">
                  {payoutStatementError}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="payout-provider-reference">Reference</Label>
            <Input
              id="payout-provider-reference"
              value={payoutProviderReference}
              onChange={(event) => setPayoutProviderReference(event.target.value)}
              placeholder="bKash trxID, bank reference, or voucher number"
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="payout-provider-id">Provider payout ID</Label>
              <Input
                id="payout-provider-id"
                value={payoutProviderPayoutId}
                onChange={(event) => setPayoutProviderPayoutId(event.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="payout-transaction-id">Transaction ID</Label>
              <Input
                id="payout-transaction-id"
                value={payoutProviderTransactionId}
                onChange={(event) => setPayoutProviderTransactionId(event.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="payout-proof-url">Proof URL</Label>
            <Input
              id="payout-proof-url"
              value={payoutPaymentProofUrl}
              onChange={(event) => setPayoutPaymentProofUrl(event.target.value)}
              placeholder="Optional receipt/screenshot link"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="payout-note">Note</Label>
            <Textarea
              id="payout-note"
              value={payoutProcessingNote}
              onChange={(event) => setPayoutProcessingNote(event.target.value)}
              placeholder={
                payoutActionTarget?.status === "failed"
                  ? "Failure reason"
                  : "Internal processing note"
              }
            />
          </div>
          {payoutActionTarget?.status === "completed" ? (
            <label className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
              <Checkbox
                checked={payoutNotifyOwnerSms}
                onCheckedChange={(checked) => setPayoutNotifyOwnerSms(checked === true)}
              />
              <span>
                <span className="block font-medium">Also send SMS to owner</span>
                <span className="text-muted-foreground">
                  Owner app push is sent automatically. Enable SMS only when a phone message is needed.
                </span>
              </span>
            </label>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setPayoutActionTarget(null)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={
              payoutStatusMutation.isPending ||
              !payoutChecklistComplete ||
              (payoutActionTarget?.status === "completed" &&
                !payoutProviderReference.trim() &&
                !payoutProviderPayoutId.trim() &&
                !payoutProviderTransactionId.trim())
            }
            onClick={submitPayoutStatusAction}
          >
            {payoutStatusMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : payoutActionTarget?.status === "completed" ? (
              <CheckCircle2 className="size-4" />
            ) : (
              <XCircle className="size-4" />
            )}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <PayoutStatementDrawer
      statement={payoutStatement}
      open={payoutStatementDrawerOpen}
      onOpenChange={setPayoutStatementDrawerOpen}
      onPrint={printPayoutStatement}
    />
    </>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-72 text-right font-medium">{value}</span>
    </div>
  )
}

function RestaurantOrdersTab({ details }: { details: AdminRestaurantDetails }) {
  const queryClient = useQueryClient()
  const [preset, setPreset] = React.useState<RestaurantOrderPreset>("last7Days")
  const [status, setStatus] =
    React.useState<RestaurantOrderStatusFilter>("live")
  const [sortBy, setSortBy] = React.useState<RestaurantOrderSort>("newest")
  const [search, setSearch] = React.useState("")
  const [page, setPage] = React.useState(1)
  const [riderDrafts, setRiderDrafts] = React.useState<Record<string, string>>(
    {}
  )
  const debouncedSearch = useDebouncedValue(search, 300)

  const ordersQuery = useQuery({
    queryKey: [
      "admin-restaurant-orders",
      details.id,
      preset,
      status,
      sortBy,
      debouncedSearch,
      page,
    ],
    queryFn: () =>
      listAdminRestaurantOrders(details.id, {
        preset,
        status,
        sortBy,
        search: debouncedSearch,
        page,
        pageSize: 8,
      }),
  })
  const ridersQuery = useQuery({
    queryKey: ["admin-rider-assignment-options"],
    queryFn: listAdminRidersAssignmentOptions,
  })

  const invalidateOrders = () => {
    void queryClient.invalidateQueries({
      queryKey: ["admin-restaurant-orders", details.id],
    })
    void queryClient.invalidateQueries({
      queryKey: ["admin-restaurant-details", details.id],
    })
    void queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] })
  }

  const statusMutation = useMutation({
    mutationFn: updateAdminOrderStatus,
    onSuccess: () => {
      toast.success("Order status updated.")
      invalidateOrders()
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Order status update failed."
      )
      invalidateOrders()
    },
  })
  const assignMutation = useMutation({
    mutationFn: assignAdminOrderRider,
    onSuccess: () => {
      toast.success("Rider assigned.")
      invalidateOrders()
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Rider assignment failed."
      )
    },
  })

  React.useEffect(() => {
    setPage(1)
  }, [preset, status, sortBy, debouncedSearch])

  function updateOrder(
    order: AdminRestaurantOrderHistoryItem,
    nextStatus: AdminOrderNextStatus,
    note?: string
  ) {
    statusMutation.mutate({
      orderId: order.id,
      expectedStatus: order.status,
      nextStatus,
      note,
    })
  }

  function assignRider(order: AdminRestaurantOrderHistoryItem) {
    const riderId = riderDrafts[order.id]
    if (!riderId) {
      toast.error("Select a rider first.")
      return
    }
    assignMutation.mutate({ orderId: order.id, riderId })
  }

  const orders = ordersQuery.data?.items ?? []
  const riders = ridersQuery.data ?? []
  const hasOrderFilters =
    search.trim() !== "" ||
    preset !== "last7Days" ||
    status !== "live" ||
    sortBy !== "newest"
  const resetOrderFilters = () => {
    setSearch("")
    setPreset("last7Days")
    setStatus("live")
    setSortBy("newest")
    setPage(1)
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 lg:grid-cols-[minmax(220px,1fr)_140px_140px_150px_150px]">
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search orders or customers"
            className="pl-8"
          />
        </div>
        <Select
          value={preset}
          onValueChange={(value) => setPreset(value as RestaurantOrderPreset)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="last7Days">Last 7 days</SelectItem>
            <SelectItem value="last30Days">Last 30 days</SelectItem>
            <SelectItem value="thisMonth">This month</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(value) =>
            setStatus(value as RestaurantOrderStatusFilter)
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="live">Live</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={sortBy}
          onValueChange={(value) => setSortBy(value as RestaurantOrderSort)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="oldest">Oldest</SelectItem>
            <SelectItem value="highestValue">Highest value</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          disabled={!hasOrderFilters}
          onClick={resetOrderFilters}
        >
          <RotateCcw className="size-4" />
          Reset filter
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Rider</TableHead>
              <TableHead className="text-right">Admin actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => {
              const action = getNextAdminOrderAction(order.status)
              const isPending =
                statusMutation.isPending || assignMutation.isPending
              const ActionIcon = action?.icon

              return (
                <TableRow
                  key={order.id}
                  className={
                    order.isLate
                      ? order.lateTone === "critical"
                        ? "bg-rose-50/60 hover:bg-rose-50/70"
                        : "bg-amber-50/60 hover:bg-amber-50/70"
                      : undefined
                  }
                >
                  <TableCell>
                    <div className="font-medium">{order.orderNumber}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(order.createdAt)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        variant="outline"
                        className={getOrderStatusBadgeClass(order.status)}
                      >
                        {order.status}
                      </Badge>
                      {order.isLate ? (
                        <Badge
                          variant="outline"
                          className={
                            order.lateTone === "critical"
                              ? "border-rose-200 bg-rose-50 text-rose-700"
                              : "border-amber-200 bg-amber-50 text-amber-700"
                          }
                        >
                          {order.lateReason}
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>{order.customerName || "Customer"}</div>
                    <div className="text-xs text-muted-foreground">
                      {order.customerPhone || "No phone"}
                    </div>
                  </TableCell>
                  <TableCell>{formatCurrency(order.total)}</TableCell>
                  <TableCell>
                    {order.status === "ReadyForPickup" ? (
                      <div className="flex min-w-56 gap-2">
                        <Select
                          value={riderDrafts[order.id] ?? order.riderId ?? ""}
                          onValueChange={(value) =>
                            setRiderDrafts((current) => ({
                              ...current,
                              [order.id]: value,
                            }))
                          }
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="Assign rider" />
                          </SelectTrigger>
                          <SelectContent>
                            {riders.map((rider: AdminRiderAssignmentOption) => (
                              <SelectItem key={rider.id} value={rider.id}>
                                {rider.fullName} ({rider.activeOrders})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={() => assignRider(order)}
                        >
                          Assign
                        </Button>
                      </div>
                    ) : (
                      <div>
                        <div>{order.riderName || "Not assigned"}</div>
                        <div className="text-xs text-muted-foreground">
                          {order.riderPhone || ""}
                        </div>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {action ? (
                        <Button
                          size="sm"
                          disabled={isPending}
                          onClick={() => updateOrder(order, action.nextStatus)}
                        >
                          {ActionIcon ? (
                            <ActionIcon className="size-4" />
                          ) : null}
                          {action.label}
                        </Button>
                      ) : null}
                      {order.status === "New" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={() =>
                            updateOrder(order, "Rejected", "Rejected by admin")
                          }
                        >
                          Reject
                        </Button>
                      ) : null}
                      {["Accepted", "Preparing", "ReadyForPickup"].includes(
                        order.status
                      ) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={() =>
                            updateOrder(
                              order,
                              "Cancelled",
                              "Cancelled by admin"
                            )
                          }
                        >
                          Cancel
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
            {ordersQuery.isPending ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : orders.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground"
                >
                  No orders match this filter.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Page {ordersQuery.data?.page ?? page} of{" "}
          {ordersQuery.data?.pageCount ?? 1}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={page >= (ordersQuery.data?.pageCount ?? 1)}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}

function RestaurantReviewsTab({
  details,
}: {
  details: AdminRestaurantDetails
}) {
  const queryClient = useQueryClient()
  const [deleteTarget, setDeleteTarget] = React.useState<
    AdminRestaurantDetails["recentReviews"][number] | null
  >(null)
  const deleteReviewMutation = useMutation({
    mutationFn: deleteAdminRestaurantReview,
    onSuccess: () => {
      toast.success("Review hidden.")
      setDeleteTarget(null)
      void queryClient.invalidateQueries({
        queryKey: ["admin-restaurant-details", details.id],
      })
      void queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Review delete failed."
      )
    },
  })
  const restoreReviewMutation = useMutation({
    mutationFn: restoreAdminRestaurantReview,
    onSuccess: () => {
      toast.success("Review restored.")
      void queryClient.invalidateQueries({
        queryKey: ["admin-restaurant-details", details.id],
      })
      void queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Review restore failed."
      )
    },
  })

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Reviews</CardTitle>
          <CardDescription>Customer ratings and owner replies.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {details.recentReviews.map((review) => (
            <div
              key={review.id}
              className={
                review.isHidden
                  ? "rounded-lg border border-dashed bg-muted/40 p-3"
                  : "rounded-lg border p-3"
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{review.customerName}</span>
                    {review.isHidden ? (
                      <Badge variant="outline">Hidden</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(review.createdAt)}
                  </p>
                  {review.hiddenAt ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Hidden at {formatDate(review.hiddenAt)}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{review.rating.toFixed(1)}</Badge>
                  {review.isHidden ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={restoreReviewMutation.isPending}
                      onClick={() =>
                        restoreReviewMutation.mutate({
                          restaurantId: details.id,
                          reviewId: review.id,
                        })
                      }
                    >
                      Restore
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setDeleteTarget(review)}
                    >
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
                  )}
                </div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {review.comment || "No comment"}
              </p>
              {review.ownerReplyMessage ? (
                <p className="mt-2 text-sm">
                  Owner: {review.ownerReplyMessage}
                </p>
              ) : null}
            </div>
          ))}
          {details.recentReviews.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              No reviews yet.
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete review</DialogTitle>
            <DialogDescription>
              This review will be hidden from public ratings, and the action
              will stay in the audit log.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!deleteTarget || deleteReviewMutation.isPending}
              onClick={() => {
                if (!deleteTarget) return
                deleteReviewMutation.mutate({
                  restaurantId: details.id,
                  reviewId: deleteTarget.id,
                })
              }}
            >
              {deleteReviewMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function RestaurantPromotionUsesTab({
  details,
}: {
  details: AdminRestaurantDetails
}) {
  const [search, setSearch] = React.useState("")
  const [lifecycle, setLifecycle] = React.useState<AdminVoucherLifecycle>("all")
  const [mode, setMode] = React.useState<PromotionModeFilter>("all")
  const [type, setType] = React.useState<PromotionTypeFilter>("all")
  const [sortBy, setSortBy] = React.useState<PromotionSort>("newestUpdated")
  const [selectedVoucher, setSelectedVoucher] =
    React.useState<AdminRestaurantVoucher | null>(null)
  const debouncedSearch = useDebouncedValue(search, 300)

  const promotionsQuery = useQuery({
    queryKey: [
      "admin-restaurant-promotions",
      details.id,
      debouncedSearch,
      lifecycle,
      mode,
      type,
      sortBy,
    ],
    queryFn: () =>
      listAdminRestaurantPromotions(details.id, {
        search: debouncedSearch,
        lifecycle,
        mode,
        type,
        sortBy,
        page: 1,
        pageSize: 50,
      }),
  })

  const vouchers = promotionsQuery.data?.items ?? []
  const deliveredVoucherRevenue = vouchers.reduce(
    (sum, voucher) => sum + voucher.analytics.revenueGenerated,
    0
  )
  const deliveredVoucherOrders = vouchers.reduce(
    (sum, voucher) => sum + voucher.analytics.totalOrdersUsingVoucher,
    0
  )
  const hasPromotionFilters =
    search.trim() !== "" ||
    lifecycle !== "all" ||
    mode !== "all" ||
    type !== "all" ||
    sortBy !== "newestUpdated"

  const resetPromotionFilters = () => {
    setSearch("")
    setLifecycle("all")
    setMode("all")
    setType("all")
    setSortBy("newestUpdated")
  }

  return (
    <>
      <div className="grid gap-3 md:grid-cols-4">
        <StatCard
          label="Discount cost"
          value={formatCurrency(details.finance.totalDiscountCost)}
          helper="Delivered orders"
        />
        <StatCard
          label="Window discount"
          value={formatCurrency(details.finance.windowDiscountCost)}
          helper="Current details window"
        />
        <StatCard
          label="Voucher revenue"
          value={formatCurrency(deliveredVoucherRevenue)}
          helper="Delivered voucher orders"
        />
        <StatCard
          label="Voucher orders"
          value={`${deliveredVoucherOrders}`}
          helper={`${promotionsQuery.data?.total ?? 0} offers`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Promotion usage</CardTitle>
          <CardDescription>
            Restaurant offers, coupon usage, delivered revenue, and discount
            cost.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 xl:grid-cols-[minmax(220px,1fr)_150px_130px_150px_160px_150px]">
            <div className="relative">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search offers or codes"
                className="pl-8"
              />
            </div>
            <Select
              value={lifecycle}
              onValueChange={(value) =>
                setLifecycle(value as AdminVoucherLifecycle)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All lifecycle</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Scheduled">Scheduled</SelectItem>
                <SelectItem value="Expired">Expired</SelectItem>
                <SelectItem value="Draft">Draft</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={mode}
              onValueChange={(value) => setMode(value as PromotionModeFilter)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All mode</SelectItem>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="coupon">Coupon</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={type}
              onValueChange={(value) => setType(value as PromotionTypeFilter)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All type</SelectItem>
                <SelectItem value="flat">Flat</SelectItem>
                <SelectItem value="percentage">Percentage</SelectItem>
                <SelectItem value="free-delivery">Free delivery</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={sortBy}
              onValueChange={(value) => setSortBy(value as PromotionSort)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newestUpdated">Newest updated</SelectItem>
                <SelectItem value="highestUses">Highest uses</SelectItem>
                <SelectItem value="highestDiscount">
                  Highest discount
                </SelectItem>
                <SelectItem value="endingSoon">Ending soon</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              disabled={!hasPromotionFilters}
              onClick={resetPromotionFilters}
            >
              <RotateCcw className="size-4" />
              Reset filter
            </Button>
          </div>

          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Offer</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Uses</TableHead>
                  <TableHead>Delivered revenue</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Ends</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vouchers.map((voucher) => {
                  const lifecycleStatus = getVoucherLifecycleStatus(voucher)

                  return (
                    <TableRow key={getVoucherId(voucher)}>
                      <TableCell>
                        <div className="font-medium">{voucher.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {voucher.code || "Auto applied"} -{" "}
                          {formatVoucherDiscount(voucher)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>{getVoucherModeLabel(voucher.mode)}</div>
                        <div className="text-xs text-muted-foreground">
                          {getVoucherTypeLabel(voucher.type)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={getVoucherLifecycleBadgeClass(
                            lifecycleStatus
                          )}
                        >
                          {lifecycleStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div>{voucher.analytics.totalUses}</div>
                        <div className="text-xs text-muted-foreground">
                          {voucher.analytics.uniqueUsers} users
                        </div>
                      </TableCell>
                      <TableCell>
                        {formatCurrency(voucher.analytics.revenueGenerated)}
                      </TableCell>
                      <TableCell>
                        {formatCurrency(voucher.analytics.totalDiscountGiven)}
                      </TableCell>
                      <TableCell>{formatShortDate(voucher.endsAt)}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm">
                              <MoreHorizontal className="size-4" />
                              <span className="sr-only">Promotion actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem
                              onClick={() => setSelectedVoucher(voucher)}
                            >
                              <Eye className="size-4" />
                              View details
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {promotionsQuery.isPending ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center">
                      <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : vouchers.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No offers match this filter.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AdminPromotionDetailsDrawer
        open={Boolean(selectedVoucher)}
        onOpenChange={(open) => {
          if (!open) setSelectedVoucher(null)
        }}
        voucher={selectedVoucher}
      />
    </>
  )
}

function AdminPromotionDetailsDrawer({
  open,
  onOpenChange,
  voucher,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  voucher: AdminRestaurantVoucher | null
}) {
  if (!voucher) return null

  const lifecycleStatus = getVoucherLifecycleStatus(voucher)
  const categoryNames = voucher.targetCategories?.map((item) => item.name) ?? []
  const itemNames = voucher.targetItems?.map((item) => item.name) ?? []
  const chartConfig = {
    uses: {
      label: "Uses",
      color: "hsl(var(--chart-1))",
    },
    discount: {
      label: "Discount Cost",
      color: "hsl(var(--chart-2))",
    },
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-3xl! md:max-w-6xl!"
      >
        <SheetHeader className="border-b px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle>{voucher.name}</SheetTitle>
                <Badge
                  variant="outline"
                  className={getVoucherLifecycleBadgeClass(lifecycleStatus)}
                >
                  {lifecycleStatus}
                </Badge>
                <Badge variant="secondary">
                  {getVoucherModeLabel(voucher.mode)}
                </Badge>
              </div>
              <SheetDescription>
                {getVoucherTypeLabel(voucher.type)} -{" "}
                {formatVoucherDiscount(voucher)}
              </SheetDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
            >
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-6 px-6 py-6">
            <section className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Voucher Setup</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <InfoRow
                    label="Code"
                    value={voucher.code || "Auto applied"}
                  />
                  <InfoRow
                    label="Type"
                    value={getVoucherTypeLabel(voucher.type)}
                  />
                  <InfoRow
                    label="Minimum order"
                    value={formatCurrency(voucher.minimumOrderAmount)}
                  />
                  <InfoRow
                    label="Max total uses"
                    value={voucher.maxTotalUses ?? "Unlimited"}
                  />
                  <InfoRow
                    label="Per user"
                    value={
                      voucher.allowRepeatUsage
                        ? `${voucher.maxUsesPerUser} times`
                        : "Once only"
                    }
                  />
                  <InfoRow label="Created by" value={voucher.createdByType} />
                  <InfoRow
                    label="Funding"
                    value={getVoucherFundingLabel(voucher.fundedBy)}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Availability</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <InfoRow
                    label="Starts"
                    value={formatDate(voucher.startsAt)}
                  />
                  <InfoRow label="Ends" value={formatDate(voucher.endsAt)} />
                  <InfoRow
                    label="Applicability"
                    value={
                      voucher.applicability === "all"
                        ? "All menu items"
                        : voucher.applicability === "categories"
                          ? `${categoryNames.length} categories`
                          : `${itemNames.length} menu items`
                    }
                  />
                  {voucher.applicability === "categories" ? (
                    <div className="flex flex-wrap gap-2">
                      {categoryNames.map((name) => (
                        <Badge key={name} variant="outline">
                          {name}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  {voucher.applicability === "items" ? (
                    <div className="flex flex-wrap gap-2">
                      {itemNames.map((name) => (
                        <Badge key={name} variant="outline">
                          {name}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </section>

            {normalizeVoucherType(voucher.type) === "free-delivery" ? (
              <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                Free Delivery removes the customer delivery charge. The waived
                delivery fee is counted as discount cost for this voucher.
              </div>
            ) : null}

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <PromotionMetricCard
                label="Total Uses"
                value={`${voucher.analytics.totalUses}`}
                icon={TicketPercent}
                tone="emerald"
              />
              <PromotionMetricCard
                label="Unique Users"
                value={`${voucher.analytics.uniqueUsers}`}
                icon={Users}
                tone="sky"
              />
              <PromotionMetricCard
                label="Discount Given"
                value={formatCurrency(voucher.analytics.totalDiscountGiven)}
                icon={Percent}
                tone="violet"
              />
              <PromotionMetricCard
                label="Delivered Revenue"
                value={formatCurrency(voucher.analytics.revenueGenerated)}
                icon={CircleDollarSign}
                tone="amber"
              />
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <PromotionMetricCard
                label="Repeat Usage"
                value={`${voucher.analytics.repeatUsage}`}
                icon={Users}
              />
              <PromotionMetricCard
                label="Delivered Voucher Orders"
                value={`${voucher.analytics.totalOrdersUsingVoucher}`}
                icon={Coins}
              />
              <PromotionMetricCard
                label="Remaining Usage"
                value={voucher.analytics.remainingUsage ?? "Unlimited"}
                icon={CalendarRange}
              />
              <PromotionMetricCard
                label="Delivery Cost Covered"
                value={formatCurrency(
                  voucher.analytics.totalDeliveryCostCovered
                )}
                icon={PackageCheck}
              />
            </section>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Voucher Performance Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={chartConfig}
                  className="w-full md:h-[280px]"
                >
                  <AreaChart data={voucher.analytics.points}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                    />
                    <ChartTooltip
                      cursor={false}
                      content={<ChartTooltipContent indicator="dot" />}
                    />
                    <Area
                      dataKey="uses"
                      type="monotone"
                      fill="var(--color-uses)"
                      fillOpacity={0.18}
                      stroke="var(--color-uses)"
                      strokeWidth={2}
                    />
                    <Area
                      dataKey="discount"
                      type="monotone"
                      fill="var(--color-discount)"
                      fillOpacity={0.12}
                      stroke="var(--color-discount)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

function PromotionMetricCard({
  label,
  value,
  icon: Icon,
  tone = "muted",
}: {
  label: string
  value: React.ReactNode
  icon: React.ComponentType<{ className?: string }>
  tone?: "emerald" | "sky" | "violet" | "amber" | "muted"
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-200/70 bg-emerald-50/60 text-emerald-700"
      : tone === "sky"
        ? "border-sky-200/70 bg-sky-50/60 text-sky-700"
        : tone === "violet"
          ? "border-violet-200/70 bg-violet-50/60 text-violet-700"
          : tone === "amber"
            ? "border-amber-200/70 bg-amber-50/60 text-amber-700"
            : "text-foreground"

  return (
    <Card className={tone === "muted" ? undefined : toneClass}>
      <CardContent className="flex items-start justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-3 text-2xl font-semibold">{value}</p>
        </div>
        <div className="rounded-lg bg-background/70 p-3">
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  )
}

type EnforcementStatus =
  | "active"
  | "under_review"
  | "quality_hold"
  | "temporarily_suspended"
  | "permanently_disabled"

function getDefaultEnforcementMessage(status: EnforcementStatus) {
  if (status === "quality_hold") {
    return "This restaurant is temporarily unavailable while Foodbela reviews service quality."
  }
  if (status === "temporarily_suspended") {
    return "This restaurant is temporarily unavailable."
  }
  if (status === "permanently_disabled") {
    return "This restaurant is no longer available on Foodbela."
  }
  return ""
}

function toDatetimeLocalValue(value?: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function datetimeLocalToIso(value: string) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function MinimumOrderControl({
  restaurantId,
  current,
}: {
  restaurantId: string
  current: number | null
}) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = React.useState(
    current === null ? "" : String(current),
  )

  React.useEffect(() => {
    setDraft(current === null ? "" : String(current))
  }, [current])

  const mutation = useMutation({
    mutationFn: updateAdminRestaurantMinimumOrder,
    onSuccess: () => {
      toast.success("Minimum order updated.")
      void queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] })
      void queryClient.invalidateQueries({
        queryKey: ["admin-restaurant-details", restaurantId],
      })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Minimum order update failed.",
      )
    },
  })

  function save() {
    const trimmed = draft.trim()
    if (trimmed === "") {
      mutation.mutate({ restaurantId, minimumOrderAmount: null })
      return
    }
    const value = Math.round(Number(trimmed))
    if (!Number.isFinite(value) || value < 0) {
      toast.error("Enter a valid amount (or leave blank to use the platform default).")
      return
    }
    mutation.mutate({ restaurantId, minimumOrderAmount: value })
  }

  return (
    <div className="rounded-lg border bg-background p-3">
      <Label htmlFor="detail-minimum-order">Minimum order (৳)</Label>
      <p className="mt-1 text-xs text-muted-foreground">
        Blank = use the platform default. 0 = no minimum for this restaurant.
      </p>
      <div className="mt-2 flex gap-2">
        <Input
          id="detail-minimum-order"
          type="number"
          min={0}
          max={100000}
          step={10}
          placeholder="Platform default"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button variant="outline" disabled={mutation.isPending} onClick={save}>
          Save
        </Button>
      </div>
    </div>
  )
}

function ImpersonateOwnerButton({
  restaurantId,
  restaurantName,
}: {
  restaurantId: string
  restaurantName: string
}) {
  const [open, setOpen] = React.useState(false)
  const [reason, setReason] = React.useState("")

  const impersonateMutation = useMutation({
    mutationFn: impersonateRestaurantOwner,
    onSuccess: (data) => {
      setOpen(false)
      setReason("")
      // Open the owner dashboard in a new tab; it redeems the one-time code and
      // starts a short-lived (2h) impersonation session. No password involved.
      window.open(data.url, "_blank", "noopener,noreferrer")
      toast.success(`Opening owner dashboard as ${data.ownerName || "owner"}…`)
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not start impersonation."
      )
    },
  })

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <LogIn className="size-4" />
        Login as owner
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Login as {restaurantName}&rsquo;s owner</DialogTitle>
            <DialogDescription>
              Opens the owner web dashboard signed in as this owner, without their
              password. The session lasts 2 hours, is fully audited, and cannot
              change the owner&rsquo;s password. Give a reason for the record.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Owner asked us to fix their menu prices over the phone"
            rows={3}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                impersonateMutation.mutate({ restaurantId, reason: reason.trim() })
              }
              disabled={reason.trim().length < 3 || impersonateMutation.isPending}
            >
              {impersonateMutation.isPending ? "Preparing…" : "Login as owner"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function RestaurantEnforcementControl({
  details,
  pending,
  onSave,
}: {
  details: AdminRestaurantDetails
  pending: boolean
  onSave: (payload: {
    status: EnforcementStatus
    reason?: string
    ownerNote?: string
    customerMessage?: string
    internalNote?: string
    expiresAt?: string | null
  }) => void
}) {
  const enforcement = details.enforcement
  const [status, setStatus] = React.useState<EnforcementStatus>(
    (enforcement.effectiveStatus as EnforcementStatus) || "active"
  )
  const [reason, setReason] = React.useState(enforcement.reason || "")
  const [ownerNote, setOwnerNote] = React.useState(enforcement.ownerNote || "")
  const [customerMessage, setCustomerMessage] = React.useState(
    enforcement.customerMessage || ""
  )
  const [internalNote, setInternalNote] = React.useState(
    enforcement.internalNote || ""
  )
  const [expiresAt, setExpiresAt] = React.useState(
    toDatetimeLocalValue(enforcement.expiresAt)
  )

  React.useEffect(() => {
    setStatus((enforcement.effectiveStatus as EnforcementStatus) || "active")
    setReason(enforcement.reason || "")
    setOwnerNote(enforcement.ownerNote || "")
    setCustomerMessage(enforcement.customerMessage || "")
    setInternalNote(enforcement.internalNote || "")
    setExpiresAt(toDatetimeLocalValue(enforcement.expiresAt))
  }, [enforcement])

  function applyDuration(hours: number | "permanent") {
    if (hours === "permanent") {
      setExpiresAt("")
      return
    }
    const date = new Date(Date.now() + hours * 60 * 60 * 1000)
    setExpiresAt(toDatetimeLocalValue(date.toISOString()))
  }

  function handleStatusChange(value: string) {
    const nextStatus = value as EnforcementStatus
    setStatus(nextStatus)
    if (!customerMessage) setCustomerMessage(getDefaultEnforcementMessage(nextStatus))
    if (nextStatus === "active" || nextStatus === "under_review") {
      setExpiresAt("")
    } else if (!expiresAt && nextStatus !== "permanently_disabled") {
      applyDuration(72)
    }
  }

  return (
    <div className="rounded-lg border bg-background p-3 xl:col-span-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">Restaurant enforcement</p>
            <Badge
              variant="outline"
              className={
                enforcement.isRestricted
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : enforcement.effectiveStatus === "under_review"
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }
            >
              {enforcement.effectiveStatus.replaceAll("_", " ")}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Quality hold and suspension keep owner login available, but block
            customer ordering and owner online status.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {enforcement.expiresAt ? (
            <Badge variant="secondary">Ends {formatDate(enforcement.expiresAt)}</Badge>
          ) : null}
          <ImpersonateOwnerButton
            restaurantId={details.id}
            restaurantName={details.name}
          />
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="space-y-1">
          <Label>Status</Label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={status}
            onChange={(event) => handleStatusChange(event.target.value)}
          >
            <option value="active">Active</option>
            <option value="under_review">Under review</option>
            <option value="quality_hold">Quality hold</option>
            <option value="temporarily_suspended">Temporarily suspended</option>
            <option value="permanently_disabled">Permanently disabled</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label>Ends at</Label>
          <Input
            type="datetime-local"
            value={expiresAt}
            disabled={status === "active" || status === "under_review"}
            onChange={(event) => setExpiresAt(event.target.value)}
          />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => applyDuration(24)}>
          24h
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => applyDuration(72)}>
          3 days
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => applyDuration(168)}>
          7 days
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => applyDuration("permanent")}>
          No expiry
        </Button>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="space-y-1">
          <Label>Reason</Label>
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Repeated quality complaints"
          />
        </div>
        <div className="space-y-1">
          <Label>Customer message</Label>
          <Input
            value={customerMessage}
            onChange={(event) => setCustomerMessage(event.target.value)}
            placeholder="Temporarily unavailable due to quality review"
          />
        </div>
        <div className="space-y-1">
          <Label>Owner-visible note</Label>
          <Input
            value={ownerNote}
            onChange={(event) => setOwnerNote(event.target.value)}
            placeholder="Review food handling and packaging standards."
          />
        </div>
        <div className="space-y-1">
          <Label>Internal note</Label>
          <Input
            value={internalNote}
            onChange={(event) => setInternalNote(event.target.value)}
            placeholder="Admin-only context"
          />
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            onSave({
              status,
              reason,
              ownerNote,
              customerMessage,
              internalNote,
              expiresAt: datetimeLocalToIso(expiresAt),
            })
          }
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Save enforcement
        </Button>
      </div>
    </div>
  )
}

function RestaurantDetailsContent({
  details,
  commissionDraft,
  setCommissionDraft,
  featuredPositionDraft,
  setFeaturedPositionDraft,
  visibilityPending,
  merchandisingPending,
  commissionPending,
  deliveryPricingPending,
  deliveryBaseFeeDraft,
  setDeliveryBaseFeeDraft,
  deliveryStartsAfterDraft,
  setDeliveryStartsAfterDraft,
  deliveryStepMetersDraft,
  setDeliveryStepMetersDraft,
  deliveryStepAmountDraft,
  setDeliveryStepAmountDraft,
  customerNoteEnabledDraft,
  customerNoteLabelDraft,
  setCustomerNoteLabelDraft,
  customerNotePlaceholderDraft,
  setCustomerNotePlaceholderDraft,
  customBadgeEnabledDraft,
  customBadgeLabelDraft,
  setCustomBadgeLabelDraft,
  reconcilePending,
  payoutStatusPending,
  enforcementPending,
  onEnforcementSave,
  onVisibilityChange,
  onFeatureChange,
  onSponsoredChange,
  onCustomerNoteSave,
  onCustomerNoteToggle,
  onCustomBadgeSave,
  onCustomBadgeToggle,
  onCommissionSave,
  pricingModelDraft,
  setPricingModelDraft,
  markupPercentDraft,
  setMarkupPercentDraft,
  pricingModelPending,
  onPricingModelSave,
  onDeliveryPricingSave,
  onDeliveryPricingToggle,
  onDistanceSurchargeToggle,
  onFeaturedPositionSave,
  onReconcileFinance,
  onPayoutStatusChange,
  onPayoutStatementView,
  payoutStatementPending,
  detailsPreset,
  detailsFrom,
  detailsTo,
  setDetailsPreset,
  setDetailsRange,
}: {
  details: AdminRestaurantDetails
  commissionDraft: string
  setCommissionDraft: (value: string) => void
  pricingModelDraft: "commission" | "markup"
  setPricingModelDraft: (value: "commission" | "markup") => void
  markupPercentDraft: string
  setMarkupPercentDraft: (value: string) => void
  pricingModelPending: boolean
  onPricingModelSave: () => void
  featuredPositionDraft: string
  setFeaturedPositionDraft: (value: string) => void
  visibilityPending: boolean
  merchandisingPending: boolean
  commissionPending: boolean
  deliveryPricingPending: boolean
  deliveryBaseFeeDraft: string
  setDeliveryBaseFeeDraft: (value: string) => void
  deliveryStartsAfterDraft: string
  setDeliveryStartsAfterDraft: (value: string) => void
  deliveryStepMetersDraft: string
  setDeliveryStepMetersDraft: (value: string) => void
  deliveryStepAmountDraft: string
  setDeliveryStepAmountDraft: (value: string) => void
  customerNoteEnabledDraft: boolean
  customerNoteLabelDraft: string
  setCustomerNoteLabelDraft: (value: string) => void
  customerNotePlaceholderDraft: string
  setCustomerNotePlaceholderDraft: (value: string) => void
  customBadgeEnabledDraft: boolean
  customBadgeLabelDraft: string
  setCustomBadgeLabelDraft: (value: string) => void
  reconcilePending: boolean
  payoutStatusPending: boolean
  enforcementPending: boolean
  onEnforcementSave: (payload: {
    status:
      | "active"
      | "under_review"
      | "quality_hold"
      | "temporarily_suspended"
      | "permanently_disabled"
    reason?: string
    ownerNote?: string
    customerMessage?: string
    internalNote?: string
    expiresAt?: string | null
  }) => void
  onVisibilityChange: (isVisible: boolean) => void
  onFeatureChange: (isFeatured: boolean) => void
  onSponsoredChange: (isSponsored: boolean) => void
  onCustomerNoteSave: () => void
  onCustomerNoteToggle: (enabled: boolean) => void
  onCustomBadgeSave: () => void
  onCustomBadgeToggle: (enabled: boolean) => void
  onCommissionSave: () => void
  onDeliveryPricingSave: () => void
  onDeliveryPricingToggle: (enabled: boolean) => void
  onDistanceSurchargeToggle: (enabled: boolean) => void
  onFeaturedPositionSave: () => void
  onReconcileFinance: () => void
  onPayoutStatusChange: (
    payoutId: string,
    status: "processing" | "completed" | "failed",
    expectedStatus: string,
    amount: number
  ) => void
  onPayoutStatementView: (payoutId: string) => void
  payoutStatementPending: boolean
  detailsPreset: RestaurantOrderPreset
  detailsFrom: string
  detailsTo: string
  setDetailsPreset: (value: RestaurantOrderPreset) => void
  setDetailsRange: (range: { from: string; to: string }) => void
}) {
  return (
    <div className="space-y-5 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-medium">Restaurant KPIs</p>
          <p className="text-xs text-muted-foreground">
            Revenue is counted only from delivered orders.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <AdminDateRangeFilter<RestaurantOrderPreset>
            value={detailsPreset}
            from={detailsFrom}
            to={detailsTo}
            label="Date"
            onPresetChange={setDetailsPreset}
            onRangeChange={setDetailsRange}
          />
          <Button
            type="button"
            variant="outline"
            disabled={detailsPreset === "last7Days" && !detailsFrom && !detailsTo}
            onClick={() => {
              setDetailsPreset("last7Days")
              setDetailsRange({ from: "", to: "" })
            }}
          >
            <RotateCcw className="size-4" />
            Reset filter
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
        <StatCard
          label="Lifetime earning"
          value={formatCurrency(details.finance.totalNetEarnings)}
          helper="Delivered net earning"
        />
        <StatCard
          label="Next payout"
          value={formatShortDate(details.finance.nextSettlementAvailableAt)}
          helper={`${details.finance.settlementDelayDays} day settlement`}
        />
        <StatCard
          label="Orders"
          value={`${details.finance.windowDeliveredOrders}`}
          helper="Delivered in filter"
        />
        <StatCard
          label="Revenue"
          value={formatCurrency(details.finance.windowGrossDeliveredRevenue)}
          helper="Delivered gross in filter"
        />
        <StatCard
          label="Late updates"
          value={`${details.lateOrders}`}
          helper="Needs admin attention"
        />
        <StatCard
          label="Accept rate"
          value={formatPercent(details.operations.acceptedWithin5MinutesRate)}
          helper="Within 5 minutes"
        />
        <StatCard
          label="Rating"
          value={`${details.averageRating.toFixed(1)}`}
          helper={`${details.reviewCount} reviews`}
        />
      </div>

      <Tabs defaultValue="overview" className="gap-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="reviews">Reviews</TabsTrigger>
          <TabsTrigger value="promotions">Promotion uses</TabsTrigger>
          <TabsTrigger value="support">Support</TabsTrigger>
          <TabsTrigger value="finance">Finance</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Admin controls</CardTitle>
              <CardDescription>
                Visibility, featured placement, and commission controls.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 xl:grid-cols-4">
              <div className="rounded-lg border bg-background p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">Customer visibility</p>
                    <p className="text-xs text-muted-foreground">
                      Discovery listing access.
                    </p>
                  </div>
                  <Switch
                    checked={details.isVisible}
                    disabled={visibilityPending}
                    onCheckedChange={onVisibilityChange}
                  />
                </div>
              </div>
              <div className="rounded-lg border bg-background p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">Featured</p>
                    <p className="text-xs text-muted-foreground">
                      Managed from Content / CMS → Home restaurant sections.
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      details.isFeatured
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-slate-50 text-slate-600"
                    }
                  >
                    {details.isFeatured ? "Featured" : "Not featured"}
                  </Badge>
                </div>
                {/* Read-only here — featured selection + order is controlled from the CMS
                    Home restaurant sections (drag to reorder). Controls kept mounted but
                    disabled so the merchandising data flow stays intact. */}
                <div className="mt-3 hidden gap-2">
                  <Switch
                    checked={details.isFeatured}
                    disabled
                    onCheckedChange={onFeatureChange}
                  />
                  <Input
                    aria-label="Featured display order"
                    type="number"
                    min={1}
                    value={featuredPositionDraft}
                    disabled
                    onChange={(event) =>
                      setFeaturedPositionDraft(event.target.value)
                    }
                  />
                  <Button variant="outline" disabled onClick={onFeaturedPositionSave}>
                    Save order
                  </Button>
                </div>
              </div>
              <div className="rounded-lg border bg-background p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">Sponsored</p>
                    <p className="text-xs text-muted-foreground">
                      Adds a “Sponsored” badge to the restaurant card.
                    </p>
                  </div>
                  <Switch
                    checked={details.isSponsored}
                    disabled={merchandisingPending}
                    onCheckedChange={onSponsoredChange}
                  />
                </div>
              </div>
              <div className="rounded-lg border bg-background p-3">
                <Label htmlFor="detail-commission">Commission rate</Label>
                <div className="mt-2 flex gap-2">
                  <Input
                    id="detail-commission"
                    type="number"
                    min={0}
                    max={100}
                    value={commissionDraft}
                    onChange={(event) => setCommissionDraft(event.target.value)}
                  />
                  <Button
                    variant="outline"
                    disabled={commissionPending}
                    onClick={onCommissionSave}
                  >
                    Save
                  </Button>
                </div>
              </div>
              <div className="rounded-lg border bg-background p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">Zero-commission markup</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      When on, no commission is taken. Instead this % is added on
                      top of every customer-facing menu price for profit. The owner
                      always keeps seeing their real price.
                    </p>
                  </div>
                  <Switch
                    checked={pricingModelDraft === "markup"}
                    disabled={pricingModelPending}
                    onCheckedChange={(checked) =>
                      setPricingModelDraft(checked ? "markup" : "commission")
                    }
                  />
                </div>
                {pricingModelDraft === "markup" ? (
                  <div className="mt-3">
                    <Label htmlFor="detail-markup-percent">Markup %</Label>
                    <Input
                      id="detail-markup-percent"
                      className="mt-1"
                      type="number"
                      min={0}
                      max={100}
                      value={markupPercentDraft}
                      onChange={(event) =>
                        setMarkupPercentDraft(event.target.value)
                      }
                    />
                  </div>
                ) : null}
                <Button
                  variant="outline"
                  className="mt-3 w-full"
                  disabled={pricingModelPending}
                  onClick={onPricingModelSave}
                >
                  Save pricing model
                </Button>
              </div>
              <MinimumOrderControl
                restaurantId={details.id}
                current={details.minimumOrderAmount}
              />
              <div className="rounded-lg border bg-background p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">Delivery pricing</p>
                      <Badge
                        variant="outline"
                        className={
                          details.deliveryPricing.override.enabled
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-slate-50 text-slate-600"
                        }
                      >
                        {details.deliveryPricing.override.enabled
                          ? "Custom pricing active"
                          : "Using global pricing"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Admin only. Restaurant owners cannot change delivery fees.
                    </p>
                  </div>
                  <Switch
                    checked={details.deliveryPricing.override.enabled}
                    disabled={deliveryPricingPending}
                    onCheckedChange={onDeliveryPricingToggle}
                  />
                </div>
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="detail-delivery-base">Base fee</Label>
                      <Input
                        id="detail-delivery-base"
                        type="number"
                        min={0}
                        value={deliveryBaseFeeDraft}
                        onChange={(event) =>
                          setDeliveryBaseFeeDraft(event.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="detail-delivery-starts-after">
                        Extra fee after km
                      </Label>
                      <Input
                        id="detail-delivery-starts-after"
                        type="number"
                        min={0}
                        step="0.1"
                        value={deliveryStartsAfterDraft}
                        onChange={(event) =>
                          setDeliveryStartsAfterDraft(event.target.value)
                        }
                      />
                    </div>
                  </div>
                  <div className="rounded-lg border border-dashed p-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">Distance surcharge</p>
                        <p className="text-xs text-muted-foreground">
                          Add extra fee after the distance threshold.
                        </p>
                      </div>
                      <Switch
                        checked={
                          details.deliveryPricing.override
                            .distanceSurchargeEnabled === true
                        }
                        disabled={deliveryPricingPending}
                        onCheckedChange={onDistanceSurchargeToggle}
                      />
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label htmlFor="detail-delivery-step-meters">
                          Per meters
                        </Label>
                        <Input
                          id="detail-delivery-step-meters"
                          type="number"
                          min={1}
                          value={deliveryStepMetersDraft}
                          onChange={(event) =>
                            setDeliveryStepMetersDraft(event.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="detail-delivery-step-amount">
                          Added fee
                        </Label>
                        <Input
                          id="detail-delivery-step-amount"
                          type="number"
                          min={0}
                          value={deliveryStepAmountDraft}
                          onChange={(event) =>
                            setDeliveryStepAmountDraft(event.target.value)
                          }
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      disabled={deliveryPricingPending}
                      onClick={onDeliveryPricingSave}
                    >
                      Save pricing
                    </Button>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border bg-background p-3 xl:col-span-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">Checkout note</p>
                      <Badge
                        variant="outline"
                        className={
                          customerNoteEnabledDraft
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-slate-50 text-slate-600"
                        }
                      >
                        {customerNoteEnabledDraft ? "Shown to customers" : "Hidden"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Use this for cake names, messages, or restaurant-specific
                      order instructions. Customer entry stays optional.
                    </p>
                  </div>
                  <Switch
                    checked={customerNoteEnabledDraft}
                    disabled={merchandisingPending}
                    onCheckedChange={onCustomerNoteToggle}
                  />
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="detail-customer-note-label">Label</Label>
                    <Input
                      id="detail-customer-note-label"
                      maxLength={80}
                      value={customerNoteLabelDraft}
                      onChange={(event) =>
                        setCustomerNoteLabelDraft(event.target.value)
                      }
                      placeholder="Order note"
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label htmlFor="detail-customer-note-placeholder">
                      Placeholder
                    </Label>
                    <Textarea
                      id="detail-customer-note-placeholder"
                      maxLength={160}
                      rows={2}
                      value={customerNotePlaceholderDraft}
                      onChange={(event) =>
                        setCustomerNotePlaceholderDraft(event.target.value)
                      }
                      placeholder="Cake name, message, or any restaurant instruction"
                    />
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button
                    variant="outline"
                    disabled={merchandisingPending}
                    onClick={onCustomerNoteSave}
                  >
                    Save note setting
                  </Button>
                </div>
              </div>
              <div className="rounded-lg border bg-background p-3 xl:col-span-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">Custom card badge</p>
                      <Badge
                        variant="outline"
                        className={
                          customBadgeEnabledDraft
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-slate-50 text-slate-600"
                        }
                      >
                        {customBadgeEnabledDraft ? "Shown on card" : "Hidden"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      A short marketing badge shown on this restaurant&rsquo;s card in
                      the customer app (e.g. &ldquo;New&rdquo;, &ldquo;Popular&rdquo;,
                      &ldquo;Try now&rdquo;). Set the title, then toggle it on only for
                      the restaurants you want.
                    </p>
                  </div>
                  <Switch
                    checked={customBadgeEnabledDraft}
                    disabled={merchandisingPending}
                    onCheckedChange={onCustomBadgeToggle}
                  />
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="detail-custom-badge-label">Badge title</Label>
                    <Input
                      id="detail-custom-badge-label"
                      maxLength={24}
                      value={customBadgeLabelDraft}
                      onChange={(event) =>
                        setCustomBadgeLabelDraft(event.target.value)
                      }
                      placeholder="e.g. New, Popular"
                    />
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button
                    variant="outline"
                    disabled={merchandisingPending}
                    onClick={onCustomBadgeSave}
                  >
                    Save badge
                  </Button>
                </div>
              </div>
              <RestaurantEnforcementControl
                details={details}
                pending={enforcementPending}
                onSave={onEnforcementSave}
              />
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Owner & profile</CardTitle>
                <CardDescription>
                  Owner account and public restaurant profile.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <InfoRow label="Owner" value={details.owner.fullName} />
                <InfoRow
                  label="Phone"
                  value={details.owner.phone || details.ownerPhone || "N/A"}
                />
                <InfoRow
                  label="Email"
                  value={details.owner.email || details.ownerEmail || "N/A"}
                />
                <InfoRow
                  label="Lifecycle"
                  value={details.owner.restaurantLifecycleStatus.replaceAll(
                    "_",
                    " "
                  )}
                />
                <InfoRow
                  label="Address"
                  value={`${details.address || "N/A"}, ${details.city}`}
                />
                <InfoRow
                  label="Cuisines"
                  value={details.cuisines.join(", ") || "N/A"}
                />
                <InfoRow
                  label="Tags"
                  value={details.tags.join(", ") || "N/A"}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Menu health</CardTitle>
                <CardDescription>
                  Category and menu item readiness.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border bg-background p-3">
                  <p className="text-sm text-muted-foreground">Categories</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {details.menu.totalCategories}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {details.menu.activeCategories} active
                  </p>
                </div>
                <div className="rounded-lg border bg-background p-3">
                  <p className="text-sm text-muted-foreground">Menu items</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {details.menu.totalItems}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {details.menu.availableItems} available
                  </p>
                </div>
                <div className="rounded-lg border bg-background p-3">
                  <p className="text-sm text-muted-foreground">Unavailable</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {details.menu.unavailableItems}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Items off sale
                  </p>
                </div>
                <div className="rounded-lg border bg-background p-3">
                  <p className="text-sm text-muted-foreground">Popular</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {details.menu.popularItems}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Highlighted items
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Media & location</CardTitle>
                <CardDescription>
                  Image uploads and map coordinates.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <InfoRow
                  label="Logo"
                  value={
                    details.hasLogo ? (
                      <Badge
                        variant="outline"
                        className="border-emerald-200 bg-emerald-50 text-emerald-700"
                      >
                        Uploaded
                      </Badge>
                    ) : (
                      <Badge variant="outline">Missing</Badge>
                    )
                  }
                />
                <InfoRow
                  label="Cover"
                  value={
                    details.hasCoverImage ? (
                      <Badge
                        variant="outline"
                        className="border-emerald-200 bg-emerald-50 text-emerald-700"
                      >
                        Uploaded
                      </Badge>
                    ) : (
                      <Badge variant="outline">Missing</Badge>
                    )
                  }
                />
                <InfoRow label="Latitude" value={details.latitude ?? "N/A"} />
                <InfoRow label="Longitude" value={details.longitude ?? "N/A"} />
                <InfoRow
                  label="Prep time"
                  value={`${details.preparationTimeMinutes ?? 30} minutes`}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="orders">
          <RestaurantOrdersTab details={details} />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <StatCard
              label="Avg accept"
              value={`${details.operations.averageAcceptanceMinutes} min`}
              helper="Current order window"
            />
            <StatCard
              label="Avg prep"
              value={`${details.operations.averagePreparationMinutes} min`}
              helper="Accepted to ready"
            />
            <StatCard
              label="Ready on estimate"
              value={formatPercent(details.operations.readyWithinEstimateRate)}
              helper="Prep SLA"
            />
            <StatCard
              label="Restaurant cancels"
              value={`${details.restaurantCancelledOrders}`}
              helper="Rejected/cancelled by owner"
            />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Order acceptance performance</CardTitle>
              <CardDescription>
                Restaurant response speed, cancellations, and late updates.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <InfoRow
                label="Live orders"
                value={details.analytics.liveOrders}
              />
              <InfoRow
                label="Late owner updates"
                value={details.analytics.lateOrders}
              />
              <InfoRow
                label="System cancellations"
                value={details.analytics.systemCancelledOrders}
              />
              <InfoRow
                label="Restaurant cancellations"
                value={details.analytics.restaurantCancelledOrders}
              />
              <InfoRow
                label="Delivered orders"
                value={details.analytics.totalDeliveredOrders}
              />
              <InfoRow
                label="Last order"
                value={formatDate(details.analytics.lastOrderAt)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reviews">
          <RestaurantReviewsTab details={details} />
        </TabsContent>

        <TabsContent value="promotions" className="space-y-4">
          <RestaurantPromotionUsesTab details={details} />
        </TabsContent>

        <TabsContent value="support">
          <Card>
            <CardHeader>
              <CardTitle>Support & complaints</CardTitle>
              <CardDescription>
                Open issues connected to this restaurant.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-4">
                {[
                  ["Open", details.support.summary.open, "Needs attention"],
                  [
                    "In progress",
                    details.support.summary.inProgress,
                    "Being handled",
                  ],
                  ["Resolved", details.support.summary.resolved, "Completed"],
                  ["Closed", details.support.summary.closed, "Archived"],
                ].map(([label, value, helper]) => (
                  <div key={label} className="rounded-lg border p-3">
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <p className="mt-2 text-2xl font-semibold">{value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {helper}
                    </p>
                  </div>
                ))}
              </div>
              {details.support.cases.map((supportCase) => (
                <div key={supportCase.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{supportCase.subject}</p>
                    <Badge variant="outline">
                      {supportCase.status.replaceAll("_", " ")}
                    </Badge>
                    <Badge variant="outline">{supportCase.priority}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {supportCase.message}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="finance" className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-medium">Finance sync</p>
              <p className="text-xs text-muted-foreground">
                Ledger values are reconciled from delivered orders only.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={reconcilePending}
              onClick={onReconcileFinance}
            >
              {reconcilePending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RotateCcw className="size-4" />
              )}
              Reconcile finance
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-5">
            <StatCard
              label="Net earnings"
              value={formatCurrency(details.finance.totalNetEarnings)}
              helper="Restaurant share"
            />
            <StatCard
              label="Commission"
              value={formatCurrency(details.finance.totalCommission)}
              helper={`${details.commissionRate}% rate`}
            />
            <StatCard
              label="Available"
              value={formatCurrency(details.finance.availableBalance)}
              helper="Payout balance"
            />
            <StatCard
              label="Pending"
              value={formatCurrency(details.finance.pendingBalance)}
              helper="Settlement queue"
            />
            <StatCard
              label="Next payout"
              value={formatShortDate(details.finance.nextSettlementAvailableAt)}
              helper="Earliest pending settlement"
            />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Payout policy</CardTitle>
              <CardDescription>
                Current global rules from Settings &gt; Payments. These are enforced by backend before owners can request payout.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm md:grid-cols-3">
              <InfoRow
                label="Settlement hold"
                value={`${details.finance.settlementDelayDays} day${details.finance.settlementDelayDays === 1 ? "" : "s"}`}
              />
              <InfoRow
                label="Minimum request"
                value={formatCurrency(details.finance.minimumPayoutAmountTaka)}
              />
              <InfoRow
                label="Active request lock"
                value={details.finance.oneActivePayoutRequest ? "Enabled" : "Disabled"}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Payout method</CardTitle>
              <CardDescription>
                Settlement destination and verification.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <InfoRow
                label="Type"
                value={details.payoutMethod?.type || "Not added"}
              />
              <InfoRow
                label="Account"
                value={details.payoutMethod?.accountName || "N/A"}
              />
              <InfoRow
                label="Number"
                value={
                  details.payoutMethod?.accountNumber ||
                  details.payoutMethod?.accountNumberMasked ||
                  "N/A"
                }
              />
              <InfoRow
                label="Verified"
                value={details.payoutMethod?.isVerified ? "Yes" : "No"}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Recent payout requests</CardTitle>
              <CardDescription>
                Move owner payout requests through processing, completed, or failed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Requested</TableHead>
                      <TableHead>Processed</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {details.finance.recentPayouts.length ? (
                      details.finance.recentPayouts.map((payout) => (
                        <TableRow key={payout.id}>
                          <TableCell className="font-medium">
                            <div>{payout.batchReference || payout.id}</div>
                            {payout.providerReference || payout.providerTransactionId ? (
                              <div className="mt-1 text-xs font-normal text-muted-foreground">
                                {payout.providerTransactionId || payout.providerReference}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell>{formatCurrency(payout.amount)}</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={getPayoutStatusBadgeClass(payout.status)}
                            >
                              {payout.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatShortDate(payout.requestedAt)}</TableCell>
                          <TableCell>{formatShortDate(payout.processedAt)}</TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={payoutStatementPending}
                                onClick={() => onPayoutStatementView(payout.id)}
                              >
                                <Eye className="size-4" />
                                View
                              </Button>
                              {payout.status === "pending" ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={payoutStatusPending}
                                  onClick={() =>
                                    onPayoutStatusChange(
                                      payout.id,
                                      "processing",
                                      payout.status,
                                      payout.amount
                                    )
                                  }
                                >
                                  Process
                                </Button>
                              ) : null}
                              {["pending", "processing"].includes(payout.status) ? (
                                <>
                                  <Button
                                    type="button"
                                    size="sm"
                                    disabled={payoutStatusPending}
                                    onClick={() =>
                                      onPayoutStatusChange(
                                        payout.id,
                                        "completed",
                                        payout.status,
                                        payout.amount
                                      )
                                    }
                                  >
                                    Complete
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="destructive"
                                    disabled={payoutStatusPending}
                                    onClick={() =>
                                      onPayoutStatusChange(
                                        payout.id,
                                        "failed",
                                        payout.status,
                                        payout.amount
                                      )
                                    }
                                  >
                                    Fail
                                  </Button>
                                </>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  Final
                                </span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="py-6 text-center text-sm text-muted-foreground"
                        >
                          No payout requests yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Activity timeline</CardTitle>
                <CardDescription>
                  Recent restaurant, order, and admin events.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {details.activityTimeline.map((item, index) => (
                  <div
                    key={`${item.type}-${index}`}
                    className="rounded-lg border p-3"
                  >
                    <div className="font-medium">{item.title}</div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.description}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {formatDate(item.createdAt)}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Audit log</CardTitle>
                <CardDescription>
                  Admin and owner-side changes that affect restaurant operations.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {details.auditLogs.map((log) => (
                  <div key={log.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium">{log.title}</div>
                      <Badge variant="outline">{log.action}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {log.description}
                    </p>
                    {log.action === "restaurant_contact_updated" ? (
                      <div className="mt-3 grid gap-2 rounded-lg bg-muted/40 p-3 text-xs sm:grid-cols-2">
                        <div>
                          <div className="font-medium text-muted-foreground">
                            Previous number
                          </div>
                          <div className="mt-1 font-semibold">
                            {formatAuditMetadataValue(log.metadata.previousPhone)}
                          </div>
                        </div>
                        <div>
                          <div className="font-medium text-muted-foreground">
                            New number
                          </div>
                          <div className="mt-1 font-semibold">
                            {formatAuditMetadataValue(log.metadata.nextPhone)}
                          </div>
                        </div>
                      </div>
                    ) : null}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {log.actorName} - {formatDate(log.createdAt)}
                    </p>
                  </div>
                ))}
                {details.auditLogs.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                    No audit logs yet.
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ApprovalQueue() {
  const queryClient = useQueryClient()
  const [rejectNotes, setRejectNotes] = React.useState<Record<string, string>>(
    {}
  )

  const submittedQuery = useQuery({
    queryKey: ["admin-review-cases", "submitted"],
    queryFn: () => listReviewCases("submitted"),
  })
  const underReviewQuery = useQuery({
    queryKey: ["admin-review-cases", "under_review"],
    queryFn: () => listReviewCases("under_review"),
  })

  const reviewCases = [
    ...(submittedQuery.data ?? []),
    ...(underReviewQuery.data ?? []),
  ]

  const invalidateApprovals = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-review-cases"] })
    void queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] })
  }

  const startMutation = useMutation({
    mutationFn: startReviewCase,
    onSuccess: () => {
      toast.success("Review moved to under review.")
      invalidateApprovals()
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not start review."
      )
    },
  })

  const approveMutation = useMutation({
    mutationFn: approveReviewCase,
    onSuccess: () => {
      toast.success("Restaurant approved and published.")
      invalidateApprovals()
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not approve restaurant."
      )
    },
  })

  const rejectMutation = useMutation({
    mutationFn: (reviewCaseId: string) =>
      rejectReviewCase({
        reviewCaseId,
        reviewNote: rejectNotes[reviewCaseId]?.trim() || "Rejected by admin",
        reviewIssues: [],
      }),
    onSuccess: (_data, reviewCaseId) => {
      setRejectNotes((current) => ({ ...current, [reviewCaseId]: "" }))
      toast.success("Restaurant review rejected.")
      invalidateApprovals()
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not reject review."
      )
    },
  })

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>Restaurant approval queue</CardTitle>
          <CardDescription>
            Review submitted onboarding drafts and publish restaurants.
          </CardDescription>
        </div>
        <Badge variant="outline">{reviewCases.length} pending</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {reviewCases.map((item) => {
          const draft = draftRestaurantName(item)

          return (
            <div key={item._id} className="rounded-lg border bg-background p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{draft.restaurantName}</p>
                    <Badge variant="outline">
                      {item.status.replaceAll("_", " ")}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {draft.ownerName} {draft.phone ? `- ${draft.phone}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {draft.address || "No address"}{" "}
                    {draft.city ? `, ${draft.city}` : ""}
                  </p>
                </div>
                <div className="grid gap-2 md:grid-cols-[minmax(180px,1fr)_auto_auto_auto]">
                  <Input
                    value={rejectNotes[item._id] ?? ""}
                    onChange={(event) =>
                      setRejectNotes((current) => ({
                        ...current,
                        [item._id]: event.target.value,
                      }))
                    }
                    placeholder="Reject note"
                  />
                  {item.status === "submitted" ? (
                    <Button
                      variant="outline"
                      disabled={startMutation.isPending}
                      onClick={() => startMutation.mutate(item._id)}
                    >
                      Start
                    </Button>
                  ) : null}
                  <Button
                    disabled={approveMutation.isPending}
                    onClick={() => approveMutation.mutate(item._id)}
                  >
                    <CheckCircle2 className="size-4" />
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    disabled={rejectMutation.isPending}
                    onClick={() => rejectMutation.mutate(item._id)}
                  >
                    <XCircle className="size-4" />
                    Reject
                  </Button>
                </div>
              </div>
            </div>
          )
        })}

        {submittedQuery.isPending || underReviewQuery.isPending ? (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading approval queue...
          </div>
        ) : reviewCases.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-sm text-muted-foreground">
            No restaurant onboarding reviews are waiting right now.
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function RestaurantActionsMenu({
  restaurant,
  isPending,
  onView,
  onToggleVisibility,
  onEditFeature,
  onRemoveFeature,
  onDelete,
}: {
  restaurant: AdminRestaurantSummary
  isPending: boolean
  onView: () => void
  onToggleVisibility: () => void
  onEditFeature: () => void
  onRemoveFeature: () => void
  onDelete: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="data-[state=open]:bg-muted"
          aria-label={`Open actions for ${restaurant.name}`}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem onClick={onView}>
          <Eye className="size-4" />
          View details
        </DropdownMenuItem>
        <DropdownMenuItem disabled={isPending} onClick={onToggleVisibility}>
          {restaurant.isVisible ? (
            <EyeOff className="size-4" />
          ) : (
            <Eye className="size-4" />
          )}
          {restaurant.isVisible ? "Hide restaurant" : "Show restaurant"}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={isPending} onClick={onEditFeature}>
          <Star className="size-4" />
          {restaurant.isFeatured ? "Edit featured order" : "Mark featured"}
        </DropdownMenuItem>
        {restaurant.isFeatured ? (
          <DropdownMenuItem disabled={isPending} onClick={onRemoveFeature}>
            <XCircle className="size-4" />
            Remove featured
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={isPending}
          onClick={onDelete}
        >
          <Trash2 className="size-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function RestaurantsPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [search, setSearch] = React.useState("")
  const [visibility, setVisibility] = React.useState<VisibilityFilter>("all")
  const [runtime, setRuntime] = React.useState<RuntimeFilter>("all")
  const [sortBy, setSortBy] = React.useState<RestaurantSort>("newestUpdated")
  const [page, setPage] = React.useState(1)
  const [addOpen, setAddOpen] = React.useState(false)
  const [selectedRestaurantId, setSelectedRestaurantId] = React.useState("")
  const [deleteTarget, setDeleteTarget] =
    React.useState<AdminRestaurantSummary | null>(null)
  const [featureTarget, setFeatureTarget] =
    React.useState<AdminRestaurantSummary | null>(null)
  const [featurePositionDraft, setFeaturePositionDraft] = React.useState("1")
  const [columnVisibility, setColumnVisibility] = React.useState(
    defaultColumnVisibility
  )
  const debouncedSearch = useDebouncedValue(search, 350)

  const restaurantsQuery = useQuery({
    queryKey: [
      "admin-restaurants",
      debouncedSearch,
      visibility,
      runtime,
      sortBy,
      page,
    ],
    queryFn: () =>
      listAdminRestaurants({
        search: debouncedSearch,
        visibility,
        runtime,
        sortBy,
        page,
        pageSize: 12,
      }),
  })

  const visibilityMutation = useMutation({
    mutationFn: updateAdminRestaurantVisibility,
    onSuccess: () => {
      toast.success("Restaurant visibility updated.")
      void queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Visibility update failed."
      )
    },
  })

  const merchandisingMutation = useMutation({
    mutationFn: updateAdminRestaurantMerchandising,
    onSuccess: () => {
      toast.success("Restaurant merchandising updated.")
      void queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Merchandising update failed."
      )
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteAdminRestaurant,
    onSuccess: (result) => {
      toast.success(
        result.mode === "deleted"
          ? "Restaurant deleted."
          : "Restaurant has order history, so it was hidden."
      )
      setDeleteTarget(null)
      void queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Restaurant delete failed."
      )
    },
  })

  const restaurants = restaurantsQuery.data?.items ?? []
  const summary = restaurantsQuery.data?.summary ?? {}
  const visibleColumnCount =
    RESTAURANT_TABLE_COLUMNS.filter((column) => columnVisibility[column.key])
      .length + 1

  React.useEffect(() => {
    setPage(1)
  }, [debouncedSearch, visibility, runtime, sortBy])

  function openFeatureDialog(restaurant: AdminRestaurantSummary) {
    setFeatureTarget(restaurant)
    setFeaturePositionDraft(`${restaurant.featuredPosition ?? 1}`)
  }

  function getFeaturePositionDraftValue() {
    const featuredPosition = Number(featurePositionDraft)
    if (!Number.isFinite(featuredPosition)) return 1
    return Math.max(1, Math.floor(featuredPosition))
  }

  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
              <Store className="size-4" />
            </div>
            <Badge variant="outline">Core platform module</Badge>
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">
            Restaurants
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Approve restaurants, manage visibility, review menu readiness, set
            commission, and monitor restaurant performance.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="size-4" />
          Add Restaurant
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Total restaurants"
          value={`${summary.total ?? restaurantsQuery.data?.total ?? 0}`}
          helper="All approved profiles"
        />
        <StatCard
          label="Visible"
          value={`${summary.visible ?? 0}`}
          helper="Shown to customers"
        />
        <StatCard
          label="Online"
          value={`${summary.online ?? 0}`}
          helper="Ready for orders"
        />
        <StatCard
          label="Hidden"
          value={`${summary.hidden ?? 0}`}
          helper="Admin or owner hidden"
        />
        <StatCard
          label="Approvals"
          value={`${summary.pendingApprovals ?? 0}`}
          helper="Submitted reviews"
        />
      </div>

      <ApprovalQueue />

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Restaurant directory</CardTitle>
              <CardDescription>
                Search and manage active/inactive restaurants from one place.
              </CardDescription>
            </div>
            <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_150px_150px_180px_auto]">
              <div className="relative">
                <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search restaurants"
                  className="pl-8"
                />
              </div>
              <Select
                value={visibility}
                onValueChange={(value) =>
                  setVisibility(value as VisibilityFilter)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All visibility</SelectItem>
                  <SelectItem value="visible">Visible</SelectItem>
                  <SelectItem value="hidden">Hidden</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={runtime}
                onValueChange={(value) => setRuntime(value as RuntimeFilter)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All runtime</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="offline">Offline</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={sortBy}
                onValueChange={(value) => setSortBy(value as RestaurantSort)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newestUpdated">
                    Recently updated
                  </SelectItem>
                  <SelectItem value="mostOrders">Most orders</SelectItem>
                  <SelectItem value="highestRating">Highest rating</SelectItem>
                  <SelectItem value="completionHigh">
                    Profile completion
                  </SelectItem>
                </SelectContent>
              </Select>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <TableConfig className="size-4" />
                    Columns
                    <ChevronDown className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Show columns</DropdownMenuLabel>
                  {RESTAURANT_TABLE_COLUMNS.map((column) => (
                    <DropdownMenuCheckboxItem
                      key={column.key}
                      checked={columnVisibility[column.key]}
                      onCheckedChange={(checked) =>
                        setColumnVisibility((current) => ({
                          ...current,
                          [column.key]: Boolean(checked),
                        }))
                      }
                    >
                      {column.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                {columnVisibility.restaurant ? (
                  <TableHead>Restaurant</TableHead>
                ) : null}
                {columnVisibility.owner ? <TableHead>Owner</TableHead> : null}
                {columnVisibility.status ? <TableHead>Status</TableHead> : null}
                {columnVisibility.orders ? <TableHead>Orders</TableHead> : null}
                {columnVisibility.performance ? (
                  <TableHead>Performance</TableHead>
                ) : null}
                {columnVisibility.rating ? <TableHead>Rating</TableHead> : null}
                {columnVisibility.media ? <TableHead>Media</TableHead> : null}
                {columnVisibility.commission ? (
                  <TableHead>Commission</TableHead>
                ) : null}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {restaurants.map((restaurant) => (
                <TableRow key={restaurant.id}>
                  {columnVisibility.restaurant ? (
                    <TableCell>
                      <button
                        type="button"
                        className="flex min-w-0 flex-col text-left"
                        onClick={() => setSelectedRestaurantId(restaurant.id)}
                      >
                        <span className="font-medium">{restaurant.name}</span>
                        <span className="max-w-64 truncate text-xs text-muted-foreground">
                          {restaurant.address || "No address"}
                        </span>
                      </button>
                    </TableCell>
                  ) : null}
                  {columnVisibility.owner ? (
                    <TableCell>
                      <div className="font-medium">{restaurant.ownerName}</div>
                      <div className="text-xs text-muted-foreground">
                        {restaurant.ownerPhone ||
                          restaurant.ownerEmail ||
                          "No contact"}
                      </div>
                    </TableCell>
                  ) : null}
                  {columnVisibility.status ? (
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {restaurantStatusBadge(restaurant)}
                        {restaurant.isFeatured ? (
                          <Badge
                            variant="outline"
                            className="border-sky-200 bg-sky-50 text-sky-700"
                          >
                            Featured #{restaurant.featuredPosition ?? 1}
                          </Badge>
                        ) : null}
                        {restaurant.lateOrders > 0 ? (
                          <Badge
                            variant="outline"
                            className="border-rose-200 bg-rose-50 text-rose-700"
                          >
                            {restaurant.lateOrders} late
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                  ) : null}
                  {columnVisibility.orders ? (
                    <TableCell>
                      <div className="font-medium">
                        {restaurant.totalOrders}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {restaurant.liveOrders} live
                      </div>
                    </TableCell>
                  ) : null}
                  {columnVisibility.performance ? (
                    <TableCell>
                      <div className="font-medium">
                        {restaurant.cancelledOrders} cancelled
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {restaurant.restaurantCancelledOrders} restaurant /{" "}
                        {restaurant.systemCancelledOrders} system
                      </div>
                    </TableCell>
                  ) : null}
                  {columnVisibility.rating ? (
                    <TableCell>
                      <div className="flex items-center gap-1 font-medium">
                        <Star className="size-3.5 fill-amber-400 text-amber-400" />
                        {restaurant.averageRating.toFixed(1)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {restaurant.reviewCount} reviews
                      </div>
                    </TableCell>
                  ) : null}
                  {columnVisibility.media ? (
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge
                          variant="outline"
                          className={
                            restaurant.hasLogo
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : ""
                          }
                        >
                          Logo
                        </Badge>
                        <Badge
                          variant="outline"
                          className={
                            restaurant.hasCoverImage
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : ""
                          }
                        >
                          Cover
                        </Badge>
                      </div>
                    </TableCell>
                  ) : null}
                  {columnVisibility.commission ? (
                    <TableCell>
                      <div className="flex items-center gap-1 font-medium">
                        <TicketPercent className="size-3.5 text-muted-foreground" />
                        {restaurant.commissionRate}%
                      </div>
                    </TableCell>
                  ) : null}
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedRestaurantId(restaurant.id)}
                      >
                        <Eye className="size-4" />
                        View
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          navigate(`/restaurants/${restaurant.id}/details`)
                        }
                      >
                        <BarChart3 className="size-4" />
                        Details
                      </Button>
                      <RestaurantActionsMenu
                        restaurant={restaurant}
                        isPending={
                          visibilityMutation.isPending ||
                          merchandisingMutation.isPending ||
                          deleteMutation.isPending
                        }
                        onView={() => setSelectedRestaurantId(restaurant.id)}
                        onToggleVisibility={() =>
                          visibilityMutation.mutate({
                            restaurantId: restaurant.id,
                            isVisible: !restaurant.isVisible,
                          })
                        }
                        onEditFeature={() => openFeatureDialog(restaurant)}
                        onRemoveFeature={() =>
                          merchandisingMutation.mutate({
                            restaurantId: restaurant.id,
                            isFeatured: false,
                            featuredPosition: null,
                          })
                        }
                        onDelete={() => setDeleteTarget(restaurant)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}

              {restaurantsQuery.isPending ? (
                <TableRow>
                  <TableCell
                    colSpan={visibleColumnCount}
                    className="h-24 text-center"
                  >
                    <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      Loading restaurants...
                    </div>
                  </TableCell>
                </TableRow>
              ) : restaurants.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={visibleColumnCount}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No restaurants match this filter.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Page {restaurantsQuery.data?.page ?? page} of{" "}
              {restaurantsQuery.data?.pageCount ?? 1}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={page >= (restaurantsQuery.data?.pageCount ?? 1)}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete restaurant</DialogTitle>
            <DialogDescription>
              {deleteTarget?.name} will be deleted if it has no order history.
              Restaurants with orders are hidden to keep reports accurate.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!deleteTarget || deleteMutation.isPending}
              onClick={() => {
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id)
              }}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(featureTarget)}
        onOpenChange={(open) => {
          if (!open) setFeatureTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Featured order</DialogTitle>
            <DialogDescription>
              Choose where {featureTarget?.name} appears in the featured
              restaurant list. Lower number appears first.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="featured-position">Display order</Label>
            <Input
              id="featured-position"
              type="number"
              min={1}
              value={featurePositionDraft}
              onChange={(event) => setFeaturePositionDraft(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setFeatureTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!featureTarget || merchandisingMutation.isPending}
              onClick={() => {
                if (!featureTarget) return
                merchandisingMutation.mutate(
                  {
                    restaurantId: featureTarget.id,
                    isFeatured: true,
                    featuredPosition: getFeaturePositionDraftValue(),
                  },
                  {
                    onSuccess: () => setFeatureTarget(null),
                  }
                )
              }}
            >
              {merchandisingMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Star className="size-4" />
              )}
              Save order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddRestaurantDialog open={addOpen} onOpenChange={setAddOpen} />
      <RestaurantDetailsSheet
        restaurantId={selectedRestaurantId}
        open={Boolean(selectedRestaurantId)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setSelectedRestaurantId("")
        }}
      />
    </>
  )
}
