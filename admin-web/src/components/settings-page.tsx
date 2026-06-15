import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Ban,
  ChevronDown,
  Coins,
  Loader2,
  Lock,
  MapPin,
  MessageSquareText,
  CreditCard,
  Gift,
  Info,
  RefreshCcw,
  Save,
  Settings,
  ShieldCheck,
  Truck,
  Unlock,
} from "lucide-react"
import { toast } from "sonner"

import {
  getAdminDispatchSettings,
  listAdminRidersAssignmentOptions,
  getAdminOtpSecurity,
  deleteAdminOtpBlock,
  listAdminActivityLogs,
  upsertAdminOtpBlock,
} from "@/lib/admin-api"
import {
  getAdminPlatformSettings,
  updateAdminPlatformSettings,
  type AdminPlatformSettings,
} from "@/lib/admin-settings-api"
import {
  getAdminZoneScope,
  subscribeAdminZoneScope,
} from "@/lib/admin-zone-scope"
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
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

type PlatformContent = AdminPlatformSettings

function cloneContent(content: PlatformContent) {
  return JSON.parse(JSON.stringify(content)) as PlatformContent
}

function numberFromInput(value: string, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

const defaultFinanceSettings: PlatformContent["operations"]["finance"] = {
  settlementDelayDays: 3,
  minimumPayoutAmountEnabled: true,
  minimumPayoutAmountTaka: 500,
  oneActivePayoutRequest: true,
}

const defaultAdminNotificationSettings: PlatformContent["operations"]["adminNotifications"] =
  {
    orderPlaced: true,
    customerOrderUpdates: false,
    orderDelays: true,
    preparationDelays: true,
    riderDelays: true,
    deliveryDelays: true,
    paymentExceptions: true,
    payoutRequests: true,
    support: true,
    security: true,
    campaigns: true,
  }

const defaultOwnerAppSettings: PlatformContent["operations"]["ownerApp"] = {
  webDashboardUrl: "http://localhost:5173",
  showCustomerPhoneNumbers: true,
}

const defaultPaymentSettings: PlatformContent["operations"]["payments"] = {
  cashOnDeliveryEnabled: true,
  bkashEnabled: false,
  bkashLabel: "bKash",
  bkashSubtitle: "Continue to the official hosted payment page.",
  bkashRefundEtaMinutes: 60,
  bkashRefundSmsEnabled: true,
  bkashRefundSmsTemplate:
    "{{platformName}}: Refund completed for {{orderNumber}}. Amount {{amount}}. Ref {{refundReference}}.",
}

const defaultRateLimitSettings: PlatformContent["auth"]["rateLimits"] = {
  signinAttemptsPerWindow: 10,
  signupAttemptsPerWindow: 5,
  otpSendPerPhoneWindow: 5,
  otpSendPerIpWindow: 12,
  otpVerifyAttemptsPerWindow: 8,
  passwordRecoveryPerWindow: 5,
  refreshPerWindow: 30,
  paymentInitiatePerWindow: 8,
  orderPlacePerWindow: 12,
  orderActionPerWindow: 10,
  cartQuotePerWindow: 300,
  supportWritePerWindow: 20,
  analyticsEventsPerWindow: 240,
  riderLocationPerWindow: 900,
  adminWritePerWindow: 240,
  ownerWritePerWindow: 240,
  otpPhoneHourlySendLimit: 5,
  otpPhoneDailySendLimit: 15,
  otpIpDailySendLimit: 60,
  otpFailedVerifyLimit: 5,
  otpVerifyLockMinutes: 15,
}

function ensureFinanceSettings(content: PlatformContent) {
  content.operations.finance = {
    ...defaultFinanceSettings,
    ...(content.operations.finance ?? {}),
  }
  return content.operations.finance
}

function ensureAdminNotificationSettings(content: PlatformContent) {
  content.operations.adminNotifications = {
    ...defaultAdminNotificationSettings,
    ...(content.operations.adminNotifications ?? {}),
  }
  return content.operations.adminNotifications
}

function ensureOwnerAppSettings(content: PlatformContent) {
  content.operations.ownerApp = {
    ...defaultOwnerAppSettings,
    ...(content.operations.ownerApp ?? {}),
  }
  return content.operations.ownerApp
}

function ensurePaymentSettings(content: PlatformContent) {
  content.operations.payments = {
    ...defaultPaymentSettings,
    ...(content.operations.payments ?? {}),
  }
  return content.operations.payments
}

function ensureRateLimitSettings(content: PlatformContent) {
  content.auth.rateLimits = {
    ...defaultRateLimitSettings,
    ...(content.auth.rateLimits ?? {}),
  }
  return content.auth.rateLimits
}

function renderOtpTemplatePreview(
  template: string,
  platformName: string,
  expiresInSeconds: number
) {
  const expiryMinutes = Math.max(1, Math.ceil(expiresInSeconds / 60))
  return template
    .replaceAll("{{code}}", "123456")
    .replaceAll("{{platformName}}", platformName || "Foodbela")
    .replaceAll("{{expiryMinutes}}", String(expiryMinutes))
    .replaceAll("{{expirySeconds}}", String(expiresInSeconds))
}

function renderRefundSmsTemplatePreview(
  template: string,
  platformName: string
) {
  return template
    .replaceAll("{{platformName}}", platformName || "Foodbela")
    .replaceAll("{{orderNumber}}", "FB-1042")
    .replaceAll("{{amount}}", "Tk 260")
    .replaceAll("{{refundReference}}", "RF-82910")
    .replaceAll("{{transactionId}}", "TRX123456")
    .replaceAll("{{customerName}}", "Customer")
    .replaceAll("{{customerPhone}}", "01700000000")
}

function renderReferralTemplatePreview(
  template: string,
  referrals: PlatformContent["operations"]["referrals"]
) {
  const code = "FB7K2D9X"
  const values = {
    code,
    referralCode: code,
    encodedCode: encodeURIComponent(code),
    rewardAmount: String(referrals.rewardAmountTaka),
    minimumOrderAmount: String(referrals.minimumOrderAmountTaka),
    rewardExpiryDays: String(referrals.voucherExpiryDays),
    monthlyRewardCap: String(referrals.monthlyRewardCapPerCustomer),
    platformName: "Foodbela",
  }
  const link = Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, value),
    referrals.shareLinkTemplate
  )

  return Object.entries({ ...values, link }).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, value),
    template
  )
}

function formatDateTime(value?: string | null) {
  if (!value) return "Never saved"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Never saved"
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

const recommendedOrderAutomation = {
  autoCancelUnacceptedOrdersEnabled: true,
  autoCancelAfterMinutes: 12,
  autoCancelNotifyBeforeMinutes: 3,
  prepStartGraceMinutes: 3,
  preparationMaxExtraMinutes: 20,
  prepLateGraceMinutes: 5,
  pickupLateGraceMinutes: 10,
  deliveryLateGraceMinutes: 10,
  deliveryWatchAfterPickupMinutes: 20,
  deliveryLateAfterPickupMinutes: 25,
  deliveryCriticalAfterPickupMinutes: 30,
  riderEtaSpeedKmph: 24,
  riderEtaRouteFactor: 1.1,
}

const operationalThresholdFields = [
  [
    "ownerAcceptanceTimeoutMinutes",
    "Owner acceptance timeout",
    "minutes",
    1,
    180,
  ],
  ["autoCancelAfterMinutes", "Auto-cancel unaccepted after", "minutes", 2, 240],
  [
    "autoCancelNotifyBeforeMinutes",
    "Notify admin before auto-cancel",
    "minutes",
    1,
    60,
  ],
  ["maxActiveOrdersPerRider", "Max active orders per rider", "orders", 1, 50],
  [
    "staleLocationCutoffMinutes",
    "Stale rider location cutoff",
    "minutes",
    1,
    180,
  ],
  ["assignmentTimeoutMinutes", "Rider assignment timeout", "minutes", 1, 180],
  ["prepStartGraceMinutes", "Prep start grace", "minutes after accept", 1, 180],
  ["preparationMaxExtraMinutes", "Max extra prep time", "minutes", 0, 180],
  [
    "prepLateGraceMinutes",
    "Prep late grace",
    "minutes after expected prep",
    0,
    180,
  ],
  [
    "pickupLateGraceMinutes",
    "Pickup late window",
    "minutes after ready",
    1,
    180,
  ],
  [
    "deliveryLateGraceMinutes",
    "Delivery ETA grace",
    "minutes after ETA",
    1,
    180,
  ],
  [
    "deliveryWatchAfterPickupMinutes",
    "Delivery watch after pickup",
    "minutes after pickup",
    1,
    240,
  ],
  [
    "deliveryLateAfterPickupMinutes",
    "Delivery late after pickup",
    "minutes after pickup",
    1,
    240,
  ],
  [
    "deliveryCriticalAfterPickupMinutes",
    "Delivery critical after pickup",
    "minutes after pickup",
    1,
    240,
  ],
  ["riderEtaSpeedKmph", "Rider ETA cycle speed", "km/h", 6, 45],
  [
    "riderEtaRouteFactor",
    "Rider ETA route multiplier",
    "x direct distance",
    1,
    2,
  ],
  ["retryCooldownMinutes", "Dispatch retry cooldown", "minutes", 1, 60],
  ["surgeReadyOrderThreshold", "Surge ready-order threshold", "orders", 1, 100],
  [
    "surgeUnassignedOrderThreshold",
    "Surge unassigned threshold",
    "orders",
    1,
    100,
  ],
] as const

const adminNotificationRules: Array<{
  key: keyof PlatformContent["operations"]["adminNotifications"]
  title: string
  description: string
  badge: string
}> = [
  {
    key: "orderPlaced",
    title: "New order placed",
    description:
      "Show admin inbox entries when customers place new orders. Useful early, noisy at high order volume.",
    badge: "Orders",
  },
  {
    key: "customerOrderUpdates",
    title: "Customer order updates",
    description:
      "Smooth-running customer status notifications like food preparing, on the way, rider nearby, and delivered. Customer push still goes out when this is off.",
    badge: "Customer app",
  },
  {
    key: "orderDelays",
    title: "Order acceptance / auto-cancel alerts",
    description:
      "Restaurant response late, auto-cancel warning, and auto-cancelled order alerts.",
    badge: "Orders",
  },
  {
    key: "preparationDelays",
    title: "Preparation delay alerts",
    description: "Food prep not started or taking longer than expected.",
    badge: "Kitchen",
  },
  {
    key: "riderDelays",
    title: "Rider assignment / pickup alerts",
    description:
      "Rider not assigned, rider response late, pickup late, and stale rider location alerts.",
    badge: "Riders",
  },
  {
    key: "deliveryDelays",
    title: "Delivery late alerts",
    description:
      "Delivery watch, late, critical, and ETA exceeded alerts after pickup.",
    badge: "Delivery",
  },
  {
    key: "paymentExceptions",
    title: "Payment exception alerts",
    description:
      "bKash paid-without-order, paid cancelled orders that need refund review, and gateway reconciliation failures.",
    badge: "Payments",
  },
  {
    key: "payoutRequests",
    title: "Payout request alerts",
    description:
      "Notify admin when an owner requests payout or payout status needs attention.",
    badge: "Finance",
  },
  {
    key: "support",
    title: "Support case alerts",
    description:
      "Owner/customer support case creation and important support follow-ups.",
    badge: "Support",
  },
  {
    key: "security",
    title: "Security / fraud alerts",
    description:
      "OTP abuse, referral fraud, suspicious device, and account risk alerts.",
    badge: "Security",
  },
  {
    key: "campaigns",
    title: "Campaign / scheduled notifications",
    description:
      "Admin-created campaign and scheduled notification history in the admin inbox.",
    badge: "Campaign",
  },
]

const rateLimitFields: Array<{
  key: keyof PlatformContent["auth"]["rateLimits"]
  title: string
  description: string
  windowLabel: string
  min: number
  max: number
  step?: number
}> = [
  {
    key: "signinAttemptsPerWindow",
    title: "Sign-in attempts",
    description: "Per IP plus phone/email identity.",
    windowLabel: "15 minutes",
    min: 2,
    max: 100,
  },
  {
    key: "signupAttemptsPerWindow",
    title: "Owner sign-up attempts",
    description: "Per IP plus phone/email identity.",
    windowLabel: "30 minutes",
    min: 1,
    max: 50,
  },
  {
    key: "otpSendPerPhoneWindow",
    title: "OTP sends per phone",
    description: "Express limiter before OTP abuse DB guard.",
    windowLabel: "10 minutes",
    min: 1,
    max: 30,
  },
  {
    key: "otpSendPerIpWindow",
    title: "OTP sends per IP",
    description: "Stops many OTP requests from one network/device.",
    windowLabel: "10 minutes",
    min: 3,
    max: 100,
  },
  {
    key: "otpVerifyAttemptsPerWindow",
    title: "OTP verify attempts",
    description: "Per verification session or phone.",
    windowLabel: "10 minutes",
    min: 3,
    max: 30,
  },
  {
    key: "passwordRecoveryPerWindow",
    title: "Password recovery",
    description: "Forgot/reset password request protection.",
    windowLabel: "15 minutes",
    min: 1,
    max: 30,
  },
  {
    key: "refreshPerWindow",
    title: "Auth refresh",
    description: "Protects token refresh loops.",
    windowLabel: "15 minutes",
    min: 10,
    max: 300,
  },
  {
    key: "paymentInitiatePerWindow",
    title: "Payment initiate",
    description: "Customer bKash/payment creation attempts.",
    windowLabel: "15 minutes",
    min: 2,
    max: 60,
  },
  {
    key: "orderPlacePerWindow",
    title: "Order placement",
    description: "Customer order creation attempts.",
    windowLabel: "15 minutes",
    min: 2,
    max: 100,
  },
  {
    key: "orderActionPerWindow",
    title: "Order cancel/review",
    description: "Customer order action mutation attempts.",
    windowLabel: "15 minutes",
    min: 2,
    max: 100,
  },
  {
    key: "cartQuotePerWindow",
    title: "Cart quote",
    description: "Cart pricing/quote recalculation requests.",
    windowLabel: "15 minutes",
    min: 60,
    max: 1000,
    step: 10,
  },
  {
    key: "supportWritePerWindow",
    title: "Support writes",
    description: "Customer support case and message creation.",
    windowLabel: "15 minutes",
    min: 5,
    max: 200,
  },
  {
    key: "analyticsEventsPerWindow",
    title: "Analytics events",
    description: "Customer app lightweight event ingestion.",
    windowLabel: "15 minutes",
    min: 60,
    max: 2000,
    step: 10,
  },
  {
    key: "riderLocationPerWindow",
    title: "Rider location updates",
    description: "Per rider live location heartbeat/tracking.",
    windowLabel: "15 minutes",
    min: 120,
    max: 3000,
    step: 10,
  },
  {
    key: "adminWritePerWindow",
    title: "Admin write endpoints",
    description: "Admin POST/PATCH/PUT/DELETE across protected modules.",
    windowLabel: "15 minutes",
    min: 60,
    max: 1000,
    step: 10,
  },
  {
    key: "ownerWritePerWindow",
    title: "Owner write endpoints",
    description:
      "Owner app/web POST/PATCH/PUT/DELETE across protected modules.",
    windowLabel: "15 minutes",
    min: 60,
    max: 1000,
    step: 10,
  },
  {
    key: "otpPhoneHourlySendLimit",
    title: "OTP phone hourly DB guard",
    description: "Hard OTP abuse guard counted from security events.",
    windowLabel: "1 hour",
    min: 1,
    max: 60,
  },
  {
    key: "otpPhoneDailySendLimit",
    title: "OTP phone daily DB guard",
    description: "Maximum sent OTPs to one phone per day.",
    windowLabel: "24 hours",
    min: 1,
    max: 200,
  },
  {
    key: "otpIpDailySendLimit",
    title: "OTP IP daily DB guard",
    description: "Maximum sent OTPs from one IP per day.",
    windowLabel: "24 hours",
    min: 5,
    max: 1000,
  },
  {
    key: "otpFailedVerifyLimit",
    title: "Wrong OTP lock threshold",
    description: "Session locks after this many wrong OTP attempts.",
    windowLabel: "per OTP session",
    min: 3,
    max: 20,
  },
  {
    key: "otpVerifyLockMinutes",
    title: "Wrong OTP lock duration",
    description: "How long a locked OTP session stays blocked.",
    windowLabel: "minutes",
    min: 5,
    max: 1440,
  },
]

const operationalThresholdHelp = [
  {
    title: "Owner acceptance timeout",
    text: "নতুন অর্ডার আসার পর রেস্টুরেন্ট accept না করলে কত মিনিট পরে admin warning পাবে। এটা শুধু alert, auto-cancel না।",
  },
  {
    title: "Auto-cancel unaccepted after",
    text: "Auto-cancel switch on থাকলে New order accept না হলে এই সময় শেষে system order Cancelled করে দেবে।",
  },
  {
    title: "Notify admin before auto-cancel",
    text: "Auto-cancel হওয়ার কত মিনিট আগে admin কে warning দেখাবে, যাতে চাইলে আগে intervene করা যায়।",
  },
  {
    title: "Max active orders per rider",
    text: "একজন rider একসাথে সর্বোচ্চ কয়টা Ready/PickedUp order নিতে পারবে। বেশি দিলে rider overload হতে পারে।",
  },
  {
    title: "Stale rider location cutoff",
    text: "Rider location এত মিনিট পুরোনো হলে dispatch engine তাকে unreliable ধরে। Live location না থাকলে assign কম হবে।",
  },
  {
    title: "Rider assignment timeout",
    text: "Order Ready হওয়ার পর এই সময়ের মধ্যে rider assign/acknowledge না হলে admin alert বা retry dispatch logic কাজ করবে।",
  },
  {
    title: "Prep start grace",
    text: "Owner order accept করার পর এই সময়ের মধ্যে Start preparing না চাপলে system auto Preparing শুরু করবে। এখন recommended 3 মিনিট।",
  },
  {
    title: "Max extra prep time",
    text: "Owner food preparing চলাকালে মোট কত মিনিট extra time যোগ করতে পারবে। 10 দিলে +5/+10 chip মিলিয়ে সর্বোচ্চ 10 মিনিট পর্যন্ত বাড়ানো যাবে।",
  },
  {
    title: "Prep late grace",
    text: "Restaurant-এর expected preparation time শেষ হওয়ার পর অতিরিক্ত কত মিনিট wait করে late prep alert দেখাবে।",
  },
  {
    title: "Pickup late window",
    text: "Order Ready হওয়ার পর rider pickup করতে দেরি করলে কত মিনিট পরে pickup late alert হবে।",
  },
  {
    title: "Delivery ETA grace",
    text: "Rider pickup করার পর estimated delivery time পার হয়ে গেলে কত মিনিট grace দিয়ে late delivery alert হবে।",
  },
  {
    title: "Delivery watch after pickup",
    text: "Rider pickup করার পর এই সময় পার হলে order watch list-এ যাবে। এটা early warning, যাতে admin আগে থেকেই নজর রাখতে পারে।",
  },
  {
    title: "Delivery late after pickup",
    text: "Pickup-এর পর এই target পার হলে delivery late alert তৈরি হবে। Example: 25 মিনিট দিলে rider 25 মিনিটের বেশি out থাকলে admin দেখবে।",
  },
  {
    title: "Delivery critical after pickup",
    text: "Late target ছাড়িয়ে আরও বেশি delay হলে critical alert হবে। Customer follow-up বা rider check করার জন্য এটা সবচেয়ে important signal।",
  },
  {
    title: "Dispatch retry cooldown",
    text: "একবার auto dispatch চেষ্টা করার পর আবার retry করার আগে minimum কত মিনিট wait করবে।",
  },
  {
    title: "Surge ready-order threshold",
    text: "Ready order সংখ্যা এই limit ছাড়ালে dispatch pressure/surge state ধরা হবে।",
  },
  {
    title: "Surge unassigned threshold",
    text: "Unassigned ready order সংখ্যা এই limit ছাড়ালে admin/rider dispatch pressure বোঝাবে।",
  },
] as const

function SettingRow({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-3 rounded-lg border bg-background p-3 md:grid-cols-[1fr_280px] md:items-center">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <div>{children}</div>
    </div>
  )
}

export function SettingsPage() {
  const queryClient = useQueryClient()
  const [adminZoneScope, setAdminZoneScope] = React.useState(() =>
    getAdminZoneScope()
  )
  const adminScopeKey = `${adminZoneScope.type}:${adminZoneScope.id || "all"}`

  React.useEffect(
    () =>
      subscribeAdminZoneScope(() => {
        setAdminZoneScope(getAdminZoneScope())
        setDraft(null)
        setIsDirty(false)
      }),
    []
  )

  const platformContentQuery = useQuery({
    queryKey: ["admin-platform-settings", adminScopeKey],
    queryFn: getAdminPlatformSettings,
  })
  const [activeTab, setActiveTab] = React.useState<
    | "operations"
    | "notifications"
    | "payments"
    | "referrals"
    | "general"
    | "security"
    | "support"
  >("operations")
  const dispatchQuery = useQuery({
    queryKey: ["admin-dispatch-settings", adminScopeKey],
    queryFn: getAdminDispatchSettings,
    enabled: activeTab === "operations",
  })
  const ridersQuery = useQuery({
    queryKey: ["admin-riders-assignment-options", "settings-primary", adminScopeKey],
    queryFn: listAdminRidersAssignmentOptions,
    enabled: activeTab === "operations",
  })
  const activityLogsQuery = useQuery({
    queryKey: ["admin-activity-logs", "settings"],
    queryFn: () => listAdminActivityLogs({ pageSize: 8, includeTotal: false }),
    enabled: activeTab === "operations",
  })
  const otpSecurityQuery = useQuery({
    queryKey: ["admin-otp-security", "settings"],
    queryFn: () => getAdminOtpSecurity({ hours: 24, pageSize: 10 }),
    staleTime: 30_000,
    enabled: activeTab === "security",
  })
  const settingsLoadError =
    platformContentQuery.error instanceof Error
      ? platformContentQuery.error
      : null

  const [draft, setDraft] = React.useState<PlatformContent | null>(null)
  const [isDirty, setIsDirty] = React.useState(false)
  const [otpBlockTargetType, setOtpBlockTargetType] = React.useState<
    "phone" | "ip" | "device"
  >("phone")
  const [otpBlockTargetValue, setOtpBlockTargetValue] = React.useState("")
  const [otpBlockDuration, setOtpBlockDuration] = React.useState("60")
  const [otpBlockPermanent, setOtpBlockPermanent] = React.useState(false)
  const [otpBlockReason, setOtpBlockReason] = React.useState(
    "Suspicious OTP activity"
  )
  const [showThresholdHelp, setShowThresholdHelp] = React.useState(false)

  React.useEffect(() => {
    const content = platformContentQuery.data?.settings
    if (!content) return
    const cloned = cloneContent(content)
    ensurePaymentSettings(cloned)
    ensureFinanceSettings(cloned)
    ensureAdminNotificationSettings(cloned)
    ensureRateLimitSettings(cloned)
    setDraft(cloned)
    setIsDirty(false)
  }, [platformContentQuery.data?.settings])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("Settings are still loading")
      return updateAdminPlatformSettings(draft)
    },
    onSuccess: (result) => {
      toast.success("Platform settings updated")
      const cloned = cloneContent(result.settings)
      ensurePaymentSettings(cloned)
      ensureFinanceSettings(cloned)
      ensureAdminNotificationSettings(cloned)
      ensureRateLimitSettings(cloned)
      setDraft(cloned)
      setIsDirty(false)
      void queryClient.invalidateQueries({
        queryKey: ["admin-platform-settings"],
      })
      void queryClient.invalidateQueries({ queryKey: ["admin-notifications"] })
      void queryClient.invalidateQueries({
        queryKey: ["admin-dispatch-settings"],
      })
      void queryClient.invalidateQueries({
        queryKey: ["admin-dashboard-orders"],
      })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to save settings"
      )
    },
  })

  const otpBlockMutation = useMutation({
    mutationFn: () =>
      upsertAdminOtpBlock({
        targetType: otpBlockTargetType,
        targetValue: otpBlockTargetValue,
        durationMinutes: otpBlockPermanent
          ? undefined
          : clampNumber(numberFromInput(otpBlockDuration, 60), 5, 60 * 24 * 30),
        permanent: otpBlockPermanent,
        reason: otpBlockReason,
      }),
    onSuccess: () => {
      toast.success("OTP block updated")
      setOtpBlockTargetValue("")
      void queryClient.invalidateQueries({ queryKey: ["admin-otp-security"] })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to update OTP block"
      )
    },
  })

  const otpUnblockMutation = useMutation({
    mutationFn: deleteAdminOtpBlock,
    onSuccess: () => {
      toast.success("OTP block removed")
      void queryClient.invalidateQueries({ queryKey: ["admin-otp-security"] })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to remove OTP block"
      )
    },
  })

  const hasChanges = isDirty
  const dispatchMetrics = dispatchQuery.data?.metrics

  const updateDraft = (updater: (content: PlatformContent) => void) => {
    setDraft((current) => {
      if (!current) return current
      const next = cloneContent(current)
      updater(next)
      return next
    })
    setIsDirty(true)
  }

  const resetDraft = () => {
    const content = platformContentQuery.data?.settings
    if (!content) return
    const cloned = cloneContent(content)
    ensurePaymentSettings(cloned)
    ensureFinanceSettings(cloned)
    ensureAdminNotificationSettings(cloned)
    ensureRateLimitSettings(cloned)
    setDraft(cloned)
    setIsDirty(false)
    toast.info("Unsaved settings reset")
  }

  const applyRecommendedOrderAutomation = () => {
    updateDraft((content) => {
      content.operations.dispatch.autoCancelUnacceptedOrdersEnabled =
        recommendedOrderAutomation.autoCancelUnacceptedOrdersEnabled
      content.operations.dispatch.autoCancelAfterMinutes =
        recommendedOrderAutomation.autoCancelAfterMinutes
      content.operations.dispatch.autoCancelNotifyBeforeMinutes =
        recommendedOrderAutomation.autoCancelNotifyBeforeMinutes
      content.operations.dispatch.prepStartGraceMinutes =
        recommendedOrderAutomation.prepStartGraceMinutes
      content.operations.dispatch.preparationMaxExtraMinutes =
        recommendedOrderAutomation.preparationMaxExtraMinutes
      content.operations.dispatch.prepLateGraceMinutes =
        recommendedOrderAutomation.prepLateGraceMinutes
      content.operations.dispatch.pickupLateGraceMinutes =
        recommendedOrderAutomation.pickupLateGraceMinutes
      content.operations.dispatch.deliveryLateGraceMinutes =
        recommendedOrderAutomation.deliveryLateGraceMinutes
      content.operations.dispatch.deliveryWatchAfterPickupMinutes =
        recommendedOrderAutomation.deliveryWatchAfterPickupMinutes
      content.operations.dispatch.deliveryLateAfterPickupMinutes =
        recommendedOrderAutomation.deliveryLateAfterPickupMinutes
      content.operations.dispatch.deliveryCriticalAfterPickupMinutes =
        recommendedOrderAutomation.deliveryCriticalAfterPickupMinutes
    })
    toast.info("Recommended auto-cancel policy applied")
  }

  if (platformContentQuery.isError) {
    return (
      <div className="grid min-h-[360px] place-items-center rounded-lg border border-destructive/30 bg-destructive/5 p-6">
        <div className="max-w-md space-y-3 text-center">
          <p className="text-lg font-semibold">Settings failed to load</p>
          <p className="text-sm text-muted-foreground">
            {settingsLoadError?.message ?? "Please retry the request."}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void platformContentQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      </div>
    )
  }

  if (platformContentQuery.isLoading || !draft) {
    return (
      <div className="grid min-h-[360px] place-items-center rounded-lg border border-dashed">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading platform settings...
        </div>
      </div>
    )
  }

  const dispatch = draft.operations.dispatch
  const serviceArea = draft.operations.serviceArea
  const liveTracking = draft.operations.liveTracking
  const payments = draft.operations.payments
  const finance = draft.operations.finance ?? defaultFinanceSettings
  const adminNotifications =
    draft.operations.adminNotifications ?? defaultAdminNotificationSettings
  const referrals = draft.operations.referrals
  const ownerApp = {
    ...defaultOwnerAppSettings,
    ...(draft.operations.ownerApp ?? {}),
  }
  const referralShareLinkPreview = renderReferralTemplatePreview(
    referrals.shareLinkTemplate,
    referrals
  )
  const referralShareMessagePreview = renderReferralTemplatePreview(
    referrals.shareMessageTemplate,
    referrals
  )
  const support = draft.supportContact
  const otp = draft.auth.otp
  const rateLimits = {
    ...defaultRateLimitSettings,
    ...(draft.auth.rateLimits ?? {}),
  }
  const otpPreview = renderOtpTemplatePreview(
    otp.messageTemplate,
    draft.branding.platformName,
    otp.expiresInSeconds
  )
  const refundSmsPreview = renderRefundSmsTemplatePreview(
    payments.bkashRefundSmsTemplate,
    draft.branding.platformName
  )
  const otpTemplateValid = otp.messageTemplate.includes("{{code}}")
  const refundSmsTemplateValid =
    payments.bkashRefundSmsTemplate.trim().length >= 20 &&
    payments.bkashRefundSmsTemplate.includes("{{orderNumber}}")
  const otpSecurity = otpSecurityQuery.data
  const settingsScope = platformContentQuery.data?.scope
  const isScopedSettings = settingsScope?.settingsMode !== "global"
  const scopeBadgeLabel =
    settingsScope?.settingsMode === "single_zone"
      ? "Zone settings"
      : settingsScope?.settingsMode === "district_zones"
        ? "District zones"
        : "Global settings"
  const scopeDescription =
    settingsScope?.settingsMode === "single_zone"
      ? "Operational dispatch and delivery defaults save to this selected zone."
      : settingsScope?.settingsMode === "district_zones"
        ? "Operational dispatch and delivery defaults save to every active zone in this district."
        : "Global fallback used only when no selected service zone override exists."
  const dispatchPolicyTitle =
    settingsScope?.settingsMode === "global"
      ? "Global dispatch fallback"
      : settingsScope?.settingsMode === "single_zone"
        ? "Zone dispatch override"
        : "District dispatch override"
  const dispatchPolicyDescription =
    settingsScope?.settingsMode === "global"
      ? "These defaults are used when an order has no service-zone override. Service Areas and scoped settings can override them per area."
      : settingsScope?.settingsMode === "single_zone"
        ? "These values save to the selected service zone and override the global fallback for orders in this area."
        : "These values save to every active zone in the selected district and override the global fallback there."
  const serviceAreaHelper =
    settingsScope?.settingsMode === "global"
      ? `${settingsScope?.zoneCount ?? 0} active zone${(settingsScope?.zoneCount ?? 0) === 1 ? "" : "s"}, largest radius ${serviceArea.radiusKm} km`
      : `${serviceArea.radiusKm} km delivery radius${
          settingsScope?.zoneCount
            ? `, ${settingsScope.zoneCount} zone${settingsScope.zoneCount > 1 ? "s" : ""}`
            : ""
        }`
  const fillOtpBlockTarget = (
    targetType: "phone" | "ip" | "device",
    targetValue: string
  ) => {
    setOtpBlockTargetType(targetType)
    setOtpBlockTargetValue(targetValue)
    setOtpBlockReason("Suspicious OTP activity")
  }
  const updateRateLimit = (
    key: keyof PlatformContent["auth"]["rateLimits"],
    value: number,
    min: number,
    max: number
  ) => {
    updateDraft((content) => {
      ensureRateLimitSettings(content)[key] = clampNumber(value, min, max)
    })
  }

  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Settings className="size-5" />
            </span>
            Settings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure synced platform policies for branding, service area,
            dispatch, authentication, and support.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge className="rounded-md bg-pink-500 text-white">
              {scopeBadgeLabel}
            </Badge>
            <Badge variant="outline" className="rounded-md">
              {settingsScope?.label ?? adminZoneScope.label}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {scopeDescription}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasChanges ? (
            <Badge variant="secondary">Unsaved changes</Badge>
          ) : null}
          <Button type="button" variant="outline" onClick={resetDraft}>
            <RefreshCcw className="size-4" />
            Reset
          </Button>
          <Button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={
              !hasChanges ||
              saveMutation.isPending ||
              !otpTemplateValid ||
              !refundSmsTemplateValid
            }
          >
            {saveMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Save settings
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardContent className="pt-2">
            <p className="text-sm text-muted-foreground">
              {isScopedSettings ? "Selected area" : "Service area"}
            </p>
            <p className="mt-2 text-2xl font-semibold">{serviceArea.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {serviceAreaHelper}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-2">
            <p className="text-sm text-muted-foreground">Dispatch mode</p>
            <p className="mt-2 text-2xl font-semibold">
              {settingsScope?.settingsMode === "global" ? "Fallback " : ""}
              {dispatch.dispatchMode === "primary_rider" ? "Primary rider" : "Fleet"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {dispatch.autoAssignmentEnabled
                ? "Auto assignment on"
                : "Manual assignment"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-2">
            <p className="text-sm text-muted-foreground">Live rider capacity</p>
            <p className="mt-2 text-2xl font-semibold">
              {dispatchMetrics?.eligibleRiders ?? 0}/
              {dispatchMetrics?.totalRiders ?? 0}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Eligible riders for {settingsScope?.label ?? "all areas"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-2">
            <p className="text-sm text-muted-foreground">Last saved</p>
            <p className="mt-2 text-lg font-semibold">
              {formatDateTime(platformContentQuery.data?.meta.updatedAt)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {platformContentQuery.data?.meta.updatedByAdminName ||
                "System defaults"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-2">
            <p className="text-sm text-muted-foreground">Referral program</p>
            <p className="mt-2 text-2xl font-semibold">
              {referrals.enabled ? "On" : "Off"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Tk {referrals.rewardAmountTaka} reward,{" "}
              {referrals.monthlyRewardCapPerCustomer}/month cap
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as typeof activeTab)}
        className="space-y-4"
      >
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-4 lg:w-[1120px] lg:grid-cols-7">
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="referrals">Referrals</TabsTrigger>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="support">Support</TabsTrigger>
        </TabsList>

        <TabsContent value="operations" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="size-4" />
                    Service areas moved to zone settings
                  </CardTitle>
                  <CardDescription>
                    {isScopedSettings
                      ? "You are editing operational defaults for the selected area scope."
                      : "Delivery radius, base fee, extra distance fee, rain reserve, and dispatch overrides are managed per zone."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg border border-dashed bg-muted/30 p-4">
                    <p className="text-sm text-muted-foreground">
                      {isScopedSettings
                        ? `${settingsScope?.label ?? "Selected area"} is active. Dispatch policy, auto-cancel timing, rider capacity, and delivery pricing fallback will save to this area scope. Security, payment gateway, SMS, support, and legal settings remain global.`
                        : "All areas is active. This page edits global fallback behavior. Choose a zone from the top navbar to edit zone-specific dispatch and delivery defaults."}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3"
                      onClick={() => {
                        window.location.href = "/service-areas"
                      }}
                    >
                      Open Service Areas
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Truck className="size-4" />
                    Rider live tracking
                  </CardTitle>
                  <CardDescription>
                    Control how often rider apps send live delivery location
                    updates.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <SettingRow
                    title="Tracking mode"
                    description="Balanced is recommended for production accuracy and battery use."
                  >
                    <Select
                      value={liveTracking.mode}
                      onValueChange={(value) =>
                        updateDraft((content) => {
                          const mode =
                            value as PlatformContent["operations"]["liveTracking"]["mode"]
                          content.operations.liveTracking.mode = mode
                          if (mode === "high_accuracy") {
                            content.operations.liveTracking.updateIntervalSeconds = 10
                            content.operations.liveTracking.distanceIntervalMeters = 30
                            content.operations.liveTracking.passiveHeartbeatSeconds = 30
                          } else if (mode === "battery_saver") {
                            content.operations.liveTracking.updateIntervalSeconds = 30
                            content.operations.liveTracking.distanceIntervalMeters = 100
                            content.operations.liveTracking.passiveHeartbeatSeconds = 120
                          } else {
                            content.operations.liveTracking.updateIntervalSeconds = 15
                            content.operations.liveTracking.distanceIntervalMeters = 60
                            content.operations.liveTracking.passiveHeartbeatSeconds = 60
                          }
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="balanced">
                          Balanced: 15s / 60m
                        </SelectItem>
                        <SelectItem value="battery_saver">
                          Battery saver: 30s / 100m
                        </SelectItem>
                        <SelectItem value="high_accuracy">
                          High accuracy: 10s / 30m
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </SettingRow>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border bg-background p-3">
                      <p className="text-xs text-muted-foreground">
                        Active delivery interval
                      </p>
                      <p className="mt-1 text-xl font-semibold">
                        {liveTracking.updateIntervalSeconds}s
                      </p>
                    </div>
                    <div className="rounded-lg border bg-background p-3">
                      <p className="text-xs text-muted-foreground">
                        Move threshold
                      </p>
                      <p className="mt-1 text-xl font-semibold">
                        {liveTracking.distanceIntervalMeters}m
                      </p>
                    </div>
                    <div className="rounded-lg border bg-background p-3">
                      <p className="text-xs text-muted-foreground">
                        Online heartbeat
                      </p>
                      <p className="mt-1 text-xl font-semibold">
                        {liveTracking.passiveHeartbeatSeconds}s
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="size-4" />
                  {dispatchPolicyTitle}
                </CardTitle>
                <CardDescription>
                  {dispatchPolicyDescription}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <SettingRow
                  title="Auto assignment"
                  description="Automatically assign ready orders to eligible riders."
                >
                  <Switch
                    checked={dispatch.autoAssignmentEnabled}
                    onCheckedChange={(checked) =>
                      updateDraft((content) => {
                        content.operations.dispatch.autoAssignmentEnabled =
                          checked
                      })
                    }
                  />
                </SettingRow>
                <SettingRow
                  title="Auto reassign timed-out orders"
                  description="Retry dispatch when rider acknowledgement times out."
                >
                  <Switch
                    checked={dispatch.autoReassignTimedOutOrders}
                    onCheckedChange={(checked) =>
                      updateDraft((content) => {
                        content.operations.dispatch.autoReassignTimedOutOrders =
                          checked
                      })
                    }
                  />
                </SettingRow>
                <SettingRow
                  title="Auto-cancel unaccepted orders"
                  description="If a restaurant does not accept a new order in time, notify admin first, then cancel automatically."
                >
                  <Switch
                    checked={Boolean(
                      dispatch.autoCancelUnacceptedOrdersEnabled
                    )}
                    onCheckedChange={(checked) =>
                      updateDraft((content) => {
                        content.operations.dispatch.autoCancelUnacceptedOrdersEnabled =
                          checked
                      })
                    }
                  />
                </SettingRow>
                <SettingRow
                  title="Dispatch mode"
                  description="Use full fleet or send first to one primary rider."
                >
                  <Select
                    value={dispatch.dispatchMode}
                    onValueChange={(value) =>
                      updateDraft((content) => {
                        content.operations.dispatch.dispatchMode =
                          value as PlatformContent["operations"]["dispatch"]["dispatchMode"]
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fleet">Fleet</SelectItem>
                      <SelectItem value="primary_rider">
                        Primary rider first
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </SettingRow>
                <SettingRow
                  title="Primary rider"
                  description="Used when primary rider mode is enabled."
                >
                  <Select
                    value={dispatch.primaryRiderId || "none"}
                    onValueChange={(value) =>
                      updateDraft((content) => {
                        content.operations.dispatch.primaryRiderId =
                          value === "none" ? "" : value
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose rider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No primary rider</SelectItem>
                      {(ridersQuery.data ?? []).map((rider) => (
                        <SelectItem key={rider.id} value={rider.id}>
                          {rider.fullName} - {rider.activeOrders} active
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SettingRow>
                <SettingRow
                  title="Fallback to fleet"
                  description="If the primary rider is unavailable or at capacity, try fleet dispatch."
                >
                  <Switch
                    checked={dispatch.primaryRiderFallbackEnabled}
                    onCheckedChange={(checked) =>
                      updateDraft((content) => {
                        content.operations.dispatch.primaryRiderFallbackEnabled =
                          checked
                      })
                    }
                  />
                </SettingRow>
                <SettingRow
                  title="Assignment algorithm"
                  description="Nearest balanced considers distance and load; least loaded prioritizes capacity."
                >
                  <Select
                    value={dispatch.algorithm}
                    onValueChange={(value) =>
                      updateDraft((content) => {
                        content.operations.dispatch.algorithm =
                          value as PlatformContent["operations"]["dispatch"]["algorithm"]
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nearest_eligible_balanced">
                        Nearest balanced
                      </SelectItem>
                      <SelectItem value="least_loaded_first">
                        Least loaded first
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </SettingRow>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-4" />
                Recent admin activity
              </CardTitle>
              <CardDescription>
                The latest platform setting and order-control actions across
                admin tools.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {platformContentQuery.data?.history.slice(0, 4).map((entry) => (
                <div
                  key={`content-${entry.updatedAt}`}
                  className="rounded-lg border bg-background p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">Platform settings updated</div>
                    <Badge variant="outline">Settings</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {entry.updatedByAdminName || "Support Team"} changed{" "}
                    {entry.changedSections.join(", ")}.
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {formatDateTime(entry.updatedAt)}
                  </p>
                </div>
              ))}
              {(activityLogsQuery.data?.items ?? []).map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-lg border bg-background p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">{entry.title}</div>
                    <Badge variant="outline" className="capitalize">
                      {entry.entityType.replaceAll("_", " ")}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {entry.adminName || "Support Team"}: {entry.description}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {formatDateTime(entry.createdAt)}
                  </p>
                </div>
              ))}
              {!platformContentQuery.data?.history.length &&
              !activityLogsQuery.data?.items.length ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  Admin activity will appear here after the first order control
                  or settings change.
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>Operational thresholds</CardTitle>
                  <CardDescription>
                    Keep these conservative so late alerts, rider capacity, and
                    auto-cancel rules stay accurate.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={showThresholdHelp ? "secondary" : "outline"}
                    onClick={() => setShowThresholdHelp((value) => !value)}
                  >
                    <Info className="size-4" />
                    {showThresholdHelp ? "Hide details" : "কি কাজ করে?"}
                    <ChevronDown
                      className={`size-4 transition-transform ${
                        showThresholdHelp ? "rotate-180" : ""
                      }`}
                    />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={applyRecommendedOrderAutomation}
                  >
                    <RefreshCcw className="size-4" />
                    Reset automation
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {showThresholdHelp ? (
                <div className="rounded-xl border bg-muted/30 p-4">
                  <div className="flex items-start gap-2">
                    <Info className="mt-0.5 size-4 shrink-0 text-primary" />
                    <div>
                      <p className="text-sm font-semibold">
                        Operational thresholds কিভাবে অর্ডার করে
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        এগুলো order monitoring, auto-cancel, food preparation
                        timer, rider assignment, এবং admin alert-এর timing
                        control করে। খুব কম দিলে unnecessary alert বেশি আসবে,
                        খুব বেশি দিলে real delay ধরতে দেরি হবে।
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {operationalThresholdHelp.map((item) => (
                      <div
                        key={item.title}
                        className="rounded-lg border bg-background p-3"
                      >
                        <p className="text-sm font-medium">{item.title}</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {item.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs font-semibold tracking-wide text-amber-700 uppercase">
                    Watch
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-amber-950">
                    {dispatch.deliveryWatchAfterPickupMinutes}m
                  </p>
                  <p className="mt-1 text-xs leading-5 text-amber-800">
                    Pickup-এর পর early delivery watch signal.
                  </p>
                </div>
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                  <p className="text-xs font-semibold tracking-wide text-rose-700 uppercase">
                    Late
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-rose-950">
                    {dispatch.deliveryLateAfterPickupMinutes}m
                  </p>
                  <p className="mt-1 text-xs leading-5 text-rose-800">
                    Admin alert তৈরি হবে if delivery still open.
                  </p>
                </div>
                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <p className="text-xs font-semibold tracking-wide text-red-700 uppercase">
                    Critical
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-red-950">
                    {dispatch.deliveryCriticalAfterPickupMinutes}m
                  </p>
                  <p className="mt-1 text-xs leading-5 text-red-800">
                    Delay escalates strongly for operations follow-up.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {operationalThresholdFields.map(
                  ([key, label, suffix, min, max]) => (
                    <div
                      key={key}
                      className="space-y-2 rounded-xl border bg-background p-4 shadow-sm"
                    >
                      <Label>{label}</Label>
                      <Input
                        type="number"
                        min={min}
                        max={max}
                        step={key === "riderEtaRouteFactor" ? 0.05 : 1}
                        value={
                          (dispatch[key as keyof typeof dispatch] as number) ??
                          min
                        }
                        onChange={(event) =>
                          updateDraft((content) => {
                            const dispatchKey =
                              key as keyof PlatformContent["operations"]["dispatch"]
                            ;(content.operations.dispatch[
                              dispatchKey
                            ] as number) = numberFromInput(
                              event.target.value,
                              dispatch[dispatchKey] as number
                            )
                          })
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Allowed {min}-{max} {suffix}
                      </p>
                    </div>
                  )
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquareText className="size-4" />
                Admin notification routing
              </CardTitle>
              <CardDescription>
                Choose which platform events appear in the admin notification
                popup and notification center. Owner/customer app notifications
                still work unless their own settings disable them.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border bg-background p-4">
                  <p className="text-xs text-muted-foreground">Active types</p>
                  <p className="mt-1 text-2xl font-semibold">
                    {
                      adminNotificationRules.filter(
                        (rule) => adminNotifications[rule.key]
                      ).length
                    }
                    /{adminNotificationRules.length}
                  </p>
                </div>
                <div className="rounded-xl border bg-background p-4">
                  <p className="text-xs text-muted-foreground">
                    Recommended noisy toggle
                  </p>
                  <p className="mt-1 text-sm font-semibold">New order placed</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Keep on while order volume is low, then turn off and keep
                    late/alarming alerts on.
                  </p>
                </div>
                <div className="rounded-xl border bg-background p-4">
                  <p className="text-xs text-muted-foreground">
                    Always recommended
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    Delays, payout, support, security
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    These are operational alerts that usually need admin action.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 xl:grid-cols-2">
                {adminNotificationRules.map((rule) => (
                  <div
                    key={rule.key}
                    className="flex items-center justify-between gap-4 rounded-xl border bg-background p-4"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{rule.title}</p>
                        <Badge variant="outline">{rule.badge}</Badge>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {rule.description}
                      </p>
                    </div>
                    <Switch
                      checked={adminNotifications[rule.key]}
                      onCheckedChange={(checked) =>
                        updateDraft((content) => {
                          ensureAdminNotificationSettings(content)
                          content.operations.adminNotifications[rule.key] =
                            checked
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="size-4" />
                Customer payment methods
              </CardTitle>
              <CardDescription>
                COD stays the default. Turn bKash on only when the gateway is
                ready to accept payments.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <SettingRow
                title="Cash on delivery"
                description="Default customer payment method. COD remains available even when bKash is disabled."
              >
                <Badge variant="secondary">Default enabled</Badge>
              </SettingRow>
              <SettingRow
                title="bKash payment"
                description="When disabled, customer-app hides bKash and backend rejects new bKash payments."
              >
                <Switch
                  checked={payments.bkashEnabled}
                  onCheckedChange={(checked) =>
                    updateDraft((content) => {
                      content.operations.payments.bkashEnabled = checked
                    })
                  }
                />
              </SettingRow>
              <SettingRow
                title="bKash label"
                description="Shown on the customer checkout payment card."
              >
                <Input
                  value={payments.bkashLabel}
                  onChange={(event) =>
                    updateDraft((content) => {
                      content.operations.payments.bkashLabel =
                        event.target.value
                    })
                  }
                />
              </SettingRow>
              <SettingRow
                title="bKash helper text"
                description="Short checkout explanation for customers."
              >
                <Input
                  value={payments.bkashSubtitle}
                  onChange={(event) =>
                    updateDraft((content) => {
                      content.operations.payments.bkashSubtitle =
                        event.target.value
                    })
                  }
                />
              </SettingRow>
              <SettingRow
                title="bKash refund message time"
                description="Customer order details will say cancelled bKash refunds are processed within this time."
              >
                <Input
                  type="number"
                  min={1}
                  max={1440}
                  step={1}
                  value={payments.bkashRefundEtaMinutes ?? 60}
                  onChange={(event) =>
                    updateDraft((content) => {
                      content.operations.payments.bkashRefundEtaMinutes =
                        clampNumber(
                          numberFromInput(
                            event.target.value,
                            payments.bkashRefundEtaMinutes ?? 60
                          ),
                          1,
                          1440
                        )
                    })
                  }
                />
              </SettingRow>
              <SettingRow
                title="Refund SMS"
                description="Send a customer phone SMS when admin marks a bKash refund completed."
              >
                <Switch
                  checked={payments.bkashRefundSmsEnabled !== false}
                  onCheckedChange={(checked) =>
                    updateDraft((content) => {
                      ensurePaymentSettings(content).bkashRefundSmsEnabled =
                        checked
                    })
                  }
                />
              </SettingRow>
              <div className="space-y-3 rounded-lg border bg-background p-3">
                <div className="space-y-1">
                  <Label>Refund SMS template</Label>
                  <p className="text-xs text-muted-foreground">
                    Used after admin marks a bKash refund completed. Keep it
                    short for SMS cost and readability.
                  </p>
                </div>
                <Textarea
                  rows={4}
                  value={payments.bkashRefundSmsTemplate}
                  onChange={(event) =>
                    updateDraft((content) => {
                      ensurePaymentSettings(content).bkashRefundSmsTemplate =
                        event.target.value
                    })
                  }
                />
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{"{{platformName}}"}</Badge>
                  <Badge variant="outline">{"{{orderNumber}}"}</Badge>
                  <Badge variant="outline">{"{{amount}}"}</Badge>
                  <Badge variant="outline">{"{{refundReference}}"}</Badge>
                  <Badge variant="outline">{"{{transactionId}}"}</Badge>
                  <Badge variant="outline">{"{{customerName}}"}</Badge>
                  <Badge variant="outline">{"{{customerPhone}}"}</Badge>
                </div>
                {!refundSmsTemplateValid ? (
                  <p className="text-xs font-medium text-destructive">
                    Template must be at least 20 characters and include{" "}
                    {"{{orderNumber}}"}.
                  </p>
                ) : null}
                <div className="rounded-lg border bg-muted/30 p-3 text-sm leading-6">
                  {refundSmsPreview}
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Coins className="size-4" />
                Restaurant payout rules
              </CardTitle>
              <CardDescription>
                Control when restaurant earnings become withdrawable and how
                payout requests are accepted.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <SettingRow
                title="Settlement delay"
                description="Delivered order earnings stay pending for this many days before moving to available balance."
              >
                <Input
                  type="number"
                  min={0}
                  max={30}
                  step={1}
                  value={finance.settlementDelayDays}
                  onChange={(event) =>
                    updateDraft((content) => {
                      const financeDraft = ensureFinanceSettings(content)
                      financeDraft.settlementDelayDays = clampNumber(
                        numberFromInput(
                          event.target.value,
                          finance.settlementDelayDays
                        ),
                        0,
                        30
                      )
                    })
                  }
                />
              </SettingRow>
              <SettingRow
                title="Minimum payout request"
                description="Optional minimum threshold. Disable it to allow any positive owner/admin payout amount."
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                    <span className="text-sm">
                      {finance.minimumPayoutAmountEnabled === false
                        ? "No minimum"
                        : "Minimum enabled"}
                    </span>
                    <Switch
                      checked={finance.minimumPayoutAmountEnabled !== false}
                      onCheckedChange={(checked) =>
                        updateDraft((content) => {
                          const financeDraft = ensureFinanceSettings(content)
                          financeDraft.minimumPayoutAmountEnabled = checked
                          financeDraft.minimumPayoutAmountTaka = checked
                            ? Math.max(
                                1,
                                financeDraft.minimumPayoutAmountTaka || 500
                              )
                            : 0
                        })
                      }
                    />
                  </div>
                  {finance.minimumPayoutAmountEnabled !== false ? (
                    <Input
                      type="number"
                      min={1}
                      max={100000}
                      step={1}
                      value={finance.minimumPayoutAmountTaka}
                      onChange={(event) =>
                        updateDraft((content) => {
                          const financeDraft = ensureFinanceSettings(content)
                          financeDraft.minimumPayoutAmountTaka = clampNumber(
                            numberFromInput(
                              event.target.value,
                              finance.minimumPayoutAmountTaka
                            ),
                            1,
                            100000
                          )
                        })
                      }
                    />
                  ) : null}
                </div>
              </SettingRow>
              <SettingRow
                title="One active payout request"
                description="When enabled, owners cannot create another payout while one request is pending or processing."
              >
                <Switch
                  checked={finance.oneActivePayoutRequest}
                  onCheckedChange={(checked) =>
                    updateDraft((content) => {
                      const financeDraft = ensureFinanceSettings(content)
                      financeDraft.oneActivePayoutRequest = checked
                    })
                  }
                />
              </SettingRow>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="referrals" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gift className="size-4" />
                  Referral rewards
                </CardTitle>
                <CardDescription>
                  Control whether customer referrals can create reward vouchers
                  and how much each reward costs the platform.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <SettingRow
                  title="Referral program"
                  description="When disabled, new referral codes are ignored and delivered orders do not create referral reward vouchers."
                >
                  <Switch
                    checked={referrals.enabled}
                    onCheckedChange={(checked) =>
                      updateDraft((content) => {
                        content.operations.referrals.enabled = checked
                      })
                    }
                  />
                </SettingRow>
                <SettingRow
                  title="Reward amount"
                  description="Voucher value the referrer receives after a successful referral."
                >
                  <Input
                    type="number"
                    min={1}
                    max={10000}
                    step={1}
                    value={referrals.rewardAmountTaka}
                    onChange={(event) =>
                      updateDraft((content) => {
                        content.operations.referrals.rewardAmountTaka =
                          clampNumber(
                            numberFromInput(
                              event.target.value,
                              referrals.rewardAmountTaka
                            ),
                            1,
                            10000
                          )
                      })
                    }
                  />
                </SettingRow>
                <SettingRow
                  title="Minimum order"
                  description="Reward voucher can be used only when the next order subtotal reaches this amount."
                >
                  <Input
                    type="number"
                    min={0}
                    max={100000}
                    step={1}
                    value={referrals.minimumOrderAmountTaka}
                    onChange={(event) =>
                      updateDraft((content) => {
                        content.operations.referrals.minimumOrderAmountTaka =
                          clampNumber(
                            numberFromInput(
                              event.target.value,
                              referrals.minimumOrderAmountTaka
                            ),
                            0,
                            100000
                          )
                      })
                    }
                  />
                </SettingRow>
                <SettingRow
                  title="Voucher expiry"
                  description="Number of days the referral reward voucher remains usable."
                >
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    step={1}
                    value={referrals.voucherExpiryDays}
                    onChange={(event) =>
                      updateDraft((content) => {
                        content.operations.referrals.voucherExpiryDays =
                          clampNumber(
                            numberFromInput(
                              event.target.value,
                              referrals.voucherExpiryDays
                            ),
                            1,
                            365
                          )
                      })
                    }
                  />
                </SettingRow>
                <SettingRow
                  title="Monthly reward cap"
                  description="Maximum referral reward vouchers one customer can earn per UTC calendar month."
                >
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    value={referrals.monthlyRewardCapPerCustomer}
                    onChange={(event) =>
                      updateDraft((content) => {
                        content.operations.referrals.monthlyRewardCapPerCustomer =
                          clampNumber(
                            numberFromInput(
                              event.target.value,
                              referrals.monthlyRewardCapPerCustomer
                            ),
                            1,
                            100
                          )
                      })
                    }
                  />
                </SettingRow>
                <SettingRow
                  title="Share link template"
                  description="Used when customers share a referral link. Available placeholders: {{code}}, {{encodedCode}}."
                >
                  <Input
                    value={referrals.shareLinkTemplate}
                    onChange={(event) =>
                      updateDraft((content) => {
                        content.operations.referrals.shareLinkTemplate =
                          event.target.value
                      })
                    }
                    placeholder="foodbela://checkout?ref={{code}}"
                  />
                </SettingRow>
                <SettingRow
                  title="Share message template"
                  description="Available placeholders: {{code}}, {{rewardAmount}}, {{minimumOrderAmount}}, {{rewardExpiryDays}}, {{monthlyRewardCap}}, {{link}}."
                >
                  <Textarea
                    value={referrals.shareMessageTemplate}
                    onChange={(event) =>
                      updateDraft((content) => {
                        content.operations.referrals.shareMessageTemplate =
                          event.target.value
                      })
                    }
                    rows={4}
                    placeholder="Use my Foodbela referral code {{code}}. {{link}}"
                  />
                </SettingRow>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Reward preview</CardTitle>
                <CardDescription>
                  This is the rule applied to new referral rewards after you
                  save settings.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border bg-background p-4">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Customer-facing voucher
                  </p>
                  <p className="mt-2 text-3xl font-semibold">
                    Tk {referrals.rewardAmountTaka}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Usable on orders over Tk {referrals.minimumOrderAmountTaka}.
                    Expires in {referrals.voucherExpiryDays} days.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border bg-background p-3">
                    <p className="text-xs text-muted-foreground">Monthly cap</p>
                    <p className="mt-1 text-2xl font-semibold">
                      {referrals.monthlyRewardCapPerCustomer}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      rewards per customer
                    </p>
                  </div>
                  <div className="rounded-lg border bg-background p-3">
                    <p className="text-xs text-muted-foreground">
                      Program status
                    </p>
                    <p className="mt-1 text-2xl font-semibold">
                      {referrals.enabled ? "Active" : "Paused"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {referrals.enabled
                        ? "Rewards can be issued"
                        : "No new reward vouchers"}
                    </p>
                  </div>
                </div>
                <div className="rounded-lg border bg-background p-3">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Share preview
                  </p>
                  <p className="mt-2 text-sm font-medium break-all">
                    {referralShareLinkPreview}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {referralShareMessagePreview}
                  </p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  Cap applies when the referred customer reaches Delivered
                  status. Rewards above the cap are marked capped and no voucher
                  is created.
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-4" />
                Platform identity
              </CardTitle>
              <CardDescription>
                Shared naming used across public content and admin operations.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <SettingRow
                title="Platform name"
                description="Primary brand name."
              >
                <Input
                  value={draft.branding.platformName}
                  onChange={(event) =>
                    updateDraft((content) => {
                      content.branding.platformName = event.target.value
                    })
                  }
                />
              </SettingRow>
              <SettingRow
                title="Tagline"
                description="Short public-facing line."
              >
                <Input
                  value={draft.branding.tagline}
                  onChange={(event) =>
                    updateDraft((content) => {
                      content.branding.tagline = event.target.value
                    })
                  }
                />
              </SettingRow>
              <SettingRow
                title="Owner web dashboard URL"
                description="Shown inside the restaurant owner mobile app for full setup, reports, and advanced controls."
              >
                <Input
                  type="url"
                  value={ownerApp.webDashboardUrl}
                  onChange={(event) =>
                    updateDraft((content) => {
                      ensureOwnerAppSettings(content).webDashboardUrl =
                        event.target.value
                    })
                  }
                  placeholder="https://owner.foodbela.com"
                />
              </SettingRow>
              <SettingRow
                title="Show customer phone to restaurant owners"
                description="When off, restaurant owner app and web hide customer phone in order list/details."
              >
                <Switch
                  checked={ownerApp.showCustomerPhoneNumbers}
                  onCheckedChange={(checked) =>
                    updateDraft((content) => {
                      ensureOwnerAppSettings(content).showCustomerPhoneNumbers =
                        checked
                    })
                  }
                />
              </SettingRow>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="size-4" />
                    Security & Traffic Control
                  </CardTitle>
                  <CardDescription>
                    Runtime limiter values for customer, owner, rider, and admin
                    traffic. Backend reads these from cached settings, so saved
                    changes normally apply within 30 seconds.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">Admin editable</Badge>
                  <Badge variant="outline">Safe bounded</Badge>
                  <Badge variant="outline">Nginx aware</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {rateLimitFields.map((field) => (
                  <div
                    key={field.key}
                    className="rounded-lg border bg-background p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{field.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {field.description}
                        </p>
                      </div>
                      <Badge variant="outline" className="shrink-0">
                        {field.windowLabel}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-2">
                      <Input
                        type="number"
                        min={field.min}
                        max={field.max}
                        step={field.step ?? 1}
                        value={rateLimits[field.key]}
                        onChange={(event) =>
                          updateRateLimit(
                            field.key,
                            numberFromInput(
                              event.target.value,
                              rateLimits[field.key]
                            ),
                            field.min,
                            field.max
                          )
                        }
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Allowed range: {field.min}-{field.max}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Keep global RATE_LIMIT_MAX in .env for broad IP protection. Use
                these controls for business-specific limits. In production
                behind Nginx, set TRUST_PROXY_HOPS=1 so real customer IPs are
                used.
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="size-4" />
                  OTP verification
                </CardTitle>
                <CardDescription>
                  This policy is used by customer, restaurant owner, and rider
                  OTP flows.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <SettingRow
                  title="OTP expiry"
                  description="How long a sent code remains valid."
                >
                  <Input
                    type="number"
                    min={60}
                    max={900}
                    step={30}
                    value={otp.expiresInSeconds}
                    onChange={(event) =>
                      updateDraft((content) => {
                        content.auth.otp.expiresInSeconds = clampNumber(
                          numberFromInput(
                            event.target.value,
                            otp.expiresInSeconds
                          ),
                          60,
                          900
                        )
                      })
                    }
                  />
                </SettingRow>
                <SettingRow
                  title="Resend timer"
                  description="Users must wait this many seconds before another OTP can be sent."
                >
                  <Input
                    type="number"
                    min={15}
                    max={300}
                    step={5}
                    value={otp.resendCooldownSeconds}
                    onChange={(event) =>
                      updateDraft((content) => {
                        content.auth.otp.resendCooldownSeconds = clampNumber(
                          numberFromInput(
                            event.target.value,
                            otp.resendCooldownSeconds
                          ),
                          15,
                          300
                        )
                      })
                    }
                  />
                </SettingRow>
                <div className="space-y-2 rounded-lg border bg-background p-3">
                  <Label>SMS message template</Label>
                  <Textarea
                    value={otp.messageTemplate}
                    rows={5}
                    onChange={(event) =>
                      updateDraft((content) => {
                        content.auth.otp.messageTemplate = event.target.value
                      })
                    }
                  />
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{"{{code}}"}</Badge>
                    <Badge variant="outline">{"{{platformName}}"}</Badge>
                    <Badge variant="outline">{"{{expiryMinutes}}"}</Badge>
                    <Badge variant="outline">{"{{expirySeconds}}"}</Badge>
                  </div>
                  {!otp.messageTemplate.includes("{{code}}") ? (
                    <p className="text-xs font-medium text-destructive">
                      Template must include {"{{code}}"} before it can be saved.
                    </p>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquareText className="size-4" />
                  SMS preview
                </CardTitle>
                <CardDescription>
                  Preview uses a sample code and the current platform name.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border bg-muted/30 p-4 text-sm leading-6">
                  {otpPreview}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border bg-background p-3">
                    <p className="text-xs text-muted-foreground">
                      Expires after
                    </p>
                    <p className="mt-1 text-2xl font-semibold">
                      {Math.ceil(otp.expiresInSeconds / 60)}m
                    </p>
                  </div>
                  <div className="rounded-lg border bg-background p-3">
                    <p className="text-xs text-muted-foreground">
                      Resend after
                    </p>
                    <p className="mt-1 text-2xl font-semibold">
                      {otp.resendCooldownSeconds}s
                    </p>
                  </div>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  Bounds are kept conservative: expiry 60-900 seconds, resend
                  15-300 seconds.
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-4" />
                OTP abuse monitor
              </CardTitle>
              <CardDescription>
                Last 24 hours of OTP sends, blocked requests, and incorrect
                verification attempts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {otpSecurityQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading OTP activity...
                </div>
              ) : otpSecurity ? (
                <>
                  <div className="grid gap-3 md:grid-cols-5">
                    <div className="rounded-lg border bg-background p-3">
                      <p className="text-xs text-muted-foreground">SMS sent</p>
                      <p className="mt-1 text-2xl font-semibold">
                        {otpSecurity.summary.sent}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-background p-3">
                      <p className="text-xs text-muted-foreground">Blocked</p>
                      <p className="mt-1 text-2xl font-semibold">
                        {otpSecurity.summary.blocked}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-background p-3">
                      <p className="text-xs text-muted-foreground">
                        Wrong OTP tries
                      </p>
                      <p className="mt-1 text-2xl font-semibold">
                        {otpSecurity.summary.verifyFailed}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-background p-3">
                      <p className="text-xs text-muted-foreground">
                        Locked sessions
                      </p>
                      <p className="mt-1 text-2xl font-semibold">
                        {otpSecurity.summary.lockedSessions}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-background p-3">
                      <p className="text-xs text-muted-foreground">
                        Active blocks
                      </p>
                      <p className="mt-1 text-2xl font-semibold">
                        {otpSecurity.summary.activeBlocks}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 rounded-lg border bg-background p-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
                    <div className="grid gap-2">
                      <Label>Block target</Label>
                      <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
                        <Select
                          value={otpBlockTargetType}
                          onValueChange={(value) =>
                            setOtpBlockTargetType(
                              value as "phone" | "ip" | "device"
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="phone">Phone</SelectItem>
                            <SelectItem value="ip">IP</SelectItem>
                            <SelectItem value="device">Device</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          value={otpBlockTargetValue}
                          placeholder={
                            otpBlockTargetType === "phone"
                              ? "01XXXXXXXXX"
                              : otpBlockTargetType === "ip"
                                ? "IP address"
                                : "IP|user-agent fingerprint"
                          }
                          onChange={(event) =>
                            setOtpBlockTargetValue(event.target.value)
                          }
                        />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label>Lock policy</Label>
                      <div className="grid gap-2 sm:grid-cols-[120px_1fr]">
                        <Input
                          type="number"
                          min={5}
                          max={60 * 24 * 30}
                          disabled={otpBlockPermanent}
                          value={otpBlockDuration}
                          onChange={(event) =>
                            setOtpBlockDuration(event.target.value)
                          }
                        />
                        <div className="flex items-center gap-3 rounded-md border px-3 py-2">
                          <Switch
                            checked={otpBlockPermanent}
                            onCheckedChange={setOtpBlockPermanent}
                          />
                          <span className="text-sm">Permanent</span>
                        </div>
                      </div>
                      <Input
                        value={otpBlockReason}
                        placeholder="Reason"
                        onChange={(event) =>
                          setOtpBlockReason(event.target.value)
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      disabled={
                        !otpBlockTargetValue.trim() ||
                        otpBlockMutation.isPending
                      }
                      onClick={() => otpBlockMutation.mutate()}
                    >
                      {otpBlockMutation.isPending ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : otpBlockPermanent ? (
                        <Ban className="mr-2 size-4" />
                      ) : (
                        <Lock className="mr-2 size-4" />
                      )}
                      Apply block
                    </Button>
                  </div>

                  {otpSecurity.blocks.length ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Active OTP blocks</p>
                      <div className="space-y-2">
                        {otpSecurity.blocks.slice(0, 6).map((block) => (
                          <div
                            key={block.id}
                            className="grid gap-2 rounded-lg border bg-background p-3 md:grid-cols-[1fr_auto] md:items-center"
                          >
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge
                                  variant={
                                    block.isPermanent
                                      ? "destructive"
                                      : "secondary"
                                  }
                                >
                                  {block.isPermanent
                                    ? "Permanent"
                                    : "Temporary"}
                                </Badge>
                                <Badge variant="outline">
                                  {block.targetType}
                                </Badge>
                                <span className="text-sm font-semibold">
                                  {block.displayValue}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {block.isPermanent
                                  ? "No automatic expiry"
                                  : `Until ${formatDateTime(block.lockedUntilAt)}`}
                                {block.reason ? ` - ${block.reason}` : ""}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={otpUnblockMutation.isPending}
                              onClick={() =>
                                otpUnblockMutation.mutate({
                                  blockId: block.id,
                                  reason: "Removed from security settings",
                                })
                              }
                            >
                              <Unlock className="mr-2 size-4" />
                              Unblock
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">
                        Recent phone numbers
                      </p>
                      <Badge variant="outline">
                        {otpSecurity.summary.uniquePhones} unique
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      {otpSecurity.phones.length ? (
                        otpSecurity.phones.slice(0, 8).map((phone) => (
                          <div
                            key={phone.phone}
                            className="grid gap-2 rounded-lg border bg-background p-3 md:grid-cols-[160px_1fr_auto] md:items-center"
                          >
                            <div>
                              <p className="text-sm font-semibold">
                                {phone.phone}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDateTime(phone.lastSeenAt)}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="secondary">
                                sent {phone.sent}
                              </Badge>
                              <Badge variant="outline">
                                reused {phone.reused}
                              </Badge>
                              <Badge
                                variant={
                                  phone.blocked ? "destructive" : "outline"
                                }
                              >
                                blocked {phone.blocked}
                              </Badge>
                              <Badge
                                variant={
                                  phone.verifyFailed ? "destructive" : "outline"
                                }
                              >
                                wrong {phone.verifyFailed}
                              </Badge>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  fillOtpBlockTarget("phone", phone.phone)
                                }
                              >
                                Lock phone
                              </Button>
                              {phone.ipAddresses[0] ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    fillOtpBlockTarget(
                                      "ip",
                                      phone.ipAddresses[0]
                                    )
                                  }
                                >
                                  Lock IP
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                          No OTP activity in the last 24 hours.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">Recent OTP events</p>
                      <Badge variant="outline">
                        {otpSecurity.items.length} shown
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      {otpSecurity.items.length ? (
                        otpSecurity.items.slice(0, 8).map((event) => (
                          <div
                            key={event.id}
                            className="grid gap-2 rounded-lg border bg-background p-3 lg:grid-cols-[1fr_auto] lg:items-center"
                          >
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge
                                  variant={
                                    event.event.includes("blocked") ||
                                    event.event.includes("failed")
                                      ? "destructive"
                                      : "secondary"
                                  }
                                >
                                  {event.event}
                                </Badge>
                                <span className="text-sm font-semibold">
                                  {event.phone}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {formatDateTime(event.createdAt)}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {event.ipAddress || "No IP"}
                                {event.blockReason
                                  ? ` - ${event.blockReason}`
                                  : ""}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  fillOtpBlockTarget("phone", event.phone)
                                }
                              >
                                Phone
                              </Button>
                              {event.ipAddress ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    fillOtpBlockTarget("ip", event.ipAddress)
                                  }
                                >
                                  IP
                                </Button>
                              ) : null}
                              {event.ipAddress && event.userAgent ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    fillOtpBlockTarget(
                                      "device",
                                      `${event.ipAddress}|${event.userAgent}`
                                    )
                                  }
                                >
                                  Device
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                          No recent OTP security events.
                        </p>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  OTP activity is unavailable.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="support" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Support contact</CardTitle>
              <CardDescription>
                Customer app support information and issue-reporting copy.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <SettingRow
                title="Support email"
                description="Public support inbox."
              >
                <Input
                  value={support.email}
                  onChange={(event) =>
                    updateDraft((content) => {
                      content.supportContact.email = event.target.value
                    })
                  }
                />
              </SettingRow>
              <SettingRow
                title="Support phone"
                description="Public hotline number."
              >
                <Input
                  value={support.phone}
                  onChange={(event) =>
                    updateDraft((content) => {
                      content.supportContact.phone = event.target.value
                    })
                  }
                />
              </SettingRow>
              <SettingRow
                title="Support hours"
                description="When admins or support agents are available."
              >
                <Input
                  value={support.supportHours}
                  onChange={(event) =>
                    updateDraft((content) => {
                      content.supportContact.supportHours = event.target.value
                    })
                  }
                />
              </SettingRow>
              <SettingRow
                title="Report label"
                description="Label for issue reporting actions."
              >
                <Input
                  value={support.reportLabel}
                  onChange={(event) =>
                    updateDraft((content) => {
                      content.supportContact.reportLabel = event.target.value
                    })
                  }
                />
              </SettingRow>
              <SettingRow
                title="Direct help note"
                description="Short guidance shown near support actions."
              >
                <Textarea
                  value={support.directHelpNote}
                  onChange={(event) =>
                    updateDraft((content) => {
                      content.supportContact.directHelpNote = event.target.value
                    })
                  }
                />
              </SettingRow>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  )
}
