import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { BarChart3, Loader2, RefreshCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
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
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getAdminExternalDeliveryReports } from "@/lib/admin-api"

function formatTk(value?: number | null) {
  return `Tk ${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`
}

function StatTile({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  )
}

export function ExternalDeliveryReportsPage() {
  const [fromInput, setFromInput] = React.useState("")
  const [toInput, setToInput] = React.useState("")
  const [range, setRange] = React.useState<{ from?: string; to?: string }>({})

  const reportQuery = useQuery({
    queryKey: ["admin-external-delivery-reports", range.from, range.to],
    queryFn: () => getAdminExternalDeliveryReports(range),
    staleTime: 15_000,
  })

  const data = reportQuery.data
  const totals = data?.totals
  const rows = data?.restaurants ?? []

  function applyRange() {
    setRange({
      from: fromInput ? new Date(fromInput).toISOString() : undefined,
      // Include the whole "to" day.
      to: toInput ? new Date(`${toInput}T23:59:59.999`).toISOString() : undefined,
    })
  }

  function clearRange() {
    setFromInput("")
    setToInput("")
    setRange({})
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <BarChart3 className="size-5" />
            External Delivery — Reports
          </h1>
          <p className="text-sm text-muted-foreground">
            Off-platform delivery performance per restaurant — kept separate from platform
            finance.
          </p>
        </div>
        <Button variant="outline" onClick={() => void reportQuery.refetch()}>
          <RefreshCcw className="size-4" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="ext-from">From</Label>
            <Input
              id="ext-from"
              type="date"
              value={fromInput}
              onChange={(event) => setFromInput(event.target.value)}
              className="w-[170px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ext-to">To</Label>
            <Input
              id="ext-to"
              type="date"
              value={toInput}
              onChange={(event) => setToInput(event.target.value)}
              className="w-[170px]"
            />
          </div>
          <Button onClick={applyRange}>Apply</Button>
          {range.from || range.to ? (
            <Button variant="ghost" onClick={clearRange}>
              Clear
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Delivered orders"
          value={`${totals?.delivered ?? 0}`}
          helper={`of ${totals?.orders ?? 0} requested`}
        />
        <StatTile
          label="Foodbela delivery revenue"
          value={formatTk(totals?.deliveryFee)}
          helper="Total fees earned"
        />
        <StatTile
          label="Owner share (net)"
          value={formatTk(totals?.netToOwner)}
          helper="Owed + paid to owners"
        />
        <StatTile
          label="Settled to owners"
          value={formatTk(totals?.settledToOwner)}
          helper="Paid out in range"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per restaurant</CardTitle>
          <CardDescription>Sorted by delivery revenue.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Restaurant</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Delivered</TableHead>
                  <TableHead className="text-right">Cancelled</TableHead>
                  <TableHead className="text-right">Collected</TableHead>
                  <TableHead className="text-right">Fee (revenue)</TableHead>
                  <TableHead className="text-right">Owner net</TableHead>
                  <TableHead className="text-right">Settled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reportQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center">
                      <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      No external delivery orders in this range.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.restaurantId}>
                      <TableCell className="max-w-[200px] truncate font-medium">
                        {row.restaurantName || row.restaurantId}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.orders}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.delivered}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {row.cancelled}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatTk(row.collectAmount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-600">
                        {formatTk(row.deliveryFee)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatTk(row.netToOwner)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatTk(row.settledToOwner)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              {rows.length > 0 && totals ? (
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-semibold">Total</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {totals.orders}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {totals.delivered}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {totals.cancelled}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatTk(totals.collectAmount)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-emerald-600">
                      {formatTk(totals.deliveryFee)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatTk(totals.netToOwner)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatTk(totals.settledToOwner)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              ) : null}
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
