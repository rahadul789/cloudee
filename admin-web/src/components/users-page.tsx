import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  Ban,
  ChevronDown,
  CheckCircle2,
  Eye,
  Loader2,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Smartphone,
  TableConfig,
  Trash2,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  UsersRound,
} from "lucide-react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts"
import { toast } from "sonner"

import { useDebouncedValue } from "@/hooks/use-debounced-value"
import {
  addAdminCustomerGroupMembers,
  createAdminCustomerGroup,
  deleteAdminCustomerGroup,
  deleteAdminCustomerPersonalOffer,
  getAdminCustomer,
  listAdminCustomerOrders,
  listAdminCustomerGroups,
  listAdminCustomers,
  deleteAdminRestaurantReview,
  restoreAdminRestaurantReview,
  removeAdminCustomerGroupMember,
  updateAdminCustomerGroup,
  getAdminCustomerDeviceIntel,
  updateAdminCustomerReferralAccess,
  updateAdminCustomerStatus,
  type AdminCustomerDetails,
  type AdminCustomerBehaviorSummary,
  type AdminCustomerGroup,
  type AdminCustomerOrderHistoryItem,
  type AdminCustomerSummary,
  type AdminCustomerTier,
  type AdminRestaurantOrderDateFilterPreset,
} from "@/lib/admin-api"
import {
  getAdminZoneScope,
  subscribeAdminZoneScope,
} from "@/lib/admin-zone-scope"
import { AdminDateRangeFilter } from "@/components/admin-date-range-filter"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"

type CustomerStatusFilter = "all" | "active" | "suspended" | "locked"
type CustomerSort =
  | "newest"
  | "recentLogin"
  | "mostOrders"
  | "highestSpend"
  | "repeatFirst"
type CustomerTierFilter = "all" | AdminCustomerTier
type CustomerCustomOfferFilter = "all" | "eligible" | "requested" | "ready" | "locked"
type CustomerStatus = AdminCustomerSummary["status"]
type CustomerStatusTargetCustomer = Pick<
  AdminCustomerSummary,
  "id" | "fullName" | "status"
>
type CustomerStatusTarget = {
  customer: CustomerStatusTargetCustomer
  status: CustomerStatus
}
type CustomerOrderStatusFilter = "all" | "live" | "delivered" | "cancelled"
type CustomerOrderSort = "newest" | "oldest" | "highestValue"
type CustomerOrderPreset = Extract<
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
type CustomerBehaviorPreset = CustomerOrderPreset
type UserColumnKey =
  | "user"
  | "status"
  | "area"
  | "orders"
  | "spend"
  | "account"
  | "lastLogin"

const USER_TABLE_COLUMNS: Array<{
  key: UserColumnKey
  label: string
}> = [
  { key: "user", label: "User" },
  { key: "status", label: "Status" },
  { key: "area", label: "Area" },
  { key: "orders", label: "Orders" },
  { key: "spend", label: "Spend" },
  { key: "account", label: "Account" },
  { key: "lastLogin", label: "Last login" },
]

const defaultUserColumnVisibility: Record<UserColumnKey, boolean> = {
  user: true,
  status: true,
  area: true,
  orders: true,
  spend: true,
  account: true,
  lastLogin: true,
}

const smartCustomerGroups = [
  { value: "new_users", label: "New users" },
  { value: "returning_users", label: "Returning users" },
  { value: "has_push_token", label: "Push-ready users" },
  { value: "ordered_last_30_days", label: "Ordered in last 30 days" },
  { value: "inactive_30_days", label: "Inactive for 30 days" },
  { value: "high_value_customers", label: "High-value customers" },
]

function formatDate(value?: string | null) {
  if (!value) return "N/A"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "N/A"
  return date.toLocaleString()
}

function formatShortDate(value?: string | null) {
  if (!value) return "Never"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Never"
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  })
}

function formatCurrency(value: number) {
  return `Tk ${Math.round(Number.isFinite(value) ? value : 0).toLocaleString()}`
}

function formatPercent(value: number) {
  return `${Number.isFinite(value) ? value.toFixed(1).replace(/\.0$/, "") : "0"}%`
}

function formatCustomerArea(
  serviceArea?: AdminCustomerSummary["serviceArea"] | null
) {
  if (!serviceArea) return "No area"
  const zoneName = serviceArea.zoneName?.trim()
  const districtName = serviceArea.districtName?.trim()
  if (zoneName && districtName) return `${districtName} / ${zoneName}`
  return zoneName || districtName || "No area"
}

function CustomOfferBadge({
  offer,
}: {
  offer?: AdminCustomerSummary["customOffer"]
}) {
  if (!offer) return null
  if (offer.status === "eligible") {
    return (
      <Badge className="h-5 bg-pink-500 px-1.5 text-[10px] text-white">
        Offer worthy
      </Badge>
    )
  }
  if (offer.status === "requested") {
    return (
      <Badge variant="outline" className="h-5 border-pink-200 bg-pink-50 px-1.5 text-[10px] text-pink-700">
        Offer requested
      </Badge>
    )
  }
  if (offer.status === "ready") {
    return (
      <Badge variant="outline" className="h-5 border-emerald-200 bg-emerald-50 px-1.5 text-[10px] text-emerald-700">
        Offer ready
      </Badge>
    )
  }
  return null
}

function formatChartDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

// Static remaining-time label computed once at render (no interval/timer) so the
// offers list stays cheap even with many rows.
function formatOfferTimeLeft(expiresAt?: string | null) {
  if (!expiresAt) return "No expiry"
  const end = new Date(expiresAt).getTime()
  if (Number.isNaN(end)) return "No expiry"
  const diff = end - Date.now()
  if (diff <= 0) return "Expired"
  const days = Math.floor(diff / 86_400_000)
  if (days >= 1) return `${days} day${days > 1 ? "s" : ""} left`
  const hours = Math.floor(diff / 3_600_000)
  if (hours >= 1) return `${hours} hour${hours > 1 ? "s" : ""} left`
  const minutes = Math.max(1, Math.floor(diff / 60_000))
  return `${minutes} min left`
}

function CustomerOffersTab({ details }: { details: AdminCustomerDetails }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const offers = details.personalOffers ?? []
  const customOfferRequest = details.customOfferRequest
  const deleteMutation = useMutation({
    mutationFn: deleteAdminCustomerPersonalOffer,
    onSuccess: async () => {
      toast.success("Personal offer removed")
      await queryClient.invalidateQueries({ queryKey: ["admin-customer-details", details.id] })
      await queryClient.invalidateQueries({ queryKey: ["admin-vouchers"] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to remove offer")
    },
  })

  function statusLabel(status?: string) {
    if (status === "used") return "Used"
    if (status === "expired") return "Expired"
    if (status === "inactive") return "Inactive"
    return "Active"
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personal offers</CardTitle>
        <CardDescription>
          Vouchers or offers assigned directly to this customer.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {customOfferRequest && customOfferRequest.status === "requested" ? (
          <div className="rounded-lg border border-pink-200 bg-pink-50/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">My offer request</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Customer completed {customOfferRequest.lastRequestOrderCount}/
                  {customOfferRequest.targetOrderCount} delivered orders and requested a personal voucher.
                </p>
              </div>
              <Badge
                variant="outline"
                className={
                  customOfferRequest.status === "requested"
                    ? "border-pink-200 bg-white text-pink-700"
                    : "border-muted bg-background text-muted-foreground"
                }
              >
                {customOfferRequest.status}
              </Badge>
            </div>
            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
              <InfoRow label="Requested" value={formatDate(customOfferRequest.requestedAt)} />
              <InfoRow label="Target response" value={formatDate(customOfferRequest.expectedReadyAt)} />
              <InfoRow
                label="Preferred code"
                value={customOfferRequest.requestedCode || "No preference"}
              />
              <InfoRow
                label="Current voucher"
                value={customOfferRequest.voucherCode || customOfferRequest.voucherLabel || "Not assigned"}
              />
            </div>
            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
              <InfoRow
                label="Qualified cycles"
                value={`${customOfferRequest.analytics?.qualifiedCount ?? 0}`}
              />
              <InfoRow
                label="Requests"
                value={`${customOfferRequest.analytics?.requestedCount ?? 0}`}
              />
              <InfoRow
                label="Fulfilled"
                value={`${customOfferRequest.analytics?.fulfilledCount ?? 0}`}
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Create a selected-user coupon, then send it as a personal offer.
              </p>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  const params = new URLSearchParams({
                    customerId: details.id,
                    customerName: details.fullName,
                    customerPhone: details.phone,
                    requestedCode: customOfferRequest.requestedCode || "",
                    personalOffer: "1",
                  })
                  navigate(`/coupons?${params.toString()}`)
                }}
              >
                <Plus className="size-4" />
                Create customer voucher
              </Button>
            </div>
          </div>
        ) : null}
        {offers.map((offer, index) => (
          <div key={`${offer.campaignId || offer.title}-${index}`} className="rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{offer.voucherLabel || offer.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {offer.description}
                </p>
              </div>
              <Badge
                variant="outline"
                className={
                  offer.offerStatus === "used"
                    ? "border-slate-200 bg-slate-100 text-slate-600"
                    : offer.offerStatus === "active"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : offer.offerStatus === "expired"
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : ""
                }
              >
                {statusLabel(offer.offerStatus)}
              </Badge>
            </div>
            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
              <InfoRow
                label="Code"
                value={offer.voucherCode?.trim() || (offer.voucherId ? "Auto applied" : "N/A")}
              />
              <InfoRow
                label={
                  offer.offerStatus === "used"
                    ? "Usage"
                    : offer.offerStatus === "expired"
                      ? "Expired"
                      : "Time left"
                }
                value={
                  offer.offerStatus === "used"
                    ? "Used"
                    : offer.offerStatus === "expired"
                      ? formatDate(offer.voucherExpiresAt)
                      : formatOfferTimeLeft(offer.voucherExpiresAt)
                }
              />
              <InfoRow
                label="Minimum order"
                value={
                  typeof offer.voucherMinOrder === "number"
                    ? formatCurrency(offer.voucherMinOrder)
                    : "N/A"
                }
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Sent {formatDate(offer.createdAt)} - {offer.isRead ? "Opened" : "Not opened"}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  const confirmed = window.confirm(
                    "Remove this personal offer from the customer? The source voucher will stay unchanged.",
                  )
                  if (!confirmed) return
                  deleteMutation.mutate({
                    customerId: details.id,
                    notificationId: offer.id,
                  })
                }}
              >
                Remove offer
              </Button>
            </div>
          </div>
        ))}
        {offers.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            No personal offers assigned yet.
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function CustomerMiniStats({ customer }: { customer: AdminCustomerSummary }) {
  const stats = [
    { label: "Orders", value: customer.totalOrders },
    { label: "Last order", value: formatShortDate(customer.lastOrderAt) },
    { label: "Last active", value: formatShortDate(customer.lastLoginAt) },
    { label: "Spend", value: formatCurrency(customer.deliveredSpend) },
  ]

  return (
    <div className="flex flex-wrap gap-1.5">
      {stats.map((stat) => (
        <span
          key={stat.label}
          className="rounded-full border bg-background px-2.5 py-1 text-xs"
        >
          <span className="text-muted-foreground">{stat.label}: </span>
          <span className="font-medium">{stat.value}</span>
        </span>
      ))}
    </div>
  )
}

function getInitials(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "CU"
  )
}

function getCustomerStatusBadgeClass(status: string) {
  if (status === "active")
    return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (status === "suspended")
    return "border-amber-200 bg-amber-50 text-amber-700"
  return "border-rose-200 bg-rose-50 text-rose-700"
}

const CUSTOMER_TIER_META: Record<
  AdminCustomerTier,
  { label: string; className: string }
> = {
  new: { label: "New", className: "border-slate-200 bg-slate-50 text-slate-600" },
  repeat: { label: "Repeat", className: "border-sky-200 bg-sky-50 text-sky-700" },
  vip: { label: "VIP", className: "border-amber-200 bg-amber-50 text-amber-700" },
  at_risk: {
    label: "At risk",
    className: "border-rose-200 bg-rose-50 text-rose-700",
  },
}

function CustomerTierBadge({
  tier,
  className,
}: {
  tier?: AdminCustomerTier
  className?: string
}) {
  if (!tier) return null
  const meta = CUSTOMER_TIER_META[tier] ?? CUSTOMER_TIER_META.new
  return (
    <Badge variant="outline" className={cn(meta.className, className)}>
      {meta.label}
    </Badge>
  )
}

function getOrderStatusBadgeClass(status: string) {
  if (status === "Delivered")
    return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (["New", "Accepted", "Preparing"].includes(status)) {
    return "border-sky-200 bg-sky-50 text-sky-700"
  }
  if (["ReadyForPickup", "PickedUp"].includes(status)) {
    return "border-violet-200 bg-violet-50 text-violet-700"
  }
  return "border-rose-200 bg-rose-50 text-rose-700"
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

function CustomerBehaviorCard({
  behavior,
}: {
  behavior?: AdminCustomerBehaviorSummary
}) {
  const trend = behavior?.trend ?? []
  const bestDay = trend.reduce<
    AdminCustomerBehaviorSummary["trend"][number] | null
  >(
    (current, row) =>
      !current || row.orderingCustomers > current.orderingCustomers
        ? row
        : current,
    null
  )

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <UsersRound className="size-4" />
              Customer behavior
            </CardTitle>
            <CardDescription>
              New vs repeat customers for the selected admin area and date
              range.
            </CardDescription>
          </div>
          <Badge variant="outline">
            Repeat rate {formatPercent(behavior?.repeatRate ?? 0)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="h-72 rounded-md border bg-muted/20 p-3">
          {trend.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ left: 4, right: 8, top: 12 }}>
                <defs>
                  <linearGradient id="newCustomersFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#ec4899" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#ec4899" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="repeatCustomersFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#0f172a" stopOpacity={0.24} />
                    <stop offset="100%" stopColor="#0f172a" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatChartDate}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  labelFormatter={(value) => formatChartDate(String(value))}
                  formatter={(value, name) => [
                    Number(value).toLocaleString(),
                    name === "newCustomers"
                      ? "New customers"
                      : name === "repeatCustomers"
                        ? "Repeat customers"
                        : "Ordering customers",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="orderingCustomers"
                  stroke="#0f766e"
                  fill="transparent"
                  strokeWidth={2}
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="newCustomers"
                  stroke="#ec4899"
                  fill="url(#newCustomersFill)"
                  strokeWidth={2}
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="repeatCustomers"
                  stroke="#0f172a"
                  fill="url(#repeatCustomersFill)"
                  strokeWidth={2}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center text-sm text-muted-foreground">
              <UsersRound className="mb-3 size-8" />
              No customer behavior in this range yet.
            </div>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <StatCard
            label="New customers"
            value={behavior?.newCustomers ?? 0}
            helper="Accounts created in range"
          />
          <StatCard
            label="Repeat customers"
            value={behavior?.repeatCustomers ?? 0}
            helper="2+ delivered orders in range"
          />
          <StatCard
            label="Ordering customers"
            value={behavior?.orderingCustomers ?? 0}
            helper="Unique delivered customers"
          />
          <StatCard
            label="Best day"
            value={bestDay ? formatChartDate(bestDay.date) : "N/A"}
            helper={
              bestDay
                ? `${bestDay.orderingCustomers} ordering customers`
                : "No trend yet"
            }
          />
        </div>
      </CardContent>
    </Card>
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

function CustomerActionsMenu({
  customer,
  isPending,
  onView,
  onStatus,
}: {
  customer: AdminCustomerSummary
  isPending: boolean
  onView: () => void
  onStatus: (status: CustomerStatus) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="data-[state=open]:bg-muted"
          aria-label={`Open actions for ${customer.fullName}`}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem onClick={onView}>
          <Eye className="size-4" />
          View details
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={isPending || customer.status === "active"}
          onClick={() => onStatus("active")}
        >
          <UserCheck className="size-4" />
          Activate
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={isPending || customer.status === "suspended"}
          onClick={() => onStatus("suspended")}
        >
          <Ban className="size-4" />
          Suspend
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={isPending || customer.status === "locked"}
          onClick={() => onStatus("locked")}
        >
          <Lock className="size-4" />
          Lock
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function CustomerStatusDialog({
  target,
  onOpenChange,
}: {
  target: CustomerStatusTarget | null
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [note, setNote] = React.useState("")
  const mutation = useMutation({
    mutationFn: updateAdminCustomerStatus,
    onSuccess: () => {
      toast.success("Customer status updated.")
      setNote("")
      onOpenChange(false)
      void queryClient.invalidateQueries({ queryKey: ["admin-customers"] })
      if (target?.customer.id) {
        void queryClient.invalidateQueries({
          queryKey: ["admin-customer-details", target.customer.id],
        })
      }
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Status update failed."
      )
    },
  })

  React.useEffect(() => {
    if (!target) setNote("")
  }, [target])

  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update customer status</DialogTitle>
          <DialogDescription>
            {target?.customer.fullName} will be set to {target?.status}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="customer-status-note">Admin note</Label>
          <Textarea
            id="customer-status-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Reason or internal note"
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!target || mutation.isPending}
            onClick={() => {
              if (!target) return
              mutation.mutate({
                customerId: target.customer.id,
                status: target.status,
                note,
              })
            }}
          >
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ShieldCheck className="size-4" />
            )}
            Save status
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CustomerDetailsSheet({
  customerId,
  open,
  initialTab,
  onOpenChange,
  onStatus,
}: {
  customerId: string
  open: boolean
  initialTab?: string
  onOpenChange: (open: boolean) => void
  onStatus: (
    customer: CustomerStatusTargetCustomer,
    status: CustomerStatus
  ) => void
}) {
  const [preset, setPreset] = React.useState<CustomerOrderPreset>("last7Days")
  const [from, setFrom] = React.useState("")
  const [to, setTo] = React.useState("")
  const detailsQuery = useQuery({
    queryKey: ["admin-customer-details", customerId, preset, from, to],
    queryFn: () =>
      getAdminCustomer(customerId, {
        preset,
        from: preset === "custom" ? from : undefined,
        to: preset === "custom" ? to : undefined,
      }),
    enabled: open && Boolean(customerId),
  })
  const details = detailsQuery.data

  React.useEffect(() => {
    if (preset !== "custom") {
      setFrom("")
      setTo("")
    }
  }, [preset])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-3xl! md:max-w-6xl!">
        <SheetHeader className="border-b">
          <SheetTitle>{details?.fullName ?? "Customer details"}</SheetTitle>
          <SheetDescription>
            Profile, orders, devices, account controls, and admin audit trail.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          {detailsQuery.isPending ? (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading customer details...
            </div>
          ) : details ? (
            <div className="space-y-5 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="size-12">
                    {details.profileImageUrl ? (
                      <img
                        src={details.profileImageUrl}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <AvatarFallback>
                        {getInitials(details.fullName)}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{details.fullName}</p>
                      <Badge
                        variant="outline"
                        className={getCustomerStatusBadgeClass(details.status)}
                      >
                        {details.status}
                      </Badge>
                      <Badge variant="outline">
                        {formatCustomerArea(details.serviceArea)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {details.phone || "No phone"} -{" "}
                      {details.email || "No email"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <AdminDateRangeFilter<CustomerOrderPreset>
                    value={preset}
                    from={from}
                    to={to}
                    label="Date"
                    onPresetChange={setPreset}
                    onRangeChange={(range) => {
                      setFrom(range.from)
                      setTo(range.to)
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={preset === "last7Days" && !from && !to}
                    onClick={() => {
                      setPreset("last7Days")
                      setFrom("")
                      setTo("")
                    }}
                  >
                    <RotateCcw className="size-4" />
                    Reset filter
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                <StatCard
                  label="Lifetime spend"
                  value={formatCurrency(details.lifetime.deliveredSpend)}
                  helper="Delivered orders"
                />
                <StatCard
                  label="Window spend"
                  value={formatCurrency(details.overview.deliveredSpend)}
                  helper="Selected timeframe"
                />
                <StatCard
                  label="Total orders"
                  value={details.lifetime.totalOrders}
                  helper={`${details.lifetime.liveOrders} live`}
                />
                <StatCard
                  label="Delivered"
                  value={details.overview.deliveredOrders}
                  helper="In selected timeframe"
                />
                <StatCard
                  label="Reviews"
                  value={details.overview.reviewsGiven}
                  helper={`${details.overview.averageReviewRating.toFixed(1)} avg`}
                />
                <StatCard
                  label="Devices"
                  value={details.account.activePushTokensCount}
                  helper={`${details.account.pushTokensCount} total`}
                />
              </div>

              <Tabs defaultValue={initialTab ?? "overview"} className="gap-4">
                <TabsList className="flex h-auto w-full flex-wrap justify-start">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="orders">Orders</TabsTrigger>
                  <TabsTrigger value="reviews">Reviews</TabsTrigger>
                  <TabsTrigger value="account">Account</TabsTrigger>
                  <TabsTrigger value="offers">Offers</TabsTrigger>
                  <TabsTrigger value="referrals">Referrals</TabsTrigger>
                  <TabsTrigger value="devices">Devices</TabsTrigger>
                  <TabsTrigger value="suspicious">Suspicious</TabsTrigger>
                  <TabsTrigger value="audit">Audit</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4">
                  <div className="grid gap-4 xl:grid-cols-3">
                    <Card>
                      <CardHeader>
                        <CardTitle>Admin controls</CardTitle>
                        <CardDescription>
                          Activate, suspend, or lock this customer.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="grid gap-2 sm:grid-cols-3">
                        <Button
                          variant="outline"
                          disabled={details.status === "active"}
                          onClick={() => onStatus(details, "active")}
                        >
                          <UserCheck className="size-4" />
                          Activate
                        </Button>
                        <Button
                          variant="outline"
                          disabled={details.status === "suspended"}
                          onClick={() => onStatus(details, "suspended")}
                        >
                          <Ban className="size-4" />
                          Suspend
                        </Button>
                        <Button
                          variant="outline"
                          disabled={details.status === "locked"}
                          onClick={() => onStatus(details, "locked")}
                        >
                          <Lock className="size-4" />
                          Lock
                        </Button>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Profile</CardTitle>
                        <CardDescription>
                          Contact and login signals.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm">
                        <InfoRow label="Phone" value={details.phone || "N/A"} />
                        <InfoRow label="Email" value={details.email || "N/A"} />
                        <InfoRow
                          label="Providers"
                          value={details.authProviders.join(", ") || "Phone"}
                        />
                        <InfoRow
                          label="Last login"
                          value={formatDate(details.lastLoginAt)}
                        />
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Top restaurants</CardTitle>
                        <CardDescription>
                          Delivered spend by restaurant.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {details.topRestaurants.map((restaurant) => (
                          <div
                            key={restaurant.restaurantId}
                            className="rounded-lg border p-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="font-medium">
                                {restaurant.restaurantName}
                              </p>
                              <Badge variant="outline">
                                {formatCurrency(restaurant.spend)}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {restaurant.deliveredOrders} delivered /{" "}
                              {restaurant.orders} total
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Last order {formatDate(restaurant.lastOrderedAt)}
                            </p>
                          </div>
                        ))}
                        {details.topRestaurants.length === 0 ? (
                          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                            No restaurant spend yet.
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="orders">
                  <CustomerOrdersTab customer={details} />
                </TabsContent>

                <TabsContent value="reviews">
                  <CustomerReviewsTab details={details} />
                </TabsContent>

                <TabsContent value="account" className="space-y-4">
                  <div className="grid gap-4 xl:grid-cols-2">
                    <Card>
                      <CardHeader>
                        <CardTitle>Current area</CardTitle>
                        <CardDescription>
                          Last delivery point captured from app login or location changes.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm">
                        <InfoRow
                          label="Area"
                          value={formatCustomerArea(details.serviceArea)}
                        />
                        <InfoRow
                          label="Location"
                          value={
                            details.lastKnownLocation?.address ||
                            details.lastKnownLocation?.label ||
                            "No location captured"
                          }
                        />
                        <InfoRow
                          label="Updated"
                          value={formatDate(details.lastKnownLocation?.updatedAt)}
                        />
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Saved locations</CardTitle>
                        <CardDescription>
                          Customer delivery address book.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {details.savedLocations.map((location) => (
                          <div
                            key={location.id}
                            className="rounded-lg border p-3"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium">{location.label}</p>
                              {location.isDefault ? (
                                <Badge variant="outline">Default</Badge>
                              ) : null}
                              {location.serviceArea ? (
                                <Badge variant="outline">
                                  {formatCustomerArea(location.serviceArea)}
                                </Badge>
                              ) : null}
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {location.address}
                            </p>
                            <p className="mt-2 text-xs text-muted-foreground">
                              Last used {formatDate(location.lastUsedAt)}
                            </p>
                          </div>
                        ))}
                        {details.savedLocations.length === 0 ? (
                          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                            No saved locations.
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Notifications</CardTitle>
                        <CardDescription>
                          Preferences and recent notifications.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm">
                        <InfoRow
                          label="Order updates"
                          value={
                            details.notificationSettings.orderUpdates
                              ? "On"
                              : "Off"
                          }
                        />
                        <InfoRow
                          label="Restaurant status"
                          value={
                            details.notificationSettings.restaurantStatus
                              ? "On"
                              : "Off"
                          }
                        />
                        <InfoRow
                          label="Review replies"
                          value={
                            details.notificationSettings.reviewReplies
                              ? "On"
                              : "Off"
                          }
                        />
                        <div className="space-y-2 pt-2">
                          {details.recentNotifications.map(
                            (notification, index) => (
                              <div
                                key={`${notification.title}-${index}`}
                                className="rounded-lg border p-3"
                              >
                                <div className="font-medium">
                                  {notification.title}
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {notification.description}
                                </p>
                              </div>
                            )
                          )}
                          {details.recentNotifications.length === 0 ? (
                            <div className="rounded-lg border border-dashed p-4 text-muted-foreground">
                              No recent notifications.
                            </div>
                          ) : null}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="offers">
                  <CustomerOffersTab details={details} />
                </TabsContent>

                <TabsContent value="referrals">
                  <CustomerReferralsTab details={details} />
                </TabsContent>

                <TabsContent value="suspicious">
                  <CustomerSuspiciousTab customerId={details.id} />
                </TabsContent>

                <TabsContent value="devices">
                  <Card>
                    <CardHeader>
                      <CardTitle>Devices</CardTitle>
                      <CardDescription>
                        Push tokens and app/device metadata.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {details.devices.map((device) => (
                        <div
                          key={device.expoPushToken}
                          className="rounded-lg border p-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <Smartphone className="size-4 text-muted-foreground" />
                            <p className="font-medium">
                              {device.platform || "Device"}
                            </p>
                            {device.disabledAt ? (
                              <Badge variant="outline">Disabled</Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="border-emerald-200 bg-emerald-50 text-emerald-700"
                              >
                                Active
                              </Badge>
                            )}
                          </div>
                          <p className="mt-2 text-xs break-all text-muted-foreground">
                            {device.expoPushToken}
                          </p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            App {device.appVersion || "N/A"} - Last seen{" "}
                            {formatDate(device.lastSeenAt)}
                          </p>
                        </div>
                      ))}
                      {details.devices.length === 0 ? (
                        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                          No active device tokens.
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="audit">
                  <Card>
                    <CardHeader>
                      <CardTitle>Admin audit log</CardTitle>
                      <CardDescription>
                        Customer moderation and status changes.
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
                          <p className="mt-2 text-xs text-muted-foreground">
                            {log.actorName} - {formatDate(log.createdAt)}
                          </p>
                        </div>
                      ))}
                      {details.auditLogs.length === 0 ? (
                        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                          No admin audit logs yet.
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            <div className="p-4 text-sm text-muted-foreground">
              Customer details are not available.
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

function DeviceIntelStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  )
}

function CustomerSuspiciousTab({ customerId }: { customerId: string }) {
  const intelQuery = useQuery({
    queryKey: ["admin-customer-device-intel", customerId],
    queryFn: () => getAdminCustomerDeviceIntel(customerId),
  })
  const intel = intelQuery.data

  return (
    <Card>
      <CardHeader>
        <CardTitle>Suspicious activity</CardTitle>
        <CardDescription>
          Accounts, phone numbers and welcome-perk redemptions traced to the same
          physical device as this customer.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {intelQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">
            Checking device fingerprint…
          </p>
        ) : !intel?.hasDevice ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No device fingerprint recorded for this customer yet.
          </div>
        ) : (
          <>
            {intel.suspicious ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                  ⚠ Suspicious device activity
                </p>
                <ul className="mt-1 list-disc pl-5 text-xs text-amber-700 dark:text-amber-400">
                  {intel.reasons.map((reason, index) => (
                    <li key={index}>{reason}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400">
                No abnormal device activity detected.
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <DeviceIntelStat label="Accounts on device" value={intel.accountCount} />
              <DeviceIntelStat label="Phone numbers" value={intel.distinctPhoneCount} />
              <DeviceIntelStat label="Referrals applied" value={intel.referralAppliedCount} />
              <DeviceIntelStat label="Referee vouchers" value={intel.refereeVoucherCount} />
              <DeviceIntelStat label="First-order redeemed" value={intel.firstOrderRedeemedCount} />
              <DeviceIntelStat label="First-order attempts" value={intel.firstOrderClaimCount} />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Accounts sharing this device</p>
              {intel.accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{account.name}</span>
                    <span className="text-muted-foreground">{account.phone}</span>
                    {account.isCurrent ? (
                      <Badge variant="outline">This customer</Badge>
                    ) : null}
                    {account.referralDisabledByAdmin ? (
                      <Badge variant="destructive">Referral off</Badge>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {account.appliedReferral ? (
                      <Badge variant="secondary">Referral</Badge>
                    ) : null}
                    {account.gotRefereeVoucher ? (
                      <Badge variant="secondary">Welcome voucher</Badge>
                    ) : null}
                    {account.redeemedFirstOrder ? (
                      <Badge variant="secondary">First-order</Badge>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function CustomerReferralsTab({ details }: { details: AdminCustomerDetails }) {
  const referrals = details.referrals
  const referred = referrals?.referred ?? []
  const queryClient = useQueryClient()
  const referralDisabled = Boolean(referrals?.referralDisabledByAdmin)
  const referralAccessMutation = useMutation({
    mutationFn: (disabled: boolean) =>
      updateAdminCustomerReferralAccess({ customerId: details.id, disabled }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["admin-customer-details", details.id],
      })
    },
  })

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Referrals</CardTitle>
          <CardDescription>
            Who this customer referred, and who referred them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Referral participation</p>
              <p className="text-xs text-muted-foreground">
                {referralDisabled
                  ? "Turned OFF — this customer can't apply or earn referrals."
                  : "Active — this customer can apply and earn referrals."}
              </p>
            </div>
            <Button
              variant={referralDisabled ? "outline" : "destructive"}
              size="sm"
              disabled={referralAccessMutation.isPending}
              onClick={() => referralAccessMutation.mutate(!referralDisabled)}
            >
              {referralAccessMutation.isPending
                ? "Saving…"
                : referralDisabled
                  ? "Enable referrals"
                  : "Disable referrals"}
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Referral code</p>
              <p className="mt-1 font-mono text-sm font-medium">
                {referrals?.referralCode || "—"}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Total referred</p>
              <p className="mt-1 text-lg font-semibold">
                {referrals?.totalReferred ?? 0}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Rewarded</p>
              <p className="mt-1 text-lg font-semibold">
                {referrals?.rewardedCount ?? 0}
              </p>
            </div>
          </div>

          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Referred by</p>
            {referrals?.referredBy ? (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <UserPlus className="size-4 text-muted-foreground" />
                <span className="font-medium">{referrals.referredBy.name}</span>
                <span className="text-sm text-muted-foreground">
                  {referrals.referredBy.phone}
                </span>
                <Badge variant="outline" className="font-mono">
                  {referrals.referredBy.referralCode}
                </Badge>
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                Joined without a referral.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Referred customers ({referred.length})</CardTitle>
          <CardDescription>People who joined using this code.</CardDescription>
        </CardHeader>
        <CardContent>
          {referred.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Reward</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {referred.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">{entry.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.phone}
                    </TableCell>
                    <TableCell>{formatDate(entry.joinedAt)}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          entry.rewardStatus === "rewarded"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : entry.rewardStatus === "under_review"
                              ? "border-amber-200 bg-amber-50 text-amber-700"
                              : entry.rewardStatus === "rejected"
                                ? "border-red-200 bg-red-50 text-red-700"
                                : undefined
                        }
                      >
                        {entry.rewardStatus}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              No referred customers yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function CustomerReviewsTab({ details }: { details: AdminCustomerDetails }) {
  const queryClient = useQueryClient()
  const [deleteTarget, setDeleteTarget] = React.useState<
    AdminCustomerDetails["recentReviews"][number] | null
  >(null)
  const deleteReviewMutation = useMutation({
    mutationFn: deleteAdminRestaurantReview,
    onSuccess: () => {
      toast.success("Review hidden.")
      setDeleteTarget(null)
      void queryClient.invalidateQueries({
        queryKey: ["admin-customer-details", details.id],
      })
      void queryClient.invalidateQueries({ queryKey: ["admin-customers"] })
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
        queryKey: ["admin-customer-details", details.id],
      })
      void queryClient.invalidateQueries({ queryKey: ["admin-customers"] })
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
          <CardTitle>Recent reviews</CardTitle>
          <CardDescription>
            Ratings this customer submitted after orders.
          </CardDescription>
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
                    <p className="font-medium">{review.restaurantName}</p>
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
                          restaurantId: review.restaurantId,
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
                  restaurantId: deleteTarget.restaurantId,
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

function CustomerOrdersTab({ customer }: { customer: AdminCustomerDetails }) {
  const [preset, setPreset] = React.useState<CustomerOrderPreset>("last7Days")
  const [from, setFrom] = React.useState("")
  const [to, setTo] = React.useState("")
  const [status, setStatus] = React.useState<CustomerOrderStatusFilter>("all")
  const [restaurantId, setRestaurantId] = React.useState("all")
  const [sortBy, setSortBy] = React.useState<CustomerOrderSort>("newest")
  const [search, setSearch] = React.useState("")
  const [page, setPage] = React.useState(1)
  const debouncedSearch = useDebouncedValue(search, 300)
  const ordersQuery = useQuery({
    queryKey: [
      "admin-customer-orders",
      customer.id,
      preset,
      from,
      to,
      status,
      restaurantId,
      sortBy,
      debouncedSearch,
      page,
    ],
    queryFn: () =>
      listAdminCustomerOrders(customer.id, {
        preset,
        from: preset === "custom" ? from : undefined,
        to: preset === "custom" ? to : undefined,
        status,
        restaurantId: restaurantId === "all" ? undefined : restaurantId,
        sortBy,
        search: debouncedSearch,
        page,
        pageSize: 8,
      }),
  })
  const orders = ordersQuery.data?.items ?? []
  const hasFilters =
    search.trim() !== "" ||
    preset !== "last7Days" ||
    from !== "" ||
    to !== "" ||
    status !== "all" ||
    restaurantId !== "all" ||
    sortBy !== "newest"

  React.useEffect(() => {
    setPage(1)
  }, [preset, from, to, status, restaurantId, sortBy, debouncedSearch])

  React.useEffect(() => {
    if (preset !== "custom") {
      setFrom("")
      setTo("")
    }
  }, [preset])

  return (
    <div className="space-y-4">
      <div className="grid gap-2 xl:grid-cols-[minmax(220px,1fr)_minmax(240px,auto)_150px_170px_150px_150px]">
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search orders"
            className="pl-8"
          />
        </div>
        <AdminDateRangeFilter<CustomerOrderPreset>
          value={preset}
          from={from}
          to={to}
          label="Date"
          triggerClassName="w-full"
          onPresetChange={setPreset}
          onRangeChange={(range) => {
            setFrom(range.from)
            setTo(range.to)
          }}
        />
        <Select
          value={status}
          onValueChange={(value) =>
            setStatus(value as CustomerOrderStatusFilter)
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
        <Select value={restaurantId} onValueChange={setRestaurantId}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All restaurants</SelectItem>
            {customer.orderRestaurants.map((restaurant) => (
              <SelectItem
                key={restaurant.restaurantId}
                value={restaurant.restaurantId}
              >
                {restaurant.restaurantName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={sortBy}
          onValueChange={(value) => setSortBy(value as CustomerOrderSort)}
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
          disabled={!hasFilters}
          onClick={() => {
            setSearch("")
            setPreset("last7Days")
            setFrom("")
            setTo("")
            setStatus("all")
            setRestaurantId("all")
            setSortBy("newest")
            setPage(1)
          }}
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
              <TableHead>Restaurant</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Delivered</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order: AdminCustomerOrderHistoryItem) => (
              <TableRow key={order.id}>
                <TableCell>
                  <div className="font-medium">{order.orderNumber}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(order.createdAt)}
                  </div>
                </TableCell>
                <TableCell>{order.restaurantName}</TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={getOrderStatusBadgeClass(order.status)}
                  >
                    {order.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div>{order.paymentMethod}</div>
                  <div className="text-xs text-muted-foreground">
                    {order.paymentStatus}
                  </div>
                </TableCell>
                <TableCell>{formatCurrency(order.total)}</TableCell>
                <TableCell>{formatDate(order.deliveredAt)}</TableCell>
              </TableRow>
            ))}
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

export function UsersPage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = React.useState("")
  const [status, setStatus] = React.useState<CustomerStatusFilter>("all")
  const [customerGroupKey, setCustomerGroupKey] = React.useState("none")
  const [sortBy, setSortBy] = React.useState<CustomerSort>("newest")
  const [tier, setTier] = React.useState<CustomerTierFilter>("all")
  const [customOfferFilter, setCustomOfferFilter] =
    React.useState<CustomerCustomOfferFilter>("all")
  const [behaviorPreset, setBehaviorPreset] =
    React.useState<CustomerBehaviorPreset>("last30Days")
  const [behaviorFrom, setBehaviorFrom] = React.useState("")
  const [behaviorTo, setBehaviorTo] = React.useState("")
  const [adminZoneScope, setAdminZoneScope] = React.useState(() =>
    getAdminZoneScope()
  )
  const [page, setPage] = React.useState(1)
  const [selectedCustomerId, setSelectedCustomerId] = React.useState("")
  const [customerDetailsInitialTab, setCustomerDetailsInitialTab] =
    React.useState("overview")
  const [statusTarget, setStatusTarget] =
    React.useState<CustomerStatusTarget | null>(null)
  const [columnVisibility, setColumnVisibility] = React.useState(
    defaultUserColumnVisibility
  )
  const [saveGroupOpen, setSaveGroupOpen] = React.useState(false)
  const [editingGroup, setEditingGroup] =
    React.useState<AdminCustomerGroup | null>(null)
  const [deleteGroupTarget, setDeleteGroupTarget] =
    React.useState<AdminCustomerGroup | null>(null)
  const [groupMembersTarget, setGroupMembersTarget] =
    React.useState<AdminCustomerGroup | null>(null)
  const [groupMemberSearch, setGroupMemberSearch] = React.useState("")
  const [groupName, setGroupName] = React.useState("")
  const [groupDescription, setGroupDescription] = React.useState("")
  const debouncedSearch = useDebouncedValue(search, 350)
  const debouncedGroupMemberSearch = useDebouncedValue(groupMemberSearch, 300)
  const adminScopeKey = `${adminZoneScope.type}:${adminZoneScope.id}`
  React.useEffect(() => {
    const customerId = searchParams.get("customerId")?.trim()
    if (!customerId) return

    const requestedTab = searchParams.get("tab")?.trim()
    setCustomerDetailsInitialTab(
      requestedTab &&
        ["overview", "orders", "reviews", "account", "offers", "devices", "audit"].includes(
          requestedTab,
        )
        ? requestedTab
        : "overview",
    )
    setSelectedCustomerId(customerId)
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])
  React.useEffect(
    () =>
      subscribeAdminZoneScope(() => {
        setAdminZoneScope(getAdminZoneScope())
      }),
    []
  )
  const customerGroupsQuery = useQuery({
    queryKey: ["admin-customer-groups", adminScopeKey],
    queryFn: listAdminCustomerGroups,
  })
  const customersQuery = useQuery({
    queryKey: [
      "admin-customers",
      adminScopeKey,
      debouncedSearch,
      status,
      tier,
      customOfferFilter,
      customerGroupKey,
      sortBy,
      behaviorPreset,
      behaviorFrom,
      behaviorTo,
      page,
    ],
    queryFn: () =>
      listAdminCustomers({
        search: debouncedSearch,
        status,
        tier,
        customOffer: customOfferFilter,
        customerGroupKey: customerGroupKey === "none" ? undefined : customerGroupKey,
        sortBy,
        preset: behaviorPreset,
        from: behaviorFrom,
        to: behaviorTo,
        page,
        pageSize: 12,
      }),
  })
  const groupMembersQuery = useQuery({
    queryKey: ["admin-customer-group-members", adminScopeKey, groupMembersTarget?.id],
    enabled: Boolean(groupMembersTarget),
    queryFn: () =>
      listAdminCustomers({
        customerGroupKey: groupMembersTarget
          ? `manual:${groupMembersTarget.id}`
          : undefined,
        sortBy: "recentLogin",
        page: 1,
        pageSize: 50,
      }),
  })
  const groupMemberCandidatesQuery = useQuery({
    queryKey: [
      "admin-customer-group-member-candidates",
      adminScopeKey,
      groupMembersTarget?.id,
      debouncedGroupMemberSearch,
    ],
    enabled: Boolean(groupMembersTarget),
    queryFn: () =>
      listAdminCustomers({
        search: debouncedGroupMemberSearch,
        status: "active",
        sortBy: "recentLogin",
        page: 1,
        pageSize: 20,
      }),
  })

  const saveGroupMutation = useMutation({
    mutationFn: createAdminCustomerGroup,
    onSuccess: (group) => {
      toast.success(`${group.name} group saved`)
      setSaveGroupOpen(false)
      setGroupName("")
      setGroupDescription("")
      void queryClient.invalidateQueries({ queryKey: ["admin-customer-groups"] })
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Group save failed"),
  })
  const updateGroupMutation = useMutation({
    mutationFn: (payload: { groupId: string; name: string; description: string }) =>
      updateAdminCustomerGroup(payload.groupId, {
        name: payload.name,
        description: payload.description,
      }),
    onSuccess: (group) => {
      toast.success(`${group.name} group updated`)
      setSaveGroupOpen(false)
      setEditingGroup(null)
      setGroupName("")
      setGroupDescription("")
      void queryClient.invalidateQueries({ queryKey: ["admin-customer-groups"] })
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Group update failed"),
  })
  const deleteGroupMutation = useMutation({
    mutationFn: deleteAdminCustomerGroup,
    onSuccess: (result) => {
      toast.success(`${result.group.name} group deleted`)
      if (customerGroupKey === `manual:${result.group.id}`) {
        setCustomerGroupKey("none")
      }
      if (groupMembersTarget?.id === result.group.id) {
        setGroupMembersTarget(null)
      }
      setDeleteGroupTarget(null)
      void queryClient.invalidateQueries({ queryKey: ["admin-customer-groups"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-customers"] })
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Group delete failed"),
  })
  const addMemberMutation = useMutation({
    mutationFn: addAdminCustomerGroupMembers,
    onSuccess: (group) => {
      toast.success("Member added to group")
      setGroupMembersTarget(group)
      setGroupMemberSearch("")
      void queryClient.invalidateQueries({ queryKey: ["admin-customer-groups"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-customer-group-members"] })
      void queryClient.invalidateQueries({
        queryKey: ["admin-customer-group-member-candidates"],
      })
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Member add failed"),
  })
  const removeMemberMutation = useMutation({
    mutationFn: removeAdminCustomerGroupMember,
    onSuccess: (group) => {
      toast.success("Member removed from group")
      setGroupMembersTarget(group)
      void queryClient.invalidateQueries({ queryKey: ["admin-customer-groups"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-customer-group-members"] })
      void queryClient.invalidateQueries({
        queryKey: ["admin-customer-group-member-candidates"],
      })
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Member remove failed"),
  })

  const customers = customersQuery.data?.items ?? []
  const summary = customersQuery.data?.summary ?? {}
  const behavior = summary.behavior as AdminCustomerBehaviorSummary | undefined
  const visibleColumnCount =
    USER_TABLE_COLUMNS.filter((column) => columnVisibility[column.key]).length +
    1
  const hasFilters =
    search.trim() !== "" ||
    status !== "all" ||
    tier !== "all" ||
    customOfferFilter !== "all" ||
    customerGroupKey !== "none" ||
    sortBy !== "newest"
  const groupMembers = groupMembersQuery.data?.items ?? []
  const groupMemberIds = new Set(groupMembers.map((customer) => customer.id))
  const groupMemberCandidates = groupMemberCandidatesQuery.data?.items ?? []

  React.useEffect(() => {
    setPage(1)
  }, [
    adminScopeKey,
    debouncedSearch,
    status,
    tier,
    customOfferFilter,
    customerGroupKey,
    sortBy,
    behaviorPreset,
    behaviorFrom,
    behaviorTo,
  ])

  function openCreateGroupDialog() {
    setEditingGroup(null)
    setGroupName("")
    setGroupDescription("")
    setSaveGroupOpen(true)
  }

  function openEditGroupDialog(group: AdminCustomerGroup) {
    setEditingGroup(group)
    setGroupName(group.name)
    setGroupDescription(group.description)
    setSaveGroupOpen(true)
  }

  function openMembersDrawer(group: AdminCustomerGroup) {
    setGroupMembersTarget(group)
    setGroupMemberSearch("")
  }

  function submitGroupForm() {
    if (editingGroup) {
      updateGroupMutation.mutate({
        groupId: editingGroup.id,
        name: groupName,
        description: groupDescription,
      })
      return
    }

    saveGroupMutation.mutate({
      name: groupName,
      description: groupDescription,
      sourceFilter: {
        search: debouncedSearch,
        status,
        tier,
        customOffer: customOfferFilter,
        customerGroupKey:
          customerGroupKey === "none" ? undefined : customerGroupKey,
        preset: behaviorPreset,
        from: behaviorFrom,
        to: behaviorTo,
        sortBy,
      },
    })
  }

  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
              <Users className="size-4" />
            </div>
            <Badge variant="outline">Core platform module</Badge>
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Users</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Manage customer accounts, block or unlock access, and inspect
            order/review activity.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total users"
          value={`${summary.total ?? customersQuery.data?.total ?? 0}`}
          helper="All customer accounts"
        />
        <StatCard
          label="Active"
          value={`${summary.active ?? 0}`}
          helper="Can place orders"
        />
        <StatCard
          label="Suspended"
          value={`${summary.suspended ?? 0}`}
          helper="Blocked by admin"
        />
        <StatCard
          label="Locked"
          value={`${summary.locked ?? 0}`}
          helper="Restricted account"
        />
      </div>

      <div className="space-y-3 rounded-md border bg-background p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <UsersRound className="size-4" />
                New vs repeat customers
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Uses the selected top-nav area, current customer filters, and
                selected timeframe.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <AdminDateRangeFilter<CustomerBehaviorPreset>
                value={behaviorPreset}
                from={behaviorFrom}
                to={behaviorTo}
                label="Customer behavior range"
                onPresetChange={setBehaviorPreset}
                onRangeChange={(range) => {
                  setBehaviorFrom(range.from)
                  setBehaviorTo(range.to)
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setBehaviorPreset("last30Days")
                  setBehaviorFrom("")
                  setBehaviorTo("")
                }}
              >
                <RotateCcw className="size-4" />
                Reset
              </Button>
            </div>
          </div>
        <CustomerBehaviorCard behavior={behavior} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <UsersRound className="size-4" />
                Saved audience groups
              </CardTitle>
              <CardDescription>
                Create manual customer groups from the current filters and reuse
                them for promotional notifications.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" onClick={openCreateGroupDialog}>
              <Save className="size-4" />
              Save current filter
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {(customerGroupsQuery.data?.items ?? []).length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {(customerGroupsQuery.data?.items ?? []).slice(0, 6).map((group) => (
                <div
                  key={group.id}
                  className="rounded-xl border bg-muted/20 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{group.name}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {group.description || "Manual saved customer group"}
                      </p>
                    </div>
                    <Badge variant="outline">{group.memberCount}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => openMembersDrawer(group)}
                    >
                      <Eye className="size-4" />
                      Members
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setCustomerGroupKey(`manual:${group.id}`)
                        setPage(1)
                      }}
                    >
                      Use filter
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => openEditGroupDialog(group)}
                      aria-label={`Edit ${group.name}`}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteGroupTarget(group)}
                      aria-label={`Delete ${group.name}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-center">
              <UsersRound className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 font-medium">No manual groups yet</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Filter users below, then save that result as a manual audience
                group for future promo pushes.
              </p>
              <Button
                type="button"
                className="mt-4"
                variant="outline"
                onClick={openCreateGroupDialog}
              >
                <Save className="size-4" />
                Create first group
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-4">
          <div className="space-y-4">
            <div>
              <CardTitle>Customer directory</CardTitle>
              <CardDescription>
                Search customers and review account health from one place.
              </CardDescription>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-[minmax(240px,1fr)_140px_140px_160px_170px_190px_auto_auto_auto]">
              <div className="relative sm:col-span-2 lg:col-span-2 2xl:col-span-1">
                <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search users"
                  className="pl-8"
                />
              </div>
              <Select
                value={status}
                onValueChange={(value) =>
                  setStatus(value as CustomerStatusFilter)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="locked">Locked</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={tier}
                onValueChange={(value) => setTier(value as CustomerTierFilter)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tiers</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="repeat">Repeat</SelectItem>
                  <SelectItem value="vip">VIP</SelectItem>
                  <SelectItem value="at_risk">At risk</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={sortBy}
                onValueChange={(value) => setSortBy(value as CustomerSort)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="recentLogin">Recent login</SelectItem>
                  <SelectItem value="mostOrders">Most orders</SelectItem>
                  <SelectItem value="highestSpend">Highest spend</SelectItem>
                  <SelectItem value="repeatFirst">Repeat first</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={customOfferFilter}
                onValueChange={(value) =>
                  setCustomOfferFilter(value as CustomerCustomOfferFilter)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All offers</SelectItem>
                  <SelectItem value="eligible">Offer worthy</SelectItem>
                  <SelectItem value="requested">Requested</SelectItem>
                  <SelectItem value="ready">Ready</SelectItem>
                  <SelectItem value="locked">Not eligible</SelectItem>
                </SelectContent>
              </Select>
              <Select value={customerGroupKey} onValueChange={setCustomerGroupKey}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Audience group" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">All groups</SelectItem>
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    <TableConfig className="size-4" />
                    Columns
                    <ChevronDown className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Show columns</DropdownMenuLabel>
                  {USER_TABLE_COLUMNS.map((column) => (
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
              <Button
                variant="outline"
                className="w-full"
                disabled={!hasFilters}
                onClick={() => {
                  setSearch("")
                  setStatus("all")
                  setTier("all")
                  setCustomOfferFilter("all")
                  setCustomerGroupKey("none")
                  setSortBy("newest")
                  setPage(1)
                }}
              >
                <RotateCcw className="size-4" />
                Reset filter
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={openCreateGroupDialog}
              >
                <Save className="size-4" />
                Save group
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {summary.tierBreakdown ? (
            <div className="mb-3 flex flex-wrap gap-2">
              {(
                [
                  { key: "all" as const, label: "All" },
                  { key: "new" as const, label: "New" },
                  { key: "repeat" as const, label: "Repeat" },
                  { key: "vip" as const, label: "VIP" },
                  { key: "at_risk" as const, label: "At risk" },
                ] satisfies Array<{ key: CustomerTierFilter; label: string }>
              ).map((chip) => {
                const count =
                  chip.key === "all"
                    ? (summary.tierBreakdown?.new ?? 0) +
                      (summary.tierBreakdown?.repeat ?? 0) +
                      (summary.tierBreakdown?.vip ?? 0) +
                      (summary.tierBreakdown?.at_risk ?? 0)
                    : summary.tierBreakdown?.[chip.key] ?? 0
                const isActive = tier === chip.key
                return (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => setTier(chip.key)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition",
                      isActive
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-background hover:bg-muted/60"
                    )}
                  >
                    {chip.label} ({count.toLocaleString()})
                  </button>
                )
              })}
            </div>
          ) : null}
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  {columnVisibility.user ? <TableHead>User</TableHead> : null}
                  {columnVisibility.status ? (
                    <TableHead>Status</TableHead>
                  ) : null}
                  {columnVisibility.area ? (
                    <TableHead>Area</TableHead>
                  ) : null}
                  {columnVisibility.orders ? (
                    <TableHead>Orders</TableHead>
                  ) : null}
                  {columnVisibility.spend ? (
                    <TableHead>Spend</TableHead>
                  ) : null}
                  {columnVisibility.account ? (
                    <TableHead>Account</TableHead>
                  ) : null}
                  {columnVisibility.lastLogin ? (
                    <TableHead>Last login</TableHead>
                  ) : null}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow key={customer.id}>
                    {columnVisibility.user ? (
                      <TableCell>
                        <button
                          type="button"
                          className="flex min-w-0 items-center gap-3 text-left"
                          onClick={() => setSelectedCustomerId(customer.id)}
                        >
                          <Avatar className="size-9">
                            <AvatarFallback>
                              {getInitials(customer.fullName)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="min-w-0">
                            <span className="flex items-center gap-2">
                              <span className="block font-medium">
                                {customer.fullName}
                              </span>
                              <CustomerTierBadge
                                tier={customer.customerTier}
                                className="h-5 px-1.5 text-[10px]"
                              />
                              <CustomOfferBadge offer={customer.customOffer} />
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {customer.phone || customer.email || "No contact"}
                            </span>
                          </span>
                        </button>
                      </TableCell>
                    ) : null}
                    {columnVisibility.status ? (
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={getCustomerStatusBadgeClass(
                            customer.status
                          )}
                        >
                          {customer.status}
                        </Badge>
                      </TableCell>
                    ) : null}
                    {columnVisibility.area ? (
                      <TableCell>
                        <div className="max-w-[190px]">
                          <Badge variant="outline" className="max-w-full truncate">
                            {formatCustomerArea(customer.serviceArea)}
                          </Badge>
                          {customer.lastKnownLocation?.updatedAt ? (
                            <div className="mt-1 text-xs text-muted-foreground">
                              Updated {formatShortDate(customer.lastKnownLocation.updatedAt)}
                            </div>
                          ) : null}
                        </div>
                      </TableCell>
                    ) : null}
                    {columnVisibility.orders ? (
                      <TableCell>
                        <div className="font-medium">
                          {customer.totalOrders}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {customer.liveOrders} live /{" "}
                          {customer.deliveredOrders} delivered
                        </div>
                      </TableCell>
                    ) : null}
                    {columnVisibility.spend ? (
                      <TableCell>
                        {formatCurrency(customer.deliveredSpend)}
                      </TableCell>
                    ) : null}
                    {columnVisibility.account ? (
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {customer.hasPushToken ? (
                            <Badge variant="outline">Push</Badge>
                          ) : (
                            <Badge variant="outline">No push token</Badge>
                          )}
                        </div>
                      </TableCell>
                    ) : null}
                    {columnVisibility.lastLogin ? (
                      <TableCell>{formatDate(customer.lastLoginAt)}</TableCell>
                    ) : null}
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedCustomerId(customer.id)}
                        >
                          <Eye className="size-4" />
                          View
                        </Button>
                        <CustomerActionsMenu
                          customer={customer}
                          isPending={false}
                          onView={() => setSelectedCustomerId(customer.id)}
                          onStatus={(nextStatus) =>
                            setStatusTarget({ customer, status: nextStatus })
                          }
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {customersQuery.isPending ? (
                  <TableRow>
                    <TableCell
                      colSpan={visibleColumnCount}
                      className="h-24 text-center"
                    >
                      <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : customers.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={visibleColumnCount}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No customers match this filter.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Page {customersQuery.data?.page ?? page} of{" "}
              {customersQuery.data?.pageCount ?? 1}
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
                disabled={page >= (customersQuery.data?.pageCount ?? 1)}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={saveGroupOpen} onOpenChange={setSaveGroupOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingGroup ? "Edit customer group" : "Save customer group"}
            </DialogTitle>
            <DialogDescription>
              {editingGroup
                ? "Update the saved group's admin-facing name and note."
                : "Save the current user filter as a reusable audience for future promotional notifications."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Group name</Label>
              <Input
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                placeholder="Example: Dhaka weekend buyers"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={groupDescription}
                onChange={(event) => setGroupDescription(event.target.value)}
                placeholder="Internal note for the admin team"
                rows={3}
              />
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="font-medium">
                {editingGroup
                  ? `${editingGroup.memberCount} saved members`
                  : `${customersQuery.data?.total ?? 0} users match right now`}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {editingGroup
                  ? "Editing does not change the saved members."
                  : "The group stores the matched customers now. You can still use smart filters later for live audience targeting."}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSaveGroupOpen(false)
                setEditingGroup(null)
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                saveGroupMutation.isPending ||
                updateGroupMutation.isPending ||
                !groupName.trim()
              }
              onClick={submitGroupForm}
            >
              {saveGroupMutation.isPending || updateGroupMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              {editingGroup ? "Update group" : "Save group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet
        open={Boolean(groupMembersTarget)}
        onOpenChange={(open) => {
          if (!open) setGroupMembersTarget(null)
        }}
      >
        <SheetContent className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-3xl! md:max-w-6xl!">
          <SheetHeader className="border-b px-6 py-5">
            <SheetTitle>{groupMembersTarget?.name ?? "Group members"}</SheetTitle>
            <SheetDescription>
              Add, remove, and review customers inside this manual audience
              group.
            </SheetDescription>
          </SheetHeader>
          <div className="grid flex-1 gap-4 overflow-y-auto p-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-3">
              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-lg font-semibold">
                      {groupMembersTarget?.memberCount ?? 0} members
                    </div>
                    <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                      {groupMembersTarget?.description || "No description added."}
                    </p>
                  </div>
                  {groupMembersTarget ? (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openEditGroupDialog(groupMembersTarget)}
                      >
                        <Pencil className="size-4" />
                        Edit group
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteGroupTarget(groupMembersTarget)}
                      >
                        <Trash2 className="size-4" />
                        Delete
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border">
                <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
                  <div>
                    <p className="font-medium">Current members</p>
                    <p className="text-xs text-muted-foreground">
                      These users receive notifications sent to this group.
                    </p>
                  </div>
                  {groupMembersQuery.isFetching ? (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  ) : null}
                </div>
                <div className="max-h-[560px] overflow-y-auto">
                  {groupMembers.map((customer) => (
                    <div
                      key={customer.id}
                      className="flex flex-col gap-3 border-b p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <button
                        type="button"
                        className="flex min-w-0 items-center gap-3 text-left"
                        onClick={() => setSelectedCustomerId(customer.id)}
                      >
                        <Avatar className="size-9">
                          <AvatarFallback>
                            {getInitials(customer.fullName)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {customer.fullName}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {customer.phone || customer.email || "No contact"}
                          </span>
                          <span className="mt-2 block">
                            <CustomerMiniStats customer={customer} />
                          </span>
                        </span>
                      </button>
                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        <Badge
                          variant="outline"
                          className={getCustomerStatusBadgeClass(customer.status)}
                        >
                          {customer.status}
                        </Badge>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={
                            removeMemberMutation.isPending || !groupMembersTarget
                          }
                          onClick={() => {
                            if (groupMembersTarget) {
                              removeMemberMutation.mutate({
                                groupId: groupMembersTarget.id,
                                customerId: customer.id,
                              })
                            }
                          }}
                        >
                          {removeMemberMutation.isPending ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <UserMinus className="size-4" />
                          )}
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                  {groupMembersQuery.isLoading ? (
                    <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      Loading members...
                    </div>
                  ) : null}
                  {!groupMembersQuery.isLoading && !groupMembers.length ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      No members found for this group.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl border bg-card p-4">
                <div className="flex items-center gap-2">
                  <UserPlus className="size-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Add members</p>
                    <p className="text-xs text-muted-foreground">
                      Search active customers and add them to this group.
                    </p>
                  </div>
                </div>
                <div className="relative mt-4">
                  <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={groupMemberSearch}
                    onChange={(event) => setGroupMemberSearch(event.target.value)}
                    placeholder="Search by name or phone"
                    className="pl-8"
                  />
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border">
                <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
                  <p className="font-medium">Available customers</p>
                  {groupMemberCandidatesQuery.isFetching ? (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  ) : null}
                </div>
                <div className="max-h-[620px] overflow-y-auto">
                  {groupMemberCandidates.map((customer) => {
                    const alreadyAdded = groupMemberIds.has(customer.id)
                    return (
                      <div
                        key={customer.id}
                        className="flex flex-col gap-3 border-b p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <button
                          type="button"
                          className="flex min-w-0 items-center gap-3 text-left"
                          onClick={() => setSelectedCustomerId(customer.id)}
                        >
                          <Avatar className="size-9">
                            <AvatarFallback>
                              {getInitials(customer.fullName)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="min-w-0">
                            <span className="block truncate font-medium">
                              {customer.fullName}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {customer.phone || customer.email || "No contact"}
                            </span>
                            <span className="mt-2 block">
                              <CustomerMiniStats customer={customer} />
                            </span>
                          </span>
                        </button>
                        <Button
                          type="button"
                          size="sm"
                          variant={alreadyAdded ? "secondary" : "outline"}
                          disabled={
                            alreadyAdded ||
                            addMemberMutation.isPending ||
                            !groupMembersTarget
                          }
                          onClick={() => {
                            if (groupMembersTarget) {
                              addMemberMutation.mutate({
                                groupId: groupMembersTarget.id,
                                customerIds: [customer.id],
                              })
                            }
                          }}
                        >
                          {addMemberMutation.isPending ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : alreadyAdded ? (
                            <CheckCircle2 className="size-4" />
                          ) : (
                            <Plus className="size-4" />
                          )}
                          {alreadyAdded ? "Added" : "Add"}
                        </Button>
                      </div>
                    )
                  })}
                  {groupMemberCandidatesQuery.isLoading ? (
                    <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      Loading customers...
                    </div>
                  ) : null}
                  {!groupMemberCandidatesQuery.isLoading &&
                  !groupMemberCandidates.length ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      No customers found.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={Boolean(deleteGroupTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteGroupTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete customer group?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the saved group from admin targeting. Customers are
              not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteGroupMutation.isPending}
              onClick={() => {
                if (deleteGroupTarget) {
                  deleteGroupMutation.mutate(deleteGroupTarget.id)
                }
              }}
            >
              {deleteGroupMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Delete group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CustomerStatusDialog
        target={statusTarget}
        onOpenChange={(open) => {
          if (!open) setStatusTarget(null)
        }}
      />
      <CustomerDetailsSheet
        customerId={selectedCustomerId}
        open={Boolean(selectedCustomerId)}
        initialTab={customerDetailsInitialTab}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setSelectedCustomerId("")
            setCustomerDetailsInitialTab("overview")
          }
        }}
        onStatus={(customer, nextStatus) =>
          setStatusTarget({ customer, status: nextStatus })
        }
      />
    </>
  )
}
