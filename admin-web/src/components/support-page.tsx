import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Clock,
  Download,
  Eye,
  Inbox,
  Loader2,
  MessageSquare,
  RefreshCcw,
  Search,
  Send,
  ShieldAlert,
  UserCheck,
} from "lucide-react"
import { toast } from "sonner"
import { useSearchParams } from "react-router-dom"

import { useDebouncedValue } from "@/hooks/use-debounced-value"
import {
  addSupportInternalNote,
  getSupportCase,
  listSupportCases,
  replySupportCase,
  updateSupportCase,
  type AdminSupportCase,
  type SupportCasePriority,
  type SupportCaseStatus,
} from "@/lib/admin-api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"

function formatDate(value?: string | null) {
  if (!value) return "N/A"
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function formatCurrency(value: number) {
  return `Tk ${Math.round(value || 0).toLocaleString()}`
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ")
}

function StatusBadge({ status }: { status: SupportCaseStatus }) {
  const variant = status === "open" ? "destructive" : status === "in_progress" ? "secondary" : "outline"
  return <Badge variant={variant}>{statusLabel(status)}</Badge>
}

function PriorityBadge({ priority }: { priority: SupportCasePriority }) {
  return (
    <Badge variant={priority === "high" ? "destructive" : priority === "medium" ? "secondary" : "outline"}>
      {priority}
    </Badge>
  )
}

function SlaBadge({ item }: { item: AdminSupportCase }) {
  const variant = item.sla.key === "overdue" ? "destructive" : item.sla.key === "due_soon" ? "secondary" : "outline"
  return <Badge variant={variant}>{item.sla.label}</Badge>
}

function MetricCard({ label, value, helper }: { label: string; value: React.ReactNode; helper: string }) {
  return (
    <Card>
      <CardContent className="pt-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  )
}

export function SupportPage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = React.useState("")
  const debouncedSearch = useDebouncedValue(search, 350)
  const [source, setSource] = React.useState<"all" | "customer" | "owner" | "rider" | "admin">("all")
  const [status, setStatus] = React.useState<"all" | SupportCaseStatus>("all")
  const [priority, setPriority] = React.useState<"all" | SupportCasePriority>("all")
  const [assigned, setAssigned] = React.useState<"all" | "me" | "unassigned">("all")
  const [categoryId, setCategoryId] = React.useState("all")
  const [sla, setSla] = React.useState<"all" | "overdue" | "due_soon" | "healthy">("all")
  const [sortBy, setSortBy] = React.useState<"newest" | "oldest" | "updated" | "priority" | "sla">("updated")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)
  const [selectedCaseId, setSelectedCaseId] = React.useState<string | null>(null)
  const [replyMessage, setReplyMessage] = React.useState("")
  const [internalNote, setInternalNote] = React.useState("")
  const [resolutionNote, setResolutionNote] = React.useState("")
  const [tagInput, setTagInput] = React.useState("")

  React.useEffect(() => {
    setPage(1)
  }, [debouncedSearch, source, status, priority, assigned, categoryId, sla, sortBy, pageSize])

  React.useEffect(() => {
    const caseId = searchParams.get("caseId")
    if (caseId) setSelectedCaseId(caseId)
  }, [searchParams])

  const casesQuery = useQuery({
    queryKey: ["admin-support-cases", debouncedSearch, source, status, priority, assigned, categoryId, sla, sortBy, page, pageSize],
    queryFn: () =>
      listSupportCases({
        search: debouncedSearch,
        source,
        status,
        priority,
        assigned,
        categoryId,
        sla,
        sortBy,
        page,
        pageSize,
      }),
  })

  const detailsQuery = useQuery({
    queryKey: ["admin-support-case", selectedCaseId],
    queryFn: () => getSupportCase(selectedCaseId ?? ""),
    enabled: Boolean(selectedCaseId),
  })

  const replyMutation = useMutation({
    mutationFn: replySupportCase,
    onSuccess: (_, variables) => {
      toast.success("Reply sent")
      setReplyMessage("")
      void queryClient.invalidateQueries({ queryKey: ["admin-support-cases"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-support-case", variables.supportCaseId] })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Reply failed"),
  })

  const updateMutation = useMutation({
    mutationFn: updateSupportCase,
    onSuccess: (_, variables) => {
      toast.success("Support case updated")
      void queryClient.invalidateQueries({ queryKey: ["admin-support-cases"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-support-case", variables.supportCaseId] })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Update failed"),
  })

  const noteMutation = useMutation({
    mutationFn: addSupportInternalNote,
    onSuccess: (_, variables) => {
      toast.success("Internal note added")
      setInternalNote("")
      void queryClient.invalidateQueries({ queryKey: ["admin-support-case", variables.supportCaseId] })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Note failed"),
  })

  const data = casesQuery.data
  const items = data?.items ?? []
  const summary = data?.summary ?? { total: 0, open: 0, inProgress: 0, resolved: 0, closed: 0, highPriority: 0, unassigned: 0, overdue: 0 }
  const selectedDetails = detailsQuery.data ?? null
  const selectedCase = selectedDetails?.supportCase ?? items.find((item) => item.id === selectedCaseId) ?? null

  React.useEffect(() => {
    if (selectedCase) {
      setResolutionNote(selectedCase.resolutionNote)
      setTagInput(selectedCase.tags.join(", "))
    }
  }, [selectedCase])

  const resetFilters = () => {
    setSearch("")
    setSource("all")
    setStatus("all")
    setPriority("all")
    setAssigned("all")
    setCategoryId("all")
    setSla("all")
    setSortBy("newest")
    setPage(1)
    setPageSize(10)
  }

  const exportVisibleCsv = () => {
    const rows = [
      ["id", "source", "subject", "requester", "status", "priority", "sla", "assigned", "createdAt"],
      ...items.map((item) => [
        item.id,
        item.source,
        item.subject,
        item.requesterName,
        item.status,
        item.priority,
        item.sla.label,
        item.assignedAdminName,
        item.createdAt ?? "",
      ]),
    ]
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "support-cases.csv"
    link.click()
    URL.revokeObjectURL(url)
  }

  const saveMetadata = () => {
    if (!selectedCase) return
    updateMutation.mutate({
      supportCaseId: selectedCase.id,
      resolutionNote,
      tags: tagInput.split(",").map((tag) => tag.trim()).filter(Boolean),
    })
  }

  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <span className="flex size-9 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
              <Inbox className="size-5" />
            </span>
            Complaints / Support
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Unified support inbox for customer, restaurant owner, and rider-ready complaint workflows.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={exportVisibleCsv}>
            <Download className="size-4" />
            Export visible
          </Button>
          <Button type="button" variant="outline" onClick={resetFilters}>
            <RefreshCcw className="size-4" />
            Reset filters
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Open" value={summary.open} helper="Waiting for support action" />
        <MetricCard label="In progress" value={summary.inProgress} helper="Assigned or being handled" />
        <MetricCard label="High priority" value={summary.highPriority} helper="Sensitive cases" />
        <MetricCard label="Overdue SLA" value={summary.overdue} helper="Needs immediate attention" />
        <MetricCard label="Unassigned" value={summary.unassigned} helper="No admin assigned yet" />
        <MetricCard label="Resolved" value={summary.resolved} helper="Completed cases" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Unified inbox</CardTitle>
          <CardDescription>Search, filter, assign, reply, and resolve platform support cases.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.3fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr_0.75fr_0.65fr]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search subject, message, requester" className="pl-9" />
            </div>
            <Select value={source} onValueChange={(value) => setSource(value as typeof source)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All source</SelectItem>
                <SelectItem value="customer">Customer</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="rider">Rider</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priority} onValueChange={(value) => setPriority(value as typeof priority)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priority</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={assigned} onValueChange={(value) => setAssigned(value as typeof assigned)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All assigned</SelectItem>
                <SelectItem value="me">Assigned to me</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sla} onValueChange={(value) => setSla(value as typeof sla)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All SLA</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="due_soon">Due soon</SelectItem>
                <SelectItem value="healthy">Healthy</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(value) => setSortBy(value as typeof sortBy)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="updated">Last activity</SelectItem>
                <SelectItem value="newest">Newest created</SelectItem>
                <SelectItem value="priority">Priority</SelectItem>
                <SelectItem value="sla">SLA first</SelectItem>
                <SelectItem value="oldest">Oldest</SelectItem>
              </SelectContent>
            </Select>
            <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 rows</SelectItem>
                <SelectItem value="20">20 rows</SelectItem>
                <SelectItem value="50">50 rows</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Case</TableHead>
                  <TableHead>Requester</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>SLA</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {casesQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center">
                      <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : items.length ? (
                  items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="max-w-[380px]">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{item.source}</Badge>
                            <Badge variant="outline">{item.kind}</Badge>
                            {item.attachmentCount ? <Badge variant="secondary">{item.attachmentCount} files</Badge> : null}
                          </div>
                          <p className="font-medium">{item.subject}</p>
                          <p className="line-clamp-2 text-xs text-muted-foreground">{item.message}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{item.requesterName}</p>
                        <p className="text-xs text-muted-foreground">{item.requesterPhone || item.restaurantName || item.orderNumber || "No context"}</p>
                      </TableCell>
                      <TableCell><StatusBadge status={item.status} /></TableCell>
                      <TableCell><PriorityBadge priority={item.priority} /></TableCell>
                      <TableCell><SlaBadge item={item} /></TableCell>
                      <TableCell>{item.assignedAdminName || <Badge variant="outline">Unassigned</Badge>}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(item.updatedAt)}</TableCell>
                      <TableCell className="text-right">
                        <Button type="button" variant="outline" size="sm" onClick={() => setSelectedCaseId(item.id)}>
                          <Eye className="size-4" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                      No support cases found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-muted-foreground">Showing {items.length} of {data?.total ?? 0} cases</p>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button>
              <Badge variant="outline">Page {data?.page ?? page}/{data?.pageCount ?? 1}</Badge>
              <Button type="button" variant="outline" size="sm" disabled={page >= (data?.pageCount ?? 1)} onClick={() => setPage((value) => Math.min(data?.pageCount ?? value + 1, value + 1))}>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Sheet
        open={Boolean(selectedCaseId)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedCaseId(null)
            setSearchParams((current) => {
              current.delete("caseId")
              return current
            })
          }
        }}
      >
        <SheetContent className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-3xl! md:max-w-6xl!">
          <div className="border-b px-6 py-5">
            <SheetHeader>
              <SheetTitle>{selectedCase?.subject ?? "Support case"}</SheetTitle>
              <SheetDescription>{selectedCase ? `${selectedCase.source} support - ${selectedCase.requesterName}` : "Support details"}</SheetDescription>
            </SheetHeader>
          </div>
          {detailsQuery.isLoading ? (
            <div className="grid flex-1 place-items-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : selectedCase && selectedDetails ? (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid gap-4 lg:grid-cols-[0.82fr_1.18fr]">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Case controls</CardTitle>
                    <CardDescription>Assign, prioritize, track SLA, and resolve with audit history.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge status={selectedCase.status} />
                      <PriorityBadge priority={selectedCase.priority} />
                      <SlaBadge item={selectedCase} />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Select value={selectedCase.status} onValueChange={(value) => updateMutation.mutate({ supportCaseId: selectedCase.id, status: value as SupportCaseStatus })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="in_progress">In progress</SelectItem>
                            <SelectItem value="resolved">Resolved</SelectItem>
                            <SelectItem value="closed">Closed</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Priority</Label>
                        <Select value={selectedCase.priority} onValueChange={(value) => updateMutation.mutate({ supportCaseId: selectedCase.id, priority: value as SupportCasePriority })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="low">Low</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Assign to</Label>
                      <Select value={selectedCase.assignedAdminId || "unassigned"} onValueChange={(value) => updateMutation.mutate({ supportCaseId: selectedCase.id, assignedAdminId: value === "unassigned" ? "" : value })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {(data?.admins ?? []).map((admin) => (
                            <SelectItem key={admin.id} value={admin.id}>{admin.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Resolution note</Label>
                      <Textarea value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} rows={3} />
                    </div>
                    <div className="space-y-2">
                      <Label>Tags</Label>
                      <Input value={tagInput} onChange={(event) => setTagInput(event.target.value)} placeholder="payment, refund, urgent" />
                    </div>
                    <Button type="button" variant="outline" disabled={updateMutation.isPending} onClick={saveMetadata}>
                      <UserCheck className="size-4" />
                      Save metadata
                    </Button>

                    <div className="grid gap-2 text-sm">
                      <InfoRow icon={Clock} label="SLA due" value={formatDate(selectedCase.slaDueAt)} />
                      <InfoRow icon={ShieldAlert} label="First response" value={formatDate(selectedCase.firstResponseAt)} />
                      <InfoRow icon={MessageSquare} label="Replies" value={`${selectedCase.replyCount}`} />
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <MetricCard label="Source" value={selectedCase.source} helper={selectedCase.kind} />
                    <MetricCard label="Order" value={selectedCase.orderNumber || "N/A"} helper={selectedDetails.order?.status ?? "No order linked"} />
                    <MetricCard label="Order value" value={formatCurrency(selectedDetails.order?.total ?? 0)} helper={selectedDetails.order?.paymentMethod ?? "No payment"} />
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Conversation</CardTitle>
                      <CardDescription>Public replies are visible to the requester.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {selectedDetails.messages.map((message) => (
                        <div key={message.id} className={`rounded-lg border p-3 ${message.senderType === "admin" ? "bg-muted/30" : ""}`}>
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-medium">{message.senderName}</p>
                            <span className="text-xs text-muted-foreground">{formatDate(message.createdAt)}</span>
                          </div>
                          <p className="mt-2 text-sm">{message.message}</p>
                          {message.attachments.length ? <Badge className="mt-2" variant="outline">{message.attachments.length} attachments</Badge> : null}
                        </div>
                      ))}
                      <div className="space-y-2">
                        <Label>Reply</Label>
                        <Textarea value={replyMessage} onChange={(event) => setReplyMessage(event.target.value)} placeholder="Write a support reply" rows={4} />
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" disabled={!replyMessage.trim() || replyMutation.isPending} onClick={() => replyMutation.mutate({ supportCaseId: selectedCase.id, message: replyMessage, status: "in_progress" })}>
                            <Send className="size-4" />
                            Send reply
                          </Button>
                          <Button type="button" variant="outline" disabled={!replyMessage.trim() || replyMutation.isPending} onClick={() => replyMutation.mutate({ supportCaseId: selectedCase.id, message: replyMessage, status: "resolved" })}>
                            Reply & resolve
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Internal notes</CardTitle>
                      <CardDescription>Private admin-only notes for context and handoff.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {selectedDetails.internalNotes.length ? selectedDetails.internalNotes.map((note) => (
                        <div key={note.id} className="rounded-lg border p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-medium">{note.adminName}</p>
                            <span className="text-xs text-muted-foreground">{formatDate(note.createdAt)}</span>
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">{note.note}</p>
                        </div>
                      )) : <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No internal notes yet.</div>}
                      <Textarea value={internalNote} onChange={(event) => setInternalNote(event.target.value)} placeholder="Add private note" rows={3} />
                      <Button type="button" variant="outline" disabled={!internalNote.trim() || noteMutation.isPending} onClick={() => noteMutation.mutate({ supportCaseId: selectedCase.id, note: internalNote })}>
                        Add internal note
                      </Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">History</CardTitle>
                      <CardDescription>Support workflow and admin audit log.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {[...selectedDetails.history, ...selectedDetails.auditLogs.map((log) => ({
                        id: log.id,
                        action: log.title,
                        actorName: log.actorName,
                        note: log.description,
                        previousValue: "",
                        nextValue: "",
                        createdAt: log.createdAt,
                      }))].length ? (
                        [...selectedDetails.history, ...selectedDetails.auditLogs.map((log) => ({
                          id: log.id,
                          action: log.title,
                          actorName: log.actorName,
                          note: log.description,
                          previousValue: "",
                          nextValue: "",
                          createdAt: log.createdAt,
                        }))].map((entry) => (
                          <div key={entry.id} className="rounded-lg border p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-medium">{entry.action}</p>
                                <p className="text-sm text-muted-foreground">{entry.note || `${entry.previousValue} -> ${entry.nextValue}`}</p>
                              </div>
                              <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(entry.createdAt)}</span>
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">By {entry.actorName || "System"}</p>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No history yet.</div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  )
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <Icon className="size-4 text-muted-foreground" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  )
}
