import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CheckCircle2,
  Loader2,
  MailCheck,
  MessageCircle,
  Save,
  Send,
  Server,
  ShieldAlert,
} from "lucide-react"
import { toast } from "sonner"

import {
  getAdminAlertSettings,
  sendAdminTestAlert,
  sendAdminTelegramTestAlert,
  updateAdminAlertSettings,
  type AdminAlertDeliverySettings,
} from "@/lib/admin-alert-settings-api"
import { Badge } from "@/components/ui/badge"
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
import { Skeleton } from "@/components/ui/skeleton"

function splitEmails(value: string) {
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

function joinEmails(values: string[]) {
  return values.join(", ")
}

function numberInput(value: number, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const defaultDraft: AdminAlertDeliverySettings = {
  recipientEmails: [],
  notificationChannel: "both",
  fromEmail: "alerts@foodbela.com",
  fromName: "Foodbela Monitor",
  cooldownMinutes: 30,
  checkIntervalSeconds: 60,
  memoryRssMb: 900,
  cpuPercent: 85,
  fivexxThreshold: 5,
  rateLimitThreshold: 20,
  sslExpiryDays: 14,
}

export function TestPage() {
  const queryClient = useQueryClient()
  const [draft, setDraft] =
    React.useState<AdminAlertDeliverySettings>(defaultDraft)
  const [recipientText, setRecipientText] = React.useState("")

  const settingsQuery = useQuery({
    queryKey: ["admin-alert-settings"],
    queryFn: getAdminAlertSettings,
  })

  React.useEffect(() => {
    const settings = settingsQuery.data?.settings
    if (!settings) return
    setDraft({
      ...defaultDraft,
      ...settings,
      notificationChannel: settings.notificationChannel ?? "both",
    })
    setRecipientText(joinEmails(settings.recipientEmails))
  }, [settingsQuery.data?.settings])

  const saveMutation = useMutation({
    mutationFn: () =>
      updateAdminAlertSettings({
        ...draft,
        recipientEmails: splitEmails(recipientText),
      }),
    onSuccess: (data) => {
      setDraft(data.settings)
      setRecipientText(joinEmails(data.settings.recipientEmails))
      queryClient.setQueryData(["admin-alert-settings"], data)
      toast.success("Alert settings saved")
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to save alert settings"
      )
    },
  })

  const testMutation = useMutation({
    mutationFn: () =>
      sendAdminTestAlert({
        recipientEmails: splitEmails(recipientText),
        fromEmail: draft.fromEmail,
        fromName: draft.fromName,
      }),
    onSuccess: (data) => {
      toast.success(`Test email attempted for ${data.recipients.join(", ")}`)
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to send test email"
      )
    },
  })

  const telegramTestMutation = useMutation({
    mutationFn: (layer: "operations" | "system") =>
      sendAdminTelegramTestAlert(layer),
    onSuccess: (data) => {
      toast.success(`Telegram ${data.layer} test sent`)
      queryClient.setQueryData(["admin-alert-settings"], (current: unknown) => {
        if (!current || typeof current !== "object") return current
        return { ...(current as Record<string, unknown>), status: data.status }
      })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to send Telegram test"
      )
    },
  })

  const status = settingsQuery.data?.status
  const recipients = splitEmails(recipientText)
  const canSend =
    recipients.length > 0 &&
    draft.fromEmail.trim().length > 0 &&
    draft.fromName.trim().length > 0

  if (settingsQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-96" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MailCheck className="size-4" />
            </div>
            <Badge variant="outline">Alert delivery</Badge>
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">
            Test
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Verify Foodbela system alert email delivery and choose where
            production alerts are sent.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Save
          </Button>
          <Button
            disabled={!canSend || testMutation.isPending}
            onClick={() => testMutation.mutate()}
          >
            {testMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Send test
          </Button>
          <Button
            variant="outline"
            disabled={
              !status?.telegramOpsConfigured || telegramTestMutation.isPending
            }
            onClick={() => telegramTestMutation.mutate("operations")}
          >
            {telegramTestMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MessageCircle className="size-4" />
            )}
            Test ops
          </Button>
          <Button
            variant="outline"
            disabled={
              !status?.telegramSystemConfigured || telegramTestMutation.isPending
            }
            onClick={() => telegramTestMutation.mutate("system")}
          >
            {telegramTestMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MessageCircle className="size-4" />
            )}
            Test system
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <Server className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground uppercase">
                SMTP
              </p>
              <p className="mt-1 truncate text-sm font-semibold">
                {status?.smtpHost || "Not configured"}
              </p>
              <p className="text-xs text-muted-foreground">
                {status?.smtpUser || "No SMTP user"}
              </p>
            </div>
            <Badge
              variant={status?.smtpConfigured ? "outline" : "destructive"}
              className="ml-auto"
            >
              {status?.smtpConfigured ? "Ready" : "Missing"}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <ShieldAlert className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase">
                Alerts
              </p>
              <p className="mt-1 text-sm font-semibold">
                {status?.enabled ? "Enabled" : "Disabled"}
              </p>
              <p className="text-xs text-muted-foreground">
                Cooldown {draft.cooldownMinutes} min
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <CheckCircle2 className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase">
                Recipients
              </p>
              <p className="mt-1 text-sm font-semibold">
                {recipients.length}
              </p>
              <p className="text-xs text-muted-foreground">
                Email targets selected
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <MessageCircle className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground uppercase">
                Telegram
              </p>
              <p className="mt-1 text-sm font-semibold">
                Ops {status?.telegramOpsConfigured ? "ready" : "missing"}
              </p>
              <p className="text-xs text-muted-foreground">
                System {status?.telegramSystemConfigured ? "ready" : "missing"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Email delivery</CardTitle>
          <CardDescription>
            SMTP password remains in the server `.env`; this page only manages
            recipients, sender alias, thresholds, and test sends.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2 md:max-w-sm">
            <Label>Production notification channel</Label>
            <Select
              value={draft.notificationChannel}
              onValueChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  notificationChannel: value as AdminAlertDeliverySettings["notificationChannel"],
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="both">Email and Telegram</SelectItem>
                <SelectItem value="telegram">Telegram only</SelectItem>
                <SelectItem value="email">Email only</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Applies to production operations alerts. Test buttons still target
              their own channel.
            </p>
          </div>

          <div className="grid gap-2">
            <Label>Alert recipient emails</Label>
            <Input
              value={recipientText}
              placeholder="yourgmail@gmail.com, support@foodbela.com"
              onChange={(event) => setRecipientText(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Use comma-separated emails. Gmail is fine for phone
              notifications.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>From email alias</Label>
              <Input
                value={draft.fromEmail}
                placeholder="alerts@foodbela.com"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    fromEmail: event.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>From name</Label>
              <Input
                value={draft.fromName}
                placeholder="Foodbela Monitor"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    fromName: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="grid gap-2">
              <Label>Cooldown minutes</Label>
              <Input
                type="number"
                min={1}
                value={draft.cooldownMinutes}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    cooldownMinutes: numberInput(
                      Number(event.target.value),
                      current.cooldownMinutes
                    ),
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>Memory threshold MB</Label>
              <Input
                type="number"
                min={128}
                value={draft.memoryRssMb}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    memoryRssMb: numberInput(
                      Number(event.target.value),
                      current.memoryRssMb
                    ),
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>CPU threshold %</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={draft.cpuPercent}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    cpuPercent: numberInput(
                      Number(event.target.value),
                      current.cpuPercent
                    ),
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>5xx threshold</Label>
              <Input
                type="number"
                min={1}
                value={draft.fivexxThreshold}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    fivexxThreshold: numberInput(
                      Number(event.target.value),
                      current.fivexxThreshold
                    ),
                  }))
                }
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>Rate limit threshold (429s / 5 min)</Label>
              <Input
                type="number"
                min={1}
                value={draft.rateLimitThreshold}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    rateLimitThreshold: numberInput(
                      Number(event.target.value),
                      current.rateLimitThreshold
                    ),
                  }))
                }
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>Check interval seconds</Label>
              <Input
                type="number"
                min={15}
                value={draft.checkIntervalSeconds}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    checkIntervalSeconds: numberInput(
                      Number(event.target.value),
                      current.checkIntervalSeconds
                    ),
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>SSL expiry days</Label>
              <Input
                type="number"
                min={1}
                value={draft.sslExpiryDays}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    sslExpiryDays: numberInput(
                      Number(event.target.value),
                      current.sslExpiryDays
                    ),
                  }))
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
