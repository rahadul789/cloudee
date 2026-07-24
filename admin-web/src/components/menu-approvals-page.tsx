import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CheckCircle2,
  Eye,
  Loader2,
  RefreshCcw,
  Search,
  ShieldAlert,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

import { useDebouncedValue } from "@/hooks/use-debounced-value"
import {
  approveAdminMenuApproval,
  getAdminMenuApproval,
  listAdminMenuApprovalHistory,
  listAdminMenuApprovals,
  rejectAdminMenuApproval,
  type AdminMenuApprovalHistoryResponse,
  type AdminMenuApprovalHistorySummary,
  type AdminMenuApprovalRequest,
  type AdminMenuApprovalStatus,
  type AdminMenuApprovalType,
} from "@/lib/admin-api"
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

type StatusFilter = AdminMenuApprovalStatus | "all"
type TypeFilter = AdminMenuApprovalType | "all"

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return "N/A"
  return `Tk ${Math.round(Number(value) || 0).toLocaleString()}`
}

function formatDate(value?: string | null) {
  if (!value) return "N/A"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "N/A"
  return date.toLocaleString()
}

function statusLabel(status: StatusFilter) {
  return status
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ")
}

function typeLabel(type: TypeFilter) {
  if (type === "new_item") return "New item"
  if (type === "price_update") return "Price update"
  return "All types"
}

function statusBadgeClass(status: AdminMenuApprovalStatus) {
  if (status === "pending") return "border-amber-200 bg-amber-50 text-amber-700"
  if (status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (status === "rejected") return "border-red-200 bg-red-50 text-red-700"
  return ""
}

function snapshotPriceLabel(request: AdminMenuApprovalRequest) {
  const proposed = request.proposedSnapshot
  if (proposed.kind === "variant") {
    return `${request.priceDiffCount} price change${request.priceDiffCount === 1 ? "" : "s"}`
  }
  return formatCurrency(proposed.basePrice)
}

function arrayLength(value: unknown) {
  return Array.isArray(value) ? value.length : 0
}

function formatPercent(value: number | null | undefined) {
  return `${Math.round(Number(value) || 0)}%`
}

function firstHistoryRestaurant(summary?: AdminMenuApprovalHistorySummary) {
  return summary?.mostRequestedRestaurants?.[0] ?? null
}

function firstHistoryItem(summary?: AdminMenuApprovalHistorySummary) {
  return summary?.mostRequestedItems?.[0] ?? null
}

function hasHistorySummary(
  data: unknown
): data is AdminMenuApprovalHistoryResponse {
  return Boolean(
    data &&
      typeof data === "object" &&
      "historySummary" in data &&
      data.historySummary
  )
}

function ApprovalActionDialog({
  request,
  mode,
  loading,
  onClose,
  onApprove,
  onReject,
}: {
  request: AdminMenuApprovalRequest | null
  mode: "approve" | "reject" | null
  loading: boolean
  onClose: () => void
  onApprove: (note: string) => void
  onReject: (values: { ownerReason: string; internalNote: string }) => void
}) {
  const [note, setNote] = React.useState("")
  const [ownerReason, setOwnerReason] = React.useState("")
  const [internalNote, setInternalNote] = React.useState("")

  React.useEffect(() => {
    setNote("")
    setOwnerReason("")
    setInternalNote("")
  }, [mode, request?.id])

  const isApprove = mode === "approve"
  return (
    <Dialog open={Boolean(request && mode)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isApprove ? "Approve menu change?" : "Reject menu change?"}
          </DialogTitle>
          <DialogDescription>
            {request?.proposedName || request?.currentName || "Menu item"} from{" "}
            {request?.restaurantName || "restaurant"}
          </DialogDescription>
        </DialogHeader>

        {isApprove ? (
          <div className="space-y-2">
            <Label htmlFor="approval-note">Internal note</Label>
            <Textarea
              id="approval-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional admin note"
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="owner-reason">Reason for owner</Label>
              <Textarea
                id="owner-reason"
                value={ownerReason}
                onChange={(event) => setOwnerReason(event.target.value)}
                placeholder="Explain what the owner needs to fix"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="internal-note">Internal note</Label>
              <Textarea
                id="internal-note"
                value={internalNote}
                onChange={(event) => setInternalNote(event.target.value)}
                placeholder="Optional admin-only note"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={loading} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={isApprove ? "default" : "destructive"}
            disabled={loading || (!isApprove && !ownerReason.trim())}
            onClick={() => {
              if (isApprove) {
                onApprove(note)
                return
              }
              onReject({ ownerReason, internalNote })
            }}
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            {isApprove ? "Approve" : "Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ApprovalDetailsDrawer({
  request,
  loading,
  open,
  onOpenChange,
  onApprove,
  onReject,
}: {
  request: AdminMenuApprovalRequest | null
  loading: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onApprove: (request: AdminMenuApprovalRequest) => void
  onReject: (request: AdminMenuApprovalRequest) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-3xl! md:max-w-5xl!">
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle>Menu approval details</SheetTitle>
          <SheetDescription>
            Review the proposed item and price changes before publishing.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1 p-6">
          {loading && !request ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : request ? (
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Restaurant</div>
                  <div className="mt-1 truncate font-medium">{request.restaurantName}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Owner</div>
                  <div className="mt-1 truncate font-medium">
                    {request.ownerName || request.ownerPhone || "N/A"}
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Type</div>
                  <div className="mt-1 font-medium">{typeLabel(request.type)}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Status</div>
                  <Badge variant="outline" className={statusBadgeClass(request.status)}>
                    {statusLabel(request.status)}
                  </Badge>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Current live menu</CardTitle>
                    <CardDescription>What customers see now.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Name</span>
                      <span className="text-right font-medium">
                        {request.currentSnapshot.name || "Not live yet"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Price</span>
                      <span className="text-right font-medium">
                        {formatCurrency(request.currentSnapshot.basePrice)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Variants</span>
                      <span>{arrayLength(request.currentSnapshot.variants)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Add-on groups</span>
                      <span>{arrayLength(request.currentSnapshot.addOnGroups)}</span>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Proposed change</CardTitle>
                    <CardDescription>Will publish after approval.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Name</span>
                      <span className="text-right font-medium">
                        {request.proposedSnapshot.name || "N/A"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Price</span>
                      <span className="text-right font-medium">
                        {formatCurrency(request.proposedSnapshot.basePrice)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Variants</span>
                      <span>{arrayLength(request.proposedSnapshot.variants)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Add-on groups</span>
                      <span>{arrayLength(request.proposedSnapshot.addOnGroups)}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Price changes</CardTitle>
                  <CardDescription>
                    Multiple variant and add-on price edits stay grouped in this request.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Field</TableHead>
                        <TableHead>Current</TableHead>
                        <TableHead>Proposed</TableHead>
                        <TableHead className="text-right">Change</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {request.priceDiffs.length ? (
                        request.priceDiffs.map((diff) => (
                          <TableRow key={diff.path}>
                            <TableCell className="font-medium">{diff.label}</TableCell>
                            <TableCell>{formatCurrency(diff.oldPrice)}</TableCell>
                            <TableCell>{formatCurrency(diff.newPrice)}</TableCell>
                            <TableCell className="text-right">
                              {diff.delta > 0 ? "+" : ""}
                              {formatCurrency(diff.delta)}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                            No numeric price difference. This request changes pricing structure.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {request.ownerReason ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  Owner reason: {request.ownerReason}
                </div>
              ) : null}
            </div>
          ) : null}
        </ScrollArea>
        {request?.status === "pending" ? (
          <div className="flex justify-end gap-2 border-t px-6 py-4">
            <Button variant="outline" onClick={() => onReject(request)}>
              <XCircle className="size-4" />
              Reject
            </Button>
            <Button onClick={() => onApprove(request)}>
              <CheckCircle2 className="size-4" />
              Approve
            </Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

export function MenuApprovalsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = React.useState("")
  const debouncedSearch = useDebouncedValue(search, 300)
  const [activeTab, setActiveTab] = React.useState<"pending" | "history">("pending")
  const [status, setStatus] = React.useState<StatusFilter>("all")
  const [type, setType] = React.useState<TypeFilter>("all")
  const [page, setPage] = React.useState(1)
  const [selected, setSelected] = React.useState<AdminMenuApprovalRequest | null>(null)
  const [actionMode, setActionMode] = React.useState<"approve" | "reject" | null>(null)
  const isHistoryTab = activeTab === "history"

  React.useEffect(() => {
    setPage(1)
  }, [activeTab, debouncedSearch, status, type])

  const approvalsQuery = useQuery({
    queryKey: [
      "admin",
      "menu-approvals",
      activeTab,
      isHistoryTab ? status : "pending",
      type,
      debouncedSearch,
      page,
    ],
    queryFn: () => {
      const params = {
        status: isHistoryTab ? status : ("pending" as const),
        type,
        search: debouncedSearch,
        page,
        pageSize: 20,
      }
      return isHistoryTab
        ? listAdminMenuApprovalHistory(params)
        : listAdminMenuApprovals(params)
    },
  })

  const detailsQuery = useQuery({
    queryKey: ["admin", "menu-approvals", selected?.id],
    enabled: Boolean(selected?.id),
    queryFn: () => getAdminMenuApproval(selected?.id ?? ""),
  })

  const approveMutation = useMutation({
    mutationFn: approveAdminMenuApproval,
    onSuccess: (updated) => {
      toast.success("Menu change approved.")
      setSelected(updated)
      setActionMode(null)
      queryClient.invalidateQueries({ queryKey: ["admin", "menu-approvals"] })
    },
    onError: (error) => {
      toast.error("Unable to approve", {
        description: error instanceof Error ? error.message : "Please try again.",
      })
    },
  })

  const rejectMutation = useMutation({
    mutationFn: rejectAdminMenuApproval,
    onSuccess: (updated) => {
      toast.success("Menu change rejected.")
      setSelected(updated)
      setActionMode(null)
      queryClient.invalidateQueries({ queryKey: ["admin", "menu-approvals"] })
    },
    onError: (error) => {
      toast.error("Unable to reject", {
        description: error instanceof Error ? error.message : "Please try again.",
      })
    },
  })

  const data = approvalsQuery.data
  const rows = data?.items ?? []
  const selectedDetails = detailsQuery.data ?? selected
  const pendingCount = data?.summary?.pending ?? 0
  const approvedCount = data?.summary?.approved ?? 0
  const rejectedCount = data?.summary?.rejected ?? 0
  const historySummary = hasHistorySummary(data)
    ? data.historySummary
    : undefined
  const topRestaurant = firstHistoryRestaurant(historySummary)
  const topItem = firstHistoryItem(historySummary)

  return (
    <div className="space-y-6">
      {isHistoryTab ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total requests</CardDescription>
              <CardTitle>{(historySummary?.total ?? 0).toLocaleString()}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Top restaurant</CardDescription>
              <CardTitle className="truncate text-xl">
                {topRestaurant?.restaurantName ?? "N/A"}
              </CardTitle>
              <CardDescription>
                {topRestaurant ? `${topRestaurant.requestCount} requests` : "No history yet"}
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Top item</CardDescription>
              <CardTitle className="truncate text-xl">
                {topItem?.itemName ?? "N/A"}
              </CardTitle>
              <CardDescription>
                {topItem
                  ? `${topItem.requestCount} requests - ${topItem.restaurantName}`
                  : "No history yet"}
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Approval rate</CardDescription>
              <CardTitle>{formatPercent(historySummary?.approvalRate)}</CardTitle>
              <CardDescription>
                Rejected {formatPercent(historySummary?.rejectionRate)}
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pending</CardDescription>
              <CardTitle>{pendingCount.toLocaleString()}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Approved</CardDescription>
              <CardTitle>{approvedCount.toLocaleString()}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Rejected</CardDescription>
              <CardTitle>{rejectedCount.toLocaleString()}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Menu Approvals</CardTitle>
              <CardDescription>
                {isHistoryTab
                  ? "Audit approved, rejected, and pending menu change requests."
                  : "Owner-submitted new items and price changes wait here before going live."}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={() => approvalsQuery.refetch()}
              disabled={approvalsQuery.isFetching}
            >
              {approvalsQuery.isFetching ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCcw className="size-4" />
              )}
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as "pending" | "history")}
            className="space-y-4"
          >
            <TabsList>
              <TabsTrigger value="pending">Pending Review</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <div className={isHistoryTab ? "grid gap-3 lg:grid-cols-[1fr_180px_180px]" : "grid gap-3 lg:grid-cols-[1fr_180px]"}>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search item, restaurant, owner phone"
                  className="pl-9"
                />
              </div>
              {isHistoryTab ? (
                <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              ) : null}
              <Select value={type} onValueChange={(value) => setType(value as TypeFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="new_item">New item</SelectItem>
                  <SelectItem value="price_update">Price update</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <TabsContent value="pending" className="mt-0">
              <ApprovalRequestsTable
                rows={rows}
                loading={approvalsQuery.isLoading}
                fetching={approvalsQuery.isFetching}
                page={data?.page ?? page}
                pageCount={data?.pageCount ?? 1}
                historyMode={false}
                onPageChange={setPage}
                onSelect={setSelected}
                onApprove={(request) => {
                  setSelected(request)
                  setActionMode("approve")
                }}
                onReject={(request) => {
                  setSelected(request)
                  setActionMode("reject")
                }}
              />
            </TabsContent>

            <TabsContent value="history" className="mt-0">
              <ApprovalRequestsTable
                rows={rows}
                loading={approvalsQuery.isLoading}
                fetching={approvalsQuery.isFetching}
                page={data?.page ?? page}
                pageCount={data?.pageCount ?? 1}
                historyMode
                onPageChange={setPage}
                onSelect={setSelected}
                onApprove={(request) => {
                  setSelected(request)
                  setActionMode("approve")
                }}
                onReject={(request) => {
                  setSelected(request)
                  setActionMode("reject")
                }}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {isHistoryTab && historySummary ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Most requested restaurants</CardTitle>
              <CardDescription>Restaurants with the most menu change requests.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {historySummary.mostRequestedRestaurants.length ? (
                historySummary.mostRequestedRestaurants.map((restaurant) => (
                  <div key={restaurant.restaurantId} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{restaurant.restaurantName}</div>
                      <div className="text-xs text-muted-foreground">
                        {restaurant.approved} approved / {restaurant.rejected} rejected / {restaurant.pending} pending
                      </div>
                    </div>
                    <Badge variant="secondary">{restaurant.requestCount} requests</Badge>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border p-4 text-sm text-muted-foreground">No restaurant history yet.</div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Most requested items</CardTitle>
              <CardDescription>Items owners try to change most often.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {historySummary.mostRequestedItems.length ? (
                historySummary.mostRequestedItems.map((item) => (
                  <div key={`${item.restaurantId}-${item.menuItemId ?? item.itemSlug}`} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{item.itemName}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {item.restaurantName} / {item.approved} approved / {item.rejected} rejected
                      </div>
                    </div>
                    <Badge variant="secondary">{item.requestCount} requests</Badge>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border p-4 text-sm text-muted-foreground">No item history yet.</div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <ApprovalDetailsDrawer
        request={selectedDetails}
        loading={detailsQuery.isFetching && Boolean(selected)}
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
        onApprove={(request) => {
          setSelected(request)
          setActionMode("approve")
        }}
        onReject={(request) => {
          setSelected(request)
          setActionMode("reject")
        }}
      />

      <ApprovalActionDialog
        request={selectedDetails}
        mode={actionMode}
        loading={approveMutation.isPending || rejectMutation.isPending}
        onClose={() => setActionMode(null)}
        onApprove={(note) => {
          if (!selectedDetails) return
          approveMutation.mutate({ requestId: selectedDetails.id, note })
        }}
        onReject={(values) => {
          if (!selectedDetails) return
          rejectMutation.mutate({
            requestId: selectedDetails.id,
            ownerReason: values.ownerReason,
            internalNote: values.internalNote,
          })
        }}
      />
    </div>
  )
}

function ApprovalRequestsTable({
  rows,
  loading,
  fetching,
  page,
  pageCount,
  historyMode,
  onPageChange,
  onSelect,
  onApprove,
  onReject,
}: {
  rows: AdminMenuApprovalRequest[]
  loading: boolean
  fetching: boolean
  page: number
  pageCount: number
  historyMode: boolean
  onPageChange: (value: React.SetStateAction<number>) => void
  onSelect: (request: AdminMenuApprovalRequest) => void
  onApprove: (request: AdminMenuApprovalRequest) => void
  onReject: (request: AdminMenuApprovalRequest) => void
}) {
  const colSpan = historyMode ? 9 : 7

  return (
    <>
      <div className="overflow-hidden rounded-lg border">
        <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Restaurant</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  {historyMode ? <TableHead>Reviewed</TableHead> : null}
                  {historyMode ? <TableHead>Note</TableHead> : null}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={colSpan} className="h-32 text-center">
                      <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : rows.length ? (
                  rows.map((request) => (
                    <TableRow
                      key={request.id}
                      className="cursor-pointer"
                      onClick={() => onSelect(request)}
                    >
                      <TableCell>
                        <div className="font-medium">
                          {request.proposedName || request.currentName || "Menu item"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {request.ownerName || request.ownerPhone || "Owner"}
                        </div>
                      </TableCell>
                      <TableCell>{request.restaurantName || "N/A"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{typeLabel(request.type)}</Badge>
                      </TableCell>
                      <TableCell>{snapshotPriceLabel(request)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusBadgeClass(request.status)}>
                          {statusLabel(request.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(request.submittedAt)}</TableCell>
                      {historyMode ? <TableCell>{formatDate(request.reviewedAt)}</TableCell> : null}
                      {historyMode ? (
                        <TableCell className="max-w-[14rem]">
                          <div className="truncate text-xs text-muted-foreground" title={request.ownerReason || request.internalNote || ""}>
                            {request.ownerReason || request.internalNote || "N/A"}
                          </div>
                        </TableCell>
                      ) : null}
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation()
                              onSelect(request)
                            }}
                          >
                            <Eye className="size-4" />
                            View
                          </Button>
                          {request.status === "pending" ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  onReject(request)
                                }}
                              >
                                <XCircle className="size-4" />
                                Reject
                              </Button>
                              <Button
                                size="sm"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  onApprove(request)
                                }}
                              >
                                <CheckCircle2 className="size-4" />
                                Approve
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={colSpan} className="h-32 text-center text-muted-foreground">
                      <ShieldAlert className="mx-auto mb-2 size-5" />
                      No menu approval requests found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Page {page} of {pageCount}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={page <= 1 || fetching}
            onClick={() => onPageChange((current) => Math.max(1, current - 1))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={page >= pageCount || fetching}
            onClick={() => onPageChange((current) => current + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </>
  )
}
