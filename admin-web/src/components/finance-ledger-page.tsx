import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import {
  BookOpenText,
  Download,
  Loader2,
  Printer,
  RefreshCcw,
  Search,
} from "lucide-react"
import { toast } from "sonner"

import { useDebouncedValue } from "@/hooks/use-debounced-value"
import {
  getAdminServiceAreas,
  listAdminFinanceLedger,
  listAdminRestaurants,
  type AdminFinanceLedgerEntry,
} from "@/lib/admin-api"
import { downloadCsv, escapeHtml, printReport } from "@/lib/export-utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type EntryTypeFilter = "all" | "earning" | "refund" | "payout" | "adjustment"
type SettlementFilter = "all" | "pending" | "available" | "paid_out"
type LedgerSort = "newest" | "oldest" | "highest_net" | "lowest_net"

function formatCurrency(value: number) {
  return `Tk ${Math.round(Number.isFinite(value) ? value : 0).toLocaleString()}`
}

function formatDate(value?: string | null) {
  if (!value) return "N/A"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "N/A"
  return date.toLocaleString()
}

function settlementBadgeClass(value: string) {
  if (value === "available") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (value === "paid_out") return "border-sky-200 bg-sky-50 text-sky-700"
  return "border-amber-200 bg-amber-50 text-amber-700"
}

function entryBadgeClass(value: string) {
  if (value === "earning") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (value === "refund") return "border-rose-200 bg-rose-50 text-rose-700"
  if (value === "payout") return "border-sky-200 bg-sky-50 text-sky-700"
  return "border-slate-200 bg-slate-50 text-slate-700"
}

function ledgerEntryBadgeClass(entry: AdminFinanceLedgerEntry) {
  if (entry.isCarryForward) return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700"
  return entryBadgeClass(entry.entryType)
}

function ledgerEntryLabel(entry: AdminFinanceLedgerEntry) {
  if (entry.isCarryForward) return "Carry-forward"
  return entry.entryType
}

function sourceBadgeClass(entry: AdminFinanceLedgerEntry) {
  if (entry.isCarryForward) return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700"
  if (entry.sourceEntityType === "order") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (entry.sourceEntityType === "payout_batch") return "border-sky-200 bg-sky-50 text-sky-700"
  return "border-slate-200 bg-slate-50 text-slate-700"
}

function orderBadgeClass(value: string) {
  if (value === "Delivered") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (value === "Cancelled" || value === "Rejected") return "border-rose-200 bg-rose-50 text-rose-700"
  if (value) return "border-sky-200 bg-sky-50 text-sky-700"
  return "border-slate-200 bg-slate-50 text-slate-700"
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

function exportRows(rows: AdminFinanceLedgerEntry[]) {
  downloadCsv("finance-ledger.csv", [
    [
      "created_at",
      "restaurant",
      "order",
      "type",
      "status",
      "source_label",
      "gross",
      "commission",
      "owner_discount",
      "platform_discount",
      "delivery_cost",
      "net",
    ],
    ...rows.map((row) => [
      row.createdAt,
      row.restaurantName,
      row.orderNumber || row.sourceEntityId,
      row.entryType,
      row.settlementStatus,
      row.sourceLabel,
      row.grossAmount,
      row.commission,
      row.discountCost,
      row.platformDiscountCost,
      row.deliveryCost,
      row.netAmount,
    ]),
  ])
}

export function FinanceLedgerPage() {
  const [search, setSearch] = React.useState("")
  const [entryType, setEntryType] = React.useState<EntryTypeFilter>("all")
  const [settlementStatus, setSettlementStatus] = React.useState<SettlementFilter>("all")
  const [restaurantId, setRestaurantId] = React.useState("all")
  const [zoneId, setZoneId] = React.useState("all")
  const [sortBy, setSortBy] = React.useState<LedgerSort>("newest")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(20)
  const debouncedSearch = useDebouncedValue(search, 350)

  React.useEffect(() => {
    setPage(1)
  }, [debouncedSearch, entryType, settlementStatus, restaurantId, zoneId, sortBy, pageSize])

  const restaurantsQuery = useQuery({
    queryKey: ["admin-restaurants", "finance-ledger-filter"],
    queryFn: () =>
      listAdminRestaurants({
        pageSize: 100,
        sortBy: "newestUpdated",
      }),
  })

  const serviceAreasQuery = useQuery({
    queryKey: ["admin-service-areas", "finance-ledger-filter"],
    queryFn: getAdminServiceAreas,
  })

  const ledgerQuery = useQuery({
    queryKey: ["admin-finance-ledger", debouncedSearch, entryType, settlementStatus, restaurantId, zoneId, sortBy, page, pageSize],
    queryFn: () =>
      listAdminFinanceLedger({
        search: debouncedSearch,
        entryType,
        settlementStatus,
        restaurantId: restaurantId === "all" ? undefined : restaurantId,
        zoneId: zoneId === "all" ? undefined : zoneId,
        sortBy,
        page,
        pageSize,
      }),
  })

  const data = ledgerQuery.data
  const rows = data?.items ?? []

  const exportPdf = () => {
    const printed = printReport(
      "Finance Ledger",
      `
        <div class="grid">
          <div class="metric"><span class="muted">Net</span><strong>${escapeHtml(formatCurrency(data?.summary.netAmount ?? 0))}</strong></div>
          <div class="metric"><span class="muted">Carry-forward</span><strong>${escapeHtml(formatCurrency(data?.summary.carryForwardBalance ?? 0))}</strong></div>
          <div class="metric"><span class="muted">Commission</span><strong>${escapeHtml(formatCurrency(data?.summary.commission ?? 0))}</strong></div>
          <div class="metric"><span class="muted">Owner discount</span><strong>${escapeHtml(formatCurrency(data?.summary.discountCost ?? 0))}</strong></div>
          <div class="metric"><span class="muted">Entries</span><strong>${escapeHtml(data?.total ?? 0)}</strong></div>
        </div>
        <table>
          <thead><tr><th>Date</th><th>Restaurant</th><th>Order</th><th>Type</th><th>Status</th><th>Net</th></tr></thead>
          <tbody>
            ${rows
              .map(
                (row) =>
                  `<tr><td>${escapeHtml(formatDate(row.createdAt))}</td><td>${escapeHtml(row.restaurantName)}</td><td>${escapeHtml(row.orderNumber || row.sourceEntityId)}</td><td>${escapeHtml(row.entryType)}</td><td>${escapeHtml(row.settlementStatus)}</td><td>${escapeHtml(formatCurrency(row.netAmount))}</td></tr>`
              )
              .join("")}
          </tbody>
        </table>
      `
    )
    if (!printed) toast.error("Popup blocked. Allow popups to print PDF.")
  }

  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <span className="flex size-9 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
              <BookOpenText className="size-5" />
            </span>
            Ledger
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Auditable restaurant earnings, discounts, commission, refunds, payouts, and settlement status.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => exportRows(rows)} disabled={!rows.length}>
            <Download className="size-4" />
            CSV
          </Button>
          <Button type="button" variant="outline" onClick={exportPdf} disabled={!rows.length}>
            <Printer className="size-4" />
            PDF
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void ledgerQuery.refetch()}
            disabled={ledgerQuery.isFetching}
          >
            {ledgerQuery.isFetching ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Filtered net" value={formatCurrency(data?.summary.netAmount ?? 0)} helper="Matches filters; payout debits included" />
        <StatCard label="Gross sales" value={formatCurrency(data?.summary.grossAmount ?? 0)} helper="Restaurant item subtotal" />
        <StatCard label="Commission" value={formatCurrency(data?.summary.commission ?? 0)} helper="Platform commission" />
        <StatCard label="Owner discount" value={formatCurrency(data?.summary.discountCost ?? 0)} helper="Owner-funded voucher cost" />
        <StatCard label="Carry-forward" value={formatCurrency(data?.summary.carryForwardBalance ?? 0)} helper="Unpaid remainder for next payout" />
        <StatCard label="Entries" value={(data?.total ?? 0).toLocaleString()} helper="Matched ledger rows" />
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-2 md:grid-cols-[minmax(220px,1fr)_190px_170px_150px_160px_160px_120px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search restaurant, order, source"
              className="pl-9"
            />
          </div>
          <Select value={restaurantId} onValueChange={setRestaurantId}>
            <SelectTrigger>
              <SelectValue placeholder="Restaurant" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All restaurants</SelectItem>
              {(restaurantsQuery.data?.items ?? []).map((restaurant) => (
                <SelectItem key={restaurant.id} value={restaurant.id}>
                  {restaurant.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={zoneId} onValueChange={setZoneId}>
            <SelectTrigger>
              <SelectValue placeholder="Zone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All zones</SelectItem>
              {(serviceAreasQuery.data?.zones ?? []).map((zone) => (
                <SelectItem key={zone.id} value={zone.id}>
                  {zone.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={entryType} onValueChange={(value) => setEntryType(value as EntryTypeFilter)}>
            <SelectTrigger>
              <SelectValue placeholder="Entry type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="earning">Earning</SelectItem>
              <SelectItem value="refund">Refund</SelectItem>
              <SelectItem value="payout">Payout</SelectItem>
              <SelectItem value="adjustment">Adjustment</SelectItem>
            </SelectContent>
          </Select>
          <Select value={settlementStatus} onValueChange={(value) => setSettlementStatus(value as SettlementFilter)}>
            <SelectTrigger>
              <SelectValue placeholder="Settlement" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="available">Available</SelectItem>
              <SelectItem value="paid_out">Paid out</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as LedgerSort)}>
            <SelectTrigger>
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
              <SelectItem value="highest_net">Highest net</SelectItem>
              <SelectItem value="lowest_net">Lowest net</SelectItem>
            </SelectContent>
          </Select>
          <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
            <SelectTrigger>
              <SelectValue placeholder="Rows" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10 rows</SelectItem>
              <SelectItem value="20">20 rows</SelectItem>
              <SelectItem value="50">50 rows</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Ledger entries</CardTitle>
        </CardHeader>
        <CardContent>
          {ledgerQuery.isLoading ? (
            <div className="grid min-h-[320px] place-items-center text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Loading ledger...
              </span>
            </div>
          ) : rows.length ? (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Restaurant</TableHead>
                      <TableHead>Order / source</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">Commission</TableHead>
                      <TableHead className="text-right">Discount</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{formatDate(row.createdAt)}</TableCell>
                        <TableCell>
                          <div className="font-medium">{row.restaurantName || "Unknown"}</div>
                          <div className="text-xs text-muted-foreground">{row.restaurantCity}</div>
                          {row.serviceArea?.zoneName ? (
                            <Badge variant="outline" className="mt-1 border-violet-200 bg-violet-50 text-violet-700">
                              {row.serviceArea.zoneName}
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <div>{row.orderNumber || row.sourceEntityId || "N/A"}</div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {row.orderStatus ? (
                              <Badge variant="outline" className={orderBadgeClass(row.orderStatus)}>
                                {row.orderStatus}
                              </Badge>
                            ) : null}
                            <Badge variant="outline" className={sourceBadgeClass(row)}>
                              {row.paymentMethod || row.sourceLabel || row.sourceEntityType}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={ledgerEntryBadgeClass(row)}>
                            {ledgerEntryLabel(row)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={settlementBadgeClass(row.settlementStatus)}>
                            {row.settlementStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(row.grossAmount)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.commission)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.discountCost)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(row.netAmount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">
                  Page {data?.page ?? 1} of {data?.pageCount ?? 1}
                </span>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page >= (data?.pageCount ?? 1)}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <Empty className="min-h-[320px]">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <BookOpenText className="size-4" />
                </EmptyMedia>
                <EmptyTitle>No ledger entries found</EmptyTitle>
                <EmptyDescription>Try changing filters or reconcile a restaurant payout ledger.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </>
  )
}
