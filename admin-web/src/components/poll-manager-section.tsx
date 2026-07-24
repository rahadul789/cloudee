import * as React from "react"
import { BarChart3, Loader2, Plus, RefreshCcw, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  closeAdminPoll,
  createAdminPoll,
  getAdminPollDetail,
  listAdminPolls,
  uploadAdminMedia,
  type AdminPollDetail,
  type AdminPollSummary,
} from "@/lib/admin-cms-api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

function fromDatetimeLocalValue(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

type OptionDraft = { id: string; label: string }

const EMPTY_FORM = {
  question: "",
  imageUrl: "",
  imagePublicId: "",
  options: [] as OptionDraft[],
  allowFeedback: false,
  feedbackPrompt: "Tell us more (optional)",
  showResultsToUser: false,
  thanksMessage: "Thanks for sharing your opinion!",
  endsAt: "",
}

// Live results + comments for one poll. Fetched on demand (expand / mount).
function PollResultsView({ pollId }: { pollId: string }) {
  const [detail, setDetail] = React.useState<AdminPollDetail | null>(null)
  const [loading, setLoading] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      setDetail(await getAdminPollDetail(pollId))
    } catch {
      toast.error("Could not load results")
    } finally {
      setLoading(false)
    }
  }, [pollId])

  React.useEffect(() => {
    void load()
  }, [load])

  if (loading && !detail) {
    return <p className="text-xs text-muted-foreground">Loading results…</p>
  }
  if (!detail) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {detail.total} vote{detail.total === 1 ? "" : "s"}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <RefreshCcw className="size-3" />
          )}
        </Button>
      </div>
      <div className="space-y-2">
        {detail.options.map((option) => {
          const pct =
            detail.total > 0 ? Math.round((option.count / detail.total) * 100) : 0
          return (
            <div key={option.id} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{option.label || "—"}</span>
                <span className="text-muted-foreground">
                  {option.count} ({pct}%)
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
      {detail.feedback.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold">Comments ({detail.feedback.length})</p>
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {detail.feedback.map((item, index) => (
              <div key={index} className="rounded-md border bg-muted/30 p-2">
                <p className="text-xs">{item.feedback}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {item.optionLabel ? `${item.optionLabel} · ` : ""}
                  {new Date(item.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function PollManagerSection() {
  const [polls, setPolls] = React.useState<AdminPollSummary[]>([])
  const [loading, setLoading] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [form, setForm] = React.useState(EMPTY_FORM)
  const [expandedHistory, setExpandedHistory] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      setPolls(await listAdminPolls())
    } catch {
      toast.error("Could not load polls")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const activePoll = polls.find((poll) => poll.status === "active" && !poll.isEnded) ?? null
  const pastPolls = polls.filter((poll) => poll !== activePoll)

  function setField<K extends keyof typeof EMPTY_FORM>(
    key: K,
    value: (typeof EMPTY_FORM)[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function addOption() {
    setForm((current) => ({
      ...current,
      options: [...current.options, { id: crypto.randomUUID(), label: "" }],
    }))
  }

  function updateOption(id: string, label: string) {
    setForm((current) => ({
      ...current,
      options: current.options.map((option) =>
        option.id === id ? { ...option, label } : option,
      ),
    }))
  }

  function removeOption(id: string) {
    setForm((current) => ({
      ...current,
      options: current.options.filter((option) => option.id !== id),
    }))
  }

  async function handleImage(file?: File | null) {
    if (!file) return
    setUploading(true)
    try {
      const asset = await uploadAdminMedia(file)
      setForm((current) => ({
        ...current,
        imageUrl: asset.url,
        imagePublicId: asset.publicId,
      }))
    } catch {
      toast.error("Image upload failed")
    } finally {
      setUploading(false)
    }
  }

  async function handleCreate() {
    const options = form.options
      .map((option) => ({ id: option.id, label: option.label.trim() }))
      .filter((option) => option.label)
    if (options.length < 1) {
      toast.error("Add at least one option")
      return
    }
    setSubmitting(true)
    try {
      await createAdminPoll({
        question: form.question.trim(),
        imageUrl: form.imageUrl,
        imagePublicId: form.imagePublicId,
        options,
        allowFeedback: form.allowFeedback,
        feedbackPrompt: form.feedbackPrompt.trim(),
        showResultsToUser: form.showResultsToUser,
        thanksMessage: form.thanksMessage.trim(),
        endsAt: fromDatetimeLocalValue(form.endsAt),
      })
      toast.success("Poll created and live")
      setForm(EMPTY_FORM)
      await load()
    } catch {
      toast.error("Could not create poll")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleClose(pollId: string) {
    try {
      await closeAdminPoll(pollId)
      toast.success("Poll closed")
      await load()
    } catch {
      toast.error("Could not close poll")
    }
  }

  return (
    <div className="space-y-5">
      {activePoll ? (
        <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Badge>Active</Badge>
                {activePoll.endsAt ? (
                  <span className="text-xs text-muted-foreground">
                    Ends {new Date(activePoll.endsAt).toLocaleString()}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm font-semibold">
                {activePoll.question || "(image-only poll)"}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleClose(activePoll.pollId)}
            >
              Close poll
            </Button>
          </div>
          <PollResultsView pollId={activePoll.pollId} />
          <p className="text-xs text-muted-foreground">
            Close this poll to create a new one.
          </p>
        </div>
      ) : (
        <div className="space-y-4 rounded-lg border p-4">
          <p className="text-sm font-semibold">Create a poll</p>

          <div className="grid gap-2 rounded-lg border bg-muted/20 p-3">
            <Label>Image (optional — shown as the poll banner)</Label>
            {form.imageUrl ? (
              <div className="flex items-center gap-3">
                <img
                  src={form.imageUrl}
                  alt=""
                  className="h-16 w-24 rounded-md object-cover"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setForm((c) => ({ ...c, imageUrl: "", imagePublicId: "" }))}
                >
                  Remove
                </Button>
              </div>
            ) : null}
            <Input
              type="file"
              accept="image/*"
              disabled={uploading}
              onChange={(event) => void handleImage(event.target.files?.[0])}
            />
          </div>

          <div className="space-y-2">
            <Label>Question (optional if the image asks it)</Label>
            <Input
              value={form.question}
              onChange={(event) => setField("question", event.target.value)}
              placeholder="e.g. Which cuisine should we add next?"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Options</Label>
              <Button type="button" variant="outline" size="sm" onClick={addOption}>
                <Plus className="mr-1 size-3" /> Add option
              </Button>
            </div>
            {form.options.length === 0 ? (
              <p className="text-xs text-muted-foreground">Add at least one option.</p>
            ) : null}
            <div className="space-y-2">
              {form.options.map((option, index) => (
                <div key={option.id} className="flex items-center gap-2">
                  <Input
                    value={option.label}
                    onChange={(event) => updateOption(option.id, event.target.value)}
                    placeholder={`Option ${index + 1}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeOption(option.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>Allow comment</Label>
                <p className="text-xs text-muted-foreground">Optional opinion text box.</p>
              </div>
              <Switch
                checked={form.allowFeedback}
                onCheckedChange={(checked) => setField("allowFeedback", checked)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>Show results to users</Label>
                <p className="text-xs text-muted-foreground">After they vote.</p>
              </div>
              <Switch
                checked={form.showResultsToUser}
                onCheckedChange={(checked) => setField("showResultsToUser", checked)}
              />
            </div>
          </div>

          {form.allowFeedback ? (
            <div className="space-y-2">
              <Label>Comment prompt</Label>
              <Input
                value={form.feedbackPrompt}
                onChange={(event) => setField("feedbackPrompt", event.target.value)}
                placeholder="Tell us more (optional)"
              />
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Thank-you message</Label>
              <Input
                value={form.thanksMessage}
                onChange={(event) => setField("thanksMessage", event.target.value)}
                placeholder="Thanks for sharing your opinion!"
              />
            </div>
            <div className="space-y-2">
              <Label>Ends at (optional)</Label>
              <Input
                type="datetime-local"
                value={form.endsAt}
                onChange={(event) => setField("endsAt", event.target.value)}
              />
            </div>
          </div>

          <Button type="button" onClick={() => void handleCreate()} disabled={submitting}>
            {submitting ? (
              <Loader2 className="mr-1 size-4 animate-spin" />
            ) : (
              <Plus className="mr-1 size-4" />
            )}
            Create &amp; publish poll
          </Button>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <BarChart3 className="size-4" /> Poll history
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <RefreshCcw className="size-3" />
            )}
          </Button>
        </div>
        {pastPolls.length === 0 ? (
          <p className="text-xs text-muted-foreground">No past polls yet.</p>
        ) : (
          <div className="space-y-2">
            {pastPolls.map((poll) => {
              const expanded = expandedHistory === poll.pollId
              return (
                <div key={poll.pollId} className="rounded-lg border">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 p-3 text-left"
                    onClick={() =>
                      setExpandedHistory(expanded ? null : poll.pollId)
                    }
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {poll.question || "(image-only poll)"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {poll.totalVotes} vote{poll.totalVotes === 1 ? "" : "s"} ·{" "}
                        {new Date(poll.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant={poll.status === "active" ? "default" : "secondary"}>
                      {poll.status === "active" ? "Active" : "Closed"}
                    </Badge>
                  </button>
                  {expanded ? (
                    <div className="border-t p-3">
                      <PollResultsView pollId={poll.pollId} />
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
