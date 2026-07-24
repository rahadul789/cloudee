import * as React from "react"
import {
  closestCenter,
  DndContext,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core"
import { restrictToVerticalAxis } from "@dnd-kit/modifiers"
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { format } from "date-fns"
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Eye,
  EyeOff,
  FolderOpen,
  GripVertical,
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
import {
  type Category,
  type CategoryStatus,
} from "@/components/categories/types"
import { CategoryDetailsDrawer } from "@/components/categories/category-details-drawer"
import { CategoryEditDrawer } from "@/components/categories/category-edit-drawer"
import { useCategories } from "@/components/categories/categories-context"
import { useMenuItems } from "@/components/menu/menu-items-context"
import {
  useCreateOwnerCategoryMutation,
  useDeleteOwnerCategoryMutation,
  useOwnerCategoriesQuery,
  usePublicPlatformContentQuery,
  useUpdateOwnerCategoryMutation,
} from "@/hooks/use-owner-api"
import {
  mapOwnerCategory,
  type OwnerCategoryResponse,
  type OwnerListResponse,
} from "@/lib/backend-mappers"
import {
  clampCatalogDescription,
  resolveCatalogDescriptionLimits,
} from "@/lib/catalog-description-limits"
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
  | "displayOrder"
  | "nameAsc"
  | "nameDesc"
  | "newestUpdated"
  | "oldestCreated"
  | "mostItems"

const pageSizeOptions = [5, 10, 20, 30]

function formatDate(date: string) {
  return format(new Date(date), "dd MMM yyyy")
}

function getStatusBadge(status: CategoryStatus) {
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
        Hidden
      </Badge>
    )
  }

  return null
}

function CategoriesTableSkeleton() {
  return (
    <div className="space-y-4 px-4 lg:px-6">
      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <Skeleton className="h-10 w-full sm:max-w-72" />
          <Skeleton className="h-10 w-full sm:w-40" />
          <Skeleton className="h-10 w-full sm:w-44" />
          <Skeleton className="h-10 w-10" />
        </div>
        <Skeleton className="h-10 w-full sm:w-36" />
      </div>
      <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-11 w-full" />
        ))}
      </div>
    </div>
  )
}

function DragHandle({ id }: { id: string }) {
  const { attributes, listeners } = useSortable({ id })

  return (
    <Button
      {...attributes}
      {...listeners}
      variant="ghost"
      size="icon"
      className="size-8 text-muted-foreground hover:bg-transparent"
    >
      <GripVertical className="size-4" />
      <span className="sr-only">Drag to reorder</span>
    </Button>
  )
}

function CategoryActions({
  category,
  onView,
  onEdit,
  onDelete,
  isDeleting = false,
}: {
  category: Category
  onView: (category: Category) => void
  onEdit: (category: Category) => void
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
          <DropdownMenuItem onClick={() => onView(category)}>
            <Eye className="size-4" />
            View
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onEdit(category)}>
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
            <AlertDialogTitle>Delete category?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{category.name}</strong> from
              your categories list.{" "}
              {category.totalItems > 0
                ? `${category.totalItems} item${category.totalItems === 1 ? "" : "s"} are currently assigned to this category.`
                : "No menu items are currently assigned to this category."}{" "}
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => onDelete(category.id)}
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

function DraggableCategoryRow({
  row,
  isSelected,
  onToggleRow,
  onView,
  onEdit,
  onDelete,
  columnVisibility,
  isDeleting = false,
}: {
  row: Category
  isSelected: boolean
  onToggleRow: (id: string, checked: boolean) => void
  onView: (category: Category) => void
  onEdit: (category: Category) => void
  onDelete: (id: string) => void
  columnVisibility: {
    slug: boolean
    totalItems: boolean
    displayOrder: boolean
    status: boolean
    createdAt: boolean
    updatedAt: boolean
  }
  isDeleting?: boolean
}) {
  const { transform, transition, setNodeRef, isDragging } = useSortable({
    id: row.id,
  })

  return (
    <TableRow
      ref={setNodeRef}
      data-state={isSelected && "selected"}
      data-dragging={isDragging}
      className="relative data-[dragging=true]:z-10 data-[dragging=true]:opacity-90"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <TableCell>
        <DragHandle id={row.id} />
      </TableCell>
      <TableCell>
        <Checkbox
          checked={isSelected}
          onCheckedChange={(value) => onToggleRow(row.id, !!value)}
          aria-label="Select row"
        />
      </TableCell>
      <TableCell className="w-[18rem] max-w-[18rem]">
        <div className="min-w-0 max-w-[16rem]">
          <div className="truncate font-medium">{row.name}</div>
          <div
            className="truncate text-xs text-muted-foreground"
            title={row.description || row.slug}
          >
            {row.description || row.slug}
          </div>
        </div>
      </TableCell>
      {columnVisibility.slug ? (
        <TableCell>
          <span className="font-mono text-xs text-muted-foreground">
            {row.slug}
          </span>
        </TableCell>
      ) : null}
      {columnVisibility.totalItems ? (
        <TableCell>{row.totalItems}</TableCell>
      ) : null}
      {columnVisibility.displayOrder ? (
        <TableCell>
          <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">
            #{row.displayOrder}
          </span>
        </TableCell>
      ) : null}
      {columnVisibility.status ? (
        <TableCell>{getStatusBadge(row.status)}</TableCell>
      ) : null}
      {columnVisibility.createdAt ? (
        <TableCell>{formatDate(row.createdAt)}</TableCell>
      ) : null}
      {columnVisibility.updatedAt ? (
        <TableCell>{formatDate(row.updatedAt)}</TableCell>
      ) : null}
      <TableCell className="pr-4 text-right lg:pr-6">
        <CategoryActions
          category={row}
          onView={onView}
          onEdit={onEdit}
          onDelete={onDelete}
          isDeleting={isDeleting}
        />
      </TableCell>
    </TableRow>
  )
}

export function CategoriesPage() {
  const queryClient = useQueryClient()
  const { categories: data, setCategories: setData } = useCategories()
  const { items: menuItems } = useMenuItems()
  const ownerAccount = useAppStore((state) => state.ownerAccount)
  const createCategoryMutation = useCreateOwnerCategoryMutation()
  const updateCategoryMutation = useUpdateOwnerCategoryMutation()
  const deleteCategoryMutation = useDeleteOwnerCategoryMutation()
  const isFetchingCategories = useIsFetching({
    queryKey: ["owner", "categories"],
  })
  const [isAddCategoryOpen, setIsAddCategoryOpen] = React.useState(false)
  const [viewingCategory, setViewingCategory] = React.useState<Category | null>(
    null
  )
  const [editingCategory, setEditingCategory] = React.useState<Category | null>(
    null
  )
  const [search, setSearch] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<
    "all" | CategoryStatus
  >("all")
  const [sortBy, setSortBy] = React.useState<SortKey>("displayOrder")
  const [pageSize, setPageSize] = React.useState(10)
  const [pageIndex, setPageIndex] = React.useState(0)
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = React.useState(false)
  const [pendingCategoryAction, setPendingCategoryAction] = React.useState<{
    type: "submit" | "delete" | "bulk"
    id?: string
  } | null>(null)
  const debouncedSearch = useDebouncedValue(search)
  const [columnVisibility, setColumnVisibility] = React.useState({
    slug: true,
    totalItems: true,
    displayOrder: true,
    status: true,
    createdAt: true,
    updatedAt: true,
  })

  const categoriesQuery = useOwnerCategoriesQuery(ownerAccount.isAuthenticated, {
    search: debouncedSearch.trim() || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    sortBy,
    page: pageIndex + 1,
    pageSize,
  })
  const platformContentQuery = usePublicPlatformContentQuery(
    ownerAccount.isAuthenticated
  )
  const descriptionLimits = React.useMemo(
    () => resolveCatalogDescriptionLimits(platformContentQuery.data),
    [platformContentQuery.data]
  )

  const sensors = useSensors(useSensor(MouseSensor), useSensor(TouchSensor))
  const filteredAndSorted = React.useMemo(() => {
    if (!categoriesQuery.data) return data
    return (
      categoriesQuery.data as OwnerListResponse<OwnerCategoryResponse>
    ).items.map(mapOwnerCategory)
  }, [categoriesQuery.data, data])

  const totalRows =
    (categoriesQuery.data as OwnerListResponse<OwnerCategoryResponse> | undefined)
      ?.total ?? filteredAndSorted.length
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize))
  const safePageIndex = Math.min(pageIndex, pageCount - 1)
  const selectedItemsCount = React.useMemo(
    () =>
      data
        .filter((item) => selectedIds.includes(item.id))
        .reduce((total, item) => total + item.totalItems, 0),
    [data, selectedIds]
  )

  const paginatedRows = filteredAndSorted

  const paginatedRowIds = React.useMemo<UniqueIdentifier[]>(
    () => paginatedRows.map((row) => row.id),
    [paginatedRows]
  )

  React.useEffect(() => {
    setPageIndex(0)
  }, [debouncedSearch, statusFilter, sortBy, pageSize])

  React.useEffect(() => {
    setData((current) => {
      let changed = false

      const nextCategories = current.map((category) => {
        const totalItems = menuItems.filter(
          (item) => item.categoryId === category.id
        ).length

        if (category.totalItems !== totalItems) {
          changed = true
          return {
            ...category,
            totalItems,
          }
        }

        return category
      })

      return changed ? nextCategories : current
    })
  }, [menuItems, setData])

  function resequenceDisplayOrder(next: Category[]) {
    return next.map((item, index) => ({
      ...item,
      displayOrder: index + 1,
    }))
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event

    if (!active || !over || active.id === over.id) {
      return
    }

    setData((current) => {
      const oldIndex = current.findIndex((item) => item.id === active.id)
      const newIndex = current.findIndex((item) => item.id === over.id)

      if (oldIndex < 0 || newIndex < 0) {
        return current
      }

      const reordered = resequenceDisplayOrder(arrayMove(current, oldIndex, newIndex))
      const changed = reordered.filter(
        (item, index) => current[index]?.id !== item.id || current[index]?.displayOrder !== item.displayOrder
      )

      changed.forEach((category) => {
        updateCategoryMutation.mutate(
          {
            id: category.id,
            displayOrder: category.displayOrder,
          },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: ["owner", "categories"] })
            },
            onError: (error) => {
              toast.error("Unable to update display order", {
                description: error instanceof Error ? error.message : "Please try again.",
              })
            },
          }
        )
      })

      return reordered
    })
  }

  function handleResetFilters() {
    setSearch("")
    setStatusFilter("all")
    setSortBy("displayOrder")
  }

  function refreshCategoryData() {
    queryClient.invalidateQueries({ queryKey: ["owner", "categories"] })
    queryClient.invalidateQueries({ queryKey: ["owner", "menu-items"] })
    queryClient.invalidateQueries({ queryKey: ["owner", "sidebar-summary"] })
  }

  function handleDelete(id: string) {
    setPendingCategoryAction({ type: "delete", id })
    deleteCategoryMutation.mutate(id, {
      onSuccess: () => {
        refreshCategoryData()
        setSelectedIds((current) => current.filter((item) => item !== id))
        toast.success("Category deleted.")
      },
      onError: (error) => {
        toast.error("Unable to delete category", {
          description: error instanceof Error ? error.message : "Please try again.",
        })
      },
      onSettled: () => setPendingCategoryAction(null),
    })
  }

  function handleBulkAction(action: "activate" | "hide" | "delete") {
    setPendingCategoryAction({ type: "bulk" })
    if (action === "delete") {
      selectedIds.forEach((id) => {
        deleteCategoryMutation.mutate(id, {
          onSuccess: refreshCategoryData,
          onError: (error) => {
            toast.error("Unable to delete category", {
              description:
                error instanceof Error ? error.message : "Please try again.",
            })
          },
        })
      })
    } else {
      selectedIds.forEach((id) => {
        updateCategoryMutation.mutate(
          {
            id,
            status: action === "activate" ? "active" : "archived",
          },
          {
            onSuccess: refreshCategoryData,
            onError: (error) => {
              toast.error("Unable to update category", {
                description:
                  error instanceof Error ? error.message : "Please try again.",
              })
            },
          }
        )
      })
    }

    setSelectedIds([])
    setPendingCategoryAction(null)
  }

  function handleCreateCategory({
    name,
    status,
    description,
  }: {
    name: string
    status: CategoryStatus
    description: string
  }) {
    setPendingCategoryAction({ type: "submit" })
    createCategoryMutation.mutate(
      {
        name,
        description: clampCatalogDescription(
          description,
          descriptionLimits.category
        ),
      },
      {
        onSuccess: (created) => {
          const createdCategory = mapOwnerCategory(created)
          setData((current) => {
            const withoutDuplicate = current.filter(
              (category) => category.id !== createdCategory.id
            )
            return resequenceDisplayOrder([...withoutDuplicate, createdCategory])
          })
          if (status === "Hidden") {
            updateCategoryMutation.mutate(
              {
                id: created._id,
                status: "archived",
              },
              {
                onSuccess: refreshCategoryData,
              }
            )
          } else {
            refreshCategoryData()
          }
          toast.success("Category created.")
        },
        onError: (error) => {
          toast.error("Unable to create category", {
            description: error instanceof Error ? error.message : "Please try again.",
          })
        },
        onSettled: () => setPendingCategoryAction(null),
      }
    )
  }

  function handleEditCategory({
    id,
    name,
    status,
    description,
  }: {
    id: string
    name: string
    status: CategoryStatus
    description: string
  }) {
    setPendingCategoryAction({ type: "submit", id })
    updateCategoryMutation.mutate(
      {
        id,
        name,
        description: clampCatalogDescription(
          description,
          descriptionLimits.category
        ),
        status: status === "Active" ? "active" : "archived",
      },
      {
        onSuccess: () => {
          refreshCategoryData()
          toast.success("Category updated.")
        },
        onError: (error) => {
          toast.error("Unable to update category", {
            description: error instanceof Error ? error.message : "Please try again.",
          })
        },
        onSettled: () => setPendingCategoryAction(null),
      }
    )
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

  if (isFetchingCategories > 0 && !categoriesQuery.data) {
    return <CategoriesTableSkeleton />
  }

  return (
    <div className="space-y-4 px-4 lg:px-6">
      <CategoryEditDrawer
        open={isAddCategoryOpen}
        onOpenChange={setIsAddCategoryOpen}
        category={null}
        existingSlugs={data.map((item) => item.slug)}
        descriptionMaxLength={descriptionLimits.category}
        onSubmitCategory={handleCreateCategory}
        isSubmitting={pendingCategoryAction?.type === "submit" && !pendingCategoryAction.id}
      />
      <CategoryEditDrawer
        open={!!editingCategory}
        onOpenChange={(open) => {
          if (!open) {
            setEditingCategory(null)
          }
        }}
        category={editingCategory}
        existingSlugs={data
          .filter((item) => item.id !== editingCategory?.id)
          .map((item) => item.slug)}
        descriptionMaxLength={descriptionLimits.category}
        onSubmitCategory={(payload) => {
          if (!editingCategory) return
          handleEditCategory({
            id: editingCategory.id,
            ...payload,
          })
        }}
        isSubmitting={pendingCategoryAction?.type === "submit" && pendingCategoryAction.id === editingCategory?.id}
      />
      <CategoryDetailsDrawer
        open={!!viewingCategory}
        onOpenChange={(open) => {
          if (!open) {
            setViewingCategory(null)
          }
        }}
        category={viewingCategory}
        onEdit={(category) => {
          setViewingCategory(null)
          setEditingCategory(category)
        }}
      />

      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 flex-col gap-3 lg:flex-row">
            <div className="relative w-full lg:max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search category name"
                className="pl-9"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(value) =>
                setStatusFilter(value as "all" | CategoryStatus)
              }
            >
              <SelectTrigger className="w-full lg:w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Hidden">Hidden</SelectItem>
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
                <SelectItem value="displayOrder">Display Order</SelectItem>
                <SelectItem value="nameAsc">Name A-Z</SelectItem>
                <SelectItem value="nameDesc">Name Z-A</SelectItem>
                <SelectItem value="newestUpdated">Newest Updated</SelectItem>
                <SelectItem value="oldestCreated">Oldest Created</SelectItem>
                <SelectItem value="mostItems">Most Items</SelectItem>
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
                !search && statusFilter === "all" && sortBy === "displayOrder"
              }
            >
              <RotateCcw className="size-4" />
              Reset
            </Button>
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button onClick={() => setIsAddCategoryOpen(true)}>
              <Plus className="size-4" />
              Add Category
            </Button>
          </div>
        </div>

        <div className="mt-4 text-sm text-muted-foreground">
          {totalRows} categories
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
                disabled={pendingCategoryAction?.type === "bulk"}
              >
                <CheckCircle2 className="size-4" />
                Activate
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkAction("hide")}
                disabled={pendingCategoryAction?.type === "bulk"}
              >
                <EyeOff className="size-4" />
                Hide
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setIsBulkDeleteOpen(true)}
                disabled={pendingCategoryAction?.type === "bulk"}
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <DndContext
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
          sensors={sensors}
        >
          <div className="overflow-x-auto">
            <Table className="min-w-[860px]">
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow className="hover:bg-transparent">
                <TableHead />
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
                <TableHead>Category Name</TableHead>
                {columnVisibility.slug ? <TableHead>Slug</TableHead> : null}
                {columnVisibility.totalItems ? (
                  <TableHead>Total Items</TableHead>
                ) : null}
                {columnVisibility.displayOrder ? (
                  <TableHead>Display Order</TableHead>
                ) : null}
                {columnVisibility.status ? <TableHead>Status</TableHead> : null}
                {columnVisibility.createdAt ? (
                  <TableHead>Created At</TableHead>
                ) : null}
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
                <SortableContext
                  items={paginatedRowIds}
                  strategy={verticalListSortingStrategy}
                >
                  {paginatedRows.map((row) => (
                    <DraggableCategoryRow
                      key={row.id}
                      row={row}
                      isSelected={selectedIds.includes(row.id)}
                      onToggleRow={toggleRow}
                      onView={setViewingCategory}
                      onEdit={setEditingCategory}
                      onDelete={handleDelete}
                      columnVisibility={columnVisibility}
                      isDeleting={pendingCategoryAction?.type === "delete" && pendingCategoryAction.id === row.id}
                    />
                  ))}
                </SortableContext>
              ) : totalRows === 0 && data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="p-8">
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <FolderOpen className="size-4" />
                        </EmptyMedia>
                        <EmptyTitle>No categories yet</EmptyTitle>
                        <EmptyDescription>
                          Start organizing your menu by creating the first
                          category.
                        </EmptyDescription>
                      </EmptyHeader>
                      <EmptyContent>
                        <Button onClick={() => setIsAddCategoryOpen(true)}>
                          <Plus className="size-4" />
                          Add Category
                        </Button>
                      </EmptyContent>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow>
                  <TableCell colSpan={10} className="p-8">
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Search className="size-4" />
                        </EmptyMedia>
                        <EmptyTitle>No matching categories</EmptyTitle>
                        <EmptyDescription>
                          Try adjusting your search, filters, or sorting
                          options.
                        </EmptyDescription>
                      </EmptyHeader>
                      <EmptyContent>
                        <Button variant="outline" onClick={handleResetFilters}>
                          Clear filters
                        </Button>
                      </EmptyContent>
                    </Empty>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            </Table>
          </div>
        </DndContext>

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
            <AlertDialogTitle>Delete selected categories?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to delete <strong>{selectedIds.length}</strong>{" "}
              selected categor{selectedIds.length === 1 ? "y" : "ies"} with{" "}
              <strong>{selectedItemsCount}</strong> assigned item
              {selectedItemsCount === 1 ? "" : "s"}. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => handleBulkAction("delete")}
              disabled={pendingCategoryAction?.type === "bulk"}
            >
              {pendingCategoryAction?.type === "bulk" ? (
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
