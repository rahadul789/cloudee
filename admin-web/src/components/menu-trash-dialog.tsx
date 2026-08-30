import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { formatDistanceToNow } from "date-fns"
import { FolderClosed, Loader2, RotateCcw, Store, Trash2, UtensilsCrossed } from "lucide-react"
import { toast } from "sonner"

import {
  listAdminDeletedMenu,
  restoreAdminDeletedCategory,
  restoreAdminDeletedMenuItem,
} from "@/lib/admin-api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

function formatDeletedAt(value: string | null) {
  if (!value) return "recently"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "recently"
  return `${formatDistanceToNow(date)} ago`
}

export function AdminMenuTrashDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [pendingId, setPendingId] = useState<string | null>(null)

  const trashQuery = useQuery({
    queryKey: ["admin", "menu-trash"],
    queryFn: () => listAdminDeletedMenu(),
    enabled: open,
  })

  const categories = trashQuery.data?.categories ?? []
  const items = trashQuery.data?.items ?? []
  const isEmpty = !trashQuery.isLoading && categories.length === 0 && items.length === 0

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["admin", "menu-trash"] })
    queryClient.invalidateQueries({ queryKey: ["admin-food-categories"] })
    queryClient.invalidateQueries({ queryKey: ["admin-food-category"] })
  }

  const restoreCategoryMutation = useMutation({
    mutationFn: (categoryId: string) => restoreAdminDeletedCategory(categoryId),
    onMutate: (categoryId: string) => setPendingId(categoryId),
    onSuccess: () => {
      invalidate()
      toast.success("Category restored")
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to restore category")
    },
    onSettled: () => setPendingId(null),
  })

  const restoreItemMutation = useMutation({
    mutationFn: (itemId: string) => restoreAdminDeletedMenuItem(itemId),
    onMutate: (itemId: string) => setPendingId(itemId),
    onSuccess: () => {
      invalidate()
      toast.success("Item restored")
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to restore item")
    },
    onSettled: () => setPendingId(null),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="size-5 text-muted-foreground" />
            Recently deleted menu
          </DialogTitle>
          <DialogDescription>
            Categories and items owners removed. Restore anything deleted by
            mistake — entries are cleared automatically after 30 days.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[62vh] space-y-6 overflow-y-auto px-6 py-4">
          {trashQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading trash…
            </div>
          ) : null}

          {isEmpty ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Trash2 className="size-5" />
              </div>
              <div className="text-sm font-medium">Nothing in the trash</div>
              <p className="max-w-sm text-sm text-muted-foreground">
                Deleted categories and menu items in your area scope will appear
                here.
              </p>
            </div>
          ) : null}

          {categories.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Categories
              </div>
              {categories.map((category) => (
                <div
                  key={category.id}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <FolderClosed className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{category.name}</div>
                      <div className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <Store className="size-3" />
                        <span className="truncate">{category.restaurantName}</span>
                        <span>·</span>
                        <span>
                          {category.itemCount} item{category.itemCount === 1 ? "" : "s"}
                        </span>
                        <span>·</span>
                        <span>deleted {formatDeletedAt(category.deletedAt)}</span>
                      </div>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pendingId === category.id}
                    onClick={() => restoreCategoryMutation.mutate(category.id)}
                  >
                    {pendingId === category.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RotateCcw className="size-4" />
                    )}
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          {items.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Menu items
              </div>
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="size-10 shrink-0 rounded-md border object-cover"
                      />
                    ) : (
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <UtensilsCrossed className="size-5" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{item.name}</span>
                        {item.categoryDeleted ? (
                          <Badge variant="outline" className="shrink-0 border-amber-300 bg-amber-50 text-amber-700">
                            Category deleted
                          </Badge>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <Store className="size-3" />
                        <span className="truncate">{item.restaurantName}</span>
                        <span>·</span>
                        <span>৳{item.basePrice}</span>
                        <span>·</span>
                        <span>deleted {formatDeletedAt(item.deletedAt)}</span>
                      </div>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pendingId === item.id}
                    title={
                      item.categoryDeleted
                        ? "Restoring this item also restores its deleted category"
                        : undefined
                    }
                    onClick={() => restoreItemMutation.mutate(item.id)}
                  >
                    {pendingId === item.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RotateCcw className="size-4" />
                    )}
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
