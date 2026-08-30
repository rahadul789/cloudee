import { format } from "date-fns"
import {
  CalendarRange,
  CircleDollarSign,
  Coins,
  Info,
  Percent,
  TicketPercent,
  Users,
  X,
} from "lucide-react"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"

import {
  type Voucher,
  formatVoucherDiscount,
  getVoucherFundingLabel,
  getVoucherLifecycleStatus,
  getVoucherModeLabel,
  getVoucherTypeLabel,
} from "@/components/promotions/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

function getLifecycleBadgeClass(
  status: ReturnType<typeof getVoucherLifecycleStatus>
) {
  if (status === "Active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700"
  }

  if (status === "Scheduled") {
    return "border-sky-200 bg-sky-50 text-sky-700"
  }

  if (status === "Expired") {
    return "border-rose-200 bg-rose-50 text-rose-700"
  }

  return "border-slate-200 bg-slate-100 text-slate-700"
}

function formatMoney(value: number) {
  return `${Math.round(value).toLocaleString()}tk`
}

function formatDateTime(value: string) {
  return format(new Date(value), "dd MMM yyyy, hh:mm a")
}

export function PromotionDetailsDrawer({
  open,
  onOpenChange,
  voucher,
  categoryNames,
  itemNames,
  onEdit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  voucher: Voucher | null
  categoryNames: string[]
  itemNames: string[]
  onEdit: (voucher: Voucher) => void
}) {
  if (!voucher) {
    return null
  }

  const lifecycleStatus = getVoucherLifecycleStatus(voucher)
  const chartConfig = {
    uses: {
      label: "Uses",
      color: "hsl(var(--chart-1))",
    },
    discount: {
      label: "Owner Cost",
      color: "hsl(var(--chart-2))",
    },
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full max-w-none! p-0 sm:max-w-3xl! md:max-w-4xl!"
      >
        <SheetHeader className="sticky top-0 z-10 border-b bg-popover px-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle>{voucher.name}</SheetTitle>
                <Badge
                  variant="outline"
                  className={getLifecycleBadgeClass(lifecycleStatus)}
                >
                  {lifecycleStatus === "PendingApproval"
                    ? "Pending approval"
                    : lifecycleStatus}
                </Badge>
                <Badge variant="secondary">
                  {getVoucherModeLabel(voucher.mode)}
                </Badge>
              </div>
              <SheetDescription>
                {getVoucherTypeLabel(voucher.type)} •{" "}
                {formatVoucherDiscount(voucher)}
              </SheetDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => onEdit(voucher)}>
                Edit
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
              >
                <X className="size-4" />
                <span className="sr-only">Close</span>
              </Button>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-88px)]">
          <div className="space-y-6 px-6 py-6">
            {voucher.status === "Rejected" ? (
              <div className="rounded-2xl border-2 border-rose-200 bg-rose-50 p-4">
                <p className="text-sm font-semibold text-rose-800">
                  Not approved
                </p>
                <p className="mt-1 text-sm text-rose-700">
                  {voucher.reviewNote?.trim() || "No reason was given."}
                </p>
              </div>
            ) : voucher.status === "PendingApproval" ? (
              <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
                <p className="text-sm font-medium text-amber-800">
                  Waiting for admin approval — this voucher goes live once
                  approved.
                </p>
              </div>
            ) : null}
            <section className="grid gap-4 md:grid-cols-2">
              <Card className="rounded-2xl shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">Voucher Setup</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Code</span>
                    <span className="font-medium">
                      {voucher.code || "Auto applied"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Type</span>
                    <span className="font-medium">
                      {getVoucherTypeLabel(voucher.type)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Minimum order</span>
                    <span className="font-medium">
                      {formatMoney(voucher.minimumOrderAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Max total uses</span>
                    <span className="font-medium">
                      {voucher.maxTotalUses ?? "Unlimited"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Per user</span>
                    <span className="font-medium">
                      {voucher.allowRepeatUsage
                        ? `${voucher.maxUsesPerUser} times`
                        : "Once only"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Created by</span>
                    <span className="font-medium capitalize">
                      {voucher.createdByType}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Funding</span>
                    <span className="font-medium">
                      {getVoucherFundingLabel(voucher.fundedBy)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">Availability</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-muted-foreground">Date range</span>
                    <span className="text-right font-medium">
                      {formatDateTime(voucher.startsAt)}
                      <br />
                      {formatDateTime(voucher.endsAt)}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-muted-foreground">Applicability</span>
                    <span className="text-right font-medium">
                      {voucher.applicability === "all"
                        ? "All menu items"
                        : voucher.applicability === "categories"
                          ? `${categoryNames.length} categories`
                          : `${itemNames.length} menu items`}
                    </span>
                  </div>
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

            {voucher.fundedBy === "owner" || voucher.fundedBy === "shared" ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                <div className="flex items-start gap-3">
                  <Info className="mt-0.5 size-4 shrink-0" />
                  <div>
                    <p className="font-medium">This offer affects restaurant payout</p>
                    <p className="mt-1 text-amber-900/80">
                      The owner-funded discount amount is deducted from owner earning before payout.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card className="rounded-2xl border-emerald-200/70 bg-emerald-50/60 shadow-none">
                <CardContent className="flex items-start justify-between p-5">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Uses</p>
                    <p className="mt-3 text-3xl font-semibold">
                      {voucher.analytics.totalUses}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
                    <TicketPercent className="size-5" />
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-2xl border-sky-200/70 bg-sky-50/60 shadow-none">
                <CardContent className="flex items-start justify-between p-5">
                  <div>
                    <p className="text-sm text-muted-foreground">Unique Users</p>
                    <p className="mt-3 text-3xl font-semibold">
                      {voucher.analytics.uniqueUsers}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-sky-100 p-3 text-sky-700">
                    <Users className="size-5" />
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-2xl border-violet-200/70 bg-violet-50/60 shadow-none">
                <CardContent className="flex items-start justify-between p-5">
                  <div>
                    <p className="text-sm text-muted-foreground">Owner Cost</p>
                    <p className="mt-3 text-3xl font-semibold">
                      {formatMoney(voucher.analytics.totalDiscountGiven)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-violet-100 p-3 text-violet-700">
                    <Percent className="size-5" />
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-2xl border-amber-200/70 bg-amber-50/60 shadow-none">
                <CardContent className="flex items-start justify-between p-5">
                  <div>
                    <p className="text-sm text-muted-foreground">Sales from Voucher</p>
                    <p className="mt-3 text-3xl font-semibold">
                      {formatMoney(voucher.analytics.revenueGenerated)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
                    <CircleDollarSign className="size-5" />
                  </div>
                </CardContent>
              </Card>
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card className="rounded-2xl shadow-none">
                <CardContent className="flex items-start justify-between p-5">
                  <div>
                    <p className="text-sm text-muted-foreground">Repeat Usage</p>
                    <p className="mt-3 text-3xl font-semibold">
                      {voucher.analytics.repeatUsage}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-muted p-3 text-foreground">
                    <Users className="size-5" />
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-2xl shadow-none">
                <CardContent className="flex items-start justify-between p-5">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Orders Using Voucher
                    </p>
                    <p className="mt-3 text-3xl font-semibold">
                      {voucher.analytics.totalOrdersUsingVoucher}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-muted p-3 text-foreground">
                    <Coins className="size-5" />
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-2xl shadow-none">
                <CardContent className="flex items-start justify-between p-5">
                  <div>
                    <p className="text-sm text-muted-foreground">Remaining Usage</p>
                    <p className="mt-3 text-3xl font-semibold">
                      {voucher.analytics.remainingUsage ?? "Unlimited"}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-muted p-3 text-foreground">
                    <CalendarRange className="size-5" />
                  </div>
                </CardContent>
              </Card>
            </section>

            <Card className="rounded-2xl shadow-none">
              <CardHeader>
                <CardTitle className="text-base">
                  Voucher Performance Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={chartConfig}
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
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
