import { format } from "date-fns"
import {
  CalendarClock,
  EyeOff,
  LoaderCircle,
  MessageSquareText,
  PencilLine,
  ShoppingBag,
  Smartphone,
  Star,
  User2,
  X,
} from "lucide-react"

import { type Review } from "@/components/reviews/types"
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
import { Textarea } from "@/components/ui/textarea"

function ReviewStars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          className={`size-4 ${
            index < rating
              ? "fill-amber-400 text-amber-400"
              : "text-slate-300"
          }`}
        />
      ))}
    </div>
  )
}

function getStatusBadge(status: Review["status"]) {
  if (status === "hidden") {
    return (
      <Badge variant="destructive">
        Hidden
      </Badge>
    )
  }
  if (status === "new") {
    return (
      <Badge className="bg-sky-600 text-white hover:bg-sky-600">New</Badge>
    )
  }
  if (status === "flagged") {
    return (
      <Badge
        variant="outline"
        className="border-rose-200 bg-rose-50 text-rose-700"
      >
        Flagged
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      className="border-emerald-200 bg-emerald-50 text-emerald-700"
    >
      Replied
    </Badge>
  )
}

function getHideRequestBadge(review: Review) {
  const status = review.ownerHideRequest?.status ?? "none"
  if (review.isHidden || review.moderationStatus === "hidden") {
    return (
      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
        Hidden from customers
      </Badge>
    )
  }
  if (status === "pending") {
    return (
      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
        Hide request pending
      </Badge>
    )
  }
  if (status === "rejected") {
    return (
      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
        Hide request rejected
      </Badge>
    )
  }
  return null
}

function canRequestReviewHide(review: Review) {
  const status = review.ownerHideRequest?.status ?? "none"
  return !review.isHidden && review.moderationStatus !== "hidden" && status !== "pending"
}

export function ReviewDetailsDrawer({
  review,
  open,
  onOpenChange,
  replyDraft,
  onReplyDraftChange,
  onApplyTemplate,
  onSaveReply,
  onDeleteReply,
  onMarkAsRead,
  onRequestHide,
  isSavingReply = false,
  isDeletingReply = false,
  isRequestingHide = false,
}: {
  review: Review | null
  open: boolean
  onOpenChange: (open: boolean) => void
  replyDraft: string
  onReplyDraftChange: (value: string) => void
  onApplyTemplate: (value: string) => void
  onSaveReply: (reviewId: string, reply: string) => void
  onDeleteReply: (reviewId: string) => void
  onMarkAsRead: (reviewId: string) => void
  onRequestHide: (review: Review) => void
  isSavingReply?: boolean
  isDeletingReply?: boolean
  isRequestingHide?: boolean
}) {
  if (!review) return null

  const hasReply = !!review.reply?.message
  const templates = [
    "Thanks for your feedback. We appreciate your support and hope to serve you again soon.",
    "Thanks for sharing this. We have already informed our team and will improve the experience.",
    "We are sorry this order did not meet expectations. Please give us another chance to do better.",
  ]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full max-w-none! p-0 sm:max-w-3xl! md:max-w-4xl!"
      >
        <SheetHeader className="sticky top-0 z-10 border-b bg-popover px-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <SheetTitle className="flex items-center gap-2">
                  <MessageSquareText className="size-4 text-muted-foreground" />
                  Review Details
                </SheetTitle>
                {getStatusBadge(review.status)}
                {getHideRequestBadge(review)}
              </div>
              <SheetDescription>
                Review received on {format(new Date(review.createdAt), "dd MMM yyyy, hh:mm a")}
              </SheetDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
            >
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-88px)]">
          <div className="space-y-6 px-6 py-6">
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="rounded-2xl shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">Customer</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 font-medium">
                    <User2 className="size-4 text-muted-foreground" />
                    {review.user.isAnonymous ? "Anonymous" : review.user.name}
                  </div>
                  <div className="text-muted-foreground">
                    Source: {review.source}
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">Rating</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <ReviewStars rating={review.rating} />
                  <p className="text-sm text-muted-foreground">
                    {review.rating} out of 5 stars
                  </p>
                </CardContent>
              </Card>

              <Card className="rounded-2xl shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">Order</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {review.orderInfo ? (
                    <>
                      <div className="flex items-center gap-2 font-medium">
                        <ShoppingBag className="size-4 text-muted-foreground" />
                        {review.orderInfo.orderNumber}
                      </div>
                      <div className="text-muted-foreground">
                        {review.orderInfo.items.join(", ")}
                      </div>
                    </>
                  ) : (
                    <p className="text-muted-foreground">
                      No order reference attached.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-2xl shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Customer Review</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <CalendarClock className="size-4" />
                    {format(new Date(review.createdAt), "dd MMM yyyy, hh:mm a")}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <Smartphone className="size-4" />
                    {review.source}
                  </span>
                </div>
                <div className="rounded-xl border bg-muted/30 px-4 py-4 text-sm leading-6 text-foreground">
                  {review.comment || "Customer submitted a rating without a written comment."}
                </div>
              </CardContent>
            </Card>

            {(review.isHidden || (review.ownerHideRequest?.status ?? "none") !== "none") ? (
              <Card className="rounded-2xl shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">Visibility</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {review.isHidden ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-emerald-900">
                      This review is hidden from customers and does not affect public ratings.
                    </div>
                  ) : review.ownerHideRequest?.status === "pending" ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-amber-900">
                      Admin is reviewing your hide request. Customers can still see this review until approval.
                    </div>
                  ) : review.ownerHideRequest?.status === "rejected" ? (
                    <div className="rounded-xl border bg-muted/40 px-4 py-3 text-muted-foreground">
                      Admin rejected the last hide request.
                      {review.ownerHideRequest.adminNote ? ` ${review.ownerHideRequest.adminNote}` : ""}
                    </div>
                  ) : null}
                  {review.hiddenReason ? (
                    <p className="text-muted-foreground">Admin note: {review.hiddenReason}</p>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            <Card className="rounded-2xl shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Owner Reply</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {hasReply ? (
                  <div className="rounded-xl border bg-emerald-50/60 px-4 py-3 text-sm">
                    <div className="mb-1 flex items-center gap-2 font-medium text-emerald-800">
                      <PencilLine className="size-4" />
                      Current reply
                    </div>
                    <p className="text-emerald-900">{review.reply?.message}</p>
                    <p className="mt-2 text-xs text-emerald-700/80">
                      {review.reply?.updatedAt
                        ? `Updated ${format(new Date(review.reply.updatedAt), "dd MMM yyyy, hh:mm a")}`
                        : review.reply?.createdAt
                          ? `Replied ${format(new Date(review.reply.createdAt), "dd MMM yyyy, hh:mm a")}`
                          : ""}
                    </p>
                  </div>
                ) : null}

                <div className="space-y-3">
                  <Textarea
                    value={replyDraft}
                    onChange={(event) => onReplyDraftChange(event.target.value)}
                    placeholder="Write a calm, helpful response to this customer"
                    className="min-h-28"
                  />
                  <div className="flex flex-wrap gap-2">
                    {templates.map((template) => (
                      <Button
                        key={template}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onApplyTemplate(template)}
                      >
                        Use Template
                      </Button>
                    ))}
                  </div>
                  <div className="flex flex-wrap justify-between gap-3">
                    <div className="flex gap-2">
                      {review.status === "new" ? (
                        <Button
                          variant="outline"
                          onClick={() => onMarkAsRead(review.id)}
                        >
                          Mark as Read
                        </Button>
                      ) : null}
                      {hasReply ? (
                        <Button
                          variant="outline"
                          onClick={() => onDeleteReply(review.id)}
                          disabled={isSavingReply || isDeletingReply}
                        >
                          {isDeletingReply ? (
                            <>
                              <LoaderCircle className="size-4 animate-spin" />
                              Removing...
                            </>
                          ) : (
                            "Delete Reply"
                          )}
                        </Button>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      {canRequestReviewHide(review) ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => onRequestHide(review)}
                          disabled={isRequestingHide}
                        >
                          {isRequestingHide ? (
                            <>
                              <LoaderCircle className="size-4 animate-spin" />
                              Sending...
                            </>
                          ) : (
                            <>
                              <EyeOff className="size-4" />
                              Request Hide
                            </>
                          )}
                        </Button>
                      ) : null}
                      <Button
                        onClick={() => onSaveReply(review.id, replyDraft)}
                        disabled={!replyDraft.trim() || isSavingReply || isDeletingReply}
                      >
                        {isSavingReply ? (
                          <>
                            <LoaderCircle className="size-4 animate-spin" />
                            Saving...
                          </>
                        ) : hasReply ? (
                          "Save Reply"
                        ) : (
                          "Reply to Review"
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
