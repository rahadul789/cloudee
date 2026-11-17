import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, Plus, RotateCcw, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { getAdminQuizSettings, saveAdminQuizSettings, type AdminQuizCopy, type AdminQuizTier } from "@/lib/admin-api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type TextField = { key: keyof AdminQuizCopy; label: string; hint: string; multiline?: boolean; list?: boolean }

// Grouped by where the text appears. Placeholders are filled automatically.
const GROUPS: Array<{ title: string; fields: TextField[] }> = [
  {
    title: "📤 Share (অ্যাপ থেকে Messenger-এ যায়)",
    fields: [
      { key: "shareMessage", label: "Share-এর বার্তা", hint: "{count} প্রশ্নের সংখ্যা · {url} link · {name} নাম", multiline: true },
    ],
  },
  {
    title: "🔗 Link preview (Messenger / Facebook-এ যা দেখায়)",
    fields: [
      { key: "linkTitle", label: "শিরোনাম", hint: "{name} · {count}" },
      { key: "linkDescription", label: "বিবরণ", hint: "{name} · {count}" },
    ],
  },
  {
    title: "🌐 বন্ধুর খেলার পাতা (website)",
    fields: [
      { key: "introTitle", label: "উপরের শিরোনাম", hint: "{name} · {count}" },
      { key: "introText", label: "নিচের লেখা", hint: "{name} · {count}", multiline: true },
      { key: "startButton", label: "শুরু করার বাটন", hint: "" },
      { key: "correctReactions", label: "ঠিক উত্তরে প্রতিক্রিয়া", hint: "প্রতি লাইনে একটা — এলোমেলোভাবে একটা দেখায়", list: true },
      { key: "wrongReactions", label: "ভুল উত্তরে প্রতিক্রিয়া", hint: "প্রতি লাইনে একটা — এলোমেলোভাবে একটা দেখায়", list: true },
      { key: "resultShareText", label: "ফলাফল share-এর লেখা", hint: "{name} · {score} · {total}" },
      { key: "makeOwnButton", label: "“নিজেরটা বানাও” বাটন", hint: "" },
      { key: "shareFriendsButton", label: "“অন্যদের খেলাও” বাটন", hint: "" },
    ],
  },
  {
    title: "🔔 Push (কেউ খেললে quiz-এর মালিক পায়)",
    fields: [
      { key: "pushTitle", label: "শিরোনাম", hint: "{player} · {score} · {total} · {name}" },
      { key: "pushBody", label: "লেখা", hint: "{emoji} · {title} (উপাধি) · {player}" },
    ],
  },
  {
    title: "📱 অ্যাপের Hype card (quiz বানানোর আগে)",
    fields: [
      { key: "hypeCardTitle", label: "শিরোনাম", hint: "" },
      { key: "hypeCardSubtitle", label: "নিচের লেখা", hint: "" },
    ],
  },
]

// Friend Quiz texts + result titles, editable any time (no app update): festivals, trends, inside jokes.
export function QuizCopyCard() {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ["admin", "quiz", "settings"], queryFn: getAdminQuizSettings })
  const [copy, setCopy] = React.useState<AdminQuizCopy | null>(null)
  const [tiers, setTiers] = React.useState<AdminQuizTier[]>([])
  React.useEffect(() => {
    if (query.data?.copy) setCopy(query.data.copy)
    if (query.data?.tiers) setTiers(query.data.tiers)
  }, [query.data])

  const save = useMutation({
    mutationFn: () => saveAdminQuizSettings({ copy: copy ?? undefined, tiers }),
    onSuccess: (data) => {
      queryClient.setQueryData(["admin", "quiz", "settings"], data)
      toast.success("লেখা save হয়েছে — app update ছাড়াই ৩০ সেকেন্ডের মধ্যে সব জায়গায় বদলাবে")
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Save failed"),
  })

  if (!copy) {
    return (
      <Card>
        <CardContent className="p-6">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  const dirty =
    JSON.stringify(copy) !== JSON.stringify(query.data?.copy) || JSON.stringify(tiers) !== JSON.stringify(query.data?.tiers)

  const setField = (key: keyof AdminQuizCopy, value: string, list?: boolean) =>
    setCopy({ ...copy, [key]: list ? value.split("\n") : value } as AdminQuizCopy)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quiz-এর লেখা ও ফলাফলের উপাধি</CardTitle>
        <CardDescription>
          সব লেখা এখান থেকে বদলানো যায় — ঈদ, পরীক্ষা বা ট্রেন্ডি কথা অনুযায়ী, app update ছাড়াই। {"{name}"}-এর মতো ঘরগুলো
          নিজে থেকে ভরে যায়। কোনো ঘর খালি রাখলে আগের default লেখা দেখাবে।
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {GROUPS.map((group) => (
          <div key={group.title} className="space-y-3">
            <div className="text-sm font-semibold">{group.title}</div>
            {group.fields.map((field) => {
              const raw = copy[field.key]
              const value = Array.isArray(raw) ? raw.join("\n") : String(raw ?? "")
              return (
                <div key={field.key} className="grid gap-1.5">
                  <Label htmlFor={`quiz-copy-${field.key}`}>{field.label}</Label>
                  {field.multiline || field.list ? (
                    <Textarea
                      id={`quiz-copy-${field.key}`}
                      rows={field.list ? 4 : 3}
                      value={value}
                      onChange={(event) => setField(field.key, event.target.value, field.list)}
                    />
                  ) : (
                    <Input id={`quiz-copy-${field.key}`} value={value} onChange={(event) => setField(field.key, event.target.value)} />
                  )}
                  {field.hint ? <p className="text-xs text-muted-foreground">{field.hint}</p> : null}
                </div>
              )
            })}
          </div>
        ))}

        <div className="space-y-3">
          <div className="text-sm font-semibold">🏆 ফলাফলের উপাধি</div>
          <p className="text-xs text-muted-foreground">
            স্কোরের % অনুযায়ী উপাধি। প্রতিটায় কয়েকটা রূপ দিন (প্রতি লাইনে একটা) — প্রত্যেক বন্ধু একটা পায়, আর সেটা তার জন্য বদলায় না।
          </p>
          {tiers.map((tier, index) => (
            <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[110px_80px_1fr_auto]">
              <div className="grid gap-1">
                <Label>কমপক্ষে %</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={tier.minPercent}
                  onChange={(event) =>
                    setTiers(tiers.map((item, i) => (i === index ? { ...item, minPercent: Number(event.target.value) || 0 } : item)))
                  }
                />
              </div>
              <div className="grid gap-1">
                <Label>Emoji</Label>
                <Input
                  value={tier.emoji}
                  maxLength={8}
                  onChange={(event) => setTiers(tiers.map((item, i) => (i === index ? { ...item, emoji: event.target.value } : item)))}
                />
              </div>
              <div className="grid gap-1">
                <Label>উপাধি (প্রতি লাইনে একটা)</Label>
                <Textarea
                  rows={3}
                  value={tier.labels.join("\n")}
                  onChange={(event) =>
                    setTiers(tiers.map((item, i) => (i === index ? { ...item, labels: event.target.value.split("\n") } : item)))
                  }
                />
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="self-end"
                aria-label="Remove tier"
                disabled={tiers.length <= 1}
                onClick={() => setTiers(tiers.filter((_, i) => i !== index))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          {tiers.length < 6 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTiers([...tiers, { key: `tier_${Date.now()}`, minPercent: 50, emoji: "✨", labels: ["নতুন উপাধি"] }])}
            >
              <Plus className="size-4" /> নতুন ধাপ
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Save লেখা
          </Button>
          <Button
            variant="outline"
            disabled={!dirty}
            onClick={() => {
              if (query.data?.copy) setCopy(query.data.copy)
              if (query.data?.tiers) setTiers(query.data.tiers)
            }}
          >
            <RotateCcw className="size-4" /> বাতিল
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
