import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"

import L from "leaflet"
import { format } from "date-fns"
import {
  ChevronRight,
  Clock3,
  FileCheck2,
  FileText,
  FileUp,
  ImagePlus,
  LoaderCircle,
  MapPin,
  Save,
  Settings2,
  ShieldAlert,
  Smartphone,
  Store,
  Tag,
  Trash2,
  X,
} from "lucide-react"
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import "leaflet/dist/leaflet.css"

import { useOpeningHours } from "@/components/hours/opening-hours-context"
import { useCategories } from "@/components/categories/categories-context"
import { useMenuItems } from "@/components/menu/menu-items-context"
import { usePromotions } from "@/components/promotions/promotions-context"
import type { PayoutMethod } from "@/components/payouts/types"
import { useRestaurantStatus } from "@/components/restaurant-status-context"
import { StorefrontMobilePreview } from "@/components/storefront-mobile-preview"
import {
  type StoreDocumentAttachment,
  type StoreDocumentType,
  type StoreSettings,
  type StoreSettingsFormErrors,
} from "@/components/store-settings/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { api } from "@/lib/api"
import {
  MAX_PREPARATION_TIME_MINUTES,
  MIN_PREPARATION_TIME_MINUTES,
  PREPARATION_TIME_OPTIONS,
} from "@/lib/preparation"
import { getStoreCoverSrc, getStoreLogoSrc } from "@/lib/store-profile"
import { validateImageFile } from "@/lib/image-upload"
import { cn } from "@/lib/utils"
import {
  formatBangladeshPhonePlaceholder,
  isValidBangladeshPhone,
  sanitizeBangladeshPhoneInput,
} from "@/lib/phone"
import { formatTime12Hour } from "@/lib/time"
import { resolveOtpResendSeconds } from "@/lib/otp-timing"
import {
  mapOwnerPayoutMethod,
  mapOwnerStoreSettings,
  resolveRestaurantOnline,
  type OwnerStoreSettingsResponse,
  type OwnerPayoutMethodResponse,
} from "@/lib/backend-mappers"
import {
  useOwnerStoreSettingsQuery,
  useUpdateOwnerStoreSettingsMutation,
  useUpdateOwnerPayoutMethodMutation,
} from "@/hooks/use-owner-api"
import { useAppStore } from "@/store/app-store"

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

const DEFAULT_MAP_CENTER = { latitude: 24.8831, longitude: 90.7282 }
const restaurantMarkerIcon = L.divIcon({
  className: "",
  html: '<div class="size-5 rounded-full border-2 border-background bg-primary shadow-md"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
})

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
  const centerLatitude = latitude ?? DEFAULT_MAP_CENTER.latitude
  const centerLongitude = longitude ?? DEFAULT_MAP_CENTER.longitude

  return (
    <div className="overflow-hidden rounded-3xl border shadow-inner">
      <MapContainer
        center={[centerLatitude, centerLongitude]}
        zoom={14}
        scrollWheelZoom={false}
        className="z-0 h-72 w-full"
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

type UploadTarget = "logo" | "cover"

const STORE_DOCUMENT_OPTIONS: Array<{
  type: StoreDocumentType
  label: string
  helper: string
}> = [
  {
    type: "nid",
    label: "NID",
    helper: "Owner national ID front/back or clear scan.",
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

const MAX_DOCUMENT_SIZE_MB = 10
const MAX_DOCUMENT_SIZE_BYTES = MAX_DOCUMENT_SIZE_MB * 1024 * 1024
const DOCUMENT_UPLOAD_ACCEPT = "image/*,application/pdf"

function validateDocumentFile(file: File) {
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

type SectionHeaderProps = {
  icon: React.ElementType
  title: string
  description: string
}

function formatSafeDate(
  value: string | null | undefined,
  pattern: string,
  fallback = "--"
) {
  if (!value) return fallback
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return fallback
  return format(parsed, pattern)
}

function SettingsSkeleton() {
  return (
    <div className="space-y-4 px-4 lg:px-6">
      <Skeleton className="h-32 rounded-2xl" />
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-72 rounded-2xl" />
        ))}
      </div>
    </div>
  )
}

function SectionHeader({ icon: Icon, title, description }: SectionHeaderProps) {
  return (
    <CardHeader className="space-y-3 border-b border-border/70 pb-4">
      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-2xl border bg-primary/5 text-primary shadow-sm">
          <Icon className="size-4.5" />
        </div>
        <div className="space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription className="text-sm leading-6">
            {description}
          </CardDescription>
        </div>
      </div>
    </CardHeader>
  )
}

function validateStoreSettings(
  settings: StoreSettings
): StoreSettingsFormErrors {
  const errors: StoreSettingsFormErrors = {}

  if (!settings.name.trim()) errors.name = "Restaurant name is required."
  if (!settings.address.trim())
    errors.address = "Restaurant address is required."
  if (!settings.location.city.trim()) errors.city = "City is required."
  if (settings.location.latitude === null) {
    errors.latitude = "Latitude is required."
  } else if (!Number.isFinite(settings.location.latitude)) {
    errors.latitude = "Latitude must be a valid number."
  } else if (
    settings.location.latitude < 20 ||
    settings.location.latitude > 27
  ) {
    errors.latitude = "Latitude should be within Bangladesh."
  }
  if (settings.location.longitude === null) {
    errors.longitude = "Longitude is required."
  } else if (!Number.isFinite(settings.location.longitude)) {
    errors.longitude = "Longitude must be a valid number."
  } else if (
    settings.location.longitude < 88 ||
    settings.location.longitude > 93
  ) {
    errors.longitude = "Longitude should be within Bangladesh."
  }
  if (!isValidBangladeshPhone(settings.phone)) {
    errors.phone = "Enter a valid 11-digit restaurant contact number."
  }
  if (
    settings.orderSettings.preparationTimeMinutes < MIN_PREPARATION_TIME_MINUTES ||
    settings.orderSettings.preparationTimeMinutes > MAX_PREPARATION_TIME_MINUTES
  ) {
    errors.preparationTimeMinutes = `Preparation time must be between ${MIN_PREPARATION_TIME_MINUTES} and ${MAX_PREPARATION_TIME_MINUTES} minutes.`
  }

  return errors
}

function validatePayoutMethod(method: PayoutMethod) {
  const errors: Record<string, string> = {}
  const hasAnyValue = Boolean(
    method.accountName.trim() ||
    method.accountNumber.trim() ||
    method.bankName?.trim() ||
    method.branchName?.trim()
  )

  if (!hasAnyValue) return errors

  if (!method.accountName.trim()) {
    errors.accountName = "Account holder name is required."
  }

  if (!method.accountNumber.trim()) {
    errors.accountNumber = "Account number is required."
  } else if (
    method.type === "bkash" &&
    !isValidBangladeshPhone(method.accountNumber)
  ) {
    errors.accountNumber = "Enter a valid 11-digit bKash number."
  }

  if (method.type === "bank") {
    if (!method.bankName?.trim()) errors.bankName = "Bank name is required."
    if (!method.branchName?.trim())
      errors.branchName = "Branch name is required."
  }

  return errors
}

export function StoreSettingsPage() {
  const queryClient = useQueryClient()
  const storeSettings = useAppStore((state) => state.storeSettings)
  const setStoreSettings = useAppStore((state) => state.setStoreSettings)
  const payoutMethod = useAppStore((state) => state.payoutMethod)
  const setPayoutMethod = useAppStore((state) => state.setPayoutMethod)
  const setVerificationModalOpen = useAppStore(
    (state) => state.setVerificationModalOpen
  )
  const setRestaurantOnline = useAppStore((state) => state.setRestaurantOnline)
  const ownerAccount = useAppStore((state) => state.ownerAccount)
  const { isOnline, isUpdating } = useRestaurantStatus()
  const { openingHours } = useOpeningHours()
  const { categories } = useCategories()
  const { vouchers } = usePromotions()
  const { items: menuItems } = useMenuItems()

  const [draft, setDraft] = React.useState(storeSettings)
  const [saved, setSaved] = React.useState(storeSettings)
  const [draftPayoutMethod, setDraftPayoutMethod] = React.useState(payoutMethod)
  const [savedPayoutMethod, setSavedPayoutMethod] = React.useState(payoutMethod)
  const [tagInput, setTagInput] = React.useState("")
  const [isLocating, setIsLocating] = React.useState(false)
  const [uploadingTarget, setUploadingTarget] =
    React.useState<UploadTarget | null>(null)
  const [uploadingDocumentType, setUploadingDocumentType] =
    React.useState<StoreDocumentType | null>(null)
  const setVerificationRequest = useAppStore(
    (state) => state.setVerificationRequest
  )

  const storeSettingsQuery = useOwnerStoreSettingsQuery(
    ownerAccount.isAuthenticated
  )
  const updateStoreSettingsMutation = useUpdateOwnerStoreSettingsMutation()
  const updatePayoutMethodMutation = useUpdateOwnerPayoutMethodMutation()
  const isSaving =
    updateStoreSettingsMutation.isPending ||
    updatePayoutMethodMutation.isPending
  const isBusy =
    isSaving ||
    uploadingTarget !== null ||
    uploadingDocumentType !== null ||
    isLocating

  const isLoading = storeSettingsQuery.isPending

  const isSameStoreSettings = React.useCallback(
    (left: StoreSettings, right: StoreSettings) =>
      JSON.stringify(left) === JSON.stringify(right),
    []
  )

  React.useEffect(() => {
    if (!storeSettingsQuery.data) return

    const mapped = mapOwnerStoreSettings(
      storeSettingsQuery.data as OwnerStoreSettingsResponse,
      storeSettings
    )
    if (!isUpdating) {
      const resolvedOnline = resolveRestaurantOnline(
        storeSettingsQuery.data as OwnerStoreSettingsResponse,
        isOnline
      )

      if (resolvedOnline !== isOnline) {
        setRestaurantOnline(resolvedOnline)
      }
    }

    if (isSameStoreSettings(mapped, storeSettings)) return

    setStoreSettings(mapped)
    setDraft(mapped)
    setSaved(mapped)
  }, [
    isSameStoreSettings,
    storeSettingsQuery.data,
    setDraft,
    setSaved,
    setStoreSettings,
    storeSettings,
    setRestaurantOnline,
    isOnline,
    isUpdating,
  ])

  React.useEffect(() => {
    setDraft(storeSettings)
    setSaved(storeSettings)
  }, [storeSettings])

  React.useEffect(() => {
    setDraftPayoutMethod(payoutMethod)
    setSavedPayoutMethod(payoutMethod)
  }, [payoutMethod])

  const errors = React.useMemo(() => validateStoreSettings(draft), [draft])
  const payoutErrors = React.useMemo(
    () => validatePayoutMethod(draftPayoutMethod),
    [draftPayoutMethod]
  )
  const hasErrors =
    Object.keys(errors).length > 0 || Object.keys(payoutErrors).length > 0
  const storeIsDirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const payoutIsDirty =
    JSON.stringify(draftPayoutMethod) !== JSON.stringify(savedPayoutMethod)
  const isDirty = storeIsDirty || payoutIsDirty

  const openingSummary = React.useMemo(() => {
    const activeDays = openingHours.weeklySchedule.filter(
      (day) => day.isOpen
    ).length
    const firstDay = openingHours.weeklySchedule.find((day) => day.isOpen)
    const firstSlot = firstDay?.timeSlots[0]
    return {
      summary:
        firstDay && firstSlot
          ? `${activeDays}/7 days open, usually ${formatTime12Hour(firstSlot.startTime)} - ${formatTime12Hour(firstSlot.endTime)}`
          : "No opening hours configured yet.",
    }
  }, [openingHours])

  const availablePresetTags = PRESET_TAGS.filter(
    (tag) => !draft.tags.includes(tag)
  )

  function update<K extends keyof StoreSettings>(
    key: K,
    value: StoreSettings[K]
  ) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function updateLocation<K extends keyof StoreSettings["location"]>(
    key: K,
    value: StoreSettings["location"][K]
  ) {
    setDraft((current) => ({
      ...current,
      location: {
        ...current.location,
        [key]: value,
      },
    }))
  }

  function useCurrentCoordinates() {
    if (!navigator.geolocation) {
      toast.error("Location access is not available in this browser.")
      return
    }

    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDraft((current) => ({
          ...current,
          location: {
            ...current.location,
            latitude: Number(position.coords.latitude.toFixed(6)),
            longitude: Number(position.coords.longitude.toFixed(6)),
          },
        }))
        setIsLocating(false)
        toast.success("Coordinates updated from current location.")
      },
      (error) => {
        setIsLocating(false)
        toast.error("Could not read current location.", {
          description:
            error.message || "Allow location permission and try again.",
        })
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    )
  }

  const hasSelectedCoordinates =
    draft.location.latitude !== null && draft.location.longitude !== null

  function addTag(rawValue: string) {
    const nextTag = rawValue.trim()
    if (!nextTag) return
    if (draft.tags.includes(nextTag)) {
      setTagInput("")
      return
    }

    update("tags", [...draft.tags, nextTag])
    setTagInput("")
  }

  function removeTag(tag: string) {
    update(
      "tags",
      draft.tags.filter((currentTag) => currentTag !== tag)
    )
  }

  function applyMappedStoreSettings(
    mapped: StoreSettings,
    response?: OwnerStoreSettingsResponse
  ) {
    setStoreSettings(mapped)
    setDraft(mapped)
    setSaved(mapped)
    if (response) {
      queryClient.setQueryData(["owner", "store-settings"], response)
    }
  }

  async function handleStoreImageUpload(
    target: UploadTarget,
    file: File | null
  ) {
    if (!file) return

    const validation = validateImageFile(file)
    if (!validation.ok) {
      toast.error(validation.title, {
        description: validation.description,
      })
      return
    }

    setUploadingTarget(target)

    try {
      const signature = await api.post<{
        cloudName: string
        folder: string
        timestamp: number
        signature: string
        apiKey: string
        resourceType: string
      }>("/media/upload-signature", {
        folder: "foodbela/owner/store",
        resourceType: "image",
      })

      const formData = new FormData()
      formData.append("file", file)
      formData.append("api_key", signature.apiKey)
      formData.append("timestamp", String(signature.timestamp))
      formData.append("signature", signature.signature)
      formData.append("folder", signature.folder)

      const uploadResponse = await fetch(
        `https://api.cloudinary.com/v1_1/${signature.cloudName}/${signature.resourceType}/upload`,
        {
          method: "POST",
          body: formData,
        }
      )

      if (!uploadResponse.ok) {
        const errorPayload = (await uploadResponse
          .json()
          .catch(() => null)) as { error?: { message?: string } } | null
        throw new Error(errorPayload?.error?.message || "Upload failed")
      }

      const uploaded = (await uploadResponse.json()) as {
        secure_url?: string
      }

      if (!uploaded.secure_url) {
        throw new Error("Upload failed")
      }

      const field = target === "logo" ? "logoUrl" : "coverImageUrl"
      setDraft((current) => ({
        ...current,
        [field]: uploaded.secure_url,
      }))

      toast.success(
        target === "logo" ? "Logo uploaded" : "Cover image uploaded",
        {
          description:
            "Preview updated. Save changes to publish it to your storefront.",
        }
      )
    } catch (error) {
      toast.error("Upload failed", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      })
    } finally {
      setUploadingTarget(null)
    }
  }

  function upsertDocument(document: StoreDocumentAttachment) {
    setDraft((current) => ({
      ...current,
      documents: [
        ...current.documents.filter((item) => item.type !== document.type),
        document,
      ],
    }))
  }

  function removeDocument(type: StoreDocumentType) {
    setDraft((current) => ({
      ...current,
      documents: current.documents.filter((item) => item.type !== type),
    }))
  }

  async function handleDocumentUpload(
    type: StoreDocumentType,
    file: File | null
  ) {
    if (!file) return

    const validation = validateDocumentFile(file)
    if (!validation.ok) {
      toast.error(validation.title, {
        description: validation.description,
      })
      return
    }

    const option = STORE_DOCUMENT_OPTIONS.find((item) => item.type === type)
    setUploadingDocumentType(type)

    try {
      const signature = await api.post<{
        cloudName: string
        folder: string
        timestamp: number
        signature: string
        apiKey: string
        resourceType: string
      }>("/media/upload-signature", {
        folder: "foodbela/owner/documents",
        resourceType: "auto",
      })

      const formData = new FormData()
      formData.append("file", file)
      formData.append("api_key", signature.apiKey)
      formData.append("timestamp", String(signature.timestamp))
      formData.append("signature", signature.signature)
      formData.append("folder", signature.folder)

      const uploadResponse = await fetch(
        `https://api.cloudinary.com/v1_1/${signature.cloudName}/${signature.resourceType}/upload`,
        {
          method: "POST",
          body: formData,
        }
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
        resource_type?: string
      }

      if (!uploaded.secure_url) {
        throw new Error("Upload failed")
      }

      upsertDocument({
        type,
        label: option?.label ?? type,
        url: uploaded.secure_url,
        publicId: uploaded.public_id ?? "",
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        resourceType: uploaded.resource_type ?? signature.resourceType,
        uploadedAt: new Date().toISOString(),
      })

      toast.success(`${option?.label ?? "Document"} uploaded`, {
        description: "Save changes to publish this document to your profile.",
      })
    } catch (error) {
      toast.error("Document upload failed", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      })
    } finally {
      setUploadingDocumentType(null)
    }
  }

  const payoutHasAnyValue = Boolean(
    draftPayoutMethod.accountName.trim() ||
    draftPayoutMethod.accountNumber.trim() ||
    draftPayoutMethod.bankName?.trim() ||
    draftPayoutMethod.branchName?.trim()
  )

  if (isLoading) {
    return <SettingsSkeleton />
  }

  return (
    <div className="space-y-5 px-4 pb-28 lg:px-6">
      <Card className="overflow-hidden rounded-[28px] border-border/70 shadow-sm">
        <div className="relative h-44 bg-slate-100">
          <img
            src={getStoreCoverSrc(draft.coverImageUrl)}
            alt={draft.name}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
          <div className="absolute top-4 left-4">
            <Badge className="rounded-full border border-white/25 bg-white/15 px-3 py-1 text-white backdrop-blur hover:bg-white/15">
              Store Profile
            </Badge>
          </div>
          <div className="absolute right-4 bottom-4">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border bg-background/95 px-3 py-2 text-sm font-medium shadow-sm">
              {uploadingTarget === "cover" ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <ImagePlus className="size-4" />
              )}
              {uploadingTarget === "cover" ? "Uploading..." : "Update Cover"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  void handleStoreImageUpload("cover", file ?? null)
                  event.target.value = ""
                }}
              />
            </label>
          </div>
        </div>

        <CardContent className="flex flex-col gap-5 p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="-mt-14 overflow-hidden rounded-2xl border-4 border-background bg-background shadow-md">
              <img
                src={getStoreLogoSrc(draft.logoUrl)}
                alt={draft.name}
                className="size-24 object-cover"
              />
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-2xl font-semibold">{draft.name}</h2>
                <Badge
                  className={
                    isOnline
                      ? "bg-emerald-600 text-white hover:bg-emerald-600"
                      : "bg-slate-900 text-white hover:bg-slate-900"
                  }
                >
                  {isOnline ? "Open" : "Closed"}
                </Badge>
                <Badge variant="outline" className="rounded-full">
                  {draft.location.city}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {draft.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="rounded-full">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium">
            {uploadingTarget === "logo" ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <ImagePlus className="size-4" />
            )}
            {uploadingTarget === "logo" ? "Uploading..." : "Update Logo"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                void handleStoreImageUpload("logo", file ?? null)
                event.target.value = ""
              }}
            />
          </label>
        </CardContent>
      </Card>

      {draft.enforcement.isRestricted ? (
        <Card className="rounded-[24px] border-rose-200 bg-rose-50/70 shadow-sm">
          <CardContent className="flex flex-col gap-3 p-5 text-rose-950 md:flex-row md:items-start md:justify-between">
            <div className="flex gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                <ShieldAlert className="size-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">
                    Restaurant temporarily restricted
                  </p>
                  <Badge className="bg-rose-600 text-white hover:bg-rose-600">
                    {draft.enforcement.effectiveStatus.replaceAll("_", " ")}
                  </Badge>
                </div>
                <p className="mt-1 text-sm">
                  {draft.enforcement.ownerNote ||
                    "Foodbela is reviewing this restaurant's service quality. New orders and online status are paused during this period."}
                </p>
                {draft.enforcement.reason ? (
                  <p className="mt-2 text-sm text-rose-800">
                    Reason: {draft.enforcement.reason}
                  </p>
                ) : null}
              </div>
            </div>
            {draft.enforcement.expiresAt ? (
              <Badge
                variant="outline"
                className="border-rose-300 bg-white text-rose-800"
              >
                Ends {format(new Date(draft.enforcement.expiresAt), "PPp")}
              </Badge>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <div className="space-y-5">
          <Card className="rounded-[28px] border-border/70 shadow-sm">
            <SectionHeader
              icon={Store}
              title="Basic Information"
              description="Keep your restaurant profile clean, searchable, and customer-friendly."
            />
            <CardContent className="space-y-5 p-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">Restaurant Name</label>
                <Input
                  value={draft.name}
                  onChange={(event) => update("name", event.target.value)}
                />
                {errors.name ? (
                  <p className="text-sm text-destructive">{errors.name}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Restaurant Contact Number
                </label>
                <Input
                  value={draft.phone}
                  onChange={(event) =>
                    update(
                      "phone",
                      sanitizeBangladeshPhoneInput(event.target.value)
                    )
                  }
                  inputMode="numeric"
                  maxLength={11}
                  placeholder={formatBangladeshPhonePlaceholder()}
                />
                {errors.phone ? (
                  <p className="text-sm text-destructive">{errors.phone}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Riders use this number for pickup and order-related contact.
                    Owner login phone stays separate.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Cuisine Type</label>
                <Input
                  value={draft.cuisineType}
                  onChange={(event) =>
                    update("cuisineType", event.target.value)
                  }
                  placeholder="Fast Food, Chinese, Cafe"
                />
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium">Tags</label>
                <div className="rounded-3xl border bg-muted/15 p-4">
                  <div className="flex min-h-10 flex-wrap gap-2">
                    {draft.tags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary transition hover:bg-primary/15"
                      >
                        <Tag className="size-3.5" />
                        {tag}
                        <X className="size-3.5" />
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <Input
                      value={tagInput}
                      onChange={(event) => setTagInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === ",") {
                          event.preventDefault()
                          addTag(tagInput)
                        }
                      }}
                      placeholder="Type a tag and press Enter"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => addTag(tagInput)}
                    >
                      Add Tag
                    </Button>
                  </div>
                  <div className="mt-4">
                    <div className="mb-2 text-[11px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
                      Suggested Tags
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {availablePresetTags.map((tag) => (
                        <Button
                          key={tag}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => addTag(tag)}
                        >
                          {tag}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-border/70 shadow-sm">
            <SectionHeader
              icon={MapPin}
              title="Location & Coordinates"
              description="Keep the restaurant address and map point accurate for service-area matching, rider pickup, and storefront trust."
            />
            <CardContent className="space-y-5 p-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Restaurant Address
                </label>
                <Input
                  value={draft.address}
                  onChange={(event) => update("address", event.target.value)}
                  placeholder="House, road, area, landmark"
                />
                {errors.address ? (
                  <p className="text-sm text-destructive">{errors.address}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Use the pickup address customers and riders should
                    recognize.
                  </p>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">City</label>
                  <Input
                    value={draft.location.city}
                    onChange={(event) =>
                      updateLocation("city", event.target.value)
                    }
                    placeholder="Netrokona"
                  />
                  {errors.city ? (
                    <p className="text-sm text-destructive">{errors.city}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Coordinates Status
                  </label>
                  <div className="flex h-11 items-center rounded-xl border bg-muted/20 px-3 text-sm text-muted-foreground">
                    {draft.location.latitude !== null &&
                    draft.location.longitude !== null
                      ? `${draft.location.latitude.toFixed(6)}, ${draft.location.longitude.toFixed(6)}`
                      : "Coordinates not set"}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <label className="text-sm font-medium">Map Location</label>
                    <p className="text-xs text-muted-foreground">
                      Click on the map to choose the restaurant pickup point.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={useCurrentCoordinates}
                      disabled={isLocating}
                    >
                      {isLocating ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <MapPin className="size-4" />
                      )}
                      Use Current Location
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={isLocating || !hasSelectedCoordinates}
                      onClick={() => {
                        updateLocation("latitude", null)
                        updateLocation("longitude", null)
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                </div>

                <LocationPickerMap
                  latitude={draft.location.latitude}
                  longitude={draft.location.longitude}
                  onSelect={(latitude, longitude) => {
                    setDraft((current) => ({
                      ...current,
                      location: {
                        ...current.location,
                        latitude,
                        longitude,
                      },
                    }))
                  }}
                />
                {errors.latitude ? (
                  <p className="text-sm text-destructive">{errors.latitude}</p>
                ) : errors.longitude ? (
                  <p className="text-sm text-destructive">{errors.longitude}</p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-border/70 shadow-sm">
            <SectionHeader
              icon={Clock3}
              title="Opening Hours"
              description="Review your weekly schedule and jump into full schedule management when needed."
            />
            <CardContent className="space-y-4 p-6">
              <div className="rounded-3xl border bg-muted/15 p-4">
                <div className="font-medium">Weekly Schedule Summary</div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {openingSummary.summary}
                </div>
              </div>
              <Button variant="outline" className="gap-2" asChild>
                <Link to="/hours">
                  Manage Opening Hours
                  <ChevronRight className="size-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-border/70 shadow-sm">
            <SectionHeader
              icon={Settings2}
              title="Order Settings"
              description="Set how quickly the kitchen receives and prepares incoming orders."
            />
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center justify-between rounded-3xl border bg-muted/15 px-4 py-3">
                <div>
                  <div className="font-medium">Accept Orders Automatically</div>
                  <div className="text-sm text-muted-foreground">
                    Disabled by platform policy. Owners must manually accept
                    each order.
                  </div>
                </div>
                <Switch
                  checked={false}
                  disabled
                  aria-label="Automatic order acceptance is disabled"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Default Preparation Time
                  <span className="ml-1 text-muted-foreground">(minutes)</span>
                </label>
                <Select
                  value={String(draft.orderSettings.preparationTimeMinutes)}
                  onValueChange={(value) =>
                    update("orderSettings", {
                      ...draft.orderSettings,
                      preparationTimeMinutes: Number(value),
                    })
                  }
                >
                  <SelectTrigger
                    className="h-11 w-full rounded-xl px-3"
                    size="default"
                  >
                    <SelectValue placeholder="Select preparation time" />
                  </SelectTrigger>
                  <SelectContent>
                    {PREPARATION_TIME_OPTIONS.map((minutes) => (
                      <SelectItem key={minutes} value={String(minutes)}>
                        {minutes} minutes
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.preparationTimeMinutes ? (
                  <p className="text-sm text-destructive">
                    {errors.preparationTimeMinutes}
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-border/70 shadow-sm">
            <SectionHeader
              icon={Smartphone}
              title="Payout Setup"
              description="Set where Foodbela should send your earnings. bKash stays first for faster setup."
            />
            <CardContent className="space-y-4 p-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">Payout Method</label>
                <Select
                  value={draftPayoutMethod.type}
                  onValueChange={(value: "bank" | "bkash") =>
                    setDraftPayoutMethod((current) => ({
                      ...current,
                      type: value,
                      accountNumber:
                        value === "bkash"
                          ? sanitizeBangladeshPhoneInput(current.accountNumber)
                          : current.accountNumber,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose payout method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bkash">bKash</SelectItem>
                    <SelectItem value="bank">Bank</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Account Holder Name
                  </label>
                  <Input
                    value={draftPayoutMethod.accountName}
                    onChange={(event) =>
                      setDraftPayoutMethod((current) => ({
                        ...current,
                        accountName: event.target.value,
                      }))
                    }
                    placeholder="Meet Point"
                  />
                  {payoutErrors.accountName ? (
                    <p className="text-sm text-destructive">
                      {payoutErrors.accountName}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {draftPayoutMethod.type === "bkash"
                      ? "bKash Number"
                      : "Account Number"}
                  </label>
                  <Input
                    value={draftPayoutMethod.accountNumber}
                    onChange={(event) =>
                      setDraftPayoutMethod((current) => ({
                        ...current,
                        accountNumber:
                          current.type === "bkash"
                            ? sanitizeBangladeshPhoneInput(event.target.value)
                            : event.target.value,
                      }))
                    }
                    inputMode={
                      draftPayoutMethod.type === "bkash" ? "numeric" : undefined
                    }
                    maxLength={
                      draftPayoutMethod.type === "bkash" ? 11 : undefined
                    }
                    placeholder={
                      draftPayoutMethod.type === "bkash"
                        ? formatBangladeshPhonePlaceholder()
                        : "000123456789"
                    }
                  />
                  {payoutErrors.accountNumber ? (
                    <p className="text-sm text-destructive">
                      {payoutErrors.accountNumber}
                    </p>
                  ) : null}
                </div>
              </div>

              {draftPayoutMethod.type === "bank" ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Bank Name</label>
                    <Input
                      value={draftPayoutMethod.bankName ?? ""}
                      onChange={(event) =>
                        setDraftPayoutMethod((current) => ({
                          ...current,
                          bankName: event.target.value,
                        }))
                      }
                      placeholder="Eastern Bank PLC"
                    />
                    {payoutErrors.bankName ? (
                      <p className="text-sm text-destructive">
                        {payoutErrors.bankName}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Branch Name</label>
                    <Input
                      value={draftPayoutMethod.branchName ?? ""}
                      onChange={(event) =>
                        setDraftPayoutMethod((current) => ({
                          ...current,
                          branchName: event.target.value,
                        }))
                      }
                      placeholder="Netrokona Branch"
                    />
                    {payoutErrors.branchName ? (
                      <p className="text-sm text-destructive">
                        {payoutErrors.branchName}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="rounded-3xl border bg-muted/15 p-4 text-sm text-muted-foreground">
                {payoutMethod.pendingVerificationStatus === "admin_pending"
                  ? `New bKash number ${payoutMethod.pendingAccountNumber} is OTP verified and waiting for admin approval.`
                  : payoutMethod.pendingVerificationStatus === "rejected"
                    ? `Last payout number request was rejected${payoutMethod.pendingAdminNote ? `: ${payoutMethod.pendingAdminNote}` : "."}`
                    : draftPayoutMethod.type === "bkash" &&
                        sanitizeBangladeshPhoneInput(
                          draftPayoutMethod.accountNumber
                        ) &&
                        sanitizeBangladeshPhoneInput(
                          draftPayoutMethod.accountNumber
                        ) !== ownerAccount.phone
                      ? "A new bKash number needs OTP verification first, then admin approval before activation."
                      : "A completed payout setup helps your store profile reach 100% and avoids settlement delays after approval."}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-border/70 shadow-sm">
            <SectionHeader
              icon={FileCheck2}
              title="Business Documents"
              description="Attach any one available document now, or add more later when admin asks for verification."
            />
            <CardContent className="space-y-4 p-6">
              <div className="rounded-2xl border bg-muted/15 p-4 text-sm">
                <span className="font-medium">Documents attached:</span>
                <div className="mt-3 flex flex-wrap gap-2">
                  {STORE_DOCUMENT_OPTIONS.map((option) => {
                    const attached = draft.documents.some(
                      (document) => document.type === option.type
                    )
                    return (
                      <span
                        key={option.type}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold",
                          attached
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-border bg-background text-muted-foreground"
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-3.5 items-center justify-center rounded-[4px] border",
                            attached
                              ? "border-emerald-500 bg-emerald-500"
                              : "border-muted-foreground/40 bg-background"
                          )}
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

              <div className="grid gap-3 md:grid-cols-2">
                {STORE_DOCUMENT_OPTIONS.map((option) => {
                  const document = draft.documents.find(
                    (item) => item.type === option.type
                  )
                  const isUploading = uploadingDocumentType === option.type
                  return (
                    <div
                      key={option.type}
                      className="rounded-2xl border bg-background p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <FileText className="size-4 text-primary" />
                            <p className="font-semibold">{option.label}</p>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {option.helper}
                          </p>
                        </div>
                        {document ? (
                          <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                            Attached
                          </Badge>
                        ) : (
                          <Badge variant="outline">Optional</Badge>
                        )}
                      </div>

                      {document ? (
                        <a
                          href={document.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 block truncate rounded-xl bg-muted/40 px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
                        >
                          {document.fileName || document.url}
                        </a>
                      ) : null}

                      <div className="mt-4 flex flex-wrap gap-2">
                        <label
                          className={cn(
                            "inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition hover:bg-muted/50",
                            isUploading && "pointer-events-none opacity-70"
                          )}
                        >
                          {isUploading ? (
                            <LoaderCircle className="size-4 animate-spin" />
                          ) : (
                            <FileUp className="size-4" />
                          )}
                          {document ? "Replace" : "Upload"}
                          <input
                            type="file"
                            accept={DOCUMENT_UPLOAD_ACCEPT}
                            className="hidden"
                            disabled={isUploading}
                            onChange={(event) => {
                              const file = event.target.files?.[0]
                              void handleDocumentUpload(option.type, file ?? null)
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
            </CardContent>
          </Card>
        </div>

        <div className="xl:sticky xl:top-20">
          <Card className="rounded-[28px] border-border/70 shadow-sm">
            <SectionHeader
              icon={Smartphone}
              title="Mobile Preview"
              description="See how your storefront information will look on a customer's phone."
            />
            <CardContent className="p-6">
              <StorefrontMobilePreview
                settings={{
                  ...draft,
                  orderSettings: {
                    ...draft.orderSettings,
                    autoAcceptOrders: false,
                  },
                }}
                isOnline={isOnline}
                vouchers={vouchers}
                menuItems={menuItems}
                categories={categories}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="fixed right-0 bottom-0 left-0 z-40 md:left-[var(--sidebar-width)]">
        <div className="border-t bg-background/96 px-4 py-3 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:px-6">
          <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 rounded-2xl border bg-background px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="text-sm text-muted-foreground">
              Last saved{" "}
              <span className="font-medium text-foreground">
                {formatSafeDate(saved.updatedAt, "dd MMM yyyy, hh:mm a")}
              </span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                disabled={!isDirty || isBusy}
                onClick={() => {
                  setDraft(saved)
                  setDraftPayoutMethod(savedPayoutMethod)
                  setTagInput("")
                  toast.info("Changes reverted", {
                    description: "Your unsaved edits were discarded.",
                  })
                }}
              >
                Reset
              </Button>
              <Button
                disabled={!isDirty || isBusy}
                onClick={() => {
                  if (hasErrors) {
                    toast.error("Please fix the highlighted fields first.", {
                      description:
                        "Store details and payout information need attention before saving.",
                    })
                    return
                  }
                  if (payoutIsDirty && !payoutHasAnyValue) {
                    toast.error("Payout information is incomplete.", {
                      description:
                        "Add payout details or revert changes before saving.",
                    })
                    return
                  }
                  const cuisineTypes = draft.cuisineType
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean)

                  if (storeIsDirty) {
                    updateStoreSettingsMutation.mutate(
                      {
                        name: draft.name.trim(),
                        phone: sanitizeBangladeshPhoneInput(draft.phone),
                        preparationTimeMinutes:
                          draft.orderSettings.preparationTimeMinutes,
                        autoAcceptOrders: false,
                        cuisineTypes,
                        tags: draft.tags,
                        documents: draft.documents.map((document) => ({
                          type: document.type,
                          label: document.label,
                          url: document.url,
                          publicId: document.publicId ?? "",
                          fileName: document.fileName ?? "",
                          fileType: document.fileType ?? "",
                          resourceType: document.resourceType ?? "auto",
                          uploadedAt: document.uploadedAt ?? null,
                        })),
                        logo: { url: draft.logoUrl },
                        coverImage: { url: draft.coverImageUrl },
                        address: draft.address.trim(),
                        city: draft.location.city.trim(),
                        latitude: draft.location.latitude,
                        longitude: draft.location.longitude,
                      },
                      {
                        onSuccess: (response) => {
                          const mapped = mapOwnerStoreSettings(
                            response as OwnerStoreSettingsResponse,
                            draft
                          )
                          applyMappedStoreSettings(
                            mapped,
                            response as OwnerStoreSettingsResponse
                          )
                        },
                        onError: (error) => {
                          toast.error("Unable to update store settings.", {
                            description:
                              error instanceof Error
                                ? error.message
                                : "Please try again.",
                          })
                        },
                      }
                    )
                  }

                  if (payoutIsDirty && payoutHasAnyValue) {
                    updatePayoutMethodMutation.mutate(
                      draftPayoutMethod.type === "bkash"
                        ? {
                            type: "bkash",
                            accountName: draftPayoutMethod.accountName.trim(),
                            accountNumber: sanitizeBangladeshPhoneInput(
                              draftPayoutMethod.accountNumber
                            ),
                          }
                        : {
                            type: "bank",
                            accountName: draftPayoutMethod.accountName.trim(),
                            accountNumber:
                              draftPayoutMethod.accountNumber.trim(),
                            bankName: draftPayoutMethod.bankName?.trim() ?? "",
                            branchName:
                              draftPayoutMethod.branchName?.trim() ?? "",
                          },
                      {
                        onSuccess: (response) => {
                          const payload = response as OwnerPayoutMethodResponse
                          const nextMethod = {
                            ...mapOwnerPayoutMethod(
                              payload.payoutMethod,
                              savedPayoutMethod
                            ),
                            pendingAccountName: payload.verificationSessionId
                              ? draftPayoutMethod.accountName.trim()
                              : "",
                          }
                          setPayoutMethod(nextMethod)
                          setSavedPayoutMethod(nextMethod)

                          if (payload.verificationSessionId) {
                            setVerificationRequest({
                              verificationSessionId:
                                payload.verificationSessionId,
                              purpose: "owner_payout_verify",
                              phone:
                                nextMethod.pendingAccountNumber ||
                                nextMethod.accountNumber,
                              referenceId: payload.payoutMethod._id,
                              pendingPassword: "",
                              resendAvailableInSeconds: resolveOtpResendSeconds(
                                payload.resendAvailableInSeconds
                              ),
                            })
                            setVerificationModalOpen(true)
                            toast.info(
                              "Verify your bKash number to finish payout setup.",
                              {
                                description:
                                  "We kept the new wallet number pending until OTP verification is complete.",
                              }
                            )
                            return
                          }

                          toast.success("Store settings updated", {
                            description:
                              "Your restaurant profile, payout setup, and storefront settings are now saved.",
                            action: {
                              label: "View Hours",
                              onClick: () => {
                                window.location.assign("/hours")
                              },
                            },
                          })
                        },
                        onError: (error) => {
                          toast.error("Unable to update payout method.", {
                            description:
                              error instanceof Error
                                ? error.message
                                : "Please try again.",
                          })
                        },
                      }
                    )
                  } else if (storeIsDirty) {
                    toast.success("Store settings updated", {
                      description:
                        "Your restaurant profile and storefront settings are now saved.",
                    })
                  }
                }}
              >
                {isBusy ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                {uploadingTarget
                  ? "Uploading image..."
                  : isSaving
                    ? "Saving..."
                    : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
