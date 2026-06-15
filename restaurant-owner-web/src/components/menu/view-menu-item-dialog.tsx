import { format } from "date-fns"
import { Flame } from "lucide-react"

import { type MenuItem, getMenuDisplayPrice, getMenuItemKindLabel } from "@/components/menu/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

function getStatusBadge(status: MenuItem["status"]) {
  if (status === "Active") {
    return <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Active</Badge>
  }
  if (status === "Hidden") {
    return <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-700">Inactive</Badge>
  }
  return null
}

export function ViewMenuItemDialog({
  item,
  open,
  onOpenChange,
  onEdit,
}: {
  item: MenuItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (item: MenuItem) => void
}) {
  if (!item) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item.name}</DialogTitle>
          <DialogDescription>Menu item details</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <img src={item.imageUrl} alt={item.name} className="size-24 rounded-xl border object-cover" />
            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                {item.isPopular ? (
                  <Badge className="gap-1 bg-orange-500 text-white hover:bg-orange-500">
                    <Flame className="size-3" />
                    Popular
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">Not marked popular</span>
                )}
              </div>
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">{item.categoryName}</div>
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">{getMenuDisplayPrice(item)}</div>
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">{getMenuItemKindLabel(item.kind)}</div>
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">{getStatusBadge(item.status)}</div>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            {item.description || "No description added."}
          </div>

          {item.variants.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Variants</p>
              {item.variants.map((variant) => (
                <div key={variant.id} className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2 text-sm">
                  <span>{variant.name}</span>
                  <span>{Math.round(variant.price).toLocaleString()}tk</span>
                </div>
              ))}
            </div>
          ) : null}

          {item.addOnGroups.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">Add-on Groups</p>
              {item.addOnGroups.map((group) => (
                <div key={group.id} className="rounded-lg border bg-muted/20 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-medium">{group.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {group.selectionType === "single" ? "Single select" : "Multi select"} · {group.required ? "Required" : "Optional"}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {group.options.map((option) => (
                      <div key={option.id} className="flex items-center justify-between text-sm">
                        <span>{option.name}</span>
                        <span>{Math.round(option.price).toLocaleString()}tk</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Updated {format(new Date(item.updatedAt), "dd MMM yyyy")}</span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onEdit(item)}>
                Edit
              </Button>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
