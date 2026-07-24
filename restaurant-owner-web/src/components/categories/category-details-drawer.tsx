import { format } from "date-fns"
import { FolderOpen, PencilLine, X } from "lucide-react"

import { type Category } from "@/components/categories/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

function getStatusBadge(status: Category["status"]) {
  if (status === "Active") {
    return (
      <Badge
        variant="outline"
        className="border-emerald-200 bg-emerald-50 text-emerald-700"
      >
        Active
      </Badge>
    )
  }

  return (
    <Badge
      variant="outline"
      className="border-slate-200 bg-slate-100 text-slate-700"
    >
      Hidden
    </Badge>
  )
}

function formatDateValue(date: string) {
  return format(new Date(date), "dd MMM yyyy")
}

export function CategoryDetailsDrawer({
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full max-w-none! p-0 sm:max-w-2xl! md:max-w-3xl!"
      >
        <SheetHeader className="sticky top-0 z-10 border-b bg-popover px-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SheetTitle className="flex items-center gap-2">
                <FolderOpen className="size-4 text-muted-foreground" />
                {category.name}
              </SheetTitle>
              <SheetDescription>Category details</SheetDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => onEdit(category)}>
                <PencilLine className="size-4" />
                Edit
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
              >
                <X className="size-4" />
                <span className="sr-only">Close</span>
              </Button>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-88px)]">
          <div className="space-y-6 px-6 py-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="rounded-2xl shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">Slug</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="rounded-lg border bg-muted/40 px-3 py-2 font-mono text-sm text-muted-foreground">
                    {category.slug}
                  </p>
                </CardContent>
              </Card>

              <Card className="rounded-2xl shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">Status</CardTitle>
                </CardHeader>
                <CardContent>{getStatusBadge(category.status)}</CardContent>
              </Card>

              <Card className="rounded-2xl shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">Total Items</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm font-medium">{category.totalItems}</p>
                </CardContent>
              </Card>

              <Card className="rounded-2xl shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">Display Order</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm font-medium">#{category.displayOrder}</p>
                </CardContent>
              </Card>

              <Card className="rounded-2xl shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">Created At</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{formatDateValue(category.createdAt)}</p>
                </CardContent>
              </Card>

              <Card className="rounded-2xl shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">Updated At</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{formatDateValue(category.updatedAt)}</p>
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-2xl shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Description</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="min-h-24 whitespace-pre-wrap break-words rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  {category.description || "No description added yet."}
                </div>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
