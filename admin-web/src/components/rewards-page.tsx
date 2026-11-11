import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Bell, Check, Coins, Gift, Plus, Save, Ticket, Trash2, Trophy, X } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { RewardsTestMode } from "@/components/rewards-test-mode"
import {
  decideAdminMysteryBox,
  getAdminRewardSettings,
  getAdminRewardsOverview,
  listAdminMysteryBoxes,
  saveAdminRewardSettings,
  type AdminRewardPrize,
  type AdminRewardPrizeType,
  type AdminRewardSettings,
} from "@/lib/admin-api"

const taka = (value: number) => `৳${(Math.round(value * 100) / 100).toLocaleString("en-US")}`

const PRIZE_INFO: Record<AdminRewardPrizeType, { label: string; bn: string; tone: string }> = {
  coins: { label: "🪙 Coins", bn: "খেলার coin — stamp কেনা / spin এখনই খোলা", tone: "bg-amber-100 text-amber-800" },
  bonus_stamp: { label: "📮 +1 stamp", bn: "Stamp card দ্রুত ভরে", tone: "bg-sky-100 text-sky-800" },
  free_delivery: { label: "🛵 Free delivery", bn: "Personal voucher — নিজে থেকে তৈরি", tone: "bg-emerald-100 text-emerald-800" },
  discount: { label: "💸 Taka off", bn: "Personal voucher — নিজে থেকে তৈরি", tone: "bg-rose-100 text-rose-800" },
  fun: { label: "😄 Better luck", bn: "কিছু নেই — খরচ ৳০", tone: "bg-slate-100 text-slate-700" },
}

function Num({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string
  label: string
  hint?: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" min={0} value={value} onChange={(event) => onChange(Number(event.target.value) || 0)} />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
        {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
      </CardContent>
    </Card>
  )
}

// Older settings docs may miss lists/numbers — never let the page crash on them.
function normalizeSettings(data: AdminRewardSettings): AdminRewardSettings {
  return {
    ...data,
    prizes: Array.isArray(data.prizes) ? data.prizes : [],
    boxPrizes: Array.isArray(data.boxPrizes) ? data.boxPrizes : [],
    stampTarget: data.stampTarget || 7,
  }
}

// Same formula as the server (rewards.rules estimateCostPerOrder) — live while editing.
function liveEstimate(draft: AdminRewardSettings) {
  const usable = draft.prizes.filter((p) => p.weight > 0)
  const total = usable.reduce((sum, p) => sum + p.weight, 0) || 1
  const pBonus = usable.filter((p) => p.type === "bonus_stamp").reduce((s, p) => s + p.weight, 0) / total
  const coinsPerSpin = usable.filter((p) => p.type === "coins").reduce((s, p) => s + (p.weight / total) * p.amount, 0)
  const direct = usable.reduce((s, p) => {
    const cost = p.type === "discount" ? p.amount : p.type === "free_delivery" ? draft.freeDeliveryCostEstimate : 0
    return s + (p.weight / total) * cost
  }, 0)
  const boxUsable = draft.boxPrizes.filter((p) => p.weight > 0)
  const boxTotal = boxUsable.reduce((s, p) => s + p.weight, 0)
  const boxValue = boxTotal ? boxUsable.reduce((s, p) => s + (p.weight / boxTotal) * p.amount, 0) : 0
  const ordersNoCoins = draft.stampTarget / (1 + pBonus)
  const coinStamps = Math.min(draft.maxCoinStampsPerCycle, (coinsPerSpin * ordersNoCoins) / Math.max(1, draft.stampCoinPrice))
  const ordersPerBox = Math.max(1, (draft.stampTarget - coinStamps) / (1 + pBonus))
  return { coinsPerSpin, boxValue, ordersPerBox, costPerOrder: boxValue / ordersPerBox + direct }
}

export function RewardsPage() {
  const queryClient = useQueryClient()
  const [days, setDays] = React.useState(30)
  const [prizeFilter, setPrizeFilter] = React.useState("all")
  const [page, setPage] = React.useState(1)
  const [boxStatus, setBoxStatus] = React.useState("requested")
  const [draft, setDraft] = React.useState<AdminRewardSettings | null>(null)

  const settingsQuery = useQuery({ queryKey: ["admin-reward-settings"], queryFn: getAdminRewardSettings })
  const overviewQuery = useQuery({
    queryKey: ["admin-rewards-overview", days, prizeFilter, page],
    queryFn: () => getAdminRewardsOverview({ days, prizeType: prizeFilter, page }),
  })
  const boxesQuery = useQuery({ queryKey: ["admin-mystery-boxes", boxStatus], queryFn: () => listAdminMysteryBoxes(boxStatus) })

  React.useEffect(() => {
    if (settingsQuery.data && !draft) setDraft(normalizeSettings(settingsQuery.data))
  }, [draft, settingsQuery.data])

  const save = useMutation({
    mutationFn: (input: AdminRewardSettings) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { estimate, stampTarget, ...rest } = input
      return saveAdminRewardSettings(rest)
    },
    onSuccess: (data) => {
      setDraft(normalizeSettings(data))
      toast.success("Saved")
      void queryClient.invalidateQueries({ queryKey: ["admin-reward-settings"] })
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Could not save"),
  })
  const decide = useMutation({
    mutationFn: (params: { id: string; action: "approve" | "reject" }) => decideAdminMysteryBox(params.id, params.action),
    onSuccess: (_data, variables) => {
      toast.success(variables.action === "approve" ? "Approved — voucher created" : "Rejected")
      void queryClient.invalidateQueries({ queryKey: ["admin-mystery-boxes"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-rewards-overview"] })
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Could not update"),
  })

  const set = (patch: Partial<AdminRewardSettings>) => setDraft((current) => (current ? { ...current, ...patch } : current))
  const setPrize = (index: number, patch: Partial<AdminRewardPrize>) =>
    set({ prizes: (draft?.prizes ?? []).map((prize, i) => (i === index ? { ...prize, ...patch } : prize)) })
  const setBox = (index: number, patch: Partial<{ amount: number; weight: number }>) =>
    set({ boxPrizes: (draft?.boxPrizes ?? []).map((prize, i) => (i === index ? { ...prize, ...patch } : prize)) })

  const estimate = draft ? liveEstimate(draft) : null
  const wheelTotal = (draft?.prizes ?? []).reduce((s, p) => s + Math.max(0, p.weight), 0)
  const boxTotal = (draft?.boxPrizes ?? []).reduce((s, p) => s + Math.max(0, p.weight), 0)
  const stats = overviewQuery.data?.stats
  const winners = overviewQuery.data?.winners
  const budgetPct = stats?.monthlyBudget ? Math.min(100, Math.round((stats.spentThisMonth / stats.monthlyBudget) * 100)) : 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Ticket className="size-6 text-amber-500" /> Rewards
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            প্রতি delivered অর্ডারে 📮 ১ stamp + 🎡 ১টা spin। Spin-এ 🪙 coin / stamp / voucher। {draft?.stampTarget ?? 7} stamp হলে 🎁 Mystery box।
          </p>
        </div>
        <Button onClick={() => draft && save.mutate(draft)} disabled={!draft || save.isPending}>
          <Save className="size-4" /> {save.isPending ? "Saving…" : "Save settings"}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={`Actual cost / delivered order (${days}d)`}
          value={taka(stats?.actualCostPerOrder ?? 0)}
          sub={<>Estimate {estimate ? taka(estimate.costPerOrder) : "—"} · used vouchers {taka(stats?.actualUsedValue ?? 0)}</>}
        />
        <Stat
          label="Spin prize cost this month"
          value={
            <>
              {taka(stats?.spentThisMonth ?? 0)}
              <span className="text-sm text-muted-foreground"> / {stats?.monthlyBudget ? taka(stats.monthlyBudget) : "no cap"}</span>
            </>
          }
          sub={
            stats?.monthlyBudget ? (
              <div className="h-1.5 overflow-hidden rounded bg-muted">
                <div className="h-full bg-amber-400" style={{ width: `${budgetPct}%` }} />
              </div>
            ) : null
          }
        />
        <Stat
          label={`Spins (${days}d)`}
          value={`${stats?.scratched ?? 0} / ${stats?.issued ?? 0}`}
          sub={`${stats?.scratchRate ?? 0}% spun · ${stats?.spinsSkipped ?? 0} opened early with coins · ${stats?.expired ?? 0} expired`}
        />
        <Stat
          label={`Coins & boxes (${days}d)`}
          value={`${stats?.boxesGiven ?? 0} boxes`}
          sub={`${taka(stats?.boxValueGiven ?? 0)} in boxes · ${stats?.coinsIssued ?? 0} coins given · ${stats?.stampsBought ?? 0} stamps bought`}
        />
      </div>

      {draft ? (
        <RewardsTestMode
          enabled={draft.testModeEnabled === true}
          unlockMinutes={draft.testSpinUnlockMinutes ?? 1}
          onEnabledChange={(value) => set({ testModeEnabled: value })}
          onUnlockMinutesChange={(value) => set({ testSpinUnlockMinutes: value })}
        />
      ) : null}

      {/* Approval queue */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Gift className="size-4" /> Mystery boxes
              </CardTitle>
              <CardDescription>
                Approval mode-এ claim এখানে আসে। Approve করলে server পুরস্কার বেছে voucher তৈরি করে — customer app-এ box খুলে দেখে। Reject করলে stamp খরচ হয় না।
              </CardDescription>
            </div>
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={boxStatus} onChange={(e) => setBoxStatus(e.target.value)} aria-label="Box status">
              <option value="requested">Waiting for approval</option>
              <option value="ready">Ready (not opened)</option>
              <option value="opened">Opened</option>
              <option value="rejected">Rejected</option>
              <option value="all">All</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {(boxesQuery.data ?? []).length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {boxesQuery.isLoading ? "Loading…" : "কিছু নেই।"}
            </p>
          ) : (
            <div className="space-y-2">
              {boxesQuery.data!.map((box) => (
                <div key={box.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {box.customerName || "Customer"}
                      {box.isTest ? <Badge variant="outline" className="ml-2 border-violet-300 text-violet-700">🧪 test</Badge> : null}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {box.customerPhone ? <a href={`tel:${box.customerPhone}`} className="underline">{box.customerPhone}</a> : null}
                      {box.requestedCode ? ` · wants code ${box.requestedCode}` : ""} ·{" "}
                      {new Date(box.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                    </div>
                  </div>
                  {box.status === "requested" ? (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => decide.mutate({ id: box.id, action: "approve" })} disabled={decide.isPending}>
                        <Check className="size-3.5" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => decide.mutate({ id: box.id, action: "reject" })} disabled={decide.isPending}>
                        <X className="size-3.5" /> Reject
                      </Button>
                    </div>
                  ) : (
                    <div className="text-right text-sm">
                      {box.prizeAmount ? <Badge variant="secondary">{taka(box.prizeAmount)}</Badge> : null}
                      {box.voucherCode ? <div className="text-xs text-muted-foreground"><code>{box.voucherCode}</code> · {box.voucherUsed ? "used" : "not used"}</div> : null}
                      {box.status === "rejected" ? <Badge variant="outline">Rejected</Badge> : null}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {draft ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Spin wheel */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>🎡 Spin wheel</CardTitle>
              <CardDescription>পুরস্কার server ঠিক করে। ঘরের আকার = আসল সম্ভাবনা (app-এ ⓘ-তে দেখায়)। বাজেট শেষ হলে টাকার পুরস্কারের বদলে ফ্রি পুরস্কার।</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label>Spins on</Label>
                  <p className="text-xs text-muted-foreground">বন্ধ থাকলে নতুন spin দেওয়া হবে না।</p>
                </div>
                <Switch checked={draft.scratchEnabled} onCheckedChange={(checked) => set({ scratchEnabled: checked })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Num id="min-order" label="Min order for a spin (৳)" value={draft.minOrderAmount} onChange={(v) => set({ minOrderAmount: v })} />
                <Num id="unlock" label="Unlocks after (hours)" value={draft.spinUnlockHours} onChange={(v) => set({ spinUnlockHours: v })} />
                <Num id="skip" label="Open now cost (coins)" value={draft.skipCoinCost} onChange={(v) => set({ skipCoinCost: v })} />
                <Num id="expiry" label="Expires after unlock (days)" value={draft.cardExpiryDays} onChange={(v) => set({ cardExpiryDays: v })} />
                <Num id="budget" label="Monthly budget (৳)" hint="0 = no cap" value={draft.monthlyBudget} onChange={(v) => set({ monthlyBudget: v })} />
                <Num id="fd-cost" label="Free delivery ≈ (৳)" value={draft.freeDeliveryCostEstimate} onChange={(v) => set({ freeDeliveryCostEstimate: v })} />
                <Num id="pv-valid" label="Prize voucher valid (days)" value={draft.prizeVoucherValidityDays} onChange={(v) => set({ prizeVoucherValidityDays: v })} />
                <Num id="pv-min" label="Prize voucher min order (৳)" value={draft.prizeVoucherMinOrder} onChange={(v) => set({ prizeVoucherMinOrder: v })} />
              </div>
              <div className="space-y-2">
                {draft.prizes.map((prize, index) => {
                  const share = wheelTotal ? Math.round((Math.max(0, prize.weight) / wheelTotal) * 1000) / 10 : 0
                  return (
                    <div key={prize.id ?? `n${index}`} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
                      <select className="h-9 rounded-md border bg-background px-2 text-sm" value={prize.type} onChange={(e) => setPrize(index, { type: e.target.value as AdminRewardPrizeType })} aria-label="Slice type">
                        {(Object.keys(PRIZE_INFO) as AdminRewardPrizeType[]).map((type) => (
                          <option key={type} value={type}>{PRIZE_INFO[type].label}</option>
                        ))}
                      </select>
                      <Input className="w-40" value={prize.label} maxLength={40} placeholder="Label on the wheel" onChange={(e) => setPrize(index, { label: e.target.value })} />
                      {prize.type === "coins" || prize.type === "discount" ? (
                        <Input className="w-24" type="number" min={1} value={prize.amount} onChange={(e) => setPrize(index, { amount: Number(e.target.value) || 0 })} aria-label={prize.type === "coins" ? "Coins" : "Taka off"} />
                      ) : null}
                      <Input className="w-20" type="number" min={0} value={prize.weight} onChange={(e) => setPrize(index, { weight: Number(e.target.value) || 0 })} aria-label="Weight" />
                      <span className="w-14 text-sm font-medium">{share}%</span>
                      <span className="hidden text-xs text-muted-foreground md:inline">{PRIZE_INFO[prize.type].bn}</span>
                      <Button className="ml-auto" variant="ghost" size="icon" aria-label="Remove slice" disabled={draft.prizes.length <= 2} onClick={() => set({ prizes: draft.prizes.filter((_, i) => i !== index) })}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  )
                })}
                {draft.prizes.length < 10 ? (
                  <Button variant="outline" size="sm" onClick={() => set({ prizes: [...draft.prizes, { type: "coins", label: "10 coins", weight: 5, amount: 10 }] })}>
                    <Plus className="size-3.5" /> Add slice
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {/* Coins */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Coins className="size-4" /> Coins</CardTitle>
              <CardDescription>Coin শুধু খেলার ভেতরে — stamp কেনা বা spin এখনই খোলা।</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <Num id="stamp-price" label="1 stamp costs (coins)" value={draft.stampCoinPrice} onChange={(v) => set({ stampCoinPrice: v })} />
              <Num id="max-stamps" label="Max bought / card" value={draft.maxCoinStampsPerCycle} onChange={(v) => set({ maxCoinStampsPerCycle: v })} />
              <Num id="coin-expiry" label="Coins expire (days)" value={draft.coinExpiryDays} onChange={(v) => set({ coinExpiryDays: v })} />
            </CardContent>
          </Card>

          {/* Mystery box */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Gift className="size-4" /> Mystery box ({draft.stampTarget} stamps)</CardTitle>
              <CardDescription>
                কত stamp-এ box — Settings → Custom offers থেকে (এখন {draft.stampTarget})। বাড়তি stamp পরের card-এ যায়।
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {draft.boxPrizes.map((prize, index) => {
                const share = boxTotal ? Math.round((Math.max(0, prize.weight) / boxTotal) * 1000) / 10 : 0
                return (
                  <div key={index} className="flex items-center gap-2">
                    <Label className="w-6 text-xs">৳</Label>
                    <Input className="w-24" type="number" min={1} value={prize.amount} onChange={(e) => setBox(index, { amount: Number(e.target.value) || 0 })} aria-label="Taka" />
                    <Input className="w-20" type="number" min={0} value={prize.weight} onChange={(e) => setBox(index, { weight: Number(e.target.value) || 0 })} aria-label="Weight" />
                    <span className="w-14 text-sm font-medium">{share}%</span>
                    <Button variant="ghost" size="icon" aria-label="Remove" disabled={draft.boxPrizes.length <= 1} onClick={() => set({ boxPrizes: draft.boxPrizes.filter((_, i) => i !== index) })}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )
              })}
              {draft.boxPrizes.length < 8 ? (
                <Button variant="outline" size="sm" onClick={() => set({ boxPrizes: [...draft.boxPrizes, { amount: 25, weight: 1 }] })}>
                  <Plus className="size-3.5" /> Add prize
                </Button>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                {(["approval", "auto"] as const).map((mode) => (
                  <button key={mode} type="button" onClick={() => set({ claimMode: mode })} className={`rounded-lg border p-3 text-left text-sm ${draft.claimMode === mode ? "border-amber-400 bg-amber-50" : ""}`}>
                    <span className="font-medium">{mode === "auto" ? "Auto" : "Approval"}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {mode === "auto" ? "Claim করলেই box খোলা যায়" : "উপরের queue থেকে আপনি approve করবেন"}
                    </span>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Num id="box-min" label="Voucher min order (৳)" value={draft.claimMinOrder} onChange={(v) => set({ claimMinOrder: v })} />
                <Num id="box-valid" label="Voucher valid (days)" value={draft.claimValidityDays} onChange={(v) => set({ claimValidityDays: v })} />
              </div>
            </CardContent>
          </Card>

          {/* Estimate + notifications */}
          <Card>
            <CardHeader>
              <CardTitle>Cost estimate (live)</CardTitle>
              <CardDescription>এখনকার সংখ্যায় অনুমান। আসল খরচ উপরের "Actual cost" card-এ।</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Avg coins / spin</p><p className="text-lg font-semibold">{estimate ? estimate.coinsPerSpin.toFixed(1) : "—"}</p></div>
              <div><p className="text-xs text-muted-foreground">Avg box value</p><p className="text-lg font-semibold">{estimate ? taka(estimate.boxValue) : "—"}</p></div>
              <div><p className="text-xs text-muted-foreground">Orders per box</p><p className="text-lg font-semibold">{estimate ? estimate.ordersPerBox.toFixed(1) : "—"}</p></div>
              <div><p className="text-xs text-muted-foreground">Cost / order</p><p className="text-lg font-semibold text-amber-700">{estimate ? taka(estimate.costPerOrder) : "—"}</p></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Bell className="size-4" /> Notifications</CardTitle>
              <CardDescription>সব default-এ বন্ধ — বেশি notification-এ মানুষ বিরক্ত হয়।</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label>Spin ready (on the phone)</Label>
                  <p className="text-xs text-muted-foreground">Spin খোলার সময় ফোনের নিজের notification — push খরচ নেই।</p>
                </div>
                <Switch checked={draft.spinReadyLocalNotify} onCheckedChange={(checked) => set({ spinReadyLocalNotify: checked })} />
              </div>
              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Box claim reminder (push)</Label>
                    <p className="text-xs text-muted-foreground">Card পূর্ণ কিন্তু claim করেনি — একবারই।</p>
                  </div>
                  <Switch checked={draft.claimReminderEnabled} onCheckedChange={(checked) => set({ claimReminderEnabled: checked })} />
                </div>
                {draft.claimReminderEnabled ? (
                  <div className="grid gap-3">
                    <Num id="rem-days" label="Send after (days)" value={draft.claimReminderAfterDays} onChange={(v) => set({ claimReminderAfterDays: v })} />
                    <Input value={draft.claimReminderTitle} onChange={(e) => set({ claimReminderTitle: e.target.value })} aria-label="Reminder title" />
                    <Input value={draft.claimReminderBody} onChange={(e) => set({ claimReminderBody: e.target.value })} aria-label="Reminder message" />
                  </div>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">"Card unlocked" push আলাদা — Settings → Custom offers → qualification push।</p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Loading settings…</p>
      )}

      {/* Winners */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><Trophy className="size-4" /> Spin winners</CardTitle>
              <CardDescription>কে কী পেয়েছে (coin আর better luck বাদে, filter-এ সব দেখা যায়)।</CardDescription>
            </div>
            <div className="flex gap-2">
              <select className="h-9 rounded-md border bg-background px-2 text-sm" value={prizeFilter} onChange={(e) => { setPrizeFilter(e.target.value); setPage(1) }} aria-label="Prize filter">
                <option value="all">Vouchers & stamps</option>
                {(Object.keys(PRIZE_INFO) as AdminRewardPrizeType[]).map((type) => (
                  <option key={type} value={type}>{PRIZE_INFO[type].label}</option>
                ))}
              </select>
              <select className="h-9 rounded-md border bg-background px-2 text-sm" value={days} onChange={(e) => { setDays(Number(e.target.value)); setPage(1) }} aria-label="Period">
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {stats?.byPrize?.length ? (
            <div className="mb-4 flex flex-wrap gap-2">
              {stats.byPrize.map((row) => (
                <Badge key={row.type} variant="secondary" className={PRIZE_INFO[row.type]?.tone}>
                  {PRIZE_INFO[row.type]?.label ?? row.type}: {row.count}{row.cost ? ` · ${taka(row.cost)}` : ""}
                </Badge>
              ))}
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Prize</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Voucher</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(winners?.items ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                      {overviewQuery.isLoading ? "Loading…" : "এই সময়ে কেউ জেতেনি।"}
                    </TableCell>
                  </TableRow>
                ) : (
                  winners!.items.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{row.customerName || "Customer"}</div>
                        {row.customerPhone ? <a href={`tel:${row.customerPhone}`} className="text-xs text-muted-foreground underline">{row.customerPhone}</a> : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={PRIZE_INFO[row.prizeType]?.tone}>{row.prizeLabel}</Badge>
                        {row.budgetCapped ? <span className="ml-1 text-xs text-muted-foreground">(budget cap)</span> : null}
                      </TableCell>
                      <TableCell className="text-sm">{row.orderNumber || "—"}</TableCell>
                      <TableCell className="text-sm">
                        {row.voucherCode ? (
                          <>
                            <code>{row.voucherCode}</code>
                            <div className={`text-xs ${row.voucherUsed ? "text-emerald-700" : "text-muted-foreground"}`}>{row.voucherUsed ? "Used" : "Not used yet"}</div>
                          </>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.scratchedAt ? new Date(row.scratchedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {winners && winners.total > winners.pageSize ? (
            <div className="mt-3 flex items-center justify-end gap-2 text-sm">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <span>Page {page} / {Math.ceil(winners.total / winners.pageSize)}</span>
              <Button variant="outline" size="sm" disabled={page * winners.pageSize >= winners.total} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
