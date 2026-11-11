import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FlaskConical, RotateCcw } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { grantAdminRewardTest, listAdminRewardTesters, saveAdminRewardTesters } from "@/lib/admin-api"

const ACTIONS: Array<{ action: "spin" | "coins" | "stamp" | "fill_card"; label: string }> = [
  { action: "spin", label: "+1 spin" },
  { action: "coins", label: "+100 coins" },
  { action: "stamp", label: "+1 stamp" },
  { action: "fill_card", label: "Fill card" },
]

// Test mode: real flows on real phones, but only for listed testers, with fast spins and
// one-tap grants. Everything a tester gets is flagged "test" and kept out of budget/stats.
export function RewardsTestMode({
  enabled,
  unlockMinutes,
  onEnabledChange,
  onUnlockMinutesChange,
}: {
  enabled: boolean
  unlockMinutes: number
  onEnabledChange: (value: boolean) => void
  onUnlockMinutesChange: (value: number) => void
}) {
  const queryClient = useQueryClient()
  const testersQuery = useQuery({ queryKey: ["admin-reward-testers"], queryFn: listAdminRewardTesters })
  const [phones, setPhones] = React.useState<string | null>(null)
  const phoneText = phones ?? (testersQuery.data ?? []).map((tester) => tester.phone).join("\n")

  const saveTesters = useMutation({
    mutationFn: () =>
      saveAdminRewardTesters(
        phoneText
          .split(/[\s,]+/)
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(["admin-reward-testers"], data.testers)
      setPhones(null)
      toast.success(
        data.notFound.length ? `Saved. Not found: ${data.notFound.join(", ")}` : `Saved ${data.testers.length} tester(s)`,
      )
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Could not save"),
  })
  const grant = useMutation({
    mutationFn: (params: { customerId: string; action: "spin" | "coins" | "stamp" | "fill_card" | "reset" }) =>
      grantAdminRewardTest(params.customerId, params.action),
    onSuccess: (data) => {
      queryClient.setQueryData(["admin-reward-testers"], data)
      toast.success("Done — pull to refresh in the app")
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Could not do that"),
  })

  return (
    <Card className={enabled ? "border-violet-300" : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="size-4 text-violet-600" /> Test mode
        </CardTitle>
        <CardDescription>
          শুধু নিচের tester-দের জন্য: spin {unlockMinutes} মিনিটে খোলে, আর এখান থেকে এক চাপে spin/coin/stamp দেওয়া যায়। Test-এর সব কিছু বাজেট, খরচ আর winners-এর বাইরে থাকে। Save settings চাপলে on/off সেভ হয়।
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch checked={enabled} onCheckedChange={onEnabledChange} />
            <Label>Test mode on</Label>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="test-unlock" className="text-sm">Test spin unlocks after (min)</Label>
            <Input
              id="test-unlock"
              className="h-8 w-20"
              type="number"
              min={0}
              value={unlockMinutes}
              onChange={(event) => onUnlockMinutesChange(Number(event.target.value) || 0)}
            />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="tester-phones">Tester phone numbers (one per line, max 20)</Label>
          <Textarea
            id="tester-phones"
            rows={3}
            value={phoneText}
            placeholder={"01XXXXXXXXX\n01XXXXXXXXX"}
            onChange={(event) => setPhones(event.target.value)}
          />
          <Button variant="outline" size="sm" className="w-fit" onClick={() => saveTesters.mutate()} disabled={saveTesters.isPending}>
            Save testers
          </Button>
        </div>

        {(testersQuery.data ?? []).length ? (
          <div className="space-y-2">
            {testersQuery.data!.map((tester) => (
              <div key={tester.customerId} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {tester.name || "Customer"} <span className="text-xs text-muted-foreground">{tester.phone}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    🪙 {tester.coins} · 📮 {tester.stamps} · 🎡 {tester.spinsWaiting} waiting
                    {tester.boxStatus ? ` · 🎁 ${tester.boxStatus}` : ""}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ACTIONS.map((item) => (
                    <Button
                      key={item.action}
                      size="sm"
                      variant="outline"
                      disabled={!enabled || grant.isPending}
                      onClick={() => grant.mutate({ customerId: tester.customerId, action: item.action })}
                    >
                      {item.label}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!enabled || grant.isPending}
                    onClick={() => grant.mutate({ customerId: tester.customerId, action: "reset" })}
                  >
                    <RotateCcw className="size-3.5" /> Reset
                  </Button>
                </div>
              </div>
            ))}
            {!enabled ? <p className="text-xs text-muted-foreground">Button চালাতে আগে Test mode on করে Save settings চাপুন।</p> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
