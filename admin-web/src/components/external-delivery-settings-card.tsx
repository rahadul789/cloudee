import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { BadgeCheck, Bike, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  getAdminExternalDeliveryConfig,
  updateAdminExternalDeliveryConfig,
  type ExternalSettlementPolicy,
} from "@/lib/admin-api"

function formatTk(value?: number | null) {
  return `Tk ${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`
}

const POLICY_OPTIONS: { value: ExternalSettlementPolicy; label: string }[] = [
  { value: "same_day", label: "Same day" },
  { value: "t_plus_1", label: "Next day (T+1)" },
  { value: "t_plus_n", label: "Custom days (T+N)" },
  { value: "platform_default", label: "Platform default (7 days)" },
]

// Per-restaurant External Delivery configuration, rendered inside the restaurant detail
// page. This is the ONLY place external delivery is enabled + priced (flat fee) for a
// restaurant — the External Delivery module itself only oversees + reports.
export function ExternalDeliverySettingsCard({ restaurantId }: { restaurantId: string }) {
  const queryClient = useQueryClient()

  const configQuery = useQuery({
    queryKey: ["admin-external-delivery-config", restaurantId],
    queryFn: () => getAdminExternalDeliveryConfig(restaurantId),
    enabled: Boolean(restaurantId),
  })

  const [enabled, setEnabled] = React.useState(false)
  const [deliveryFee, setDeliveryFee] = React.useState("")
  const [policy, setPolicy] = React.useState<ExternalSettlementPolicy>("t_plus_1")
  const [settlementDays, setSettlementDays] = React.useState("")
  const [exposureCap, setExposureCap] = React.useState("")

  React.useEffect(() => {
    const config = configQuery.data?.config
    if (!config) return
    setEnabled(config.enabled)
    setDeliveryFee(config.deliveryFeeTaka ? String(config.deliveryFeeTaka) : "")
    setPolicy(config.settlementPolicy)
    setSettlementDays(config.settlementDays != null ? String(config.settlementDays) : "")
    setExposureCap(config.exposureCapTaka != null ? String(config.exposureCapTaka) : "")
  }, [configQuery.data])

  const saveMutation = useMutation({
    mutationFn: () =>
      updateAdminExternalDeliveryConfig(restaurantId, {
        enabled,
        deliveryFeeTaka: deliveryFee.trim() ? Number(deliveryFee) : 0,
        settlementPolicy: policy,
        settlementDays:
          policy === "t_plus_n" && settlementDays.trim()
            ? Number(settlementDays)
            : null,
        exposureCapTaka: exposureCap.trim() ? Number(exposureCap) : null,
      }),
    onSuccess: () => {
      toast.success("External delivery settings saved")
      void queryClient.invalidateQueries({
        queryKey: ["admin-external-delivery-config", restaurantId],
      })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to save settings")
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bike className="size-4" />
          External (off-platform) delivery
        </CardTitle>
        <CardDescription>
          Let this restaurant send its own-channel orders (Facebook/WhatsApp) to Foodbela
          riders. Foodbela collects the payment, keeps the flat fee below, and settles the
          rest to the owner — fully separate from the app-order commission &amp; weekly
          payout.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {configQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Enable external delivery</p>
                <p className="text-xs text-muted-foreground">
                  Currently holding {formatTk(configQuery.data?.currentExposureTaka)} for this
                  restaurant
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm">{enabled ? "On" : "Off"}</span>
                <Switch checked={enabled} onCheckedChange={setEnabled} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Flat delivery fee (Tk)</Label>
                <Input
                  type="number"
                  min={0}
                  value={deliveryFee}
                  onChange={(event) => setDeliveryFee(event.target.value)}
                  placeholder="e.g. 60"
                />
                <p className="text-[11px] text-muted-foreground">
                  Foodbela keeps this per delivery; the customer pays it on top of the order
                  value.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Settlement speed</Label>
                <Select
                  value={policy}
                  onValueChange={(value) => setPolicy(value as ExternalSettlementPolicy)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {POLICY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {policy === "t_plus_n" ? (
                <div className="space-y-2">
                  <Label>Days after delivery</Label>
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    value={settlementDays}
                    onChange={(event) => setSettlementDays(event.target.value)}
                    placeholder="e.g. 3"
                  />
                </div>
              ) : null}
              <div className="space-y-2">
                <Label>Exposure cap (optional)</Label>
                <Input
                  type="number"
                  min={0}
                  value={exposureCap}
                  onChange={(event) => setExposureCap(event.target.value)}
                  placeholder="Max unsettled Tk (blank = no cap)"
                />
              </div>
            </div>

            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <BadgeCheck className="size-4" />
              )}
              Save settings
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
