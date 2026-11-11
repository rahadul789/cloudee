import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  BellRing,
  CheckCircle2,
  HandCoins,
  HeartHandshake,
  Loader2,
  RefreshCcw,
  Search,
  Send,
  ShieldCheck,
  Ticket,
  Users,
} from "lucide-react"
import { toast } from "sonner"

import {
  getAdminWinBackCandidates,
  getAdminWinBackStats,
  saveAdminWinBackSettings,
  sendAdminWinBack,
  type AdminWinBackSettings,
  type WinBackSegment,
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
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const taka = (value: number) => `৳${Math.round(value).toLocaleString("en-US")}`

const SEGMENT_INFO: Record<WinBackSegment, { label: string; bn: string; tone: string }> = {
  one_time: { label: "Tried once", bn: "একবার অর্ডার করেছেন", tone: "bg-sky-100 text-sky-800" },
  regular: { label: "Was a regular", bn: "২–৪ বার অর্ডার করেছেন", tone: "bg-amber-100 text-amber-800" },
  loyal: { label: "Loyal", bn: "৫+ বার অর্ডার করেছেন", tone: "bg-emerald-100 text-emerald-800" },
}

function minuteToTime(minute: number) {
  const h = Math.floor(minute / 60)
  const m = minute % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

function timeToMinute(value: string) {
  const [h, m] = value.split(":").map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 12 * 60 + 30
}

// Win-back = automatically win back customers who stopped ordering with a personal voucher.
// The page is written to be understood without any technical knowledge.
export function WinBackPage() {
  const queryClient = useQueryClient()
  const candidatesQuery = useQuery({ queryKey: ["admin", "win-back", "candidates"], queryFn: getAdminWinBackCandidates })
  const statsQuery = useQuery({ queryKey: ["admin", "win-back", "stats"], queryFn: () => getAdminWinBackStats(90) })

  const settings = candidatesQuery.data?.settings
  const [draft, setDraft] = React.useState<AdminWinBackSettings | null>(null)
  React.useEffect(() => {
    if (settings) setDraft(settings)
  }, [settings])

  const candidates = React.useMemo(() => candidatesQuery.data?.candidates ?? [], [candidatesQuery.data])
  const [excluded, setExcluded] = React.useState<Set<string>>(new Set())
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  const selected = candidates.filter((c) => !c.isControl && !excluded.has(c.customerId))
  const selectedCost = selected.reduce((sum, c) => sum + c.amount, 0)
  const remainingBudget = candidatesQuery.data?.summary.remainingBudget ?? 0

  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "win-back"] })
  }

  const saveMutation = useMutation({
    mutationFn: (patch: Partial<AdminWinBackSettings>) => saveAdminWinBackSettings(patch),
    onSuccess: () => {
      toast.success("Settings saved")
      refreshAll()
    },
    onError: () => toast.error("Couldn't save settings"),
  })

  const sendMutation = useMutation({
    mutationFn: () =>
      sendAdminWinBack([
        ...selected.map((c) => c.customerId),
        // control-group people are recorded (not sent anything) so results can be compared
        ...candidates.filter((c) => c.isControl).map((c) => c.customerId),
      ]),
    onSuccess: (result) => {
      toast.success(
        `Sent to ${result.sent} customer${result.sent === 1 ? "" : "s"} · cost up to ${taka(result.cost)}` +
          (result.overBudget ? ` · ${result.overBudget} skipped (budget)` : "")
      )
      setExcluded(new Set())
      refreshAll()
    },
    onError: () => toast.error("Sending failed — nothing was charged. Please try again."),
  })

  const dirty = draft && settings && JSON.stringify(draft) !== JSON.stringify(settings)
  const stats = statsQuery.data
  const summary = candidatesQuery.data?.summary

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
            <HeartHandshake className="size-7 text-amber-500" />
            Win-back
          </h1>
          <p className="text-sm text-muted-foreground">
            যারা অনেকদিন অর্ডার করেননি, তাদের একটা ব্যক্তিগত voucher দিয়ে ফিরিয়ে আনা।
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={settings?.enabled ? "default" : "outline"}>
            {!settings?.enabled ? "Off" : settings.mode === "auto" ? "On · Automatic" : "On · You approve"}
          </Badge>
          <Button variant="outline" onClick={refreshAll} disabled={candidatesQuery.isFetching}>
            {candidatesQuery.isFetching ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCcw className="mr-2 size-4" />}
            Refresh
          </Button>
        </div>
      </div>

      {/* How it works */}
      <Card>
        <CardHeader>
          <CardTitle>এটা কীভাবে কাজ করে</CardTitle>
          <CardDescription>৪টা ধাপ — সব system নিজে করে, আপনি শুধু নিয়মগুলো ঠিক করে দেন।</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-4">
            {[
              { icon: Search, title: "১. খুঁজে বের করে", text: `যারা ${draft?.lapsedDays ?? 30} দিনের বেশি অর্ডার করেননি।` },
              { icon: Users, title: "২. ৩ দলে ভাগ করে", text: "একবার / নিয়মিত / বিশ্বস্ত — যে যত মূল্যবান, তার ছাড় তত বেশি।" },
              { icon: Ticket, title: "৩. ব্যক্তিগত voucher বানায়", text: `শুধু ওই গ্রাহকের জন্য, ${draft?.validityDays ?? 7} দিন মেয়াদ, একবার ব্যবহার।` },
              { icon: BellRing, title: "৪. Push পাঠায়", text: "\"Kacchi Bhai আপনাকে মিস করছে 🍛 ৳৩৫ ছাড়\" — তার প্রিয় restaurant-এর নামে।" },
            ].map((step) => (
              <div key={step.title} className="rounded-lg border bg-muted/30 p-3">
                <step.icon className="mb-2 size-5 text-amber-500" />
                <div className="text-sm font-semibold">{step.title}</div>
                <p className="mt-1 text-xs text-muted-foreground">{step.text}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            একজনকে ৯০ দিনে সর্বোচ্চ {draft?.maxAttemptsPer90Days ?? 2} বার, অন্তত ১৪ দিন পরপর। অর্ডার করলে আবার শূন্য থেকে গোনা হয়।
            মাসের বাজেট শেষ হলে আর পাঠায় না।
          </p>
        </CardContent>
      </Card>

      {/* Settings */}
      {draft ? (
        <Card>
          <CardHeader>
            <CardTitle>নিয়ম (Settings)</CardTitle>
            <CardDescription>পরিবর্তন করে নিচে Save চাপুন।</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>Win-back চালু</Label>
                <p className="text-xs text-muted-foreground">বন্ধ থাকলে কাউকে কিছু পাঠানো হবে না।</p>
              </div>
              <Switch checked={draft.enabled} onCheckedChange={(enabled) => setDraft({ ...draft, enabled })} />
            </div>

            <div className="space-y-2">
              <Label>পাঠানোর ধরন</Label>
              <RadioGroup
                value={draft.mode}
                onValueChange={(mode) => setDraft({ ...draft, mode: mode as AdminWinBackSettings["mode"] })}
                className="grid gap-2 md:grid-cols-2"
              >
                <label className="flex cursor-pointer gap-3 rounded-lg border p-3 has-[[data-state=checked]]:border-amber-400 has-[[data-state=checked]]:bg-amber-50">
                  <RadioGroupItem value="approval" className="mt-1" />
                  <div>
                    <div className="text-sm font-semibold">আমি দেখে পাঠাবো (শুরুতে এটা ভালো)</div>
                    <p className="text-xs text-muted-foreground">
                      নিচে &quot;আজকের তালিকা&quot; দেখে আপনি নিজে Send চাপবেন। কাকে কত যাচ্ছে সব দেখতে পাবেন।
                    </p>
                  </div>
                </label>
                <label className="flex cursor-pointer gap-3 rounded-lg border p-3 has-[[data-state=checked]]:border-amber-400 has-[[data-state=checked]]:bg-amber-50">
                  <RadioGroupItem value="auto" className="mt-1" />
                  <div>
                    <div className="text-sm font-semibold">পুরো স্বয়ংক্রিয়</div>
                    <p className="text-xs text-muted-foreground">
                      প্রতিদিন নির্দিষ্ট সময়ে system নিজেই পাঠাবে। আপনার কিছু করতে হবে না।
                    </p>
                  </div>
                </label>
              </RadioGroup>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {(Object.keys(SEGMENT_INFO) as WinBackSegment[]).map((segment) => (
                <div key={segment} className="space-y-1.5 rounded-lg border p-3">
                  <Label className="flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs ${SEGMENT_INFO[segment].tone}`}>
                      {SEGMENT_INFO[segment].label}
                    </span>
                  </Label>
                  <p className="text-xs text-muted-foreground">{SEGMENT_INFO[segment].bn} — ছাড় কত টাকা?</p>
                  <Input
                    type="number"
                    min={5}
                    max={300}
                    value={draft.amounts[segment]}
                    onChange={(e) =>
                      setDraft({ ...draft, amounts: { ...draft.amounts, [segment]: Number(e.target.value) || 0 } })
                    }
                  />
                </div>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <Field label="কত দিন অর্ডার না করলে?" hint="সাধারণত ৩০ দিন">
                <Input type="number" min={14} max={180} value={draft.lapsedDays} onChange={(e) => setDraft({ ...draft, lapsedDays: Number(e.target.value) || 30 })} />
              </Field>
              <Field label="ন্যূনতম অর্ডার (৳)" hint="এর কম অর্ডারে voucher চলবে না">
                <Input type="number" min={0} value={draft.minOrderAmount} onChange={(e) => setDraft({ ...draft, minOrderAmount: Number(e.target.value) || 0 })} />
              </Field>
              <Field label="Voucher-এর মেয়াদ (দিন)" hint="ছোট মেয়াদ = তাড়াতাড়ি ফেরে">
                <Input type="number" min={1} max={30} value={draft.validityDays} onChange={(e) => setDraft({ ...draft, validityDays: Number(e.target.value) || 7 })} />
              </Field>
              <Field label="মাসিক বাজেট (৳)" hint="মাসে এর বেশি মূল্যের voucher পাঠাবে না">
                <Input type="number" min={0} value={draft.monthlyBudget} onChange={(e) => setDraft({ ...draft, monthlyBudget: Number(e.target.value) || 0 })} />
              </Field>
              <Field label="Control group (%)" hint="এই % মানুষকে ইচ্ছা করে কিছু দেওয়া হয় না — তুলনা করে বোঝা যায় voucher আসলে কাজ করছে কিনা">
                <Input type="number" min={0} max={50} value={draft.controlPercent} onChange={(e) => setDraft({ ...draft, controlPercent: Number(e.target.value) || 0 })} />
              </Field>
              <Field label="স্বয়ংক্রিয় পাঠানোর সময়" hint="শুধু &quot;পুরো স্বয়ংক্রিয়&quot;-তে; খোলা সময়ে রাখুন">
                <Input type="time" value={minuteToTime(draft.sendMinuteOfDay)} onChange={(e) => setDraft({ ...draft, sendMinuteOfDay: timeToMinute(e.target.value) })} />
              </Field>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => saveMutation.mutate(draft)} disabled={!dirty || saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <CheckCircle2 className="mr-2 size-4" />}
                Save
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Today's list */}
      <Card>
        <CardHeader>
          <CardTitle>আজকের তালিকা</CardTitle>
          <CardDescription>
            {summary
              ? summary.total === 0
                ? "এই মুহূর্তে কেউ যোগ্য নন — সবাই সম্প্রতি অর্ডার করেছেন বা আগে পাঠানো হয়েছে।"
                : `${summary.total} জন যোগ্য: ${summary.total - summary.controlGroup} জন voucher পাবেন, ${summary.controlGroup} জন control group (কিছু পাবেন না)। এই মাসে খরচ হয়েছে ${taka(summary.spentThisMonth)}, বাকি বাজেট ${taka(summary.remainingBudget)}।`
              : "Loading…"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {candidates.length ? (
            <>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead>Customer</TableHead>
                      <TableHead>দল</TableHead>
                      <TableHead className="text-right">অর্ডার</TableHead>
                      <TableHead className="text-right">শেষ অর্ডার</TableHead>
                      <TableHead>প্রিয় restaurant</TableHead>
                      <TableHead className="text-right">Voucher</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {candidates.map((c) => (
                      <TableRow key={c.customerId} className={c.isControl ? "opacity-60" : undefined}>
                        <TableCell>
                          {c.isControl ? null : (
                            <Checkbox
                              checked={!excluded.has(c.customerId)}
                              onCheckedChange={(checked) => {
                                const next = new Set(excluded)
                                if (checked) next.delete(c.customerId)
                                else next.add(c.customerId)
                                setExcluded(next)
                              }}
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{c.name}</div>
                          <div className="text-xs text-muted-foreground">{c.phoneTail}</div>
                        </TableCell>
                        <TableCell>
                          <span className={`rounded px-1.5 py-0.5 text-xs ${SEGMENT_INFO[c.segment].tone}`}>
                            {SEGMENT_INFO[c.segment].label}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{c.deliveredOrders}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.daysSinceOrder} দিন আগে</TableCell>
                        <TableCell>{c.favouriteRestaurantName || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {c.isControl ? <Badge variant="outline">Control</Badge> : taka(c.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-col gap-2 rounded-lg bg-muted/40 p-3 md:flex-row md:items-center md:justify-between">
                <div className="text-sm">
                  নির্বাচিত: <b>{selected.length} জন</b> · সর্বোচ্চ খরচ <b>{taka(selectedCost)}</b>
                  <span className="text-muted-foreground"> (শুধু যারা voucher ব্যবহার করবেন তাদের খরচ হবে)</span>
                  {selectedCost > remainingBudget ? (
                    <div className="text-xs text-rose-600">
                      বাজেটের চেয়ে বেশি — বিশ্বস্ত গ্রাহকদের আগে রেখে বাজেটের মধ্যে যতজন হয় ততজনকে পাঠানো হবে।
                    </div>
                  ) : null}
                </div>
                <Button
                  onClick={() => setConfirmOpen(true)}
                  disabled={!settings?.enabled || selected.length === 0 || sendMutation.isPending}
                >
                  {sendMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}
                  {settings?.enabled ? `Send to ${selected.length}` : "আগে Win-back চালু করুন"}
                </Button>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HandCoins className="size-5 text-amber-500" />
            ফলাফল (গত ৯০ দিন)
          </CardTitle>
          <CardDescription>&quot;ফিরেছেন&quot; = voucher পাওয়ার ১৪ দিনের মধ্যে অন্তত একটা অর্ডার deliver হয়েছে।</CardDescription>
        </CardHeader>
        <CardContent>
          {stats ? (
            stats.sent === 0 ? (
              <p className="text-sm text-muted-foreground">এখনো কাউকে পাঠানো হয়নি। পাঠানোর পর এখানে ফলাফল দেখাবে।</p>
            ) : (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Stat label="পাঠানো হয়েছে" value={`${stats.sent} জন`} />
                  <Stat label="ফিরেছেন" value={`${stats.cameBack} জন (${stats.cameBackRate}%)`} />
                  <Stat label="ফেরা অর্ডারের মোট দাম" value={taka(stats.revenueFromReturned)} />
                  <Stat label="Voucher খরচ (ব্যবহৃত)" value={`${taka(stats.voucherCost)} · ${stats.vouchersRedeemed}টা`} />
                </div>
                {stats.control > 0 ? (
                  <p className="rounded-lg border bg-amber-50 p-3 text-sm">
                    Voucher পেয়ে ফিরেছেন <b>{stats.cameBackRate}%</b>, আর voucher ছাড়া (control group) ফিরেছেন{" "}
                    <b>{stats.controlCameBackRate}%</b>.{" "}
                    {stats.cameBackRate > stats.controlCameBackRate
                      ? "→ Voucher সত্যিই মানুষকে ফিরিয়ে আনছে। ✅"
                      : "→ এখনো পার্থক্য স্পষ্ট নয় — আরও কিছুদিন চালিয়ে দেখুন বা ছাড়ের পরিমাণ বদলান।"}
                  </p>
                ) : null}
              </div>
            )
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{selected.length} জনকে voucher পাঠাবেন?</AlertDialogTitle>
            <AlertDialogDescription>
              প্রত্যেকে একটা ব্যক্তিগত voucher আর push notification পাবেন। সর্বোচ্চ খরচ {taka(selectedCost)} — শুধু যারা
              ব্যবহার করবেন তাদের ক্ষেত্রে খরচ হবে। পাঠানোর পর আর ফেরানো যাবে না।
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>না, থাক</AlertDialogCancel>
            <AlertDialogAction onClick={() => sendMutation.mutate()}>হ্যাঁ, পাঠাও</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 rounded-lg border p-3">
      <Label>{label}</Label>
      {children}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}
