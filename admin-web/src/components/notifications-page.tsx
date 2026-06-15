import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Bell,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  Headphones,
  Image as ImageIcon,
  Info,
  Loader2,
  Megaphone,
  RefreshCcw,
  ReceiptText,
  Send,
  Smartphone,
  Store,
  Truck,
  UserRound,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

import {
  listAdminCustomers,
  checkAdminNotificationCampaignReceipts,
  deleteAdminMediaAsset,
  getAdminNotificationCampaignRecipients,
  listAdminCustomerGroups,
  listAdminMediaAssets,
  listAdminNotifications,
  listAdminRestaurants,
  refreshAdminNotificationCampaignConversions,
  listAdminVouchers,
  listAdminRiders,
  cancelAdminNotificationSchedule,
  markAdminNotificationRead,
  retryAdminNotificationSchedule,
  sendAdminNotification,
  uploadAdminMedia,
  type AdminCustomerGroup,
  type AdminMediaAsset,
  type AdminNotificationCenterItem,
  type AdminNotificationRecipientReportStatus,
  type AdminNotificationSendPayload,
  type AdminRestaurantVoucher,
} from "@/lib/admin-api"
import {
  getAdminZoneScope,
  getAdminZoneScopeQueryParams,
  subscribeAdminZoneScope,
  type AdminZoneScope,
} from "@/lib/admin-zone-scope"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"

type SourceFilter =
  | "all"
  | "customer"
  | "owner"
  | "rider"
  | "campaign"
  | "scheduled"
  | "ops"
type StatusFilter = "all" | "read" | "unread"
type HistoryKindFilter = "all" | "notifications" | "push"
type RecipientTypeFilter = "all" | "customers" | "owners" | "riders"
type DeliveryStatusFilter =
  | "all"
  | "sent"
  | "push_ready"
  | "scheduled"
  | "failed"
  | "cancelled"
  | "in_app"
  | "in_app_only"
  | "campaign"
  | "warning"
  | "critical"
type ComposerMode = "notification" | "push" | null
const pageSizeOptions = [10, 20, 50]
const recipientReportFilters: Array<{
  value: AdminNotificationRecipientReportStatus
  label: string
}> = [
  { value: "all", label: "All" },
  { value: "received", label: "Received" },
  { value: "opened", label: "Opened" },
  { value: "not_reached", label: "Not reached" },
]

type NotificationTemplateCategory = "customer" | "owner" | "rider" | "ops"

const notificationTemplates = [
  {
    key: "customer-weekend-offer",
    category: "customer",
    label: "Weekend offer",
    description: "Drive weekend orders with a broad customer promotion.",
    recipientType: "customers",
    type: "promotion",
    contentType: "text",
    title: "Weekend deals are live",
    body: "Your weekend cravings are covered. Explore fresh offers from restaurants near you.",
    path: "/promo-details",
    ctaLabel: "Browse offers",
    ctaPath: "/(tabs)/browse",
  },
  {
    key: "customer-free-delivery",
    category: "customer",
    label: "Free delivery",
    description: "Announce a free delivery or delivery-fee campaign.",
    recipientType: "customers",
    type: "promotion",
    contentType: "image_text",
    title: "Free delivery is available today",
    body: "Order from selected restaurants today and enjoy free delivery while the offer lasts.",
    path: "/promo-details",
    ctaLabel: "Browse restaurants",
    ctaPath: "/(tabs)/browse",
  },
  {
    key: "customer-rain-delay",
    category: "customer",
    label: "Rain delay notice",
    description: "Set expectations during weather or traffic delays.",
    recipientType: "customers",
    type: "system",
    contentType: "text",
    title: "Deliveries may take a little longer",
    body: "Heavy rain may slow down some deliveries today. We will keep your order updates clear and timely.",
    path: "/(tabs)/orders",
  },
  {
    key: "customer-payment-issue",
    category: "customer",
    label: "Payment issue",
    description: "Tell customers when an online payment option is unavailable.",
    recipientType: "customers",
    type: "system",
    contentType: "text",
    title: "Payment option temporarily unavailable",
    body: "One payment option is temporarily unavailable. You can still place orders using the available payment methods.",
    path: "/(tabs)/cart",
  },
  {
    key: "customer-new-restaurants",
    category: "customer",
    label: "New restaurants nearby",
    description: "Bring customers back to browse newly available restaurants.",
    recipientType: "customers",
    type: "promotion",
    contentType: "image_text",
    title: "New restaurants are available near you",
    body: "Fresh choices have been added around your delivery location. Open Foodbela and see what is new.",
    path: "/promo-details",
    ctaLabel: "View restaurants",
    ctaPath: "/(tabs)/browse",
  },
  {
    key: "customer-lunch-deal",
    category: "customer",
    label: "Lunch deal",
    description: "Use this for a short mid-day discount campaign.",
    recipientType: "customers",
    type: "promotion",
    contentType: "image_text",
    title: "Lunch deals are ready",
    body: "Find quick lunch offers from nearby restaurants before the rush.",
    path: "/promo-details",
    ctaLabel: "Order lunch",
    ctaPath: "/(tabs)/browse",
  },
  {
    key: "customer-first-order-treat",
    category: "customer",
    label: "First order treat",
    description: "Bring new users to their first completed order.",
    recipientType: "customers",
    type: "voucher",
    contentType: "image_text",
    title: "Your first order treat is waiting",
    body: "Open Foodbela and use your welcome offer on a nearby restaurant.",
    path: "/promo-details",
    ctaLabel: "Find food",
    ctaPath: "/(tabs)/browse",
  },
  {
    key: "customer-restaurant-spotlight",
    category: "customer",
    label: "Restaurant spotlight",
    description: "Promote one restaurant and send users straight to its menu.",
    recipientType: "customers",
    type: "promotion",
    contentType: "image_text",
    title: "A tasty pick is nearby",
    body: "Check out today's highlighted restaurant and order your favorite meal.",
    path: "/promo-details",
    ctaLabel: "View restaurant",
    ctaPath: "/(tabs)/browse",
  },
  {
    key: "owner-opening-hours",
    category: "owner",
    label: "Update opening hours",
    description: "Ask owners to update special-day or holiday hours.",
    recipientType: "owners",
    type: "system",
    contentType: "text",
    title: "Please update your restaurant opening hours",
    body: "Review your opening hours so customers see accurate availability before ordering.",
    path: "/store-settings",
  },
  {
    key: "owner-prepare-time",
    category: "owner",
    label: "Prepare time reminder",
    description: "Remind owners to keep average preparation time accurate.",
    recipientType: "owners",
    type: "system",
    contentType: "text",
    title: "Keep your preparation time accurate",
    body: "Please review your average preparation time so customers and riders receive reliable order timing.",
    path: "/orders",
  },
  {
    key: "owner-profile-completion",
    category: "owner",
    label: "Profile completion",
    description: "Encourage owners to complete profile/menu information.",
    recipientType: "owners",
    type: "system",
    contentType: "text",
    title: "Complete your restaurant profile",
    body: "Add missing restaurant details, photos, and menu information to help customers order with confidence.",
    path: "/store-settings",
  },
  {
    key: "owner-payout-notice",
    category: "owner",
    label: "Payout notice",
    description: "Notify restaurant owners about payout updates.",
    recipientType: "owners",
    type: "payout",
    contentType: "text",
    title: "Your payout update is ready",
    body: "Please review your latest payout information from the restaurant dashboard.",
    path: "/finance",
  },
  {
    key: "rider-high-demand",
    category: "rider",
    label: "High demand area",
    description: "Ask riders to go online or move toward demand.",
    recipientType: "riders",
    type: "system",
    contentType: "text",
    title: "High order demand nearby",
    body: "There is higher demand in your area. Go online to receive delivery requests.",
    path: "/(app)/available",
  },
  {
    key: "rider-location-reminder",
    category: "rider",
    label: "Location reminder",
    description: "Remind riders to keep location permission active.",
    recipientType: "riders",
    type: "system",
    contentType: "text",
    title: "Keep location enabled while delivering",
    body: "Please keep location permission enabled while online so dispatch and customers receive accurate updates.",
    path: "/(app)/profile",
  },
  {
    key: "rider-weather-safety",
    category: "rider",
    label: "Weather safety",
    description: "Send safety guidance during rain or risky conditions.",
    recipientType: "riders",
    type: "system",
    contentType: "text",
    title: "Ride safely today",
    body: "Weather may affect delivery conditions. Please ride carefully and update your status if you need a break.",
    path: "/(app)/active",
  },
  {
    key: "rider-payout-summary",
    category: "rider",
    label: "Payout summary",
    description: "Tell riders payout details are ready.",
    recipientType: "riders",
    type: "payout",
    contentType: "text",
    title: "Your payout summary is ready",
    body: "Open the rider app to review your latest payout and delivery summary.",
    path: "/(app)/profile",
  },
  {
    key: "ops-maintenance",
    category: "ops",
    label: "Maintenance notice",
    description: "Send a planned maintenance update to customers.",
    recipientType: "customers",
    type: "system",
    contentType: "image_text",
    title: "Scheduled maintenance notice",
    body: "Foodbela may be briefly unavailable during scheduled maintenance. We will keep the interruption as short as possible.",
    path: "/(tabs)/home",
  },
  {
    key: "ops-policy-update",
    category: "ops",
    label: "Policy update",
    description: "Notify owners about platform policy changes.",
    recipientType: "owners",
    type: "system",
    contentType: "text",
    title: "Platform policy update",
    body: "A platform policy update is available. Please review it from your restaurant dashboard.",
    path: "/support",
  },
] satisfies Array<
  Pick<
    AdminNotificationSendPayload,
    "recipientType" | "type" | "contentType" | "title" | "body" | "path"
  > & {
    category: NotificationTemplateCategory
    ctaLabel?: string
    ctaPath?: string
    description: string
    key: string
    label: string
  }
>

const templateCategoryOrder: NotificationTemplateCategory[] = [
  "customer",
  "owner",
  "rider",
  "ops",
]

const smartCustomerGroups = [
  { value: "has_push_token", label: "Users with push token" },
  { value: "ordered_last_30_days", label: "Ordered in last 30 days" },
  { value: "inactive_30_days", label: "Inactive for 30 days" },
  { value: "high_value_customers", label: "High-value customers" },
]

function templateCategoryLabel(category: NotificationTemplateCategory) {
  if (category === "customer") return "Customers"
  if (category === "owner") return "Restaurant owners"
  if (category === "rider") return "Riders"
  return "Operations"
}

function templateCategoryClass(category: NotificationTemplateCategory) {
  if (category === "customer") return "border-sky-200 bg-sky-50 text-sky-700"
  if (category === "owner")
    return "border-violet-200 bg-violet-50 text-violet-700"
  if (category === "rider") return "border-cyan-200 bg-cyan-50 text-cyan-700"
  return "border-amber-200 bg-amber-50 text-amber-700"
}

type DestinationPreset =
  | "none"
  | "promo_details"
  | "offers"
  | "restaurant_details"
  | "browse"
  | "cart"
  | "orders"
  | "profile"
  | "voucher_help"
  | "custom"

const destinationOptions: Array<{
  value: DestinationPreset
  label: string
  path: string
  helper: string
}> = [
  {
    value: "none",
    label: "No destination",
    path: "",
    helper: "No extra screen opens from this action.",
  },
  {
    value: "promo_details",
    label: "Promo details",
    path: "/promo-details",
    helper: "A clean offer details screen with image, copy, and optional CTA.",
  },
  {
    value: "offers",
    label: "Offers",
    path: "/offers",
    helper: "Open the dedicated customer offers screen.",
  },
  {
    value: "restaurant_details",
    label: "Restaurant details",
    path: "",
    helper: "Send customers directly to one restaurant menu.",
  },
  {
    value: "browse",
    label: "Browse restaurants",
    path: "/(tabs)/browse",
    helper: "Open restaurant discovery.",
  },
  {
    value: "cart",
    label: "Cart",
    path: "/(tabs)/cart",
    helper: "Open the customer cart.",
  },
  {
    value: "orders",
    label: "Orders",
    path: "/(tabs)/orders",
    helper: "Open active and past orders.",
  },
  {
    value: "profile",
    label: "Profile",
    path: "/(tabs)/profile",
    helper: "Open customer account settings.",
  },
  {
    value: "voucher_help",
    label: "Voucher help",
    path: "/voucher-help",
    helper: "Open voucher rules and help.",
  },
  {
    value: "custom",
    label: "Custom app path",
    path: "",
    helper: "Use only when the route already exists in the customer app.",
  },
]

const promotionalSections: Array<{
  value: AdminNotificationSendPayload["recipientType"]
  label: string
  helper: string
  icon: typeof UserRound
}> = [
  {
    value: "customers",
    label: "Customers",
    helper: "Offers, vouchers, and restaurant discovery campaigns.",
    icon: UserRound,
  },
  {
    value: "owners",
    label: "Restaurant owners",
    helper: "Business updates, payout notices, and operational campaigns.",
    icon: Store,
  },
  {
    value: "riders",
    label: "Riders",
    helper: "Rider incentives, availability nudges, and delivery updates.",
    icon: Truck,
  },
]

const ownerPromotionPathOptions = [
  { value: "/(tabs)/today", label: "Today" },
  { value: "/(tabs)/orders", label: "Orders" },
  { value: "/(tabs)/menu", label: "Menu" },
  { value: "/(tabs)/payouts", label: "Payouts" },
  { value: "/(tabs)/account", label: "Account" },
  { value: "/notifications", label: "Notifications" },
]

const riderPromotionPathOptions = [
  { value: "/(app)/available", label: "Available orders" },
  { value: "/(app)/active", label: "Active delivery" },
  { value: "/(app)/map", label: "Live map" },
  { value: "/(app)/history", label: "History" },
  { value: "/(app)/profile", label: "Profile" },
  { value: "/notifications", label: "Notifications" },
]

function isCustomerPromotionType(type?: string) {
  return type === "promotion" || type === "voucher" || type === "campaign"
}

function destinationPath(value: DestinationPreset) {
  return destinationOptions.find((option) => option.value === value)?.path ?? ""
}

function destinationFromPath(path?: string) {
  const target = path?.trim() ?? ""
  if (/^\/restaurants\/[A-Za-z0-9_-]+(?:[?#].*)?$/.test(target)) {
    return "restaurant_details"
  }
  const match = destinationOptions.find(
    (option) => option.value !== "custom" && option.path === target
  )
  return match?.value ?? (target ? "custom" : "none")
}

function destinationLabel(path?: string) {
  const target = path?.trim() ?? ""
  if (!target) return "No destination"
  if (/^\/restaurants\/[A-Za-z0-9_-]+(?:[?#].*)?$/.test(target)) {
    return "Restaurant details"
  }
  return (
    destinationOptions.find((option) => option.path === target)?.label ?? target
  )
}

function restaurantIdFromPath(path?: string) {
  return path?.match(/^\/restaurants\/([A-Za-z0-9_-]+)(?:[?#].*)?$/)?.[1] ?? ""
}

function defaultScheduleDateTimeInput() {
  const date = new Date(Date.now() + 60 * 60 * 1000)
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}

function formatNumber(value?: number) {
  return Math.round(value || 0).toLocaleString()
}

function formatCurrency(value?: number | null) {
  return `Tk ${Math.round(Number(value ?? 0)).toLocaleString()}`
}

function formatVoucherDiscount(voucher?: AdminRestaurantVoucher | null) {
  if (!voucher) return "Offer"
  if (voucher.type === "free_delivery") return "Free delivery"
  if (voucher.type === "percentage") {
    const cap = voucher.maxDiscountAmount
      ? `, cap ${formatCurrency(voucher.maxDiscountAmount)}`
      : ""
    return `${formatNumber(voucher.discountValue ?? 0)}% off${cap}`
  }
  return `${formatCurrency(voucher.discountValue ?? 0)} off`
}

function formatVoucherCode(voucher?: AdminRestaurantVoucher | null) {
  if (!voucher) return ""
  return voucher.code?.trim() || (voucher.mode === "auto" ? "Auto applied" : "")
}

function numericValue(value?: number) {
  return Number.isFinite(value) ? Number(value) : 0
}

function notificationDeliveredCount(item: AdminNotificationCenterItem) {
  return Math.max(numericValue(item.sentCount), numericValue(item.inAppCount))
}

function notificationDeliveryRate(item: AdminNotificationCenterItem) {
  const targets = numericValue(item.totalTargets)
  if (targets <= 0) return 0
  return Math.min(
    100,
    Math.round((notificationDeliveredCount(item) / targets) * 100)
  )
}

function notificationOpenRate(item: AdminNotificationCenterItem) {
  const delivered = notificationDeliveredCount(item)
  if (delivered <= 0) return 0
  return Math.min(100, Math.round((numericValue(item.openCount) / delivered) * 100))
}

function isCampaignLike(item: AdminNotificationCenterItem) {
  return item.source === "campaign" || item.source === "scheduled"
}

function isPromotionalPushItem(item: AdminNotificationCenterItem) {
  return (
    item.source === "campaign" ||
    item.type === "customer_push" ||
    item.type === "promotion" ||
    item.type === "voucher" ||
    item.type === "campaign" ||
    (item.source === "scheduled" &&
      item.recipientType === "customers" &&
      ["promotion", "voucher", "campaign"].includes(item.type))
  )
}

type CampaignTimelineTone = "done" | "current" | "upcoming" | "danger"

function campaignTimelineSteps(item: AdminNotificationCenterItem) {
  const isScheduled = item.source === "scheduled" || item.sendMode === "scheduled"
  const status = item.deliveryStatus
  const sentAt = item.sentAt || item.readAt
  const hasOpened = numericValue(item.openCount) > 0

  const steps: Array<{
    key: string
    label: string
    helper: string
    tone: CampaignTimelineTone
  }> = [
    {
      key: "created",
      label: "Created",
      helper: formatDateTime(item.createdAt),
      tone: "done" as const,
    },
  ]

  if (isScheduled) {
    steps.push({
      key: "scheduled",
      label: "Scheduled",
      helper: formatDateTime(item.scheduledAt),
      tone:
        status === "scheduled" ? ("current" as const) : ("done" as const),
    })
  }

  steps.push({
    key: status === "failed" ? "failed" : status === "cancelled" ? "cancelled" : "sent",
    label:
      status === "failed"
        ? "Failed"
        : status === "cancelled"
          ? "Cancelled"
          : status === "scheduled"
            ? "Waiting"
            : "Sent",
    helper:
      status === "scheduled"
        ? "Scheduler will send this automatically"
        : formatDateTime(sentAt),
    tone:
      status === "failed" || status === "cancelled"
        ? ("danger" as const)
        : status === "scheduled"
          ? ("upcoming" as const)
          : ("done" as const),
  })

  steps.push({
    key: "opened",
    label: "Opened",
    helper: hasOpened
      ? `${formatNumber(item.openCount)} recipient${numericValue(item.openCount) === 1 ? "" : "s"}`
      : "No opens yet",
    tone: hasOpened ? ("done" as const) : ("upcoming" as const),
  })

  return steps
}

function campaignTimelineClass(tone: CampaignTimelineTone) {
  if (tone === "done") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (tone === "current") return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700"
  if (tone === "danger") return "border-rose-200 bg-rose-50 text-rose-700"
  return "border-slate-200 bg-slate-50 text-slate-500"
}

function recipientReportStatusClass(status: string) {
  if (status === "opened") return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700"
  if (status === "received") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  return "border-amber-200 bg-amber-50 text-amber-700"
}

function formatDateTime(value?: string | null) {
  if (!value) return "N/A"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "N/A"
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

function formatMetadataValue(value: unknown) {
  if (typeof value === "number") return formatNumber(value)
  if (typeof value === "string") return value || "N/A"
  if (typeof value === "boolean") return value ? "Yes" : "No"
  return "N/A"
}

function getLateDetailRows(item: AdminNotificationCenterItem) {
  const metadata = item.metadata ?? {}
  const rows: Array<{ label: string; value: unknown; helper?: string }> = []

  if ("lateByMinutes" in metadata) {
    rows.push({ label: "Late by", value: `${metadata.lateByMinutes} min` })
  }
  if ("expectedPrepMinutes" in metadata) {
    rows.push({
      label: "Restaurant avg prep time",
      value: `${metadata.expectedPrepMinutes} min`,
      helper: "Configured from restaurant profile/onboarding",
    })
  }
  if ("prepElapsedMinutes" in metadata) {
    rows.push({
      label: "Preparing for",
      value: `${metadata.prepElapsedMinutes} min`,
    })
  }
  if ("prepLateGraceMinutes" in metadata) {
    rows.push({
      label: "Prep alert grace",
      value: `${metadata.prepLateGraceMinutes} min`,
    })
  }
  if ("expectedStartMinutes" in metadata) {
    rows.push({
      label: "Prep start grace",
      value: `${metadata.expectedStartMinutes} min`,
    })
  }
  if ("acceptedMinutes" in metadata) {
    rows.push({
      label: "Accepted for",
      value: `${metadata.acceptedMinutes} min`,
    })
  }
  if ("readyMinutes" in metadata) {
    rows.push({
      label: "Ready for",
      value: `${metadata.readyMinutes} min`,
    })
  }
  if ("assignedMinutes" in metadata) {
    rows.push({
      label: "Assigned for",
      value: `${metadata.assignedMinutes} min`,
    })
  }
  if ("assignmentTimeoutMinutes" in metadata) {
    rows.push({
      label: "Assignment/response timeout",
      value: `${metadata.assignmentTimeoutMinutes} min`,
    })
  }
  if ("pickupLateGraceMinutes" in metadata) {
    rows.push({
      label: "Pickup window",
      value: `${metadata.pickupLateGraceMinutes} min`,
    })
  }
  if ("pickupMinutes" in metadata) {
    rows.push({
      label: "Out for delivery",
      value: `${metadata.pickupMinutes} min`,
    })
  }
  if ("remainingMinutes" in metadata) {
    rows.push({
      label: "ETA baseline",
      value: `${metadata.remainingMinutes} min`,
    })
  }
  if ("deliveryLateGraceMinutes" in metadata) {
    rows.push({
      label: "Delivery ETA grace",
      value: `${metadata.deliveryLateGraceMinutes} min`,
    })
  }
  if ("deliveryWatchAfterPickupMinutes" in metadata) {
    rows.push({
      label: "Delivery watch threshold",
      value: `${metadata.deliveryWatchAfterPickupMinutes} min`,
    })
  }
  if ("deliveryLateAfterPickupMinutes" in metadata) {
    rows.push({
      label: "Delivery late threshold",
      value: `${metadata.deliveryLateAfterPickupMinutes} min`,
    })
  }
  if ("deliveryCriticalAfterPickupMinutes" in metadata) {
    rows.push({
      label: "Delivery critical threshold",
      value: `${metadata.deliveryCriticalAfterPickupMinutes} min`,
    })
  }

  return rows
}

function sourceLabel(source: AdminNotificationCenterItem["source"]) {
  if (source === "customer") return "Customer"
  if (source === "owner") return "Owner"
  if (source === "rider") return "Rider"
  if (source === "scheduled") return "Scheduled"
  if (source === "ops") return "Ops alert"
  return "Campaign"
}

function historyKindLabel(kind: HistoryKindFilter) {
  if (kind === "notifications") return "Notifications"
  if (kind === "push") return "Promotional push"
  return "All activity"
}

function recipientTypeLabel(type: RecipientTypeFilter) {
  if (type === "customers") return "Customers"
  if (type === "owners") return "Owners"
  if (type === "riders") return "Riders"
  return "All recipients"
}

function adminScopeTitle(scope: AdminZoneScope) {
  return scope.type === "all" ? "All areas" : scope.label
}

function adminScopeDescription(scope: AdminZoneScope) {
  if (scope.type === "zone") {
    return "Targets customers, restaurants, and riders connected to this selected service zone."
  }
  if (scope.type === "district") {
    return "Targets all eligible activity inside this selected district."
  }
  return "Targets every eligible area in the platform. Choose a district or zone from the top bar for a narrower campaign."
}

function sourceBadgeClass(source: AdminNotificationCenterItem["source"]) {
  if (source === "customer") return "border-sky-200 bg-sky-50 text-sky-700"
  if (source === "owner")
    return "border-violet-200 bg-violet-50 text-violet-700"
  if (source === "rider") return "border-cyan-200 bg-cyan-50 text-cyan-700"
  if (source === "campaign")
    return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700"
  if (source === "ops")
    return "border-rose-200 bg-rose-50 text-rose-700"
  return "border-amber-200 bg-amber-50 text-amber-700"
}

function deliveryBadgeClass(status: string) {
  if (["sent", "push_ready", "campaign"].includes(status)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700"
  }
  if (["scheduled", "sending"].includes(status)) {
    return "border-blue-200 bg-blue-50 text-blue-700"
  }
  if (["in_app", "in_app_only"].includes(status)) {
    return "border-slate-200 bg-slate-100 text-slate-700"
  }
  if (["failed", "cancelled", "critical"].includes(status)) {
    return "border-rose-200 bg-rose-50 text-rose-700"
  }
  if (status === "warning") return "border-amber-200 bg-amber-50 text-amber-700"
  return "border-border bg-background text-foreground"
}

function readBadgeClass(isRead: boolean) {
  return isRead
    ? "border-slate-200 bg-slate-100 text-slate-700"
    : "border-rose-200 bg-rose-50 text-rose-700"
}

function deliveryStatusLabel(status: string) {
  switch (status) {
    case "push_ready":
      return "Push ready"
    case "in_app_only":
      return "In-app only"
    case "in_app":
      return "In app"
    case "scheduled":
      return "Scheduled"
    case "sending":
      return "Sending"
    case "sent":
      return "Sent"
    case "failed":
      return "Failed"
    case "cancelled":
      return "Cancelled"
    case "campaign":
      return "Campaign"
    case "warning":
      return "Warning"
    case "critical":
      return "Critical"
    default:
      return status.replaceAll("_", " ")
  }
}

function recipientLabel(source: AdminNotificationCenterItem["source"]) {
  if (source === "owner") return "Restaurant owner"
  if (source === "rider") return "Rider"
  if (source === "customer") return "Customer"
  if (source === "campaign") return "Audience"
  if (source === "ops") return "Operational alert"
  return "Recipient"
}

function notificationIcon(
  item: Pick<AdminNotificationCenterItem, "source" | "type" | "deliveryStatus">
) {
  if (item.deliveryStatus === "failed") return XCircle
  if (item.source === "ops" && item.type.includes("support")) return Headphones
  if (item.source === "ops" && item.type.includes("rider")) return Truck
  if (
    item.source === "ops" &&
    (item.type.includes("prep") || item.type.includes("food"))
  )
    return Store
  if (item.source === "ops" && item.type.includes("order")) return ReceiptText
  if (item.deliveryStatus === "sent") return CheckCircle2
  if (item.source === "scheduled") return CalendarClock
  if (item.source === "campaign" || item.type === "promotion") return Megaphone
  if (item.type === "support") return Headphones
  if (item.type === "order_status") return ReceiptText
  if (item.source === "owner") return Store
  if (item.source === "rider") return Truck
  if (item.source === "customer") return UserRound
  return Info
}

function compactScopeId(value?: string) {
  if (!value) return ""
  return value.length > 10 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value
}

function notificationScopeLabel(
  item: Pick<AdminNotificationCenterItem, "zoneId" | "districtId">,
  currentScope: AdminZoneScope
) {
  if (item.zoneId) {
    return currentScope.type === "zone" && currentScope.id === item.zoneId
      ? currentScope.label
      : `Zone ${compactScopeId(item.zoneId)}`
  }
  if (item.districtId) {
    return currentScope.type === "district" && currentScope.id === item.districtId
      ? currentScope.label
      : `District ${compactScopeId(item.districtId)}`
  }
  return currentScope.type === "all" ? "All areas" : currentScope.label
}

export function NotificationsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = React.useState("")
  const [kind, setKind] = React.useState<HistoryKindFilter>("all")
  const [source, setSource] = React.useState<SourceFilter>("all")
  const [status, setStatus] = React.useState<StatusFilter>("all")
  const [deliveryStatus, setDeliveryStatus] =
    React.useState<DeliveryStatusFilter>("all")
  const [recipientTypeFilter, setRecipientTypeFilter] =
    React.useState<RecipientTypeFilter>("all")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)
  const [composerMode, setComposerMode] = React.useState<ComposerMode>(null)
  const [selectedItem, setSelectedItem] =
    React.useState<AdminNotificationCenterItem | null>(null)
  const [recipientReportStatus, setRecipientReportStatus] =
    React.useState<AdminNotificationRecipientReportStatus>("all")
  const [selectedTemplateKey, setSelectedTemplateKey] = React.useState("")
  const [isUploadingImage, setIsUploadingImage] = React.useState(false)
  const [localImagePreviewUrl, setLocalImagePreviewUrl] = React.useState("")
  const [scheduleMode, setScheduleMode] = React.useState(false)
  const [scheduledAt, setScheduledAt] = React.useState("")
  const [testRecipientId, setTestRecipientId] = React.useState("")
  const [adminZoneScope, setAdminZoneScope] = React.useState(() =>
    getAdminZoneScope()
  )
  const adminScopeKey = `${adminZoneScope.type}:${adminZoneScope.id || "all"}`
  const [form, setForm] = React.useState<AdminNotificationSendPayload>({
    recipientType: "customers",
    audience: "all",
    recipientIds: [],
    title: "",
    body: "",
    path: "/(tabs)/home",
    ctaLabel: "",
    ctaPath: "",
    type: "system",
    contentType: "text",
    imageUrl: "",
    imagePublicId: "",
    voucherId: "",
    voucherCode: "",
    voucherLabel: "",
    voucherExpiresAt: "",
    voucherMinOrder: undefined,
    personalOffer: false,
    customerAudienceType: "all_users",
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
    conversionWindowDays: 7,
    pushEnabled: true,
  })

  React.useEffect(
    () =>
      subscribeAdminZoneScope(() => {
        setAdminZoneScope(getAdminZoneScope())
        setSelectedItem(null)
        setPage(1)
        setForm((current) => ({
          ...current,
          recipientIds: [],
          selectedRestaurantIds: [],
          customerGroupKey: "",
          voucherId: "",
          voucherCode: "",
          voucherLabel: "",
          voucherExpiresAt: "",
          voucherMinOrder: undefined,
          personalOffer: false,
        }))
      }),
    []
  )

  const notificationsQuery = useQuery({
    queryKey: [
      "admin-notifications",
      kind,
      source,
      status,
      deliveryStatus,
      recipientTypeFilter,
      search,
      page,
      pageSize,
      adminScopeKey,
    ],
    queryFn: () =>
      listAdminNotifications({
        kind,
        source,
        status,
        deliveryStatus,
        recipientType: recipientTypeFilter,
        search,
        page,
        pageSize,
        ...getAdminZoneScopeQueryParams(),
      }),
    refetchInterval:
      selectedItem && isPromotionalPushItem(selectedItem) ? 5_000 : false,
  })
  const selectedCampaignId = selectedItem?.campaignId || selectedItem?.id || ""
  const recipientsQuery = useQuery({
    queryKey: [
      "admin-notification-recipients",
      selectedCampaignId,
      recipientReportStatus,
      adminScopeKey,
    ],
    enabled: Boolean(selectedItem && isPromotionalPushItem(selectedItem) && selectedCampaignId),
    queryFn: () =>
      getAdminNotificationCampaignRecipients({
        campaignId: selectedCampaignId,
        status: recipientReportStatus,
        page: 1,
        pageSize: 50,
      }),
    refetchInterval:
      selectedItem && isPromotionalPushItem(selectedItem) ? 5_000 : false,
  })

  React.useEffect(() => {
    setRecipientReportStatus("all")
  }, [selectedCampaignId])

  const isCustomerPromotionDraft =
    form.recipientType === "customers" && isCustomerPromotionType(form.type)
  const needsCustomerTargets = form.recipientType === "customers"
  const needsCustomerGroups = form.recipientType === "customers"
  const needsRestaurantTargets =
    form.recipientType === "owners" ||
    (form.recipientType === "customers" &&
      (form.restaurantScope === "selected_restaurants" ||
        isCustomerPromotionDraft))
  const needsRiderTargets = form.recipientType === "riders"
  const needsNotificationImages =
    form.contentType !== "text" || Boolean(form.imageUrl)

  const customersQuery = useQuery({
    queryKey: ["admin-customers", "notification-targets", adminScopeKey],
    queryFn: () =>
      listAdminCustomers({
        page: 1,
        pageSize: 50,
        sortBy: "recentLogin",
        ...getAdminZoneScopeQueryParams(),
      }),
    enabled: needsCustomerTargets,
  })

  const customerGroupsQuery = useQuery({
    queryKey: ["admin-customer-groups", "notification-targets", adminScopeKey],
    queryFn: listAdminCustomerGroups,
    enabled: needsCustomerGroups,
  })

  const restaurantsQuery = useQuery({
    queryKey: ["admin-restaurants", "notification-targets", adminScopeKey],
    queryFn: () =>
      listAdminRestaurants({
        page: 1,
        pageSize: 50,
        sortBy: "newestUpdated",
        ...getAdminZoneScopeQueryParams(),
      }),
    enabled: needsRestaurantTargets,
  })

  const ridersQuery = useQuery({
    queryKey: ["admin-riders", "notification-targets", adminScopeKey],
    queryFn: () =>
      listAdminRiders({
        page: 1,
        pageSize: 50,
        sortBy: "recentLogin",
        ...getAdminZoneScopeQueryParams(),
      }),
    enabled: needsRiderTargets,
  })

  const vouchersQuery = useQuery({
    queryKey: ["admin-vouchers", "notification-targets", adminScopeKey],
    queryFn: () =>
      listAdminVouchers({
        page: 1,
        pageSize: 80,
        lifecycle: "Active",
        sortBy: "endingSoon",
        ...getAdminZoneScopeQueryParams(),
      }),
    enabled: form.recipientType === "customers",
  })

  const notificationImagesQuery = useQuery({
    queryKey: ["admin-media-assets", "notification-campaign"],
    queryFn: () =>
      listAdminMediaAssets({
        context: "notification_campaign",
        page: 1,
        pageSize: 24,
      }),
    enabled: needsNotificationImages,
  })

  const sendMutation = useMutation({
    mutationFn: sendAdminNotification,
    onSuccess: (result) => {
      toast.success(
        result.scheduledAt
          ? `Notification scheduled for ${formatDateTime(result.scheduledAt)}`
          : `Notification processed for ${formatNumber(result.totalTargets)} targets`
      )
      setForm((current) => ({
        ...current,
        title: "",
        body: "",
        recipientIds: [],
        contentType: "text",
        imageUrl: "",
        imagePublicId: "",
        voucherId: "",
        voucherCode: "",
        voucherLabel: "",
        voucherExpiresAt: "",
        voucherMinOrder: undefined,
        personalOffer: false,
        ctaLabel: "",
        ctaPath: "",
      }))
      setScheduleMode(false)
      setScheduledAt("")
      setSelectedTemplateKey("")
      setComposerMode(null)
      void queryClient.invalidateQueries({ queryKey: ["admin-notifications"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-customers"] })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to send notification"
      )
    },
  })

  const markReadMutation = useMutation({
    mutationFn: markAdminNotificationRead,
    onSuccess: () => {
      toast.success("Notification marked as read")
      setSelectedItem((current) =>
        current
          ? { ...current, isRead: true, readAt: new Date().toISOString() }
          : current
      )
      void queryClient.invalidateQueries({ queryKey: ["admin-notifications"] })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to mark as read"
      )
    },
  })

  const cancelScheduleMutation = useMutation({
    mutationFn: cancelAdminNotificationSchedule,
    onSuccess: () => {
      toast.success("Scheduled notification cancelled")
      setSelectedItem((current) =>
        current
          ? { ...current, isRead: true, deliveryStatus: "cancelled" }
          : current
      )
      void queryClient.invalidateQueries({ queryKey: ["admin-notifications"] })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to cancel schedule"
      )
    },
  })

  const retryScheduleMutation = useMutation({
    mutationFn: retryAdminNotificationSchedule,
    onSuccess: () => {
      toast.success("Scheduled notification retried")
      setSelectedItem((current) =>
        current
          ? {
              ...current,
              isRead: true,
              deliveryStatus: "sent",
              sentAt: new Date().toISOString(),
              failureReason: "",
            }
          : current
      )
      void queryClient.invalidateQueries({ queryKey: ["admin-notifications"] })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to retry schedule"
      )
    },
  })
  const refreshConversionsMutation = useMutation({
    mutationFn: refreshAdminNotificationCampaignConversions,
    onSuccess: (result) => {
      if (result.refreshed) {
        toast.success(
          `Conversions refreshed: ${formatNumber(result.orderCount)} orders`
        )
      } else {
        toast.info(result.unavailableReason || "Conversions unavailable")
      }
      void queryClient.invalidateQueries({ queryKey: ["admin-notifications"] })
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Failed to refresh conversions"),
  })
  const checkReceiptsMutation = useMutation({
    mutationFn: checkAdminNotificationCampaignReceipts,
    onSuccess: (result) => {
      if (result.unavailableReason) {
        toast.info(result.unavailableReason)
      } else {
        toast.success(
          `Receipts checked: ${formatNumber(result.deliveredToProvider)} accepted, ${formatNumber(result.deviceNotRegistered)} uninstalled`
        )
      }
      void queryClient.invalidateQueries({ queryKey: ["admin-notifications"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-notification-recipients"] })
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Failed to check receipts"),
  })
  const deleteImageMutation = useMutation({
    mutationFn: deleteAdminMediaAsset,
    onSuccess: (result) => {
      toast.success("Notification image removed")
      clearLocalImagePreview()
      setForm((current) =>
        current.imagePublicId === result.asset.publicId ||
        current.imageUrl === result.asset.url
          ? { ...current, imageUrl: "", imagePublicId: "", contentType: "text" }
          : current
      )
      void queryClient.invalidateQueries({
        queryKey: ["admin-media-assets", "notification-campaign"],
      })
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Image delete failed"),
  })

  const data = notificationsQuery.data
  const summary = data?.summary
  const notifications = data?.items ?? []
  const notificationImages = notificationImagesQuery.data?.items ?? []
  const restaurantOptions = restaurantsQuery.data?.items ?? []
  const activeFilterCount =
    (search.trim() ? 1 : 0) +
    (kind !== "all" ? 1 : 0) +
    (source !== "all" ? 1 : 0) +
    (status !== "all" ? 1 : 0) +
    (deliveryStatus !== "all" ? 1 : 0) +
    (recipientTypeFilter !== "all" ? 1 : 0)
  const safePage = data?.page ?? page
  const pageCount = data?.pageCount ?? 1
  const recipientOptions = React.useMemo(() => {
    if (form.recipientType === "customers") {
      return (customersQuery.data?.items ?? []).map((customer) => ({
        id: customer.id,
        title: customer.fullName || customer.phone || "Customer",
        subtitle: `${customer.phone || "No phone"} - ${customer.hasPushToken ? "push ready" : "in-app only"}`,
      }))
    }
    if (form.recipientType === "owners") {
      return (restaurantsQuery.data?.items ?? []).map((restaurant) => ({
        id: restaurant.id,
        title: restaurant.name,
        subtitle: `${restaurant.ownerName || "Owner"} - ${restaurant.ownerPhone || "No phone"}`,
      }))
    }
    return (ridersQuery.data?.items ?? []).map((rider) => ({
      id: rider.id,
      title: rider.fullName,
      subtitle: `${rider.phone} - ${rider.isAvailableForAssignments ? "available" : "unavailable"}`,
    }))
  }, [
    customersQuery.data?.items,
    form.recipientType,
    restaurantsQuery.data?.items,
    ridersQuery.data?.items,
  ])

  const selectedIds = new Set(form.recipientIds ?? [])
  const selectedCount =
    form.audience === "all" ? "All eligible" : `${selectedIds.size} selected`
  const availableVouchers = React.useMemo(
    () => vouchersQuery.data?.items ?? [],
    [vouchersQuery.data?.items]
  )
  const selectedVoucher = React.useMemo(
    () =>
      availableVouchers.find((voucher) => voucher._id === form.voucherId) ?? null,
    [availableVouchers, form.voucherId]
  )
  const groupedNotificationTemplates = React.useMemo(
    () =>
      templateCategoryOrder.map((category) => ({
        category,
        items: notificationTemplates.filter(
          (template) => template.category === category
        ),
      })),
    []
  )

  function toggleRecipient(id: string, checked: boolean) {
    setForm((current) => {
      const next = new Set(current.recipientIds ?? [])
      if (checked) next.add(id)
      else next.delete(id)
      return { ...current, recipientIds: Array.from(next) }
    })
  }

  function buildSendPayload(
    overrides: Partial<AdminNotificationSendPayload> = {}
  ): AdminNotificationSendPayload {
    const merged = { ...form, ...overrides }
    const voucherId =
      merged.recipientType === "customers" ? merged.voucherId?.trim() ?? "" : ""
    const isPersonalVoucher =
      Boolean(voucherId) &&
      (merged.customerAudienceType === "selected_users" ||
        merged.audience === "selected")
    return {
      ...merged,
      type: voucherId ? "voucher" : merged.type === "voucher" ? "promotion" : merged.type,
      voucherId: voucherId || undefined,
      voucherCode: undefined,
      voucherLabel: undefined,
      voucherExpiresAt: undefined,
      voucherMinOrder: undefined,
      personalOffer: isPersonalVoucher || undefined,
    }
  }

  function applyVoucherSelection(voucherId: string) {
    const voucher =
      vouchersQuery.data?.items.find((item) => item._id === voucherId) ?? null
    setForm((current) =>
      voucher
        ? {
            ...current,
            voucherId: voucher._id,
            voucherCode: formatVoucherCode(voucher),
            voucherLabel: voucher.display?.title || voucher.name,
            voucherExpiresAt: voucher.endsAt,
            voucherMinOrder: voucher.minimumOrderAmount,
            personalOffer:
              current.customerAudienceType === "selected_users" ||
              current.audience === "selected",
            type: "voucher",
            path: current.path?.trim() || "/offers",
            ctaLabel: current.ctaLabel?.trim() || "View offer",
            ctaPath: current.ctaPath?.trim() || "/offers",
          }
        : {
            ...current,
            voucherId: "",
            voucherCode: "",
            voucherLabel: "",
            voucherExpiresAt: "",
            voucherMinOrder: undefined,
            personalOffer: false,
            type: current.type === "voucher" ? "promotion" : current.type,
          }
    )
  }

  function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.title.trim() || !form.body.trim()) {
      toast.error("Title and message body are required")
      return
    }
    if (form.audience === "selected" && !(form.recipientIds ?? []).length) {
      toast.error("Select at least one recipient")
      return
    }
    if (form.contentType !== "text" && !form.imageUrl?.trim()) {
      toast.error("Upload an image for image notification mode")
      return
    }
    if (scheduleMode && !scheduledAt) {
      toast.error("Choose schedule date and time")
      return
    }
    sendMutation.mutate(buildSendPayload({
      scheduledAt:
        scheduleMode && scheduledAt
          ? new Date(scheduledAt).toISOString()
          : undefined,
    }))
  }

  function sendTestNotification() {
    if (!form.title.trim() || !form.body.trim()) {
      toast.error("Title and message body are required")
      return
    }
    if (form.contentType !== "text" && !form.imageUrl?.trim()) {
      toast.error("Upload an image for image notification mode")
      return
    }
    if (!testRecipientId) {
      toast.error("Choose a test recipient first")
      return
    }

    sendMutation.mutate(buildSendPayload({
      audience: "selected",
      recipientIds: [testRecipientId],
      title: `[TEST] ${form.title}`,
      scheduledAt: undefined,
      testMode: true,
    }))
  }

  function resetFilters() {
    setSearch("")
    setKind("all")
    setSource("all")
    setStatus("all")
    setDeliveryStatus("all")
    setRecipientTypeFilter("all")
    setPage(1)
  }

  function openNotificationComposer() {
    setComposerMode("notification")
    setScheduleMode(false)
    setScheduledAt("")
    setSelectedTemplateKey("")
    setForm((current) => ({
      ...current,
      recipientType: "customers",
      audience: "all",
      recipientIds: [],
      title: "",
      body: "",
      path: "/(tabs)/home",
      ctaLabel: "",
      ctaPath: "",
      type: "system",
      contentType: "text",
      imageUrl: "",
      imagePublicId: "",
      voucherId: "",
      voucherCode: "",
      voucherLabel: "",
      voucherExpiresAt: "",
      voucherMinOrder: undefined,
      personalOffer: false,
      customerAudienceType: "all_users",
      customerGroupKey: "",
      restaurantScope: "all_restaurants",
      selectedRestaurantIds: [],
      pushEnabled: true,
    }))
  }

  function openPushComposer() {
    setComposerMode("push")
    setScheduleMode(false)
    setScheduledAt("")
    setSelectedTemplateKey("")
    setForm((current) => ({
      ...current,
      recipientType: "customers",
      audience: "all",
      recipientIds: [],
      title: "",
      body: "",
      path: "/promo-details",
      ctaLabel: "Browse restaurants",
      ctaPath: "/(tabs)/browse",
      type: "promotion",
      contentType: "image_text",
      imageUrl: "",
      imagePublicId: "",
      voucherId: "",
      voucherCode: "",
      voucherLabel: "",
      voucherExpiresAt: "",
      voucherMinOrder: undefined,
      personalOffer: false,
      customerAudienceType: "all_users",
      customerGroupKey: "",
      restaurantScope: "all_restaurants",
      selectedRestaurantIds: [],
      conversionWindowDays: 7,
      pushEnabled: true,
    }))
  }

  function setPromotionalRecipientType(
    recipientType: AdminNotificationSendPayload["recipientType"]
  ) {
    setTestRecipientId("")
    setSelectedTemplateKey("")
    if (recipientType !== "customers") clearLocalImagePreview()
    setForm((current) => {
      if (recipientType === "customers") {
        return {
          ...current,
          recipientType,
          audience: "all",
          recipientIds: [],
          path: "/promo-details",
          ctaLabel: current.ctaLabel?.trim() || "Browse restaurants",
          ctaPath: current.ctaPath?.trim() || "/(tabs)/browse",
          type: "promotion",
          contentType:
            current.contentType === "text" ? "image_text" : current.contentType,
          customerAudienceType: "all_users",
          customerGroupKey: "",
          restaurantScope: "all_restaurants",
          selectedRestaurantIds: [],
          pushEnabled: true,
        }
      }

      if (recipientType === "owners") {
        return {
          ...current,
          recipientType,
          audience: "all",
          recipientIds: [],
          path: "/(tabs)/today",
          ctaLabel: "",
          ctaPath: "",
          type: "promotion",
          contentType: "text",
          imageUrl: "",
          imagePublicId: "",
          voucherCode: "",
          voucherLabel: "",
          voucherExpiresAt: "",
          voucherMinOrder: undefined,
          customerAudienceType: "all_users",
          customerGroupKey: "",
          restaurantScope: "all_restaurants",
          selectedRestaurantIds: [],
          pushEnabled: true,
        }
      }

      return {
        ...current,
        recipientType,
        audience: "all",
        recipientIds: [],
        path: "/(app)/available",
        ctaLabel: "",
        ctaPath: "",
        type: "promotion",
        contentType: "text",
        imageUrl: "",
        imagePublicId: "",
        voucherCode: "",
        voucherLabel: "",
        voucherExpiresAt: "",
        voucherMinOrder: undefined,
        customerAudienceType: "all_users",
        customerGroupKey: "",
        restaurantScope: "all_restaurants",
        selectedRestaurantIds: [],
        pushEnabled: true,
      }
    })
  }

  function applyTemplate(key: string) {
    const template = notificationTemplates.find((item) => item.key === key)
    if (!template) return
    setSelectedTemplateKey(key)
    setForm((current) => ({
      ...current,
      recipientType: template.recipientType,
      recipientIds: [],
      audience: "all",
      title: template.title,
      body: template.body,
      path: template.path,
      ctaLabel: template.ctaLabel ?? "",
      ctaPath: template.ctaPath ?? "",
      type: template.type,
      contentType: template.contentType,
      pushEnabled: true,
    }))
    setScheduleMode(true)
    setScheduledAt((current) => current || defaultScheduleDateTimeInput())
    toast.success(`${template.label} template applied`)
  }

  React.useEffect(() => {
    setTestRecipientId("")
  }, [form.recipientType])

  React.useEffect(
    () => () => {
      if (localImagePreviewUrl) URL.revokeObjectURL(localImagePreviewUrl)
    },
    [localImagePreviewUrl]
  )

  function replaceLocalImagePreview(url: string) {
    setLocalImagePreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return url
    })
  }

  function clearLocalImagePreview() {
    setLocalImagePreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return ""
    })
  }

  async function uploadNotificationImage(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file")
      return
    }
    if (file.size > 3 * 1024 * 1024) {
      toast.error("Image must be 3 MB or smaller")
      return
    }

    setIsUploadingImage(true)
    replaceLocalImagePreview(URL.createObjectURL(file))
    try {
      const result = await uploadAdminMedia(
        file,
        "foodbela/admin/notification-campaigns",
        "notification_campaign"
      )
      setForm((current) => ({
        ...current,
        contentType:
          current.contentType === "text" ? "image_text" : current.contentType,
        imageUrl: result.url,
        imagePublicId: result.publicId,
      }))
      clearLocalImagePreview()
      toast.success("Notification image uploaded")
      void queryClient.invalidateQueries({
        queryKey: ["admin-media-assets", "notification-campaign"],
      })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Notification image upload failed"
      )
    } finally {
      setIsUploadingImage(false)
    }
  }

  function selectNotificationImage(asset: AdminMediaAsset) {
    clearLocalImagePreview()
    setForm((current) => ({
      ...current,
      contentType:
        current.contentType === "text" ? "image_text" : current.contentType,
      imageUrl: asset.url,
      imagePublicId: asset.publicId,
    }))
  }

  const isCustomerPromotionForm = isCustomerPromotionDraft
  const openDestination = destinationFromPath(form.path)
  const ctaDestination = destinationFromPath(form.ctaPath)
  const promoDestination = isCustomerPromotionForm
    ? destinationFromPath(form.path) === "restaurant_details"
      ? "restaurant_details"
      : destinationFromPath(form.path) === "offers"
        ? "offers"
        : "promo_details"
    : "none"
  const promoRestaurantId = restaurantIdFromPath(form.path)
  const selectedPromoRestaurant = restaurantOptions.find(
    (restaurant) => restaurant.id === promoRestaurantId
  )
  const ctaEnabled = Boolean(form.ctaLabel?.trim() || form.ctaPath?.trim())
  const campaignImagePreviewUrl = localImagePreviewUrl || form.imageUrl || ""
  const previewTitle =
    form.title.trim() || (isCustomerPromotionForm ? "Weekend treat is here 🍔" : "Notification title")
  const previewBody =
    form.body.trim() ||
    (isCustomerPromotionForm
      ? "Open Foodbela and grab today’s offer."
      : "The notification message will appear here.")

  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Bell className="size-5" />
            </span>
            Notifications
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Send and audit notifications for the area selected in the top bar.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="bg-background">
              Scope: {adminScopeTitle(adminZoneScope)}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {adminScopeDescription(adminZoneScope)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={openNotificationComposer}>
            <Bell className="size-4" />
            New notification
          </Button>
          <Button type="button" onClick={openPushComposer}>
            <Megaphone className="size-4" />
            Promotional push
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => notificationsQuery.refetch()}
            disabled={notificationsQuery.isFetching}
          >
            {notificationsQuery.isFetching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCcw className="size-4" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-2">
            <p className="text-sm text-muted-foreground">
              Customer push tokens
            </p>
            <p className="mt-2 text-3xl font-semibold">
              {formatNumber(summary?.customerPushActiveTokens)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatNumber(summary?.customerPushDisabledTokens)} disabled
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-2">
            <p className="text-sm text-muted-foreground">Rider push tokens</p>
            <p className="mt-2 text-3xl font-semibold">
              {formatNumber(summary?.riderPushActiveTokens)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatNumber(summary?.riderPushDisabledTokens)} disabled
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-2">
            <p className="text-sm text-muted-foreground">Campaign open rate</p>
            <p className="mt-2 text-3xl font-semibold">
              {formatNumber(summary?.campaignOpenRate)}%
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatNumber(summary?.campaignOpens)} opens /{" "}
              {formatNumber(summary?.campaignDelivered)} sent
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-2">
            <p className="text-sm text-muted-foreground">Scheduled</p>
            <p className="mt-2 text-3xl font-semibold">
              {formatNumber(summary?.scheduledCount)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Future notifications waiting for dispatch
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4">
        <Card className="hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="size-4" />
              Compose notification
            </CardTitle>
            <CardDescription>
              Customer supports in-app + push; owner supports in-app; rider
              supports push.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submitForm}>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Label>Scheduled notification templates</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Choose a ready-made template, confirm the copy, then pick
                      the date and time.
                    </p>
                  </div>
                  {selectedTemplateKey ? (
                    <Badge variant="outline" className="bg-background">
                      Template applied
                    </Badge>
                  ) : null}
                </div>
                <Select value={selectedTemplateKey} onValueChange={applyTemplate}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {notificationTemplates.map((template) => (
                      <SelectItem key={template.key} value={template.key}>
                        {templateCategoryLabel(template.category)} -{" "}
                        {template.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <ScrollArea className="h-72 rounded-xl border bg-muted/20">
                  <div className="space-y-4 p-3">
                    {groupedNotificationTemplates.map((group) => (
                      <div key={group.category} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={templateCategoryClass(group.category)}
                          >
                            {templateCategoryLabel(group.category)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {group.items.length} templates
                          </span>
                        </div>
                        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {group.items.map((template) => {
                            const isSelected =
                              selectedTemplateKey === template.key
                            return (
                              <button
                                key={template.key}
                                type="button"
                                className={cn(
                                  "rounded-lg border bg-background p-3 text-left transition hover:border-primary/50 hover:bg-primary/5",
                                  isSelected &&
                                    "border-primary bg-primary/10 ring-1 ring-primary/30"
                                )}
                                onClick={() => applyTemplate(template.key)}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="font-medium">
                                    {template.label}
                                  </div>
                                  <Badge
                                    variant="outline"
                                    className="shrink-0 bg-background"
                                  >
                                    {template.type}
                                  </Badge>
                                </div>
                                <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                  {template.description}
                                </div>
                                <div className="mt-2 truncate text-xs text-muted-foreground">
                                  {template.title}
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Recipient type</Label>
                  <Select
                    value={form.recipientType}
                    onValueChange={(value) =>
                      setForm((current) => {
                        const recipientType =
                          value as AdminNotificationSendPayload["recipientType"]
                        const nextIsPromotion =
                          recipientType === "customers" &&
                          isCustomerPromotionType(current.type)
                        return {
                          ...current,
                          recipientType,
                          recipientIds: [],
                          path: nextIsPromotion
                            ? "/promo-details"
                            : current.path === "/promo-details"
                              ? "/(tabs)/home"
                              : current.path,
                          ctaLabel: nextIsPromotion ? current.ctaLabel : "",
                          ctaPath: nextIsPromotion ? current.ctaPath : "",
                        }
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="customers">Customers</SelectItem>
                      <SelectItem value="owners">Restaurant owners</SelectItem>
                      <SelectItem value="riders">Riders</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Audience</Label>
                  <Select
                    value={form.audience}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        audience: value as "all" | "selected",
                        recipientIds: [],
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All eligible</SelectItem>
                      <SelectItem value="selected">Selected only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {form.recipientType === "customers" ? (
                <div className="rounded-xl border bg-muted/20 p-3">
                  <div className="mb-3">
                    <Label>Customer campaign targeting</Label>
                    <p className="text-xs text-muted-foreground">
                      Migrated from CMS push: smart segments, restaurant-based
                      audience, A/B test, and conversion window.
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Customer audience</Label>
                      <Select
                        value={form.customerAudienceType ?? "all_users"}
                        onValueChange={(value) =>
                          setForm((current) => ({
                            ...current,
                            customerAudienceType:
                              value as AdminNotificationSendPayload["customerAudienceType"],
                            audience: value === "selected_users" ? "selected" : "all",
                          }))
                        }
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all_users">All users</SelectItem>
                          <SelectItem value="new_users">New users</SelectItem>
                          <SelectItem value="returning_users">Returning users</SelectItem>
                          <SelectItem value="selected_users">Specific users</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Smart segment</Label>
                      <Select
                        value={form.customerGroupKey || "none"}
                        onValueChange={(value) =>
                          setForm((current) => ({
                            ...current,
                            customerGroupKey: value === "none" ? "" : value,
                          }))
                        }
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No smart segment</SelectItem>
                          {smartCustomerGroups.map((group) => (
                            <SelectItem key={group.value} value={group.value}>
                              {group.label}
                            </SelectItem>
                          ))}
                          {(customerGroupsQuery.data?.items ?? []).length ? (
                            <SelectGroup>
                              <SelectLabel>Saved groups</SelectLabel>
                              {(customerGroupsQuery.data?.items ?? []).map(
                                (group: AdminCustomerGroup) => (
                                  <SelectItem key={group.id} value={`manual:${group.id}`}>
                                    {group.name} ({group.memberCount})
                                  </SelectItem>
                                )
                              )}
                            </SelectGroup>
                          ) : null}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Restaurant scope</Label>
                      <Select
                        value={form.restaurantScope ?? "all_restaurants"}
                        onValueChange={(value) =>
                          setForm((current) => ({
                            ...current,
                            restaurantScope:
                              value as AdminNotificationSendPayload["restaurantScope"],
                            selectedRestaurantIds:
                              value === "selected_restaurants"
                                ? current.selectedRestaurantIds ?? []
                                : [],
                          }))
                        }
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all_restaurants">No restaurant filter</SelectItem>
                          <SelectItem value="selected_restaurants">Users from selected restaurants</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Conversion window</Label>
                      <Input
                        type="number"
                        min={1}
                        max={30}
                        value={form.conversionWindowDays ?? 7}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            conversionWindowDays: Number(event.target.value || 7),
                          }))
                        }
                      />
                    </div>
                  </div>

                  {form.restaurantScope === "selected_restaurants" ? (
                    <ScrollArea className="mt-3 h-44 rounded-lg border bg-background">
                      <div className="space-y-2 p-3">
                        {(restaurantsQuery.data?.items ?? []).map((restaurant) => {
                          const selected = new Set(form.selectedRestaurantIds ?? [])
                          return (
                            <label
                              key={restaurant.id}
                              className="flex cursor-pointer items-start gap-3 rounded-md border p-2"
                            >
                              <Checkbox
                                checked={selected.has(restaurant.id)}
                                onCheckedChange={(checked) =>
                                  setForm((current) => ({
                                    ...current,
                                    selectedRestaurantIds:
                                      checked === true
                                        ? [...(current.selectedRestaurantIds ?? []), restaurant.id]
                                        : (current.selectedRestaurantIds ?? []).filter((id) => id !== restaurant.id),
                                  }))
                                }
                              />
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium">{restaurant.name}</span>
                                <span className="block truncate text-xs text-muted-foreground">{restaurant.city}</span>
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    </ScrollArea>
                  ) : null}

                  <div className="mt-3 rounded-lg border bg-background p-3">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.abTest?.enabled === true}
                        onCheckedChange={(checked) =>
                          setForm((current) => ({
                            ...current,
                            abTest: {
                              ...(current.abTest ?? {}),
                              enabled: checked === true,
                            },
                          }))
                        }
                      />
                      A/B test this campaign
                    </label>
                    {form.abTest?.enabled ? (
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <Input
                          value={form.abTest.variantBTitle ?? ""}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              abTest: { ...(current.abTest ?? {}), variantBTitle: event.target.value },
                            }))
                          }
                          placeholder="Variant B title"
                        />
                        <Input
                          value={form.abTest.variantBBody ?? ""}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              abTest: { ...(current.abTest ?? {}), variantBBody: event.target.value },
                            }))
                          }
                          placeholder="Variant B body"
                        />
                        <Input
                          value={form.abTest.variantBPath ?? ""}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              abTest: { ...(current.abTest ?? {}), variantBPath: event.target.value },
                            }))
                          }
                          placeholder="Variant B path"
                        />
                        <Input
                          type="number"
                          min={1}
                          max={99}
                          value={form.abTest.splitPercent ?? 50}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              abTest: { ...(current.abTest ?? {}), splitPercent: Number(event.target.value || 50) },
                            }))
                          }
                          placeholder="Variant B split %"
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {form.audience === "selected" ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label>Recipients</Label>
                    <Badge variant="outline">{selectedCount}</Badge>
                  </div>
                  <ScrollArea className="h-52 rounded-lg border">
                    <div className="space-y-2 p-3">
                      {recipientOptions.map((recipient) => (
                        <label
                          key={recipient.id}
                          className="flex cursor-pointer items-start gap-3 rounded-md border bg-background p-2"
                        >
                          <Checkbox
                            checked={selectedIds.has(recipient.id)}
                            onCheckedChange={(checked) =>
                              toggleRecipient(recipient.id, checked === true)
                            }
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">
                              {recipient.title}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {recipient.subtitle}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              ) : null}

              <div className="rounded-xl border p-3">
                <div className="grid gap-3 lg:grid-cols-[0.8fr_1.2fr]">
                  <div className="space-y-2">
                    <Label>Content mode</Label>
                    <Select
                      value={form.contentType ?? "text"}
                      onValueChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          contentType:
                            value as AdminNotificationSendPayload["contentType"],
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Text only</SelectItem>
                        <SelectItem value="image">Image focus</SelectItem>
                        <SelectItem value="image_text">Image + text</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Image modes use Expo rich notifications so the mobile
                      notification can expand and show the full campaign image.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Campaign image</Label>
                    <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-center">
                      {form.imageUrl ? (
                        <img
                          src={form.imageUrl}
                          alt="Notification campaign"
                          className="h-28 w-full rounded-lg border object-cover sm:w-44"
                        />
                      ) : (
                        <div className="flex h-28 w-full items-center justify-center rounded-lg border border-dashed bg-background text-muted-foreground sm:w-44">
                          <ImageIcon className="size-7" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1 space-y-2">
                        <Input
                          type="file"
                          accept="image/*"
                          disabled={isUploadingImage}
                          onChange={(event) => {
                            const file = event.target.files?.[0]
                            event.target.value = ""
                            if (file) void uploadNotificationImage(file)
                          }}
                        />
                        <div className="text-xs text-muted-foreground">
                          Recommended: wide promotional image. The app will send
                          it as notification rich media and keep text as fallback.
                        </div>
                        {form.imageUrl ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setForm((current) => ({
                                ...current,
                                imageUrl: "",
                                imagePublicId: "",
                                contentType: "text",
                              }))
                            }
                          >
                            Remove image
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className="rounded-lg border bg-background p-2">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-muted-foreground">
                          Uploaded images
                        </span>
                        {notificationImagesQuery.isFetching ? (
                          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                        ) : null}
                      </div>
                      {notificationImages.length ? (
                        <ScrollArea className="h-36">
                          <div className="grid grid-cols-3 gap-2 pr-2 sm:grid-cols-4">
                            {notificationImages.map((asset) => {
                              const selected =
                                asset.publicId === form.imagePublicId ||
                                asset.url === form.imageUrl
                              return (
                                <div
                                  key={asset.id}
                                  role="button"
                                  tabIndex={0}
                                  className={cn(
                                    "group relative overflow-hidden rounded-lg border bg-muted/40 outline-none ring-primary transition",
                                    selected
                                      ? "border-primary ring-2"
                                      : "hover:border-primary/50"
                                  )}
                                  onClick={() => selectNotificationImage(asset)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault()
                                      selectNotificationImage(asset)
                                    }
                                  }}
                                >
                                  <img
                                    src={asset.url}
                                    alt="Notification upload"
                                    className="h-20 w-full object-cover"
                                  />
                                  <Button
                                    type="button"
                                    size="icon-sm"
                                    variant="secondary"
                                    className="absolute right-1 top-1 size-7 opacity-0 shadow-sm transition group-hover:opacity-100"
                                    disabled={deleteImageMutation.isPending}
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      deleteImageMutation.mutate(asset.id)
                                    }}
                                  >
                                    <XCircle className="size-3.5" />
                                  </Button>
                                </div>
                              )
                            })}
                          </div>
                        </ScrollArea>
                      ) : (
                        <div className="rounded-md border border-dashed py-5 text-center text-xs text-muted-foreground">
                          Uploaded notification images will appear here.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder="Order update, campaign, payout note..."
                />
              </div>
              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea
                  value={form.body}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      body: event.target.value,
                    }))
                  }
                  placeholder="Write the notification body"
                  rows={4}
                />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={form.type}
                    onValueChange={(value) =>
                      setForm((current) => {
                        const nextIsPromotion =
                          current.recipientType === "customers" &&
                          isCustomerPromotionType(value)
                        return {
                          ...current,
                          type: value,
                          path: nextIsPromotion
                            ? "/promo-details"
                            : current.path === "/promo-details"
                              ? "/(tabs)/home"
                              : current.path,
                          ctaLabel: nextIsPromotion ? current.ctaLabel : "",
                          ctaPath: nextIsPromotion ? current.ctaPath : "",
                        }
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="system">System</SelectItem>
                      <SelectItem value="promotion">Promotion</SelectItem>
                      <SelectItem value="support">Support</SelectItem>
                      <SelectItem value="order_status">Order status</SelectItem>
                      <SelectItem value="payout">Payout</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {isCustomerPromotionForm ? (
                  <div className="space-y-2">
                    <Label>Push tap opens</Label>
                    <Select
                      value={promoDestination}
                      onValueChange={(value) =>
                        setForm((current) => {
                          if (value === "restaurant_details") {
                            const restaurantId =
                              restaurantIdFromPath(current.path) ||
                              restaurantOptions[0]?.id ||
                              ""
                            return {
                              ...current,
                              path: restaurantId
                                ? `/restaurants/${restaurantId}`
                                : current.path,
                              ctaLabel: "",
                              ctaPath: "",
                            }
                          }
                          return {
                            ...current,
                            path: "/promo-details",
                          }
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="promo_details">Promo details</SelectItem>
                        <SelectItem value="restaurant_details">
                          Restaurant details
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {promoDestination === "restaurant_details" ? (
                      <Select
                        value={promoRestaurantId || restaurantOptions[0]?.id || ""}
                        onValueChange={(restaurantId) =>
                          setForm((current) => ({
                            ...current,
                            path: `/restaurants/${restaurantId}`,
                            ctaLabel: "",
                            ctaPath: "",
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose restaurant" />
                        </SelectTrigger>
                        <SelectContent>
                          {restaurantOptions.map((restaurant) => (
                            <SelectItem key={restaurant.id} value={restaurant.id}>
                              {restaurant.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        The backend adds the campaign ID automatically.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Open destination</Label>
                    <Select
                      value={openDestination}
                      onValueChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          path:
                            value === "custom"
                              ? current.path?.trim() || "/custom-path"
                              : destinationPath(value as DestinationPreset),
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {destinationOptions
                          .filter(
                            (option) =>
                              option.value !== "promo_details" &&
                              option.value !== "restaurant_details"
                          )
                          .map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {openDestination === "custom" ? (
                      <Input
                        value={form.path}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            path: event.target.value,
                          }))
                        }
                        placeholder="/existing-customer-app-route"
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {
                          destinationOptions.find(
                            (option) => option.value === openDestination
                          )?.helper
                        }
                      </p>
                    )}
                  </div>
                )}
              </div>
              {isCustomerPromotionForm ? (
                <div className="rounded-xl border bg-muted/20 p-3">
                  {promoDestination === "restaurant_details" ? (
                    <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
                      <div className="rounded-lg border bg-background p-3 text-sm">
                        <div className="font-medium">Direct restaurant promotion</div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Push tap will open the selected restaurant menu directly.
                          Promo details CTA is disabled for this mode.
                        </p>
                        <div className="mt-3 rounded-lg border bg-muted/30 p-3">
                          <p className="text-xs text-muted-foreground">
                            Selected restaurant
                          </p>
                          <p className="mt-1 font-semibold">
                            {selectedPromoRestaurant?.name ||
                              "Choose a restaurant above"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {selectedPromoRestaurant?.city || "No city available"}
                          </p>
                        </div>
                      </div>
                      <div className="rounded-2xl border bg-background p-3 shadow-sm">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-muted-foreground">
                            Push preview
                          </span>
                          <Badge variant="outline">Restaurant</Badge>
                        </div>
                        {form.imageUrl ? (
                          <img
                            src={form.imageUrl}
                            alt="Restaurant promo preview"
                            className="mb-3 h-28 w-full rounded-xl object-cover"
                          />
                        ) : (
                          <div className="mb-3 flex h-28 items-center justify-center rounded-xl bg-rose-50 text-primary">
                            <Store className="size-8" />
                          </div>
                        )}
                        <p className="line-clamp-2 text-sm font-semibold">
                          {previewTitle}
                        </p>
                        <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                          {previewBody}
                        </p>
                        <div className="mt-3 rounded-full border bg-muted/40 px-3 py-2 text-center text-xs font-semibold">
                          Opens {selectedPromoRestaurant?.name || "restaurant"}
                        </div>
                      </div>
                    </div>
                  ) : (
                  <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
                    <div className="space-y-3">
                      <label className="flex items-start gap-3 rounded-lg border bg-background p-3 text-sm">
                        <Checkbox
                          checked={ctaEnabled}
                          onCheckedChange={(checked) =>
                            setForm((current) =>
                              checked === true
                                ? {
                                    ...current,
                                    ctaLabel:
                                      current.ctaLabel?.trim() ||
                                      "Browse restaurants",
                                    ctaPath:
                                      current.ctaPath?.trim() || "/(tabs)/browse",
                                  }
                                : {
                                    ...current,
                                    ctaLabel: "",
                                    ctaPath: "",
                                  }
                            )
                          }
                        />
                        <span>
                          Show CTA button on promo details
                          <span className="block text-xs text-muted-foreground">
                            Off means the offer page shows only image and text.
                          </span>
                        </span>
                      </label>

                      {ctaEnabled ? (
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>CTA button label</Label>
                            <Input
                              value={form.ctaLabel ?? ""}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  ctaLabel: event.target.value,
                                }))
                              }
                              placeholder="Order now"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>CTA destination</Label>
                            <Select
                              value={ctaDestination}
                              onValueChange={(value) =>
                                setForm((current) => ({
                                  ...current,
                                  ctaPath:
                                    value === "custom"
                                      ? current.ctaPath?.trim() || "/custom-path"
                                      : destinationPath(value as DestinationPreset),
                                }))
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {destinationOptions
                                  .filter(
                                    (option) =>
                                      option.value !== "promo_details" &&
                                      option.value !== "restaurant_details" &&
                                      option.value !== "none"
                                  )
                                  .map((option) => (
                                    <SelectItem
                                      key={option.value}
                                      value={option.value}
                                    >
                                      {option.label}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                            {ctaDestination === "custom" ? (
                              <Input
                                value={form.ctaPath ?? ""}
                                onChange={(event) =>
                                  setForm((current) => ({
                                    ...current,
                                    ctaPath: event.target.value,
                                  }))
                                }
                                placeholder="/existing-customer-app-route"
                              />
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <div className="rounded-2xl border bg-background p-3 shadow-sm">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-muted-foreground">
                          Customer preview
                        </span>
                        <Badge variant="outline">Promo details</Badge>
                      </div>
                      {form.imageUrl ? (
                        <img
                          src={form.imageUrl}
                          alt="Promo preview"
                          className="mb-3 h-28 w-full rounded-xl object-cover"
                        />
                      ) : (
                        <div className="mb-3 flex h-28 items-center justify-center rounded-xl bg-rose-50 text-3xl">
                          🍔
                        </div>
                      )}
                      <p className="line-clamp-2 text-sm font-semibold">
                        {previewTitle}
                      </p>
                      <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                        {previewBody}
                      </p>
                      {ctaEnabled ? (
                        <div className="mt-3 rounded-full bg-primary px-3 py-2 text-center text-xs font-semibold text-primary-foreground">
                          {form.ctaLabel || "Order now"}
                        </div>
                      ) : (
                        <p className="mt-3 text-xs text-muted-foreground">
                          No CTA button
                        </p>
                      )}
                    </div>
                  </div>
                  )}
                </div>
              ) : null}
              <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                <Checkbox
                  checked={form.pushEnabled}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({
                      ...current,
                      pushEnabled: checked === true,
                    }))
                  }
                />
                <span>
                  Send push when supported
                  <span className="block text-xs text-muted-foreground">
                    Customers, restaurant owners, and riders can receive push when they have an active token.
                  </span>
                </span>
              </label>
              <div className="rounded-lg border p-3">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={scheduleMode}
                    onCheckedChange={(checked) =>
                      setScheduleMode(checked === true)
                    }
                  />
                  <span>
                    Schedule for later
                    <span className="block text-xs text-muted-foreground">
                      Future notifications will be sent by the backend
                      scheduler.
                    </span>
                  </span>
                </label>
                {scheduleMode ? (
                  <div className="mt-3 space-y-2">
                    <Label>Schedule date and time</Label>
                    <Input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(event) => setScheduledAt(event.target.value)}
                    />
                  </div>
                ) : null}
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                  <div className="space-y-2">
                    <Label>Test notification</Label>
                    <Select value={testRecipientId} onValueChange={setTestRecipientId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a test recipient" />
                      </SelectTrigger>
                      <SelectContent>
                        {recipientOptions.map((recipient) => (
                          <SelectItem key={recipient.id} value={recipient.id}>
                            {recipient.title} - {recipient.subtitle}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Sends only to this recipient and does not create campaign
                      history or analytics.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={sendMutation.isPending || isUploadingImage}
                    onClick={sendTestNotification}
                  >
                    {sendMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    Send test
                  </Button>
                </div>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={sendMutation.isPending || isUploadingImage}
              >
                {sendMutation.isPending || isUploadingImage ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : scheduleMode ? (
                  <CalendarClock className="size-4" />
                ) : (
                  <Send className="size-4" />
                )}
                {scheduleMode ? "Schedule notification" : "Send notification"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="size-4" />
                  Area activity history
                </CardTitle>
                <CardDescription>
                  Notifications and promotional pushes scoped by the selected top-bar area.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => notificationsQuery.refetch()}
                disabled={notificationsQuery.isFetching}
              >
                {notificationsQuery.isFetching ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCcw className="size-4" />
                )}
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 xl:grid-cols-[minmax(240px,1fr)_170px_160px_160px_160px_140px_auto]">
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
                placeholder="Search notifications"
              />
              <Select
                value={kind}
                onValueChange={(value) => {
                  setKind(value as HistoryKindFilter)
                  setPage(1)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All activity</SelectItem>
                  <SelectItem value="notifications">Notifications</SelectItem>
                  <SelectItem value="push">Promotional push</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={source}
                onValueChange={(value) => {
                  setSource(value as SourceFilter)
                  setPage(1)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  <SelectItem value="customer">Customers</SelectItem>
                  <SelectItem value="owner">Owners</SelectItem>
                  <SelectItem value="rider">Riders</SelectItem>
                  <SelectItem value="campaign">Campaigns</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="ops">Ops alerts</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={recipientTypeFilter}
                onValueChange={(value) => {
                  setRecipientTypeFilter(value as RecipientTypeFilter)
                  setPage(1)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All recipients</SelectItem>
                  <SelectItem value="customers">Customers</SelectItem>
                  <SelectItem value="owners">Owners</SelectItem>
                  <SelectItem value="riders">Riders</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={deliveryStatus}
                onValueChange={(value) => {
                  setDeliveryStatus(value as DeliveryStatusFilter)
                  setPage(1)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All delivery</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="push_ready">Push ready</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="campaign">Campaign</SelectItem>
                  <SelectItem value="in_app">In app</SelectItem>
                  <SelectItem value="in_app_only">In-app only</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={status}
                onValueChange={(value) => {
                  setStatus(value as StatusFilter)
                  setPage(1)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="unread">Unread</SelectItem>
                  <SelectItem value="read">Read</SelectItem>
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" onClick={resetFilters}>
                <RefreshCcw className="size-4" />
                Reset
              </Button>
            </div>

            {activeFilterCount > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                {search.trim() ? (
                  <Badge variant="outline" className="bg-background">
                    Search: {search.trim()}
                  </Badge>
                ) : null}
                {kind !== "all" ? (
                  <Badge variant="outline" className="bg-background">
                    {historyKindLabel(kind)}
                  </Badge>
                ) : null}
                {source !== "all" ? (
                  <Badge variant="outline" className={sourceBadgeClass(source as AdminNotificationCenterItem["source"])}>
                    {sourceLabel(source as AdminNotificationCenterItem["source"])}
                  </Badge>
                ) : null}
                {recipientTypeFilter !== "all" ? (
                  <Badge variant="outline" className="bg-background">
                    {recipientTypeLabel(recipientTypeFilter)}
                  </Badge>
                ) : null}
                {deliveryStatus !== "all" ? (
                  <Badge variant="outline" className={deliveryBadgeClass(deliveryStatus)}>
                    {deliveryStatusLabel(deliveryStatus)}
                  </Badge>
                ) : null}
                {status !== "all" ? (
                  <Badge variant="outline" className="bg-background">
                    {status === "unread" ? "Unread only" : "Read only"}
                  </Badge>
                ) : null}
                <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
                  Clear filters
                </Button>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead>Notification</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Area</TableHead>
                    <TableHead>Delivery</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notifications.map((item) => {
                    const Icon = notificationIcon(item)
                    return (
                      <TableRow
                        key={`${item.source}-${item.id}`}
                        className="cursor-pointer align-top hover:bg-muted/40"
                        onClick={() => setSelectedItem(item)}
                      >
                        <TableCell>
                          <div className="max-w-[340px]">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                                <Icon className="size-4" />
                              </span>
                              <p className="truncate font-medium">
                                {item.title}
                              </p>
                              <Badge
                                variant="outline"
                                className={sourceBadgeClass(item.source)}
                              >
                                {sourceLabel(item.source)}
                              </Badge>
                              <Badge
                                variant="outline"
                                className={readBadgeClass(item.isRead)}
                              >
                                {item.isRead ? "Read" : "Unread"}
                              </Badge>
                              <Badge variant="outline" className="bg-background">
                                {isPromotionalPushItem(item)
                                  ? "Push"
                                  : "Notification"}
                              </Badge>
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                              {item.description}
                            </p>
                            {item.imageUrl ? (
                              <p className="mt-1 truncate text-xs text-muted-foreground">
                                Image campaign
                              </p>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">
                            {item.recipientName || "Audience"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.restaurantName
                              ? `${recipientLabel(item.source)} • ${item.restaurantName}`
                              : item.recipientPhone || item.type}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-background">
                            {notificationScopeLabel(item, adminZoneScope)}
                          </Badge>
                          {item.zoneId || item.districtId ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Scoped target
                            </p>
                          ) : adminZoneScope.type === "all" ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              All areas
                            </p>
                          ) : (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Area matched
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={deliveryBadgeClass(item.deliveryStatus)}
                          >
                            {deliveryStatusLabel(item.deliveryStatus)}
                          </Badge>
                          {item.source === "campaign" ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {formatNumber(item.openCount)} opens /{" "}
                              {formatNumber(item.sentCount)} sent
                            </p>
                          ) : null}
                          {item.source === "scheduled" ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {formatNumber(item.openCount)} opens /{" "}
                              {formatNumber(item.totalTargets)} targets
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {formatDateTime(item.createdAt)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {notificationsQuery.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                          <Loader2 className="size-4 animate-spin" />
                          Loading notifications...
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {!notificationsQuery.isLoading &&
                  notifications.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <div className="py-8 text-center text-sm text-muted-foreground">
                          No notifications matched these filters.
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-col gap-4 rounded-xl border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {notifications.length} of {formatNumber(data?.total)}{" "}
                item(s)
                {notificationsQuery.isFetching && !notificationsQuery.isLoading
                  ? " - refreshing"
                  : ""}
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Select
                  value={`${pageSize}`}
                  onValueChange={(value) => {
                    setPageSize(Number(value))
                    setPage(1)
                  }}
                >
                  <SelectTrigger className="w-full sm:w-32">
                    <SelectValue placeholder="Rows" />
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
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={safePage <= 1 || notificationsQuery.isFetching}
                    onClick={() =>
                      setPage((current) => Math.max(1, current - 1))
                    }
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={
                      safePage >= pageCount || notificationsQuery.isFetching
                    }
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
      </div>

      <Sheet
        open={composerMode === "notification"}
        onOpenChange={(open) => !open && setComposerMode(null)}
      >
        <SheetContent className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-2xl!">
          <SheetHeader className="border-b px-6 py-5">
            <SheetTitle className="flex items-center gap-2">
              <Bell className="size-5" />
              New notification
            </SheetTitle>
            <SheetDescription>
              Send operational or account updates without campaign analytics.
            </SheetDescription>
          </SheetHeader>
          <form className="flex-1 space-y-5 overflow-y-auto p-6" onSubmit={submitForm}>
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Area scope</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {adminScopeDescription(adminZoneScope)}
                  </p>
                </div>
                <Badge variant="outline" className="bg-background">
                  {adminScopeTitle(adminZoneScope)}
                </Badge>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Recipient type</Label>
                <Select
                  value={form.recipientType}
                  onValueChange={(value) =>
                    setForm((current) => {
                      const recipientType =
                        value as AdminNotificationSendPayload["recipientType"]
                      return {
                        ...current,
                        recipientType,
                        recipientIds: [],
                        pushEnabled: true,
                      }
                    })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customers">Customers</SelectItem>
                    <SelectItem value="owners">Restaurant owners</SelectItem>
                    <SelectItem value="riders">Riders</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Audience</Label>
                <Select
                  value={form.audience}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      audience: value as "all" | "selected",
                      recipientIds: [],
                    }))
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All eligible in scope</SelectItem>
                    <SelectItem value="selected">Selected only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.audience === "selected" ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>Recipients</Label>
                  <Badge variant="outline">{selectedCount}</Badge>
                </div>
                <ScrollArea className="h-52 rounded-lg border">
                  <div className="space-y-2 p-3">
                    {recipientOptions.map((recipient) => (
                      <label
                        key={recipient.id}
                        className="flex cursor-pointer items-start gap-3 rounded-md border bg-background p-2"
                      >
                        <Checkbox
                          checked={selectedIds.has(recipient.id)}
                          onCheckedChange={(checked) =>
                            toggleRecipient(recipient.id, checked === true)
                          }
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">
                            {recipient.title}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {recipient.subtitle}
                          </span>
                        </span>
                      </label>
                    ))}
                    {!recipientOptions.length ? (
                      <p className="p-4 text-center text-sm text-muted-foreground">
                        No recipients found for this area scope.
                      </p>
                    ) : null}
                  </div>
                </ScrollArea>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Notification type</Label>
                <Select
                  value={form.type}
                  onValueChange={(value) =>
                    setForm((current) => ({ ...current, type: value }))
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">System update</SelectItem>
                    <SelectItem value="order_status">Order status</SelectItem>
                    <SelectItem value="restaurant_status">Restaurant status</SelectItem>
                    <SelectItem value="support">Support</SelectItem>
                    <SelectItem value="review">Review</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Open destination</Label>
                <Select
                  value={openDestination}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      path:
                        value === "custom"
                          ? current.path?.trim() || "/custom-path"
                          : destinationPath(value as DestinationPreset),
                    }))
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {destinationOptions
                      .filter(
                        (option) =>
                          option.value !== "promo_details" &&
                          option.value !== "restaurant_details"
                      )
                      .map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {openDestination === "custom" ? (
              <Input
                value={form.path}
                onChange={(event) =>
                  setForm((current) => ({ ...current, path: event.target.value }))
                }
                placeholder="/existing-app-route"
              />
            ) : null}

            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
                maxLength={120}
                placeholder="Short notification title"
              />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                value={form.body}
                onChange={(event) =>
                  setForm((current) => ({ ...current, body: event.target.value }))
                }
                maxLength={500}
                rows={4}
                placeholder="Clear message for the recipient"
              />
            </div>

            <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
              <Checkbox
                checked={form.pushEnabled}
                onCheckedChange={(checked) =>
                  setForm((current) => ({
                    ...current,
                    pushEnabled: checked === true,
                  }))
                }
              />
              <span>
                Send push when supported
                <span className="block text-xs text-muted-foreground">
                  Customers, restaurant owners, and riders can receive push when they have an active token.
                </span>
              </span>
            </label>

            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="space-y-2">
                <Label>Test recipient</Label>
                <Select value={testRecipientId} onValueChange={setTestRecipientId}>
                  <SelectTrigger><SelectValue placeholder="Choose recipient" /></SelectTrigger>
                  <SelectContent>
                    {recipientOptions.map((recipient) => (
                      <SelectItem key={recipient.id} value={recipient.id}>
                        {recipient.title} - {recipient.subtitle}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={sendMutation.isPending}
                onClick={sendTestNotification}
              >
                <Send className="size-4" />
                Send test
              </Button>
            </div>

            <div className="rounded-lg border p-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={scheduleMode}
                  onCheckedChange={(checked) => setScheduleMode(checked === true)}
                />
                Schedule for later
              </label>
              {scheduleMode ? (
                <Input
                  className="mt-3"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(event) => setScheduledAt(event.target.value)}
                />
              ) : null}
            </div>

            <Button type="submit" className="w-full" disabled={sendMutation.isPending}>
              {sendMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : scheduleMode ? (
                <CalendarClock className="size-4" />
              ) : (
                <Send className="size-4" />
              )}
              {scheduleMode ? "Schedule notification" : "Send notification"}
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet
        open={composerMode === "push"}
        onOpenChange={(open) => !open && setComposerMode(null)}
      >
        <SheetContent className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-3xl!">
          <SheetHeader className="border-b px-6 py-5">
            <SheetTitle className="flex items-center gap-2">
              <Megaphone className="size-5" />
              Promotional push
            </SheetTitle>
            <SheetDescription>
              Promotional push campaigns for customers, restaurant owners, and riders.
            </SheetDescription>
          </SheetHeader>
          <form className="flex-1 space-y-5 overflow-y-auto p-6" onSubmit={submitForm}>
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Area target</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {adminScopeDescription(adminZoneScope)}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    All areas sends to every eligible recipient. A selected zone or district restricts the campaign to recipients connected to that area.
                  </p>
                </div>
                <Badge variant="outline" className="bg-background">
                  {adminScopeTitle(adminZoneScope)}
                </Badge>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {promotionalSections.map((section) => {
                const Icon = section.icon
                const isActive = form.recipientType === section.value
                return (
                  <button
                    key={section.value}
                    type="button"
                    className={cn(
                      "rounded-lg border p-3 text-left transition hover:border-primary/50",
                      isActive
                        ? "border-primary bg-primary/10 text-primary"
                        : "bg-background"
                    )}
                    onClick={() => setPromotionalRecipientType(section.value)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex size-8 items-center justify-center rounded-md bg-background/80">
                        <Icon className="size-4" />
                      </span>
                      <span className="font-medium">{section.label}</span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {section.helper}
                    </p>
                  </button>
                )
              })}
            </div>

            {form.recipientType === "customers" ? (
              <div className="space-y-2">
                <Label>Customer audience</Label>
                <Select
                  value={form.customerAudienceType ?? "all_users"}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      customerAudienceType:
                        value as AdminNotificationSendPayload["customerAudienceType"],
                      audience: value === "selected_users" ? "selected" : "all",
                      recipientIds: [],
                    }))
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all_users">All users in area</SelectItem>
                    <SelectItem value="new_users">New users in area</SelectItem>
                    <SelectItem value="returning_users">Returning users in area</SelectItem>
                    <SelectItem value="selected_users">Specific customers</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {form.recipientType !== "customers" ? (
              <div className="space-y-2">
                <Label>
                  {form.recipientType === "owners"
                    ? "Restaurant owner audience"
                    : "Rider audience"}
                </Label>
                <Select
                  value={form.audience}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      audience: value as "all" | "selected",
                      recipientIds: [],
                    }))
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {form.recipientType === "owners"
                        ? "All restaurants in area"
                        : "All riders in area"}
                    </SelectItem>
                    <SelectItem value="selected">
                      {form.recipientType === "owners"
                        ? "Selected restaurants"
                        : "Selected riders"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {form.audience === "selected" ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>
                    {form.recipientType === "customers"
                      ? "Customers"
                      : form.recipientType === "owners"
                        ? "Restaurants"
                        : "Riders"}
                  </Label>
                  <Badge variant="outline">{selectedCount}</Badge>
                </div>
                <ScrollArea className="h-48 rounded-lg border">
                  <div className="space-y-2 p-3">
                    {recipientOptions.map((recipient) => (
                      <label
                        key={recipient.id}
                        className="flex cursor-pointer items-start gap-3 rounded-md border bg-background p-2"
                      >
                        <Checkbox
                          checked={selectedIds.has(recipient.id)}
                          onCheckedChange={(checked) =>
                            toggleRecipient(recipient.id, checked === true)
                          }
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">
                            {recipient.title}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {recipient.subtitle}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            ) : null}

            {form.recipientType === "customers" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Smart segment</Label>
                  <Select
                    value={form.customerGroupKey || "none"}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        customerGroupKey: value === "none" ? "" : value,
                      }))
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No smart segment</SelectItem>
                      {smartCustomerGroups.map((group) => (
                        <SelectItem key={group.value} value={group.value}>
                          {group.label}
                        </SelectItem>
                      ))}
                      {(customerGroupsQuery.data?.items ?? []).length ? (
                        <SelectGroup>
                          <SelectLabel>Saved groups</SelectLabel>
                          {(customerGroupsQuery.data?.items ?? []).map(
                            (group: AdminCustomerGroup) => (
                              <SelectItem key={group.id} value={`manual:${group.id}`}>
                                {group.name} ({group.memberCount})
                              </SelectItem>
                            )
                          )}
                        </SelectGroup>
                      ) : null}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Restaurant filter</Label>
                  <Select
                    value={form.restaurantScope ?? "all_restaurants"}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        restaurantScope:
                          value as AdminNotificationSendPayload["restaurantScope"],
                        selectedRestaurantIds:
                          value === "selected_restaurants"
                            ? current.selectedRestaurantIds ?? []
                            : [],
                      }))
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_restaurants">All restaurants in area</SelectItem>
                      <SelectItem value="selected_restaurants">Selected restaurants</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : null}

            {form.recipientType === "customers" &&
            form.restaurantScope === "selected_restaurants" ? (
              <ScrollArea className="h-44 rounded-lg border bg-background">
                <div className="space-y-2 p-3">
                  {(restaurantsQuery.data?.items ?? []).map((restaurant) => {
                    const selected = new Set(form.selectedRestaurantIds ?? [])
                    return (
                      <label
                        key={restaurant.id}
                        className="flex cursor-pointer items-start gap-3 rounded-md border p-2"
                      >
                        <Checkbox
                          checked={selected.has(restaurant.id)}
                          onCheckedChange={(checked) =>
                            setForm((current) => ({
                              ...current,
                              selectedRestaurantIds:
                                checked === true
                                  ? [...(current.selectedRestaurantIds ?? []), restaurant.id]
                                  : (current.selectedRestaurantIds ?? []).filter((id) => id !== restaurant.id),
                            }))
                          }
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{restaurant.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{restaurant.city}</span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </ScrollArea>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, title: event.target.value }))
                  }
                  maxLength={120}
                  placeholder="Campaign title"
                />
              </div>
              <div className="space-y-2">
                <Label>Content mode</Label>
                <Select
                  value={form.contentType}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      contentType: value as AdminNotificationSendPayload["contentType"],
                    }))
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="image">Image</SelectItem>
                    <SelectItem value="image_text">Image + text</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                value={form.body}
                onChange={(event) =>
                  setForm((current) => ({ ...current, body: event.target.value }))
                }
                maxLength={500}
                rows={4}
                placeholder="Short campaign message"
              />
            </div>

            {form.recipientType === "customers" ? (
              <div className="space-y-3 rounded-lg border bg-background p-3">
                <div className="space-y-1">
                  <Label>Attach voucher</Label>
                  <p className="text-xs text-muted-foreground">
                    Optional. Choose an existing active voucher; Foodbela will show its code,
                    expiry, and minimum order inside the customer offer details.
                  </p>
                </div>
                <Select
                  value={form.voucherId || "none"}
                  onValueChange={(value) =>
                    applyVoucherSelection(value === "none" ? "" : value)
                  }
                  disabled={vouchersQuery.isLoading}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        vouchersQuery.isLoading ? "Loading vouchers..." : "No voucher attached"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No voucher</SelectItem>
                    {availableVouchers.map((voucher) => (
                      <SelectItem key={voucher._id} value={voucher._id}>
                        {voucher.display?.title || voucher.name} - {formatVoucherCode(voucher) || formatVoucherDiscount(voucher)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {vouchersQuery.isError ? (
                  <p className="text-xs text-destructive">
                    Could not load vouchers for the selected area.
                  </p>
                ) : null}
                {selectedVoucher ? (
                  <div className="grid gap-3 rounded-md border border-dashed border-primary/40 bg-primary/5 p-3 text-sm sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Voucher</p>
                      <p className="font-semibold text-foreground">
                        {selectedVoucher.display?.title || selectedVoucher.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatVoucherDiscount(selectedVoucher)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Code</p>
                      <p className="font-mono text-base font-bold text-primary">
                        {formatVoucherCode(selectedVoucher) || "Auto applied"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {selectedVoucher.mode === "auto" ? "Applies automatically" : "Customer enters this code"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Rules</p>
                      <p className="text-muted-foreground">
                        Min order {formatCurrency(selectedVoucher.minimumOrderAmount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Expiry</p>
                      <p className="text-muted-foreground">
                        {selectedVoucher.endsAt ? formatDateTime(selectedVoucher.endsAt) : "No expiry"}
                      </p>
                    </div>
                    <div className="sm:col-span-2 flex flex-wrap gap-2">
                      <Badge variant="secondary">
                        {deliveryStatusLabel(selectedVoucher.audienceType)}
                      </Badge>
                      <Badge variant="outline">
                        {deliveryStatusLabel(selectedVoucher.scopeType)}
                      </Badge>
                      {form.customerAudienceType === "selected_users" ||
                      form.audience === "selected" ||
                      selectedVoucher.audienceType === "selected_users" ? (
                        <Badge className="bg-emerald-100 text-emerald-700">
                          Personal offer
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                ) : form.voucherId ? (
                  <p className="text-xs text-muted-foreground">
                    Selected voucher is no longer available in this area. Choose another voucher.
                  </p>
                ) : null}
              </div>
            ) : null}

            {form.contentType !== "text" ? (
              <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
                <div className="space-y-2">
                  <Label>Campaign image</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) void uploadNotificationImage(file)
                    }}
                  />
                  <Input
                    value={form.imageUrl ?? ""}
                    onChange={(event) => {
                      clearLocalImagePreview()
                      setForm((current) => ({
                        ...current,
                        imageUrl: event.target.value,
                        imagePublicId: "",
                      }))
                    }}
                    placeholder="Or paste image URL"
                  />
                </div>
                <div className="rounded-lg border bg-muted/20 p-2">
                  {campaignImagePreviewUrl ? (
                    <img
                      src={campaignImagePreviewUrl}
                      alt="Campaign preview"
                      className="h-32 w-full rounded-md object-cover"
                    />
                  ) : (
                    <div className="flex h-32 items-center justify-center rounded-md bg-background text-muted-foreground">
                      <ImageIcon className="size-6" />
                    </div>
                  )}
                  {form.imageUrl ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2 w-full"
                      disabled={deleteImageMutation.isPending}
                      onClick={() => {
                        if (form.imagePublicId) {
                          deleteImageMutation.mutate(form.imagePublicId)
                          return
                        }
                        clearLocalImagePreview()
                        setForm((current) => ({
                          ...current,
                          imageUrl: "",
                          imagePublicId: "",
                          contentType: "text",
                        }))
                      }}
                    >
                      {deleteImageMutation.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <XCircle className="size-4" />
                      )}
                      Remove image
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {form.recipientType === "customers" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Push tap opens</Label>
                  <Select
                    value={promoDestination}
                    onValueChange={(value) =>
                      setForm((current) => {
                        if (value === "restaurant_details") {
                          const restaurantId =
                            restaurantIdFromPath(current.path) ||
                            restaurantOptions[0]?.id ||
                            ""
                          return {
                            ...current,
                            path: restaurantId ? `/restaurants/${restaurantId}` : current.path,
                            ctaLabel: "",
                            ctaPath: "",
                          }
                        }
                        if (value === "offers") {
                          return { ...current, path: "/offers" }
                        }
                        return { ...current, path: "/promo-details" }
                      })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="promo_details">Promo details</SelectItem>
                      <SelectItem value="offers">Offers screen</SelectItem>
                      <SelectItem value="restaurant_details">Restaurant details</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Conversion window</Label>
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    value={form.conversionWindowDays ?? 7}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        conversionWindowDays: Number(event.target.value || 7),
                      }))
                    }
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Push tap opens</Label>
                <Select
                  value={form.path || (form.recipientType === "owners" ? "/(tabs)/today" : "/(app)/available")}
                  onValueChange={(value) =>
                    setForm((current) => ({ ...current, path: value }))
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(form.recipientType === "owners"
                      ? ownerPromotionPathOptions
                      : riderPromotionPathOptions
                    ).map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.recipientType === "customers" &&
            promoDestination === "restaurant_details" ? (
              <Select
                value={promoRestaurantId || restaurantOptions[0]?.id || ""}
                onValueChange={(restaurantId) =>
                  setForm((current) => ({
                    ...current,
                    path: `/restaurants/${restaurantId}`,
                    ctaLabel: "",
                    ctaPath: "",
                  }))
                }
              >
                <SelectTrigger><SelectValue placeholder="Choose restaurant" /></SelectTrigger>
                <SelectContent>
                  {restaurantOptions.map((restaurant) => (
                    <SelectItem key={restaurant.id} value={restaurant.id}>
                      {restaurant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : form.recipientType === "customers" ? (
              <div className="rounded-lg border p-3">
                <label className="flex items-start gap-3 text-sm">
                  <Checkbox
                    checked={ctaEnabled}
                    onCheckedChange={(checked) =>
                      setForm((current) =>
                        checked === true
                          ? {
                              ...current,
                              ctaLabel: current.ctaLabel?.trim() || "Browse restaurants",
                              ctaPath: current.ctaPath?.trim() || "/(tabs)/browse",
                            }
                          : { ...current, ctaLabel: "", ctaPath: "" }
                      )
                    }
                  />
                  <span>
                    Show CTA button on promo details
                    <span className="block text-xs text-muted-foreground">
                      Use this when the campaign should continue to browse, cart, or a custom route.
                    </span>
                  </span>
                </label>
                {ctaEnabled ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Input
                      value={form.ctaLabel ?? ""}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, ctaLabel: event.target.value }))
                      }
                      placeholder="CTA label"
                    />
                    <Input
                      value={form.ctaPath ?? ""}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, ctaPath: event.target.value }))
                      }
                      placeholder="/(tabs)/browse"
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">
                    {form.recipientType === "customers"
                      ? "Customer preview"
                      : form.recipientType === "owners"
                        ? "Owner preview"
                        : "Rider preview"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {form.recipientType === "customers"
                      ? promoDestination === "restaurant_details"
                        ? `Opens ${selectedPromoRestaurant?.name || "selected restaurant"}`
                        : promoDestination === "offers"
                          ? "Opens customer offers"
                        : "Opens promo details"
                      : form.recipientType === "owners"
                        ? "Opens restaurant owner app"
                        : "Opens rider app"}
                  </p>
                </div>
                <Badge variant="outline">
                  {form.recipientType === "customers"
                    ? "Customer promotion"
                    : form.recipientType === "owners"
                      ? "Owner promotion"
                      : "Rider promotion"}
                </Badge>
              </div>
              <p className="mt-3 font-semibold">{previewTitle}</p>
              <p className="mt-1 text-sm text-muted-foreground">{previewBody}</p>
              {form.recipientType === "customers" && selectedVoucher ? (
                <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-dashed border-primary/50 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary">
                  <ReceiptText className="size-4" />
                  {formatVoucherCode(selectedVoucher) || "Auto applied"}
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="space-y-2">
                <Label>
                  {form.recipientType === "customers"
                    ? "Test customer"
                    : form.recipientType === "owners"
                      ? "Test restaurant"
                      : "Test rider"}
                </Label>
                <Select value={testRecipientId} onValueChange={setTestRecipientId}>
                  <SelectTrigger><SelectValue placeholder="Choose customer" /></SelectTrigger>
                  <SelectContent>
                    {recipientOptions.map((recipient) => (
                      <SelectItem key={recipient.id} value={recipient.id}>
                        {recipient.title} - {recipient.subtitle}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={sendMutation.isPending || isUploadingImage}
                onClick={sendTestNotification}
              >
                <Send className="size-4" />
                Send test
              </Button>
            </div>

            <div className="rounded-lg border p-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={scheduleMode}
                  onCheckedChange={(checked) => setScheduleMode(checked === true)}
                />
                Schedule for later
              </label>
              {scheduleMode ? (
                <Input
                  className="mt-3"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(event) => setScheduledAt(event.target.value)}
                />
              ) : null}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={sendMutation.isPending || isUploadingImage}
            >
              {sendMutation.isPending || isUploadingImage ? (
                <Loader2 className="size-4 animate-spin" />
              ) : scheduleMode ? (
                <CalendarClock className="size-4" />
              ) : (
                <Megaphone className="size-4" />
              )}
              {scheduleMode ? "Schedule promotional push" : "Send promotional push"}
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet
        open={Boolean(selectedItem && !isPromotionalPushItem(selectedItem))}
        onOpenChange={(open) => !open && setSelectedItem(null)}
      >
        <SheetContent className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-2xl!">
          {selectedItem && !isPromotionalPushItem(selectedItem) ? (
            <>
              <SheetHeader className="border-b px-6 py-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <SheetTitle className="flex items-center gap-2">
                      {React.createElement(notificationIcon(selectedItem), {
                        className: "size-5",
                      })}
                      Notification details
                    </SheetTitle>
                    <SheetDescription>
                      Readable delivery, recipient, and routing information.
                    </SheetDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!selectedItem.isRead &&
                    (selectedItem.source === "customer" ||
                      selectedItem.source === "owner" ||
                      selectedItem.source === "rider" ||
                      selectedItem.source === "ops") ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={markReadMutation.isPending}
                        onClick={() =>
                          markReadMutation.mutate({
                            source: selectedItem.source as "customer" | "owner" | "rider" | "ops",
                            id: selectedItem.id,
                          })
                        }
                      >
                        {markReadMutation.isPending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="size-4" />
                        )}
                        Mark read
                      </Button>
                    ) : null}
                    {selectedItem.source === "scheduled" &&
                    selectedItem.deliveryStatus === "scheduled" ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={cancelScheduleMutation.isPending}
                        onClick={() =>
                          cancelScheduleMutation.mutate(selectedItem.id)
                        }
                      >
                        {cancelScheduleMutation.isPending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <XCircle className="size-4" />
                        )}
                        Cancel
                      </Button>
                    ) : null}
                    {selectedItem.source === "scheduled" &&
                    selectedItem.deliveryStatus === "failed" ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={retryScheduleMutation.isPending}
                        onClick={() =>
                          retryScheduleMutation.mutate(selectedItem.id)
                        }
                      >
                        {retryScheduleMutation.isPending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <RefreshCcw className="size-4" />
                        )}
                        Retry
                      </Button>
                    ) : null}
                  </div>
                </div>
              </SheetHeader>
              <div className="flex-1 space-y-5 overflow-y-auto p-6">
                {selectedItem.source === "ops" &&
                getLateDetailRows(selectedItem).length > 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Clock3 className="size-4 text-amber-700" />
                      <p className="font-medium">Late timing details</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {getLateDetailRows(selectedItem).map((row) => (
                        <div key={row.label} className="rounded-md border bg-background p-3">
                          <p className="text-xs text-muted-foreground">{row.label}</p>
                          <p className="mt-1 text-base font-semibold">
                            {formatMetadataValue(row.value)}
                          </p>
                          {row.helper ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {row.helper}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={sourceBadgeClass(selectedItem.source)}
                    >
                      {sourceLabel(selectedItem.source)}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={deliveryBadgeClass(selectedItem.deliveryStatus)}
                    >
                      {deliveryStatusLabel(selectedItem.deliveryStatus)}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={readBadgeClass(selectedItem.isRead)}
                    >
                      {selectedItem.isRead ? "Read" : "Unread"}
                    </Badge>
                    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                      {notificationScopeLabel(selectedItem, adminZoneScope)}
                    </Badge>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">
                    {selectedItem.title}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {selectedItem.description}
                  </p>
                  {selectedItem.imageUrl ? (
                    <img
                      src={selectedItem.imageUrl}
                      alt={selectedItem.title}
                      className="mt-4 max-h-72 w-full rounded-lg border object-contain"
                    />
                  ) : null}
                  {selectedItem.voucherCode || selectedItem.voucherId ? (
                    <div className="mt-4 rounded-lg border border-dashed border-primary/40 bg-primary/10 p-3">
                      <p className="text-xs font-medium text-primary">Voucher code</p>
                      <p className="mt-1 text-lg font-semibold tracking-wide text-primary">
                        {selectedItem.voucherCode || "Auto applied"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {[
                          selectedItem.voucherLabel,
                          selectedItem.voucherMinOrder
                            ? `Min order ${selectedItem.voucherMinOrder}`
                            : "",
                          selectedItem.voucherExpiresAt
                            ? `Expires ${formatDateTime(selectedItem.voucherExpiresAt)}`
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" - ") || "Shown as a customer offer code"}
                      </p>
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">
                      {recipientLabel(selectedItem.source)}
                    </p>
                    <p className="mt-1 font-medium">
                      {selectedItem.recipientName || "Audience"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {selectedItem.restaurantName ||
                        selectedItem.recipientPhone ||
                        selectedItem.recipientId ||
                        "N/A"}
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Destination</p>
                    <p className="mt-1 break-all font-medium">
                      {destinationLabel(selectedItem.path)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Type: {selectedItem.type || "system"} - Content:{" "}
                      {selectedItem.contentType || "text"}
                    </p>
                    {selectedItem.ctaLabel || selectedItem.ctaPath ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        CTA: {selectedItem.ctaLabel || "Button"} -{" "}
                        {destinationLabel(selectedItem.ctaPath)}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Created</p>
                    <p className="mt-1 text-sm font-medium">
                      {formatDateTime(selectedItem.createdAt)}
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Read / sent</p>
                    <p className="mt-1 text-sm font-medium">
                      {formatDateTime(selectedItem.readAt || selectedItem.sentAt)}
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Area scope</p>
                    <p className="mt-1 text-sm font-medium">
                      {notificationScopeLabel(selectedItem, adminZoneScope)}
                    </p>
                  </div>
                </div>

                {selectedItem.failureReason ? (
                  <p className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                    {selectedItem.failureReason}
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <Sheet
        open={Boolean(selectedItem && isPromotionalPushItem(selectedItem))}
        onOpenChange={(open) => !open && setSelectedItem(null)}
      >
        <SheetContent className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-3xl! md:max-w-6xl!">
          {selectedItem && isPromotionalPushItem(selectedItem) ? (
            <>
              <SheetHeader className="border-b px-6 py-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <SheetTitle className="flex items-center gap-2">
                      {React.createElement(notificationIcon(selectedItem), {
                        className: "size-5",
                      })}
                      Push campaign details
                    </SheetTitle>
                    <SheetDescription>
                      Separate push delivery, audience, and engagement information.
                    </SheetDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!selectedItem.isRead &&
                    (selectedItem.source === "customer" ||
                      selectedItem.source === "owner" ||
                      selectedItem.source === "rider" ||
                      selectedItem.source === "ops") ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={markReadMutation.isPending}
                        onClick={() =>
                          markReadMutation.mutate({
                            source: selectedItem.source as "customer" | "owner" | "rider" | "ops",
                            id: selectedItem.id,
                          })
                        }
                      >
                        {markReadMutation.isPending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="size-4" />
                        )}
                        Mark read
                      </Button>
                    ) : null}
                    {selectedItem.source === "scheduled" &&
                    selectedItem.deliveryStatus === "scheduled" ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={cancelScheduleMutation.isPending}
                        onClick={() =>
                          cancelScheduleMutation.mutate(selectedItem.id)
                        }
                      >
                        {cancelScheduleMutation.isPending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <XCircle className="size-4" />
                        )}
                        Cancel
                      </Button>
                    ) : null}
                    {selectedItem.source === "scheduled" &&
                    selectedItem.deliveryStatus === "failed" ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={retryScheduleMutation.isPending}
                        onClick={() =>
                          retryScheduleMutation.mutate(selectedItem.id)
                        }
                      >
                        {retryScheduleMutation.isPending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <RefreshCcw className="size-4" />
                        )}
                        Retry
                      </Button>
                    ) : null}
                  </div>
                </div>
              </SheetHeader>
              <div className="flex-1 space-y-5 overflow-y-auto p-6">
                {selectedItem.source === "ops" &&
                getLateDetailRows(selectedItem).length > 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Clock3 className="size-4 text-amber-700" />
                      <p className="font-medium">Late timing details</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {getLateDetailRows(selectedItem).map((row) => (
                        <div key={row.label} className="rounded-md border bg-background p-3">
                          <p className="text-xs text-muted-foreground">{row.label}</p>
                          <p className="mt-1 text-lg font-semibold">
                            {formatMetadataValue(row.value)}
                          </p>
                          {row.helper ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {row.helper}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={sourceBadgeClass(selectedItem.source)}
                    >
                      {sourceLabel(selectedItem.source)}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={deliveryBadgeClass(
                        selectedItem.deliveryStatus
                      )}
                    >
                      {deliveryStatusLabel(selectedItem.deliveryStatus)}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={readBadgeClass(selectedItem.isRead)}
                    >
                      {selectedItem.isRead ? "Read" : "Unread"}
                    </Badge>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">
                    {selectedItem.title}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {selectedItem.description}
                  </p>
                  {selectedItem.imageUrl ? (
                    <img
                      src={selectedItem.imageUrl}
                      alt={selectedItem.title}
                      className="mt-4 max-h-80 w-full rounded-xl border object-contain"
                    />
                  ) : null}
                  {selectedItem.voucherCode || selectedItem.voucherId ? (
                    <div className="mt-4 rounded-lg border border-dashed border-primary/40 bg-primary/10 p-3">
                      <p className="text-xs font-medium text-primary">Voucher code</p>
                      <p className="mt-1 text-lg font-semibold tracking-wide text-primary">
                        {selectedItem.voucherCode || "Auto applied"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {[
                          selectedItem.voucherLabel,
                          selectedItem.voucherMinOrder
                            ? `Min order ${selectedItem.voucherMinOrder}`
                            : "",
                          selectedItem.voucherExpiresAt
                            ? `Expires ${formatDateTime(selectedItem.voucherExpiresAt)}`
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" - ") || "Shown as a customer offer code"}
                      </p>
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">
                      {recipientLabel(selectedItem.source)}
                    </p>
                    <p className="mt-1 font-medium">
                      {selectedItem.recipientName || "Audience"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {selectedItem.restaurantName ||
                        selectedItem.recipientPhone ||
                        selectedItem.recipientId ||
                        "N/A"}
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Destination</p>
                    <p className="mt-1 font-medium break-all">
                      {destinationLabel(selectedItem.path)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Type: {selectedItem.type || "system"} - Content:{" "}
                      {selectedItem.contentType || "text"}
                    </p>
                    {selectedItem.ctaLabel || selectedItem.ctaPath ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        CTA: {selectedItem.ctaLabel || "Button"} -{" "}
                        {destinationLabel(selectedItem.ctaPath)}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Created</p>
                    <p className="mt-1 text-sm font-medium">
                      {formatDateTime(selectedItem.createdAt)}
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Scheduled</p>
                    <p className="mt-1 text-sm font-medium">
                      {formatDateTime(selectedItem.scheduledAt)}
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Read / sent</p>
                    <p className="mt-1 text-sm font-medium">
                      {formatDateTime(
                        selectedItem.readAt || selectedItem.sentAt
                      )}
                    </p>
                  </div>
                </div>

                {isCampaignLike(selectedItem) ? (
                  <div className="rounded-lg border p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">Campaign timeline</p>
                        <p className="text-xs text-muted-foreground">
                          Full notification lifecycle from creation to engagement.
                        </p>
                      </div>
                      <Badge variant="outline" className={sourceBadgeClass(selectedItem.source)}>
                        {selectedItem.sendMode === "instant"
                          ? "Instant"
                          : selectedItem.sendMode === "cms"
                            ? "CMS"
                            : "Scheduled"}
                      </Badge>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-4">
                      {campaignTimelineSteps(selectedItem).map((step, index) => {
                        const isLast = index === campaignTimelineSteps(selectedItem).length - 1
                        return (
                          <div key={step.key} className="relative">
                            {!isLast ? (
                              <div className="absolute left-9 top-5 hidden h-px w-[calc(100%_-_1.5rem)] bg-border sm:block" />
                            ) : null}
                            <div className="relative flex gap-3 sm:block">
                              <div
                                className={cn(
                                  "flex size-10 items-center justify-center rounded-full border",
                                  campaignTimelineClass(step.tone)
                                )}
                              >
                                {step.tone === "done" ? (
                                  <CheckCircle2 className="size-4" />
                                ) : step.tone === "danger" ? (
                                  <XCircle className="size-4" />
                                ) : (
                                  <Clock3 className="size-4" />
                                )}
                              </div>
                              <div className="min-w-0 sm:mt-3">
                                <p className="text-sm font-medium">{step.label}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {step.helper}
                                </p>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : null}

                {isCampaignLike(selectedItem) &&
                (selectedItem.recipientType === "customers" ||
                  selectedItem.customerAudienceType) ? (
                  <div className="rounded-lg border p-4">
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-center gap-2">
                        <Megaphone className="size-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">Campaign rules</p>
                          <p className="text-xs text-muted-foreground">
                            Smart targeting, A/B test, and conversion window migrated from CMS push.
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={refreshConversionsMutation.isPending}
                        onClick={() =>
                          refreshConversionsMutation.mutate(
                            selectedItem.campaignId || selectedItem.id
                          )
                        }
                      >
                        {refreshConversionsMutation.isPending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <RefreshCcw className="size-4" />
                        )}
                        Refresh conversions
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={checkReceiptsMutation.isPending}
                        onClick={() =>
                          checkReceiptsMutation.mutate(
                            selectedItem.campaignId || selectedItem.id
                          )
                        }
                      >
                        {checkReceiptsMutation.isPending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <RefreshCcw className="size-4" />
                        )}
                        Check receipts
                      </Button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                      <div className="rounded-lg border bg-muted/20 p-3">
                        <p className="text-xs text-muted-foreground">Audience</p>
                        <p className="mt-1 font-semibold">
                          {deliveryStatusLabel(selectedItem.customerAudienceType || "all_users")}
                        </p>
                      </div>
                      <div className="rounded-lg border bg-muted/20 p-3">
                        <p className="text-xs text-muted-foreground">Smart segment</p>
                        <p className="mt-1 font-semibold">
                          {selectedItem.customerGroupKey
                            ? deliveryStatusLabel(selectedItem.customerGroupKey)
                            : "None"}
                        </p>
                      </div>
                      <div className="rounded-lg border bg-muted/20 p-3">
                        <p className="text-xs text-muted-foreground">Restaurant filter</p>
                        <p className="mt-1 font-semibold">
                          {selectedItem.restaurantScope === "selected_restaurants"
                            ? `${formatNumber(selectedItem.selectedRestaurantIds?.length)} selected`
                            : "No filter"}
                        </p>
                      </div>
                      <div className="rounded-lg border bg-muted/20 p-3">
                        <p className="text-xs text-muted-foreground">A/B test</p>
                        <p className="mt-1 font-semibold">
                          {selectedItem.abTest?.enabled
                            ? `Variant B ${selectedItem.abTest.splitPercent ?? 50}%`
                            : "Off"}
                        </p>
                      </div>
                      <div className="rounded-lg border bg-muted/20 p-3">
                        <p className="text-xs text-muted-foreground">Area scope</p>
                        <p className="mt-1 font-semibold">
                          {notificationScopeLabel(selectedItem, adminZoneScope)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-4">
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">
                          {selectedItem.conversionWindowDays ?? 7} day orders
                        </p>
                        <p className="text-lg font-semibold">
                          {formatNumber(selectedItem.conversions?.orderCount)}
                        </p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">Delivered</p>
                        <p className="text-lg font-semibold">
                          {formatNumber(selectedItem.conversions?.deliveredOrderCount)}
                        </p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">Revenue</p>
                        <p className="text-lg font-semibold">
                          {formatCurrency(selectedItem.conversions?.deliveredRevenue)}
                        </p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">Conversion</p>
                        <p className="text-lg font-semibold">
                          {formatNumber(selectedItem.conversions?.conversionRate)}%
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {isCampaignLike(selectedItem) ? (
                  <div className="rounded-lg border p-4">
                    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex items-center gap-2">
                        <ReceiptText className="size-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">Recipient report</p>
                          <p className="text-xs text-muted-foreground">
                            See who received, opened, or did not receive this notification.
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {recipientReportFilters.map((filter) => (
                          <Button
                            key={filter.value}
                            type="button"
                            size="sm"
                            variant={
                              recipientReportStatus === filter.value
                                ? "default"
                                : "outline"
                            }
                            onClick={() => setRecipientReportStatus(filter.value)}
                          >
                            {filter.label}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {recipientsQuery.isLoading ? (
                      <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        Loading recipient report...
                      </div>
                    ) : recipientsQuery.data?.unavailableReason ? (
                      <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                        {recipientsQuery.data.unavailableReason}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid gap-3 sm:grid-cols-4">
                          <div className="rounded-lg border bg-muted/20 p-3">
                            <p className="text-xs text-muted-foreground">Total</p>
                            <p className="text-lg font-semibold">
                              {formatNumber(recipientsQuery.data?.summary.total)}
                            </p>
                          </div>
                          <div className="rounded-lg border bg-muted/20 p-3">
                            <p className="text-xs text-muted-foreground">Received</p>
                            <p className="text-lg font-semibold">
                              {formatNumber(recipientsQuery.data?.summary.received)}
                            </p>
                          </div>
                          <div className="rounded-lg border bg-muted/20 p-3">
                            <p className="text-xs text-muted-foreground">Opened</p>
                            <p className="text-lg font-semibold">
                              {formatNumber(recipientsQuery.data?.summary.opened)}
                            </p>
                          </div>
                          <div className="rounded-lg border bg-muted/20 p-3">
                            <p className="text-xs text-muted-foreground">Not reached</p>
                            <p className="text-lg font-semibold">
                              {formatNumber(recipientsQuery.data?.summary.notReached)}
                            </p>
                          </div>
                        </div>

                        <div className="max-h-96 overflow-y-auto rounded-lg border">
                          {(recipientsQuery.data?.items ?? []).map((recipient) => (
                            <div
                              key={`${recipient.userType}-${recipient.id}`}
                              className="flex flex-col gap-3 border-b p-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-medium">{recipient.name}</p>
                                  <Badge
                                    variant="outline"
                                    className={recipientReportStatusClass(recipient.status)}
                                  >
                                    {recipient.statusLabel}
                                  </Badge>
                                </div>
                                <p className="mt-1 text-sm text-muted-foreground">
                                  {recipient.phone || "No phone"}
                                  {recipient.restaurantName
                                    ? ` - ${recipient.restaurantName}`
                                    : ""}
                                </p>
                                {recipient.reason ? (
                                  <p className="mt-1 text-xs text-amber-700">
                                    {recipient.reason}
                                  </p>
                                ) : null}
                              </div>
                              <div className="text-left text-xs text-muted-foreground sm:text-right">
                                <p>Received: {formatDateTime(recipient.receivedAt)}</p>
                                <p>Opened: {formatDateTime(recipient.openedAt)}</p>
                              </div>
                            </div>
                          ))}
                          {!recipientsQuery.data?.items.length ? (
                            <div className="p-6 text-center text-sm text-muted-foreground">
                              No recipients matched this filter.
                            </div>
                          ) : null}
                        </div>
                        {(recipientsQuery.data?.total ?? 0) > 50 ? (
                          <p className="text-xs text-muted-foreground">
                            Showing first 50 of {formatNumber(recipientsQuery.data?.total)} recipients for this filter.
                          </p>
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : null}

                {selectedItem.source === "scheduled" ||
                selectedItem.source === "campaign" ||
                selectedItem.totalTargets ||
                selectedItem.sentCount ||
                selectedItem.disabledCount ||
                selectedItem.inAppCount ||
                selectedItem.skippedCount ||
                selectedItem.openCount ||
                selectedItem.failureReason ? (
                  <div className="rounded-lg border p-4">
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-center gap-2">
                        <Clock3 className="size-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">
                            {selectedItem.source === "scheduled"
                              ? "Scheduled notification details"
                              : "Delivery analytics"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Campaign ID:{" "}
                            {selectedItem.campaignId || selectedItem.id || "N/A"}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge
                          variant="outline"
                          className="border-emerald-200 bg-emerald-50 text-emerald-700"
                        >
                          {formatNumber(notificationDeliveryRate(selectedItem))}%
                          delivered
                        </Badge>
                        <Badge
                          variant="outline"
                          className="border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700"
                        >
                          {formatNumber(notificationOpenRate(selectedItem))}%
                          open rate
                        </Badge>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                      {[
                        {
                          label: "Targets",
                          value: selectedItem.totalTargets,
                          icon: UserRound,
                        },
                        {
                          label: "Sent push",
                          value: selectedItem.sentCount,
                          icon: Send,
                        },
                        {
                          label: "In-app",
                          value: selectedItem.inAppCount,
                          icon: Smartphone,
                        },
                        {
                          label: "Disabled",
                          value: selectedItem.disabledCount,
                          icon: XCircle,
                        },
                        {
                          label: "Skipped",
                          value: selectedItem.skippedCount,
                          icon: RefreshCcw,
                        },
                        {
                          label: "Opened",
                          value: selectedItem.openCount,
                          icon: Eye,
                        },
                      ].map((metric) => (
                        <div
                          key={metric.label}
                          className="rounded-lg border bg-muted/20 p-3"
                        >
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {React.createElement(metric.icon, {
                              className: "size-3.5",
                            })}
                            {metric.label}
                          </div>
                          <p className="mt-2 text-lg font-semibold">
                            {formatNumber(metric.value)}
                          </p>
                        </div>
                      ))}
                    </div>
                    {selectedItem.source === "scheduled" ? (
                      <div className="mt-3 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                        Open count means the recipient opened or marked this
                        scheduled notification as read inside their app. Push
                        provider delivery receipt is separate; this view focuses
                        on real app engagement.
                      </div>
                    ) : null}
                    {selectedItem.failureReason ? (
                      <p className="mt-4 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                        {selectedItem.failureReason}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  )
}
