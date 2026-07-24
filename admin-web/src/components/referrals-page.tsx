import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Ban,
  Eye,
  Gift,
  Loader2,
  RefreshCcw,
  Search,
  ShieldAlert,
  TicketPercent,
  TrendingUp,
  Users,
} from "lucide-react"
import { toast } from "sonner"

import { useDebouncedValue } from "@/hooks/use-debounced-value"
import {
  blockAdminFirstOrderOfferDevice,
  blockAdminWelcomeOfferDevice,
  getAdminFirstOrderOfferDevice,
  getAdminFirstOrderOffer,
  getAdminWelcomeOfferDevice,
  getAdminReferralRiskDevice,
  getAdminReferral,
  listAdminReferralRiskDevices,
  listAdminFirstOrderOfferDevices,
  listAdminFirstOrderOffers,
  listAdminReferrals,
  listAdminWelcomeOfferDevices,
  updateAdminCustomerReferralAccess,
  type AdminFirstOrderOfferDeviceDetails,
  type AdminFirstOrderOfferDeviceRow,
  type AdminFirstOrderOfferDeviceStatus,
  type AdminFirstOrderOfferClaimRow,
  type AdminFirstOrderOfferClaimStatus,
  type AdminReferralRiskDeviceDetails,
  type AdminReferralRiskDeviceRow,
  type AdminReferralRiskDeviceStatus,
  type AdminReferralRow,
  type AdminReferralStatus,
  type AdminWelcomeOfferDeviceDetails,
  type AdminWelcomeOfferDeviceRow,
  type AdminWelcomeOfferDeviceStatus,
  type AdminWelcomeOfferDeviceUsedOffer,
} from "@/lib/admin-api"
import { AdminDateRangeFilter } from "@/components/admin-date-range-filter"
import { Badge } from "@/components/ui/badge"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

type ReferralStatusFilter = "all" | AdminReferralStatus
type ReferralPreset =
  | "today"
  | "yesterday"
  | "last7Days"
  | "last30Days"
  | "last90Days"
  | "thisMonth"
  | "lastMonth"
  | "lifetime"
  | "custom"
type ReferralSort = "newest" | "oldest" | "rewardedAt" | "risk"
type FirstOrderOfferStatusFilter = "all" | AdminFirstOrderOfferClaimStatus
type FirstOrderOfferRiskFilter = "all" | "suspicious" | "clean"
type FirstOrderOfferPaymentFilter = "all" | "Cash" | "Bkash"
type FirstOrderOfferSort = "newest" | "oldest" | "amount" | "risk"
type FirstOrderOfferDeviceStatusFilter = "all" | AdminFirstOrderOfferDeviceStatus
type FirstOrderOfferDeviceClaimFilter = "all" | "claimed" | "not_claimed"
type FirstOrderOfferDeviceSort = "lastSeen" | "claims" | "accounts" | "danger"
type ReferralRiskDeviceStatusFilter = "all" | AdminReferralRiskDeviceStatus
type ReferralRiskDeviceSort = "risk" | "accounts" | "referrals" | "lastSeen"
type WelcomeOfferDeviceStatusFilter = "all" | AdminWelcomeOfferDeviceStatus
type WelcomeOfferDeviceOfferFilter = "all" | AdminWelcomeOfferDeviceUsedOffer
type WelcomeOfferDeviceSort =
  | "lastSeen"
  | "risk"
  | "accounts"
  | "ffoClaims"
  | "referrals"

function formatDate(value?: string | null) {
  if (!value) return "N/A"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "N/A"
  return date.toLocaleString()
}

function formatCurrency(value: number) {
  return `Tk ${Math.round(Number.isFinite(value) ? value : 0).toLocaleString()}`
}

function statusLabel(status: ReferralStatusFilter) {
  if (status === "under_review") return "Under review"
  return status
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ")
}

function statusBadgeClass(status: AdminReferralStatus) {
  if (status === "rewarded")
    return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (status === "pending")
    return "border-sky-200 bg-sky-50 text-sky-700"
  if (status === "under_review")
    return "border-amber-200 bg-amber-50 text-amber-700"
  if (status === "capped" || status === "disabled")
    return "border-slate-200 bg-slate-50 text-slate-700"
  return "border-rose-200 bg-rose-50 text-rose-700"
}

function firstOrderOfferStatusLabel(status: FirstOrderOfferStatusFilter) {
  if (status === "all") return "All"
  return status[0]?.toUpperCase() + status.slice(1)
}

function firstOrderOfferStatusBadgeClass(
  status: AdminFirstOrderOfferClaimStatus
) {
  if (status === "confirmed")
    return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (status === "reserved")
    return "border-sky-200 bg-sky-50 text-sky-700"
  return "border-slate-200 bg-slate-50 text-slate-700"
}

function compactId(value: string) {
  return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : "N/A"
}

function firstOrderDeviceStatusLabel(status: FirstOrderOfferDeviceStatusFilter) {
  if (status === "all") return "All"
  if (status === "admin_blocked") return "Admin blocked"
  if (status === "ffo_used") return "FFO used"
  if (status === "multiple_accounts") return "Multiple accounts"
  return status[0]?.toUpperCase() + status.slice(1)
}

function firstOrderDeviceStatusBadgeClass(status: AdminFirstOrderOfferDeviceStatus) {
  if (status === "danger") return "border-rose-200 bg-rose-50 text-rose-700"
  if (status === "admin_blocked") return "border-zinc-300 bg-zinc-100 text-zinc-800"
  if (status === "ffo_used") return "border-amber-200 bg-amber-50 text-amber-700"
  if (status === "multiple_accounts") return "border-sky-200 bg-sky-50 text-sky-700"
  return "border-emerald-200 bg-emerald-50 text-emerald-700"
}

function referralRiskStatusLabel(status: ReferralRiskDeviceStatusFilter) {
  if (status === "all") return "All"
  return status[0]?.toUpperCase() + status.slice(1)
}

function referralRiskStatusBadgeClass(status: AdminReferralRiskDeviceStatus) {
  if (status === "danger") return "border-rose-200 bg-rose-50 text-rose-700"
  if (status === "warning") return "border-amber-200 bg-amber-50 text-amber-700"
  return "border-emerald-200 bg-emerald-50 text-emerald-700"
}

function welcomeDeviceStatusLabel(status: WelcomeOfferDeviceStatusFilter) {
  if (status === "all") return "All"
  if (status === "system_blocked") return "System blocked"
  if (status === "admin_blocked") return "Admin blocked"
  if (status === "needs_review") return "Needs review"
  return status[0]?.toUpperCase() + status.slice(1)
}

function welcomeDeviceStatusBadgeClass(status: AdminWelcomeOfferDeviceStatus) {
  if (status === "admin_blocked") return "border-zinc-300 bg-zinc-100 text-zinc-800"
  if (status === "system_blocked") return "border-sky-200 bg-sky-50 text-sky-700"
  if (status === "needs_review") return "border-amber-200 bg-amber-50 text-amber-700"
  return "border-emerald-200 bg-emerald-50 text-emerald-700"
}

function welcomeUsedOfferLabel(offer: WelcomeOfferDeviceOfferFilter) {
  if (offer === "all") return "All"
  if (offer === "ffo") return "FFO"
  if (offer === "referral") return "Referral"
  if (offer === "mixed") return "Mixed"
  return "None"
}

function StatCard({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string
  value: string
  helper: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tracking-tight">{value}</p>
          <p className="text-xs text-muted-foreground">{helper}</p>
        </div>
      </CardContent>
    </Card>
  )
}

export function ReferralsPage() {
  const [search, setSearch] = React.useState("")
  const [status, setStatus] = React.useState<ReferralStatusFilter>("all")
  const [preset, setPreset] = React.useState<ReferralPreset>("last30Days")
  const [from, setFrom] = React.useState("")
  const [to, setTo] = React.useState("")
  const [sortBy, setSortBy] = React.useState<ReferralSort>("newest")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(20)
  const [selectedReferral, setSelectedReferral] =
    React.useState<AdminReferralRow | null>(null)
  const debouncedSearch = useDebouncedValue(search, 300)

  React.useEffect(() => {
    setPage(1)
  }, [debouncedSearch, status, preset, from, to, sortBy, pageSize])

  React.useEffect(() => {
    if (preset !== "custom") {
      setFrom("")
      setTo("")
    }
  }, [preset])

  const referralsQuery = useQuery({
    queryKey: [
      "admin-referrals",
      debouncedSearch,
      status,
      preset,
      from,
      to,
      sortBy,
      page,
      pageSize,
    ],
    queryFn: () =>
      listAdminReferrals({
        search: debouncedSearch,
        status,
        preset,
        from: preset === "custom" ? from : undefined,
        to: preset === "custom" ? to : undefined,
        sortBy,
        page,
        pageSize,
      }),
  })

  const detailsQuery = useQuery({
    queryKey: ["admin-referral", selectedReferral?.id],
    enabled: Boolean(selectedReferral?.id),
    queryFn: () => getAdminReferral(selectedReferral?.id ?? ""),
  })

  const data = referralsQuery.data
  const summary = data?.summary
  const details = detailsQuery.data ?? selectedReferral

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Referral Analytics
          </h1>
          <p className="text-sm text-muted-foreground">
            Track who referred, who applied the code, reward status, fraud review,
            and conversion value.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void referralsQuery.refetch()}
          disabled={referralsQuery.isFetching}
        >
          {referralsQuery.isFetching ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <RefreshCcw className="mr-2 size-4" />
          )}
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="referrals" className="space-y-6">
        <TabsList className="flex h-auto w-full flex-wrap justify-start md:w-fit">
          <TabsTrigger value="referrals">Referrals</TabsTrigger>
          <TabsTrigger value="welcome">Welcome Devices</TabsTrigger>
        </TabsList>

        <TabsContent value="referrals" className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Total referrals"
          value={`${summary?.totalReferrals ?? 0}`}
          helper="In selected period"
          icon={Users}
        />
        <StatCard
          label="Rewarded"
          value={`${summary?.rewardedReferrals ?? 0}`}
          helper={formatCurrency(summary?.rewardValue ?? 0)}
          icon={Gift}
        />
        <StatCard
          label="Under review"
          value={`${summary?.underReviewReferrals ?? 0}`}
          helper="Needs admin attention"
          icon={ShieldAlert}
        />
        <StatCard
          label="Blocked"
          value={`${summary?.blockedReferrals ?? 0}`}
          helper="Rejected, capped, or disabled"
          icon={TicketPercent}
        />
        <StatCard
          label="Conversion"
          value={`${summary?.conversionRate ?? 0}%`}
          helper="Rewarded / total"
          icon={TrendingUp}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Search by phone, name, referral code, order number, or voucher code.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <div className="space-y-2 xl:col-span-2">
            <Label>Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, phone, code, order"
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as ReferralStatusFilter)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["all", "pending", "rewarded", "under_review", "rejected", "capped", "disabled"].map((item) => (
                  <SelectItem key={item} value={item}>
                    {statusLabel(item as ReferralStatusFilter)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AdminDateRangeFilter<ReferralPreset>
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
          <div className="space-y-2">
            <Label>Sort</Label>
            <Select value={sortBy} onValueChange={(value) => setSortBy(value as ReferralSort)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="oldest">Oldest</SelectItem>
                <SelectItem value="rewardedAt">Rewarded first</SelectItem>
                <SelectItem value="risk">Highest risk</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Rows</Label>
            <Select value={`${pageSize}`} onValueChange={(value) => setPageSize(Number(value))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 50, 100].map((item) => (
                  <SelectItem key={item} value={`${item}`}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle>Referral Activity</CardTitle>
            <CardDescription>
              {data?.total ?? 0} records found. Click a row to inspect full details.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Referrer</TableHead>
                    <TableHead>Applied customer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Reward</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {referralsQuery.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-28 text-center">
                        <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ) : data?.items.length ? (
                    data.items.map((referral) => (
                      <TableRow
                        key={referral.id}
                        className="cursor-pointer"
                        onClick={() => setSelectedReferral(referral)}
                      >
                        <TableCell>
                          <div className="font-medium">{referral.referrer.fullName}</div>
                          <div className="text-xs text-muted-foreground">
                            {referral.referrer.phone || "No phone"} · {referral.referrer.referralCode || "No code"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{referral.referredCustomer.fullName}</div>
                          <div className="text-xs text-muted-foreground">
                            {referral.referredCustomer.phone || "No phone"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusBadgeClass(referral.status)}>
                            {statusLabel(referral.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(referral.referredAt)}</TableCell>
                        <TableCell>
                          <div>{referral.order.orderNumber || "No order yet"}</div>
                          <div className="text-xs text-muted-foreground">
                            {referral.order.status || "Waiting"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>{referral.reward.voucherCode || "N/A"}</div>
                          <div className="text-xs text-muted-foreground">
                            {referral.reward.amount ? formatCurrency(referral.reward.amount) : "No reward"}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation()
                              setSelectedReferral(referral)
                            }}
                          >
                            <Eye className="mr-2 size-4" />
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="h-28 text-center text-muted-foreground">
                        No referrals match these filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Page {data?.page ?? page} of {data?.pageCount ?? 1}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={page <= 1 || referralsQuery.isFetching}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  disabled={page >= (data?.pageCount ?? 1) || referralsQuery.isFetching}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Referrers</CardTitle>
            <CardDescription>Highest performing referrers in this period.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data?.topReferrers.length ? (
              data.topReferrers.map((referrer) => (
                <div key={referrer.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{referrer.fullName}</p>
                      <p className="text-xs text-muted-foreground">
                        {referrer.phone || "No phone"} · {referrer.referralCode || "No code"}
                      </p>
                    </div>
                    <Badge variant="secondary">{referrer.rewardedReferrals} won</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Total</p>
                      <p className="font-semibold">{referrer.totalReferrals}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Review</p>
                      <p className="font-semibold">{referrer.underReviewReferrals}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Reward</p>
                      <p className="font-semibold">{formatCurrency(referrer.rewardValue)}</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No referrer activity yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <ReferralDetailsDrawer
        referral={details}
        loading={detailsQuery.isFetching && Boolean(selectedReferral)}
        open={Boolean(selectedReferral)}
        onOpenChange={(open) => {
          if (!open) setSelectedReferral(null)
        }}
      />
        </TabsContent>

        <TabsContent value="welcome" className="space-y-6">
          <WelcomeDevicesTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function WelcomeDevicesTab() {
  const queryClient = useQueryClient()
  const [search, setSearch] = React.useState("")
  const [status, setStatus] = React.useState<WelcomeOfferDeviceStatusFilter>("all")
  const [offer, setOffer] = React.useState<WelcomeOfferDeviceOfferFilter>("all")
  const [sortBy, setSortBy] = React.useState<WelcomeOfferDeviceSort>("lastSeen")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(20)
  const [selectedDevice, setSelectedDevice] =
    React.useState<AdminWelcomeOfferDeviceRow | null>(null)
  const [blockTarget, setBlockTarget] =
    React.useState<AdminWelcomeOfferDeviceRow | null>(null)
  const debouncedSearch = useDebouncedValue(search, 300)

  React.useEffect(() => {
    setPage(1)
  }, [debouncedSearch, status, offer, sortBy, pageSize])

  const devicesQuery = useQuery({
    queryKey: [
      "admin-referrals",
      "welcome-devices",
      debouncedSearch,
      status,
      offer,
      sortBy,
      page,
      pageSize,
    ],
    queryFn: () =>
      listAdminWelcomeOfferDevices({
        search: debouncedSearch,
        status,
        offer,
        preset: "lifetime",
        sortBy,
        page,
        pageSize,
      }),
  })

  const detailsQuery = useQuery({
    queryKey: ["admin-referrals", "welcome-device", selectedDevice?.deviceId],
    enabled: Boolean(selectedDevice?.deviceId),
    queryFn: () => getAdminWelcomeOfferDevice(selectedDevice?.deviceId ?? ""),
  })

  const blockMutation = useMutation({
    mutationFn: blockAdminWelcomeOfferDevice,
    onSuccess: (device) => {
      toast.success("Device permanently blocked for future welcome offers.")
      setBlockTarget(null)
      setSelectedDevice(device)
      void queryClient.invalidateQueries({ queryKey: ["admin-referrals"] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Device block failed.")
    },
  })

  const data = devicesQuery.data
  const summary = data?.summary
  const details = detailsQuery.data ?? selectedDevice

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Welcome Devices
          </h2>
          <p className="text-sm text-muted-foreground">
            One device, one welcome benefit. FFO and referral welcome activity share
            the same block state here.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void devicesQuery.refetch()}
          disabled={devicesQuery.isFetching}
        >
          {devicesQuery.isFetching ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <RefreshCcw className="mr-2 size-4" />
          )}
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Total devices"
          value={`${summary?.totalDevices ?? 0}`}
          helper="Known fingerprints"
          icon={Users}
        />
        <StatCard
          label="Blocked"
          value={`${summary?.blockedDevices ?? 0}`}
          helper={`${summary?.systemBlockedDevices ?? 0} system / ${summary?.adminBlockedDevices ?? 0} admin`}
          icon={Ban}
        />
        <StatCard
          label="Needs review"
          value={`${summary?.needsReviewDevices ?? 0}`}
          helper="Clean but suspicious"
          icon={ShieldAlert}
        />
        <StatCard
          label="FFO used"
          value={`${summary?.ffoDevices ?? 0}`}
          helper={`${summary?.totalFfoClaims ?? 0} claims`}
          icon={Gift}
        />
        <StatCard
          label="Referral used"
          value={`${summary?.referralDevices ?? 0}`}
          helper={`${summary?.totalReferralApplications ?? 0} applied`}
          icon={TicketPercent}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Device Filters</CardTitle>
          <CardDescription>
            Search and compare the welcome offer path chosen by each device.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <div className="space-y-2 xl:col-span-2">
            <Label>Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Device, phone, reason, note"
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={status}
              onValueChange={(value) =>
                setStatus(value as WelcomeOfferDeviceStatusFilter)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[
                  "all",
                  "available",
                  "needs_review",
                  "system_blocked",
                  "admin_blocked",
                ].map((item) => (
                  <SelectItem key={item} value={item}>
                    {welcomeDeviceStatusLabel(
                      item as WelcomeOfferDeviceStatusFilter
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Used offer</Label>
            <Select
              value={offer}
              onValueChange={(value) =>
                setOffer(value as WelcomeOfferDeviceOfferFilter)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["all", "none", "ffo", "referral", "mixed"].map((item) => (
                  <SelectItem key={item} value={item}>
                    {welcomeUsedOfferLabel(
                      item as WelcomeOfferDeviceOfferFilter
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Sort</Label>
            <Select
              value={sortBy}
              onValueChange={(value) => setSortBy(value as WelcomeOfferDeviceSort)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lastSeen">Last seen</SelectItem>
                <SelectItem value="risk">Risk first</SelectItem>
                <SelectItem value="accounts">Most accounts</SelectItem>
                <SelectItem value="ffoClaims">Most FFO claims</SelectItem>
                <SelectItem value="referrals">Most referrals</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Rows</Label>
            <Select
              value={`${pageSize}`}
              onValueChange={(value) => setPageSize(Number(value))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 50, 100].map((item) => (
                  <SelectItem key={item} value={`${item}`}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Devices</CardTitle>
          <CardDescription>
            {data?.total ?? 0} devices found. Blocked means the device is already
            prevented from future FFO and referral welcome rewards.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Used Offer</TableHead>
                  <TableHead>FFO Claims</TableHead>
                  <TableHead>Referral</TableHead>
                  <TableHead>Accounts</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devicesQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-28 text-center">
                      <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : data?.items.length ? (
                  data.items.map((device) => (
                    <TableRow
                      key={device.deviceId}
                      className="cursor-pointer"
                      onClick={() => setSelectedDevice(device)}
                    >
                      <TableCell>
                        <div className="font-mono text-sm font-medium">
                          {compactId(device.deviceId)}
                        </div>
                        <div className="max-w-[280px] truncate text-xs text-muted-foreground">
                          {device.deviceId}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={welcomeDeviceStatusBadgeClass(device.status)}
                        >
                          {welcomeDeviceStatusLabel(device.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {welcomeUsedOfferLabel(device.usedOffer)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{device.ffo.claimCount}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatCurrency(device.ffo.totalAmount)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {device.referral.appliedCount} applied
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {device.referral.welcomeCount} welcome /{" "}
                          {device.referral.rewardedCount} rewarded
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="secondary">
                            {device.accountCount} accounts
                          </Badge>
                          <Badge variant="outline">{device.phoneCount} phones</Badge>
                        </div>
                        <div className="mt-1 max-w-[220px] truncate text-xs text-muted-foreground">
                          {device.phones.slice(0, 3).join(", ") || "No phone"}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation()
                              setSelectedDevice(device)
                            }}
                          >
                            <Eye className="mr-2 size-4" />
                            View
                          </Button>
                          <Button
                            variant={device.blocked ? "outline" : "destructive"}
                            size="sm"
                            disabled={device.blocked}
                            onClick={(event) => {
                              event.stopPropagation()
                              setBlockTarget(device)
                            }}
                          >
                            <Ban className="mr-2 size-4" />
                            {device.blocked ? "Blocked" : "Block"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-28 text-center text-muted-foreground"
                    >
                      No welcome devices match these filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Page {data?.page ?? page} of {data?.pageCount ?? 1}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={page <= 1 || devicesQuery.isFetching}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={page >= (data?.pageCount ?? 1) || devicesQuery.isFetching}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <WelcomeDeviceDetailsDrawer
        device={details}
        loading={detailsQuery.isFetching && Boolean(selectedDevice)}
        onBlock={(device) => setBlockTarget(device)}
        open={Boolean(selectedDevice)}
        onOpenChange={(open) => {
          if (!open) setSelectedDevice(null)
        }}
      />
      <BlockWelcomeDeviceDialog
        device={blockTarget}
        loading={blockMutation.isPending}
        onOpenChange={(open) => {
          if (!open && !blockMutation.isPending) setBlockTarget(null)
        }}
        onSubmit={(values) => {
          if (!blockTarget) return
          blockMutation.mutate({
            deviceId: blockTarget.deviceId,
            reason: values.reason,
            note: values.note,
          })
        }}
      />
    </div>
  )
}

type WelcomeDeviceLike =
  | AdminWelcomeOfferDeviceDetails
  | AdminWelcomeOfferDeviceRow

function hasWelcomeDeviceDetails(
  device: WelcomeDeviceLike | null
): device is AdminWelcomeOfferDeviceDetails {
  return Boolean(device && "accounts" in device && "ffoClaims" in device)
}

function WelcomeDeviceDetailsDrawer({
  device,
  loading,
  open,
  onOpenChange,
  onBlock,
}: {
  device: WelcomeDeviceLike | null
  loading: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onBlock: (device: AdminWelcomeOfferDeviceRow) => void
}) {
  const accounts = hasWelcomeDeviceDetails(device) ? device.accounts : []
  const claims = hasWelcomeDeviceDetails(device) ? device.ffoClaims : []
  const referrers = hasWelcomeDeviceDetails(device) ? device.referrers : []

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-3xl! md:max-w-6xl!">
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle>Welcome device details</SheetTitle>
          <SheetDescription>
            FFO claims, referral activity, connected accounts, and shared block state.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1 p-6">
          {loading && !device ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : device ? (
            <div className="space-y-6">
              <div className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-2">
                    <p className="font-mono text-sm font-semibold">
                      {device.deviceId}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        variant="outline"
                        className={welcomeDeviceStatusBadgeClass(device.status)}
                      >
                        {welcomeDeviceStatusLabel(device.status)}
                      </Badge>
                      <Badge variant="secondary">
                        {welcomeUsedOfferLabel(device.usedOffer)}
                      </Badge>
                      {device.blocked ? (
                        <Badge variant="outline">Blocked</Badge>
                      ) : null}
                    </div>
                  </div>
                  <Button
                    variant={device.blocked ? "outline" : "destructive"}
                    disabled={device.blocked}
                    onClick={() => onBlock(device)}
                  >
                    <Ban className="mr-2 size-4" />
                    {device.blocked ? "Already blocked" : "Block device"}
                  </Button>
                </div>
                {device.reasons.length ? (
                  <div className="mt-4 space-y-2 rounded-md bg-muted p-3 text-sm text-muted-foreground">
                    {device.reasons.map((reason) => (
                      <p key={reason}>{reason}</p>
                    ))}
                  </div>
                ) : null}
              </div>

              <section className="space-y-3">
                <h3 className="font-semibold">Summary</h3>
                <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4">
                  <DetailItem label="Accounts" value={device.accountCount} />
                  <DetailItem label="Phones" value={device.phoneCount} />
                  <DetailItem label="FFO claims" value={device.ffo.claimCount} />
                  <DetailItem
                    label="FFO cost"
                    value={formatCurrency(device.ffo.totalAmount)}
                  />
                  <DetailItem
                    label="Referral applied"
                    value={device.referral.appliedCount}
                  />
                  <DetailItem
                    label="Referral welcome"
                    value={device.referral.welcomeCount}
                  />
                  <DetailItem label="First seen" value={formatDate(device.firstSeen)} />
                  <DetailItem label="Last seen" value={formatDate(device.lastSeen)} />
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="font-semibold">Block state</h3>
                <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                  <DetailItem
                    label="Blocked"
                    value={device.blocked ? welcomeDeviceStatusLabel(device.status) : "No"}
                  />
                  <DetailItem label="Source" value={device.block.source || "System"} />
                  <DetailItem label="Reason" value={device.block.reason} />
                  <DetailItem label="Note" value={device.block.note} />
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="font-semibold">Connected accounts</h3>
                <div className="overflow-hidden rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead>FFO</TableHead>
                        <TableHead>Referral</TableHead>
                        <TableHead>Signals</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {accounts.length ? (
                        accounts.map((account) => (
                          <TableRow key={account.id}>
                            <TableCell>
                              <div className="font-medium">{account.fullName}</div>
                              <div className="text-xs text-muted-foreground">
                                {account.phone || "No phone"} / {compactId(account.id)}
                              </div>
                            </TableCell>
                            <TableCell>
                              {account.ffoClaimed ? (
                                <Badge variant="outline">
                                  Claimed {account.ffoClaimCount || 1}
                                </Badge>
                              ) : (
                                <Badge variant="secondary">None</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {account.appliedReferral ? (
                                  <Badge variant="outline">Applied</Badge>
                                ) : null}
                                {account.gotRefereeVoucher ? (
                                  <Badge variant="outline">Welcome</Badge>
                                ) : null}
                                {account.referralRewardStatus === "rewarded" ? (
                                  <Badge variant="outline">Rewarded</Badge>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {account.sameDeviceReferral ? (
                                  <Badge variant="destructive">Same device</Badge>
                                ) : null}
                                {account.referralDisabledByAdmin ? (
                                  <Badge variant="secondary">Referral off</Badge>
                                ) : null}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell
                            colSpan={4}
                            className="h-20 text-center text-muted-foreground"
                          >
                            No connected accounts found.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </section>

              <section className="grid gap-6 xl:grid-cols-2">
                <div className="space-y-3">
                  <h3 className="font-semibold">FFO claim history</h3>
                  <div className="overflow-hidden rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Customer</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {claims.length ? (
                          claims.map((claimRow) => (
                            <TableRow key={claimRow.id}>
                              <TableCell>
                                <div className="font-medium">
                                  {claimRow.customer.fullName}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {claimRow.order.orderNumber || "No order"}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={firstOrderOfferStatusBadgeClass(
                                    claimRow.status
                                  )}
                                >
                                  {firstOrderOfferStatusLabel(claimRow.status)}
                                </Badge>
                              </TableCell>
                              <TableCell>{formatCurrency(claimRow.amount)}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell
                              colSpan={3}
                              className="h-20 text-center text-muted-foreground"
                            >
                              No FFO claims from this device.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="font-semibold">Referral referrers</h3>
                  <div className="overflow-hidden rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Referrer</TableHead>
                          <TableHead>Code</TableHead>
                          <TableHead>Referrals</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {referrers.length ? (
                          referrers.map((referrer) => (
                            <TableRow key={referrer.id}>
                              <TableCell>
                                <div className="font-medium">{referrer.fullName}</div>
                                <div className="text-xs text-muted-foreground">
                                  {referrer.phone || "No phone"}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="font-mono">
                                  {referrer.referralCode || "No code"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {referrer.referredCount} total,{" "}
                                {referrer.rewardedCount} rewarded
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell
                              colSpan={3}
                              className="h-20 text-center text-muted-foreground"
                            >
                              No referral activity on this device.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </section>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No device selected.</p>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

function BlockWelcomeDeviceDialog({
  device,
  loading,
  onOpenChange,
  onSubmit,
}: {
  device: AdminWelcomeOfferDeviceRow | null
  loading: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: { reason: string; note: string }) => void
}) {
  const [reason, setReason] = React.useState("Suspicious welcome device activity")
  const [note, setNote] = React.useState("")

  React.useEffect(() => {
    if (!device) return
    setReason("Suspicious welcome device activity")
    setNote("")
  }, [device?.deviceId])

  return (
    <Dialog open={Boolean(device)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Block welcome device</DialogTitle>
          <DialogDescription>
            This device will never receive future FFO or referral welcome rewards.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border bg-muted/40 p-3">
            <p className="font-mono text-sm">{device?.deviceId ?? ""}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {device?.accountCount ?? 0} accounts /{" "}
              {device?.ffo.claimCount ?? 0} FFO claims /{" "}
              {device?.referral.appliedCount ?? 0} referral applications
            </p>
          </div>
          <div className="space-y-2">
            <Label>Reason</Label>
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={160}
            />
          </div>
          <div className="space-y-2">
            <Label>Admin note</Label>
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              rows={4}
              placeholder="Optional context for future review"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={loading || !device}
            onClick={() =>
              onSubmit({
                reason: reason.trim() || "Suspicious welcome device activity",
                note: note.trim(),
              })
            }
          >
            {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Block device
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ReferralRiskDevicesSection() {
  const queryClient = useQueryClient()
  const [search, setSearch] = React.useState("")
  const [status, setStatus] = React.useState<ReferralRiskDeviceStatusFilter>("all")
  const [sortBy, setSortBy] = React.useState<ReferralRiskDeviceSort>("risk")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)
  const [selectedDevice, setSelectedDevice] =
    React.useState<AdminReferralRiskDeviceRow | null>(null)
  const [blockTarget, setBlockTarget] =
    React.useState<AdminReferralRiskDeviceRow | null>(null)
  const debouncedSearch = useDebouncedValue(search, 300)

  React.useEffect(() => {
    setPage(1)
  }, [debouncedSearch, status, sortBy, pageSize])

  const riskQuery = useQuery({
    queryKey: [
      "admin-referrals",
      "risk-devices",
      debouncedSearch,
      status,
      sortBy,
      page,
      pageSize,
    ],
    queryFn: () =>
      listAdminReferralRiskDevices({
        search: debouncedSearch,
        status,
        sortBy,
        preset: "lifetime",
        page,
        pageSize,
      }),
  })

  const detailsQuery = useQuery({
    queryKey: ["admin-referrals", "risk-device", selectedDevice?.deviceId],
    enabled: Boolean(selectedDevice?.deviceId),
    queryFn: () => getAdminReferralRiskDevice(selectedDevice?.deviceId ?? ""),
  })

  const referralAccessMutation = useMutation({
    mutationFn: (params: { customerId: string; disabled: boolean }) =>
      updateAdminCustomerReferralAccess({
        customerId: params.customerId,
        disabled: params.disabled,
        note: params.disabled
          ? "Disabled from referral risk device review"
          : "Enabled from referral risk device review",
      }),
    onSuccess: (_result, variables) => {
      toast.success(
        variables.disabled
          ? "Referral access disabled for customer."
          : "Referral access enabled for customer."
      )
      void queryClient.invalidateQueries({ queryKey: ["admin-referrals"] })
      void queryClient.invalidateQueries({
        queryKey: ["admin-customer-details", variables.customerId],
      })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Referral access update failed."
      )
    },
  })

  const blockMutation = useMutation({
    mutationFn: blockAdminFirstOrderOfferDevice,
    onSuccess: () => {
      toast.success("Device permanently blocked for future welcome offers.")
      setBlockTarget(null)
      void queryClient.invalidateQueries({ queryKey: ["admin-referrals"] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Device block failed.")
    },
  })

  const data = riskQuery.data
  const summary = data?.summary
  const details = detailsQuery.data ?? selectedDevice

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Referral Risk Devices</CardTitle>
            <CardDescription>
              Device-level signals for self-referral, welcome voucher farming, and
              repeated referral activity.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            onClick={() => void riskQuery.refetch()}
            disabled={riskQuery.isFetching}
          >
            {riskQuery.isFetching ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <RefreshCcw className="mr-2 size-4" />
            )}
            Refresh risk
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Risk devices"
            value={`${summary?.totalDevices ?? 0}`}
            helper="With device fingerprints"
            icon={Users}
          />
          <StatCard
            label="Danger"
            value={`${summary?.dangerDevices ?? 0}`}
            helper="Strong scam signals"
            icon={ShieldAlert}
          />
          <StatCard
            label="Warning"
            value={`${summary?.warningDevices ?? 0}`}
            helper="Needs review"
            icon={TicketPercent}
          />
          <StatCard
            label="Self-device refs"
            value={`${summary?.sameDeviceReferrals ?? 0}`}
            helper="Referrer/referee same device"
            icon={Gift}
          />
          <StatCard
            label="Permanent locks"
            value={`${summary?.lockedDevices ?? 0}`}
            helper={`${summary?.adminBlockedDevices ?? 0} admin blocks`}
            icon={Ban}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-2 xl:col-span-2">
            <Label>Search risk devices</Label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Device, phone, customer, code"
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={status}
              onValueChange={(value) =>
                setStatus(value as ReferralRiskDeviceStatusFilter)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["all", "danger", "warning", "clean"].map((item) => (
                  <SelectItem key={item} value={item}>
                    {referralRiskStatusLabel(
                      item as ReferralRiskDeviceStatusFilter
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Sort</Label>
            <Select
              value={sortBy}
              onValueChange={(value) => setSortBy(value as ReferralRiskDeviceSort)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="risk">Risk first</SelectItem>
                <SelectItem value="accounts">Most accounts</SelectItem>
                <SelectItem value="referrals">Most referrals</SelectItem>
                <SelectItem value="lastSeen">Last seen</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Rows</Label>
            <Select
              value={`${pageSize}`}
              onValueChange={(value) => setPageSize(Number(value))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 50].map((item) => (
                  <SelectItem key={item} value={`${item}`}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>Accounts</TableHead>
                <TableHead>Referral Signals</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Seen</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {riskQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-28 text-center">
                    <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : data?.items.length ? (
                data.items.map((device) => (
                  <TableRow
                    key={device.deviceId}
                    className="cursor-pointer"
                    onClick={() => setSelectedDevice(device)}
                  >
                    <TableCell>
                      <div className="font-mono text-sm font-medium">
                        {compactId(device.deviceId)}
                      </div>
                      <div className="max-w-[320px] truncate text-xs text-muted-foreground">
                        {device.deviceId}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="secondary">{device.accountCount} accounts</Badge>
                        <Badge variant="outline">{device.phoneCount} phones</Badge>
                      </div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {device.phones.slice(0, 3).join(", ") || "No phone"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {device.referralAppliedCount} applied /{" "}
                        {device.refereeVoucherCount} welcome vouchers
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {device.sameDeviceReferralCount} same-device refs,{" "}
                        {device.rewardedReferralCount} rewarded
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge
                          variant="outline"
                          className={referralRiskStatusBadgeClass(device.status)}
                        >
                          {referralRiskStatusLabel(device.status)}
                        </Badge>
                        {device.disabledAccountCount > 0 ? (
                          <Badge variant="outline">
                            {device.disabledAccountCount} disabled
                          </Badge>
                        ) : null}
                        {device.manuallyBlocked ? (
                          <Badge variant="outline">Manual block</Badge>
                        ) : device.autoBlocked ? (
                          <Badge variant="outline">Welcome locked</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>{formatDate(device.lastSeen)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation()
                            setSelectedDevice(device)
                          }}
                        >
                          <Eye className="mr-2 size-4" />
                          View
                        </Button>
                        <Button
                          variant={device.manuallyBlocked ? "outline" : "destructive"}
                          size="sm"
                          disabled={device.manuallyBlocked}
                          onClick={(event) => {
                            event.stopPropagation()
                            setBlockTarget(device)
                          }}
                        >
                          <Ban className="mr-2 size-4" />
                          {device.manuallyBlocked ? "Blocked" : "Block"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-28 text-center text-muted-foreground"
                  >
                    No referral risk devices match these filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Page {data?.page ?? page} of {data?.pageCount ?? 1}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={page <= 1 || riskQuery.isFetching}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={page >= (data?.pageCount ?? 1) || riskQuery.isFetching}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        </div>

        <ReferralRiskDeviceDetailsDrawer
          device={details}
          loading={detailsQuery.isFetching && Boolean(selectedDevice)}
          mutatingCustomerId={
            referralAccessMutation.variables?.customerId &&
            referralAccessMutation.isPending
              ? referralAccessMutation.variables.customerId
              : ""
          }
          onToggleReferral={(customerId, disabled) =>
            referralAccessMutation.mutate({ customerId, disabled })
          }
          onBlock={(device) => setBlockTarget(device)}
          open={Boolean(selectedDevice)}
          onOpenChange={(open) => {
            if (!open) setSelectedDevice(null)
          }}
        />
        <BlockReferralRiskDeviceDialog
          device={blockTarget}
          loading={blockMutation.isPending}
          onOpenChange={(open) => {
            if (!open && !blockMutation.isPending) setBlockTarget(null)
          }}
          onSubmit={(values) => {
            if (!blockTarget) return
            blockMutation.mutate({
              deviceId: blockTarget.deviceId,
              reason: values.reason,
              note: values.note,
            })
          }}
        />
      </CardContent>
    </Card>
  )
}

type ReferralRiskDeviceLike =
  | AdminReferralRiskDeviceDetails
  | AdminReferralRiskDeviceRow

function hasReferralRiskDeviceDetails(
  device: ReferralRiskDeviceLike | null
): device is AdminReferralRiskDeviceDetails {
  return Boolean(device && "accounts" in device && "referrers" in device)
}

function ReferralRiskDeviceDetailsDrawer({
  device,
  loading,
  open,
  onOpenChange,
  onToggleReferral,
  onBlock,
  mutatingCustomerId,
}: {
  device: ReferralRiskDeviceLike | null
  loading: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onToggleReferral: (customerId: string, disabled: boolean) => void
  onBlock: (device: AdminReferralRiskDeviceRow) => void
  mutatingCustomerId: string
}) {
  const accounts = hasReferralRiskDeviceDetails(device) ? device.accounts : []
  const referrers = hasReferralRiskDeviceDetails(device) ? device.referrers : []

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-3xl! md:max-w-6xl!">
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle>Referral risk device</SheetTitle>
          <SheetDescription>
            Same-device referral signals and connected customer referral access.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1 p-6">
          {loading && !device ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : device ? (
            <div className="space-y-6">
              <div className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-2">
                    <p className="font-mono text-sm font-semibold">
                      {device.deviceId}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        variant="outline"
                        className={referralRiskStatusBadgeClass(device.status)}
                      >
                        {referralRiskStatusLabel(device.status)}
                      </Badge>
                      {device.accountCount >= 2 ? (
                        <Badge variant="secondary">
                          {device.accountCount} accounts
                        </Badge>
                      ) : null}
                      {device.disabledAccountCount > 0 ? (
                        <Badge variant="outline">
                          {device.disabledAccountCount} disabled
                        </Badge>
                      ) : null}
                      {device.manuallyBlocked ? (
                        <Badge variant="outline">Manual block</Badge>
                      ) : device.autoBlocked ? (
                        <Badge variant="outline">Welcome locked</Badge>
                      ) : null}
                    </div>
                  </div>
                  <Button
                    variant={device.manuallyBlocked ? "outline" : "destructive"}
                    disabled={device.manuallyBlocked}
                    onClick={() => onBlock(device)}
                  >
                    <Ban className="mr-2 size-4" />
                    {device.manuallyBlocked ? "Already blocked" : "Block device"}
                  </Button>
                </div>
                {device.reasons.length ? (
                  <div className="mt-4 space-y-2 rounded-md bg-muted p-3 text-sm text-muted-foreground">
                    {device.reasons.map((reason) => (
                      <p key={reason}>{reason}</p>
                    ))}
                  </div>
                ) : null}
              </div>

              <section className="space-y-3">
                <h3 className="font-semibold">Summary</h3>
                <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4">
                  <DetailItem label="Accounts" value={device.accountCount} />
                  <DetailItem label="Phones" value={device.phoneCount} />
                  <DetailItem
                    label="Referral applied"
                    value={device.referralAppliedCount}
                  />
                  <DetailItem
                    label="Welcome vouchers"
                    value={device.refereeVoucherCount}
                  />
                  <DetailItem
                    label="Same-device referrals"
                    value={device.sameDeviceReferralCount}
                  />
                  <DetailItem
                    label="Manual block"
                    value={
                      device.manuallyBlocked
                        ? formatDate(device.block.manuallyBlockedAt)
                        : "No"
                    }
                  />
                  <DetailItem label="Rewarded" value={device.rewardedReferralCount} />
                  <DetailItem label="First seen" value={formatDate(device.firstSeen)} />
                  <DetailItem label="Last seen" value={formatDate(device.lastSeen)} />
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="font-semibold">Block state</h3>
                <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                  <DetailItem
                    label="Permanent lock"
                    value={device.autoBlocked ? "Yes" : "No"}
                  />
                  <DetailItem
                    label="Manual blocked"
                    value={device.manuallyBlocked ? "Yes" : "No"}
                  />
                  <DetailItem label="Reason" value={device.block.reason} />
                  <DetailItem label="Note" value={device.block.note} />
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="font-semibold">Referrers used on this device</h3>
                <div className="overflow-hidden rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Referrer</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Referrals</TableHead>
                        <TableHead>Same device</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {referrers.length ? (
                        referrers.map((referrer) => (
                          <TableRow key={referrer.id}>
                            <TableCell>
                              <div className="font-medium">{referrer.fullName}</div>
                              <div className="text-xs text-muted-foreground">
                                {referrer.phone || "No phone"} / {compactId(referrer.id)}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="font-mono">
                                {referrer.referralCode || "No code"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {referrer.referredCount} total, {referrer.rewardedCount} rewarded
                            </TableCell>
                            <TableCell>
                              {referrer.sameDeviceCount > 0 ? (
                                <Badge variant="destructive">
                                  {referrer.sameDeviceCount}
                                </Badge>
                              ) : (
                                <Badge variant="secondary">0</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell
                            colSpan={4}
                            className="h-20 text-center text-muted-foreground"
                          >
                            No referrer activity on this device.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="font-semibold">Connected accounts</h3>
                <div className="overflow-hidden rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead>Referral</TableHead>
                        <TableHead>Signals</TableHead>
                        <TableHead className="text-right">Access</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {accounts.length ? (
                        accounts.map((account) => (
                          <TableRow key={account.id}>
                            <TableCell>
                              <div className="font-medium">{account.fullName}</div>
                              <div className="text-xs text-muted-foreground">
                                {account.phone || "No phone"} / {compactId(account.id)}
                              </div>
                            </TableCell>
                            <TableCell>
                              {account.referrer ? (
                                <div>
                                  <div className="text-sm">
                                    {account.referrer.fullName}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {account.referrer.referralCode || "No code"}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-sm text-muted-foreground">
                                  No referral
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {account.sameDeviceReferral ? (
                                  <Badge variant="destructive">Same device</Badge>
                                ) : null}
                                {account.gotRefereeVoucher ? (
                                  <Badge variant="outline">Welcome voucher</Badge>
                                ) : null}
                                {account.referralRewardStatus === "rewarded" ? (
                                  <Badge variant="outline">Rewarded</Badge>
                                ) : null}
                                {account.referralDisabledByAdmin ? (
                                  <Badge variant="secondary">Disabled</Badge>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant={
                                  account.referralDisabledByAdmin
                                    ? "outline"
                                    : "destructive"
                                }
                                size="sm"
                                disabled={mutatingCustomerId === account.id}
                                onClick={() =>
                                  onToggleReferral(
                                    account.id,
                                    !account.referralDisabledByAdmin
                                  )
                                }
                              >
                                {mutatingCustomerId === account.id ? (
                                  <Loader2 className="mr-2 size-4 animate-spin" />
                                ) : null}
                                {account.referralDisabledByAdmin
                                  ? "Enable"
                                  : "Disable"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell
                            colSpan={4}
                            className="h-20 text-center text-muted-foreground"
                          >
                            No connected accounts found.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </section>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No risk device selected.</p>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

function BlockReferralRiskDeviceDialog({
  device,
  loading,
  onOpenChange,
  onSubmit,
}: {
  device: AdminReferralRiskDeviceRow | null
  loading: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: { reason: string; note: string }) => void
}) {
  const [reason, setReason] = React.useState("Suspicious referral device activity")
  const [note, setNote] = React.useState("")

  React.useEffect(() => {
    if (!device) return
    setReason("Suspicious referral device activity")
    setNote("")
  }, [device?.deviceId])

  return (
    <Dialog open={Boolean(device)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Block referral device</DialogTitle>
          <DialogDescription>
            This device will never receive future welcome offers, including FFO
            and referral welcome rewards.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border bg-muted/40 p-3">
            <p className="font-mono text-sm">{device?.deviceId ?? ""}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {device?.accountCount ?? 0} accounts /{" "}
              {device?.referralAppliedCount ?? 0} referral applications
            </p>
          </div>
          <div className="space-y-2">
            <Label>Reason</Label>
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={160}
            />
          </div>
          <div className="space-y-2">
            <Label>Admin note</Label>
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              rows={4}
              placeholder="Optional context for future review"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={loading || !device}
            onClick={() =>
              onSubmit({
                reason: reason.trim() || "Suspicious referral device activity",
                note: note.trim(),
              })
            }
          >
            {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Block device
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FirstOrderOfferDevicesTab() {
  const queryClient = useQueryClient()
  const [search, setSearch] = React.useState("")
  const [status, setStatus] =
    React.useState<FirstOrderOfferDeviceStatusFilter>("all")
  const [claim, setClaim] = React.useState<FirstOrderOfferDeviceClaimFilter>("all")
  const [preset, setPreset] = React.useState<ReferralPreset>("last30Days")
  const [from, setFrom] = React.useState("")
  const [to, setTo] = React.useState("")
  const [sortBy, setSortBy] = React.useState<FirstOrderOfferDeviceSort>("lastSeen")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(20)
  const [selectedDevice, setSelectedDevice] =
    React.useState<AdminFirstOrderOfferDeviceRow | null>(null)
  const [blockTarget, setBlockTarget] =
    React.useState<AdminFirstOrderOfferDeviceRow | null>(null)
  const debouncedSearch = useDebouncedValue(search, 300)

  React.useEffect(() => {
    setPage(1)
  }, [debouncedSearch, status, claim, preset, from, to, sortBy, pageSize])

  React.useEffect(() => {
    if (preset !== "custom") {
      setFrom("")
      setTo("")
    }
  }, [preset])

  const devicesQuery = useQuery({
    queryKey: [
      "admin-referrals",
      "ffo",
      "devices",
      debouncedSearch,
      status,
      claim,
      preset,
      from,
      to,
      sortBy,
      page,
      pageSize,
    ],
    queryFn: () =>
      listAdminFirstOrderOfferDevices({
        search: debouncedSearch,
        status,
        claim,
        preset,
        from: preset === "custom" ? from : undefined,
        to: preset === "custom" ? to : undefined,
        sortBy,
        page,
        pageSize,
      }),
  })

  const detailsQuery = useQuery({
    queryKey: ["admin-referrals", "ffo", "device", selectedDevice?.deviceId],
    enabled: Boolean(selectedDevice?.deviceId),
    queryFn: () => getAdminFirstOrderOfferDevice(selectedDevice?.deviceId ?? ""),
  })

  const blockMutation = useMutation({
    mutationFn: blockAdminFirstOrderOfferDevice,
    onSuccess: (device) => {
      toast.success("Device permanently blocked for future welcome offers.")
      setBlockTarget(null)
      setSelectedDevice(device)
      void queryClient.invalidateQueries({ queryKey: ["admin-referrals"] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Device block failed.")
    },
  })

  const data = devicesQuery.data
  const summary = data?.summary
  const details = detailsQuery.data ?? selectedDevice

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            First Order Offer
          </h2>
          <p className="text-sm text-muted-foreground">
            Device-first view for FFO use, connected accounts, and manual blocks.
            Danger only means this device has 2 or more FFO claims.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void devicesQuery.refetch()}
          disabled={devicesQuery.isFetching}
        >
          {devicesQuery.isFetching ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <RefreshCcw className="mr-2 size-4" />
          )}
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Total devices"
          value={`${summary?.totalDevices ?? 0}`}
          helper="Known FFO fingerprints"
          icon={Users}
        />
        <StatCard
          label="FFO used"
          value={`${summary?.claimedDevices ?? 0}`}
          helper={`${summary?.totalClaims ?? 0} claims total`}
          icon={Gift}
        />
        <StatCard
          label="Multi-account"
          value={`${summary?.multipleAccountDevices ?? 0}`}
          helper="Same device, many accounts"
          icon={TicketPercent}
        />
        <StatCard
          label="Danger"
          value={`${summary?.dangerDevices ?? 0}`}
          helper="2+ FFO claims on device"
          icon={ShieldAlert}
        />
        <StatCard
          label="Admin blocked"
          value={`${summary?.adminBlockedDevices ?? 0}`}
          helper={`Cost ${formatCurrency(summary?.totalDiscountAmount ?? 0)}`}
          icon={TrendingUp}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>FFO Filters</CardTitle>
          <CardDescription>
            Search by device, customer, phone, order number, wallet, IP, or note.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <div className="space-y-2 xl:col-span-2">
            <Label>Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Device, phone, customer, order"
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={status}
              onValueChange={(value) =>
                setStatus(value as FirstOrderOfferDeviceStatusFilter)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[
                  "all",
                  "clean",
                  "multiple_accounts",
                  "ffo_used",
                  "danger",
                  "admin_blocked",
                ].map((item) => (
                  <SelectItem key={item} value={item}>
                    {firstOrderDeviceStatusLabel(
                      item as FirstOrderOfferDeviceStatusFilter
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Claim</Label>
            <Select
              value={claim}
              onValueChange={(value) =>
                setClaim(value as FirstOrderOfferDeviceClaimFilter)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="claimed">Claimed</SelectItem>
                <SelectItem value="not_claimed">Not claimed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <AdminDateRangeFilter<ReferralPreset>
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
          <div className="space-y-2">
            <Label>Sort</Label>
            <Select
              value={sortBy}
              onValueChange={(value) =>
                setSortBy(value as FirstOrderOfferDeviceSort)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lastSeen">Last seen</SelectItem>
                <SelectItem value="claims">Most claims</SelectItem>
                <SelectItem value="accounts">Most accounts</SelectItem>
                <SelectItem value="danger">Danger first</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Rows</Label>
            <Select
              value={`${pageSize}`}
              onValueChange={(value) => setPageSize(Number(value))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 50, 100].map((item) => (
                  <SelectItem key={item} value={`${item}`}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>FFO Devices</CardTitle>
          <CardDescription>
            {data?.total ?? 0} devices found. Multiple-account devices show count badges;
            Danger appears only after 2+ FFO claims on the same device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>Accounts</TableHead>
                  <TableHead>FFO Claims</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Seen</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devicesQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-28 text-center">
                      <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : data?.items.length ? (
                  data.items.map((device) => (
                    <TableRow
                      key={device.deviceId}
                      className="cursor-pointer"
                      onClick={() => setSelectedDevice(device)}
                    >
                      <TableCell>
                        <div className="font-mono text-sm font-medium">
                          {compactId(device.deviceId)}
                        </div>
                        <div className="max-w-[320px] truncate text-xs text-muted-foreground">
                          {device.deviceId}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="secondary">
                            {device.accountCount} accounts
                          </Badge>
                          <Badge variant="outline">{device.phoneCount} phones</Badge>
                        </div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          {device.phones.slice(0, 3).join(", ") || "No phone"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{device.claimCount}</div>
                        <div className="text-xs text-muted-foreground">
                          {device.confirmedClaimCount} confirmed,{" "}
                          {device.releasedClaimCount} released
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge
                            variant="outline"
                            className={firstOrderDeviceStatusBadgeClass(device.status)}
                          >
                            {firstOrderDeviceStatusLabel(device.status)}
                          </Badge>
                          {device.danger ? (
                            <Badge variant="destructive">
                              <ShieldAlert className="size-3" />
                              Danger
                            </Badge>
                          ) : null}
                          {device.accountCount >= 2 ? (
                            <Badge variant="secondary">
                              {device.accountCount} accounts
                            </Badge>
                          ) : null}
                          {device.manuallyBlocked ? (
                            <Badge variant="outline">Manual block</Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>{formatDate(device.lastSeen)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation()
                              setSelectedDevice(device)
                            }}
                          >
                            <Eye className="mr-2 size-4" />
                            View
                          </Button>
                          <Button
                            variant={device.manuallyBlocked ? "outline" : "destructive"}
                            size="sm"
                            disabled={device.manuallyBlocked}
                            onClick={(event) => {
                              event.stopPropagation()
                              setBlockTarget(device)
                            }}
                          >
                            <Ban className="mr-2 size-4" />
                            {device.manuallyBlocked ? "Blocked" : "Block"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-28 text-center text-muted-foreground"
                    >
                      No FFO devices match these filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Page {data?.page ?? page} of {data?.pageCount ?? 1}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={page <= 1 || devicesQuery.isFetching}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={page >= (data?.pageCount ?? 1) || devicesQuery.isFetching}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <FirstOrderDeviceDetailsDrawer
        device={details}
        loading={detailsQuery.isFetching && Boolean(selectedDevice)}
        onBlock={(device) => setBlockTarget(device)}
        open={Boolean(selectedDevice)}
        onOpenChange={(open) => {
          if (!open) setSelectedDevice(null)
        }}
      />
      <BlockFirstOrderDeviceDialog
        device={blockTarget}
        loading={blockMutation.isPending}
        onOpenChange={(open) => {
          if (!open && !blockMutation.isPending) setBlockTarget(null)
        }}
        onSubmit={(values) => {
          if (!blockTarget) return
          blockMutation.mutate({
            deviceId: blockTarget.deviceId,
            reason: values.reason,
            note: values.note,
          })
        }}
      />
    </div>
  )
}

export function FirstOrderOffersTab() {
  return <FirstOrderOfferDevicesTab />
  const [search, setSearch] = React.useState("")
  const [status, setStatus] =
    React.useState<FirstOrderOfferStatusFilter>("all")
  const [risk, setRisk] = React.useState<FirstOrderOfferRiskFilter>("all")
  const [paymentMethod, setPaymentMethod] =
    React.useState<FirstOrderOfferPaymentFilter>("all")
  const [preset, setPreset] = React.useState<ReferralPreset>("last30Days")
  const [from, setFrom] = React.useState("")
  const [to, setTo] = React.useState("")
  const [sortBy, setSortBy] = React.useState<FirstOrderOfferSort>("newest")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(20)
  const [selectedClaim, setSelectedClaim] =
    React.useState<AdminFirstOrderOfferClaimRow | null>(null)
  const debouncedSearch = useDebouncedValue(search, 300)

  React.useEffect(() => {
    setPage(1)
  }, [
    debouncedSearch,
    status,
    risk,
    paymentMethod,
    preset,
    from,
    to,
    sortBy,
    pageSize,
  ])

  React.useEffect(() => {
    if (preset !== "custom") {
      setFrom("")
      setTo("")
    }
  }, [preset])

  const offersQuery = useQuery({
    queryKey: [
      "admin-referrals",
      "ffo",
      debouncedSearch,
      status,
      risk,
      paymentMethod,
      preset,
      from,
      to,
      sortBy,
      page,
      pageSize,
    ],
    queryFn: () =>
      listAdminFirstOrderOffers({
        search: debouncedSearch,
        status,
        risk,
        paymentMethod,
        preset,
        from: preset === "custom" ? from : undefined,
        to: preset === "custom" ? to : undefined,
        sortBy,
        page,
        pageSize,
      }),
  })

  const detailsQuery = useQuery({
    queryKey: ["admin-referrals", "ffo", "details", selectedClaim?.id],
    enabled: Boolean(selectedClaim?.id),
    queryFn: () => getAdminFirstOrderOffer(selectedClaim?.id ?? ""),
  })

  const data = offersQuery.data
  const summary = data?.summary
  const details = detailsQuery.data ?? selectedClaim
  const claims = data?.items ?? []
  const topDevices = data?.topDevices ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            First Order Offer
          </h2>
          <p className="text-sm text-muted-foreground">
            Track first-order discount claims, released claims, device reuse,
            and same-device multi-number risk.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void offersQuery.refetch()}
          disabled={offersQuery.isFetching}
        >
          {offersQuery.isFetching ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <RefreshCcw className="mr-2 size-4" />
          )}
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Total claims"
          value={`${summary?.totalClaims ?? 0}`}
          helper="In selected filters"
          icon={Users}
        />
        <StatCard
          label="Confirmed"
          value={`${summary?.confirmedClaims ?? 0}`}
          helper="Offer consumed"
          icon={Gift}
        />
        <StatCard
          label="Released"
          value={`${summary?.releasedClaims ?? 0}`}
          helper="Returned after cancel/reject"
          icon={TicketPercent}
        />
        <StatCard
          label="Suspicious"
          value={`${summary?.suspiciousClaims ?? 0}`}
          helper="Same-device signals"
          icon={ShieldAlert}
        />
        <StatCard
          label="Discount cost"
          value={formatCurrency(summary?.totalDiscountAmount ?? 0)}
          helper="Platform-funded"
          icon={TrendingUp}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>FFO Filters</CardTitle>
          <CardDescription>
            Search by customer, phone, order number, device ID, wallet, IP, or
            address fingerprint.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
          <div className="space-y-2 xl:col-span-2">
            <Label>Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, phone, order, device"
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={status}
              onValueChange={(value) =>
                setStatus(value as FirstOrderOfferStatusFilter)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["all", "confirmed", "released", "reserved"].map((item) => (
                  <SelectItem key={item} value={item}>
                    {firstOrderOfferStatusLabel(
                      item as FirstOrderOfferStatusFilter
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Risk</Label>
            <Select
              value={risk}
              onValueChange={(value) =>
                setRisk(value as FirstOrderOfferRiskFilter)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="suspicious">Suspicious</SelectItem>
                <SelectItem value="clean">Clean</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Payment</Label>
            <Select
              value={paymentMethod}
              onValueChange={(value) =>
                setPaymentMethod(value as FirstOrderOfferPaymentFilter)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="Cash">Cash</SelectItem>
                <SelectItem value="Bkash">bKash</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <AdminDateRangeFilter<ReferralPreset>
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
          <div className="space-y-2">
            <Label>Sort</Label>
            <Select
              value={sortBy}
              onValueChange={(value) => setSortBy(value as FirstOrderOfferSort)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="oldest">Oldest</SelectItem>
                <SelectItem value="amount">Highest amount</SelectItem>
                <SelectItem value="risk">Highest risk</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Rows</Label>
            <Select
              value={`${pageSize}`}
              onValueChange={(value) => setPageSize(Number(value))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 50, 100].map((item) => (
                  <SelectItem key={item} value={`${item}`}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle>FFO Claims</CardTitle>
            <CardDescription>
              {data?.total ?? 0} claims found. Danger badges mark same-device
              multi-number activity.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {offersQuery.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-28 text-center">
                        <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ) : claims.length ? (
                    claims.map((claim) => (
                      <TableRow
                        key={claim.id}
                        className="cursor-pointer"
                        onClick={() => setSelectedClaim(claim)}
                      >
                        <TableCell>
                          <div className="font-medium">
                            {claim.customer.fullName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {claim.customer.phone || "No phone"} ·{" "}
                            {compactId(claim.customer.id)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <Badge
                              variant="outline"
                              className={firstOrderOfferStatusBadgeClass(
                                claim.status
                              )}
                            >
                              {firstOrderOfferStatusLabel(claim.status)}
                            </Badge>
                            {claim.risk.suspicious ? (
                              <Badge variant="destructive">
                                <ShieldAlert className="size-3" />
                                Danger
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>{claim.order.orderNumber || "No order"}</div>
                          <div className="text-xs text-muted-foreground">
                            {claim.order.status || "N/A"} ·{" "}
                            {claim.order.paymentMethod || "N/A"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>{formatCurrency(claim.amount)}</div>
                          <div className="text-xs text-muted-foreground">
                            Order {formatCurrency(claim.order.total)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>{compactId(claim.fingerprints.deviceId)}</div>
                          <div className="text-xs text-muted-foreground">
                            {claim.risk.distinctPhoneCount} phone ·{" "}
                            {claim.risk.deviceClaimCount} claim
                          </div>
                        </TableCell>
                        <TableCell>{formatDate(claim.claimedAt)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation()
                              setSelectedClaim(claim)
                            }}
                          >
                            <Eye className="mr-2 size-4" />
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="h-28 text-center text-muted-foreground"
                      >
                        No first-order offer claims match these filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Page {data?.page ?? page} of {data?.pageCount ?? 1}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={page <= 1 || offersQuery.isFetching}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  disabled={
                    page >= (data?.pageCount ?? 1) || offersQuery.isFetching
                  }
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Risk Devices</CardTitle>
            <CardDescription>Same-device first-order activity.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {topDevices.length ? (
              topDevices.map((device) => (
                <div key={device.deviceId} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm font-medium">
                        {compactId(device.deviceId)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {device.distinctPhoneCount} phones · {device.claimCount} claims
                      </p>
                    </div>
                    <Badge variant="destructive">{device.riskScore}</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Confirmed</p>
                      <p className="font-semibold">
                        {device.confirmedClaimCount}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Released</p>
                      <p className="font-semibold">{device.releasedClaimCount}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Cost</p>
                      <p className="font-semibold">
                        {formatCurrency(device.totalAmount)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No suspicious device activity in this filter.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <FirstOrderOfferDetailsDrawer
        claim={details}
        loading={detailsQuery.isFetching && Boolean(selectedClaim)}
        open={Boolean(selectedClaim)}
        onOpenChange={(open) => {
          if (!open) setSelectedClaim(null)
        }}
      />
    </div>
  )
}

type FirstOrderDeviceLike =
  | AdminFirstOrderOfferDeviceDetails
  | AdminFirstOrderOfferDeviceRow

function hasFirstOrderDeviceDetails(
  device: FirstOrderDeviceLike | null
): device is AdminFirstOrderOfferDeviceDetails {
  return Boolean(device && "accounts" in device && "claims" in device)
}

function FirstOrderDeviceDetailsDrawer({
  device,
  loading,
  open,
  onOpenChange,
  onBlock,
}: {
  device: FirstOrderDeviceLike | null
  loading: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onBlock: (device: AdminFirstOrderOfferDeviceRow) => void
}) {
  const accounts = hasFirstOrderDeviceDetails(device) ? device.accounts : []
  const claims = hasFirstOrderDeviceDetails(device) ? device.claims : []

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-3xl! md:max-w-6xl!">
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle>FFO device details</SheetTitle>
          <SheetDescription>
            Connected accounts, phone numbers, claim history, and device block state.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1 p-6">
          {loading && !device ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : device ? (
            <div className="space-y-6">
              <div className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-2">
                    <p className="font-mono text-sm font-semibold">
                      {device.deviceId}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        variant="outline"
                        className={firstOrderDeviceStatusBadgeClass(device.status)}
                      >
                        {firstOrderDeviceStatusLabel(device.status)}
                      </Badge>
                      {device.danger ? (
                        <Badge variant="destructive">
                          <ShieldAlert className="size-3" />
                          Danger
                        </Badge>
                      ) : null}
                      {device.accountCount >= 2 ? (
                        <Badge variant="secondary">
                          {device.accountCount} accounts
                        </Badge>
                      ) : null}
                      {device.manuallyBlocked ? (
                        <Badge variant="outline">Manual block</Badge>
                      ) : null}
                    </div>
                  </div>
                  <Button
                    variant={device.manuallyBlocked ? "outline" : "destructive"}
                    disabled={device.manuallyBlocked}
                    onClick={() => onBlock(device)}
                  >
                    <Ban className="mr-2 size-4" />
                    {device.manuallyBlocked ? "Already blocked" : "Block device"}
                  </Button>
                </div>
                {device.reasons.length ? (
                  <div className="mt-4 space-y-2 rounded-md bg-muted p-3 text-sm text-muted-foreground">
                    {device.reasons.map((reason) => (
                      <p key={reason}>{reason}</p>
                    ))}
                  </div>
                ) : null}
              </div>

              <section className="space-y-3">
                <h3 className="font-semibold">Summary</h3>
                <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4">
                  <DetailItem label="Accounts" value={device.accountCount} />
                  <DetailItem label="Phones" value={device.phoneCount} />
                  <DetailItem label="FFO claims" value={device.claimCount} />
                  <DetailItem
                    label="Discount cost"
                    value={formatCurrency(device.totalAmount)}
                  />
                  <DetailItem
                    label="Confirmed / released"
                    value={`${device.confirmedClaimCount} / ${device.releasedClaimCount}`}
                  />
                  <DetailItem label="First seen" value={formatDate(device.firstSeen)} />
                  <DetailItem label="Last seen" value={formatDate(device.lastSeen)} />
                  <DetailItem
                    label="Manual block"
                    value={
                      device.manuallyBlocked
                        ? formatDate(device.block.manuallyBlockedAt)
                        : "No"
                    }
                  />
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="font-semibold">Connected phones</h3>
                <div className="flex flex-wrap gap-2 rounded-lg border p-4">
                  {device.phones.length ? (
                    device.phones.map((phone) => (
                      <Badge key={phone} variant="secondary">
                        {phone}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No phone records.</p>
                  )}
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="font-semibold">Connected accounts</h3>
                <div className="overflow-hidden rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead>FFO</TableHead>
                        <TableHead>Other signals</TableHead>
                        <TableHead>Joined</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {accounts.length ? (
                        accounts.map((account) => (
                          <TableRow key={account.id}>
                            <TableCell>
                              <div className="font-medium">{account.fullName}</div>
                              <div className="text-xs text-muted-foreground">
                                {account.phone || "No phone"} / {compactId(account.id)}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {account.ffoClaimed ? (
                                  <Badge variant="outline">
                                    Claimed {account.ffoClaimCount || 1}
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary">Not claimed</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {account.gotRefereeVoucher ? (
                                  <Badge variant="outline">Referral welcome</Badge>
                                ) : null}
                                {account.appliedReferral ? (
                                  <Badge variant="outline">Applied referral</Badge>
                                ) : null}
                                {account.referralDisabledByAdmin ? (
                                  <Badge variant="destructive">Referral off</Badge>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell>{formatDate(account.joinedAt)}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell
                            colSpan={4}
                            className="h-20 text-center text-muted-foreground"
                          >
                            No connected accounts found.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="font-semibold">FFO claim history</h3>
                <div className="overflow-hidden rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead>Order</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Claimed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {claims.length ? (
                        claims.map((claimRow) => (
                          <TableRow key={claimRow.id}>
                            <TableCell>
                              <div className="font-medium">
                                {claimRow.customer.fullName}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {claimRow.customer.phone || "No phone"}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>{claimRow.order.orderNumber || "No order"}</div>
                              <div className="text-xs text-muted-foreground">
                                {claimRow.order.status || "N/A"}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={firstOrderOfferStatusBadgeClass(
                                  claimRow.status
                                )}
                              >
                                {firstOrderOfferStatusLabel(claimRow.status)}
                              </Badge>
                            </TableCell>
                            <TableCell>{formatCurrency(claimRow.amount)}</TableCell>
                            <TableCell>{formatDate(claimRow.claimedAt)}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            className="h-20 text-center text-muted-foreground"
                          >
                            No FFO claims from this device.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="font-semibold">Block state</h3>
                <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                  <DetailItem
                    label="Auto locked"
                    value={device.autoBlocked ? "Yes" : "No"}
                  />
                  <DetailItem
                    label="Manual blocked"
                    value={device.manuallyBlocked ? "Yes" : "No"}
                  />
                  <DetailItem label="Reason" value={device.block.reason} />
                  <DetailItem label="Note" value={device.block.note} />
                </div>
              </section>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No device selected.</p>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

function BlockFirstOrderDeviceDialog({
  device,
  loading,
  onOpenChange,
  onSubmit,
}: {
  device: AdminFirstOrderOfferDeviceRow | null
  loading: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: { reason: string; note: string }) => void
}) {
  const [reason, setReason] = React.useState("Suspicious FFO device activity")
  const [note, setNote] = React.useState("")

  React.useEffect(() => {
    if (!device) return
    setReason("Suspicious FFO device activity")
    setNote("")
  }, [device?.deviceId])

  return (
    <Dialog open={Boolean(device)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Block FFO device</DialogTitle>
          <DialogDescription>
            This device will never receive future welcome offers, including FFO
            and referral welcome rewards.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border bg-muted/40 p-3">
            <p className="font-mono text-sm">{device?.deviceId ?? ""}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {device?.accountCount ?? 0} accounts / {device?.claimCount ?? 0} FFO claims
            </p>
          </div>
          <div className="space-y-2">
            <Label>Reason</Label>
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={160}
            />
          </div>
          <div className="space-y-2">
            <Label>Admin note</Label>
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              rows={4}
              placeholder="Optional context for future review"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={loading || !device}
            onClick={() =>
              onSubmit({
                reason: reason.trim() || "Suspicious FFO device activity",
                note: note.trim(),
              })
            }
          >
            {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Block device
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 text-sm">{value || "N/A"}</div>
    </div>
  )
}

function ReferralDetailsDrawer({
  referral,
  loading,
  open,
  onOpenChange,
}: {
  referral: AdminReferralRow | null
  loading: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-3xl! md:max-w-6xl!">
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle>Referral details</SheetTitle>
          <SheetDescription>
            Referrer, applied customer, order, reward, and fraud context.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1 p-6">
          {loading && !referral ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : referral ? (
            <div className="space-y-6">
              <div className="rounded-lg border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Current status</p>
                    <Badge variant="outline" className={statusBadgeClass(referral.status)}>
                      {statusLabel(referral.status)}
                    </Badge>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Risk score</p>
                    <p className="text-lg font-semibold">{referral.riskScore}</p>
                  </div>
                </div>
                {referral.skippedReason ? (
                  <p className="mt-3 rounded-md bg-muted p-3 text-sm text-muted-foreground">
                    {referral.skippedReason}
                  </p>
                ) : null}
              </div>

              <section className="space-y-3">
                <h3 className="font-semibold">People</h3>
                <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                  <DetailItem label="Referrer" value={referral.referrer.fullName} />
                  <DetailItem label="Referrer phone" value={referral.referrer.phone} />
                  <DetailItem label="Referral code" value={referral.referrer.referralCode} />
                  <DetailItem label="Referrer ID" value={compactId(referral.referrer.id)} />
                  <DetailItem label="Applied customer" value={referral.referredCustomer.fullName} />
                  <DetailItem label="Applied phone" value={referral.referredCustomer.phone} />
                  <DetailItem label="Applied date" value={formatDate(referral.referredAt)} />
                  <DetailItem label="Customer ID" value={compactId(referral.referredCustomer.id)} />
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="font-semibold">Reward and Order</h3>
                <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                  <DetailItem label="Order number" value={referral.order.orderNumber} />
                  <DetailItem label="Order status" value={referral.order.status} />
                  <DetailItem label="Payment" value={`${referral.order.paymentMethod || "N/A"} / ${referral.order.paymentStatus || "N/A"}`} />
                  <DetailItem label="Order total" value={formatCurrency(referral.order.total)} />
                  <DetailItem label="Delivered at" value={formatDate(referral.order.deliveredAt)} />
                  <DetailItem label="Voucher code" value={referral.reward.voucherCode} />
                  <DetailItem label="Reward amount" value={formatCurrency(referral.reward.amount)} />
                  <DetailItem label="Rewarded at" value={formatDate(referral.reward.rewardedAt)} />
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="font-semibold">Fraud Context</h3>
                <div className="grid gap-4 rounded-lg border p-4">
                  <DetailItem label="Signup device/install ID" value={referral.fraud.signupDeviceId} />
                  <DetailItem label="Signup IP" value={referral.fraud.signupIpAddress} />
                  <DetailItem label="Signup user agent" value={referral.fraud.signupUserAgent} />
                  <DetailItem
                    label="Delivery address"
                    value={
                      referral.order.deliveryAddress.addressLine ||
                      referral.order.deliveryAddress.label
                    }
                  />
                </div>
              </section>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No referral selected.</p>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

function FirstOrderOfferDetailsDrawer({
  claim,
  loading,
  open,
  onOpenChange,
}: {
  claim: AdminFirstOrderOfferClaimRow | null
  loading: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-3xl! md:max-w-6xl!">
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle>FFO claim details</SheetTitle>
          <SheetDescription>
            First-order offer claim, order context, device fingerprints, and
            same-device account signals.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1 p-6">
          {loading && !claim ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : claim ? (
            <div className="space-y-6">
              <div className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Claim status</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        variant="outline"
                        className={firstOrderOfferStatusBadgeClass(claim.status)}
                      >
                        {firstOrderOfferStatusLabel(claim.status)}
                      </Badge>
                      {claim.risk.suspicious ? (
                        <Badge variant="destructive">
                          <ShieldAlert className="size-3" />
                          Danger
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Clean</Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Risk score</p>
                    <p className="text-lg font-semibold">{claim.risk.score}</p>
                  </div>
                </div>
                {claim.risk.reasons.length ? (
                  <div className="mt-3 space-y-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    {claim.risk.reasons.map((reason) => (
                      <p key={reason}>{reason}</p>
                    ))}
                  </div>
                ) : null}
                {claim.releasedReason ? (
                  <p className="mt-3 rounded-md bg-muted p-3 text-sm text-muted-foreground">
                    {claim.releasedReason}
                  </p>
                ) : null}
              </div>

              <section className="space-y-3">
                <h3 className="font-semibold">Customer</h3>
                <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                  <DetailItem label="Name" value={claim.customer.fullName} />
                  <DetailItem label="Phone" value={claim.customer.phone} />
                  <DetailItem label="Status" value={claim.customer.status} />
                  <DetailItem label="Customer ID" value={compactId(claim.customer.id)} />
                  <DetailItem label="Joined at" value={formatDate(claim.customer.createdAt)} />
                  <DetailItem
                    label="Redeemed at"
                    value={formatDate(claim.customer.firstOrderDiscountRedeemedAt)}
                  />
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="font-semibold">Order</h3>
                <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                  <DetailItem label="Order number" value={claim.order.orderNumber} />
                  <DetailItem label="Order status" value={claim.order.status} />
                  <DetailItem
                    label="Payment"
                    value={`${claim.order.paymentMethod || "N/A"} / ${
                      claim.order.paymentStatus || "N/A"
                    }`}
                  />
                  <DetailItem label="Order total" value={formatCurrency(claim.order.total)} />
                  <DetailItem label="Claim amount" value={formatCurrency(claim.amount)} />
                  <DetailItem label="Claimed at" value={formatDate(claim.claimedAt)} />
                  <DetailItem label="Delivered at" value={formatDate(claim.order.deliveredAt)} />
                  <DetailItem
                    label="Delivery address"
                    value={
                      claim.order.deliveryAddress.addressLine ||
                      claim.order.deliveryAddress.label
                    }
                  />
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="font-semibold">Fingerprints</h3>
                <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                  <DetailItem label="Device/install ID" value={claim.fingerprints.deviceId} />
                  <DetailItem label="Claim phone" value={claim.fingerprints.phone} />
                  <DetailItem label="Wallet number" value={claim.fingerprints.walletNumber} />
                  <DetailItem label="IP address" value={claim.fingerprints.ipAddress} />
                  <DetailItem
                    label="Address fingerprint"
                    value={claim.fingerprints.addressFingerprint}
                  />
                  <DetailItem
                    label="Device totals"
                    value={`${claim.risk.distinctPhoneCount} phones, ${claim.risk.deviceClaimCount} claims`}
                  />
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold">Same-device accounts</h3>
                  <Badge variant={claim.risk.suspicious ? "destructive" : "secondary"}>
                    {claim.risk.deviceAccountCount} accounts
                  </Badge>
                </div>
                <div className="overflow-hidden rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead>Signals</TableHead>
                        <TableHead>Joined</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {claim.risk.accounts.length ? (
                        claim.risk.accounts.map((account) => (
                          <TableRow key={account.id}>
                            <TableCell>
                              <div className="font-medium">
                                {account.fullName}
                                {account.isCurrent ? " (current)" : ""}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {account.phone || "No phone"} · {compactId(account.id)}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {account.redeemedFirstOrder ? (
                                  <Badge variant="outline">FFO</Badge>
                                ) : null}
                                {account.gotRefereeVoucher ? (
                                  <Badge variant="outline">Referral welcome</Badge>
                                ) : null}
                                {account.appliedReferral ? (
                                  <Badge variant="outline">Applied referral</Badge>
                                ) : null}
                                {account.referralDisabledByAdmin ? (
                                  <Badge variant="destructive">Referral off</Badge>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell>{formatDate(account.joinedAt)}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell
                            colSpan={3}
                            className="h-20 text-center text-muted-foreground"
                          >
                            No same-device account records found.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </section>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No FFO claim selected.</p>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
