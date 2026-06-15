import { format } from "date-fns"

import { type Category } from "@/components/categories/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

function getStatusBadge(status: Category["status"]) {
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

function formatDate(date: string) {
  return format(new Date(date), "dd MMM yyyy")
}

export function ViewCategoryDialog({
  category,
  open,
  onOpenChange,
  onEdit,
}: {
  category: Category | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (category: Category) => void
}) {
  if (!category) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{category.name}</DialogTitle>
          <DialogDescription>Category details</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-sm font-medium">Slug</p>
              <p className="rounded-lg border bg-muted/40 px-3 py-2 font-mono text-sm text-muted-foreground">
                {category.slug}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium">Status</p>
              <div className="rounded-lg border bg-muted/40 px-3 py-2">
                {getStatusBadge(category.status)}
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium">Total Items</p>
              <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                {category.totalItems}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium">Display Order</p>
              <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                #{category.displayOrder}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium">Created At</p>
              <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                {formatDate(category.createdAt)}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium">Updated At</p>
              <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                {formatDate(category.updatedAt)}
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-sm font-medium">Description</p>
            <div className="min-h-24 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              {category.description || "No description added yet."}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onEdit(category)}
            >
              Edit
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
