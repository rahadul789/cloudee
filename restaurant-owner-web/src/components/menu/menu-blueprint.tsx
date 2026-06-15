import { Layers3, ListChecks, RadioTower, ScanSearch } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const formSections = [
  {
    title: "Basic Info",
    description:
      "Item name, category, description, and status stay grouped together for quick setup.",
    points: ["Name", "Category", "Description", "Status"],
    icon: ScanSearch,
  },
  {
    title: "Pricing",
    description:
      "Use a single base price for simple items or switch to variant pricing when sizes differ.",
    points: ["Base price", "Has variants toggle", "Default variant"],
    icon: Layers3,
  },
  {
    title: "Variants",
    description:
      "Show only when enabled. Each variant holds its own price, making size-based selling straightforward.",
    points: ["Variant name", "Variant price", "Default option"],
    icon: RadioTower,
  },
  {
    title: "Add-on Groups",
    description:
      "Structured groups keep optional and required choices organized without confusing the owner.",
    points: [
      "Group title",
      "Single or multiple select",
      "Required or optional",
      "Option price",
    ],
    icon: ListChecks,
  },
] as const

export function MenuBlueprint() {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {formSections.map((section) => {
        const Icon = section.icon

        return (
          <Card key={section.title} className="rounded-2xl">
            <CardHeader className="pb-3">
              <div className="flex items-start gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl border bg-muted/40">
                  <Icon className="size-4" />
                </div>
                <div className="space-y-1">
                  <CardTitle className="text-base">{section.title}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {section.description}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {section.points.map((point) => (
                <div
                  key={point}
                  className="rounded-xl border bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
                >
                  {point}
                </div>
              ))}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
