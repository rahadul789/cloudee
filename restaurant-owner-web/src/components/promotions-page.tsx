import * as React from "react"

import { format } from "date-fns"
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Eye,
  LoaderCircle,
  MoreHorizontal,
  PencilLine,
  Plus,
  RotateCcw,
  Search,
  Tag,
  TicketPercent,
  Trash2,
} from "lucide-react"
import { useDebouncedValue } from "@/hooks/use-debounced-value"

import { useCategories } from "@/components/categories/categories-context"
import { useMenuItems } from "@/components/menu/menu-items-context"
import {
  PromotionDetailsDrawer,
} from "@/components/promotions/promotion-details-drawer"
import { PromotionEditDrawer } from "@/components/promotions/promotion-edit-drawer"
import { type VoucherSubmitPayload } from "@/components/promotions/promotion-form-dialog"
import { usePromotions } from "@/components/promotions/promotions-context"
import {
  useCreateOwnerVoucherMutation,
  useDeleteOwnerVoucherMutation,
  useOwnerVouchersQuery,
  useUpdateOwnerVoucherMutation,
} from "@/hooks/use-owner-api"
import {
  type Voucher,
  type VoucherMode,
  type VoucherStatus,
  type VoucherType,
  formatVoucherDiscount,
  getVoucherLifecycleStatus,
  getVoucherModeLabel,
  getVoucherTypeLabel,
} from "@/components/promotions/types"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Empty,
  EmptyContent,
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
import { Skeleton } from "@/components/ui/skeleton"
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
  mapOwnerVoucher,
  type OwnerListResponse,
  type OwnerVoucherResponse,
} from "@/lib/backend-mappers"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useAppStore } from "@/store/app-store"

type LifecycleFilter = "all" | "Active" | "Scheduled" | "Expired" | "Draft"
type SortKey = "newestUpdated" | "highestUses" | "highestDiscount" | "endingSoon"

const pageSizeOptions = [5, 10, 20, 30]

function formatMoney(value: number) {
  return `${Math.round(value).toLocaleString()}tk`
}

function getLifecycleBadgeClass(status: ReturnType<typeof getVoucherLifecycleStatus>) {
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

function PromotionsTableSkeleton() {
  return (
    <div className="space-y-4 px-4 lg:px-6">
      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <Skeleton className="h-10 w-full sm:max-w-72" />
          <Skeleton className="h-10 w-full sm:w-40" />
          <Skeleton className="h-10 w-full sm:w-44" />
          <Skeleton className="h-10 w-full sm:w-44" />
          <Skeleton className="h-10 w-full sm:w-40" />
        </div>
        <Skeleton className="h-10 w-full sm:w-36" />
      </div>
      <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton key={index} className="h-14 w-full" />
        ))}
      </div>
    </div>
  )
}

function mapVoucherTypeToBackend(type: VoucherType) {
  if (type === "free-delivery") return "free_delivery"
  if (type === "percentage") return "percentage"
  return "flat"
}

function buildVoucherPayload(payload: VoucherSubmitPayload) {
  return {
    fundedBy: "owner",
    stackingRule: "exclusive",
    priority: 0,
    mode: payload.mode,
    type: mapVoucherTypeToBackend(payload.type),
    name: payload.name,
    code: payload.mode === "coupon" ? payload.code : "",
    discountValue: payload.type === "free-delivery" ? 0 : payload.discountValue ?? 0,
    minimumOrderAmount: payload.minimumOrderAmount,
    maxTotalUses: payload.maxTotalUses ?? 0,
    maxUsesPerUser: payload.maxUsesPerUser,
    allowRepeatUsage: payload.allowRepeatUsage,
    status: payload.status,
    applicability: payload.applicability,
    categoryIds: payload.applicability === "categories" ? payload.categoryIds : [],
    itemIds: payload.applicability === "items" ? payload.itemIds : [],
    startsAt: payload.startsAt,
    endsAt: payload.endsAt,
  }
}

function VoucherActions({
  voucher,
  onView,
  onEdit,
  onDelete,
  isDeleting = false,
}: {
  voucher: Voucher
  onView: (voucher: Voucher) => void
  onEdit: (voucher: Voucher) => void
  onDelete: (id: string) => void
  isDeleting?: boolean
}) {
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8">
            <MoreHorizontal className="size-4" />
            <span className="sr-only">Open actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => onView(voucher)}>
            <Eye className="size-4" />
            Details
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onEdit(voucher)}>
            <PencilLine className="size-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setIsDeleteOpen(true)}
          >
            <Trash2 className="size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive">
              <Trash2 className="size-4" />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete voucher?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{voucher.name}</strong> will be removed from promotions.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => onDelete(voucher.id)}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export function PromotionsPage() {
  const { vouchers, setVouchers, isLoading } = usePromotions()
  const { categories } = useCategories()
  const { items } = useMenuItems()
  const ownerAccount = useAppStore((state) => state.ownerAccount)
  const queryClient = useQueryClient()
  const createVoucherMutation = useCreateOwnerVoucherMutation()
  const updateVoucherMutation = useUpdateOwnerVoucherMutation()
  const deleteVoucherMutation = useDeleteOwnerVoucherMutation()
  const [isAddOpen, setIsAddOpen] = React.useState(false)
  const [viewingVoucher, setViewingVoucher] = React.useState<Voucher | null>(null)
  const [editingVoucher, setEditingVoucher] = React.useState<Voucher | null>(null)
  const [search, setSearch] = React.useState("")
  const [lifecycleFilter, setLifecycleFilter] =
    React.useState<LifecycleFilter>("all")
  const [modeFilter, setModeFilter] = React.useState<"all" | VoucherMode>("all")
  const [typeFilter, setTypeFilter] = React.useState<"all" | VoucherType>("all")
  const [sortBy, setSortBy] = React.useState<SortKey>("newestUpdated")
  const [pageSize, setPageSize] = React.useState(10)
  const [pageIndex, setPageIndex] = React.useState(0)
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = React.useState(false)
  const [pendingVoucherAction, setPendingVoucherAction] = React.useState<{
    type: "submit" | "delete" | "status" | "bulk"
    id?: string
  } | null>(null)
  const debouncedSearch = useDebouncedValue(search)
  const [columnVisibility, setColumnVisibility] = React.useState({
    mode: true,
    discount: true,
    minimumOrder: true,
    usage: true,
    revenue: true,
    lifecycle: true,
    dateRange: true,
  })

  const vouchersQuery = useOwnerVouchersQuery(ownerAccount.isAuthenticated, {
    search: debouncedSearch.trim() || undefined,
    lifecycle: lifecycleFilter !== "all" ? lifecycleFilter : undefined,
    mode: modeFilter !== "all" ? modeFilter : undefined,
    type: typeFilter !== "all" ? typeFilter : undefined,
    sortBy,
    page: pageIndex + 1,
    pageSize,
  })

  const categoryOptions = React.useMemo(
    () => categories.map((category) => ({ id: category.id, name: category.name })),
    [categories]
  )

  const itemOptions = React.useMemo(
    () => items.map((item) => ({ id: item.id, name: item.name })),
    [items]
  )

  const filteredAndSorted = React.useMemo(() => {
    if (!vouchersQuery.data) return vouchers
    return (
      vouchersQuery.data as OwnerListResponse<OwnerVoucherResponse>
    ).items.map(mapOwnerVoucher)
  }, [vouchers, vouchersQuery.data])

  const totalRows =
    (vouchersQuery.data as OwnerListResponse<OwnerVoucherResponse> | undefined)
      ?.total ?? filteredAndSorted.length
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize))
  const safePageIndex = Math.min(pageIndex, pageCount - 1)

  const paginatedRows = filteredAndSorted

  React.useEffect(() => {
    setPageIndex(0)
  }, [debouncedSearch, lifecycleFilter, modeFilter, typeFilter, sortBy, pageSize])

  const selectedDiscountTotal = React.useMemo(
    () =>
      vouchers
        .filter((voucher) => selectedIds.includes(voucher.id))
        .reduce((sum, voucher) => sum + voucher.analytics.totalDiscountGiven, 0),
    [selectedIds, vouchers]
  )

  const existingCodes = React.useMemo(
    () =>
      vouchers
        .filter((voucher) => voucher.id !== editingVoucher?.id)
        .map((voucher) => voucher.code)
        .filter(Boolean),
    [editingVoucher?.id, vouchers]
  )

  const resetDisabled =
    !search &&
    lifecycleFilter === "all" &&
    modeFilter === "all" &&
    typeFilter === "all" &&
    sortBy === "newestUpdated"

  function handleResetFilters() {
    setSearch("")
    setLifecycleFilter("all")
    setModeFilter("all")
    setTypeFilter("all")
    setSortBy("newestUpdated")
  }

  async function upsertVoucher(payload: VoucherSubmitPayload, id?: string) {
    const requestPayload = buildVoucherPayload(payload)
    setPendingVoucherAction({ type: "submit", id })

    try {
      if (id) {
        const updated = await updateVoucherMutation.mutateAsync({
          id,
          ...requestPayload,
        })
        const mapped = mapOwnerVoucher(updated)
        setVouchers((current) =>
          current.map((voucher) => (voucher.id === id ? mapped : voucher))
        )
        toast.success("Voucher updated.")
        void queryClient.invalidateQueries({ queryKey: ["owner", "vouchers"] })
        return true
      }

      const created = await createVoucherMutation.mutateAsync(requestPayload)
      const mapped = mapOwnerVoucher(created)
      setVouchers((current) => [mapped, ...current])
      toast.success("Voucher created.")
      void queryClient.invalidateQueries({ queryKey: ["owner", "vouchers"] })
      return true
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to save voucher."
      toast.error("Save failed", { description: message })
      return false
    } finally {
      setPendingVoucherAction(null)
    }
  }

  async function handleDelete(id: string) {
    setPendingVoucherAction({ type: "delete", id })
    try {
      await deleteVoucherMutation.mutateAsync(id)
      setVouchers((current) => current.filter((voucher) => voucher.id !== id))
      setSelectedIds((current) => current.filter((item) => item !== id))

      if (viewingVoucher?.id === id) {
        setViewingVoucher(null)
      }

      if (editingVoucher?.id === id) {
        setEditingVoucher(null)
      }
      toast.success("Voucher deleted.")
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to delete voucher."
      toast.error("Delete failed", { description: message })
    } finally {
      setPendingVoucherAction(null)
    }
  }

  async function handleBulkAction(action: "activate" | "draft" | "delete") {
    if (selectedIds.length === 0) return
    setPendingVoucherAction({ type: "bulk" })

    if (action === "delete") {
      try {
        await Promise.all(selectedIds.map((id) => deleteVoucherMutation.mutateAsync(id)))
        setVouchers((current) =>
          current.filter((voucher) => !selectedIds.includes(voucher.id))
        )
        setSelectedIds([])
        toast.success("Selected vouchers deleted.")
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to delete vouchers."
        toast.error("Delete failed", { description: message })
      } finally {
        setPendingVoucherAction(null)
      }
      return
    }

    const nextStatus: VoucherStatus = action === "activate" ? "Active" : "Draft"
    const updates = selectedIds.map((id) => {
      return updateVoucherMutation.mutateAsync({
        id,
        status: nextStatus,
      })
    })

    try {
      const results = await Promise.all(updates)
      const mapped = results.filter(Boolean).map((entry) => mapOwnerVoucher(entry!))
      if (mapped.length > 0) {
        setVouchers((current) =>
          current.map((voucher) => {
            const updated = mapped.find((entry) => entry.id === voucher.id)
            return updated ?? voucher
          })
        )
      }
      setSelectedIds([])
      toast.success("Selected vouchers updated.")
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update vouchers."
      toast.error("Update failed", { description: message })
    } finally {
      setPendingVoucherAction(null)
    }
  }

  function toggleRow(id: string, checked: boolean) {
    setSelectedIds((current) =>
      checked ? [...current, id] : current.filter((item) => item !== id)
    )
  }

  function togglePageSelection(checked: boolean) {
    if (checked) {
      const pageIds = paginatedRows.map((voucher) => voucher.id)
      setSelectedIds((current) => Array.from(new Set([...current, ...pageIds])))
      return
    }

    setSelectedIds((current) =>
      current.filter((id) => !paginatedRows.some((voucher) => voucher.id === id))
    )
  }

  async function handleToggleStatus(id: string, checked: boolean) {
    setPendingVoucherAction({ type: "status", id })
    try {
      const updated = await updateVoucherMutation.mutateAsync({
        id,
        status: checked ? "Active" : "Draft",
      })
      const mapped = mapOwnerVoucher(updated)
      setVouchers((current) =>
        current.map((voucher) => (voucher.id === id ? mapped : voucher))
      )
      toast.success("Voucher status updated.")
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update status."
      toast.error("Update failed", { description: message })
    } finally {
      setPendingVoucherAction(null)
    }
  }

  if (isLoading) {
    return <PromotionsTableSkeleton />
  }

  return (
    <div className="space-y-4 px-4 lg:px-6">
      <PromotionEditDrawer
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        voucher={null}
        existingCodes={existingCodes}
        categories={categoryOptions}
        items={itemOptions}
        onSubmitVoucher={(payload) => upsertVoucher(payload)}
        isSubmitting={pendingVoucherAction?.type === "submit" && !pendingVoucherAction.id}
      />
      <PromotionEditDrawer
        open={!!editingVoucher}
        onOpenChange={(open) => {
          if (!open) {
            setEditingVoucher(null)
          }
        }}
        voucher={editingVoucher}
        existingCodes={existingCodes}
        categories={categoryOptions}
        items={itemOptions}
        onSubmitVoucher={(payload) => {
          if (!editingVoucher) return
          return upsertVoucher(payload, editingVoucher.id)
        }}
        isSubmitting={pendingVoucherAction?.type === "submit" && pendingVoucherAction.id === editingVoucher?.id}
      />
      <PromotionDetailsDrawer
        open={!!viewingVoucher}
        onOpenChange={(open) => {
          if (!open) {
            setViewingVoucher(null)
          }
        }}
        voucher={viewingVoucher}
        categoryNames={
          viewingVoucher
            ? categoryOptions
                .filter((category) =>
                  viewingVoucher.categoryIds.includes(category.id)
                )
                .map((category) => category.name)
            : []
        }
        itemNames={
          viewingVoucher
            ? itemOptions
                .filter((item) => viewingVoucher.itemIds.includes(item.id))
                .map((item) => item.name)
            : []
        }
        onEdit={(voucher) => {
          setViewingVoucher(null)
          setEditingVoucher(voucher)
        }}
      />

      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3">
          <div className="flex flex-1 flex-col gap-3 lg:flex-row">
            <div className="relative w-full lg:max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search voucher or code"
                className="pl-9"
              />
            </div>
            <Select
              value={lifecycleFilter}
              onValueChange={(value) =>
                setLifecycleFilter(value as LifecycleFilter)
              }
            >
              <SelectTrigger className="w-full lg:w-40">
                <SelectValue placeholder="Lifecycle" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Scheduled">Scheduled</SelectItem>
                <SelectItem value="Expired">Expired</SelectItem>
                <SelectItem value="Draft">Draft</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={modeFilter}
              onValueChange={(value) => setModeFilter(value as "all" | VoucherMode)}
            >
              <SelectTrigger className="w-full lg:w-44">
                <SelectValue placeholder="Offer Mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Offers</SelectItem>
                <SelectItem value="auto">Auto Applied</SelectItem>
                <SelectItem value="coupon">Coupon Code</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={typeFilter}
              onValueChange={(value) => setTypeFilter(value as "all" | VoucherType)}
            >
              <SelectTrigger className="w-full lg:w-48">
                <SelectValue placeholder="Offer Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="flat">Flat Discount</SelectItem>
                <SelectItem value="percentage">Percentage Discount</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={sortBy}
              onValueChange={(value) => setSortBy(value as SortKey)}
            >
              <SelectTrigger className="w-full lg:w-48">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newestUpdated">Newest Updated</SelectItem>
                <SelectItem value="highestUses">Highest Uses</SelectItem>
                <SelectItem value="highestDiscount">Highest Discount</SelectItem>
                <SelectItem value="endingSoon">Ending Soon</SelectItem>
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="justify-between lg:w-40">
                  <span className="inline-flex items-center gap-2">
                    <Columns3 className="size-4" />
                    Columns
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {Object.entries(columnVisibility).map(([key, value]) => (
                  <DropdownMenuCheckboxItem
                    key={key}
                    checked={value}
                    onCheckedChange={(checked) =>
                      setColumnVisibility((current) => ({
                        ...current,
                        [key]: !!checked,
                      }))
                    }
                  >
                    {key}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              onClick={handleResetFilters}
              disabled={resetDisabled}
            >
              <RotateCcw className="size-4" />
              Reset
            </Button>
          </div>

        </div>

        <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {totalRows} vouchers
          </div>
          <Button onClick={() => setIsAddOpen(true)}>
            <Plus className="size-4" />
            Add Voucher
          </Button>
        </div>

        {selectedIds.length > 0 ? (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border bg-muted/40 p-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="text-sm font-medium">
              {selectedIds.length} selected
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkAction("activate")}
                disabled={pendingVoucherAction?.type === "bulk"}
              >
                <CheckCircle2 className="size-4" />
                Activate
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkAction("draft")}
                disabled={pendingVoucherAction?.type === "bulk"}
              >
                <Tag className="size-4" />
                Draft
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setIsBulkDeleteOpen(true)}
                disabled={pendingVoucherAction?.type === "bulk"}
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <Table className="min-w-[1120px]">
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow className="hover:bg-transparent">
                <TableHead>
                  <Checkbox
                    checked={
                      paginatedRows.length > 0 &&
                      paginatedRows.every((voucher) =>
                        selectedIds.includes(voucher.id)
                      )
                    }
                    onCheckedChange={(value) => togglePageSelection(!!value)}
                    aria-label="Select all rows"
                  />
                </TableHead>
                <TableHead>Voucher</TableHead>
                {columnVisibility.mode ? <TableHead>Mode</TableHead> : null}
                {columnVisibility.discount ? <TableHead>Offer</TableHead> : null}
                {columnVisibility.minimumOrder ? (
                  <TableHead>Minimum Order</TableHead>
                ) : null}
                {columnVisibility.usage ? <TableHead>Total Uses</TableHead> : null}
                {columnVisibility.revenue ? <TableHead>Sales / Owner Cost</TableHead> : null}
                {columnVisibility.lifecycle ? <TableHead>Status</TableHead> : null}
                {columnVisibility.dateRange ? (
                  <TableHead>Date Range</TableHead>
                ) : null}
                <TableHead className="pr-4 text-right lg:pr-6">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedRows.length > 0 ? (
                paginatedRows.map((voucher) => {
                  const lifecycleStatus = getVoucherLifecycleStatus(voucher)

                  return (
                    <TableRow
                      key={voucher.id}
                      data-state={selectedIds.includes(voucher.id) && "selected"}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.includes(voucher.id)}
                          onCheckedChange={(value) =>
                            toggleRow(voucher.id, !!value)
                          }
                          aria-label="Select row"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="min-w-56">
                          <div className="flex items-center gap-2 font-medium">
                            <TicketPercent className="size-4 text-muted-foreground" />
                            <span>{voucher.name}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>{voucher.code || "Auto applied"}</span>
                            <span>•</span>
                            <span>{getVoucherTypeLabel(voucher.type)}</span>
                          </div>
                        </div>
                      </TableCell>
                      {columnVisibility.mode ? (
                        <TableCell>
                          <Badge variant="secondary">
                            {getVoucherModeLabel(voucher.mode)}
                          </Badge>
                        </TableCell>
                      ) : null}
                      {columnVisibility.discount ? (
                        <TableCell>
                          <div className="font-medium">
                            {formatVoucherDiscount(voucher)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {voucher.applicability === "all"
                              ? "All menu"
                              : voucher.applicability === "categories"
                                ? `${voucher.categoryIds.length} categories`
                                : `${voucher.itemIds.length} items`}
                          </div>
                        </TableCell>
                      ) : null}
                      {columnVisibility.minimumOrder ? (
                        <TableCell>{formatMoney(voucher.minimumOrderAmount)}</TableCell>
                      ) : null}
                      {columnVisibility.usage ? (
                        <TableCell>
                          <div className="font-medium">
                            {voucher.analytics.totalUses}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {voucher.analytics.uniqueUsers} unique users
                          </div>
                        </TableCell>
                      ) : null}
                      {columnVisibility.revenue ? (
                        <TableCell>
                          <div className="font-medium">
                            {formatMoney(voucher.analytics.revenueGenerated)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Owner cost {formatMoney(voucher.analytics.totalDiscountGiven)}
                          </div>
                        </TableCell>
                      ) : null}
                      {columnVisibility.lifecycle ? (
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Switch
                              checked={voucher.status === "Active"}
                              onCheckedChange={(checked) =>
                                handleToggleStatus(voucher.id, checked)
                              }
                              aria-label={`Toggle ${voucher.name} status`}
                              disabled={pendingVoucherAction?.type === "status" && pendingVoucherAction.id === voucher.id}
                            />
                            {pendingVoucherAction?.type === "status" && pendingVoucherAction.id === voucher.id ? (
                              <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
                            ) : null}
                            <Badge
                              variant="outline"
                              className={getLifecycleBadgeClass(lifecycleStatus)}
                            >
                              {lifecycleStatus}
                            </Badge>
                          </div>
                        </TableCell>
                      ) : null}
                      {columnVisibility.dateRange ? (
                        <TableCell>
                          <div className="text-sm">
                            {format(new Date(voucher.startsAt), "dd MMM")}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            until {format(new Date(voucher.endsAt), "dd MMM yyyy")}
                          </div>
                        </TableCell>
                      ) : null}
                      <TableCell className="pr-4 text-right lg:pr-6">
                        <VoucherActions
                          voucher={voucher}
                          onView={setViewingVoucher}
                          onEdit={setEditingVoucher}
                          onDelete={handleDelete}
                          isDeleting={pendingVoucherAction?.type === "delete" && pendingVoucherAction.id === voucher.id}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={9} className="p-8">
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Search className="size-4" />
                        </EmptyMedia>
                        <EmptyTitle>No matching vouchers</EmptyTitle>
                        <EmptyDescription>
                          Try adjusting your filters or create a new voucher.
                        </EmptyDescription>
                      </EmptyHeader>
                      <EmptyContent>
                        <Button onClick={() => setIsAddOpen(true)}>
                          <Plus className="size-4" />
                          Add Voucher
                        </Button>
                      </EmptyContent>
                    </Empty>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-col gap-4 border-t px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="text-sm text-muted-foreground">
            {selectedIds.length} of {totalRows} row(s) selected
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select
              value={`${pageSize}`}
              onValueChange={(value) => setPageSize(Number(value))}
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
              Page {safePageIndex + 1} of {pageCount}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() =>
                  setPageIndex((current) => Math.max(0, current - 1))
                }
                disabled={safePageIndex === 0}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() =>
                  setPageIndex((current) =>
                    Math.min(pageCount - 1, current + 1)
                  )
                }
                disabled={safePageIndex >= pageCount - 1}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={isBulkDeleteOpen} onOpenChange={setIsBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive">
              <Trash2 className="size-4" />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete selected vouchers?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to delete <strong>{selectedIds.length}</strong>{" "}
              selected vouchers with{" "}
              <strong>{formatMoney(selectedDiscountTotal)}</strong> in tracked
              discount cost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => handleBulkAction("delete")}
              disabled={pendingVoucherAction?.type === "bulk"}
            >
              {pendingVoucherAction?.type === "bulk" ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
