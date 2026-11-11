import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  BarChart3,
  CalendarDays,
  Eye,
  EyeOff,
  Flame,
  MessageSquare,
  MousePointerClick,
  Pencil,
  Plus,
  ThumbsUp,
  Trash2,
  Upload,
  Video,
  Vote,
  X,
  Zap,
} from "lucide-react"
import { toast } from "sonner"

import { AppLinkPicker } from "@/components/app-link-picker"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  createAdminHypeItem,
  deleteAdminHypeItem,
  listAdminHypeComments,
  listAdminHypeItems,
  moderateAdminHypeComment,
  listAdminRestaurants,
  updateAdminHypeItem,
  uploadAdminMedia,
  type AdminHypeCategory,
  type AdminHypeItem,
  type AdminHypeItemInput,
  type AdminHypeKind,
} from "@/lib/admin-api"
import { getAdminZoneScopeQueryParams } from "@/lib/admin-zone-scope"

const KIND_INFO: Record<AdminHypeKind, { label: string; bn: string; icon: typeof Zap }> = {
  drop: { label: "Drops", bn: "সময় বাঁধা flash deal — countdown সহ", icon: Zap },
  event: { label: "Events", bn: "নেত্রকোনায় যা হচ্ছে — খেলা, নতুন দোকান, উৎসব", icon: CalendarDays },
  video: { label: "Videos", bn: "YouTube video, app-এর ভেতরে চলে — like/dislike সহ", icon: Video },
  poll: { label: "Polls", bn: "প্রশ্ন + অপশন — user একবার ভোট দেবে, চাইলে comment চালু রাখুন", icon: Vote },
}

const CATEGORY_LABEL: Record<AdminHypeCategory, string> = {
  food: "Food",
  funny: "Funny",
  local: "Netrakona",
  other: "Other",
}

type FormState = {
  id: string | null
  kind: AdminHypeKind
  title: string
  description: string
  imageUrl: string
  restaurantId: string
  ctaLabel: string
  ctaPath: string
  externalUrl: string
  startsAt: string
  endsAt: string
  limitLabel: string
  location: string
  youtubeUrl: string
  category: AdminHypeCategory
  durationLabel: string
  isPublished: boolean
  position: string
  pollOptions: Array<{ id?: string; label: string }>
  allowComments: boolean
}

// <input type="datetime-local"> works in local time: convert both ways.
function toLocalInput(iso: string | null) {
  if (!iso) return ""
  const date = new Date(iso)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}
function fromLocalInput(value: string) {
  return value ? new Date(value).toISOString() : null
}

function emptyForm(kind: AdminHypeKind): FormState {
  return {
    id: null,
    kind,
    title: "",
    description: "",
    imageUrl: "",
    restaurantId: "",
    ctaLabel: "",
    ctaPath: "",
    externalUrl: "",
    startsAt: "",
    endsAt: "",
    limitLabel: "",
    location: "",
    youtubeUrl: "",
    category: "food",
    durationLabel: "",
    isPublished: true,
    position: "0",
    pollOptions: kind === "poll" ? [{ label: "" }, { label: "" }] : [],
    allowComments: false,
  }
}

function formFromItem(item: AdminHypeItem): FormState {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    description: item.description,
    imageUrl: item.imageUrl,
    restaurantId: item.restaurantId ?? "",
    ctaLabel: item.ctaLabel,
    ctaPath: item.ctaPath,
    externalUrl: item.externalUrl ?? "",
    startsAt: toLocalInput(item.startsAt),
    endsAt: toLocalInput(item.endsAt),
    limitLabel: item.limitLabel,
    location: item.location,
    youtubeUrl: item.youtubeId ? `https://youtu.be/${item.youtubeId}` : "",
    category: item.category,
    durationLabel: item.durationLabel,
    isPublished: item.isPublished,
    position: String(item.position ?? 0),
    pollOptions: (item.pollOptions ?? []).map((option) => ({ id: option.id, label: option.label })),
    allowComments: item.allowComments === true,
  }
}

function toInput(form: FormState): AdminHypeItemInput {
  return {
    kind: form.kind,
    title: form.title,
    description: form.description,
    imageUrl: form.imageUrl,
    restaurantId: form.restaurantId || null,
    ctaLabel: form.ctaLabel,
    ctaPath: form.ctaPath,
    externalUrl: form.externalUrl,
    startsAt: fromLocalInput(form.startsAt),
    endsAt: fromLocalInput(form.endsAt),
    limitLabel: form.limitLabel,
    location: form.location,
    youtubeUrl: form.youtubeUrl,
    category: form.category,
    durationLabel: form.durationLabel,
    isPublished: form.isPublished,
    position: Number(form.position) || 0,
    ...(form.kind === "poll"
      ? {
          pollOptions: form.pollOptions.filter((option) => option.label.trim()),
          allowComments: form.allowComments,
        }
      : {}),
  }
}

function itemStatus(item: AdminHypeItem) {
  if (!item.isPublished) return { label: "Hidden", tone: "bg-slate-100 text-slate-700" }
  const now = Date.now()
  const starts = item.startsAt ? new Date(item.startsAt).getTime() : null
  const ends = item.endsAt ? new Date(item.endsAt).getTime() : null
  if (item.kind === "drop") {
    if (ends !== null && ends <= now) return { label: "Ended", tone: "bg-slate-100 text-slate-700" }
    if (starts !== null && starts > now) return { label: "Upcoming", tone: "bg-sky-100 text-sky-800" }
    return { label: "Live", tone: "bg-emerald-100 text-emerald-800" }
  }
  if (item.kind === "poll") {
    if (ends !== null && ends <= now) return { label: "Closed", tone: "bg-slate-100 text-slate-700" }
    return { label: "Open", tone: "bg-emerald-100 text-emerald-800" }
  }
  if (item.kind === "event") {
    const end = ends ?? (starts !== null ? starts + 6 * 3_600_000 : null)
    if (end !== null && end <= now) return { label: "Past", tone: "bg-slate-100 text-slate-700" }
    if (starts !== null && starts > now) return { label: "Upcoming", tone: "bg-sky-100 text-sky-800" }
    return { label: "Happening", tone: "bg-emerald-100 text-emerald-800" }
  }
  return { label: "Published", tone: "bg-emerald-100 text-emerald-800" }
}

function formatWhen(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  })
}

// Image for any Hype item: paste a URL or upload (Cloudinary, 3 MB max) — with a live preview.
function HypeImageField({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (url: string) => void
  label: string
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = React.useState(false)
  const handleFile = async (file?: File) => {
    if (!file) return
    setUploading(true)
    try {
      const asset = await uploadAdminMedia(file, "foodbela/admin/hype")
      onChange(asset.url)
      toast.success("Image uploaded")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Image upload failed")
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }
  return (
    <div className="grid gap-2">
      <Label htmlFor="hype-image">{label}</Label>
      <div className="flex gap-2">
        <Input
          id="hype-image"
          value={value}
          placeholder="https://… or upload"
          onChange={(event) => onChange(event.target.value)}
        />
        <Button type="button" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
          <Upload className="size-4" /> {uploading ? "Uploading…" : "Upload"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
      </div>
      {value ? (
        <div className="relative w-fit">
          <img src={value} alt="Preview" className="h-28 rounded-lg border object-cover" />
          <button
            type="button"
            aria-label="Remove image"
            className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
            onClick={() => onChange("")}
          >
            <X className="size-3" />
          </button>
        </div>
      ) : null}
    </div>
  )
}

function pct(part: number, whole: number) {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—"
}

// Per-item engagement: seen in feed → opened → tapped the button / website / reminder.
function ItemAnalytics({ item }: { item: AdminHypeItem }) {
  const stats: Array<{ icon: typeof Eye; label: string; value: string; hint?: string }> = [
    { icon: Eye, label: "Seen", value: String(item.impressionCount ?? 0) },
  ]
  if (item.kind === "video") {
    stats.push(
      { icon: Video, label: "Plays", value: String(item.viewCount ?? 0), hint: pct(item.viewCount, item.impressionCount) },
      { icon: ThumbsUp, label: "Likes", value: String(item.likeCount ?? 0) },
      { icon: X, label: "Dislikes", value: String(item.dislikeCount ?? 0) },
    )
  } else if (item.kind === "poll") {
    stats.push(
      { icon: Vote, label: "Votes", value: String(item.voteCount ?? 0), hint: pct(item.voteCount, item.impressionCount) },
      { icon: MessageSquare, label: "Comments", value: String(item.commentCount ?? 0) },
    )
  } else {
    stats.push(
      { icon: BarChart3, label: "Opened", value: String(item.openCount ?? 0), hint: pct(item.openCount, item.impressionCount) },
      { icon: MousePointerClick, label: "Button", value: String(item.ctaCount ?? 0), hint: pct(item.ctaCount, item.impressionCount) },
    )
    if (item.externalUrl) stats.push({ icon: MousePointerClick, label: "Website", value: String(item.websiteCount ?? 0) })
    stats.push({ icon: CalendarDays, label: "Reminders", value: String(item.remindCount ?? 0) })
  }
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {stats.map((stat) => {
        const Icon = stat.icon
        return (
          <span
            key={stat.label}
            className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-1 text-xs"
            title={stat.hint ? `${stat.hint} of people who saw it` : undefined}
          >
            <Icon className="size-3 text-muted-foreground" />
            <span className="text-muted-foreground">{stat.label}</span>
            <span className="font-semibold">{stat.value}</span>
            {stat.hint && stat.hint !== "—" ? <span className="text-muted-foreground">({stat.hint})</span> : null}
          </span>
        )
      })}
    </div>
  )
}

function PollResults({ item }: { item: AdminHypeItem }) {
  const total = item.voteCount || 0
  return (
    <div className="mt-2 space-y-1">
      {(item.pollOptions ?? []).map((option) => {
        const share = total ? Math.round((option.voteCount / total) * 100) : 0
        return (
          <div key={option.id} className="relative overflow-hidden rounded-md border px-2 py-1 text-xs">
            <div className="absolute inset-y-0 left-0 bg-amber-100" style={{ width: `${share}%` }} />
            <div className="relative flex justify-between gap-2">
              <span>{option.label}</span>
              <span className="font-semibold">
                {option.voteCount} · {share}%
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CommentsDialog({ item, onClose }: { item: AdminHypeItem | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const commentsQuery = useQuery({
    queryKey: ["admin-hype-comments", item?.id],
    queryFn: () => listAdminHypeComments(item!.id),
    enabled: Boolean(item),
  })
  const moderate = useMutation({
    mutationFn: (params: { id: string; action: "hide" | "show" | "delete" }) =>
      moderateAdminHypeComment(params.id, params.action),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-hype-comments", item?.id] })
      void queryClient.invalidateQueries({ queryKey: ["admin-hype-items"] })
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Could not update"),
  })
  const comments = commentsQuery.data ?? []
  return (
    <Dialog open={Boolean(item)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Comments — {item?.title}</DialogTitle>
          <DialogDescription>
            লুকালে app-এ দেখাবে না (পরে আবার দেখাতে পারবেন)। Delete করলে স্থায়ীভাবে মুছে যাবে।
          </DialogDescription>
        </DialogHeader>
        {commentsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : comments.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            এখনো কোনো comment নেই।
          </p>
        ) : (
          <div className="space-y-2">
            {comments.map((comment) => (
              <div
                key={comment.id}
                className={`rounded-lg border p-3 text-sm ${comment.status === "hidden" ? "bg-muted/50 opacity-70" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="font-medium">{comment.customerName || comment.authorName}</span>
                    {comment.customerPhone ? (
                      <a href={`tel:${comment.customerPhone}`} className="ml-2 text-xs text-muted-foreground underline">
                        {comment.customerPhone}
                      </a>
                    ) : null}
                    <span className="ml-2 text-xs text-muted-foreground">(shown as “{comment.authorName}”)</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(comment.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap">{comment.text}</p>
                <div className="mt-2 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => moderate.mutate({ id: comment.id, action: comment.status === "hidden" ? "show" : "hide" })}
                  >
                    {comment.status === "hidden" ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                    {comment.status === "hidden" ? "Show" : "Hide"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => moderate.mutate({ id: comment.id, action: "delete" })}>
                    <Trash2 className="size-3.5 text-destructive" /> Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function HypePage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = React.useState<AdminHypeKind>("drop")
  const [form, setForm] = React.useState<FormState | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<AdminHypeItem | null>(null)
  const [commentsFor, setCommentsFor] = React.useState<AdminHypeItem | null>(null)

  const itemsQuery = useQuery({
    queryKey: ["admin-hype-items"],
    queryFn: () => listAdminHypeItems(),
  })
  const restaurantsQuery = useQuery({
    queryKey: ["admin-restaurants", "hype-targets"],
    queryFn: () =>
      listAdminRestaurants({ page: 1, pageSize: 100, sortBy: "newestUpdated", ...getAdminZoneScopeQueryParams() }),
  })
  const restaurantOptions = React.useMemo(
    () =>
      (restaurantsQuery.data?.items ?? []).map((restaurant: { id: string; name: string }) => ({
        id: restaurant.id,
        name: restaurant.name,
      })),
    [restaurantsQuery.data?.items],
  )

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-hype-items"] })

  const saveMutation = useMutation({
    mutationFn: (state: FormState) =>
      state.id ? updateAdminHypeItem(state.id, toInput(state)) : createAdminHypeItem(toInput(state)),
    onSuccess: () => {
      toast.success("Saved — it shows in the app within a minute")
      setForm(null)
      void refresh()
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Could not save"),
  })

  const toggleMutation = useMutation({
    mutationFn: (item: AdminHypeItem) =>
      updateAdminHypeItem(item.id, { ...toInput(formFromItem(item)), isPublished: !item.isPublished }),
    onSuccess: () => void refresh(),
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Could not update"),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAdminHypeItem(id),
    onSuccess: () => {
      toast.success("Deleted")
      setDeleteTarget(null)
      void refresh()
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Could not delete"),
  })

  const items = itemsQuery.data ?? []
  const set = (patch: Partial<FormState>) => setForm((current) => (current ? { ...current, ...patch } : current))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Flame className="size-6 text-amber-500" /> Hype tab
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Customer app-এর "Hype" tab-এ কী দেখাবে — Drops, Events আর Videos। শুধু এখান থেকে যোগ হয়, user post করতে পারে না।
          </p>
        </div>
        <Button onClick={() => setForm(emptyForm(tab))}>
          <Plus className="size-4" /> Add {KIND_INFO[tab].label.slice(0, -1).toLowerCase()}
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as AdminHypeKind)}>
        <TabsList>
          {(Object.keys(KIND_INFO) as AdminHypeKind[]).map((kind) => {
            const Icon = KIND_INFO[kind].icon
            const count = items.filter((item) => item.kind === kind).length
            return (
              <TabsTrigger key={kind} value={kind} className="gap-1.5">
                <Icon className="size-4" /> {KIND_INFO[kind].label}
                <span className="text-xs text-muted-foreground">{count}</span>
              </TabsTrigger>
            )
          })}
        </TabsList>

        {(Object.keys(KIND_INFO) as AdminHypeKind[]).map((kind) => {
          const list = items.filter((item) => item.kind === kind)
          return (
            <TabsContent key={kind} value={kind} className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>{KIND_INFO[kind].label}</CardTitle>
                  <CardDescription>{KIND_INFO[kind].bn}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {itemsQuery.isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                  ) : list.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                      এখনো কিছু নেই।{" "}
                      <button className="font-medium text-foreground underline" onClick={() => setForm(emptyForm(kind))}>
                        প্রথমটা যোগ করুন
                      </button>
                    </div>
                  ) : (
                    list.map((item) => {
                      const status = itemStatus(item)
                      return (
                        <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt="" className="h-14 w-24 rounded object-cover" />
                          ) : item.kind === "video" && item.youtubeId ? (
                            <img
                              src={`https://i.ytimg.com/vi/${item.youtubeId}/mqdefault.jpg`}
                              alt=""
                              className="h-14 w-24 rounded object-cover"
                            />
                          ) : null}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{item.title || "Image poll"}</span>
                              <Badge variant="secondary" className={status.tone}>
                                {status.label}
                              </Badge>
                              {item.kind === "video" ? (
                                <Badge variant="outline">{CATEGORY_LABEL[item.category]}</Badge>
                              ) : null}
                            </div>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {item.kind === "video"
                                ? "YouTube video"
                                : item.kind === "poll"
                                  ? `${item.pollOptions?.length ?? 0} options · ${item.allowComments ? "comments on" : "comments off"} · closes ${formatWhen(item.endsAt)}`
                                  : `${formatWhen(item.startsAt)} → ${formatWhen(item.endsAt)}`}
                              {item.restaurantName ? ` · ${item.restaurantName}` : ""}
                            </p>
                            {item.kind === "poll" ? <PollResults item={item} /> : null}
                            <ItemAnalytics item={item} />
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={item.isPublished}
                              onCheckedChange={() => toggleMutation.mutate(item)}
                              aria-label={item.isPublished ? "Hide" : "Publish"}
                            />
                            {item.kind === "poll" ? (
                              <Button variant="outline" size="sm" onClick={() => setCommentsFor(item)}>
                                <MessageSquare className="size-3.5" /> {item.commentCount ?? 0}
                              </Button>
                            ) : null}
                            <Button variant="outline" size="sm" onClick={() => setForm(formFromItem(item))}>
                              <Pencil className="size-3.5" /> Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label="Delete"
                              onClick={() => setDeleteTarget(item)}
                            >
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      )
                    })
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )
        })}
      </Tabs>

      <Dialog open={Boolean(form)} onOpenChange={(open) => (!open ? setForm(null) : undefined)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          {form ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {form.id ? "Edit" : "New"} {KIND_INFO[form.kind].label.slice(0, -1).toLowerCase()}
                </DialogTitle>
                <DialogDescription>{KIND_INFO[form.kind].bn}</DialogDescription>
              </DialogHeader>

              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="hype-title">{form.kind === "poll" ? "Question" : "Title"}</Label>
                  <Input
                    id="hype-title"
                    value={form.title}
                    maxLength={120}
                    placeholder={
                      form.kind === "poll"
                        ? "আজ রাতে কী খাবেন?"
                        : form.kind === "drop"
                        ? "Pizza 40% off — tonight only"
                        : form.kind === "event"
                          ? "BPL final — match night combos"
                          : "The cheesiest pizza in Netrakona?"
                    }
                    onChange={(event) => set({ title: event.target.value })}
                  />
                </div>

                {form.kind === "poll" ? (
                  <>
                    <div className="grid gap-2">
                      <Label>Options (2–6)</Label>
                      {form.pollOptions.map((option, index) => (
                        <div key={option.id ?? `new-${index}`} className="flex gap-2">
                          <Input
                            value={option.label}
                            maxLength={80}
                            placeholder={`Option ${index + 1}`}
                            onChange={(event) =>
                              set({
                                pollOptions: form.pollOptions.map((current, i) =>
                                  i === index ? { ...current, label: event.target.value } : current,
                                ),
                              })
                            }
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Remove option"
                            disabled={form.pollOptions.length <= 2}
                            onClick={() => set({ pollOptions: form.pollOptions.filter((_, i) => i !== index) })}
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                      ))}
                      {form.pollOptions.length < 6 ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-fit"
                          onClick={() => set({ pollOptions: [...form.pollOptions, { label: "" }] })}
                        >
                          <Plus className="size-3.5" /> Add option
                        </Button>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        Option-এর লেখা পরে বদলালেও আগের ভোট থাকে। User ভোট দেওয়ার পরেই ফলাফল দেখে।
                      </p>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="hype-poll-end">Closes (optional)</Label>
                      <Input
                        id="hype-poll-end"
                        type="datetime-local"
                        value={form.endsAt}
                        onChange={(event) => set({ endsAt: event.target.value })}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <Label>Allow comments</Label>
                        <p className="text-xs text-muted-foreground">
                          শুধু sign-in করা user comment দিতে পারবে। আপনি যেকোনো comment লুকাতে বা মুছতে পারবেন।
                        </p>
                      </div>
                      <Switch checked={form.allowComments} onCheckedChange={(checked) => set({ allowComments: checked })} />
                    </div>
                  </>
                ) : form.kind === "video" ? (
                  <>
                    <div className="grid gap-2">
                      <Label htmlFor="hype-youtube">YouTube link</Label>
                      <Input
                        id="hype-youtube"
                        value={form.youtubeUrl}
                        placeholder="https://youtu.be/… or https://youtube.com/shorts/…"
                        onChange={(event) => set({ youtubeUrl: event.target.value })}
                      />
                      <p className="text-xs text-muted-foreground">
                        Video-টা YouTube-এ "embedding allowed" থাকতে হবে, নইলে app-এ চলবে না।
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="grid gap-2">
                        <Label htmlFor="hype-category">Category</Label>
                        <select
                          id="hype-category"
                          className="h-9 rounded-md border bg-background px-3 text-sm"
                          value={form.category}
                          onChange={(event) => set({ category: event.target.value as AdminHypeCategory })}
                        >
                          {(Object.keys(CATEGORY_LABEL) as AdminHypeCategory[]).map((key) => (
                            <option key={key} value={key}>
                              {CATEGORY_LABEL[key]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="hype-duration">Length (optional)</Label>
                        <Input
                          id="hype-duration"
                          value={form.durationLabel}
                          placeholder="0:58"
                          onChange={(event) => set({ durationLabel: event.target.value })}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <Label htmlFor="hype-start">{form.kind === "drop" ? "Starts (empty = now)" : "Starts"}</Label>
                      <Input
                        id="hype-start"
                        type="datetime-local"
                        value={form.startsAt}
                        onChange={(event) => set({ startsAt: event.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="hype-end">{form.kind === "drop" ? "Ends" : "Ends (optional)"}</Label>
                      <Input
                        id="hype-end"
                        type="datetime-local"
                        value={form.endsAt}
                        onChange={(event) => set({ endsAt: event.target.value })}
                      />
                    </div>
                  </div>
                )}

                {form.kind === "drop" ? (
                  <div className="grid gap-2">
                    <Label htmlFor="hype-limit">Scarcity line (optional)</Label>
                    <Input
                      id="hype-limit"
                      value={form.limitLabel}
                      placeholder="Only 50 orders"
                      onChange={(event) => set({ limitLabel: event.target.value })}
                    />
                  </div>
                ) : null}
                {form.kind === "event" ? (
                  <div className="grid gap-2">
                    <Label htmlFor="hype-location">Where (optional)</Label>
                    <Input
                      id="hype-location"
                      value={form.location}
                      placeholder="Netrakona Sadar"
                      onChange={(event) => set({ location: event.target.value })}
                    />
                  </div>
                ) : null}

                <div className="grid gap-2">
                  <Label htmlFor="hype-description">Short description (optional)</Label>
                  <Textarea
                    id="hype-description"
                    value={form.description}
                    maxLength={400}
                    rows={2}
                    onChange={(event) => set({ description: event.target.value })}
                  />
                </div>

                <div className="grid gap-2">
                  <Label>Restaurant (optional)</Label>
                  <select
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                    value={form.restaurantId}
                    onChange={(event) => set({ restaurantId: event.target.value })}
                  >
                    <option value="">— None —</option>
                    {restaurantOptions.map((restaurant) => (
                      <option key={restaurant.id} value={restaurant.id}>
                        {restaurant.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    {form.kind === "video"
                      ? "দিলে video-র নিচে \"Order this\" button আসবে।"
                      : "দিলে button চাপলে এই restaurant খুলবে (নিচের link না দিলে)।"}
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="hype-website">Website link (optional)</Label>
                  <Input
                    id="hype-website"
                    value={form.externalUrl}
                    placeholder="https://facebook.com/events/… or any website"
                    onChange={(event) => set({ externalUrl: event.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    দিলে details-এ "Visit website" button আসবে — Facebook event, ticket, news, যেকোনো site।
                  </p>
                </div>

                {form.kind !== "video" ? (
                  <div className="grid gap-2">
                    <Label>Button opens (optional)</Label>
                    <AppLinkPicker
                      value={form.ctaPath}
                      restaurants={restaurantOptions}
                      onChange={(ctaPath) => set({ ctaPath })}
                    />
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="hype-cta">Button text (optional)</Label>
                    <Input
                      id="hype-cta"
                      value={form.ctaLabel}
                      maxLength={40}
                      placeholder={form.kind === "video" ? "Order this" : "Grab the deal"}
                      onChange={(event) => set({ ctaLabel: event.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="hype-position">Order (lower = first)</Label>
                    <Input
                      id="hype-position"
                      type="number"
                      value={form.position}
                      onChange={(event) => set({ position: event.target.value })}
                    />
                  </div>
                </div>

                <HypeImageField
                  value={form.imageUrl}
                  onChange={(imageUrl) => set({ imageUrl })}
                  label={
                    form.kind === "poll"
                      ? "Image (optional — an image poll can skip the question)"
                      : form.kind === "video"
                        ? "Custom thumbnail (optional — YouTube's is used otherwise)"
                        : "Image (optional)"
                  }
                />

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label>Published</Label>
                    <p className="text-xs text-muted-foreground">বন্ধ রাখলে app-এ দেখাবে না।</p>
                  </div>
                  <Switch checked={form.isPublished} onCheckedChange={(checked) => set({ isPublished: checked })} />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setForm(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => saveMutation.mutate(form)}
                  disabled={
                    saveMutation.isPending ||
                    (!form.title.trim() && !(form.kind === "poll" && form.imageUrl.trim()))
                  }
                >
                  {saveMutation.isPending ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <CommentsDialog item={commentsFor} onClose={() => setCommentsFor(null)} />

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => (!open ? setDeleteTarget(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{deleteTarget?.title}”?</DialogTitle>
            <DialogDescription>এটা app থেকে সরে যাবে। Video হলে তার like/dislike-ও মুছে যাবে।</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
