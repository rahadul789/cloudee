import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { getAdminHypeLayout, saveAdminHypeLayout as saveLayout, type HypeLayout, type HypeVideoCategory } from "@/lib/admin-api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

const SECTION_INFO: Record<string, { label: string; hint: string }> = {
  featured: { label: "📌 Featured (pinned)", hint: "যেসব item-এ Featured চালু (সর্বোচ্চ ৩টা)" },
  quiz: { label: "🎮 Friend Quiz card", hint: "চালু থাকলে দেখাবে (Friend Quiz পাতা)" },
  stamps: { label: "🎟️ Stamp card / rewards", hint: "Sign-in করা user-দের stamp progress" },
  videos: { label: "▶️ Watch & crave (Videos)", hint: "ভিডিও rail" },
  drops: { label: "⚡ Drops", hint: "Flash deal card" },
  polls: { label: "📊 Netrakona votes (Polls)", hint: "ভোট" },
  events: { label: "📅 Happening in Netrakona (Events)", hint: "Event তালিকা, like/dislike সহ" },
}
const DEFAULT_ORDER = ["featured", "quiz", "stamps", "videos", "drops", "polls", "events"]

function moveItem<T>(list: T[], index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= list.length) return list
  const next = [...list]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

// Hype tab layout: order of the "For you" sections (the app's loading skeleton follows it too)
// and the video categories shown as chips on the Videos / watch screens.
export function HypeLayoutCard() {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ["admin-hype-layout"], queryFn: getAdminHypeLayout })
  const [order, setOrder] = React.useState<string[]>(DEFAULT_ORDER)
  const [categories, setCategories] = React.useState<HypeVideoCategory[]>([])
  const [newCategory, setNewCategory] = React.useState("")
  React.useEffect(() => {
    if (query.data?.sectionOrder?.length) setOrder(query.data.sectionOrder)
    if (query.data?.videoCategories?.length) setCategories(query.data.videoCategories)
  }, [query.data])

  const save = useMutation({
    mutationFn: (patch: Partial<HypeLayout>) => saveLayout(patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-hype-layout"] })
      toast.success("Save হয়েছে — অ্যাপে ১ মিনিটের মধ্যে দেখাবে")
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Save failed"),
  })

  const orderDirty = JSON.stringify(order) !== JSON.stringify(query.data?.sectionOrder ?? DEFAULT_ORDER)
  const categoriesDirty = JSON.stringify(categories) !== JSON.stringify(query.data?.videoCategories ?? [])

  const addCategory = () => {
    const label = newCategory.trim()
    if (!label) return
    if (categories.some((category) => category.label.toLowerCase() === label.toLowerCase())) {
      toast.error("এই নামে category আগেই আছে")
      return
    }
    // id is created by the server from the label; empty id = new.
    setCategories([...categories, { id: "", label }])
    setNewCategory("")
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>“For you” সেকশনের ক্রম</CardTitle>
          <CardDescription>▲▼ দিয়ে উপরে-নিচে করুন। অ্যাপে এই ক্রমেই দেখাবে (লোড হওয়ার সময়ের skeleton-ও)।</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {query.isLoading ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          ) : (
            order.map((key, index) => (
              <div key={key} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                <span className="w-6 text-center text-sm font-semibold text-muted-foreground">{index + 1}</span>
                <div className="flex-1">
                  <div className="text-sm font-medium">{SECTION_INFO[key]?.label ?? key}</div>
                  <div className="text-xs text-muted-foreground">{SECTION_INFO[key]?.hint}</div>
                </div>
                <Button size="icon" variant="ghost" aria-label="Move up" disabled={index === 0} onClick={() => setOrder(moveItem(order, index, -1))}>
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Move down"
                  disabled={index === order.length - 1}
                  onClick={() => setOrder(moveItem(order, index, 1))}
                >
                  <ArrowDown className="size-4" />
                </Button>
              </div>
            ))
          )}
          <div className="flex gap-2 pt-2">
            <Button disabled={!orderDirty || save.isPending} onClick={() => save.mutate({ sectionOrder: order })}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save
            </Button>
            <Button variant="outline" onClick={() => setOrder(DEFAULT_ORDER)}>
              আগের মতো (default)
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ভিডিও category</CardTitle>
          <CardDescription>
            অ্যাপের Videos পাতায় chip হিসেবে দেখায়। নাম বদলান, ক্রম ঠিক করুন, নতুন যোগ করুন। মুছে ফেলা category-র
            ভিডিও "All"-এ দেখাবে — নতুন category বেছে দিন।
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {categories.map((category, index) => (
            <div key={`${category.id}-${index}`} className="flex items-center gap-2">
              <Input
                value={category.label}
                maxLength={30}
                onChange={(event) =>
                  setCategories(categories.map((item, i) => (i === index ? { ...item, label: event.target.value } : item)))
                }
              />
              <Button size="icon" variant="ghost" aria-label="Move up" disabled={index === 0} onClick={() => setCategories(moveItem(categories, index, -1))}>
                <ArrowUp className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Move down"
                disabled={index === categories.length - 1}
                onClick={() => setCategories(moveItem(categories, index, 1))}
              >
                <ArrowDown className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Delete"
                disabled={categories.length <= 1}
                onClick={() => setCategories(categories.filter((_, i) => i !== index))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <Input
              value={newCategory}
              maxLength={30}
              placeholder="নতুন category, যেমন: Street food"
              onChange={(event) => setNewCategory(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") addCategory()
              }}
            />
            <Button variant="outline" onClick={addCategory}>
              <Plus className="size-4" /> যোগ
            </Button>
          </div>
          <Button
            className="mt-2"
            disabled={!categoriesDirty || save.isPending || categories.some((category) => !category.label.trim())}
            onClick={() => save.mutate({ videoCategories: categories })}
          >
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Save categories
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
