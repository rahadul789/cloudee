import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useSearchParams } from "react-router-dom"
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCcw,
  RotateCcw,
  Search,
  TicketPercent,
} from "lucide-react"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"
import { toast } from "sonner"

import { useDebouncedValue } from "@/hooks/use-debounced-value"
import {
  getAdminZoneScope,
  subscribeAdminZoneScope,
} from "@/lib/admin-zone-scope"
import {
  archiveAdminVoucher,
  createAdminVoucher,
  getAdminRestaurantPromotionTargets,
  listAdminCustomers,
  listAdminRestaurants,
  listAdminVouchers,
  restoreAdminVoucher,
  sendAdminVoucherPushCampaign,
  updateAdminVoucher,
  type AdminPromotionTargets,
  type AdminCustomerSummary,
  type AdminRestaurantSummary,
  type AdminRestaurantVoucher,
  type AdminVoucherLifecycle,
  type AdminVoucherMode,
  type AdminVoucherPayload,
  type AdminVoucherStatus,
  type AdminVoucherType,
} from "@/lib/admin-api"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type VoucherTypeFilter = "all" | "flat" | "percentage" | "free-delivery"
type VoucherSort =
  | "newestUpdated"
  | "highestUses"
  | "highestDiscount"
  | "endingSoon"
type VoucherFormType = "flat" | "percentage" | "free_delivery"
type VoucherFormState = {
  scopeType: "restaurant" | "selected_restaurants" | "all_restaurants"
  restaurantId: string
  selectedRestaurantIds: string[]
  audienceType: "all_users" | "new_users" | "returning_users" | "selected_users"
  selectedCustomerIds: string[]
  customerGroupKey: string
  displayShowOnHome: boolean
  displayShowInOfferStrip: boolean
  displayPlacement: "top" | "after_banner" | "offers_row"
  displayVariant: "chip" | "block" | "image" | "carousel"
  displayPosition: string
  displayTitle: string
  displaySubtitle: string
  displayImageUrl: string
  displayCarouselImageUrls: string
  displayOpenInModal: boolean
  displayCtaLabel: string
  displayCtaPath: string
  displayBackgroundColor: string
  displayTextColor: string
  displayAccentColor: string
  pushEnabled: boolean
  pushTitle: string
  pushBody: string
  pushPath: string
  name: string
  code: string
  surface: "checkout" | "menu_markdown"
  mode: AdminVoucherMode
  type: VoucherFormType
  fundedBy: "owner" | "platform" | "shared"
  ownerSharePercent: string
  stackingRule: "exclusive" | "stackable"
  priority: string
  discountValue: string
  maxDiscountAmount: string
  minimumOrderAmount: string
  minItemPrice: string
  maxTotalUses: string
  maxUsesPerUser: string
  allowRepeatUsage: boolean
  maxTotalDiscountBudget: string
  cuisineTypes: string
  status: AdminVoucherStatus
  applicability: "all" | "categories" | "items"
  categoryIds: string[]
  itemIds: string[]
  startsAt: string
  endsAt: string
}

type PersonalOfferPrefillTarget = {
  customerId: string
  customerName?: string
  customerPhone?: string
  requestedCode?: string
}

const pageSizeOptions = [10, 20, 50]

function formatCurrency(value?: number | null) {
  return `Tk ${Math.round(Number.isFinite(value ?? 0) ? (value ?? 0) : 0).toLocaleString()}`
}

function formatDate(value?: string | null) {
  if (!value) return "N/A"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "N/A"
  return date.toLocaleString()
}

function getLocalDateTimeValue(value = new Date()) {
  const date = new Date(value.getTime() - value.getTimezoneOffset() * 60000)
  return date.toISOString().slice(0, 16)
}

function toInputDate(value?: string | null) {
  if (!value) return getLocalDateTimeValue()
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? getLocalDateTimeValue()
    : getLocalDateTimeValue(date)
}

function getVoucherLifecycleStatus(voucher: AdminRestaurantVoucher) {
  if (voucher.archivedAt) return "Archived"
  if (voucher.status === "Draft") return "Draft"
  const now = Date.now()
  const startsAt = new Date(voucher.startsAt).getTime()
  const endsAt = new Date(voucher.endsAt).getTime()
  if (Number.isFinite(startsAt) && startsAt > now) return "Scheduled"
  if (Number.isFinite(endsAt) && endsAt < now) return "Expired"
  return "Active"
}

function normalizeVoucherType(type: AdminVoucherType) {
  return type === "free_delivery" ? "free-delivery" : type
}

function getVoucherTypeLabel(type: AdminVoucherType | VoucherFormType) {
  const normalized = normalizeVoucherType(type as AdminVoucherType)
  if (normalized === "free-delivery") return "Free delivery"
  if (normalized === "percentage") return "Percentage"
  if (normalized === "bogo") return "BOGO"
  if (normalized === "threshold-discount") return "Threshold"
  return "Flat"
}

function getVoucherModeLabel(mode: AdminVoucherMode) {
  return mode === "coupon" ? "Coupon code" : "Auto applied"
}

function getVoucherFundingLabel(value: string) {
  if (value === "platform") return "Platform funded"
  if (value === "shared") return "Shared funded"
  return "Owner funded"
}

function formatVoucherDiscount(
  voucher: Pick<AdminRestaurantVoucher, "type" | "discountValue">
) {
  const type = normalizeVoucherType(voucher.type)
  if (type === "free-delivery") return "Delivery fee waived"
  if (type === "bogo") return "BOGO"
  if (type === "percentage") return `${voucher.discountValue ?? 0}% off`
  return `${voucher.discountValue ?? 0}tk off`
}

function getLifecycleBadgeClass(status: string) {
  if (status === "Active")
    return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (status === "Scheduled") return "border-sky-200 bg-sky-50 text-sky-700"
  if (status === "Expired") return "border-muted bg-muted text-muted-foreground"
  if (status === "Archived")
    return "border-slate-200 bg-slate-50 text-slate-700"
  return "border-amber-200 bg-amber-50 text-amber-700"
}

function getInitialForm(
  restaurants: AdminRestaurantSummary[],
  personalOfferTarget?: PersonalOfferPrefillTarget | null
): VoucherFormState {
  const now = new Date()
  const endsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const targetName = personalOfferTarget?.customerName?.trim() || "customer"
  const requestedCode =
    personalOfferTarget?.requestedCode?.trim().toUpperCase() || ""
  const targetCodeSuffix =
    personalOfferTarget?.customerPhone?.replace(/\D/g, "").slice(-4) ||
    personalOfferTarget?.customerId.slice(-4).toUpperCase() ||
    ""
  const hasPersonalOfferTarget = Boolean(personalOfferTarget?.customerId)
  return {
    restaurantId: restaurants[0]?.id ?? "",
    scopeType: hasPersonalOfferTarget ? "all_restaurants" : "restaurant",
    selectedRestaurantIds: [],
    audienceType: hasPersonalOfferTarget ? "selected_users" : "all_users",
    selectedCustomerIds: personalOfferTarget?.customerId
      ? [personalOfferTarget.customerId]
      : [],
    customerGroupKey: "",
    displayShowOnHome: false,
    displayShowInOfferStrip: true,
    displayPlacement: "offers_row",
    displayVariant: "chip",
    displayPosition: "0",
    displayTitle: hasPersonalOfferTarget ? "A special offer for you" : "",
    displaySubtitle: hasPersonalOfferTarget
      ? "Thanks for being a loyal Foodbela customer."
      : "",
    displayImageUrl: "",
    displayCarouselImageUrls: "",
    displayOpenInModal: false,
    displayCtaLabel: "Order now",
    displayCtaPath: hasPersonalOfferTarget ? "/offers" : "/(tabs)/browse",
    displayBackgroundColor: "#FFF0F6",
    displayTextColor: "#3F2432",
    displayAccentColor: "#FF5C93",
    pushEnabled: hasPersonalOfferTarget,
    pushTitle: hasPersonalOfferTarget ? "My offer is ready" : "",
    pushBody: hasPersonalOfferTarget
      ? "A personal voucher has been added."
      : "",
    pushPath: hasPersonalOfferTarget ? "/offers" : "/(tabs)/browse",
    name: hasPersonalOfferTarget ? `My offer - ${targetName}` : "",
    code: hasPersonalOfferTarget
      ? requestedCode || (targetCodeSuffix ? `CUSTOM${targetCodeSuffix}` : "")
      : "",
    surface: "checkout",
    mode: "coupon",
    type: "flat",
    fundedBy: "platform",
    ownerSharePercent: "50",
    stackingRule: "exclusive",
    priority: "0",
    discountValue: hasPersonalOfferTarget ? "50" : "",
    maxDiscountAmount: "",
    minimumOrderAmount: hasPersonalOfferTarget ? "300" : "0",
    minItemPrice: "",
    maxTotalUses: "",
    maxUsesPerUser: "1",
    allowRepeatUsage: false,
    maxTotalDiscountBudget: "",
    cuisineTypes: "",
    status: hasPersonalOfferTarget ? "Active" : "Draft",
    applicability: "all",
    categoryIds: [],
    itemIds: [],
    startsAt: getLocalDateTimeValue(now),
    endsAt: getLocalDateTimeValue(endsAt),
  }
}

function getFormFromVoucher(voucher: AdminRestaurantVoucher): VoucherFormState {
  return {
    restaurantId: voucher.restaurantId,
    scopeType: voucher.scopeType ?? "restaurant",
    selectedRestaurantIds: voucher.selectedRestaurantIds ?? [],
    audienceType: voucher.audienceType ?? "all_users",
    selectedCustomerIds: voucher.selectedCustomerIds ?? [],
    customerGroupKey: voucher.customerGroupKey ?? "",
    displayShowOnHome: voucher.display?.showOnHome ?? false,
    displayShowInOfferStrip: voucher.display?.showInOfferStrip ?? true,
    displayPlacement: voucher.display?.placement ?? "offers_row",
    displayVariant: voucher.display?.variant ?? "chip",
    displayPosition: `${voucher.display?.position ?? 0}`,
    displayTitle: voucher.display?.title ?? "",
    displaySubtitle: voucher.display?.subtitle ?? "",
    displayImageUrl: voucher.display?.imageUrl ?? "",
    displayCarouselImageUrls:
      voucher.display?.carouselImageUrls?.join("\n") ?? "",
    displayOpenInModal: voucher.display?.openInModal ?? false,
    displayCtaLabel: voucher.display?.ctaLabel ?? "Order now",
    displayCtaPath: voucher.display?.ctaPath ?? "/(tabs)/browse",
    displayBackgroundColor: voucher.display?.backgroundColor ?? "#FFF0F6",
    displayTextColor: voucher.display?.textColor ?? "#3F2432",
    displayAccentColor: voucher.display?.accentColor ?? "#FF5C93",
    pushEnabled: voucher.pushCampaign?.enabled ?? false,
    pushTitle: voucher.pushCampaign?.title ?? "",
    pushBody: voucher.pushCampaign?.body ?? "",
    pushPath: voucher.pushCampaign?.path ?? "/(tabs)/browse",
    name: voucher.name,
    code: voucher.code ?? "",
    surface: voucher.surface === "menu_markdown" ? "menu_markdown" : "checkout",
    mode: voucher.mode,
    type:
      voucher.type === "free-delivery"
        ? "free_delivery"
        : (voucher.type as VoucherFormType),
    fundedBy: voucher.fundedBy,
    ownerSharePercent: `${voucher.ownerSharePercent ?? 50}`,
    stackingRule: voucher.stackingRule,
    priority: `${voucher.priority ?? 0}`,
    discountValue:
      voucher.type === "free_delivery" ? "" : `${voucher.discountValue ?? ""}`,
    maxDiscountAmount: voucher.maxDiscountAmount
      ? `${voucher.maxDiscountAmount}`
      : "",
    minimumOrderAmount: `${voucher.minimumOrderAmount ?? 0}`,
    minItemPrice: voucher.minItemPrice ? `${voucher.minItemPrice}` : "",
    maxTotalUses: voucher.maxTotalUses ? `${voucher.maxTotalUses}` : "",
    maxUsesPerUser: `${voucher.maxUsesPerUser || 1}`,
    allowRepeatUsage: voucher.allowRepeatUsage,
    maxTotalDiscountBudget: voucher.maxTotalDiscountBudget
      ? `${voucher.maxTotalDiscountBudget}`
      : "",
    cuisineTypes: (voucher.cuisineTypes ?? []).join(", "),
    status: voucher.status,
    applicability: voucher.applicability,
    categoryIds: voucher.categoryIds ?? [],
    itemIds: voucher.itemIds ?? [],
    startsAt: toInputDate(voucher.startsAt),
    endsAt: toInputDate(voucher.endsAt),
  }
}

function toPayload(
  form: VoucherFormState,
  includeRestaurant: boolean
): AdminVoucherPayload {
  const payload: AdminVoucherPayload = {
    fundedBy: form.fundedBy,
    scopeType: form.scopeType,
    selectedRestaurantIds:
      form.scopeType === "selected_restaurants"
        ? form.selectedRestaurantIds
        : [],
    audienceType: form.audienceType,
    selectedCustomerIds:
      form.audienceType === "selected_users" ? form.selectedCustomerIds : [],
    customerGroupKey: form.customerGroupKey,
    display: {
      showOnHome: form.displayShowOnHome,
      showInOfferStrip: form.displayShowInOfferStrip,
      placement: form.displayPlacement,
      variant: form.displayVariant,
      position: Number(form.displayPosition || 0),
      title: form.displayTitle,
      subtitle: form.displaySubtitle,
      imageUrl: form.displayImageUrl,
      carouselImageUrls: form.displayCarouselImageUrls
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
      openInModal: form.displayOpenInModal,
      ctaLabel: form.displayCtaLabel,
      ctaPath: form.displayCtaPath,
      backgroundColor: form.displayBackgroundColor,
      textColor: form.displayTextColor,
      accentColor: form.displayAccentColor,
    },
    pushCampaign: {
      enabled: form.pushEnabled,
      title: form.pushTitle,
      body: form.pushBody,
      path: form.pushPath,
    },
    ownerSharePercent:
      form.fundedBy === "shared"
        ? Number(form.ownerSharePercent || 50)
        : undefined,
    platformSharePercent:
      form.fundedBy === "shared"
        ? 100 - Number(form.ownerSharePercent || 50)
        : undefined,
    stackingRule: form.stackingRule,
    priority: Number(form.priority || 0),
    surface: form.surface,
    mode: form.mode,
    type: form.type,
    name: form.name.trim(),
    code: form.mode === "coupon" ? form.code.trim().toUpperCase() : "",
    discountValue:
      form.type === "free_delivery" ? 0 : Number(form.discountValue || 0),
    maxDiscountAmount: form.maxDiscountAmount.trim()
      ? Number(form.maxDiscountAmount)
      : 0,
    minimumOrderAmount: Number(form.minimumOrderAmount || 0),
    minItemPrice: form.minItemPrice.trim() ? Number(form.minItemPrice) : 0,
    maxTotalUses: form.maxTotalUses.trim() ? Number(form.maxTotalUses) : 0,
    maxUsesPerUser: Number(form.maxUsesPerUser || 1),
    allowRepeatUsage: form.allowRepeatUsage,
    maxTotalDiscountBudget: form.maxTotalDiscountBudget.trim()
      ? Number(form.maxTotalDiscountBudget)
      : 0,
    cuisineTypes: form.cuisineTypes
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    status: form.status,
    applicability: form.applicability,
    categoryIds: form.applicability === "categories" ? form.categoryIds : [],
    itemIds: form.applicability === "items" ? form.itemIds : [],
    startsAt: new Date(form.startsAt).toISOString(),
    endsAt: new Date(form.endsAt).toISOString(),
  }
  if (includeRestaurant && form.scopeType === "restaurant")
    payload.restaurantId = form.restaurantId
  return payload
}

function getScopeLabel(
  voucher: Pick<
    AdminRestaurantVoucher,
    "scopeType" | "selectedRestaurants" | "restaurant"
  >
) {
  if (voucher.scopeType === "all_restaurants") return "All restaurants"
  if (voucher.scopeType === "selected_restaurants") {
    return `${voucher.selectedRestaurants?.length ?? 0} restaurants`
  }
  return voucher.restaurant?.name ?? "Single restaurant"
}

function getAudienceLabel(value?: string) {
  if (value === "selected_users") return "Selected users"
  if (value === "new_users") return "New users"
  if (value === "returning_users") return "Returning users"
  return "All users"
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}

function StatCard({
  label,
  value,
  helper,
}: {
  label: string
  value: React.ReactNode
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

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-xs text-destructive">{message}</p>
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

function VoucherFormSheet({
  open,
  onOpenChange,
  voucher,
  restaurants,
  existingCodes,
  existingVouchers,
  personalOfferTarget,
  isSubmitting,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  voucher: AdminRestaurantVoucher | null
  restaurants: AdminRestaurantSummary[]
  existingCodes: string[]
  existingVouchers: AdminRestaurantVoucher[]
  personalOfferTarget?: PersonalOfferPrefillTarget | null
  isSubmitting: boolean
  onSubmit: (payload: AdminVoucherPayload) => void
}) {
  const [form, setForm] = React.useState<VoucherFormState>(() =>
    getInitialForm(restaurants, personalOfferTarget)
  )
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [adminZoneScope, setAdminZoneScope] = React.useState(() =>
    getAdminZoneScope()
  )
  const targetsQuery = useQuery({
    queryKey: ["admin-restaurant-promotion-targets", form.restaurantId],
    queryFn: () => getAdminRestaurantPromotionTargets(form.restaurantId),
    enabled: open && Boolean(form.restaurantId),
  })
  const customersQuery = useQuery({
    queryKey: ["admin-customers", "promotion-targets"],
    queryFn: () =>
      listAdminCustomers({ page: 1, pageSize: 50, sortBy: "highestSpend" }),
    enabled: open,
  })
  const targets: AdminPromotionTargets = targetsQuery.data ?? {
    categories: [],
    items: [],
  }
  const customers: AdminCustomerSummary[] = React.useMemo(() => {
    const items = customersQuery.data?.items ?? []
    if (
      !personalOfferTarget?.customerId ||
      items.some((customer) => customer.id === personalOfferTarget.customerId)
    ) {
      return items
    }

    return [
      {
        id: personalOfferTarget.customerId,
        fullName: personalOfferTarget.customerName || "Selected customer",
        phone: personalOfferTarget.customerPhone || "",
        email: "",
        status: "active",
        customerTier: "repeat",
        authProviders: [],
        savedLocationsCount: 0,
        serviceArea: null,
        lastKnownLocation: null,
        hasPushToken: false,
        unreadNotifications: 0,
        totalOrders: 0,
        liveOrders: 0,
        deliveredOrders: 10,
        deliveredSpend: 0,
        lastOrderAt: null,
        lastLoginAt: null,
        createdAt: null,
        updatedAt: null,
        requestStatus: null,
        requestType: null,
        requestRequestedAt: null,
      },
      ...items,
    ]
  }, [customersQuery.data?.items, personalOfferTarget])
  const conflictPreview = React.useMemo(() => {
    const start = new Date(form.startsAt).getTime()
    const end = new Date(form.endsAt).getTime()
    if (!Number.isFinite(start) || !Number.isFinite(end)) return []
    return existingVouchers
      .filter(
        (item) =>
          item._id !== voucher?._id &&
          !item.archivedAt &&
          item.status === "Active"
      )
      .filter((item) => {
        if (form.scopeType === "restaurant")
          return item.restaurantId === form.restaurantId
        if (form.scopeType === "all_restaurants")
          return item.scopeType === "all_restaurants"
        if (form.scopeType === "selected_restaurants") {
          return item.selectedRestaurantIds?.some((id) =>
            form.selectedRestaurantIds.includes(id)
          )
        }
        return false
      })
      .filter((item) => {
        const itemStart = new Date(item.startsAt).getTime()
        const itemEnd = new Date(item.endsAt).getTime()
        return (
          Number.isFinite(itemStart) &&
          Number.isFinite(itemEnd) &&
          itemStart <= end &&
          itemEnd >= start
        )
      })
      .slice(0, 4)
  }, [
    existingVouchers,
    form.endsAt,
    form.restaurantId,
    form.scopeType,
    form.selectedRestaurantIds,
    form.startsAt,
    voucher?._id,
  ])

  React.useEffect(() => {
    if (!open) return
    setForm(
      voucher
        ? getFormFromVoucher(voucher)
        : getInitialForm(restaurants, personalOfferTarget)
    )
    setErrors({})
  }, [open, personalOfferTarget, restaurants, voucher])

  React.useEffect(
    () => subscribeAdminZoneScope(() => setAdminZoneScope(getAdminZoneScope())),
    []
  )

  function update<K extends keyof VoucherFormState>(
    key: K,
    value: VoucherFormState[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function toggleSelection(
    key:
      | "categoryIds"
      | "itemIds"
      | "selectedRestaurantIds"
      | "selectedCustomerIds",
    id: string,
    checked: boolean
  ) {
    setForm((current) => ({
      ...current,
      [key]: checked
        ? [...current[key], id]
        : current[key].filter((itemId) => itemId !== id),
    }))
  }

  function validate() {
    const nextErrors: Record<string, string> = {}
    const normalizedCode = form.code.trim().toUpperCase()
    const maxUsesPerUser = Number(form.maxUsesPerUser || 0)
    const validatingMarkdown = form.surface === "menu_markdown"

    if (form.scopeType === "restaurant" && !form.restaurantId) {
      nextErrors.restaurantId = "Restaurant is required."
    }
    if (
      form.scopeType === "selected_restaurants" &&
      form.selectedRestaurantIds.length === 0
    ) {
      nextErrors.selectedRestaurantIds = "Select at least one restaurant."
    }
    if (
      form.audienceType === "selected_users" &&
      form.selectedCustomerIds.length === 0
    ) {
      nextErrors.selectedCustomerIds = "Select at least one customer."
    }
    if (!form.name.trim()) nextErrors.name = "Offer name is required."
    if (form.mode === "coupon" && !normalizedCode) {
      nextErrors.code = "Coupon code is required."
    } else if (
      form.mode === "coupon" &&
      normalizedCode !== voucher?.code &&
      existingCodes.includes(normalizedCode)
    ) {
      nextErrors.code = "This coupon code already exists."
    }
    if (form.type !== "free_delivery") {
      if (!form.discountValue.trim() || Number(form.discountValue) <= 0) {
        nextErrors.discountValue = "Discount must be greater than 0."
      } else if (
        form.type === "percentage" &&
        Number(form.discountValue) > 100
      ) {
        nextErrors.discountValue = "Percentage cannot exceed 100."
      }
    }
    if (
      form.type === "percentage" &&
      form.maxDiscountAmount.trim() &&
      Number(form.maxDiscountAmount) <= 0
    ) {
      nextErrors.maxDiscountAmount = "Max discount cap must be greater than 0."
    }
    if (form.fundedBy === "shared") {
      const ownerShare = Number(form.ownerSharePercent)
      if (!Number.isFinite(ownerShare) || ownerShare < 0 || ownerShare > 100) {
        nextErrors.ownerSharePercent = "Owner share must be between 0 and 100."
      }
    }
    if (form.fundedBy === "owner" && voucher?.createdByType !== "owner") {
      nextErrors.fundedBy =
        "Admin-created offers must be platform-funded or shared-funded."
    }
    if (Number(form.minimumOrderAmount || 0) < 0) {
      nextErrors.minimumOrderAmount = "Minimum order cannot be negative."
    }
    if (!validatingMarkdown) {
      // Markdowns allow 0 = unlimited per-user reuse; checkout vouchers need at least 1.
      if (!Number.isFinite(maxUsesPerUser) || maxUsesPerUser < 1) {
        nextErrors.maxUsesPerUser = "Max uses per user must be at least 1."
      }
      if (!form.allowRepeatUsage && maxUsesPerUser > 1) {
        nextErrors.maxUsesPerUser =
          "Turn on repeat usage before allowing more than 1 use."
      }
    }
    if (
      form.maxTotalUses.trim() &&
      Number(form.maxTotalUses) < maxUsesPerUser
    ) {
      nextErrors.maxTotalUses = "Total uses cannot be lower than per-user uses."
    }
    if (!form.startsAt) nextErrors.startsAt = "Start date is required."
    if (!form.endsAt) nextErrors.endsAt = "End date is required."
    if (
      form.startsAt &&
      form.endsAt &&
      new Date(form.startsAt) >= new Date(form.endsAt)
    ) {
      nextErrors.endsAt = "End date must be after start date."
    }
    if (
      form.scopeType === "restaurant" &&
      form.applicability === "categories" &&
      form.categoryIds.length === 0
    ) {
      nextErrors.categoryIds = "Select at least one category."
    }
    if (
      form.scopeType === "restaurant" &&
      form.applicability === "items" &&
      form.itemIds.length === 0
    ) {
      nextErrors.itemIds = "Select at least one menu item."
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const isMarkdown = form.surface === "menu_markdown"

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!validate()) return
    const payload = toPayload(form, !voucher)
    if (
      !voucher &&
      !personalOfferTarget &&
      adminZoneScope.type !== "all" &&
      form.scopeType === "all_restaurants"
    ) {
      payload.scopeType = "selected_restaurants"
      payload.selectedRestaurantIds = restaurants.map(
        (restaurant) => restaurant.id
      )
    }
    onSubmit(payload)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-3xl! md:max-w-6xl!">
        <div className="border-b px-6 py-5">
          <SheetHeader>
            <SheetTitle>{voucher ? "Edit offer" : "Create offer"}</SheetTitle>
            <SheetDescription>
              Discount, eligibility, funding, and priority controls only.
            </SheetDescription>
          </SheetHeader>
        </div>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-2 lg:col-span-2">
                <Label>Offer surface</Label>
                <Select
                  value={form.surface}
                  disabled={Boolean(voucher)}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      surface: value as VoucherFormState["surface"],
                      ...(value === "menu_markdown"
                        ? {
                            fundedBy: "platform" as const,
                            mode: "auto" as const,
                            type:
                              current.type === "free_delivery"
                                ? ("flat" as const)
                                : current.type,
                            code: "",
                            stackingRule: "stackable" as const,
                            maxUsesPerUser: "0",
                            allowRepeatUsage: true,
                          }
                        : {}),
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="checkout">
                      Checkout voucher (coupon / auto, applied at checkout)
                    </SelectItem>
                    <SelectItem value="menu_markdown">
                      Menu price markdown (platform-funded, strike-through on
                      menu)
                    </SelectItem>
                  </SelectContent>
                </Select>
                {isMarkdown ? (
                  <p className="text-xs text-muted-foreground">
                    Platform-funded markdown shown on the customer menu. The
                    restaurant is paid the full listed price; the platform
                    absorbs the discount.
                  </p>
                ) : null}
              </div>
              <div className="space-y-2 lg:col-span-2">
                <Label>Campaign scope</Label>
                <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  Area zone:{" "}
                  <span className="font-medium text-foreground">
                    {adminZoneScope.label}
                  </span>
                  .
                  {adminZoneScope.type === "all"
                    ? " All restaurant targets are available."
                    : " Restaurant and user targets are limited to this selected area."}
                </div>
                <Select
                  value={form.scopeType}
                  disabled={Boolean(voucher)}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      scopeType: value as VoucherFormState["scopeType"],
                      categoryIds: [],
                      itemIds: [],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="restaurant">
                      Single restaurant
                    </SelectItem>
                    <SelectItem value="selected_restaurants">
                      Selected restaurants
                    </SelectItem>
                    <SelectItem value="all_restaurants">
                      {adminZoneScope.type === "all"
                        ? "All restaurants"
                        : "All restaurants in selected area"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.scopeType === "restaurant" ? (
                <div className="space-y-2 lg:col-span-2">
                  <Label>Restaurant</Label>
                  <Select
                    value={form.restaurantId}
                    disabled={Boolean(voucher)}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        restaurantId: value,
                        categoryIds: [],
                        itemIds: [],
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select restaurant" />
                    </SelectTrigger>
                    <SelectContent>
                      {restaurants.map((restaurant) => (
                        <SelectItem key={restaurant.id} value={restaurant.id}>
                          {restaurant.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError message={errors.restaurantId} />
                </div>
              ) : null}

              {form.scopeType === "selected_restaurants" ? (
                <div className="space-y-2 lg:col-span-2">
                  <TargetCheckboxList
                    title="Restaurants"
                    emptyText="No restaurants found."
                    options={restaurants.map((restaurant) => ({
                      id: restaurant.id,
                      name: restaurant.name,
                      helper:
                        restaurant.city ||
                        restaurant.address ||
                        restaurant.ownerName,
                    }))}
                    selectedIds={form.selectedRestaurantIds}
                    onToggle={(id, checked) =>
                      toggleSelection("selectedRestaurantIds", id, checked)
                    }
                  />
                  <FieldError message={errors.selectedRestaurantIds} />
                </div>
              ) : null}

              {!isMarkdown ? (
                <div className="space-y-2 lg:col-span-2">
                  <Label>Audience</Label>
                  <Select
                    value={form.audienceType}
                    onValueChange={(value) =>
                      update(
                        "audienceType",
                        value as VoucherFormState["audienceType"]
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_users">All users</SelectItem>
                      <SelectItem value="new_users">New users only</SelectItem>
                      <SelectItem value="returning_users">
                        Returning users
                      </SelectItem>
                      <SelectItem value="selected_users">
                        Specific users
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {!isMarkdown && form.audienceType === "selected_users" ? (
                <div className="space-y-2 lg:col-span-2">
                  <TargetCheckboxList
                    title="Specific users"
                    emptyText={
                      customersQuery.isLoading
                        ? "Loading users..."
                        : "No customers found."
                    }
                    options={customers.map((customer) => ({
                      id: customer.id,
                      name: customer.fullName || customer.phone || "Customer",
                      helper: `${customer.phone || customer.email || "No contact"} - ${customer.deliveredOrders} delivered`,
                    }))}
                    selectedIds={form.selectedCustomerIds}
                    onToggle={(id, checked) =>
                      toggleSelection("selectedCustomerIds", id, checked)
                    }
                  />
                  <FieldError message={errors.selectedCustomerIds} />
                </div>
              ) : null}

              <div className="space-y-2">
                <Label>Offer name</Label>
                <Input
                  value={form.name}
                  onChange={(event) => update("name", event.target.value)}
                />
                <FieldError message={errors.name} />
              </div>
              {!isMarkdown ? (
                <>
                  <div className="space-y-2">
                    <Label>
                      Code{" "}
                      <span className="text-xs text-muted-foreground">
                        (only for coupon)
                      </span>
                    </Label>
                    <Input
                      value={form.code}
                      disabled={form.mode !== "coupon"}
                      onChange={(event) =>
                        update("code", event.target.value.toUpperCase())
                      }
                    />
                    <FieldError message={errors.code} />
                  </div>

                  <div className="space-y-2">
                    <Label>Mode</Label>
                    <Select
                      value={form.mode}
                      onValueChange={(value) =>
                        update("mode", value as AdminVoucherMode)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="coupon">Coupon code</SelectItem>
                        <SelectItem value="auto">Auto applied</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : null}
              <div className="space-y-2">
                <Label>Discount type</Label>
                <Select
                  value={form.type}
                  onValueChange={(value) =>
                    update("type", value as VoucherFormType)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flat">Flat</SelectItem>
                    <SelectItem value="percentage">Percentage</SelectItem>
                    {!isMarkdown ? (
                      <SelectItem value="free_delivery">
                        Free delivery
                      </SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>
                  Discount value{" "}
                  <span className="text-xs text-muted-foreground">
                    (optional for free delivery)
                  </span>
                </Label>
                <Input
                  type="number"
                  min="0"
                  value={form.discountValue}
                  disabled={form.type === "free_delivery"}
                  onChange={(event) =>
                    update("discountValue", event.target.value)
                  }
                />
                <FieldError message={errors.discountValue} />
              </div>
              <div className="space-y-2">
                <Label>
                  Max discount cap{" "}
                  <span className="text-xs text-muted-foreground">
                    (optional)
                  </span>
                </Label>
                <Input
                  type="number"
                  min="0"
                  value={form.maxDiscountAmount}
                  disabled={form.type !== "percentage"}
                  onChange={(event) =>
                    update("maxDiscountAmount", event.target.value)
                  }
                />
                <FieldError message={errors.maxDiscountAmount} />
              </div>

              {isMarkdown ? (
                <>
                  <div className="space-y-2">
                    <Label>
                      Min item price{" "}
                      <span className="text-xs text-muted-foreground">
                        (Tk, optional)
                      </span>
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="e.g. 250 — only items at/above this price"
                      value={form.minItemPrice}
                      onChange={(event) =>
                        update("minItemPrice", event.target.value)
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Evaluated per variant on the (base + variant) price. Blank
                      = every price.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>
                      Total discount budget{" "}
                      <span className="text-xs text-muted-foreground">
                        (Tk, optional)
                      </span>
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="caps total platform spend"
                      value={form.maxTotalDiscountBudget}
                      onChange={(event) =>
                        update("maxTotalDiscountBudget", event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2 lg:col-span-2">
                    <Label>
                      Cuisine targeting{" "}
                      <span className="text-xs text-muted-foreground">
                        (optional, comma separated)
                      </span>
                    </Label>
                    <Input
                      placeholder="e.g. Biryani, Pizza — blank = every cuisine"
                      value={form.cuisineTypes}
                      onChange={(event) =>
                        update("cuisineTypes", event.target.value)
                      }
                    />
                  </div>
                </>
              ) : null}

              {!isMarkdown ? (
                <div className="space-y-2">
                  <Label>Minimum order</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.minimumOrderAmount}
                    onChange={(event) =>
                      update("minimumOrderAmount", event.target.value)
                    }
                  />
                  <FieldError message={errors.minimumOrderAmount} />
                </div>
              ) : null}

              {!isMarkdown ? (
                <div className="space-y-2">
                  <Label>Funding</Label>
                  <Select
                    value={form.fundedBy}
                    onValueChange={(value) =>
                      update("fundedBy", value as VoucherFormState["fundedBy"])
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {voucher?.createdByType === "owner" ? (
                        <SelectItem value="owner">Owner funded</SelectItem>
                      ) : null}
                      <SelectItem value="platform">Platform funded</SelectItem>
                      <SelectItem value="shared">Shared funded</SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldError message={errors.fundedBy} />
                </div>
              ) : null}
              {form.fundedBy === "shared" ? (
                <div className="space-y-2">
                  <Label>Owner share %</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={form.ownerSharePercent}
                    onChange={(event) =>
                      update("ownerSharePercent", event.target.value)
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Platform share: {100 - Number(form.ownerSharePercent || 0)}%
                  </p>
                  <FieldError message={errors.ownerSharePercent} />
                </div>
              ) : null}
              <div className="space-y-2">
                <Label>Stacking rule</Label>
                <Select
                  value={form.stackingRule}
                  onValueChange={(value) =>
                    update(
                      "stackingRule",
                      value as VoucherFormState["stackingRule"]
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exclusive">Exclusive</SelectItem>
                    <SelectItem value="stackable">Stackable</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Priority</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.priority}
                  onChange={(event) => update("priority", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(value) =>
                    update("status", value as AdminVoucherStatus)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="Active">Active</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>
                  Max total uses{" "}
                  <span className="text-xs text-muted-foreground">
                    (optional)
                  </span>
                </Label>
                <Input
                  type="number"
                  min="0"
                  value={form.maxTotalUses}
                  onChange={(event) =>
                    update("maxTotalUses", event.target.value)
                  }
                />
                <FieldError message={errors.maxTotalUses} />
              </div>
              <div className="space-y-2">
                <Label>Max uses per user</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.maxUsesPerUser}
                  onChange={(event) =>
                    update("maxUsesPerUser", event.target.value)
                  }
                />
                <FieldError message={errors.maxUsesPerUser} />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3 lg:col-span-2">
                <div>
                  <Label>Allow repeat usage</Label>
                  <p className="text-xs text-muted-foreground">
                    Turn on when one customer can redeem more than once.
                  </p>
                </div>
                <Switch
                  checked={form.allowRepeatUsage}
                  onCheckedChange={(checked) =>
                    update("allowRepeatUsage", checked)
                  }
                />
              </div>

              <div className="space-y-3 rounded-lg border bg-muted/20 p-4 lg:col-span-2">
                <Label>Conflict preview</Label>
                {conflictPreview.length ? (
                  <div className="grid gap-2">
                    {conflictPreview.map((item) => (
                      <div
                        key={item._id}
                        className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm"
                      >
                        <span className="font-medium">{item.name}</span>
                        <span className="text-muted-foreground">
                          {item.stackingRule} / priority {item.priority}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No overlapping active campaign found for this scope and date
                    window.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Start date</Label>
                <Input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(event) => update("startsAt", event.target.value)}
                />
                <FieldError message={errors.startsAt} />
              </div>
              <div className="space-y-2">
                <Label>End date</Label>
                <Input
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(event) => update("endsAt", event.target.value)}
                />
                <FieldError message={errors.endsAt} />
              </div>

              <div className="space-y-3 lg:col-span-2">
                <Label>Applicability</Label>
                <Select
                  value={form.applicability}
                  onValueChange={(value) =>
                    update(
                      "applicability",
                      value as VoucherFormState["applicability"]
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All eligible items</SelectItem>
                    <SelectItem value="categories">
                      Specific categories
                    </SelectItem>
                    <SelectItem value="items">Specific menu items</SelectItem>
                  </SelectContent>
                </Select>
                {form.scopeType !== "restaurant" ? (
                  <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                    Platform campaigns apply to all eligible items in the
                    selected scope.
                  </div>
                ) : null}
                {form.scopeType === "restaurant" &&
                form.applicability === "categories" ? (
                  <div className="space-y-2">
                    <TargetCheckboxList
                      title="Categories"
                      emptyText={
                        targetsQuery.isLoading
                          ? "Loading categories..."
                          : "No active categories found for this restaurant."
                      }
                      options={targets.categories}
                      selectedIds={form.categoryIds}
                      onToggle={(id, checked) =>
                        toggleSelection("categoryIds", id, checked)
                      }
                    />
                    <FieldError message={errors.categoryIds} />
                  </div>
                ) : null}
                {form.scopeType === "restaurant" &&
                form.applicability === "items" ? (
                  <div className="space-y-2">
                    <TargetCheckboxList
                      title="Menu items"
                      emptyText={
                        targetsQuery.isLoading
                          ? "Loading menu items..."
                          : "No active menu items found for this restaurant."
                      }
                      options={targets.items.map((item) => ({
                        id: item.id,
                        name: item.name,
                        helper: `${formatCurrency(item.basePrice)} - ${item.availability}`,
                      }))}
                      selectedIds={form.itemIds}
                      onToggle={(id, checked) =>
                        toggleSelection("itemIds", id, checked)
                      }
                    />
                    <FieldError message={errors.itemIds} />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 border-t px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              {voucher ? "Save changes" : "Create offer"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

function VoucherDetailsSheet({
  voucher,
  onOpenChange,
  onEdit,
}: {
  voucher: AdminRestaurantVoucher | null
  onOpenChange: (open: boolean) => void
  onEdit: (voucher: AdminRestaurantVoucher) => void
}) {
  if (!voucher) return null
  const lifecycle = getVoucherLifecycleStatus(voucher)
  const categoryNames = voucher.targetCategories?.map((item) => item.name) ?? []
  const itemNames = voucher.targetItems?.map((item) => item.name) ?? []
  const usageRows = voucher.analytics.usageRows ?? []
  const appliedCount =
    voucher.analytics.appliedCount ?? voucher.analytics.totalUses
  const deliveredCount =
    voucher.analytics.deliveredCount ??
    voucher.analytics.totalOrdersUsingVoucher
  const usageChartConfig = {
    uses: {
      label: "Uses",
      color: "hsl(var(--chart-1))",
    },
    discount: {
      label: "Discount",
      color: "hsl(var(--chart-2))",
    },
  }

  return (
    <Sheet open={Boolean(voucher)} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-3xl! md:max-w-6xl!">
        <div className="border-b px-6 py-5">
          <SheetHeader>
            <SheetTitle>{voucher.name}</SheetTitle>
            <SheetDescription>
              {getScopeLabel(voucher)} -{" "}
              {getAudienceLabel(voucher.audienceType)} -{" "}
              {getVoucherModeLabel(voucher.mode)} -{" "}
              {formatVoucherDiscount(voucher)}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={getLifecycleBadgeClass(lifecycle)}
            >
              {lifecycle}
            </Badge>
            <Badge variant="secondary">
              {getVoucherTypeLabel(voucher.type)}
            </Badge>
            <Badge variant="outline">
              {getVoucherFundingLabel(voucher.fundedBy)}
            </Badge>
            {voucher.audienceType === "selected_users" ? (
              <Badge className="bg-fuchsia-100 text-fuchsia-700">
                Personalized offer
              </Badge>
            ) : null}
            <Badge variant="outline">Created by {voucher.createdByType}</Badge>
            <Button
              size="sm"
              className="ml-auto"
              onClick={() => onEdit(voucher)}
            >
              <Pencil className="size-4" />
              Edit
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="flex h-auto w-full flex-wrap justify-start">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="usage">Uses</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                <Card>
                  <CardHeader>
                    <CardTitle>Offer rules</CardTitle>
                    <CardDescription>
                      Same rule model used in restaurant-owner promotions.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 text-sm">
                    <InfoRow label="Scope" value={getScopeLabel(voucher)} />
                    <InfoRow
                      label="Audience"
                      value={getAudienceLabel(voucher.audienceType)}
                    />
                    <InfoRow
                      label="Restaurant"
                      value={
                        voucher.restaurant?.name ??
                        voucher.restaurantId ??
                        "Platform campaign"
                      }
                    />
                    <InfoRow
                      label="Code"
                      value={voucher.code || "Auto applied"}
                    />
                    <InfoRow
                      label="Mode"
                      value={getVoucherModeLabel(voucher.mode)}
                    />
                    <InfoRow
                      label="Type"
                      value={getVoucherTypeLabel(voucher.type)}
                    />
                    <InfoRow
                      label="Discount"
                      value={formatVoucherDiscount(voucher)}
                    />
                    <InfoRow
                      label="Max discount cap"
                      value={
                        voucher.maxDiscountAmount
                          ? formatCurrency(voucher.maxDiscountAmount)
                          : "No cap"
                      }
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
                          : "Once"
                      }
                    />
                    <InfoRow
                      label="Funding"
                      value={getVoucherFundingLabel(voucher.fundedBy)}
                    />
                    <InfoRow
                      label="Funding split"
                      value={`${voucher.ownerSharePercent ?? 100}% owner / ${voucher.platformSharePercent ?? 0}% platform`}
                    />
                    <InfoRow label="Stacking" value={voucher.stackingRule} />
                    <InfoRow label="Priority" value={voucher.priority} />
                    <InfoRow label="Status" value={voucher.status} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Finance & usage</CardTitle>
                    <CardDescription>
                      Delivered-order revenue and redemption analytics.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 text-sm">
                    <InfoRow
                      label="Total uses"
                      value={voucher.analytics.totalUses}
                    />
                    <InfoRow
                      label="Unique users"
                      value={voucher.analytics.uniqueUsers}
                    />
                    <InfoRow
                      label="Repeat usage"
                      value={voucher.analytics.repeatUsage}
                    />
                    <InfoRow
                      label="Orders using voucher"
                      value={voucher.analytics.totalOrdersUsingVoucher}
                    />
                    <InfoRow
                      label="Revenue generated"
                      value={formatCurrency(voucher.analytics.revenueGenerated)}
                    />
                    <InfoRow
                      label="Discount given"
                      value={formatCurrency(
                        voucher.analytics.totalDiscountGiven
                      )}
                    />
                    <InfoRow
                      label="Delivery cost covered"
                      value={formatCurrency(
                        voucher.analytics.totalDeliveryCostCovered
                      )}
                    />
                    <InfoRow
                      label="Remaining usage"
                      value={voucher.analytics.remainingUsage ?? "Unlimited"}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Timeline</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3 text-sm">
                    <InfoRow
                      label="Starts"
                      value={formatDate(voucher.startsAt)}
                    />
                    <InfoRow label="Ends" value={formatDate(voucher.endsAt)} />
                    <InfoRow
                      label="Created"
                      value={formatDate(voucher.createdAt)}
                    />
                    <InfoRow
                      label="Updated"
                      value={formatDate(voucher.updatedAt)}
                    />
                    <InfoRow
                      label="Archived"
                      value={
                        voucher.archivedAt
                          ? formatDate(voucher.archivedAt)
                          : "No"
                      }
                    />
                    <InfoRow
                      label="Creator id"
                      value={voucher.createdById || "N/A"}
                    />
                    {voucher.archiveReason ? (
                      <InfoRow
                        label="Archive reason"
                        value={voucher.archiveReason}
                      />
                    ) : null}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Applicability</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <InfoRow label="Applies to" value={voucher.applicability} />
                    {voucher.applicability === "all" ? (
                      <div className="rounded-lg border bg-muted/30 p-3 text-muted-foreground">
                        Applies to all eligible items in this campaign scope.
                      </div>
                    ) : null}
                    {voucher.applicability === "categories" ? (
                      <div className="flex flex-wrap gap-2">
                        {(categoryNames.length
                          ? categoryNames
                          : voucher.categoryIds
                        ).map((name) => (
                          <Badge key={name} variant="outline">
                            {name}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                    {voucher.applicability === "items" ? (
                      <div className="flex flex-wrap gap-2">
                        {(itemNames.length ? itemNames : voucher.itemIds).map(
                          (name) => (
                            <Badge key={name} variant="outline">
                              {name}
                            </Badge>
                          )
                        )}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                <Card className="xl:col-span-2">
                  <CardHeader>
                    <CardTitle>Last 7 days</CardTitle>
                    <CardDescription>
                      Daily usage and delivered-order discount impact.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-hidden rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Day</TableHead>
                            <TableHead>Uses</TableHead>
                            <TableHead className="text-right">
                              Discount
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {voucher.analytics.points.map((point) => (
                            <TableRow key={point.label}>
                              <TableCell>{point.label}</TableCell>
                              <TableCell>{point.uses}</TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(point.discount)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                <Card className="xl:col-span-2">
                  <CardHeader>
                    <CardTitle>Audit trail</CardTitle>
                    <CardDescription>
                      Recent admin/owner changes for dispute visibility.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {voucher.recentAudits?.length ? (
                      <div className="overflow-hidden rounded-lg border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Action</TableHead>
                              <TableHead>Actor</TableHead>
                              <TableHead>Note</TableHead>
                              <TableHead className="text-right">When</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {voucher.recentAudits.map((audit) => (
                              <TableRow key={audit.id}>
                                <TableCell className="capitalize">
                                  {audit.action}
                                </TableCell>
                                <TableCell>
                                  {audit.actorType} {audit.actorId}
                                </TableCell>
                                <TableCell>{audit.note || "N/A"}</TableCell>
                                <TableCell className="text-right">
                                  {formatDate(audit.createdAt)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                        No audit entries yet.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="usage" className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="Applied"
                  value={appliedCount}
                  helper="Non-released redemption holds"
                />
                <StatCard
                  label="Delivered"
                  value={deliveredCount}
                  helper="Delivered orders counted in revenue"
                />
                <StatCard
                  label="Discount"
                  value={formatCurrency(voucher.analytics.totalDiscountGiven)}
                  helper="Delivered-order discount impact"
                />
                <StatCard
                  label="Revenue"
                  value={formatCurrency(voucher.analytics.revenueGenerated)}
                  helper="Delivered order totals"
                />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Usage graph</CardTitle>
                  <CardDescription>
                    Daily voucher claims and delivered-order discount.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={usageChartConfig}
                    className="h-[280px] w-full"
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

              <Card>
                <CardHeader>
                  <CardTitle>Voucher uses</CardTitle>
                  <CardDescription>
                    Latest applied orders, status, funding split, and released
                    rows.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {usageRows.length ? (
                    <div className="overflow-hidden rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Order</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Applied</TableHead>
                            <TableHead className="text-right">
                              Discount
                            </TableHead>
                            <TableHead className="text-right">Owner</TableHead>
                            <TableHead className="text-right">
                              Platform
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {usageRows.map((row) => (
                            <TableRow key={row.id}>
                              <TableCell>
                                <div className="font-medium">
                                  {row.orderNumber || row.orderId || "Order"}
                                </div>
                                {row.released ? (
                                  <div className="text-xs text-muted-foreground">
                                    Released
                                  </div>
                                ) : null}
                              </TableCell>
                              <TableCell>
                                <div>{row.customerName || "Customer"}</div>
                                <div className="text-xs text-muted-foreground">
                                  {row.customerPhone || row.customerId || "N/A"}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">
                                  {row.status || "N/A"}
                                </Badge>
                              </TableCell>
                              <TableCell>{formatDate(row.appliedAt)}</TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(row.discountAmount)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(row.ownerDiscountCost)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(row.platformDiscountCost)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                      No usage rows yet.
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function CouponsPage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = React.useState("")
  const [lifecycle, setLifecycle] = React.useState<AdminVoucherLifecycle>("all")
  const [mode, setMode] = React.useState<"all" | AdminVoucherMode>("all")
  const [type, setType] = React.useState<VoucherTypeFilter>("all")
  const [audienceFilter, setAudienceFilter] = React.useState<
    "all" | "personalized"
  >("all")
  const [scopeType, setScopeType] = React.useState<
    "all" | VoucherFormState["scopeType"]
  >("all")
  const [surface, setSurface] = React.useState<
    "all" | "checkout" | "menu_markdown"
  >("all")
  const [restaurantId, setRestaurantId] = React.useState("all")
  const [sortBy, setSortBy] = React.useState<VoucherSort>("newestUpdated")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)
  const [selectedVoucher, setSelectedVoucher] =
    React.useState<AdminRestaurantVoucher | null>(null)
  const [editingVoucher, setEditingVoucher] =
    React.useState<AdminRestaurantVoucher | null>(null)
  const [personalOfferTarget, setPersonalOfferTarget] =
    React.useState<PersonalOfferPrefillTarget | null>(null)
  const [formOpen, setFormOpen] = React.useState(false)
  const debouncedSearch = useDebouncedValue(search, 350)

  const restaurantsQuery = useQuery({
    queryKey: ["admin-restaurants", "coupon-form"],
    queryFn: () =>
      listAdminRestaurants({ page: 1, pageSize: 50, sortBy: "newestUpdated" }),
  })

  const vouchersQuery = useQuery({
    queryKey: [
      "admin-vouchers",
      {
        search: debouncedSearch,
        lifecycle,
        mode,
        type,
        scopeType,
        surface,
        restaurantId,
        sortBy,
        page,
        pageSize,
      },
    ],
    queryFn: () =>
      listAdminVouchers({
        restaurantId: restaurantId === "all" ? undefined : restaurantId,
        scopeType,
        surface,
        search: debouncedSearch,
        lifecycle,
        mode,
        type,
        sortBy,
        page,
        pageSize,
      }),
  })

  const createMutation = useMutation({
    mutationFn: createAdminVoucher,
    onSuccess: async (createdVoucher) => {
      toast.success("Offer created")
      if (personalOfferTarget && createdVoucher.pushCampaign?.enabled) {
        try {
          const pushResult = await sendAdminVoucherPushCampaign(
            createdVoucher._id
          )
          toast.success(
            pushResult.sentCount > 0
              ? "Customer push sent"
              : "Offer saved. In-app notification created."
          )
        } catch (error) {
          toast.warning(
            error instanceof Error
              ? error.message
              : "Offer saved, but push could not be sent."
          )
        }
      }
      setFormOpen(false)
      setPersonalOfferTarget(null)
      void queryClient.invalidateQueries({ queryKey: ["admin-vouchers"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-customers"] })
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Failed to create offer"
      ),
  })

  const updateMutation = useMutation({
    mutationFn: ({
      voucherId,
      payload,
    }: {
      voucherId: string
      payload: AdminVoucherPayload
    }) => updateAdminVoucher(voucherId, payload),
    onSuccess: () => {
      toast.success("Offer updated")
      setFormOpen(false)
      setEditingVoucher(null)
      setSelectedVoucher(null)
      void queryClient.invalidateQueries({ queryKey: ["admin-vouchers"] })
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Failed to update offer"
      ),
  })

  const archiveMutation = useMutation({
    mutationFn: ({
      voucherId,
      reason,
    }: {
      voucherId: string
      reason?: string
    }) => archiveAdminVoucher(voucherId, reason),
    onSuccess: () => {
      toast.success("Promotion archived")
      setSelectedVoucher(null)
      void queryClient.invalidateQueries({ queryKey: ["admin-vouchers"] })
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Failed to archive promotion"
      ),
  })

  const restoreMutation = useMutation({
    mutationFn: restoreAdminVoucher,
    onSuccess: () => {
      toast.success("Promotion restored")
      setSelectedVoucher(null)
      void queryClient.invalidateQueries({ queryKey: ["admin-vouchers"] })
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Failed to restore promotion"
      ),
  })

  const vouchers = (vouchersQuery.data?.items ?? []).filter((voucher) =>
    audienceFilter === "personalized"
      ? voucher.audienceType === "selected_users"
      : true
  )
  const restaurants = restaurantsQuery.data?.items ?? []
  const pageCount = vouchersQuery.data?.pageCount ?? 1
  const safePage = Math.min(page, pageCount)
  const activeCount = vouchers.filter(
    (voucher) => getVoucherLifecycleStatus(voucher) === "Active"
  ).length
  const deliveredRevenue = vouchers.reduce(
    (sum, voucher) => sum + voucher.analytics.revenueGenerated,
    0
  )
  const discountGiven = vouchers.reduce(
    (sum, voucher) => sum + voucher.analytics.totalDiscountGiven,
    0
  )
  const platformFunded = vouchers.filter(
    (voucher) => voucher.fundedBy === "platform"
  ).length
  const existingCodes = vouchers.map((voucher) => voucher.code).filter(Boolean)

  React.useEffect(() => {
    setPage(1)
  }, [
    debouncedSearch,
    lifecycle,
    mode,
    type,
    scopeType,
    surface,
    restaurantId,
    sortBy,
    pageSize,
  ])

  React.useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  React.useEffect(() => {
    const customerId = searchParams.get("customerId")?.trim()
    if (!customerId || searchParams.get("personalOffer") !== "1") return

    setPersonalOfferTarget({
      customerId,
      customerName: searchParams.get("customerName")?.trim() || "",
      customerPhone: searchParams.get("customerPhone")?.trim() || "",
      requestedCode: searchParams.get("requestedCode")?.trim() || "",
    })
    setAudienceFilter("personalized")
    setEditingVoucher(null)
    setFormOpen(true)
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])

  function resetFilters() {
    setSearch("")
    setLifecycle("all")
    setMode("all")
    setType("all")
    setAudienceFilter("all")
    setScopeType("all")
    setSurface("all")
    setRestaurantId("all")
    setSortBy("newestUpdated")
    setPage(1)
  }

  function openCreate() {
    setPersonalOfferTarget(null)
    setEditingVoucher(null)
    setFormOpen(true)
  }

  function openEdit(voucher: AdminRestaurantVoucher) {
    setPersonalOfferTarget(null)
    setEditingVoucher(voucher)
    setFormOpen(true)
  }

  function archiveVoucherWithWarning(voucher: AdminRestaurantVoucher) {
    const lifecycleStatus = getVoucherLifecycleStatus(voucher)
    // Surface every relevant caution — an active AND personalized offer must show
    // BOTH notes (the old logic dropped the personalized warning whenever the
    // offer was also active, which is the common case for assigned vouchers).
    const notes: string[] = []
    if (lifecycleStatus === "Active") {
      notes.push(
        "This offer is active and may currently be visible or redeemable in customer apps."
      )
    }
    if (voucher.audienceType === "selected_users") {
      notes.push(
        "⚠️ This is a personalized offer assigned to specific customers. Archiving it removes it from those customers' offers — they will no longer be able to use it."
      )
    }
    const warning = notes.join("\n\n")
    const confirmed = window.confirm(
      `${warning ? `${warning}\n\n` : ""}Archive this offer? It will stop appearing in active voucher lists and new campaigns. Already sent personal offers will keep their history but show as expired in customer apps.`
    )
    if (!confirmed) return
    archiveMutation.mutate({
      voucherId: voucher._id,
      reason:
        lifecycleStatus === "Active"
          ? "Archived active offer from admin panel after confirmation"
          : "Archived from admin panel",
    })
  }

  function handleSubmit(payload: AdminVoucherPayload) {
    if (editingVoucher) {
      updateMutation.mutate({ voucherId: editingVoucher._id, payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <TicketPercent className="size-5" />
            </span>
            Coupons & Offers
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage platform and restaurant promotions with owner-synced rules
            and analytics.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={resetFilters}>
            <RotateCcw className="size-4" />
            Reset filters
          </Button>
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            Create offer
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active offers"
          value={activeCount}
          helper="On current page"
        />
        <StatCard
          label="Total offers"
          value={vouchersQuery.data?.total ?? 0}
          helper="All matching filters"
        />
        <StatCard
          label="Delivered revenue"
          value={formatCurrency(deliveredRevenue)}
          helper="Voucher order revenue"
        />
        <StatCard
          label="Discount given"
          value={formatCurrency(discountGiven)}
          helper={`${platformFunded} platform funded`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Promotion directory</CardTitle>
          <CardDescription>
            Same voucher analytics source used by restaurant-owner promotions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-64 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 pl-9"
                placeholder="Search offer or code"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select
              value={lifecycle}
              onValueChange={(value) =>
                setLifecycle(value as AdminVoucherLifecycle)
              }
            >
              <SelectTrigger className="h-9 w-full sm:w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Scheduled">Scheduled</SelectItem>
                <SelectItem value="Expired">Expired</SelectItem>
                <SelectItem value="Draft">Draft</SelectItem>
                <SelectItem value="Archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={mode}
              onValueChange={(value) =>
                setMode(value as "all" | AdminVoucherMode)
              }
            >
              <SelectTrigger className="h-9 w-full sm:w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All modes</SelectItem>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="coupon">Coupon</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={type}
              onValueChange={(value) => setType(value as VoucherTypeFilter)}
            >
              <SelectTrigger className="h-9 w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="flat">Flat</SelectItem>
                <SelectItem value="percentage">Percentage</SelectItem>
                <SelectItem value="free-delivery">Free delivery</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={audienceFilter}
              onValueChange={(value) =>
                setAudienceFilter(value as "all" | "personalized")
              }
            >
              <SelectTrigger className="h-9 w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All audiences</SelectItem>
                <SelectItem value="personalized">Personalized only</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={scopeType}
              onValueChange={(value) => setScopeType(value as typeof scopeType)}
            >
              <SelectTrigger className="h-9 w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All scopes</SelectItem>
                <SelectItem value="restaurant">Single restaurant</SelectItem>
                <SelectItem value="selected_restaurants">
                  Selected restaurants
                </SelectItem>
                <SelectItem value="all_restaurants">All restaurants</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={surface}
              onValueChange={(value) => setSurface(value as typeof surface)}
            >
              <SelectTrigger className="h-9 w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All surfaces</SelectItem>
                <SelectItem value="checkout">Checkout vouchers</SelectItem>
                <SelectItem value="menu_markdown">Menu markdowns</SelectItem>
              </SelectContent>
            </Select>
            <Select value={restaurantId} onValueChange={setRestaurantId}>
              <SelectTrigger className="h-9 w-full sm:w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All restaurants</SelectItem>
                {restaurants.map((restaurant) => (
                  <SelectItem key={restaurant.id} value={restaurant.id}>
                    {restaurant.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={sortBy}
              onValueChange={(value) => setSortBy(value as VoucherSort)}
            >
              <SelectTrigger className="h-9 w-full sm:w-44">
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
          </div>

          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Offer</TableHead>
                  <TableHead>Restaurant</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Funding</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Finance</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {vouchersQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center">
                      <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : null}
                {vouchers.map((voucher) => {
                  const lifecycleStatus = getVoucherLifecycleStatus(voucher)
                  return (
                    <TableRow key={voucher._id}>
                      <TableCell>
                        <div className="font-medium">{voucher.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {voucher.code || "Auto applied"} -{" "}
                          {formatVoucherDiscount(voucher)}
                        </div>
                        <Badge
                          variant="outline"
                          className={getLifecycleBadgeClass(lifecycleStatus)}
                        >
                          {lifecycleStatus}
                        </Badge>
                        {voucher.audienceType === "selected_users" ? (
                          <Badge className="ml-2 bg-fuchsia-100 text-fuchsia-700">
                            Personalized
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div>{getScopeLabel(voucher)}</div>
                        <div className="text-xs text-muted-foreground">
                          {getAudienceLabel(voucher.audienceType)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>{getVoucherModeLabel(voucher.mode)}</div>
                        <div className="text-xs text-muted-foreground">
                          {getVoucherTypeLabel(voucher.type)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {getVoucherFundingLabel(voucher.fundedBy)}
                      </TableCell>
                      <TableCell>
                        <div>{voucher.analytics.totalUses} uses</div>
                        <div className="text-xs text-muted-foreground">
                          {voucher.analytics.uniqueUsers} users
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          {formatCurrency(voucher.analytics.revenueGenerated)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Discount{" "}
                          {formatCurrency(voucher.analytics.totalDiscountGiven)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>{formatDate(voucher.startsAt)}</div>
                        <div className="text-xs text-muted-foreground">
                          until {formatDate(voucher.endsAt)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setSelectedVoucher(voucher)}
                            >
                              <Eye className="size-4" />
                              View details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEdit(voucher)}>
                              <Pencil className="size-4" />
                              Edit offer
                            </DropdownMenuItem>
                            {voucher.archivedAt ? (
                              <DropdownMenuItem
                                disabled={restoreMutation.isPending}
                                onClick={() =>
                                  restoreMutation.mutate(voucher._id)
                                }
                              >
                                <RefreshCcw className="size-4" />
                                Restore offer
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                disabled={archiveMutation.isPending}
                                onClick={() =>
                                  archiveVoucherWithWarning(voucher)
                                }
                              >
                                <Archive className="size-4" />
                                Archive offer
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {!vouchersQuery.isLoading && vouchers.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No promotions match this filter.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {vouchers.length} of{" "}
              {vouchersQuery.data?.total ?? vouchers.length} offers
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Select
                value={`${pageSize}`}
                onValueChange={(value) => setPageSize(Number(value))}
              >
                <SelectTrigger className="w-full sm:w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent side="top">
                  {pageSizeOptions.map((size) => (
                    <SelectItem key={size} value={`${size}`}>
                      {size} / page
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-sm font-medium">
                Page {safePage} of {pageCount}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  disabled={safePage <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={safePage >= pageCount}
                  onClick={() =>
                    setPage((current) => Math.min(pageCount, current + 1))
                  }
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <VoucherDetailsSheet
        voucher={selectedVoucher}
        onEdit={openEdit}
        onOpenChange={(open) => {
          if (!open) setSelectedVoucher(null)
        }}
      />
      <VoucherFormSheet
        open={formOpen}
        voucher={editingVoucher}
        restaurants={restaurants}
        existingCodes={existingCodes}
        existingVouchers={vouchers}
        personalOfferTarget={personalOfferTarget}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
        onSubmit={handleSubmit}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) {
            setEditingVoucher(null)
            setPersonalOfferTarget(null)
          }
        }}
      />
    </>
  )
}
