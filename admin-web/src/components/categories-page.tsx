import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  Archive,
  Download,
  Eye,
  Loader2,
  RefreshCcw,
  RotateCcw,
  Search,
  Tags,
} from "lucide-react"
import { toast } from "sonner"

import { useDebouncedValue } from "@/hooks/use-debounced-value"
import {
  bulkUpdateAdminFoodCategoryStatus,
  getAdminFoodCategory,
  listAdminFoodCategories,
  updateAdminFoodCategoryStatus,
  type AdminFoodCategory,
  type AdminFoodCategoryHealth,
  type AdminFoodCategorySort,
  type AdminFoodCategoryStatus,
} from "@/lib/admin-api"
import {
  getAdminZoneScope,
  subscribeAdminZoneScope,
} from "@/lib/admin-zone-scope"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

function formatDate(value?: string | null) {
  if (!value) return "N/A"
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function formatCurrency(value: number) {
  return `Tk ${Math.round(value || 0).toLocaleString()}`
}

function StatusBadge({ status }: { status: AdminFoodCategoryStatus }) {
  return (
    <Badge variant={status === "active" ? "default" : "outline"}>
      {status === "active" ? "Active" : "Archived"}
    </Badge>
  )
}

function FlagBadge({ flag }: { flag: AdminFoodCategory["flags"][number] }) {
  return (
    <Badge
      variant={
        flag.tone === "critical"
          ? "destructive"
          : flag.tone === "warning"
            ? "secondary"
            : "outline"
      }
    >
      {flag.label}
    </Badge>
  )
}

function MetricCard({ label, value, helper }: { label: string; value: React.ReactNode; helper: string }) {
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

export function CategoriesPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = React.useState("")
  const debouncedSearch = useDebouncedValue(search, 350)
  const [restaurantId, setRestaurantId] = React.useState("all")
  const [status, setStatus] = React.useState<"all" | AdminFoodCategoryStatus>("all")
  const [health, setHealth] = React.useState<AdminFoodCategoryHealth>("all")
  const [sortBy, setSortBy] = React.useState<AdminFoodCategorySort>("newest")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<string | null>(null)
  const [selectedCategoryIds, setSelectedCategoryIds] = React.useState<string[]>([])
  const [moderationReason, setModerationReason] = React.useState("")
  const [notifyOwner, setNotifyOwner] = React.useState(true)
  const [adminZoneScope, setAdminZoneScope] = React.useState(() =>
    getAdminZoneScope()
  )
  const adminScopeKey = `${adminZoneScope.type}:${adminZoneScope.id || "all"}`

  React.useEffect(() => {
    setPage(1)
  }, [debouncedSearch, restaurantId, status, health, sortBy, pageSize])

  React.useEffect(
    () =>
      subscribeAdminZoneScope(() => {
        setAdminZoneScope(getAdminZoneScope())
        setRestaurantId("all")
        setSelectedCategoryId(null)
        setSelectedCategoryIds([])
        setPage(1)
      }),
    []
  )

  const categoriesQuery = useQuery({
    queryKey: [
      "admin-food-categories",
      debouncedSearch,
      restaurantId,
      status,
      health,
      sortBy,
      page,
      pageSize,
      adminScopeKey,
    ],
    queryFn: () =>
      listAdminFoodCategories({
        search: debouncedSearch,
        restaurantId,
        status,
        health,
        sortBy,
        page,
        pageSize,
      }),
  })

  const detailsQuery = useQuery({
    queryKey: ["admin-food-category", selectedCategoryId],
    queryFn: () => getAdminFoodCategory(selectedCategoryId ?? ""),
    enabled: Boolean(selectedCategoryId),
  })

  const statusMutation = useMutation({
    mutationFn: updateAdminFoodCategoryStatus,
    onSuccess: (_, variables) => {
      toast.success(variables.status === "archived" ? "Category archived" : "Category restored")
      setModerationReason("")
      void queryClient.invalidateQueries({ queryKey: ["admin-food-categories"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-food-category", variables.categoryId] })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Category update failed"),
  })

  const bulkStatusMutation = useMutation({
    mutationFn: bulkUpdateAdminFoodCategoryStatus,
    onSuccess: (result, variables) => {
      toast.success(`${result.updated} categories ${variables.status === "archived" ? "archived" : "restored"}`)
      setSelectedCategoryIds([])
      setModerationReason("")
      void queryClient.invalidateQueries({ queryKey: ["admin-food-categories"] })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Bulk category update failed"),
  })

  const data = categoriesQuery.data
  const categories = data?.items ?? []
  const summary = data?.summary ?? { total: 0, active: 0, archived: 0, empty: 0, needsReview: 0 }
  const selectedDetails = detailsQuery.data ?? null
  const selectedCategory = selectedDetails?.category ?? categories.find((item) => item.id === selectedCategoryId) ?? null

  const resetFilters = () => {
    setSearch("")
    setRestaurantId("all")
    setStatus("all")
    setHealth("all")
    setSortBy("newest")
    setPage(1)
    setPageSize(10)
  }

  const updateStatus = (category: AdminFoodCategory, nextStatus: AdminFoodCategoryStatus) => {
    statusMutation.mutate({
      categoryId: category.id,
      status: nextStatus,
      reason: moderationReason || (nextStatus === "archived" ? "Archived from admin category governance." : "Restored by admin."),
      notifyOwner,
    })
  }

  const updateBulkStatus = (nextStatus: AdminFoodCategoryStatus) => {
    if (!selectedCategoryIds.length) {
      toast.error("Select at least one category")
      return
    }
    bulkStatusMutation.mutate({
      categoryIds: selectedCategoryIds,
      status: nextStatus,
      reason: moderationReason || (nextStatus === "archived" ? "Bulk archived from admin category governance." : "Bulk restored by admin."),
      notifyOwner,
    })
  }

  const toggleCategorySelection = (categoryId: string, checked: boolean) => {
    setSelectedCategoryIds((ids) =>
      checked ? [...new Set([...ids, categoryId])] : ids.filter((id) => id !== categoryId)
    )
  }

  const exportVisibleCsv = () => {
    const rows = [
      ["category", "restaurant", "status", "totalItems", "activeItems", "flags", "updatedAt"],
      ...categories.map((category) => [
        category.name,
        category.restaurantName,
        category.status,
        category.totalItems,
        category.activeItems,
        category.flags.map((flag) => flag.label).join("; "),
        category.updatedAt ?? "",
      ]),
    ]
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "food-categories.csv"
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Tags className="size-5" />
            </span>
            Food Categories
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor and moderate owner-created restaurant categories without creating platform-wide categories.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={exportVisibleCsv}>
            <Download className="size-4" />
            Export visible
          </Button>
          <Button type="button" variant="outline" onClick={resetFilters}>
            <RefreshCcw className="size-4" />
            Reset filters
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Total categories" value={summary.total} helper="Owner-created categories" />
        <MetricCard label="Active" value={summary.active} helper="Visible in restaurant menu flow" />
        <MetricCard label="Archived" value={summary.archived} helper="Hidden by owner/admin action" />
        <MetricCard label="Empty" value={summary.empty} helper="No menu items attached" />
        <MetricCard label="Needs review" value={summary.needsReview} helper="Empty, duplicate, or no active items" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Category governance</CardTitle>
          <CardDescription>
            Owner-created food categories with restaurant context, menu item health, and moderation actions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.3fr_1fr_0.75fr_0.9fr_0.8fr_0.65fr]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search category, slug, description"
                className="pl-9"
              />
            </div>
            <Select value={restaurantId} onValueChange={setRestaurantId}>
              <SelectTrigger><SelectValue placeholder="Restaurant" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All restaurants</SelectItem>
                {(data?.restaurants ?? []).map((restaurant) => (
                  <SelectItem key={restaurant.id} value={restaurant.id}>
                    {restaurant.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <Select value={health} onValueChange={(value) => setHealth(value as AdminFoodCategoryHealth)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All health</SelectItem>
                <SelectItem value="needs_review">Needs review</SelectItem>
                <SelectItem value="empty">Empty</SelectItem>
                <SelectItem value="duplicate">Duplicate</SelectItem>
                <SelectItem value="healthy">Healthy</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(value) => setSortBy(value as AdminFoodCategorySort)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest updated</SelectItem>
                <SelectItem value="oldest">Oldest created</SelectItem>
                <SelectItem value="mostItems">Most items</SelectItem>
                <SelectItem value="emptyFirst">Empty first</SelectItem>
                <SelectItem value="name">Name A-Z</SelectItem>
              </SelectContent>
            </Select>
            <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 rows</SelectItem>
                <SelectItem value="20">20 rows</SelectItem>
                <SelectItem value="50">50 rows</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {selectedCategoryIds.length ? (
            <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium">{selectedCategoryIds.length} selected</p>
                <p className="text-xs text-muted-foreground">Bulk archive/restore will be audit logged.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={notifyOwner} onCheckedChange={(checked) => setNotifyOwner(Boolean(checked))} />
                  Notify owners
                </label>
                <Button type="button" variant="outline" size="sm" disabled={bulkStatusMutation.isPending} onClick={() => updateBulkStatus("archived")}>
                  <Archive className="size-4" />
                  Archive selected
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={bulkStatusMutation.isPending} onClick={() => updateBulkStatus("active")}>
                  <RotateCcw className="size-4" />
                  Restore selected
                </Button>
              </div>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={categories.length > 0 && categories.every((category) => selectedCategoryIds.includes(category.id))}
                      onCheckedChange={(checked) =>
                        setSelectedCategoryIds(
                          checked
                            ? [...new Set([...selectedCategoryIds, ...categories.map((category) => category.id)])]
                            : selectedCategoryIds.filter((id) => !categories.some((category) => category.id === id))
                        )
                      }
                    />
                  </TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Restaurant</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Review flags</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categoriesQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center">
                      <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : categories.length ? (
                  categories.map((category) => (
                    <TableRow key={category.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedCategoryIds.includes(category.id)}
                          onCheckedChange={(checked) => toggleCategorySelection(category.id, Boolean(checked))}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="font-medium">{category.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{category.slug || "No slug"}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{category.restaurantName}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {category.restaurantCity || category.restaurantAddress || "No location"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell><StatusBadge status={category.status} /></TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p>{category.activeItems}/{category.totalItems} active</p>
                          <p className="text-xs text-muted-foreground">{category.unavailableItems} unavailable</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex max-w-72 flex-wrap gap-1">
                          {category.flags.length ? (
                            category.flags.map((flag) => <FlagBadge key={flag.key} flag={flag} />)
                          ) : (
                            <Badge variant="outline">Healthy</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDate(category.updatedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => setSelectedCategoryId(category.id)}>
                            <Eye className="size-4" />
                            View
                          </Button>
                          {category.status === "active" ? (
                            <Button type="button" variant="outline" size="sm" onClick={() => updateStatus(category, "archived")}>
                              <Archive className="size-4" />
                              Archive
                            </Button>
                          ) : (
                            <Button type="button" variant="outline" size="sm" onClick={() => updateStatus(category, "active")}>
                              <RotateCcw className="size-4" />
                              Restore
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                      No categories found with the selected filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {categories.length} of {data?.total ?? 0} categories
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Previous
              </Button>
              <Badge variant="outline">Page {data?.page ?? page}/{data?.pageCount ?? 1}</Badge>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= (data?.pageCount ?? 1)}
                onClick={() => setPage((value) => Math.min(data?.pageCount ?? value + 1, value + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Sheet open={Boolean(selectedCategoryId)} onOpenChange={(open) => !open && setSelectedCategoryId(null)}>
        <SheetContent className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-3xl! md:max-w-6xl!">
          <div className="border-b px-6 py-5">
            <SheetHeader>
              <SheetTitle>{selectedCategory?.name ?? "Category details"}</SheetTitle>
              <SheetDescription>
                {selectedCategory
                  ? `${selectedCategory.restaurantName} - ${selectedCategory.totalItems} menu items`
                  : "Owner-created category details"}
              </SheetDescription>
            </SheetHeader>
          </div>

          {detailsQuery.isLoading ? (
            <div className="grid flex-1 place-items-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : selectedCategory && selectedDetails ? (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid gap-4 lg:grid-cols-[0.75fr_1.25fr]">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Category profile</CardTitle>
                    <CardDescription>Admin governance view. Category creation remains owner-controlled.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge status={selectedCategory.status} />
                      {selectedCategory.flags.map((flag) => <FlagBadge key={flag.key} flag={flag} />)}
                    </div>
                    <div className="grid gap-2 text-sm">
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Restaurant</span>
                        <span className="text-right font-medium">{selectedCategory.restaurantName}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Slug</span>
                        <span className="text-right font-medium">{selectedCategory.slug || "N/A"}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Display order</span>
                        <span className="text-right font-medium">{selectedCategory.displayOrder}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Created</span>
                        <span className="text-right font-medium">{formatDate(selectedCategory.createdAt)}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Updated</span>
                        <span className="text-right font-medium">{formatDate(selectedCategory.updatedAt)}</span>
                      </div>
                    </div>
                    {selectedCategory.needsReview ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="mt-0.5 size-4" />
                          <p>This category needs admin attention because it is empty, duplicated, or has no active items.</p>
                        </div>
                      </div>
                    ) : null}
                    <div className="space-y-2">
                      <Label>Moderation note</Label>
                      <Input
                        value={moderationReason}
                        onChange={(event) => setModerationReason(event.target.value)}
                        placeholder="Reason shown in audit log"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={notifyOwner} onCheckedChange={(checked) => setNotifyOwner(Boolean(checked))} />
                      Notify restaurant owner
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {selectedCategory.status === "active" ? (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={statusMutation.isPending}
                          onClick={() => updateStatus(selectedCategory, "archived")}
                        >
                          {statusMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Archive className="size-4" />}
                          Archive category
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={statusMutation.isPending}
                          onClick={() => updateStatus(selectedCategory, "active")}
                        >
                          {statusMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                          Restore category
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-4">
                    <MetricCard label="Total items" value={selectedCategory.totalItems} helper="All items attached" />
                    <MetricCard label="Active items" value={selectedCategory.activeItems} helper="Available and active" />
                    <MetricCard label="Unavailable" value={selectedCategory.unavailableItems} helper="Temporarily unavailable" />
                    <MetricCard label="Archived items" value={selectedCategory.archivedItems} helper="Hidden items" />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-4">
                    <MetricCard label="Delivered orders" value={selectedDetails.sales.deliveredOrders} helper="Orders containing this category" />
                    <MetricCard label="Category revenue" value={formatCurrency(selectedDetails.sales.deliveredRevenue)} helper="Delivered order item revenue" />
                    <MetricCard label="Items sold" value={selectedDetails.sales.itemQuantity} helper="Quantity from delivered orders" />
                    <MetricCard
                      label="Top item"
                      value={selectedDetails.sales.topItem?.name ?? "N/A"}
                      helper={selectedDetails.sales.topItem ? `${selectedDetails.sales.topItem.quantity} sold` : "No delivered sales yet"}
                    />
                  </div>

                  {selectedDetails.duplicateSuggestions.length ? (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Duplicate merge suggestions</CardTitle>
                        <CardDescription>Review only. Auto-merge is intentionally disabled to avoid moving owner data incorrectly.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {selectedDetails.duplicateSuggestions.map((duplicate) => (
                          <div key={duplicate.id} className="flex items-center justify-between rounded-lg border p-3">
                            <div>
                              <p className="font-medium">{duplicate.name}</p>
                              <p className="text-xs text-muted-foreground">Updated {formatDate(duplicate.updatedAt)}</p>
                            </div>
                            <Badge variant="outline">{duplicate.status}</Badge>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  ) : null}

                  {selectedDetails.sales.recentOrders.length ? (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Recent category orders</CardTitle>
                        <CardDescription>Delivered orders where this category appeared.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-hidden rounded-lg border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Order</TableHead>
                                <TableHead>Customer</TableHead>
                                <TableHead>Category revenue</TableHead>
                                <TableHead>Created</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {selectedDetails.sales.recentOrders.map((order) => (
                                <TableRow key={order.id}>
                                  <TableCell className="font-medium">{order.orderNumber}</TableCell>
                                  <TableCell>{order.customerName || "Customer"}</TableCell>
                                  <TableCell>{formatCurrency(order.categoryRevenue)}</TableCell>
                                  <TableCell className="text-muted-foreground">{formatDate(order.createdAt)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Menu items</CardTitle>
                      <CardDescription>Items currently attached to this owner-created category.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-hidden rounded-lg border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Item</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Availability</TableHead>
                              <TableHead>Price</TableHead>
                              <TableHead>Updated</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedDetails.menuItems.length ? (
                              selectedDetails.menuItems.map((item) => (
                                <TableRow key={item.id}>
                                  <TableCell>
                                    <div className="flex items-center gap-3">
                                      {item.imageUrl ? (
                                        <img src={item.imageUrl} alt="" className="size-10 rounded-md object-cover" />
                                      ) : (
                                        <div className="grid size-10 place-items-center rounded-md bg-muted text-muted-foreground">
                                          <Tags className="size-4" />
                                        </div>
                                      )}
                                      <div>
                                        <p className="font-medium">{item.name}</p>
                                        {item.isPopular ? <Badge variant="secondary">Popular</Badge> : null}
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell>{item.status}</TableCell>
                                  <TableCell>{item.availability}</TableCell>
                                  <TableCell>{formatCurrency(item.basePrice)}</TableCell>
                                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(item.updatedAt)}</TableCell>
                                </TableRow>
                              ))
                            ) : (
                              <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                  No menu items under this category.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Audit trail</CardTitle>
                      <CardDescription>Admin moderation actions for this category.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {selectedDetails.auditLogs.length ? (
                        <div className="space-y-2">
                          {selectedDetails.auditLogs.map((log) => (
                            <div key={log.id} className="rounded-lg border p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-medium">{log.title}</p>
                                  <p className="text-sm text-muted-foreground">{log.description || log.action}</p>
                                </div>
                                <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(log.createdAt)}</span>
                              </div>
                              <p className="mt-2 text-xs text-muted-foreground">By {log.actorName}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                          No admin moderation history yet.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  )
}
