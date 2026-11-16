import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, Loader2, Pencil, ShieldCheck, X } from "lucide-react"
import { toast } from "sonner"

import {
  approveAdminQuizSubmission,
  listAdminQuizSubmissions,
  rejectAdminQuizSubmission,
  type AdminQuizSubmission,
  type AdminQuizSubmissionStatus,
} from "@/lib/admin-api"
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

const REJECT_REASONS = ["খাবার নিয়ে না", "ব্যক্তিগত / আপত্তিকর", "আগেই এমন প্রশ্ন আছে", "বোঝা যাচ্ছে না"]

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong"
}

function when(value: string | null) {
  if (!value) return ""
  return new Date(value).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
}

type EditDraft = { id: string; text: string; options: string[] }

// Review queue for customer-suggested quiz questions. Approve → joins the bank with the author's
// name (+ coins and a push if set). Reject is silent (the customer sees it in "আমার প্রশ্ন").
export function QuizSubmissionsCard({ trustedThreshold }: { trustedThreshold: number }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = React.useState<AdminQuizSubmissionStatus>("pending")
  const query = useQuery({
    queryKey: ["admin", "quiz", "submissions", status],
    queryFn: () => listAdminQuizSubmissions(status),
  })
  const [editing, setEditing] = React.useState<EditDraft | null>(null)
  const [rejecting, setRejecting] = React.useState<AdminQuizSubmission | null>(null)
  const [reason, setReason] = React.useState("")

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "quiz", "submissions"] })
    void queryClient.invalidateQueries({ queryKey: ["admin", "quiz", "questions"] })
  }

  const approve = useMutation({
    mutationFn: (params: { id: string; edits?: { text?: string; options?: string[] } }) =>
      approveAdminQuizSubmission(params.id, params.edits),
    onSuccess: (data) => {
      refresh()
      setEditing(null)
      toast.success(data.rewardCoins ? `Approved · ${data.rewardCoins} coin দেওয়া হয়েছে` : "Approved — ভাণ্ডারে যোগ হয়েছে")
    },
    onError: (error) => toast.error(errorText(error)),
  })

  const reject = useMutation({
    mutationFn: (params: { id: string; reason: string }) => rejectAdminQuizSubmission(params.id, params.reason),
    onSuccess: () => {
      refresh()
      setRejecting(null)
      setReason("")
      toast.success("Rejected")
    },
    onError: (error) => toast.error(errorText(error)),
  })

  const items = query.data?.items ?? []
  const pendingCount = query.data?.pendingCount ?? 0

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            Customer-দের জমা দেওয়া প্রশ্ন
            {pendingCount ? <Badge className="bg-amber-500 text-black hover:bg-amber-500">{pendingCount} অপেক্ষায়</Badge> : null}
          </CardTitle>
          <CardDescription>
            Approve করলে প্রশ্নটা সবার ভাণ্ডারে যায়, নিচে লেখকের নাম দেখায়। দরকার হলে বানান ঠিক করে approve করুন।
          </CardDescription>
        </div>
        <Tabs value={status} onValueChange={(value) => setStatus(value as AdminQuizSubmissionStatus)}>
          <TabsList>
            <TabsTrigger value="pending">অপেক্ষায়</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.isLoading ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : !items.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {status === "pending" ? "নতুন কোনো প্রশ্ন নেই 🎉" : "এখানে কিছু নেই"}
          </p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-lg border p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">✍️ {item.authorName}</span>
                {item.authorApprovedCount >= trustedThreshold ? (
                  <Badge variant="secondary" className="gap-1">
                    <ShieldCheck className="size-3" /> বিশ্বস্ত ({item.authorApprovedCount})
                  </Badge>
                ) : item.authorApprovedCount ? (
                  <Badge variant="outline">{item.authorApprovedCount}টা approved</Badge>
                ) : null}
                {item.autoApproved ? <Badge variant="outline">নিজে থেকে approved</Badge> : null}
                <span>{when(item.createdAt)}</span>
              </div>
              <div className="font-medium">{item.text}</div>
              <div className="mt-1 text-sm text-muted-foreground">{item.options.join(" · ")}</div>
              {item.status === "rejected" && item.rejectReason ? (
                <div className="mt-1 text-xs text-red-600">কারণ: {item.rejectReason}</div>
              ) : null}
              {item.status === "pending" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate({ id: item.id })}>
                    <Check className="size-4" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setEditing({
                        id: item.id,
                        text: item.text,
                        options: [0, 1, 2, 3].map((index) => item.options[index] ?? ""),
                      })
                    }
                  >
                    <Pencil className="size-4" /> ঠিক করে approve
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setRejecting(item)}>
                    <X className="size-4" /> Reject
                  </Button>
                </div>
              ) : null}
            </div>
          ))
        )}
      </CardContent>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => (!open ? setEditing(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ঠিক করে approve</DialogTitle>
            <DialogDescription>বানান বা লেখা ঠিক করুন — লেখকের নাম একই থাকবে।</DialogDescription>
          </DialogHeader>
          {editing ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="quiz-sub-text">প্রশ্ন</Label>
                <Input
                  id="quiz-sub-text"
                  maxLength={140}
                  value={editing.text}
                  onChange={(event) => setEditing({ ...editing, text: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>উত্তরগুলো</Label>
                {editing.options.map((option, index) => (
                  <Input
                    key={index}
                    maxLength={80}
                    value={option}
                    placeholder={`উত্তর ${index + 1}${index >= 2 ? " (ঐচ্ছিক)" : ""}`}
                    onChange={(event) => {
                      const options = [...editing.options]
                      options[index] = event.target.value
                      setEditing({ ...editing, options })
                    }}
                  />
                ))}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              বাতিল
            </Button>
            <Button
              disabled={
                !editing ||
                approve.isPending ||
                editing.text.trim().length < 4 ||
                editing.options.filter((option) => option.trim()).length < 2
              }
              onClick={() =>
                editing &&
                approve.mutate({
                  id: editing.id,
                  edits: { text: editing.text.trim(), options: editing.options.map((option) => option.trim()).filter(Boolean) },
                })
              }
            >
              {approve.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(rejecting)} onOpenChange={(open) => (!open ? setRejecting(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject করবেন?</DialogTitle>
            <DialogDescription>Customer কোনো push পাবে না — অ্যাপে "আমার প্রশ্ন"-তে কারণটা দেখবে।</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            {REJECT_REASONS.map((item) => (
              <Button key={item} size="sm" variant={reason === item ? "default" : "outline"} onClick={() => setReason(item)}>
                {item}
              </Button>
            ))}
          </div>
          <Input maxLength={160} value={reason} placeholder="অথবা নিজে লিখুন (ঐচ্ছিক)" onChange={(event) => setReason(event.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>
              বাতিল
            </Button>
            <Button
              variant="destructive"
              disabled={reject.isPending}
              onClick={() => rejecting && reject.mutate({ id: rejecting.id, reason: reason.trim() })}
            >
              {reject.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
