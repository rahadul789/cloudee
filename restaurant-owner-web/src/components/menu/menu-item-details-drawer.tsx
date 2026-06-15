import { format } from "date-fns"
import { Flame, PencilLine, Ticket, X } from "lucide-react"

import {
  type MenuItem,
  getMenuDisplayPrice,
  getMenuItemKindLabel,
} from "@/components/menu/types"
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

function getStatusBadge(status: MenuItem["status"]) {
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
      Inactive
    </Badge>
  )
}

export function MenuItemDetailsDrawer({
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full max-w-none! p-0 sm:max-w-3xl! md:max-w-4xl!"
      >
        <SheetHeader className="sticky top-0 z-10 border-b bg-popover px-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SheetTitle className="flex items-center gap-2">
                <Ticket className="size-4 text-muted-foreground" />
                {item.name}
              </SheetTitle>
              <SheetDescription>Menu item details</SheetDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => onEdit(item)}>
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
            <div className="flex flex-col gap-4 lg:flex-row">
              <img
                src={item.imageUrl}
                alt={item.name}
                className="size-28 rounded-2xl border object-cover"
              />
              <div className="grid flex-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <Card className="rounded-2xl shadow-none">
                  <CardHeader>
                    <CardTitle className="text-base">Popularity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {item.isPopular ? (
                      <Badge className="gap-1 bg-orange-500 text-white hover:bg-orange-500">
                        <Flame className="size-3" />
                        Popular
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        Not marked popular
                      </span>
                    )}
                  </CardContent>
                </Card>

                <Card className="rounded-2xl shadow-none">
                  <CardHeader>
                    <CardTitle className="text-base">Category</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm font-medium">{item.categoryName}</p>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl shadow-none">
                  <CardHeader>
                    <CardTitle className="text-base">Price</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm font-medium">
                      {getMenuDisplayPrice(item)}
                    </p>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl shadow-none">
                  <CardHeader>
                    <CardTitle className="text-base">Type</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm font-medium">
                      {getMenuItemKindLabel(item.kind)}
                    </p>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl shadow-none">
                  <CardHeader>
                    <CardTitle className="text-base">Status</CardTitle>
                  </CardHeader>
                  <CardContent>{getStatusBadge(item.status)}</CardContent>
                </Card>

                <Card className="rounded-2xl shadow-none">
                  <CardHeader>
                    <CardTitle className="text-base">Updated At</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">
                      {format(new Date(item.updatedAt), "dd MMM yyyy")}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>

            <Card className="rounded-2xl shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Description</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="min-h-24 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  {item.description || "No description added."}
                </div>
              </CardContent>
            </Card>

            {item.variants.length > 0 ? (
              <Card className="rounded-2xl shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">Variants</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {item.variants.map((variant) => (
                    <div
                      key={variant.id}
                      className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2 text-sm"
                    >
                      <span>{variant.name}</span>
                      <span>{Math.round(variant.price).toLocaleString()}tk</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            {item.addOnGroups.length > 0 ? (
              <Card className="rounded-2xl shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">Add-on Groups</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {item.addOnGroups.map((group) => (
                    <div
                      key={group.id}
                      className="rounded-lg border bg-muted/20 p-3"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="font-medium">{group.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {group.selectionType === "single"
                            ? "Single select"
                            : "Multi select"}{" "}
                          | {group.required ? "Required" : "Optional"}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {group.options.map((option) => (
                          <div
                            key={option.id}
                            className="flex items-center justify-between text-sm"
                          >
                            <span>{option.name}</span>
                            <span>{Math.round(option.price).toLocaleString()}tk</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
