import * as React from "react"

import { formatDistanceToNow } from "date-fns"
import { FolderClosed, LoaderCircle, RotateCcw, Trash2, UtensilsCrossed } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import {
  useOwnerDeletedMenuQuery,
  useRestoreOwnerCategoryMutation,
  useRestoreOwnerMenuItemMutation,
} from "@/hooks/use-owner-api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"

function formatDeletedAt(value: string | null) {
  if (!value) return "recently"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "recently"
  return `${formatDistanceToNow(date)} ago`
}

export function MenuTrashDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const trashQuery = useOwnerDeletedMenuQuery(open)
  const restoreCategoryMutation = useRestoreOwnerCategoryMutation()
  const restoreItemMutation = useRestoreOwnerMenuItemMutation()
  const [pendingId, setPendingId] = React.useState<string | null>(null)

  const categories = trashQuery.data?.categories ?? []
  const items = trashQuery.data?.items ?? []
  const isEmpty = !trashQuery.isLoading && categories.length === 0 && items.length === 0

  function refreshMenuData() {
    queryClient.invalidateQueries({ queryKey: ["owner", "menu-trash"] })
    queryClient.invalidateQueries({ queryKey: ["owner", "menu-items"] })
    queryClient.invalidateQueries({ queryKey: ["owner", "categories"] })
    queryClient.invalidateQueries({ queryKey: ["owner", "sidebar-summary"] })
  }

  function handleRestoreCategory(id: string) {
    setPendingId(id)
    restoreCategoryMutation.mutate(id, {
      onSuccess: () => {
        refreshMenuData()
        toast.success("Category restored.")
      },
      onError: (error) => {
        toast.error("Unable to restore category", {
          description: error instanceof Error ? error.message : "Please try again.",
        })
      },
      onSettled: () => setPendingId(null),
    })
  }

  function handleRestoreItem(id: string) {
    setPendingId(id)
    restoreItemMutation.mutate(id, {
      onSuccess: () => {
        refreshMenuData()
        toast.success("Item restored.")
      },
      onError: (error) => {
        toast.error("Unable to restore item", {
          description: error instanceof Error ? error.message : "Please try again.",
        })
      },
      onSettled: () => setPendingId(null),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="size-5 text-muted-foreground" />
            Recently deleted
          </DialogTitle>
          <DialogDescription>
            Restore a category or item you removed. Deleted entries are cleared
            automatically after 30 days.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-6 overflow-y-auto px-6 py-4">
          {trashQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-16 w-full" />
              ))}
            </div>
          ) : null}

          {isEmpty ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Trash2 className="size-5" />
              </div>
              <div className="text-sm font-medium">Trash is empty</div>
              <p className="max-w-sm text-sm text-muted-foreground">
                Deleted categories and menu items will appear here so you can
                restore them.
              </p>
            </div>
          ) : null}

          {categories.length > 0 ? (
            <div className="space-y-3">
              <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Categories
              </div>
              {categories.map((category) => (
                <div
                  key={category.id}
                  className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <FolderClosed className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{category.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {category.itemCount} item
                        {category.itemCount === 1 ? "" : "s"} · deleted{" "}
                        {formatDeletedAt(category.deletedAt)}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRestoreCategory(category.id)}
                    disabled={pendingId === category.id}
                  >
                    {pendingId === category.id ? (
                      <LoaderCircle className="size-4 animate-spin" />
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
            <div className="space-y-3">
              <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Menu items
              </div>
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.name}
                        className="size-10 shrink-0 rounded-lg border object-cover"
                      />
                    ) : (
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <UtensilsCrossed className="size-5" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{item.name}</span>
                        {item.categoryDeleted ? (
                          <Badge
                            variant="outline"
                            className="shrink-0 border-amber-200 bg-amber-50 text-amber-700"
                          >
                            Category deleted
                          </Badge>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        ৳{item.basePrice} · deleted {formatDeletedAt(item.deletedAt)}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRestoreItem(item.id)}
                    disabled={pendingId === item.id}
                    title={
                      item.categoryDeleted
                        ? "Restoring this item will also restore its category"
                        : undefined
                    }
                  >
                    {pendingId === item.id ? (
                      <LoaderCircle className="size-4 animate-spin" />
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
