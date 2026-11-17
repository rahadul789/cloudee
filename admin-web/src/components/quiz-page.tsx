import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Eye,
  EyeOff,
  Gamepad2,
  Link2,
  Loader2,
  MousePointerClick,
  Pencil,
  Plus,
  Share2,
  Trash2,
  Trophy,
  Users,
} from "lucide-react"
import { toast } from "sonner"

import {
  createAdminQuizQuestion,
  deleteAdminQuizQuestion,
  getAdminQuizSettings,
  getAdminQuizStats,
  listAdminQuizQuestions,
  saveAdminQuizSettings,
  setAdminQuizPlayHidden,
  updateAdminQuizQuestion,
  type AdminQuizQuestion,
  type AdminQuizSettings,
} from "@/lib/admin-api"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { QuizSubmissionsCard } from "@/components/quiz-submissions-card"
import { QuizCopyCard } from "@/components/quiz-copy-card"

const CATEGORIES: Record<string, string> = {
  favourite: "🍗 প্রিয় খাবার",
  habit: "🌶️ খাওয়ার অভ্যাস",
  hunger: "🌙 খিদের সময়",
  treat: "🧾 ট্রিট ও বন্ধুত্ব",
  fun: "😂 মজার",
  seasonal: "❄️ মৌসুমি",
}

const QUIZ_KEY = ["admin", "quiz"] as const

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong"
}

function dateTime(value: string | null) {
  if (!value) return "—"
  return new Date(value).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
}

type QuestionDraft = { id?: string; text: string; category: string; options: string[]; isActive: boolean }
const EMPTY_DRAFT: QuestionDraft = { text: "", category: "fun", options: ["", "", "", ""], isActive: true }

// Friend quiz ("তুমি আমাকে কতটা চেনো?"): customers make a quiz about themselves in the app,
// friends play it on foodbela.com/q/... without the app. Written for non-technical admins.
export function QuizPage() {
  const queryClient = useQueryClient()
  const settingsQuery = useQuery({ queryKey: [...QUIZ_KEY, "settings"], queryFn: getAdminQuizSettings })
  const questionsQuery = useQuery({ queryKey: [...QUIZ_KEY, "questions"], queryFn: listAdminQuizQuestions })
  const statsQuery = useQuery({ queryKey: [...QUIZ_KEY, "stats"], queryFn: () => getAdminQuizStats(30) })

  const [draft, setDraft] = React.useState<AdminQuizSettings | null>(null)
  React.useEffect(() => {
    if (settingsQuery.data) setDraft(settingsQuery.data)
  }, [settingsQuery.data])

  const saveSettings = useMutation({
    mutationFn: (patch: Partial<AdminQuizSettings>) => saveAdminQuizSettings(patch),
    onSuccess: (data) => {
      queryClient.setQueryData([...QUIZ_KEY, "settings"], data)
      toast.success("Quiz settings saved")
    },
    onError: (error) => toast.error(errorText(error)),
  })

  const [editing, setEditing] = React.useState<QuestionDraft | null>(null)
  const [deleting, setDeleting] = React.useState<AdminQuizQuestion | null>(null)

  const saveQuestion = useMutation({
    mutationFn: async (value: QuestionDraft) => {
      const payload = {
        text: value.text.trim(),
        category: value.category,
        isActive: value.isActive,
        options: value.options.map((option) => option.trim()).filter(Boolean),
      }
      return value.id ? updateAdminQuizQuestion(value.id, payload) : createAdminQuizQuestion(payload)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...QUIZ_KEY, "questions"] })
      setEditing(null)
      toast.success("Question saved")
    },
    onError: (error) => toast.error(errorText(error)),
  })

  const toggleQuestion = useMutation({
    mutationFn: (question: AdminQuizQuestion) => updateAdminQuizQuestion(question.id, { isActive: !question.isActive }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [...QUIZ_KEY, "questions"] }),
    onError: (error) => toast.error(errorText(error)),
  })

  const removeQuestion = useMutation({
    mutationFn: (id: string) => deleteAdminQuizQuestion(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...QUIZ_KEY, "questions"] })
      setDeleting(null)
      toast.success("Question deleted")
    },
    onError: (error) => toast.error(errorText(error)),
  })

  const togglePlay = useMutation({
    mutationFn: (play: { id: string; hidden: boolean }) => setAdminQuizPlayHidden(play.id, !play.hidden),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [...QUIZ_KEY, "stats"] }),
    onError: (error) => toast.error(errorText(error)),
  })

  const questions = questionsQuery.data ?? []
  const activeCount = questions.filter((question) => question.isActive).length
  const stats = statsQuery.data
  const dirty = Boolean(draft && settingsQuery.data && JSON.stringify(draft) !== JSON.stringify(settingsQuery.data))
  const tooFewQuestions = Boolean(draft && activeCount < draft.questionCount)

  const kpis = stats
    ? [
        { label: "Quiz বানানো হয়েছে", value: stats.quizzesRecent, hint: `${stats.creators} জন customer`, icon: Gamepad2 },
        { label: "Link খোলা হয়েছে", value: stats.linkViews, hint: `${stats.liveQuizzes}টা quiz এখন চালু`, icon: Link2 },
        { label: "বন্ধুরা খেলেছে", value: stats.playsCompleted, hint: `প্রতি quiz-এ গড়ে ${stats.playsPerQuiz} জন`, icon: Users },
        { label: "শেষ পর্যন্ত খেলেছে", value: `${stats.completionRate}%`, hint: `${stats.playsStarted} জন শুরু করেছিল`, icon: Trophy },
        { label: "\"নিজেরটা বানাও\" চাপ", value: stats.makeOwnClicks, hint: "বন্ধু → অ্যাপে আসার চেষ্টা", icon: MousePointerClick },
      ]
    : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Friend Quiz — “তুমি আমাকে কতটা চেনো?”</h1>
        <p className="text-sm text-muted-foreground">
          Customer অ্যাপে নিজের সম্পর্কে খাবারের প্রশ্নের উত্তর দেয়, Messenger-এ link পাঠায়। বন্ধুরা অ্যাপ ছাড়াই
          website-এ খেলে, leaderboard-এ ওঠে, আর customer দেখে কে কোথায় ভুল করেছে।
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>চালু / বন্ধ</CardTitle>
          <CardDescription>বন্ধ থাকলে অ্যাপে quiz card একদম দেখাবে না, আর পুরনো link-ও কাজ করবে না।</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {!draft ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                {(
                  [
                    ["enabled", "Quiz চালু", "Hype tab-এর উপরে quiz card দেখাবে"],
                    ["deliveredPrompt", "অর্ডার পৌঁছানোর পরে প্রস্তাব", "Delivered পাতায় ছোট \"quiz বানাও\" card"],
                    ["notifyOnPlay", "কেউ খেললে push", "\"রাকিব তোমাকে ৭/১০ চেনে!\" (৩ মিনিটে একবার)"],
                  ] as const
                ).map(([key, label, hint]) => (
                  <label key={key} className="flex items-start gap-3 rounded-lg border p-3">
                    <Switch checked={draft[key]} onCheckedChange={(checked) => setDraft({ ...draft, [key]: checked })} />
                    <span>
                      <span className="block text-sm font-medium">{label}</span>
                      <span className="block text-xs text-muted-foreground">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-2 md:max-w-lg">
                <div className="space-y-1.5">
                  <Label htmlFor="quiz-count">প্রতি quiz-এ প্রশ্ন (৫–১৫)</Label>
                  <Input
                    id="quiz-count"
                    type="number"
                    min={5}
                    max={15}
                    value={draft.questionCount}
                    onChange={(event) => setDraft({ ...draft, questionCount: Number(event.target.value) || 10 })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="quiz-expiry">Link কত দিন চলবে</Label>
                  <Input
                    id="quiz-expiry"
                    type="number"
                    min={1}
                    max={365}
                    value={draft.linkExpiryDays}
                    onChange={(event) => setDraft({ ...draft, linkExpiryDays: Number(event.target.value) || 30 })}
                  />
                </div>
              </div>
              <div className="space-y-3 rounded-lg border border-dashed p-4">
                <div>
                  <div className="text-sm font-semibold">Customer-রা প্রশ্ন জমা দিতে পারবে</div>
                  <div className="text-xs text-muted-foreground">
                    অ্যাপে "💡 নিজের মজার প্রশ্ন দাও" দেখাবে। জমা পড়া প্রশ্ন নিচে review করুন।
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  {(
                    [
                      ["submissionsEnabled", "প্রশ্ন জমা দেওয়া চালু", "একজন একসাথে সর্বোচ্চ ৩টা অপেক্ষায় রাখতে পারবে"],
                      ["showAuthorName", "লেখকের নাম দেখাও", "\"✍️ প্রশ্ন: রাকিব\" — অ্যাপ ও website-এ"],
                      ["trustedAutoApprove", "বিশ্বস্তদের নিজে থেকে approve", "যার যথেষ্ট প্রশ্ন approved, তার নতুনগুলো সরাসরি চালু"],
                    ] as const
                  ).map(([key, label, hint]) => (
                    <label key={key} className="flex items-start gap-3 rounded-lg border p-3">
                      <Switch checked={draft[key]} onCheckedChange={(checked) => setDraft({ ...draft, [key]: checked })} />
                      <span>
                        <span className="block text-sm font-medium">{label}</span>
                        <span className="block text-xs text-muted-foreground">{hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <div className="grid gap-4 sm:grid-cols-2 md:max-w-lg">
                  <div className="space-y-1.5">
                    <Label htmlFor="quiz-coins">Approve হলে কত coin (০ = নেই)</Label>
                    <Input
                      id="quiz-coins"
                      type="number"
                      min={0}
                      max={500}
                      value={draft.approveRewardCoins}
                      onChange={(event) => setDraft({ ...draft, approveRewardCoins: Math.max(0, Number(event.target.value) || 0) })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="quiz-trusted">কয়টা approved হলে "বিশ্বস্ত"</Label>
                    <Input
                      id="quiz-trusted"
                      type="number"
                      min={1}
                      max={50}
                      value={draft.trustedThreshold}
                      onChange={(event) => setDraft({ ...draft, trustedThreshold: Number(event.target.value) || 3 })}
                    />
                  </div>
                </div>
              </div>
              {tooFewQuestions ? (
                <p className="text-sm text-amber-700">
                  চালু প্রশ্ন মাত্র {activeCount}টা — প্রতি quiz-এ {draft.questionCount}টা চাইলে আরও প্রশ্ন চালু করুন।
                </p>
              ) : null}
              <Button
                disabled={!dirty || saveSettings.isPending}
                onClick={() => {
                  const {
                    enabled,
                    deliveredPrompt,
                    notifyOnPlay,
                    questionCount,
                    linkExpiryDays,
                    submissionsEnabled,
                    showAuthorName,
                    approveRewardCoins,
                    trustedAutoApprove,
                    trustedThreshold,
                  } = draft
                  saveSettings.mutate({
                    enabled,
                    deliveredPrompt,
                    notifyOnPlay,
                    questionCount,
                    linkExpiryDays,
                    submissionsEnabled,
                    showAuthorName,
                    approveRewardCoins,
                    trustedAutoApprove,
                    trustedThreshold,
                  })
                }}
              >
                {saveSettings.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Save
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="space-y-1 p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <kpi.icon className="size-4" />
                {kpi.label}
              </div>
              <div className="text-2xl font-semibold">{kpi.value}</div>
              <div className="text-xs text-muted-foreground">{kpi.hint}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      {stats ? <p className="-mt-3 text-xs text-muted-foreground">শেষ {stats.days} দিনের হিসাব · সব মিলিয়ে {stats.quizzesTotal}টা quiz</p> : null}

      <QuizCopyCard />

      <QuizSubmissionsCard trustedThreshold={draft?.trustedThreshold ?? 3} />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>প্রশ্নের ভাণ্ডার</CardTitle>
            <CardDescription>
              {activeCount}টা চালু / মোট {questions.length}টা। Customer এখান থেকে এলোমেলো প্রশ্ন পায়, পছন্দ না হলে বদলাতে পারে।
              প্রশ্ন বদলালে আগে বানানো quiz-এ প্রভাব পড়ে না।
            </CardDescription>
          </div>
          <Button onClick={() => setEditing({ ...EMPTY_DRAFT, options: [...EMPTY_DRAFT.options] })}>
            <Plus className="size-4" /> নতুন প্রশ্ন
          </Button>
        </CardHeader>
        <CardContent>
          {questionsQuery.isLoading ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>চালু</TableHead>
                  <TableHead>প্রশ্ন ও উত্তর</TableHead>
                  <TableHead>ধরন</TableHead>
                  <TableHead className="text-right">ব্যবহার</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {questions.map((question) => (
                  <TableRow key={question.id} className={question.isActive ? "" : "opacity-50"}>
                    <TableCell>
                      <Switch checked={question.isActive} onCheckedChange={() => toggleQuestion.mutate(question)} />
                    </TableCell>
                    <TableCell className="max-w-md whitespace-normal">
                      <div className="font-medium">{question.text}</div>
                      <div className="text-xs text-muted-foreground">{question.options.map((option) => option.label).join(" · ")}</div>
                      {question.source === "customer" ? (
                        <div className="mt-0.5 text-xs font-medium text-amber-700">✍️ {question.authorName || "Customer"}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs">{CATEGORIES[question.category] ?? question.category}</TableCell>
                    <TableCell className="text-right">{question.useCount}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Edit"
                          onClick={() =>
                            setEditing({
                              id: question.id,
                              text: question.text,
                              category: question.category,
                              isActive: question.isActive,
                              options: [0, 1, 2, 3].map((index) => question.options[index]?.label ?? ""),
                            })
                          }
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => setDeleting(question)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>সবচেয়ে জনপ্রিয় quiz</CardTitle>
            <CardDescription>যেগুলো সবচেয়ে বেশি বন্ধু খেলেছে (শেষ ৩০ দিন)।</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>কার quiz</TableHead>
                  <TableHead className="text-right">খেলেছে</TableHead>
                  <TableHead className="text-right">খুলেছে</TableHead>
                  <TableHead className="text-right">নিজেরটা চাপ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(stats?.topQuizzes ?? []).map((quiz) => (
                  <TableRow key={quiz.code}>
                    <TableCell>
                      <a href={quiz.shareUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium hover:underline">
                        {quiz.ownerName} <Share2 className="size-3" />
                      </a>
                      {!quiz.live ? <Badge variant="secondary" className="ml-2">শেষ</Badge> : null}
                    </TableCell>
                    <TableCell className="text-right">{quiz.playCount}</TableCell>
                    <TableCell className="text-right">{quiz.viewCount}</TableCell>
                    <TableCell className="text-right">{quiz.makeOwnClicks}</TableCell>
                  </TableRow>
                ))}
                {!stats?.topQuizzes.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      এখনো কোনো quiz নেই
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>সাম্প্রতিক খেলা</CardTitle>
            <CardDescription>খারাপ বা আপত্তিকর নাম দেখলে লুকিয়ে দিন — leaderboard থেকে সরে যাবে।</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>বন্ধুর নাম</TableHead>
                  <TableHead>কার quiz</TableHead>
                  <TableHead className="text-right">স্কোর</TableHead>
                  <TableHead>কখন</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(stats?.recentPlays ?? []).map((play) => (
                  <TableRow key={play.id} className={play.hidden ? "opacity-50" : ""}>
                    <TableCell className="font-medium">{play.playerName}</TableCell>
                    <TableCell>{play.ownerName}</TableCell>
                    <TableCell className="text-right">
                      {play.score}/{play.total}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{dateTime(play.completedAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={togglePlay.isPending}
                        onClick={() => togglePlay.mutate({ id: play.id, hidden: play.hidden })}
                      >
                        {play.hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                        {play.hidden ? "দেখাও" : "লুকাও"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!stats?.recentPlays.length ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                      এখনো কেউ খেলেনি
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => (!open ? setEditing(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "প্রশ্ন বদলান" : "নতুন প্রশ্ন"}</DialogTitle>
            <DialogDescription>মজার, খাবার নিয়ে, ব্যক্তিগত কিছু না। ২–৪টা উত্তর দিন।</DialogDescription>
          </DialogHeader>
          {editing ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="quiz-q-text">প্রশ্ন</Label>
                <Input
                  id="quiz-q-text"
                  maxLength={140}
                  value={editing.text}
                  placeholder="যেমন: রাত ২টায় খিদে পেলে আমি…"
                  onChange={(event) => setEditing({ ...editing, text: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quiz-q-category">ধরন</Label>
                <NativeSelect
                  id="quiz-q-category"
                  value={editing.category}
                  onChange={(event) => setEditing({ ...editing, category: event.target.value })}
                >
                  {Object.entries(CATEGORIES).map(([value, label]) => (
                    <NativeSelectOption key={value} value={value}>
                      {label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
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
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={editing.isActive} onCheckedChange={(checked) => setEditing({ ...editing, isActive: checked })} />
                চালু
              </label>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              বাতিল
            </Button>
            <Button
              disabled={
                !editing ||
                saveQuestion.isPending ||
                editing.text.trim().length < 4 ||
                editing.options.filter((option) => option.trim()).length < 2
              }
              onClick={() => editing && saveQuestion.mutate(editing)}
            >
              {saveQuestion.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => (!open ? setDeleting(null) : undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>প্রশ্নটা মুছবেন?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.text}” — আগে বানানো quiz-গুলো ঠিক থাকবে। শুধু লুকাতে চাইলে মোছার বদলে “চালু” বন্ধ করুন।
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>না</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && removeQuestion.mutate(deleting.id)}>মুছে ফেলুন</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
