import * as React from "react"

import { format } from "date-fns"
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Eye,
  EyeOff,
  Flame,
  LoaderCircle,
  MoreHorizontal,
  PencilLine,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react"
import { useIsFetching, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useDebouncedValue } from "@/hooks/use-debounced-value"

import { useCategories } from "@/components/categories/categories-context"
import {
  MenuItemDrawer,
  type MenuItemSubmitPayload,
} from "@/components/menu/menu-item-drawer"
import { MenuItemDetailsDrawer } from "@/components/menu/menu-item-details-drawer"
import { MenuTrashDialog } from "@/components/menu/menu-trash-dialog"
import { useMenuItems } from "@/components/menu/menu-items-context"
import {
  type MenuItem,
  type MenuItemKind,
  type MenuItemStatus,
  getMenuDisplayPrice,
  getMenuItemKindLabel,
} from "@/components/menu/types"
import {
  useCreateOwnerMenuItemMutation,
  useDeleteOwnerMenuItemMutation,
  useOwnerMenuApprovalRequestsQuery,
  useOwnerMenuItemsQuery,
  usePublicPlatformContentQuery,
  useUpdateOwnerMenuItemMutation,
} from "@/hooks/use-owner-api"
import {
  mapOwnerMenuItem,
  type OwnerListResponse,
  type OwnerMenuApprovalSummary,
  type OwnerMenuItemResponse,
} from "@/lib/backend-mappers"
import {
  clampCatalogDescription,
  resolveCatalogDescriptionLimits,
} from "@/lib/catalog-description-limits"
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
import { useAppStore } from "@/store/app-store"

type SortKey =
  | "nameAsc"
  | "nameDesc"
  | "newestUpdated"
  | "priceHigh"
  | "priceLow"
type PopularFilter = "all" | "popular" | "regular"

const pageSizeOptions = [5, 10, 20, 30]

function normalizeId(value: unknown) {
  if (typeof value === "string") return value
  if (value && typeof value === "object" && "_id" in value) {
    return String((value as { _id?: unknown })._id ?? "")
  }
  return value == null ? "" : String(value)
}

function getStatusBadge(status: MenuItemStatus) {
  if (status === "Active") {
    return (
      <Badge
        variant="outline"
        className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-400"
      >
        Active
      </Badge>
    )
  }

  if (status === "Hidden") {
    return (
      <Badge
        variant="outline"
        className="border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
      >
        Inactive
      </Badge>
    )
  }

  return null
}

function getKindBadge(kind: MenuItemKind) {
  return (
    <Badge variant="secondary" className="rounded-full px-2.5 py-0.5">
      {getMenuItemKindLabel(kind)}
    </Badge>
  )
}

function MenuTableSkeleton() {
  return (
    <div className="space-y-4 px-4 lg:px-6">
      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <Skeleton className="h-10 w-full sm:max-w-72" />
          <Skeleton className="h-10 w-full sm:w-40" />
          <Skeleton className="h-10 w-full sm:w-44" />
          <Skeleton className="h-10 w-full sm:w-40" />
        </div>
        <Skeleton className="h-10 w-full sm:w-32" />
      </div>
      <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-14 w-full" />
        ))}
      </div>
    </div>
  )
}

function isApprovalRequiredResponse(
  response: unknown
): response is {
  approvalRequired: true
  approvalRequest: OwnerMenuApprovalSummary
} {
  return Boolean(
    response &&
      typeof response === "object" &&
      "approvalRequired" in response &&
      (response as { approvalRequired?: unknown }).approvalRequired === true
  )
}

function getApprovalBadge(approval: MenuItem["approval"]) {
  if (!approval) return null
  if (approval.status === "pending") {
    return (
      <Badge variant="outline" className="shrink-0 border-amber-200 bg-amber-50 text-amber-700">
        Pending approval
      </Badge>
    )
  }
  if (approval.status === "rejected") {
    return (
      <Badge variant="destructive" className="shrink-0">
        Rejected
      </Badge>
    )
  }
  return null
}

function MenuApprovalPanel({
  approvals,
}: {
  approvals: OwnerMenuApprovalSummary[]
}) {
  if (!approvals.length) return null

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-amber-900">
            Admin approval waiting
          </div>
          <p className="text-sm text-amber-800/80">
            Price changes and new items go live only after admin approval.
          </p>
        </div>
        <Badge variant="outline" className="border-amber-300 bg-white text-amber-800">
          {approvals.length} request{approvals.length === 1 ? "" : "s"}
        </Badge>
      </div>
      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        {approvals.slice(0, 4).map((approval) => (
          <div key={approval.id} className="rounded-lg border bg-background px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {approval.proposedName || approval.currentName || "Menu item"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {approval.type === "new_item" ? "New item" : "Price update"} ·{" "}
                  {approval.priceDiffCount} price change
                  {approval.priceDiffCount === 1 ? "" : "s"}
                </div>
              </div>
              <Badge
                variant={approval.status === "rejected" ? "destructive" : "outline"}
                className={
                  approval.status === "pending"
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : ""
                }
              >
                {approval.status === "pending" ? "Pending" : "Rejected"}
              </Badge>
            </div>
            {approval.status === "rejected" && approval.ownerReason ? (
              <div className="mt-2 line-clamp-2 text-xs text-destructive">
                {approval.ownerReason}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

function MenuItemActions({
  item,
  onView,
  onEdit,
  onDelete,
  isDeleting = false,
}: {
  item: MenuItem
  onView: (item: MenuItem) => void
  onEdit: (item: MenuItem) => void
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
          <DropdownMenuItem onClick={() => onView(item)}>
            <Eye className="size-4" />
            View
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onEdit(item)}>
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
            <AlertDialogTitle>Delete menu item?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{item.name}</strong> will be removed from your menu and
              moved to <strong>Recently deleted</strong>, where you can restore
              it for the next 30 days.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => onDelete(item.id)}
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

function MenuRow({
  item,
  isSelected,
  onToggleRow,
  onToggleStatus,
  onView,
  onEdit,
  onDelete,
  columnVisibility,
  isStatusPending = false,
  isDeleting = false,
}: {
  item: MenuItem
  isSelected: boolean
  onToggleRow: (id: string, checked: boolean) => void
  onToggleStatus: (id: string, checked: boolean) => void
  onView: (item: MenuItem) => void
  onEdit: (item: MenuItem) => void
  onDelete: (id: string) => void
  columnVisibility: {
    category: boolean
    type: boolean
    price: boolean
    variants: boolean
    addOns: boolean
    status: boolean
    updatedAt: boolean
  }
  isStatusPending?: boolean
  isDeleting?: boolean
}) {
  return (
    <TableRow data-state={isSelected && "selected"}>
      <TableCell>
        <Checkbox
          checked={isSelected}
          onCheckedChange={(value) => onToggleRow(item.id, !!value)}
          aria-label="Select row"
        />
      </TableCell>
      <TableCell className="w-[18rem] max-w-[18rem]">
        <div className="flex min-w-0 max-w-[16rem] items-center gap-3">
          <img
            src={item.imageUrl}
            alt={item.name}
            className="size-12 shrink-0 rounded-xl border object-cover"
          />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <div className="truncate font-medium">{item.name}</div>
              {item.isPopular ? (
                <Badge className="h-5 shrink-0 gap-1 bg-orange-500 px-2 text-[10px] text-white hover:bg-orange-500">
                  <Flame className="size-3" />
                  Popular
                </Badge>
              ) : null}
              {getApprovalBadge(item.approval)}
            </div>
            <div
              className="truncate text-xs text-muted-foreground"
              title={item.description || item.slug}
            >
              {item.description || item.slug}
            </div>
          </div>
        </div>
      </TableCell>
      {columnVisibility.category ? (
        <TableCell className="max-w-[10rem]">
          <div className="truncate" title={item.categoryName}>
            {item.categoryName}
          </div>
        </TableCell>
      ) : null}
      {columnVisibility.type ? (
        <TableCell>{getKindBadge(item.kind)}</TableCell>
      ) : null}
      {columnVisibility.price ? (
        <TableCell>{getMenuDisplayPrice(item)}</TableCell>
      ) : null}
      {columnVisibility.variants ? (
        <TableCell>{item.variants.length}</TableCell>
      ) : null}
      {columnVisibility.addOns ? (
        <TableCell>{item.addOnGroups.length}</TableCell>
      ) : null}
      {columnVisibility.status ? (
        <TableCell>
          <div className="flex items-center gap-3">
            <Switch
              checked={item.status === "Active"}
              onCheckedChange={(checked) => onToggleStatus(item.id, checked)}
              aria-label={`Toggle ${item.name} status`}
              disabled={isStatusPending || isDeleting}
            />
            {getStatusBadge(item.status)}
            {isStatusPending ? (
              <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
            ) : null}
          </div>
        </TableCell>
      ) : null}
      {columnVisibility.updatedAt ? (
        <TableCell>{format(new Date(item.updatedAt), "dd MMM yyyy")}</TableCell>
      ) : null}
      <TableCell className="pr-4 text-right lg:pr-6">
        <MenuItemActions
          item={item}
          onView={onView}
          onEdit={onEdit}
          onDelete={onDelete}
          isDeleting={isDeleting}
        />
      </TableCell>
    </TableRow>
  )
}

export function MenuPage() {
  const queryClient = useQueryClient()
  const { items: data, setItems: setData } = useMenuItems()
  const { categories } = useCategories()
  const ownerAccount = useAppStore((state) => state.ownerAccount)
  const createMenuItemMutation = useCreateOwnerMenuItemMutation()
  const updateMenuItemMutation = useUpdateOwnerMenuItemMutation()
  const deleteMenuItemMutation = useDeleteOwnerMenuItemMutation()
  const menuApprovalsQuery = useOwnerMenuApprovalRequestsQuery(
    ownerAccount.isAuthenticated
  )
  const isFetchingMenuItems = useIsFetching({
    queryKey: ["owner", "menu-items"],
  })
  const [isAddOpen, setIsAddOpen] = React.useState(false)
  const [isTrashOpen, setIsTrashOpen] = React.useState(false)
  const [viewingItem, setViewingItem] = React.useState<MenuItem | null>(null)
  const [editingItem, setEditingItem] = React.useState<MenuItem | null>(null)
  const [search, setSearch] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<
    "all" | MenuItemStatus
  >("all")
  const [popularFilter, setPopularFilter] = React.useState<PopularFilter>("all")
  const [categoryFilter, setCategoryFilter] = React.useState<string>("all")
  const [sortBy, setSortBy] = React.useState<SortKey>("newestUpdated")
  const [pageSize, setPageSize] = React.useState(10)
  const [pageIndex, setPageIndex] = React.useState(0)
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = React.useState(false)
  const [pendingMenuAction, setPendingMenuAction] = React.useState<{
    type: "submit" | "status" | "delete" | "bulk"
    id?: string
  } | null>(null)
  const debouncedSearch = useDebouncedValue(search)
  const [columnVisibility, setColumnVisibility] = React.useState({
    category: true,
    type: true,
    price: true,
    variants: true,
    addOns: true,
    status: true,
    updatedAt: false,
  })

  const menuItemsQuery = useOwnerMenuItemsQuery(ownerAccount.isAuthenticated, {
    search: debouncedSearch.trim() || undefined,
    availability:
      statusFilter === "Active"
        ? "available"
        : statusFilter === "Hidden"
          ? "unavailable"
          : undefined,
    categoryId: categoryFilter !== "all" ? categoryFilter : undefined,
    popularFilter: popularFilter !== "all" ? popularFilter : undefined,
    sortBy,
    page: pageIndex + 1,
    pageSize,
  })
  const recommendationItemsQuery = useOwnerMenuItemsQuery(
    ownerAccount.isAuthenticated,
    {
      availability: "available",
      sortBy: "nameAsc",
      page: 1,
      pageSize: 100,
    }
  )
  const platformContentQuery = usePublicPlatformContentQuery(
    ownerAccount.isAuthenticated
  )
  const descriptionLimits = React.useMemo(
    () => resolveCatalogDescriptionLimits(platformContentQuery.data),
    [platformContentQuery.data]
  )

  React.useEffect(() => {
    setData((current) => {
      let changed = false

      const nextItems = current.map((item) => {
        const category = categories.find(
          (entry) => entry.id === item.categoryId
        )
        const nextCategoryName = category?.name ?? "Uncategorized"

        if (item.categoryName !== nextCategoryName) {
          changed = true
          return {
            ...item,
            categoryName: nextCategoryName,
          }
        }

        return item
      })

      return changed ? nextItems : current
    })
  }, [categories, setData])

  const existingSlugs = React.useMemo(
    () => data.map((item) => item.slug),
    [data]
  )

  const categoryOptions = React.useMemo(
    () =>
      categories.map((category) => ({
        id: category.id,
        name: category.name,
      })),
    [categories]
  )
  const categoryNameById = React.useMemo(() => {
    const result = new Map<string, string>()
    categories.forEach((category) => result.set(category.id, category.name))
    return result
  }, [categories])

  const withCategoryNames = React.useCallback(
    (items: MenuItem[]) =>
      items.map((item) => {
        const categoryId = normalizeId(item.categoryId)
        return {
          ...item,
          categoryId,
          categoryName:
            categoryNameById.get(categoryId) ||
            item.categoryName ||
            "Uncategorized",
        }
      }),
    [categoryNameById]
  )

  const filteredAndSorted = React.useMemo(() => {
    if (!menuItemsQuery.data) return withCategoryNames(data)
    const mapped = (
      menuItemsQuery.data as OwnerListResponse<OwnerMenuItemResponse>
    ).items.map(mapOwnerMenuItem)
    return withCategoryNames(mapped)
  }, [data, menuItemsQuery.data, withCategoryNames])

  const totalRows =
    (menuItemsQuery.data as OwnerListResponse<OwnerMenuItemResponse> | undefined)
      ?.total ?? filteredAndSorted.length
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize))
  const safePageIndex = Math.min(pageIndex, pageCount - 1)

  const paginatedRows = filteredAndSorted
  const recommendationSourceItems = React.useMemo(() => {
    if (recommendationItemsQuery.data) {
      const mapped = (
        recommendationItemsQuery.data as OwnerListResponse<OwnerMenuItemResponse>
      ).items.map(mapOwnerMenuItem)
      return withCategoryNames(mapped)
    }

    return withCategoryNames(data.filter((item) => item.status === "Active"))
  }, [data, recommendationItemsQuery.data, withCategoryNames])

  React.useEffect(() => {
    setPageIndex(0)
  }, [debouncedSearch, statusFilter, popularFilter, categoryFilter, sortBy, pageSize])

  const selectedVariantCount = React.useMemo(
    () =>
      data
        .filter((item) => selectedIds.includes(item.id))
        .reduce((total, item) => total + item.variants.length, 0),
    [data, selectedIds]
  )

  function buildMenuItemPayload(payload: MenuItemSubmitPayload) {
    const hasVariants = payload.hasVariants && payload.variants.length > 0
    const variantPrices = payload.variants.map((variant) => variant.price)
    const basePrice =
      hasVariants && variantPrices.length > 0
        ? Math.min(...variantPrices)
        : payload.basePrice ?? 0

    const variants = hasVariants
      ? [
          {
            name: "Variants",
            minSelect: 1,
            maxSelect: 1,
            options: payload.variants.map((variant) => ({
              label: variant.name,
              priceDelta: variant.price - basePrice,
            })),
          },
        ]
      : []

    const addOnGroups = payload.addOnGroups.map((group) => ({
      name: group.name,
      minSelect: group.required ? 1 : 0,
      maxSelect:
        group.selectionType === "single" ? 1 : Math.max(1, group.options.length),
      options: group.options.map((option) => ({
        label: option.name,
        price: option.price,
      })),
    }))

    return {
      categoryId: payload.categoryId,
      name: payload.name,
      description: clampCatalogDescription(
        payload.description,
        descriptionLimits.menuItem
      ),
      status: "active",
      availability: payload.status === "Active" ? "available" : "unavailable",
      kind: hasVariants ? "variant" : "simple",
      basePrice,
      variants,
      addOnGroups,
      isPopular: payload.isPopular,
      recommendedItemIds: payload.recommendedItemIds ?? [],
      images: payload.imageUrl ? [{ url: payload.imageUrl }] : [],
    }
  }

  function refreshMenuData() {
    queryClient.invalidateQueries({ queryKey: ["owner", "menu-items"] })
    queryClient.invalidateQueries({ queryKey: ["owner", "menu-approval-requests"] })
    queryClient.invalidateQueries({ queryKey: ["owner", "categories"] })
    queryClient.invalidateQueries({ queryKey: ["owner", "sidebar-summary"] })
  }

  function createOrUpdateItem(payload: MenuItemSubmitPayload, id?: string) {
    const apiPayload = buildMenuItemPayload(payload)
    setPendingMenuAction({ type: "submit", id })

    if (id) {
      updateMenuItemMutation.mutate(
        {
          id,
          ...apiPayload,
        },
        {
          onSuccess: (response) => {
            refreshMenuData()
            if (isApprovalRequiredResponse(response)) {
              toast.success("Price change sent for admin approval.", {
                description: "Current live price will stay unchanged until approval.",
              })
              return
            }
            toast.success("Menu item updated.")
          },
          onError: (error) => {
            toast.error("Unable to update item", {
              description:
                error instanceof Error ? error.message : "Please try again.",
            })
          },
          onSettled: () => setPendingMenuAction(null),
        }
      )
      return
    }

    createMenuItemMutation.mutate(apiPayload, {
      onSuccess: (response) => {
        refreshMenuData()
        if (isApprovalRequiredResponse(response)) {
          toast.success("Menu item sent for admin approval.", {
            description: "It will go live after approval.",
          })
          return
        }
        toast.success("Menu item created.")
      },
      onError: (error) => {
        toast.error("Unable to create item", {
          description:
            error instanceof Error ? error.message : "Please try again.",
        })
      },
      onSettled: () => setPendingMenuAction(null),
    })
  }

  function handleDelete(id: string) {
    setPendingMenuAction({ type: "delete", id })
    deleteMenuItemMutation.mutate(id, {
      onSuccess: () => {
        refreshMenuData()
        setSelectedIds((current) => current.filter((item) => item !== id))
        toast.success("Menu item deleted.")
      },
      onError: (error) => {
        toast.error("Unable to delete item", {
          description:
            error instanceof Error ? error.message : "Please try again.",
        })
      },
      onSettled: () => setPendingMenuAction(null),
    })
  }

  function handleToggleStatus(id: string, checked: boolean) {
    setPendingMenuAction({ type: "status", id })
    updateMenuItemMutation.mutate(
      {
        id,
        availability: checked ? "available" : "unavailable",
      },
      {
        onSuccess: refreshMenuData,
        onError: (error) => {
          toast.error("Unable to update item status", {
            description:
              error instanceof Error ? error.message : "Please try again.",
          })
        },
        onSettled: () => setPendingMenuAction(null),
      }
    )
  }

  function handleBulkAction(action: "activate" | "hide" | "delete") {
    setPendingMenuAction({ type: "bulk" })
    if (action === "delete") {
      selectedIds.forEach((id) => {
        deleteMenuItemMutation.mutate(id, {
          onSuccess: refreshMenuData,
          onError: (error) => {
            toast.error("Unable to delete item", {
              description:
                error instanceof Error ? error.message : "Please try again.",
            })
          },
        })
      })
    } else {
      selectedIds.forEach((id) => {
        updateMenuItemMutation.mutate(
          {
            id,
            availability: action === "activate" ? "available" : "unavailable",
          },
          {
            onSuccess: refreshMenuData,
            onError: (error) => {
              toast.error("Unable to update item status", {
                description:
                  error instanceof Error ? error.message : "Please try again.",
              })
            },
          }
        )
      })
    }

    setSelectedIds([])
    setPendingMenuAction(null)
  }

  function toggleRow(id: string, checked: boolean) {
    setSelectedIds((current) =>
      checked ? [...current, id] : current.filter((item) => item !== id)
    )
  }

  function togglePageSelection(checked: boolean) {
    if (checked) {
      const pageIds = paginatedRows.map((row) => row.id)
      setSelectedIds((current) => Array.from(new Set([...current, ...pageIds])))
      return
    }

    setSelectedIds((current) =>
      current.filter((id) => !paginatedRows.some((row) => row.id === id))
    )
  }

  function handleResetFilters() {
    setSearch("")
    setStatusFilter("all")
    setCategoryFilter("all")
    setPopularFilter("all")
    setSortBy("newestUpdated")
  }

  if (isFetchingMenuItems > 0 && !menuItemsQuery.data) {
    return <MenuTableSkeleton />
  }
  const activeMenuApprovals = menuApprovalsQuery.data?.items ?? []

  return (
    <div className="space-y-4 px-4 lg:px-6">
      <MenuItemDrawer
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        title="Add Item"
        description="Create a new menu item with pricing, variants, and add-ons."
        submitLabel="Create Item"
        categories={categoryOptions}
        recommendationOptions={recommendationSourceItems
          .filter((item) => item.status === "Active")
          .map((item) => ({
            id: item.id,
            name: item.name,
            categoryName:
              categoryOptions.find((category) => category.id === item.categoryId)
                ?.name ?? "",
          }))}
        existingSlugs={existingSlugs}
        descriptionMaxLength={descriptionLimits.menuItem}
        onSubmitItem={(payload) => createOrUpdateItem(payload)}
        isSubmitting={pendingMenuAction?.type === "submit" && !pendingMenuAction.id}
      />
      <MenuItemDrawer
        open={!!editingItem}
        onOpenChange={(open) => {
          if (!open) {
            setEditingItem(null)
          }
        }}
        title="Edit Item"
        description="Update menu details, variants, and add-ons."
        submitLabel="Save Changes"
        item={editingItem}
        categories={categoryOptions}
        recommendationOptions={recommendationSourceItems
          .filter(
            (item) => item.status === "Active" && item.id !== editingItem?.id
          )
          .map((item) => ({
            id: item.id,
            name: item.name,
            categoryName:
              categoryOptions.find((category) => category.id === item.categoryId)
                ?.name ?? "",
          }))}
        existingSlugs={data
          .filter((item) => item.id !== editingItem?.id)
          .map((item) => item.slug)}
        descriptionMaxLength={descriptionLimits.menuItem}
        onSubmitItem={(payload) => {
          if (!editingItem) return
          createOrUpdateItem(payload, editingItem.id)
        }}
        isSubmitting={pendingMenuAction?.type === "submit" && pendingMenuAction.id === editingItem?.id}
      />
      <MenuItemDetailsDrawer
        item={viewingItem}
        open={!!viewingItem}
        onOpenChange={(open) => {
          if (!open) {
            setViewingItem(null)
          }
        }}
        onEdit={(item) => {
          setViewingItem(null)
          setEditingItem(item)
        }}
      />

      <MenuTrashDialog open={isTrashOpen} onOpenChange={setIsTrashOpen} />

      <MenuApprovalPanel approvals={activeMenuApprovals} />

      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 flex-col gap-3 lg:flex-row">
            <div className="relative w-full lg:max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search menu item"
                className="pl-9"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(value) =>
                setStatusFilter(value as "all" | MenuItemStatus)
              }
            >
              <SelectTrigger className="w-full lg:w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Hidden">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full lg:w-44">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categoryOptions.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={popularFilter}
              onValueChange={(value) =>
                setPopularFilter(value as PopularFilter)
              }
            >
              <SelectTrigger className="w-full lg:w-40">
                <SelectValue placeholder="Popularity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Items</SelectItem>
                <SelectItem value="popular">Popular Only</SelectItem>
                <SelectItem value="regular">Regular Only</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={sortBy}
              onValueChange={(value) => setSortBy(value as SortKey)}
            >
              <SelectTrigger className="w-full lg:w-52">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newestUpdated">Newest Updated</SelectItem>
                <SelectItem value="nameAsc">Name A-Z</SelectItem>
                <SelectItem value="nameDesc">Name Z-A</SelectItem>
                <SelectItem value="priceHigh">Price High-Low</SelectItem>
                <SelectItem value="priceLow">Price Low-High</SelectItem>
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
              disabled={
                !search &&
                statusFilter === "all" &&
                categoryFilter === "all" &&
                popularFilter === "all" &&
                sortBy === "newestUpdated"
              }
            >
              <RotateCcw className="size-4" />
              Reset
            </Button>
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" onClick={() => setIsTrashOpen(true)}>
              <Trash2 className="size-4" />
              Recently deleted
            </Button>
            <Button onClick={() => setIsAddOpen(true)}>
              <Plus className="size-4" />
              Add Item
            </Button>
          </div>
        </div>

        <div className="mt-4 text-sm text-muted-foreground">
          {totalRows} items
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
                disabled={pendingMenuAction?.type === "bulk"}
              >
                <CheckCircle2 className="size-4" />
                Activate
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkAction("hide")}
                disabled={pendingMenuAction?.type === "bulk"}
              >
                <EyeOff className="size-4" />
                Hide
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setIsBulkDeleteOpen(true)}
                disabled={pendingMenuAction?.type === "bulk"}
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
          <Table className="min-w-[1080px]">
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow className="hover:bg-transparent">
                <TableHead>
                  <Checkbox
                    checked={
                      paginatedRows.length > 0 &&
                      paginatedRows.every((row) => selectedIds.includes(row.id))
                    }
                    onCheckedChange={(value) => togglePageSelection(!!value)}
                    aria-label="Select all rows"
                  />
                </TableHead>
                <TableHead>Item</TableHead>
                {columnVisibility.category ? (
                  <TableHead>Category</TableHead>
                ) : null}
                {columnVisibility.type ? <TableHead>Type</TableHead> : null}
                {columnVisibility.price ? <TableHead>Price</TableHead> : null}
                {columnVisibility.variants ? (
                  <TableHead>Variants</TableHead>
                ) : null}
                {columnVisibility.addOns ? (
                  <TableHead>Add-on Groups</TableHead>
                ) : null}
                {columnVisibility.status ? <TableHead>Status</TableHead> : null}
                {columnVisibility.updatedAt ? (
                  <TableHead>Updated At</TableHead>
                ) : null}
                <TableHead className="pr-4 text-right lg:pr-6">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedRows.length > 0 ? (
                paginatedRows.map((item) => (
                  <MenuRow
                    key={item.id}
                    item={item}
                    isSelected={selectedIds.includes(item.id)}
                    onToggleRow={toggleRow}
                    onToggleStatus={handleToggleStatus}
                    onView={setViewingItem}
                    onEdit={setEditingItem}
                    onDelete={handleDelete}
                    columnVisibility={columnVisibility}
                    isStatusPending={pendingMenuAction?.type === "status" && pendingMenuAction.id === item.id}
                    isDeleting={pendingMenuAction?.type === "delete" && pendingMenuAction.id === item.id}
                  />
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={10} className="p-8">
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Search className="size-4" />
                        </EmptyMedia>
                        <EmptyTitle>No matching items</EmptyTitle>
                        <EmptyDescription>
                          Try adjusting your search or filters, or create a new
                          menu item.
                        </EmptyDescription>
                      </EmptyHeader>
                      <EmptyContent>
                        <Button onClick={() => setIsAddOpen(true)}>
                          <Plus className="size-4" />
                          Add Item
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
            <AlertDialogTitle>Delete selected items?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to delete <strong>{selectedIds.length}</strong>{" "}
              selected item{selectedIds.length === 1 ? "" : "s"} with{" "}
              <strong>{selectedVariantCount}</strong> total variant
              {selectedVariantCount === 1 ? "" : "s"}. You can restore them from{" "}
              <strong>Recently deleted</strong> within 30 days.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => handleBulkAction("delete")}
              disabled={pendingMenuAction?.type === "bulk"}
            >
              {pendingMenuAction?.type === "bulk" ? (
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
