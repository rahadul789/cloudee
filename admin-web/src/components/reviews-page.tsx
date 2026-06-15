import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Archive,
  Download,
  Eye,
  Flag,
  Loader2,
  MoreHorizontal,
  RefreshCcw,
  RotateCcw,
  Search,
  Star,
} from "lucide-react"
import { toast } from "sonner"

import { useDebouncedValue } from "@/hooks/use-debounced-value"
import {
  bulkUpdateAdminReviews,
  getAdminReview,
  listAdminReviews,
  updateAdminReviewModeration,
  type AdminReview,
  type AdminReviewModerationStatus,
  type AdminReviewSort,
} from "@/lib/admin-api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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

function RatingStars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5 text-amber-500">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          className={`size-4 ${index < rating ? "fill-current" : "text-muted-foreground/30"}`}
        />
      ))}
    </div>
  )
}

function StatusBadge({ status, isHidden }: { status: AdminReviewModerationStatus; isHidden?: boolean }) {
  if (isHidden || status === "hidden") return <Badge variant="destructive">Hidden</Badge>
  if (status === "flagged") return <Badge variant="secondary">Flagged</Badge>
  return <Badge variant="default">Visible</Badge>
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

export function ReviewsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = React.useState("")
  const debouncedSearch = useDebouncedValue(search, 350)
  const [restaurantId, setRestaurantId] = React.useState("all")
  const [status, setStatus] = React.useState<"all" | AdminReviewModerationStatus>("all")
  const [rating, setRating] = React.useState<"all" | "1" | "2" | "3" | "4" | "5">("all")
  const [reply, setReply] = React.useState<"all" | "replied" | "not_replied">("all")
  const [comment, setComment] = React.useState<"all" | "with_comment" | "without_comment">("all")
  const [sortBy, setSortBy] = React.useState<AdminReviewSort>("newest")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)
  const [selectedReviewId, setSelectedReviewId] = React.useState<string | null>(null)
  const [selectedReviewIds, setSelectedReviewIds] = React.useState<string[]>([])
  const [moderationReason, setModerationReason] = React.useState("")

  React.useEffect(() => {
    setPage(1)
  }, [debouncedSearch, restaurantId, status, rating, reply, comment, sortBy, pageSize])

  const reviewsQuery = useQuery({
    queryKey: [
      "admin-reviews",
      debouncedSearch,
      restaurantId,
      status,
      rating,
      reply,
      comment,
      sortBy,
      page,
      pageSize,
    ],
    queryFn: () =>
      listAdminReviews({
        search: debouncedSearch,
        restaurantId,
        status,
        rating,
        reply,
        comment,
        sortBy,
        page,
        pageSize,
      }),
  })

  const detailsQuery = useQuery({
    queryKey: ["admin-review", selectedReviewId],
    queryFn: () => getAdminReview(selectedReviewId ?? ""),
    enabled: Boolean(selectedReviewId),
  })

  const moderationMutation = useMutation({
    mutationFn: updateAdminReviewModeration,
    onSuccess: (_, variables) => {
      toast.success(
        variables.status === "hidden"
          ? "Review hidden"
          : variables.status === "flagged"
            ? "Review flagged"
            : "Review restored"
      )
      setModerationReason("")
      void queryClient.invalidateQueries({ queryKey: ["admin-reviews"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-review", variables.reviewId] })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Review update failed"),
  })

  const bulkMutation = useMutation({
    mutationFn: bulkUpdateAdminReviews,
    onSuccess: (result, variables) => {
      toast.success(`${result.updated} reviews updated to ${variables.status}`)
      setSelectedReviewIds([])
      setModerationReason("")
      void queryClient.invalidateQueries({ queryKey: ["admin-reviews"] })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Bulk review update failed"),
  })

  const data = reviewsQuery.data
  const reviews = data?.items ?? []
  const summary = data?.summary ?? {
    total: 0,
    visible: 0,
    hidden: 0,
    flagged: 0,
    withComments: 0,
    unanswered: 0,
    averageVisibleRating: 0,
  }
  const selectedDetails = detailsQuery.data ?? null
  const selectedReview = selectedDetails?.review ?? reviews.find((review) => review.id === selectedReviewId) ?? null

  const resetFilters = () => {
    setSearch("")
    setRestaurantId("all")
    setStatus("all")
    setRating("all")
    setReply("all")
    setComment("all")
    setSortBy("newest")
    setPage(1)
    setPageSize(10)
  }

  const updateReview = (review: AdminReview, nextStatus: AdminReviewModerationStatus) => {
    moderationMutation.mutate({
      reviewId: review.id,
      status: nextStatus,
      reason: moderationReason || defaultReason(nextStatus),
    })
  }

  const updateBulk = (nextStatus: AdminReviewModerationStatus) => {
    if (!selectedReviewIds.length) {
      toast.error("Select at least one review")
      return
    }
    bulkMutation.mutate({
      reviewIds: selectedReviewIds,
      status: nextStatus,
      reason: moderationReason || defaultReason(nextStatus),
    })
  }

  const toggleSelection = (reviewId: string, checked: boolean) => {
    setSelectedReviewIds((ids) =>
      checked ? [...new Set([...ids, reviewId])] : ids.filter((id) => id !== reviewId)
    )
  }

  const exportVisibleCsv = () => {
    const rows = [
      ["reviewId", "restaurant", "customer", "order", "rating", "status", "comment", "ownerReply", "createdAt"],
      ...reviews.map((review) => [
        review.id,
        review.restaurantName,
        review.customerName,
        review.orderNumber,
        review.rating,
        review.moderationStatus,
        review.comment,
        review.ownerReplyMessage,
        review.createdAt ?? "",
      ]),
    ]
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "admin-reviews.csv"
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <span className="flex size-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <Star className="size-5" />
            </span>
            Reviews
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Moderate customer reviews, rating quality, restaurant replies, and public visibility.
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
        <MetricCard label="Total reviews" value={summary.total} helper="All customer reviews" />
        <MetricCard label="Visible" value={summary.visible} helper="Included in public ratings" />
        <MetricCard label="Hidden" value={summary.hidden} helper="Excluded from customer surfaces" />
        <MetricCard label="Flagged" value={summary.flagged} helper="Needs admin follow-up" />
        <MetricCard label="Unanswered" value={summary.unanswered} helper="No owner reply yet" />
        <MetricCard label="Avg visible rating" value={summary.averageVisibleRating.toFixed(1)} helper="Visible reviews only" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Review inbox</CardTitle>
          <CardDescription>
            Filter, audit, flag, hide, and restore reviews without losing moderation history.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.3fr_1fr_0.75fr_0.75fr_0.8fr_0.8fr_0.8fr_0.65fr]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search comment, reason, customer"
                className="pl-9"
              />
            </div>
            <Select value={restaurantId} onValueChange={setRestaurantId}>
              <SelectTrigger><SelectValue placeholder="Restaurant" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All restaurants</SelectItem>
                {(data?.restaurants ?? []).map((restaurant) => (
                  <SelectItem key={restaurant.id} value={restaurant.id}>{restaurant.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="visible">Visible</SelectItem>
                <SelectItem value="flagged">Flagged</SelectItem>
                <SelectItem value="hidden">Hidden</SelectItem>
              </SelectContent>
            </Select>
            <Select value={rating} onValueChange={(value) => setRating(value as typeof rating)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All rating</SelectItem>
                <SelectItem value="5">5 star</SelectItem>
                <SelectItem value="4">4 star</SelectItem>
                <SelectItem value="3">3 star</SelectItem>
                <SelectItem value="2">2 star</SelectItem>
                <SelectItem value="1">1 star</SelectItem>
              </SelectContent>
            </Select>
            <Select value={reply} onValueChange={(value) => setReply(value as typeof reply)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All replies</SelectItem>
                <SelectItem value="replied">Replied</SelectItem>
                <SelectItem value="not_replied">Not replied</SelectItem>
              </SelectContent>
            </Select>
            <Select value={comment} onValueChange={(value) => setComment(value as typeof comment)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All comments</SelectItem>
                <SelectItem value="with_comment">With comment</SelectItem>
                <SelectItem value="without_comment">No comment</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(value) => setSortBy(value as AdminReviewSort)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="oldest">Oldest</SelectItem>
                <SelectItem value="highest">Highest rating</SelectItem>
                <SelectItem value="lowest">Lowest rating</SelectItem>
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

          {selectedReviewIds.length ? (
            <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium">{selectedReviewIds.length} selected</p>
                <p className="text-xs text-muted-foreground">Bulk moderation will be audit logged.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" disabled={bulkMutation.isPending} onClick={() => updateBulk("flagged")}>
                  <Flag className="size-4" />
                  Flag
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={bulkMutation.isPending} onClick={() => updateBulk("hidden")}>
                  <Archive className="size-4" />
                  Hide
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={bulkMutation.isPending} onClick={() => updateBulk("visible")}>
                  <RotateCcw className="size-4" />
                  Restore
                </Button>
              </div>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={reviews.length > 0 && reviews.every((review) => selectedReviewIds.includes(review.id))}
                      onCheckedChange={(checked) =>
                        setSelectedReviewIds(
                          checked
                            ? [...new Set([...selectedReviewIds, ...reviews.map((review) => review.id)])]
                            : selectedReviewIds.filter((id) => !reviews.some((review) => review.id === id))
                        )
                      }
                    />
                  </TableHead>
                  <TableHead>Review</TableHead>
                  <TableHead>Restaurant</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Owner reply</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviewsQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center">
                      <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : reviews.length ? (
                  reviews.map((review) => (
                    <TableRow key={review.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedReviewIds.includes(review.id)}
                          onCheckedChange={(checked) => toggleSelection(review.id, Boolean(checked))}
                        />
                      </TableCell>
                      <TableCell className="max-w-[360px]">
                        <div className="space-y-1">
                          <RatingStars rating={review.rating} />
                          <p className="line-clamp-2 text-sm">{review.comment || "No written comment"}</p>
                          <p className="text-xs text-muted-foreground">{review.orderNumber || "No order number"}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{review.restaurantName}</p>
                        <p className="text-xs text-muted-foreground">{review.restaurantCity || "No city"}</p>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{review.customerName}</p>
                        <p className="text-xs text-muted-foreground">{review.customerPhone || review.customerId || "No phone"}</p>
                      </TableCell>
                      <TableCell><StatusBadge status={review.moderationStatus} isHidden={review.isHidden} /></TableCell>
                      <TableCell>
                        {review.ownerReplyMessage ? (
                          <p className="line-clamp-2 text-sm">{review.ownerReplyMessage}</p>
                        ) : (
                          <Badge variant="outline">Not replied</Badge>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(review.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => setSelectedReviewId(review.id)}>
                            <Eye className="size-4" />
                            View
                          </Button>
                          <ReviewActions review={review} onUpdate={updateReview} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                      No reviews found with the selected filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {reviews.length} of {data?.total ?? 0} reviews
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                Previous
              </Button>
              <Badge variant="outline">Page {data?.page ?? page}/{data?.pageCount ?? 1}</Badge>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= (data?.pageCount ?? 1)}
                onClick={() => setPage((value) => Math.min(data?.pageCount ?? value + 1, value + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Sheet open={Boolean(selectedReviewId)} onOpenChange={(open) => !open && setSelectedReviewId(null)}>
        <SheetContent className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-3xl! md:max-w-6xl!">
          <div className="border-b px-6 py-5">
            <SheetHeader>
              <SheetTitle>{selectedReview ? `${selectedReview.rating}-star review` : "Review details"}</SheetTitle>
              <SheetDescription>
                {selectedReview ? `${selectedReview.restaurantName} - ${selectedReview.customerName}` : "Customer review moderation"}
              </SheetDescription>
            </SheetHeader>
          </div>

          {detailsQuery.isLoading ? (
            <div className="grid flex-1 place-items-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : selectedReview && selectedDetails ? (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Moderation</CardTitle>
                    <CardDescription>Hide removes the review from public rating surfaces, while keeping an audit trail.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={selectedReview.moderationStatus} isHidden={selectedReview.isHidden} />
                      <RatingStars rating={selectedReview.rating} />
                    </div>
                    <div className="space-y-2">
                      <Label>Moderation reason</Label>
                      <Textarea
                        value={moderationReason}
                        onChange={(event) => setModerationReason(event.target.value)}
                        placeholder="Reason saved in audit trail"
                        rows={4}
                      />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <Button type="button" variant="outline" disabled={moderationMutation.isPending} onClick={() => updateReview(selectedReview, "flagged")}>
                        <Flag className="size-4" />
                        Flag
                      </Button>
                      <Button type="button" variant="outline" disabled={moderationMutation.isPending} onClick={() => updateReview(selectedReview, "hidden")}>
                        <Archive className="size-4" />
                        Hide
                      </Button>
                      <Button type="button" variant="outline" disabled={moderationMutation.isPending} onClick={() => updateReview(selectedReview, "visible")}>
                        <RotateCcw className="size-4" />
                        Restore
                      </Button>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                      <p className="font-medium">Current note</p>
                      <p className="mt-1 text-muted-foreground">
                        {selectedReview.hiddenReason || selectedReview.flaggedReason || "No moderation note yet."}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <MetricCard label="Rating" value={selectedReview.rating.toFixed(1)} helper="Customer score" />
                    <MetricCard label="Order value" value={formatCurrency(selectedDetails.order?.total ?? 0)} helper={selectedDetails.order?.orderNumber ?? "No order"} />
                    <MetricCard label="Order status" value={selectedDetails.order?.status ?? "N/A"} helper="Source order" />
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Review content</CardTitle>
                      <CardDescription>Customer review and restaurant owner reply.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="rounded-lg border p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-medium">{selectedReview.customerName}</p>
                            <p className="text-xs text-muted-foreground">{formatDate(selectedReview.createdAt)}</p>
                          </div>
                          <RatingStars rating={selectedReview.rating} />
                        </div>
                        <p className="mt-3 text-sm">{selectedReview.comment || "No written comment."}</p>
                      </div>
                      <div className="rounded-lg border p-4">
                        <p className="font-medium">Owner reply</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {selectedReview.ownerReplyMessage || "Restaurant owner has not replied yet."}
                        </p>
                        {selectedReview.ownerReplyUpdatedAt ? (
                          <p className="mt-2 text-xs text-muted-foreground">Updated {formatDate(selectedReview.ownerReplyUpdatedAt)}</p>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Order context</CardTitle>
                      <CardDescription>Useful signals for deciding whether the review looks valid.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3 sm:grid-cols-2">
                      <InfoRow label="Order" value={selectedDetails.order?.orderNumber ?? selectedReview.orderNumber ?? "N/A"} />
                      <InfoRow label="Order status" value={selectedDetails.order?.status ?? selectedReview.orderStatus ?? "N/A"} />
                      <InfoRow label="Payment" value={`${selectedDetails.order?.paymentMethod ?? "N/A"} / ${selectedDetails.order?.paymentStatus ?? "N/A"}`} />
                      <InfoRow label="Items" value={`${selectedDetails.order?.itemCount ?? 0}`} />
                      <InfoRow label="Delivered" value={formatDate(selectedDetails.order?.deliveredAt)} />
                      <InfoRow label="Restaurant" value={selectedReview.restaurantName} />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Audit trail</CardTitle>
                      <CardDescription>Admin moderation history for this review.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {selectedDetails.auditLogs.length || selectedDetails.moderationHistory.length ? (
                        <div className="space-y-2">
                          {selectedDetails.auditLogs.map((log) => (
                            <div key={log.id} className="rounded-lg border p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-medium">{log.title}</p>
                                  <p className="text-sm text-muted-foreground">{log.description || log.action}</p>
                                </div>
                                <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(log.createdAt)}</span>
                              </div>
                              <p className="mt-2 text-xs text-muted-foreground">By {log.actorName}</p>
                            </div>
                          ))}
                          {selectedDetails.auditLogs.length ? null : selectedDetails.moderationHistory.map((entry, index) => (
                            <div key={`${entry.action}-${index}`} className="rounded-lg border p-3">
                              <p className="font-medium">{entry.action}</p>
                              <p className="text-sm text-muted-foreground">{entry.reason || "No note"}</p>
                              <p className="mt-2 text-xs text-muted-foreground">{formatDate(entry.createdAt)}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                          No moderation history yet.
                        </div>
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

function defaultReason(status: AdminReviewModerationStatus) {
  if (status === "hidden") return "Hidden by admin moderation."
  if (status === "flagged") return "Flagged for admin follow-up."
  return "Restored by admin moderation."
}

function ReviewActions({
  review,
  onUpdate,
}: {
  review: AdminReview
  onUpdate: (review: AdminReview, status: AdminReviewModerationStatus) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="icon" aria-label="Open review actions">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onUpdate(review, "flagged")}>
          <Flag className="size-4" />
          Flag review
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onUpdate(review, "hidden")}>
          <Archive className="size-4" />
          Hide from public
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onUpdate(review, "visible")}>
          <RotateCcw className="size-4" />
          Restore visible
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  )
}
