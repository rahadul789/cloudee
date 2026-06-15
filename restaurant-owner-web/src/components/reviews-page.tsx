import * as React from "react"

import {
  eachDayOfInterval,
  format,
} from "date-fns"
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  LoaderCircle,
  MessageSquareText,
  RotateCcw,
  Search,
  Star,
  TriangleAlert,
} from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { ReviewDetailsDrawer } from "@/components/reviews/review-details-drawer"
import { type Review } from "@/components/reviews/types"
import {
  buildOrderDateFilterQuery,
  defaultOrderDateFilter,
  getOrderDateFilterInterval,
  OrderDateFilter,
  type OrderDateFilterValue,
} from "@/components/orders/order-date-filter"
import { useReviews } from "@/components/reviews/reviews-context"
import {
  mapOwnerReview,
  type OwnerListResponse,
  type OwnerReviewResponse,
} from "@/lib/backend-mappers"
import { useOwnerReviewReplyMutation, useOwnerReviewsQuery } from "@/hooks/use-owner-api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
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
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useSearchParams } from "react-router-dom"
import { useAppStore } from "@/store/app-store"

type CommentFilter = "all" | "with-comments" | "without-comments"
type ReplyFilter = "all" | "replied" | "not-replied"
type SortKey = "latest" | "highest" | "lowest"

const pageSizeOptions = [6, 12, 24]

function patchReviewListCache(current: unknown, payload: OwnerReviewResponse) {
  if (!current || typeof current !== "object" || !("items" in (current as Record<string, unknown>))) {
    return current
  }

  const result = current as OwnerListResponse<OwnerReviewResponse>
  const exists = result.items.some((item) => item._id === payload._id)

  return {
    ...result,
    items: exists
      ? result.items.map((item) => (item._id === payload._id ? payload : item))
      : [payload, ...result.items],
    total: exists ? result.total ?? result.items.length : (result.total ?? result.items.length) + 1,
  } satisfies OwnerListResponse<OwnerReviewResponse>
}

function ReviewStars({ rating, compact = false }: { rating: number; compact?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          className={`${compact ? "size-3.5" : "size-4"} ${
            index < rating ? "fill-amber-400 text-amber-400" : "text-slate-300"
          }`}
        />
      ))}
    </div>
  )
}

function getStatusBadge(status: Review["status"]) {
  if (status === "new") {
    return <Badge className="bg-sky-600 text-white hover:bg-sky-600">New</Badge>
  }
  if (status === "flagged") {
    return (
      <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">
        Flagged
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
      Replied
    </Badge>
  )
}

export function ReviewsPage() {
  const { reviews, setReviews } = useReviews()
  const ownerAccount = useAppStore((state) => state.ownerAccount)
  const queryClient = useQueryClient()
  const reviewReplyMutation = useOwnerReviewReplyMutation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = React.useState("")
  const [selectedRating, setSelectedRating] = React.useState<"all" | `${1 | 2 | 3 | 4 | 5}`>("all")
  const [dateFilter, setDateFilter] = React.useState<OrderDateFilterValue>({
    ...defaultOrderDateFilter,
    preset: "last7Days",
  })
  const [commentFilter, setCommentFilter] = React.useState<CommentFilter>("all")
  const [replyFilter, setReplyFilter] = React.useState<ReplyFilter>("all")
  const [sortBy, setSortBy] = React.useState<SortKey>("latest")
  const [showNewOnly, setShowNewOnly] = React.useState(false)
  const [pageSize, setPageSize] = React.useState(6)
  const [pageIndex, setPageIndex] = React.useState(0)
  const [viewingReview, setViewingReview] = React.useState<Review | null>(null)
  const [replyDraft, setReplyDraft] = React.useState("")
  const [pendingReviewAction, setPendingReviewAction] = React.useState<{
    reviewId: string
    type: "save" | "delete"
  } | null>(null)
  const debouncedSearch = useDebouncedValue(search)
  const resetDisabled =
    !search &&
    selectedRating === "all" &&
    dateFilter.preset === "last7Days" &&
    !dateFilter.range &&
    commentFilter === "all" &&
    replyFilter === "all" &&
    sortBy === "latest" &&
    !showNewOnly
  const reviewDateQuery = React.useMemo(
    () => buildOrderDateFilterQuery(dateFilter),
    [dateFilter]
  )

  const reviewsQuery = useOwnerReviewsQuery(ownerAccount.isAuthenticated, {
    search: debouncedSearch.trim() || undefined,
    rating: selectedRating !== "all" ? selectedRating : undefined,
    datePreset: reviewDateQuery.preset,
    from: reviewDateQuery.from,
    to: reviewDateQuery.to,
    commentFilter: commentFilter !== "all" ? commentFilter : undefined,
    replyFilter: replyFilter !== "all" ? replyFilter : undefined,
    sortBy,
    showNewOnly: showNewOnly || undefined,
    page: pageIndex + 1,
    pageSize,
  })

  const reviewsSource = React.useMemo(() => {
    if (!reviewsQuery.data) return reviews
    return (
      reviewsQuery.data as OwnerListResponse<OwnerReviewResponse>
    ).items.map(mapOwnerReview)
  }, [reviews, reviewsQuery.data])

  React.useEffect(() => {
    setPageIndex(0)
  }, [debouncedSearch, selectedRating, dateFilter, commentFilter, replyFilter, sortBy, pageSize, showNewOnly])

  React.useEffect(() => {
    setReplyDraft(viewingReview?.reply?.message ?? "")
  }, [viewingReview])

  React.useEffect(() => {
    const reviewId = searchParams.get("review")
    if (!reviewId) return
    const matchedReview = reviewsSource.find((review) => review.id === reviewId)
    if (matchedReview) {
      setViewingReview(matchedReview)
    }
  }, [reviewsSource, searchParams])

  const averageRating = React.useMemo(() => {
    if (reviewsSource.length === 0) return 0
    return reviewsSource.reduce((sum, review) => sum + review.rating, 0) / reviewsSource.length
  }, [reviewsSource])

  const activeRange = React.useMemo(
    () => getOrderDateFilterInterval(dateFilter),
    [dateFilter]
  )

  const filteredReviews = reviewsSource

  const reviewAggregates = React.useMemo(() => {
    const interval = activeRange
    const ratingBuckets = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>
    const dayMap = new Map<string, { label: string; ratingSum: number; reviewCount: number }>()
    let positive = 0
    let neutral = 0
    let negative = 0
    let replied = 0

    filteredReviews.forEach((review) => {
      ratingBuckets[review.rating as 1 | 2 | 3 | 4 | 5] += 1
      if (review.rating >= 4) positive += 1
      else if (review.rating === 3) neutral += 1
      else negative += 1

      if (review.reply?.message) replied += 1

      const createdAt = new Date(review.createdAt)
      const dayKey = format(createdAt, "yyyy-MM-dd")
      const existing = dayMap.get(dayKey)
      if (existing) {
        existing.ratingSum += review.rating
        existing.reviewCount += 1
      } else {
        dayMap.set(dayKey, {
          label: format(createdAt, "dd MMM"),
          ratingSum: review.rating,
          reviewCount: 1,
        })
      }
    })

    return {
      ratingCounts: [5, 4, 3, 2, 1].map((rating) => ({
        rating,
        count: ratingBuckets[rating as 1 | 2 | 3 | 4 | 5] ?? 0,
      })),
      historyStats: { positive, neutral, negative, replied },
      analyticsData: eachDayOfInterval(interval).map((day) => {
        const key = format(day, "yyyy-MM-dd")
        const dayStats = dayMap.get(key)
        return {
          label: format(day, "dd MMM"),
          averageRating:
            dayStats && dayStats.reviewCount > 0
              ? Number((dayStats.ratingSum / dayStats.reviewCount).toFixed(1))
              : 0,
          reviewCount: dayStats?.reviewCount ?? 0,
        }
      }),
    }
  }, [activeRange, filteredReviews])

  const ratingCounts = reviewAggregates.ratingCounts
  const historyStats = reviewAggregates.historyStats
  const analyticsData = reviewAggregates.analyticsData

  const averageResponseHours = React.useMemo(() => {
    const repliedReviews = filteredReviews.filter((review) => review.reply?.createdAt)
    if (repliedReviews.length === 0) return 0
    const totalMs = repliedReviews.reduce((sum, review) => {
      const replyAt = new Date(review.reply?.createdAt ?? review.createdAt).getTime()
      const reviewAt = new Date(review.createdAt).getTime()
      return sum + Math.max(0, replyAt - reviewAt)
    }, 0)
    return totalMs / repliedReviews.length / 1000 / 60 / 60
  }, [filteredReviews])

  const reviewsTotal =
    (reviewsQuery.data as OwnerListResponse<OwnerReviewResponse> | undefined)
      ?.total ?? filteredReviews.length
  const pageCount = Math.max(1, Math.ceil(reviewsTotal / pageSize))
  const safePageIndex = Math.min(pageIndex, pageCount - 1)
  const paginatedReviews = React.useMemo(() => {
    return filteredReviews
  }, [filteredReviews])

  function resetFilters() {
    setSearch("")
    setSelectedRating("all")
    setDateFilter({ ...defaultOrderDateFilter, preset: "last7Days" })
    setCommentFilter("all")
    setReplyFilter("all")
    setSortBy("latest")
    setShowNewOnly(false)
  }

  function updateReview(reviewId: string, updater: (review: Review) => Review) {
    setReviews((current) =>
      current.map((review) => (review.id === reviewId ? updater(review) : review))
    )
    setViewingReview((current) =>
      current?.id === reviewId ? updater(current) : current
    )
  }

  function handleSaveReply(reviewId: string, message: string) {
    const trimmed = message.trim()
    if (!trimmed) return
    setPendingReviewAction({ reviewId, type: "save" })
    reviewReplyMutation.mutate(
      { reviewId, message: trimmed },
      {
        onSuccess: (response) => {
          const mapped = mapOwnerReview(response as OwnerReviewResponse)
          updateReview(reviewId, () => mapped)
          queryClient.setQueriesData(
            { queryKey: ["owner", "reviews"] },
            (current: unknown) => patchReviewListCache(current, response as OwnerReviewResponse)
          )
          toast.success("Reply saved.")
        },
        onError: (error) => {
          toast.error("Unable to save reply.", {
            description: error instanceof Error ? error.message : "Please try again.",
          })
        },
        onSettled: () => setPendingReviewAction(null),
      }
    )
  }

  function handleDeleteReply(reviewId: string) {
    setPendingReviewAction({ reviewId, type: "delete" })
    reviewReplyMutation.mutate(
      { reviewId, message: "" },
      {
        onSuccess: (response) => {
          const mapped = mapOwnerReview(response as OwnerReviewResponse)
          updateReview(reviewId, () => mapped)
          setReplyDraft("")
          queryClient.setQueriesData(
            { queryKey: ["owner", "reviews"] },
            (current: unknown) => patchReviewListCache(current, response as OwnerReviewResponse)
          )
          toast.success("Reply removed.")
        },
        onError: (error) => {
          toast.error("Unable to remove reply.", {
            description: error instanceof Error ? error.message : "Please try again.",
          })
        },
        onSettled: () => setPendingReviewAction(null),
      }
    )
  }

  function handleMarkAsRead(reviewId: string) {
    updateReview(reviewId, (review) => ({
      ...review,
      status: review.reply?.message ? "replied" : "flagged",
    }))
  }

  function handleExportReviews() {
    const rows = [
      ["id", "customer", "rating", "comment", "orderNumber", "source", "status", "reply", "createdAt"].join(","),
      ...filteredReviews.map((review) =>
        [
          review.id,
          `"${(review.user.isAnonymous ? "Anonymous" : review.user.name).replaceAll('"', '""')}"`,
          review.rating,
          `"${review.comment.replaceAll('"', '""')}"`,
          review.orderInfo?.orderNumber ?? "",
          review.source,
          review.status,
          `"${(review.reply?.message ?? "").replaceAll('"', '""')}"`,
          review.createdAt,
        ].join(",")
      ),
    ]

    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "reviews-export.csv"
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4 px-4 lg:px-6">
      <ReviewDetailsDrawer
        review={viewingReview}
        open={!!viewingReview}
        onOpenChange={(open) => {
          if (!open) {
            setViewingReview(null)
            if (searchParams.get("review")) {
              setSearchParams((current) => {
                const next = new URLSearchParams(current)
                next.delete("review")
                return next
              })
            }
          }
        }}
        replyDraft={replyDraft}
        onReplyDraftChange={setReplyDraft}
        onApplyTemplate={setReplyDraft}
        onSaveReply={handleSaveReply}
        onDeleteReply={handleDeleteReply}
        onMarkAsRead={handleMarkAsRead}
        isSavingReply={
          pendingReviewAction?.reviewId === viewingReview?.id &&
          pendingReviewAction?.type === "save"
        }
        isDeletingReply={
          pendingReviewAction?.reviewId === viewingReview?.id &&
          pendingReviewAction?.type === "delete"
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="text-base">Rating Summary</CardTitle>
              <p className="text-sm text-muted-foreground">
                Monitor how customers rate their delivery and food experience.
              </p>
            </div>
            <div className="rounded-2xl border bg-muted/30 px-4 py-3">
              <div className="text-3xl font-semibold tracking-tight">
                {averageRating.toFixed(1)}
                <span className="ml-1 text-base text-muted-foreground">/5</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <ReviewStars rating={Math.round(averageRating)} />
                <span className="text-sm text-muted-foreground">
                  {reviewsSource.length} reviews
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {ratingCounts.map((entry) => (
              <div key={entry.rating} className="flex items-center gap-3">
                <div className="w-10 text-sm font-medium">{entry.rating}★</div>
                <Progress
                  value={
                    reviewsSource.length === 0
                      ? 0
                      : (entry.count / reviewsSource.length) * 100
                  }
                  className="h-2.5"
                />
                <div className="w-10 text-right text-sm text-muted-foreground">
                  {entry.count}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Review Analytics</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border bg-emerald-50/70 p-4">
              <div className="text-sm text-muted-foreground">Positive</div>
              <div className="mt-2 text-3xl font-semibold text-emerald-800">
                {historyStats.positive}
              </div>
              <div className="mt-1 text-xs text-emerald-700/80">
                4 and 5 star reviews
              </div>
            </div>
            <div className="rounded-2xl border bg-rose-50/70 p-4">
              <div className="text-sm text-muted-foreground">Negative</div>
              <div className="mt-2 text-3xl font-semibold text-rose-800">
                {historyStats.negative}
              </div>
              <div className="mt-1 text-xs text-rose-700/80">
                1 and 2 star reviews
              </div>
            </div>
            <div className="rounded-2xl border bg-sky-50/70 p-4">
              <div className="text-sm text-muted-foreground">Replied</div>
              <div className="mt-2 text-3xl font-semibold text-sky-800">
                {historyStats.replied}
              </div>
              <div className="mt-1 text-xs text-sky-700/80">
                Reviews with owner response
              </div>
            </div>
            <div className="rounded-2xl border bg-amber-50/70 p-4">
              <div className="text-sm text-muted-foreground">Neutral</div>
              <div className="mt-2 text-3xl font-semibold text-amber-800">
                {historyStats.neutral}
              </div>
              <div className="mt-1 text-xs text-amber-700/80">
                3 star reviews
              </div>
            </div>
            <div className="rounded-2xl border bg-violet-50/70 p-4 sm:col-span-2">
              <div className="text-sm text-muted-foreground">Avg Response Time</div>
              <div className="mt-2 text-3xl font-semibold text-violet-800">
                {averageResponseHours.toFixed(1)}h
              </div>
              <div className="mt-1 text-xs text-violet-700/80">
                Based on replied reviews in the current filter
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-0">
          <CardTitle className="text-base">Review Trends</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analyticsData}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis
                  yAxisId="left"
                  domain={[0, 5]}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="averageRating"
                  stroke="#0f766e"
                  fill="#ccfbf1"
                  strokeWidth={2}
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="reviewCount"
                  stroke="#1d4ed8"
                  fill="#dbeafe"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-4">
          <div className="flex flex-1 flex-col gap-3 2xl:flex-row 2xl:flex-wrap">
            <div className="relative w-full lg:max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search customer, order, items, comment"
                className="pl-9"
              />
            </div>

            <Select value={selectedRating} onValueChange={(value) => setSelectedRating(value as typeof selectedRating)}>
              <SelectTrigger className="w-full lg:w-40">
                <SelectValue placeholder="Rating" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Ratings</SelectItem>
                <SelectItem value="5">5 Stars</SelectItem>
                <SelectItem value="4">4 Stars</SelectItem>
                <SelectItem value="3">3 Stars</SelectItem>
                <SelectItem value="2">2 Stars</SelectItem>
                <SelectItem value="1">1 Star</SelectItem>
              </SelectContent>
            </Select>

            <OrderDateFilter value={dateFilter} onChange={setDateFilter} />

            <Select value={commentFilter} onValueChange={(value) => setCommentFilter(value as CommentFilter)}>
              <SelectTrigger className="w-full lg:w-44">
                <SelectValue placeholder="Comments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Reviews</SelectItem>
                <SelectItem value="with-comments">With Comments</SelectItem>
                <SelectItem value="without-comments">Without Comments</SelectItem>
              </SelectContent>
            </Select>

            <Select value={replyFilter} onValueChange={(value) => setReplyFilter(value as ReplyFilter)}>
              <SelectTrigger className="w-full lg:w-44">
                <SelectValue placeholder="Replies" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Reply Status</SelectItem>
                <SelectItem value="replied">Replied</SelectItem>
                <SelectItem value="not-replied">Not Replied</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortKey)}>
              <SelectTrigger className="w-full lg:w-44">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="latest">Latest First</SelectItem>
                <SelectItem value="highest">Highest Rating</SelectItem>
                <SelectItem value="lowest">Lowest Rating</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant={showNewOnly ? "default" : "outline"}
              onClick={() => setShowNewOnly((current) => !current)}
            >
              <Filter className="size-4" />
              New Only
            </Button>

            <Button
              variant="outline"
              onClick={resetFilters}
              disabled={resetDisabled}
            >
              <RotateCcw className="size-4" />
              Reset
            </Button>
          </div>

          <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              {reviewsTotal} reviews
            </div>
            <Button
              variant="outline"
              onClick={handleExportReviews}
              className="w-full sm:w-auto"
            >
              <Download className="size-4" />
              Export CSV
            </Button>
          </div>
        </div>
      </div>

      {paginatedReviews.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <Table className="min-w-[1120px]">
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Customer</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Review</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reply</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="pr-4 text-right lg:pr-6">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedReviews.map((review) => (
                  <TableRow key={review.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">
                          {review.user.isAnonymous ? "Anonymous" : review.user.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {review.user.isAnonymous ? "Guest review" : "Verified customer"}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <ReviewStars rating={review.rating} compact />
                        <div className="text-xs text-muted-foreground">
                          {review.rating}/5
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-sm">
                      <div className="space-y-2">
                        <p className="line-clamp-3 text-sm leading-6">
                          {review.comment || "Customer submitted a rating without a written review."}
                        </p>
                        {review.orderInfo?.items?.length ? (
                          <div className="flex flex-wrap gap-1.5">
                            {review.orderInfo.items.slice(0, 2).map((item) => (
                              <Badge key={item} variant="outline">
                                {item}
                              </Badge>
                            ))}
                            {review.orderInfo.items.length > 2 ? (
                              <Badge variant="outline">
                                +{review.orderInfo.items.length - 2} more
                              </Badge>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      {review.orderInfo ? (
                        <div className="space-y-1">
                          <div className="font-medium">{review.orderInfo.orderNumber}</div>
                          <div className="text-xs text-muted-foreground">
                            {review.orderInfo.items.length} item
                            {review.orderInfo.items.length === 1 ? "" : "s"}
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">No reference</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{review.source}</Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(review.status)}</TableCell>
                    <TableCell>
                      {review.reply?.message ? (
                        <div className="max-w-52 space-y-1">
                          <div className="text-sm font-medium text-emerald-700">
                            Replied
                          </div>
                          <p className="line-clamp-2 text-xs text-muted-foreground">
                            {review.reply.message}
                          </p>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          No reply yet
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div>{format(new Date(review.createdAt), "dd MMM yyyy")}</div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(review.createdAt), "hh:mm a")}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="pr-4 text-right lg:pr-6">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setViewingReview(review)}
                        disabled={pendingReviewAction?.reviewId === review.id}
                      >
                        {pendingReviewAction?.reviewId === review.id ? (
                          <>
                            <LoaderCircle className="size-4 animate-spin" />
                            Updating...
                          </>
                        ) : review.reply?.message ? (
                          "View & Edit Reply"
                        ) : (
                          "Reply"
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : reviewsSource.length === 0 ? (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-8">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessageSquareText className="size-4" />
                </EmptyMedia>
                <EmptyTitle>No reviews yet</EmptyTitle>
                <EmptyDescription>
                  Customer ratings and feedback will appear here once your first orders are reviewed.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-8">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <TriangleAlert className="size-4" />
                </EmptyMedia>
                <EmptyTitle>No reviews match these filters</EmptyTitle>
                <EmptyDescription>
                  Try broadening the date range, comment filter, or search keyword.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" onClick={resetFilters}>
                  <RotateCcw className="size-4" />
                  Reset Filters
                </Button>
              </EmptyContent>
            </Empty>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-4 rounded-2xl border bg-card px-4 py-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="text-sm text-muted-foreground">
          Showing {paginatedReviews.length} of {reviewsTotal} review(s)
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Select value={`${pageSize}`} onValueChange={(value) => setPageSize(Number(value))}>
            <SelectTrigger className="w-full sm:w-32">
              <SelectValue placeholder="Rows" />
            </SelectTrigger>
            <SelectContent side="top">
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={`${size}`}>
                  {size} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="text-sm font-medium">
            Page {safePageIndex + 1} of {pageCount}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
              disabled={safePageIndex === 0}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() =>
                setPageIndex((current) => Math.min(pageCount - 1, current + 1))
              }
              disabled={safePageIndex >= pageCount - 1}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
