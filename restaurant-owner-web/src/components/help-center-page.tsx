import * as React from "react"

import { format } from "date-fns"
import { useQueryClient } from "@tanstack/react-query"
import { useSearchParams } from "react-router-dom"
import {
  BadgeHelp,
  Bug,
  CircleHelp,
  Clock3,
  CreditCard,
  LifeBuoy,
  LoaderCircle,
  Mail,
  MessageSquare,
  PackageSearch,
  Percent,
  Phone,
  Search,
  Send,
  Settings,
  ShoppingBag,
  Upload,
  UtensilsCrossed,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { useDebouncedValue } from "@/hooks/use-debounced-value"

import type {
  FAQ,
  HelpArticle,
  HelpCategory,
  SupportAttachment,
  SupportTicket,
  SupportTicketStatus,
} from "@/components/help-center/types"
import {
  useCreateOwnerSupportCaseMutation,
  usePublicPlatformContentQuery,
  useOwnerSupportCasesListQuery,
} from "@/hooks/use-owner-api"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  mapOwnerSupportCase,
  type OwnerListResponse,
  type OwnerSupportCaseResponse,
} from "@/lib/backend-mappers"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

const statusClasses: Record<SupportTicketStatus, string> = {
  open: "border-amber-200 bg-amber-50 text-amber-700",
  in_progress: "border-sky-200 bg-sky-50 text-sky-700",
  resolved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  closed: "border-slate-200 bg-slate-100 text-slate-700",
}

const priorityClasses = {
  low: "border-slate-200 bg-slate-50 text-slate-700",
  medium: "border-violet-200 bg-violet-50 text-violet-700",
  high: "border-rose-200 bg-rose-50 text-rose-700",
} as const

const q = (value: string, query: string) =>
  value.toLowerCase().includes(query.trim().toLowerCase())

const HELP_CATEGORY_ICONS = {
  "shopping-bag": ShoppingBag,
  "credit-card": CreditCard,
  "utensils-crossed": UtensilsCrossed,
  percent: Percent,
  settings: Settings,
  bug: Bug,
} as const

function SupportReportDrawer({
  open,
  onOpenChange,
  form,
  categories,
  updateForm,
  onSubmit,
  isSubmitting,
  onAttachmentUpload,
  onAttachmentRemove,
  isUploading,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: {
    subject: string
    categoryId: string
    message: string
    attachments: SupportAttachment[]
  }
  categories: HelpCategory[]
  updateForm: <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => void
  onSubmit: () => void
  isSubmitting?: boolean
  onAttachmentUpload: (file: File) => void
  onAttachmentRemove: (index: number) => void
  isUploading?: boolean
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-2xl!"
      >
        <SheetHeader className="sticky top-0 z-10 border-b bg-popover px-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SheetTitle className="flex items-center gap-2">
                <Bug className="h-4 w-4 text-muted-foreground" />
                Report an issue
              </SheetTitle>
              <SheetDescription>
                Share the issue clearly and we&apos;ll help from the support queue.
              </SheetDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </Button>
          </div>
        </SheetHeader>

        <div className="flex flex-1 flex-col px-6 py-6">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Subject</label>
                <Input value={form.subject} onChange={(event) => updateForm("subject", event.target.value)} placeholder="Short summary of the issue" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Issue Category</label>
                <Select value={form.categoryId} onValueChange={(value) => updateForm("categoryId", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select issue category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Message</label>
              <Textarea value={form.message} onChange={(event) => updateForm("message", event.target.value)} placeholder="Describe the issue clearly, including order ID or payout date if relevant." className="min-h-36" />
            </div>

            <div className="rounded-2xl border border-dashed bg-muted/10 p-4">
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
                <Upload className="size-4" />
                Attach screenshot or document
                <input
                  type="file"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) {
                      onAttachmentUpload(file)
                    }
                  }}
                />
              </label>
              <div className="mt-2 text-sm text-muted-foreground">
                {isUploading ? "Uploading..." : "Optional attachment for faster troubleshooting."}
              </div>
              {form.attachments.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {form.attachments.map((attachment, index) => {
                    const isImage = attachment.fileType?.startsWith("image/")
                    return (
                      <div
                        key={`${attachment.url}-${index}`}
                        className="flex items-center justify-between gap-3 rounded-xl border bg-background p-2"
                      >
                        <div className="flex items-center gap-3">
                          {isImage ? (
                            <img
                              src={attachment.url}
                              alt={attachment.fileName ?? "Attachment"}
                              className="h-12 w-12 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
                              File
                            </div>
                          )}
                          <div>
                            <div className="text-sm font-medium">
                              {attachment.fileName ?? "Attachment"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {attachment.fileType ?? "file"}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onAttachmentRemove(index)}
                        >
                          <X className="size-4" />
                          <span className="sr-only">Remove</span>
                        </Button>
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </div>

          </div>

          <div className="mt-auto border-t bg-popover px-0 pt-4">
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={onSubmit} disabled={isSubmitting || isUploading}>
                {isSubmitting ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                {isSubmitting ? "Submitting..." : "Submit Report"}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function SupportCaseDetailsDrawer({
  open,
  onOpenChange,
  ticket,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  ticket: SupportTicket | null
}) {
  if (!ticket) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-2xl!"
        >
          <SheetHeader className="sticky top-0 z-10 border-b bg-popover px-6 pb-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <SheetTitle className="flex items-center gap-2">
                  <Bug className="h-4 w-4 text-muted-foreground" />
                  Report details
                </SheetTitle>
                <SheetDescription>Support case details will appear here.</SheetDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
                <X className="size-4" />
                <span className="sr-only">Close</span>
              </Button>
            </div>
          </SheetHeader>
          <div className="flex flex-1 items-center justify-center px-6 py-10 text-sm text-muted-foreground">
            Select a report to view details.
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  const lastReply = ticket.replies?.[ticket.replies.length - 1]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-2xl!"
      >
        <SheetHeader className="sticky top-0 z-10 border-b bg-popover px-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SheetTitle className="flex items-center gap-2">
                <Bug className="h-4 w-4 text-muted-foreground" />
                Report details
              </SheetTitle>
              <SheetDescription>Track status updates and admin replies.</SheetDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </Button>
          </div>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-6">
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">{ticket.id}</div>
            <div className="text-xl font-semibold">{ticket.subject}</div>
            <div className="text-sm text-muted-foreground">{ticket.categoryId}</div>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Badge variant="outline" className={cn("rounded-full capitalize", statusClasses[ticket.status])}>
                {ticket.status.replace("_", " ")}
              </Badge>
              <Badge variant="outline" className={cn("rounded-full capitalize", priorityClasses[ticket.priority])}>
                {ticket.priority} priority
              </Badge>
            </div>
          </div>

          <div className="rounded-2xl border bg-muted/10 p-4 text-sm leading-6 text-muted-foreground">
            {ticket.message}
          </div>

          {ticket.attachments && ticket.attachments.length > 0 ? (
            <div className="rounded-2xl border bg-muted/10 p-4">
              <div className="text-xs font-medium uppercase text-muted-foreground">
                Attachments
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {ticket.attachments.map((attachment, index) => {
                  const isImage = attachment.fileType?.startsWith("image/")
                  return (
                    <a
                      key={`${attachment.url}-${index}`}
                      href={attachment.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 rounded-2xl border bg-background p-3 text-sm transition hover:bg-muted/20"
                    >
                      {isImage ? (
                        <img
                          src={attachment.url}
                          alt={attachment.fileName ?? "Attachment"}
                          className="h-12 w-12 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
                          File
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {attachment.fileName ?? "Attachment"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {attachment.fileType ?? "file"}
                        </div>
                      </div>
                    </a>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border bg-background/70 p-4">
            <div className="text-xs font-medium uppercase text-muted-foreground">Timeline</div>
            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
              <div>Created {format(new Date(ticket.createdAt), "dd MMM yyyy, hh:mm a")}</div>
              <div>Updated {format(new Date(ticket.updatedAt), "dd MMM yyyy, hh:mm a")}</div>
              {lastReply ? (
                <div>
                  Last reply {format(new Date(lastReply.createdAt), "dd MMM yyyy, hh:mm a")}
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border bg-muted/10 p-4">
            <div className="text-xs font-medium uppercase text-muted-foreground">Replies</div>
            {ticket.replies && ticket.replies.length > 0 ? (
              <div className="mt-3 space-y-4">
                {ticket.replies.map((reply, index) => (
                  <div key={`${reply.createdAt}-${index}`} className="rounded-2xl border bg-background p-3">
                    <div className="text-sm font-medium">
                      {reply.adminName ?? "Support Team"}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">{reply.message}</div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {format(new Date(reply.createdAt), "dd MMM yyyy, hh:mm a")}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 text-sm text-muted-foreground">
                No replies yet. Our support team will respond soon.
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function HelpCenterPage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = React.useState("")
  const [category, setCategory] = React.useState("all")
  const [selectedArticleId, setSelectedArticleId] = React.useState("")
  const [reportDrawerOpen, setReportDrawerOpen] = React.useState(false)
  const [detailsDrawerOpen, setDetailsDrawerOpen] = React.useState(false)
  const [selectedTicket, setSelectedTicket] = React.useState<SupportTicket | null>(null)
  const [attachmentUploading, setAttachmentUploading] = React.useState(false)
  const platformContentQuery = usePublicPlatformContentQuery(true)
  const [form, setForm] = React.useState({
    subject: "",
    categoryId: "orders",
    message: "",
    attachments: [] as SupportAttachment[],
  })
  const debouncedSearch = useDebouncedValue(search)
  const supportCasesQuery = useOwnerSupportCasesListQuery(true, {
    sortBy: "updated",
    page: 1,
    pageSize: 25,
  })
  const createSupportCase = useCreateOwnerSupportCaseMutation()
  const platformContent = platformContentQuery.data
  const categories = React.useMemo<HelpCategory[]>(
    () =>
      (platformContent?.helpCenter.categories ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        icon:
          HELP_CATEGORY_ICONS[
            item.iconKey as keyof typeof HELP_CATEGORY_ICONS
          ] ?? CircleHelp,
      })),
    [platformContent]
  )
  const articles = React.useMemo<HelpArticle[]>(
    () => platformContent?.helpCenter.articles ?? [],
    [platformContent]
  )
  const faqs = React.useMemo<FAQ[]>(
    () => platformContent?.helpCenter.faqs ?? [],
    [platformContent]
  )
  const supportContact = platformContent?.supportContact
  const supportPhone = supportContact?.phone?.trim() ?? ""
  const supportEmail = supportContact?.email?.trim() ?? ""

  const reports = React.useMemo<SupportTicket[]>(
    () =>
      supportCasesQuery.data
        ? (
            supportCasesQuery.data as OwnerListResponse<OwnerSupportCaseResponse>
          ).items.map(mapOwnerSupportCase)
        : [],
    [supportCasesQuery.data]
  )
  const supportCasesLoading = supportCasesQuery.isPending
  const supportCasesError = supportCasesQuery.isError
    ? supportCasesQuery.error instanceof Error
      ? supportCasesQuery.error.message
      : "Support reports could not be loaded right now."
    : ""

  React.useEffect(() => {
    if (form.categoryId || !categories[0]?.id) return
    setForm((current) => ({ ...current, categoryId: categories[0].id }))
  }, [categories, form.categoryId])

  React.useEffect(() => {
    const caseId = searchParams.get("caseId")
    if (!caseId || reports.length === 0) return

    const matchedTicket = reports.find((ticket) => ticket.id === caseId)
    if (!matchedTicket) return

    setSelectedTicket((current) =>
      current?.id === matchedTicket.id ? current : matchedTicket
    )
    setDetailsDrawerOpen(true)
  }, [reports, searchParams])

  React.useEffect(() => {
    if (!selectedTicket || reports.length === 0) return

    const refreshedTicket = reports.find((ticket) => ticket.id === selectedTicket.id)
    if (!refreshedTicket) return

    const nextRepliesCount = refreshedTicket.replies?.length ?? 0
    const currentRepliesCount = selectedTicket.replies?.length ?? 0
    const statusChanged = refreshedTicket.status !== selectedTicket.status

    if (statusChanged || nextRepliesCount !== currentRepliesCount) {
      setSelectedTicket(refreshedTicket)
    }
  }, [reports, selectedTicket])

  const filteredCategories = React.useMemo(
    () =>
      !debouncedSearch
        ? categories
        : categories.filter(
            (item) =>
              q(item.name, debouncedSearch) ||
              q(item.description, debouncedSearch)
          ),
    [categories, debouncedSearch]
  )

  const filteredArticles = React.useMemo(
    () =>
      articles.filter((item) => {
        const catOk = category === "all" || item.categoryId === category
        if (!catOk) return false
        if (!debouncedSearch) return true
        return q(item.title, debouncedSearch) || q(item.excerpt, debouncedSearch)
      }),
    [articles, category, debouncedSearch]
  )

  const filteredFaqs = React.useMemo(
    () =>
      faqs.filter((item) => {
        const catOk = category === "all" || item.categoryId === category
        if (!catOk) return false
        if (!debouncedSearch) return true
        return q(item.question, debouncedSearch) || q(item.answer, debouncedSearch)
      }),
    [category, debouncedSearch, faqs]
  )

  const selectedArticle =
    filteredArticles.find((item) => item.id === selectedArticleId) ??
    filteredArticles[0] ??
    null

  const suggestions = React.useMemo(() => {
    if (!debouncedSearch.trim()) return []

    const articleSuggestions = filteredArticles.slice(0, 3).map((item) => ({
      id: item.id,
      label: item.title,
      meta: item.readTime,
      type: "Guide",
      action: () => setSelectedArticleId(item.id),
    }))

    const faqSuggestions = filteredFaqs.slice(0, 2).map((item) => ({
      id: item.id,
      label: item.question,
      meta: "Quick answer",
      type: "FAQ",
      action: () => undefined,
    }))

    return [...articleSuggestions, ...faqSuggestions]
  }, [debouncedSearch, filteredArticles, filteredFaqs])

  React.useEffect(() => {
    if (selectedArticle) setSelectedArticleId(selectedArticle.id)
  }, [selectedArticle])

  function updateForm<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function uploadAttachment(file: File) {
    if (!file) return

    const isAllowed =
      file.type.startsWith("image/") || file.type === "application/pdf"
    if (!isAllowed) {
      toast.error("Unsupported file type", {
        description: "Please upload an image or PDF file.",
      })
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large", {
        description: "Please upload a file smaller than 10 MB.",
      })
      return
    }

    setAttachmentUploading(true)
    try {
      const signature = await api.post<{
        cloudName: string
        folder: string
        timestamp: number
        signature: string
        apiKey: string
        resourceType: string
      }>("/media/upload-signature", {
        folder: "foodbela/support",
        resourceType: "auto",
      })

      const formData = new FormData()
      formData.append("file", file)
      formData.append("api_key", signature.apiKey)
      formData.append("timestamp", String(signature.timestamp))
      formData.append("signature", signature.signature)
      formData.append("folder", signature.folder)
      formData.append("resource_type", signature.resourceType)

      const uploadResponse = await fetch(
        `https://api.cloudinary.com/v1_1/${signature.cloudName}/${signature.resourceType}/upload`,
        {
          method: "POST",
          body: formData,
        }
      )

      if (!uploadResponse.ok) {
        const errorPayload = (await uploadResponse.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null
        throw new Error(
          errorPayload?.error?.message || "Upload failed"
        )
      }

      const uploaded = (await uploadResponse.json()) as {
        secure_url?: string
        public_id?: string
      }

      if (!uploaded.secure_url) {
        throw new Error("Upload failed")
      }

      const nextAttachment: SupportAttachment = {
        url: uploaded.secure_url,
        publicId: uploaded.public_id ?? "",
        fileName: file.name,
        fileType: file.type,
      }

      setForm((current) => ({
        ...current,
        attachments: [...current.attachments, nextAttachment],
      }))
    } catch (error) {
      toast.error("Upload failed", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      })
    } finally {
      setAttachmentUploading(false)
    }
  }

  function removeAttachment(index: number) {
    setForm((current) => ({
      ...current,
      attachments: current.attachments.filter((_, idx) => idx !== index),
    }))
  }

  function openReportDrawer(payload?: Partial<typeof form>) {
    if (payload) {
      setForm((current) => ({ ...current, ...payload }))
    }
    setReportDrawerOpen(true)
  }

  function openDetailsDrawer(ticket: SupportTicket) {
    setSelectedTicket(ticket)
    setDetailsDrawerOpen(true)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set("caseId", ticket.id)
    setSearchParams(nextParams, { replace: true })
  }

  function submitReport() {
    if (!form.subject.trim() || !form.message.trim()) {
      toast.error("Please complete the form", {
        description: "Subject and message are required before submitting a report.",
      })
      return
    }

    const payload = {
      kind: "report" as const,
      subject: form.subject.trim(),
      categoryId: form.categoryId,
      message: form.message.trim(),
      priority: (form.categoryId === "technical" ? "high" : "medium") as
        | "high"
        | "medium",
      attachments: form.attachments.map((attachment) => ({
        url: attachment.url,
        publicId: attachment.publicId ?? "",
        fileName: attachment.fileName ?? "",
        fileType: attachment.fileType ?? "",
      })),
    }

    createSupportCase.mutate(payload, {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: ["owner", "support-cases"] })
        setForm({
          subject: "",
          categoryId: categories[0]?.id ?? "orders",
          message: "",
          attachments: [],
        })
        setReportDrawerOpen(false)
        toast.success("Report submitted", {
          description: `"${data.subject}" has been shared with the support team.`,
        })
      },
      onError: (error) => {
        toast.error("Report could not be submitted", {
          description:
            error instanceof Error
              ? error.message
              : "Please try again or contact support directly.",
        })
      },
    })
  }

  return (
    <>
      <div className="space-y-6 px-4 lg:px-6">
        {platformContentQuery.isPending ? (
          <Card className="rounded-[28px] border-border/70 shadow-sm">
            <CardContent className="p-6 text-sm text-muted-foreground">
              Loading help resources...
            </CardContent>
          </Card>
        ) : null}
        {platformContentQuery.isError ? (
          <Card className="rounded-[28px] border-destructive/30 shadow-sm">
            <CardContent className="p-6 text-sm text-muted-foreground">
              Help resources could not be loaded right now. Support reports still work, but guides and legal contact details may be temporarily unavailable.
            </CardContent>
          </Card>
        ) : null}
        <Card className="rounded-[28px] border-border/70 shadow-sm">
          <CardContent className="space-y-5 p-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
                <LifeBuoy className="size-3.5" />
                Help Center
              </div>
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  Find answers fast and get support when needed
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Search across FAQs, guides, and support topics for orders, payouts, menu setup, promotions, and account settings.
                </p>
              </div>
            </div>

            <div className="relative">
              <Search className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search for help..." className="h-12 rounded-2xl pl-11" />
              {suggestions.length ? (
                <div className="absolute top-[calc(100%+0.5rem)] z-20 w-full rounded-2xl border bg-popover p-2 shadow-lg">
                  {suggestions.map((item) => (
                    <button
                      key={`${item.type}-${item.id}`}
                      type="button"
                      onClick={item.action}
                      className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition hover:bg-muted"
                    >
                      <div>
                        <div className="text-sm font-medium">{item.label}</div>
                        <div className="text-xs text-muted-foreground">{item.meta}</div>
                      </div>
                      <Badge variant="secondary" className="rounded-full">
                        {item.type}
                      </Badge>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant={category === "all" ? "default" : "outline"} className="rounded-full" onClick={() => setCategory("all")}>
                All Topics
              </Button>
              {categories.map((item) => (
                <Button key={item.id} variant={category === item.id ? "default" : "outline"} className="rounded-full" onClick={() => setCategory(item.id)}>
                  {item.name}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredCategories.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setCategory(item.id)}
                className={cn(
                  "rounded-[24px] border bg-card p-5 text-left shadow-sm transition hover:border-primary/40 hover:bg-primary/[0.02]",
                  category === item.id && "border-primary/50 bg-primary/[0.03]"
                )}
              >
                <div className="mb-4 flex size-11 items-center justify-center rounded-2xl border bg-primary/5 text-primary">
                  <Icon className="size-5" />
                </div>
                <h3 className="font-semibold">{item.name}</h3>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{item.description}</p>
              </button>
            )
          })}
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="space-y-6">
            <Card className="rounded-[28px] border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CircleHelp className="size-4 text-muted-foreground" />
                  FAQ
                </CardTitle>
                <CardDescription>Quick answers to common restaurant-owner questions.</CardDescription>
              </CardHeader>
              <CardContent>
                {filteredFaqs.length ? (
                  <Accordion type="single" collapsible>
                    {filteredFaqs.map((item) => (
                      <AccordionItem key={item.id} value={item.id}>
                        <AccordionTrigger className="py-4 text-sm font-medium hover:no-underline">
                          {item.question}
                        </AccordionTrigger>
                        <AccordionContent className="text-sm leading-6 text-muted-foreground">
                          {item.answer}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                ) : (
                  <Empty className="rounded-2xl">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <BadgeHelp />
                      </EmptyMedia>
                      <EmptyTitle>No FAQ matched your search</EmptyTitle>
                      <EmptyDescription>Try a broader query or switch the topic filter.</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-[28px] border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <PackageSearch className="size-4 text-muted-foreground" />
                  Quick Actions
                </CardTitle>
                <CardDescription>Start common support flows in one click.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: "Report Issue", icon: Bug, categoryId: "technical", subject: "Need help with a technical issue" },
                  { label: "Payout Timing Help", icon: CreditCard, categoryId: "payments", subject: "Need help with payout timing" },
                  { label: "Order Problem", icon: ShoppingBag, categoryId: "orders", subject: "Need help with an order issue" },
                ].map((item) => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => openReportDrawer({ categoryId: item.categoryId, subject: item.subject })}
                      className="rounded-2xl border bg-muted/15 p-4 text-left transition hover:bg-muted/30"
                    >
                      <Icon className="mb-3 size-5 text-primary" />
                      <div className="font-medium">{item.label}</div>
                    </button>
                  )
                })}
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-[28px] border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="size-4 text-muted-foreground" />
                Help Guides
              </CardTitle>
              <CardDescription>Detailed walkthroughs for common tasks and issues.</CardDescription>
            </CardHeader>
            <CardContent>
              {selectedArticle ? (
                <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
                  <div className="space-y-2">
                    {filteredArticles.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedArticleId(item.id)}
                        className={cn(
                          "w-full rounded-2xl border p-4 text-left transition hover:bg-muted/20",
                          selectedArticle.id === item.id && "border-primary/50 bg-primary/[0.03]"
                        )}
                      >
                        <div className="mb-2 text-xs font-medium text-muted-foreground">{item.readTime}</div>
                        <div className="font-medium">{item.title}</div>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.excerpt}</p>
                      </button>
                    ))}
                  </div>

                  <div className="rounded-[24px] border bg-muted/10 p-5">
                    <div className="mb-4">
                      <div className="text-xs font-medium text-muted-foreground">{selectedArticle.readTime}</div>
                      <h3 className="mt-1 text-xl font-semibold">{selectedArticle.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{selectedArticle.excerpt}</p>
                    </div>
                    <div className="space-y-5">
                      {selectedArticle.sections.map((section) => (
                        <div key={section.title} className="space-y-3">
                          <h4 className="font-medium">{section.title}</h4>
                          {section.paragraphs?.map((paragraph) => (
                            <p key={paragraph} className="text-sm leading-6 text-muted-foreground">{paragraph}</p>
                          ))}
                          {section.bullets?.map((bullet) => (
                            <div key={bullet} className="flex gap-2 text-sm leading-6 text-muted-foreground">
                              <span className="mt-2 size-1.5 rounded-full bg-primary" />
                              <span>{bullet}</span>
                            </div>
                          ))}
                          {section.steps?.map((step, index) => (
                            <div key={step} className="flex gap-3 text-sm leading-6 text-muted-foreground">
                              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                {index + 1}
                              </span>
                              <span>{step}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <Empty className="rounded-2xl">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <CircleHelp />
                    </EmptyMedia>
                    <EmptyTitle>No help guide found</EmptyTitle>
                    <EmptyDescription>Try a different search term or another topic.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="rounded-[28px] border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Send className="size-4 text-muted-foreground" />
                Contact Support
              </CardTitle>
              <CardDescription>Open a clean report drawer or contact support directly.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border bg-muted/10 p-4">
                <p className="font-medium">Need direct help?</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {supportContact?.directHelpNote ??
                    "Use the report drawer for dashboard-based tracking, or reach support directly by email or phone."}
                </p>
              </div>
              {supportPhone ? (
                <a
                  href={`tel:${supportPhone}`}
                  className="flex items-center justify-between gap-4 rounded-[24px] border border-primary/20 bg-primary/[0.04] p-4 transition hover:bg-primary/[0.07]"
                >
                  <span className="flex items-center gap-3">
                    <span className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                      <Phone className="size-5" />
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-muted-foreground">
                        Admin support phone
                      </span>
                      <span className="mt-0.5 block text-xl font-semibold tracking-tight">
                        {supportPhone}
                      </span>
                    </span>
                  </span>
                  <Badge className="rounded-full bg-primary text-primary-foreground hover:bg-primary">
                    Tap to call
                  </Badge>
                </a>
              ) : null}
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => openReportDrawer()}>
                  <Bug className="size-4" />
                  Report Issue
                </Button>
                <Button variant="outline" asChild>
                  <a href={`mailto:${supportEmail}`}>
                    <Mail className="size-4" />
                    Email Support
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <a href={`tel:${supportPhone}`}>
                    <Phone className="size-4" />
                    Call Support
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bug className="size-4 text-muted-foreground" />
                Your Reports
              </CardTitle>
              <CardDescription>Track the latest status of your support reports.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="reports">
                <TabsList>
                  <TabsTrigger value="reports">Reports</TabsTrigger>
                  <TabsTrigger value="contacts">Contacts</TabsTrigger>
                </TabsList>
                <TabsContent value="reports" className="mt-4 space-y-3">
                  {supportCasesLoading ? (
                    <div className="rounded-2xl border bg-muted/10 p-4 text-sm text-muted-foreground">
                      Loading your reports...
                    </div>
                  ) : supportCasesError ? (
                    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                      {supportCasesError}
                    </div>
                  ) : reports.length ? (
                    reports.map((ticket) => {
                      const categoryName = categories.find((item) => item.id === ticket.categoryId)?.name ?? "General"
                      return (
                        <div key={ticket.id} className="rounded-2xl border bg-muted/10 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="font-medium">{ticket.subject}</div>
                              <div className="mt-1 text-sm text-muted-foreground">
                                {ticket.id} • {categoryName}
                              </div>
                            </div>
                            <div className="flex flex-wrap justify-end gap-2">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "shrink-0 rounded-full capitalize",
                                  statusClasses[ticket.status]
                                )}
                              >
                                {ticket.status.replace("_", " ")}
                              </Badge>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "shrink-0 rounded-full capitalize",
                                  priorityClasses[ticket.priority]
                                )}
                              >
                                {ticket.priority} priority
                              </Badge>
                            </div>
                          </div>
                          <p className="mt-3 text-sm leading-6 text-muted-foreground">{ticket.message}</p>
                          {ticket.replies && ticket.replies.length > 0 ? (
                            <div className="mt-4 rounded-2xl border bg-background/70 p-3 text-sm">
                              <div className="text-xs font-medium uppercase text-muted-foreground">
                                Latest reply
                              </div>
                              <div className="mt-2 text-sm font-medium">
                                {ticket.replies[ticket.replies.length - 1]?.adminName ?? "Support Team"}
                              </div>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {ticket.replies[ticket.replies.length - 1]?.message}
                              </p>
                              <div className="mt-2 text-xs text-muted-foreground">
                                {format(
                                  new Date(
                                    ticket.replies[ticket.replies.length - 1]?.createdAt ??
                                      ticket.updatedAt
                                  ),
                                  "dd MMM yyyy, hh:mm a"
                                )}
                              </div>
                            </div>
                          ) : null}
                          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            <span>Created {format(new Date(ticket.createdAt), "dd MMM yyyy, hh:mm a")}</span>
                            <span className="inline-flex items-center gap-1">
                              <Clock3 className="size-3.5" />
                              Updated {format(new Date(ticket.updatedAt), "dd MMM yyyy, hh:mm a")}
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="ml-auto"
                              onClick={() => openDetailsDrawer(ticket)}
                            >
                              View details
                            </Button>
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <Empty className="rounded-2xl">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Bug />
                        </EmptyMedia>
                        <EmptyTitle>No reports yet</EmptyTitle>
                        <EmptyDescription>Your submitted reports will appear here.</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}
                </TabsContent>
                <TabsContent value="contacts" className="mt-4 space-y-3">
                  {[
                    { label: "Email", value: supportContact?.email ?? "", icon: Mail },
                    { label: "Phone", value: supportContact?.phone ?? "", icon: Phone },
                    { label: "Support Hours", value: supportContact?.supportHours ?? "", icon: LifeBuoy },
                  ].filter((item) => item.value).map((item) => {
                    const Icon = item.icon
                    return (
                      <div key={item.label} className="flex items-center gap-3 rounded-2xl border bg-muted/10 p-4">
                        <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                          <Icon className="size-4" />
                        </div>
                        <div>
                          <div className="font-medium">{item.label}</div>
                          <div className="text-sm text-muted-foreground">{item.value}</div>
                        </div>
                      </div>
                    )
                  })}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>

      <SupportReportDrawer
        open={reportDrawerOpen}
        onOpenChange={setReportDrawerOpen}
        form={form}
        categories={categories}
        updateForm={updateForm}
        onSubmit={submitReport}
        isSubmitting={createSupportCase.isPending}
        onAttachmentUpload={uploadAttachment}
        onAttachmentRemove={removeAttachment}
        isUploading={attachmentUploading}
      />
      <SupportCaseDetailsDrawer
        open={detailsDrawerOpen}
        onOpenChange={(open) => {
          setDetailsDrawerOpen(open)
          if (!open && searchParams.get("caseId")) {
            const nextParams = new URLSearchParams(searchParams)
            nextParams.delete("caseId")
            setSearchParams(nextParams, { replace: true })
          }
        }}
        ticket={selectedTicket}
      />
    </>
  )
}
