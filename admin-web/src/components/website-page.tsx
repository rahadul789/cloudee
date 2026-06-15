import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ArrowDownToLine,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  FileText,
  Globe2,
  MapPin,
  MessageSquareText,
  MonitorSmartphone,
  MousePointerClick,
  RefreshCcw,
  Search,
  Store,
  Truck,
} from "lucide-react"
import { useSearchParams } from "react-router-dom"
import { toast } from "sonner"

import {
  getWebsiteAnalytics,
  getWebsiteLead,
  getWebsiteOverview,
  listWebsiteLeads,
  updateWebsiteLead,
  updateWebsiteSettings,
  type WebsiteAnalytics,
  type WebsiteLead,
  type WebsiteSettings,
  type WebsiteSocialLinkKey,
} from "@/lib/website-api"
import { AdminDateRangeFilter } from "@/components/admin-date-range-filter"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

const statusOptions: WebsiteLead["status"][] = [
  "new",
  "contacted",
  "qualified",
  "converted",
  "closed",
]

const socialLinkOptions: Array<{
  key: WebsiteSocialLinkKey
  formKey: `${WebsiteSocialLinkKey}Url`
  label: string
}> = [
  { key: "facebook", formKey: "facebookUrl", label: "Facebook" },
  { key: "instagram", formKey: "instagramUrl", label: "Instagram" },
  { key: "youtube", formKey: "youtubeUrl", label: "YouTube" },
  { key: "linkedin", formKey: "linkedinUrl", label: "LinkedIn" },
  { key: "tiktok", formKey: "tiktokUrl", label: "TikTok" },
  { key: "snapchat", formKey: "snapchatUrl", label: "Snapchat" },
]

const defaultSocialLinksOrder = socialLinkOptions.map((item) => item.key)

function normalizeSocialLinksOrder(order?: WebsiteSocialLinkKey[]) {
  const seen = new Set<WebsiteSocialLinkKey>()
  const next: WebsiteSocialLinkKey[] = []
  for (const key of order ?? []) {
    if (!defaultSocialLinksOrder.includes(key) || seen.has(key)) continue
    seen.add(key)
    next.push(key)
  }
  for (const key of defaultSocialLinksOrder) {
    if (!seen.has(key)) next.push(key)
  }
  return next
}

const leadTypeOptions = ["all", "restaurant", "rider", "contact"] as const
const leadStatusOptions = ["all", ...statusOptions] as const
const deviceOptions = ["all", "desktop", "mobile", "tablet", "bot", "unknown"] as const
const eventOptions = [
  "all",
  "page_view",
  "cta_click",
  "lead_submit",
  "language_switch",
  "video_open",
  "modal_impression",
  "modal_click",
] as const
const websiteAnalyticsPresets = [
  "today",
  "yesterday",
  "last7Days",
  "last30Days",
  "last90Days",
  "thisMonth",
  "lastMonth",
  "lifetime",
  "custom",
] as const
type WebsiteAnalyticsPreset = (typeof websiteAnalyticsPresets)[number]

type WebsiteAnalyticsFilters = {
  preset: WebsiteAnalyticsPreset
  from: string
  to: string
  eventName: string
  deviceType: string
  pagePath: string
  language: string
  eventPage: number
  eventPageSize: number
}

function formatDate(value?: string | null) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

function formatNumber(value?: number) {
  return new Intl.NumberFormat().format(value ?? 0)
}

function compactPlaceLabel(parts: Array<string | undefined | null>) {
  const seen = new Set<string>()
  const values = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .filter((part) => {
      const key = part.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

  return values.length ? values.join(", ") : "Unknown place"
}

function formatRecentEventPlace(event: WebsiteAnalytics["recentEvents"][number]) {
  return compactPlaceLabel([event.place, event.city, event.district, event.country])
}

function formatPlaceBreakdownLabel(item: WebsiteAnalytics["placeBreakdown"][number]) {
  return compactPlaceLabel([item.place, item.city, item.district, item.country])
}

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10)
}

function defaultFromDate() {
  const date = new Date()
  date.setDate(date.getDate() - 29)
  return toDateInput(date)
}

function settingsToForm(settings?: WebsiteSettings) {
  return {
    siteUrl: settings?.siteUrl ?? "https://foodbela.com",
    seoDefaultTitle: settings?.seoDefaultTitle ?? "",
    seoDefaultDescription: settings?.seoDefaultDescription ?? "",
    seoOgImageUrl: settings?.seoOgImageUrl ?? "",
    googleSiteVerification: settings?.googleSiteVerification ?? "",
    businessAddress: settings?.businessAddress ?? "",
    businessCity: settings?.businessCity ?? "Dhaka",
    businessRegion: settings?.businessRegion ?? "Dhaka",
    businessPostalCode: settings?.businessPostalCode ?? "",
    businessCountry: settings?.businessCountry ?? "BD",
    playStoreUrl: settings?.playStoreUrl ?? "",
    appDownloadUrl: settings?.appDownloadUrl ?? "",
    restaurantApplyUrl: settings?.restaurantApplyUrl ?? "/restaurants#apply",
    riderApplyUrl: settings?.riderApplyUrl ?? "/riders#apply",
    supportPhone: settings?.supportPhone ?? "",
    supportEmail: settings?.supportEmail ?? "",
    facebookUrl: settings?.facebookUrl ?? "",
    instagramUrl: settings?.instagramUrl ?? "",
    linkedinUrl: settings?.linkedinUrl ?? "",
    tiktokUrl: settings?.tiktokUrl ?? "",
    youtubeUrl: settings?.youtubeUrl ?? "",
    snapchatUrl: settings?.snapchatUrl ?? "",
    socialLinksOrder: normalizeSocialLinksOrder(settings?.socialLinksOrder),
    heroTitle: settings?.heroTitle ?? "",
    heroSubtitle: settings?.heroSubtitle ?? "",
    heroTitleEn: settings?.heroTitleEn ?? "",
    heroSubtitleEn: settings?.heroSubtitleEn ?? "",
    customerYoutubeUrl: settings?.customerYoutubeUrl ?? "",
    customerVideoOrientation: settings?.customerVideoOrientation ?? "portrait",
    customerOfferEnabled: settings?.customerOfferEnabled ?? false,
    customerOfferTitle: settings?.customerOfferTitle ?? "",
    customerOfferDescription: settings?.customerOfferDescription ?? "",
    customerOfferCtaLabel: settings?.customerOfferCtaLabel ?? "",
    customerOfferCtaUrl: settings?.customerOfferCtaUrl ?? "",
    websiteModalEnabled: settings?.websiteModalEnabled ?? true,
    websiteModalMode: settings?.websiteModalMode ?? "image_text_button",
    websiteModalImageUrl: settings?.websiteModalImageUrl ?? "",
    websiteModalTitle: settings?.websiteModalTitle ?? "Foodbela অ্যাপ ইনস্টল করুন",
    websiteModalTitleEn: settings?.websiteModalTitleEn ?? "Install the Foodbela app",
    websiteModalDescription:
      settings?.websiteModalDescription ??
      "ফোন দিয়ে QR code স্ক্যান করে Play Store থেকে Foodbela অ্যাপ ইনস্টল করুন।",
    websiteModalDescriptionEn:
      settings?.websiteModalDescriptionEn ??
      "Scan the QR code with your phone and install Foodbela from Play Store.",
    websiteModalCtaLabel: settings?.websiteModalCtaLabel ?? "Google Play থেকে ডাউনলোড",
    websiteModalCtaLabelEn: settings?.websiteModalCtaLabelEn ?? "Download from Google Play",
    websiteModalCtaUrl:
      settings?.websiteModalCtaUrl ??
      "https://play.google.com/store/apps/details?id=com.foodbela.app",
    websiteModalDelaySeconds: String(settings?.websiteModalDelaySeconds ?? 1),
    websiteModalFrequency: settings?.websiteModalFrequency ?? "session",
    websiteBannerEnabled: settings?.websiteBannerEnabled ?? false,
    websiteBannerText: settings?.websiteBannerText ?? "Foodbela অ্যাপ এখন Play Store-এ পাওয়া যাচ্ছে.",
    websiteBannerTextEn: settings?.websiteBannerTextEn ?? "Foodbela app is now available on Play Store.",
    websiteBannerCtaLabel: settings?.websiteBannerCtaLabel ?? "অ্যাপ ডাউনলোড",
    websiteBannerCtaLabelEn: settings?.websiteBannerCtaLabelEn ?? "Download app",
    websiteBannerCtaUrl:
      settings?.websiteBannerCtaUrl ??
      "https://play.google.com/store/apps/details?id=com.foodbela.app",
    coverageRewardAmount: String(settings?.coverageRewardAmount ?? 2000),
    serviceAreas: (settings?.serviceAreas ?? [])
      .map((area) =>
        [
          area.name,
          area.status,
          area.note ?? "",
          area.seoTitle ?? "",
          area.seoDescription ?? "",
          (area.popularSearches ?? []).join(", "),
          (area.cuisineKeywords ?? []).join(", "),
          (area.postalCodes ?? []).join(", "),
          area.noteBn ?? "",
          area.noteEn ?? "",
        ].join("|"),
      )
      .join("\n"),
  }
}

function parseServiceAreas(value: string): WebsiteSettings["serviceAreas"] {
  const parseList = (text = "") =>
    text
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)

  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [
        name,
        status = "active",
        note = "",
        seoTitle = "",
        seoDescription = "",
        popularSearches = "",
        cuisineKeywords = "",
        postalCodes = "",
        noteBn = "",
        noteEn = "",
      ] = line.split("|").map((part) => part.trim())
      return {
        name,
        status: ["active", "coming_soon", "paused"].includes(status)
          ? (status as "active" | "coming_soon" | "paused")
          : "active",
        note,
        noteBn,
        noteEn,
        seoTitle,
        seoDescription,
        popularSearches: parseList(popularSearches),
        cuisineKeywords: parseList(cuisineKeywords),
        postalCodes: parseList(postalCodes),
      }
    })
    .filter((area) => area.name)
}

function statusLabel(status: WebsiteLead["status"]) {
  if (status === "new") return "New"
  if (status === "contacted") return "Contacted"
  if (status === "qualified") return "Qualified"
  if (status === "converted") return "Converted"
  return "Closed"
}

function leadTypeLabel(type: WebsiteLead["type"]) {
  if (type === "restaurant") return "Restaurant"
  if (type === "rider") return "Rider"
  return "Message"
}

function csvEscape(value: unknown) {
  const text = String(value ?? "")
  if (!/[",\n]/.test(text)) return text
  return `"${text.replaceAll('"', '""')}"`
}

function downloadCsv(filename: string, rows: unknown[][]) {
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function analyticsRows(analytics: WebsiteAnalytics) {
  return [
    ["Foodbela.com analytics report"],
    ["From", analytics.range.from, "To", analytics.range.to],
    [],
    ["Metric", "Value"],
    ["Events", analytics.totals.events],
    ["Page views", analytics.totals.pageViews],
    ["Unique visitors", analytics.totals.uniqueVisitors],
    ["Sessions", analytics.totals.sessions],
    ["CTA clicks", analytics.totals.ctaClicks],
    ["Lead submits", analytics.totals.leadSubmits],
    ["Lead conversion rate", `${analytics.totals.leadConversionRate}%`],
    ["CTA click rate", `${analytics.totals.ctaClickRate}%`],
    ["Views per session", analytics.totals.pageViewsPerSession],
    ["Restaurant leads", analytics.totals.leads.restaurant],
    ["Rider leads", analytics.totals.leads.rider],
    ["Messages", analytics.totals.leads.contact],
    [],
    ["Daily", "Events", "Page views", "Visitors", "Sessions", "Leads"],
    ...analytics.daily.map((day) => [
      day.date,
      day.events,
      day.pageViews,
      day.visitors,
      day.sessions,
      day.leads,
    ]),
    [],
    ["Hourly visitors", "Visitors", "Page views", "Events", "Leads"],
    ...analytics.hourlyBreakdown.map((hour) => [
      hour.label,
      hour.visitors,
      hour.pageViews,
      hour.events,
      hour.leads,
    ]),
    [],
    ["Peak visitor hours", "Visitors", "Page views", "Events", "Leads"],
    ...analytics.peakVisitorHours.map((hour) => [
      hour.label,
      hour.visitors,
      hour.pageViews,
      hour.events,
      hour.leads,
    ]),
    [],
    ["Top pages", "Views"],
    ...analytics.topPages.map((page) => [page.path, page.views]),
    [],
    ["Devices", "Events"],
    ...analytics.deviceBreakdown.map((item) => [item.deviceType, item.count]),
    [],
    ["Browsers", "Events"],
    ...analytics.browserBreakdown.map((item) => [item.browserName, item.count]),
    [],
    ["Visitor places", "Events", "Visitors", "Page views"],
    ...analytics.placeBreakdown.map((item) => [
      formatPlaceBreakdownLabel(item),
      item.count,
      item.visitors,
      item.pageViews,
    ]),
    [],
    ["Recent events", "Page", "Place", "Device", "Browser", "When"],
    ...analytics.recentEvents.map((event) => [
      event.eventName,
      event.pagePath,
      formatRecentEventPlace(event),
      event.deviceType,
      event.browserName,
      event.createdAt ?? "",
    ]),
  ]
}

function printAnalyticsReport(analytics: WebsiteAnalytics) {
  const report = window.open("", "_blank", "width=1100,height=800")
  if (!report) {
    toast.error("Popup blocked. Please allow popups for PDF export.")
    return
  }

  const dailyRows = analytics.daily
    .map(
      (day) =>
        `<tr><td>${day.date}</td><td>${day.events}</td><td>${day.pageViews}</td><td>${day.visitors}</td><td>${day.leads}</td></tr>`
    )
    .join("")
  const deviceRows = analytics.deviceBreakdown
    .map((item) => `<tr><td>${item.deviceType}</td><td>${item.count}</td></tr>`)
    .join("")
  const pageRows = analytics.topPages
    .map((item) => `<tr><td>${item.path}</td><td>${item.views}</td></tr>`)
    .join("")
  const placeRows = analytics.placeBreakdown
    .map(
      (item) =>
        `<tr><td>${formatPlaceBreakdownLabel(item)}</td><td>${item.count}</td><td>${item.visitors}</td><td>${item.pageViews}</td></tr>`
    )
    .join("")
  const hourlyRows = analytics.hourlyBreakdown
    .map(
      (hour) =>
        `<tr><td>${hour.label}</td><td>${hour.visitors}</td><td>${hour.pageViews}</td><td>${hour.events}</td><td>${hour.leads}</td></tr>`
    )
    .join("")
  const peakHour = analytics.peakVisitorHours[0]

  report.document.write(`
    <html>
      <head>
        <title>Foodbela.com analytics report</title>
        <style>
          body { font-family: Inter, Arial, sans-serif; color: #111827; padding: 32px; }
          h1 { margin: 0 0 6px; }
          p { color: #6b7280; }
          .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 24px 0; }
          .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; }
          .card strong { display:block; font-size: 24px; margin-top: 6px; }
          table { width: 100%; border-collapse: collapse; margin-top: 18px; }
          th, td { border-bottom: 1px solid #e5e7eb; text-align: left; padding: 10px; font-size: 13px; }
          th { background: #f9fafb; }
          @media print { button { display:none; } body { padding: 0; } }
        </style>
      </head>
      <body>
        <button onclick="window.print()">Print / Save PDF</button>
        <h1>Foodbela.com analytics report</h1>
        <p>${formatDate(analytics.range.from)} to ${formatDate(analytics.range.to)}</p>
        <div class="grid">
          <div class="card">Visitors<strong>${formatNumber(analytics.totals.uniqueVisitors)}</strong></div>
          <div class="card">Page views<strong>${formatNumber(analytics.totals.pageViews)}</strong></div>
          <div class="card">CTA clicks<strong>${formatNumber(analytics.totals.ctaClicks)}</strong></div>
          <div class="card">Leads<strong>${formatNumber(analytics.totals.totalLeads)}</strong></div>
          <div class="card">Peak time<strong>${peakHour?.label ?? "N/A"}</strong></div>
          <div class="card">Conversion<strong>${analytics.totals.leadConversionRate}%</strong></div>
        </div>
        <h2>Hourly visitors</h2>
        <table><thead><tr><th>Hour</th><th>Visitors</th><th>Page views</th><th>Events</th><th>Leads</th></tr></thead><tbody>${hourlyRows}</tbody></table>
        <h2>Daily activity</h2>
        <table><thead><tr><th>Date</th><th>Events</th><th>Page views</th><th>Visitors</th><th>Leads</th></tr></thead><tbody>${dailyRows}</tbody></table>
        <h2>Device mix</h2>
        <table><thead><tr><th>Device</th><th>Events</th></tr></thead><tbody>${deviceRows}</tbody></table>
        <h2>Top pages</h2>
        <table><thead><tr><th>Page</th><th>Views</th></tr></thead><tbody>${pageRows}</tbody></table>
        <h2>Visitor places</h2>
        <table><thead><tr><th>Place</th><th>Events</th><th>Visitors</th><th>Page views</th></tr></thead><tbody>${placeRows}</tbody></table>
      </body>
    </html>
  `)
  report.document.close()
  report.focus()
  report.print()
}

function LeadDetailsSheet({
  lead,
  open,
  onOpenChange,
  onStatusChange,
  isUpdating,
}: {
  lead?: WebsiteLead
  open: boolean
  onOpenChange: (open: boolean) => void
  onStatusChange: (status: WebsiteLead["status"]) => void
  isUpdating: boolean
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-2xl!">
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle>{lead ? lead.businessName || lead.name : "Website lead"}</SheetTitle>
          <SheetDescription>
            Foodbela.com {lead ? leadTypeLabel(lead.type).toLowerCase() : "lead"} details and follow-up status.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {!lead ? (
            <div className="text-sm text-muted-foreground">Loading lead details...</div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{leadTypeLabel(lead.type)}</Badge>
                <Badge>{statusLabel(lead.status)}</Badge>
                <Badge variant="outline">{lead.area}</Badge>
              </div>

              <div className="grid gap-3 rounded-lg border p-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Name</p>
                  <p className="font-medium">{lead.name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <a className="font-medium text-primary" href={`tel:${lead.phone}`}>
                    {lead.phone}
                  </a>
                </div>
                {lead.businessName ? (
                  <div>
                    <p className="text-xs text-muted-foreground">Restaurant</p>
                    <p className="font-medium">{lead.businessName}</p>
                  </div>
                ) : null}
                {lead.cuisineType ? (
                  <div>
                    <p className="text-xs text-muted-foreground">Cuisine</p>
                    <p className="font-medium">{lead.cuisineType}</p>
                  </div>
                ) : null}
                {lead.vehicleType ? (
                  <div>
                    <p className="text-xs text-muted-foreground">Vehicle</p>
                    <p className="font-medium">{lead.vehicleType}</p>
                  </div>
                ) : null}
              </div>

              <div className="rounded-lg border p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">Message</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                  {lead.message || "No message was added."}
                </p>
              </div>

              <div className="rounded-lg border p-4">
                <p className="text-sm font-medium">Follow-up status</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Use this to keep the team synced on whether the person has been contacted.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {statusOptions.map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant={lead.status === status ? "default" : "outline"}
                      disabled={isUpdating}
                      onClick={() => onStatusChange(status)}
                    >
                      {statusLabel(status)}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid gap-2 rounded-lg border p-4 text-xs text-muted-foreground">
                <div>Landing page: {lead.landingPage || "-"}</div>
                <div>Language: {lead.language || "-"}</div>
                <div>Created: {formatDate(lead.createdAt)}</div>
                <div>Last updated: {formatDate(lead.updatedAt)}</div>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function WebsitePage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedLeadId, setSelectedLeadId] = React.useState<string | null>(
    () => searchParams.get("leadId")
  )
  const [leadFilters, setLeadFilters] = React.useState({
    type: "all",
    status: "all",
    search: "",
  })
  const [analyticsFilters, setAnalyticsFilters] = React.useState<WebsiteAnalyticsFilters>({
    preset: "last30Days",
    from: defaultFromDate(),
    to: toDateInput(new Date()),
    eventName: "all",
    deviceType: "all",
    pagePath: "",
    language: "all",
    eventPage: 1,
    eventPageSize: 30,
  })

  React.useEffect(() => {
    setSelectedLeadId(searchParams.get("leadId"))
  }, [searchParams])

  const overviewQuery = useQuery({
    queryKey: ["admin-website-overview"],
    queryFn: getWebsiteOverview,
  })
  const leadsQuery = useQuery({
    queryKey: ["admin-website-leads", leadFilters],
    queryFn: () => listWebsiteLeads({ page: 1, pageSize: 50, ...leadFilters }),
  })
  const analyticsQuery = useQuery({
    queryKey: ["admin-website-analytics", analyticsFilters],
    queryFn: () => getWebsiteAnalytics(analyticsFilters),
    placeholderData: (previousData) => previousData,
  })
  const selectedLeadQuery = useQuery({
    queryKey: ["admin-website-lead", selectedLeadId],
    queryFn: () => getWebsiteLead(selectedLeadId || ""),
    enabled: Boolean(selectedLeadId),
  })
  const [settingsForm, setSettingsForm] = React.useState(() =>
    settingsToForm(overviewQuery.data?.settings)
  )

  React.useEffect(() => {
    if (overviewQuery.data?.settings) {
      setSettingsForm(settingsToForm(overviewQuery.data.settings))
    }
  }, [overviewQuery.data?.settings])

  const updateLeadMutation = useMutation({
    mutationFn: ({ leadId, status }: { leadId: string; status: WebsiteLead["status"] }) =>
      updateWebsiteLead(leadId, { status, markContacted: status !== "new" }),
    onSuccess: (_lead, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-website-overview"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-website-leads"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-website-lead", variables.leadId] })
      void queryClient.invalidateQueries({ queryKey: ["admin-notifications"] })
      toast.success("Website lead updated")
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not update website lead")
    },
  })

  const updateSettingsMutation = useMutation({
    mutationFn: () => {
      const coverageRewardAmount = Number(settingsForm.coverageRewardAmount || 0)
      const websiteModalDelaySeconds = Number(settingsForm.websiteModalDelaySeconds || 0)

      return updateWebsiteSettings({
        ...settingsForm,
        coverageRewardAmount: Number.isFinite(coverageRewardAmount) ? coverageRewardAmount : 0,
        websiteModalDelaySeconds: Number.isFinite(websiteModalDelaySeconds)
          ? websiteModalDelaySeconds
          : 0,
        serviceAreas: parseServiceAreas(settingsForm.serviceAreas),
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-website-overview"] })
      toast.success("Foodbela.com settings saved")
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not save website settings")
    },
  })

  function updateSocialUrl(formKey: (typeof socialLinkOptions)[number]["formKey"], value: string) {
    setSettingsForm((current) => ({ ...current, [formKey]: value }))
  }

  function moveSocialLink(key: WebsiteSocialLinkKey, direction: -1 | 1) {
    setSettingsForm((current) => {
      const order = normalizeSocialLinksOrder(current.socialLinksOrder)
      const index = order.indexOf(key)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return current
      const next = [...order]
      ;[next[index], next[nextIndex]] = [next[nextIndex], next[index]]
      return { ...current, socialLinksOrder: next }
    })
  }

  function openLead(leadId: string) {
    const next = new URLSearchParams(searchParams)
    next.set("leadId", leadId)
    setSearchParams(next)
    setSelectedLeadId(leadId)
  }

  function closeLead() {
    const next = new URLSearchParams(searchParams)
    next.delete("leadId")
    setSearchParams(next, { replace: true })
    setSelectedLeadId(null)
  }

  function updateAnalyticsFilter(patch: Partial<WebsiteAnalyticsFilters>) {
    setAnalyticsFilters((current) => ({
      ...current,
      ...patch,
      eventPage: patch.eventPage ?? 1,
    }))
  }

  const overview = overviewQuery.data
  const analytics = analyticsQuery.data ?? overview?.analytics
  const leads = leadsQuery.data?.items ?? overview?.recentLeads ?? []
  const totals = analytics?.totals
  const maxDailyEvents = Math.max(...(analytics?.daily ?? []).map((day) => day.events), 1)
  const maxHourlyVisitors = Math.max(
    ...(analytics?.hourlyBreakdown ?? []).map((hour) => hour.visitors),
    1
  )
  const maxPlaceEvents = Math.max(...(analytics?.placeBreakdown ?? []).map((item) => item.count), 1)
  const recentEventsMeta = analytics?.recentEventsMeta
  const topPeakHour = analytics?.peakVisitorHours?.[0]
  const selectedLead = selectedLeadQuery.data

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Foodbela.com</h1>
          <p className="text-muted-foreground">
            Public website leads, visitor analytics, controlled links, support contacts, hero copy, and service zones.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void overviewQuery.refetch()}>
            <RefreshCcw className="mr-2 size-4" />
            Refresh
          </Button>
          <Button asChild variant="outline">
            <a href="http://localhost:4200" target="_blank" rel="noreferrer">
              Open website <ArrowUpRight className="ml-2 size-4" />
            </a>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Visitors</CardDescription>
            <CardTitle className="text-2xl">{formatNumber(totals?.uniqueVisitors)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Filtered period</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Page views</CardDescription>
            <CardTitle className="text-2xl">{formatNumber(totals?.pageViews)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Tracked from public site</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>CTA clicks</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <MousePointerClick className="size-5 text-rose-500" />
              {formatNumber(totals?.ctaClicks)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Restaurant leads</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Store className="size-5 text-orange-500" />
              {formatNumber(totals?.leads.restaurant)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Rider leads</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Truck className="size-5 text-sky-500" />
              {formatNumber(totals?.leads.rider)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>New inbox</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <MessageSquareText className="size-5 text-rose-500" />
              {formatNumber(overview?.newLeadCount)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Tabs defaultValue="leads">
        <TabsList>
          <TabsTrigger value="leads">Lead inbox</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="seo">SEO</TabsTrigger>
          <TabsTrigger value="settings">Website settings</TabsTrigger>
        </TabsList>

        <TabsContent value="leads" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Website registrations and messages</CardTitle>
              <CardDescription>
                Restaurant applications, rider applications, and customer messages from Foodbela.com.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-[180px_180px_1fr]">
                <Select
                  value={leadFilters.type}
                  onValueChange={(type) => setLeadFilters((current) => ({ ...current, type }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {leadTypeOptions.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type === "all" ? "All types" : type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={leadFilters.status}
                  onValueChange={(status) => setLeadFilters((current) => ({ ...current, status }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {leadStatusOptions.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status === "all"
                          ? "All statuses"
                          : statusLabel(status as WebsiteLead["status"])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative">
                  <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search name, phone, area, restaurant..."
                    value={leadFilters.search}
                    onChange={(event) =>
                      setLeadFilters((current) => ({ ...current, search: event.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lead</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Area</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leads.map((lead) => (
                      <TableRow key={lead.id}>
                        <TableCell>
                          <div className="font-medium">{lead.businessName || lead.name}</div>
                          <div className="text-xs text-muted-foreground">{lead.name}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{leadTypeLabel(lead.type)}</Badge>
                        </TableCell>
                        <TableCell>{lead.area}</TableCell>
                        <TableCell>{lead.phone}</TableCell>
                        <TableCell>
                          <Badge>{statusLabel(lead.status)}</Badge>
                        </TableCell>
                        <TableCell>{formatDate(lead.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => openLead(lead.id)}>
                              Details
                            </Button>
                            <Button
                              size="sm"
                              variant={lead.status === "contacted" ? "default" : "outline"}
                              onClick={() =>
                                updateLeadMutation.mutate({
                                  leadId: lead.id,
                                  status: lead.status === "contacted" ? "new" : "contacted",
                                })
                              }
                            >
                              {lead.status === "contacted" ? "Contacted" : "Mark contacted"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!leads.length ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                          No website leads match the current filters.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Analytics filters</CardTitle>
              <CardDescription>
                Filter by date, event, page, language, and whether visitors came from mobile or desktop.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(280px,1.3fr)_repeat(4,minmax(0,1fr))]">
                <div className="grid gap-2">
                  <Label>Timeframe</Label>
                  <AdminDateRangeFilter<WebsiteAnalyticsPreset>
                    value={analyticsFilters.preset}
                    from={analyticsFilters.from}
                    to={analyticsFilters.to}
                    label="Website analytics timeframe"
                    allowedPresets={websiteAnalyticsPresets}
                    triggerClassName="w-full"
                    onPresetChange={(preset) => updateAnalyticsFilter({ preset })}
                    onRangeChange={(range) =>
                      updateAnalyticsFilter({
                        preset: "custom",
                        from: range.from,
                        to: range.to,
                      })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Event</Label>
                  <Select
                    value={analyticsFilters.eventName}
                    onValueChange={(eventName) =>
                      updateAnalyticsFilter({ eventName })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Event" />
                    </SelectTrigger>
                    <SelectContent>
                      {eventOptions.map((eventName) => (
                        <SelectItem key={eventName} value={eventName}>
                          {eventName === "all" ? "All events" : eventName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Device</Label>
                  <Select
                    value={analyticsFilters.deviceType}
                    onValueChange={(deviceType) =>
                      updateAnalyticsFilter({ deviceType })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Device" />
                    </SelectTrigger>
                    <SelectContent>
                      {deviceOptions.map((device) => (
                        <SelectItem key={device} value={device}>
                          {device === "all" ? "All devices" : device}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Language</Label>
                  <Select
                    value={analyticsFilters.language}
                    onValueChange={(language) =>
                      updateAnalyticsFilter({ language })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Language" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All languages</SelectItem>
                      <SelectItem value="bn">Bangla</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Page contains</Label>
                  <Input
                    placeholder="/restaurants"
                    value={analyticsFilters.pagePath}
                    onChange={(event) =>
                      updateAnalyticsFilter({ pagePath: event.target.value })
                    }
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void analyticsQuery.refetch()}>
                  <RefreshCcw className="mr-2 size-4" />
                  Refresh report
                </Button>
                <Button
                  variant="outline"
                  disabled={!analytics}
                  onClick={() => analytics && downloadCsv("foodbela-website-analytics.csv", analyticsRows(analytics))}
                >
                  <ArrowDownToLine className="mr-2 size-4" />
                  Export CSV
                </Button>
                <Button variant="outline" disabled={!analytics} onClick={() => analytics && printAnalyticsReport(analytics)}>
                  <FileText className="mr-2 size-4" />
                  Export PDF
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Peak visitor time</CardDescription>
                <CardTitle className="text-xl">{topPeakHour?.label ?? "No traffic yet"}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {formatNumber(topPeakHour?.visitors ?? 0)} visitors · Asia/Dhaka time
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Lead conversion</CardDescription>
                <CardTitle className="text-xl">{totals?.leadConversionRate ?? 0}%</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">Leads per unique visitor</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>CTA click rate</CardDescription>
                <CardTitle className="text-xl">{totals?.ctaClickRate ?? 0}%</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">CTA clicks per page view</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Views per session</CardDescription>
                <CardTitle className="text-xl">{totals?.pageViewsPerSession ?? 0}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">Useful for engagement quality</CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Hourly visitor pattern</CardTitle>
              <CardDescription>
                Shows when visitors arrive most often in Asia/Dhaka time.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(analytics?.hourlyBreakdown ?? []).map((hour) => (
                <div key={hour.hour} className="grid grid-cols-[94px_1fr_auto] items-center gap-3">
                  <span className="text-xs text-muted-foreground">{hour.label}</span>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-rose-500"
                      style={{ width: `${hour.visitors ? Math.max(5, (hour.visitors / maxHourlyVisitors) * 100) : 0}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium">
                    {formatNumber(hour.visitors)} visitors
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="size-5" />
                  Daily activity
                </CardTitle>
                <CardDescription>Events, page views, visitors, sessions, and leads by day.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(analytics?.daily ?? []).map((day) => (
                  <div key={day.date} className="grid grid-cols-[96px_1fr_auto] items-center gap-3">
                    <span className="text-sm text-muted-foreground">{day.date.slice(5)}</span>
                    <div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.max(4, (day.events / maxDailyEvents) * 100)}%` }}
                        />
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {day.visitors} visitors · {day.pageViews} views · {day.leads} leads
                      </div>
                    </div>
                    <span className="text-sm font-medium">{day.events}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MonitorSmartphone className="size-5" />
                  Device and browser mix
                </CardTitle>
                <CardDescription>Understand how people browse Foodbela.com.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Devices</p>
                  {(analytics?.deviceBreakdown ?? []).map((item) => (
                    <div key={item.deviceType} className="flex items-center justify-between rounded-lg border p-3">
                      <span className="capitalize">{item.deviceType}</span>
                      <Badge variant="secondary">{formatNumber(item.count)}</Badge>
                    </div>
                  ))}
                </div>
                <Separator />
                <div className="space-y-2">
                  <p className="text-sm font-medium">Browsers</p>
                  {(analytics?.browserBreakdown ?? []).map((item) => (
                    <div key={item.browserName} className="flex items-center justify-between rounded-lg border p-3">
                      <span>{item.browserName}</span>
                      <Badge variant="secondary">{formatNumber(item.count)}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle>Top pages</CardTitle>
                <CardDescription>Most viewed Foodbela.com paths.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(analytics?.topPages ?? []).map((page) => (
                  <div key={page.path} className="flex items-center justify-between rounded-lg border p-3">
                    <span className="truncate font-medium">{page.path}</span>
                    <Badge variant="secondary">{formatNumber(page.views)}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="size-5" />
                  Visitor places
                </CardTitle>
                <CardDescription>Location context sent by the website/browser event metadata.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(analytics?.placeBreakdown ?? []).map((item) => (
                  <div key={formatPlaceBreakdownLabel(item)} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate font-medium">{formatPlaceBreakdownLabel(item)}</span>
                      <Badge variant="secondary">{formatNumber(item.count)}</Badge>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(4, (item.count / maxPlaceEvents) * 100)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {formatNumber(item.visitors)} visitors · {formatNumber(item.pageViews)} page views
                    </p>
                  </div>
                ))}
                {!(analytics?.placeBreakdown ?? []).length ? (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    No place metadata captured in this timeframe yet.
                  </div>
                ) : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Events</CardTitle>
                <CardDescription>What visitors are doing.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(analytics?.eventBreakdown ?? []).map((item) => (
                  <div key={item.eventName} className="flex items-center justify-between rounded-lg border p-3">
                    <span className="font-medium">{item.eventName}</span>
                    <Badge variant="secondary">{formatNumber(item.count)}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Referrers and CTAs</CardTitle>
                <CardDescription>Where people came from and what they clicked.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(analytics?.topReferrers ?? []).slice(0, 5).map((item) => (
                  <div key={item.referrer} className="flex items-center justify-between rounded-lg border p-3">
                    <span className="truncate font-medium">{item.referrer}</span>
                    <Badge variant="secondary">{formatNumber(item.visits)}</Badge>
                  </div>
                ))}
                {(analytics?.ctaBreakdown ?? []).slice(0, 5).map((item) => (
                  <div key={`${item.label}-${item.href}`} className="flex items-center justify-between rounded-lg border p-3">
                    <span className="truncate font-medium">{item.label}</span>
                    <Badge>{formatNumber(item.count)}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="size-5" />
                Recent tracked events
              </CardTitle>
              <CardDescription>
                Latest analytics events are paginated. Showing page{" "}
                {recentEventsMeta?.page ?? analyticsFilters.eventPage} of{" "}
                {recentEventsMeta?.totalPages ?? 1}; total{" "}
                {formatNumber(recentEventsMeta?.total ?? analytics?.totals.events ?? 0)} events.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-muted-foreground">
                  This table does not load every event at once. Use pages for large traffic periods.
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={String(analyticsFilters.eventPageSize)}
                    onValueChange={(value) =>
                      setAnalyticsFilters((current) => ({
                        ...current,
                        eventPage: 1,
                        eventPageSize: Number(value),
                      }))
                    }
                  >
                    <SelectTrigger className="w-[116px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[15, 30, 50, 100].map((size) => (
                        <SelectItem key={size} value={String(size)}>
                          {size} rows
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={(recentEventsMeta?.page ?? analyticsFilters.eventPage) <= 1}
                    onClick={() =>
                      setAnalyticsFilters((current) => ({
                        ...current,
                        eventPage: Math.max(1, current.eventPage - 1),
                      }))
                    }
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={
                      (recentEventsMeta?.page ?? analyticsFilters.eventPage) >=
                      (recentEventsMeta?.totalPages ?? 1)
                    }
                    onClick={() =>
                      setAnalyticsFilters((current) => ({
                        ...current,
                        eventPage: current.eventPage + 1,
                      }))
                    }
                  >
                    Next
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event</TableHead>
                      <TableHead>Page</TableHead>
                      <TableHead>Place</TableHead>
                      <TableHead>Device</TableHead>
                      <TableHead>Browser</TableHead>
                      <TableHead>Language</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(analytics?.recentEvents ?? []).map((event) => (
                      <TableRow key={event.id}>
                        <TableCell>
                          <Badge variant="secondary">{event.eventName}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[240px] truncate">{event.pagePath}</TableCell>
                        <TableCell className="max-w-[220px] truncate">
                          {formatRecentEventPlace(event)}
                        </TableCell>
                        <TableCell className="capitalize">{event.deviceType}</TableCell>
                        <TableCell>{event.browserName}</TableCell>
                        <TableCell>{event.language || "-"}</TableCell>
                        <TableCell>{formatDate(event.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                    {!(analytics?.recentEvents ?? []).length ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                          No tracked website events match the current filters.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="seo">
          <Card>
            <CardHeader>
              <CardTitle>SEO and search presence</CardTitle>
              <CardDescription>
                Control Foodbela.com canonical domain, Google verification, share preview, and structured data.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              {[
                ["siteUrl", "Public site URL"],
                ["seoOgImageUrl", "Social preview image URL"],
                ["googleSiteVerification", "Google verification code"],
                ["businessAddress", "Business address"],
                ["businessCity", "Business city"],
                ["businessRegion", "Business region"],
                ["businessPostalCode", "Postal code(s), comma allowed"],
                ["businessCountry", "Country code"],
              ].map(([key, label]) => (
                <div key={key} className="grid gap-2">
                  <Label>{label}</Label>
                  <Input
                    value={String(settingsForm[key as keyof typeof settingsForm] ?? "")}
                    onChange={(event) =>
                      setSettingsForm((current) => ({ ...current, [key]: event.target.value }))
                    }
                  />
                </div>
              ))}
              <div className="grid gap-2 lg:col-span-2">
                <Label>Default SEO title</Label>
                <Input
                  value={settingsForm.seoDefaultTitle}
                  onChange={(event) =>
                    setSettingsForm((current) => ({
                      ...current,
                      seoDefaultTitle: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2 lg:col-span-2">
                <Label>Default SEO description</Label>
                <Textarea
                  value={settingsForm.seoDefaultDescription}
                  rows={3}
                  onChange={(event) =>
                    setSettingsForm((current) => ({
                      ...current,
                      seoDefaultDescription: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground lg:col-span-2">
                Sitemap: <span className="font-medium text-foreground">{settingsForm.siteUrl || "https://foodbela.com"}/sitemap.xml</span>
                <br />
                Robots: <span className="font-medium text-foreground">{settingsForm.siteUrl || "https://foodbela.com"}/robots.txt</span>
              </div>
              <div className="lg:col-span-2">
                <Button onClick={() => updateSettingsMutation.mutate()} disabled={updateSettingsMutation.isPending}>
                  <Globe2 className="mr-2 size-4" />
                  Save SEO settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Website-controlled content</CardTitle>
              <CardDescription>
                These values control Foodbela.com links, phone numbers, bilingual hero copy, and area zones.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              {[
                ["playStoreUrl", "Google Play URL"],
                ["appDownloadUrl", "Fallback app download URL"],
                ["restaurantApplyUrl", "Restaurant apply URL"],
                ["riderApplyUrl", "Rider apply URL"],
                ["supportPhone", "Support phone"],
                ["supportEmail", "Support email"],
              ].map(([key, label]) => (
                <div key={key} className="grid gap-2">
                  <Label>{label}</Label>
                  <Input
                    value={String(settingsForm[key as keyof typeof settingsForm] ?? "")}
                    onChange={(event) =>
                      setSettingsForm((current) => ({ ...current, [key]: event.target.value }))
                    }
                  />
                </div>
              ))}
              <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 lg:col-span-2">
                <div>
                  <Label>Footer social links</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Add URLs and use Up/Down to choose the display order. Blank or # links stay hidden on Foodbela.com.
                  </p>
                </div>
                <div className="grid gap-3">
                  {normalizeSocialLinksOrder(settingsForm.socialLinksOrder).map((socialKey, index) => {
                    const item =
                      socialLinkOptions.find((option) => option.key === socialKey) ?? socialLinkOptions[0]
                    return (
                      <div
                        key={item.key}
                        className="grid gap-3 rounded-lg border bg-background p-3 md:grid-cols-[130px_1fr_auto]"
                      >
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{index + 1}</Badge>
                          <span className="font-medium">{item.label}</span>
                        </div>
                        <Input
                          value={String(settingsForm[item.formKey] ?? "")}
                          placeholder={`https://${item.key}.com/foodbela`}
                          onChange={(event) => updateSocialUrl(item.formKey, event.target.value)}
                        />
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={index === 0}
                            onClick={() => moveSocialLink(item.key, -1)}
                          >
                            Up
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={index === socialLinkOptions.length - 1}
                            onClick={() => moveSocialLink(item.key, 1)}
                          >
                            Down
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="grid gap-2 lg:col-span-2">
                <Label>Hero title Bangla</Label>
                <Textarea
                  value={settingsForm.heroTitle}
                  rows={2}
                  onChange={(event) =>
                    setSettingsForm((current) => ({ ...current, heroTitle: event.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2 lg:col-span-2">
                <Label>Hero description Bangla</Label>
                <Textarea
                  value={settingsForm.heroSubtitle}
                  rows={3}
                  onChange={(event) =>
                    setSettingsForm((current) => ({ ...current, heroSubtitle: event.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2 lg:col-span-2">
                <Label>Hero title English</Label>
                <Textarea
                  value={settingsForm.heroTitleEn}
                  rows={2}
                  onChange={(event) =>
                    setSettingsForm((current) => ({ ...current, heroTitleEn: event.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2 lg:col-span-2">
                <Label>Hero description English</Label>
                <Textarea
                  value={settingsForm.heroSubtitleEn}
                  rows={3}
                  onChange={(event) =>
                    setSettingsForm((current) => ({ ...current, heroSubtitleEn: event.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Customer guide YouTube URL</Label>
                <Input
                  value={settingsForm.customerYoutubeUrl}
                  placeholder="https://www.youtube.com/watch?v=..."
                  onChange={(event) =>
                    setSettingsForm((current) => ({
                      ...current,
                      customerYoutubeUrl: event.target.value,
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Watch, Shorts, youtu.be, and embed URLs are supported.
                </p>
              </div>
              <div className="grid gap-2">
                <Label>Customer guide video shape</Label>
                <Select
                  value={settingsForm.customerVideoOrientation}
                  onValueChange={(value) =>
                    setSettingsForm((current) => ({
                      ...current,
                      customerVideoOrientation: value as WebsiteSettings["customerVideoOrientation"],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="portrait">Portrait / mobile video</SelectItem>
                    <SelectItem value="landscape">Landscape / wide video</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Customer offer section</Label>
                <Select
                  value={settingsForm.customerOfferEnabled ? "true" : "false"}
                  onValueChange={(value) =>
                    setSettingsForm((current) => ({
                      ...current,
                      customerOfferEnabled: value === "true",
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="false">Hidden</SelectItem>
                    <SelectItem value="true">Visible</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Offer CTA URL</Label>
                <Input
                  value={settingsForm.customerOfferCtaUrl}
                  onChange={(event) =>
                    setSettingsForm((current) => ({
                      ...current,
                      customerOfferCtaUrl: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2 lg:col-span-2">
                <Label>Offer title</Label>
                <Input
                  value={settingsForm.customerOfferTitle}
                  onChange={(event) =>
                    setSettingsForm((current) => ({
                      ...current,
                      customerOfferTitle: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2 lg:col-span-2">
                <Label>Offer description</Label>
                <Textarea
                  value={settingsForm.customerOfferDescription}
                  rows={3}
                  onChange={(event) =>
                    setSettingsForm((current) => ({
                      ...current,
                      customerOfferDescription: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2 lg:col-span-2">
                <Label>Offer CTA label</Label>
                <Input
                  value={settingsForm.customerOfferCtaLabel}
                  onChange={(event) =>
                    setSettingsForm((current) => ({
                      ...current,
                      customerOfferCtaLabel: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-4 rounded-xl border bg-muted/20 p-4 lg:col-span-2">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <Label>Website launch modal</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Control the popup shown on Foodbela.com. Blank image uses a QR code from the Play Store URL.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="website-modal-enabled" className="text-sm text-muted-foreground">
                      Active
                    </Label>
                    <Switch
                      id="website-modal-enabled"
                      checked={Boolean(settingsForm.websiteModalEnabled)}
                      onCheckedChange={(checked) =>
                        setSettingsForm((current) => ({
                          ...current,
                          websiteModalEnabled: Boolean(checked),
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="grid gap-2">
                    <Label>Modal layout</Label>
                    <Select
                      value={settingsForm.websiteModalMode}
                      onValueChange={(value) =>
                        setSettingsForm((current) => ({
                          ...current,
                          websiteModalMode: value as WebsiteSettings["websiteModalMode"],
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="image">Image only</SelectItem>
                        <SelectItem value="image_text">Image + text</SelectItem>
                        <SelectItem value="image_text_button">Image + text + button</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Show after seconds</Label>
                    <Input
                      type="number"
                      min={0}
                      max={120}
                      value={settingsForm.websiteModalDelaySeconds}
                      onChange={(event) =>
                        setSettingsForm((current) => ({
                          ...current,
                          websiteModalDelaySeconds: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Show frequency</Label>
                    <Select
                      value={settingsForm.websiteModalFrequency}
                      onValueChange={(value) =>
                        setSettingsForm((current) => ({
                          ...current,
                          websiteModalFrequency: value as WebsiteSettings["websiteModalFrequency"],
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="session">Once per session</SelectItem>
                        <SelectItem value="daily">Once per day</SelectItem>
                        <SelectItem value="always">Every visit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Modal image URL</Label>
                  <Input
                    value={settingsForm.websiteModalImageUrl}
                    placeholder="Leave blank to show a Play Store QR code"
                    onChange={(event) =>
                      setSettingsForm((current) => ({
                        ...current,
                        websiteModalImageUrl: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>Modal title Bangla</Label>
                    <Input
                      value={settingsForm.websiteModalTitle}
                      onChange={(event) =>
                        setSettingsForm((current) => ({
                          ...current,
                          websiteModalTitle: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Modal title English</Label>
                    <Input
                      value={settingsForm.websiteModalTitleEn}
                      onChange={(event) =>
                        setSettingsForm((current) => ({
                          ...current,
                          websiteModalTitleEn: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>Modal description Bangla</Label>
                    <Textarea
                      rows={3}
                      value={settingsForm.websiteModalDescription}
                      onChange={(event) =>
                        setSettingsForm((current) => ({
                          ...current,
                          websiteModalDescription: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Modal description English</Label>
                    <Textarea
                      rows={3}
                      value={settingsForm.websiteModalDescriptionEn}
                      onChange={(event) =>
                        setSettingsForm((current) => ({
                          ...current,
                          websiteModalDescriptionEn: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="grid gap-2">
                    <Label>Button URL</Label>
                    <Input
                      value={settingsForm.websiteModalCtaUrl}
                      onChange={(event) =>
                        setSettingsForm((current) => ({
                          ...current,
                          websiteModalCtaUrl: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Button label Bangla</Label>
                    <Input
                      value={settingsForm.websiteModalCtaLabel}
                      onChange={(event) =>
                        setSettingsForm((current) => ({
                          ...current,
                          websiteModalCtaLabel: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Button label English</Label>
                    <Input
                      value={settingsForm.websiteModalCtaLabelEn}
                      onChange={(event) =>
                        setSettingsForm((current) => ({
                          ...current,
                          websiteModalCtaLabelEn: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
              <div className="grid gap-4 rounded-xl border bg-muted/20 p-4 lg:col-span-2">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <Label>Top announcement banner</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Optional slim banner under the navbar for campaigns, launches, or important notices.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="website-banner-enabled" className="text-sm text-muted-foreground">
                      Active
                    </Label>
                    <Switch
                      id="website-banner-enabled"
                      checked={Boolean(settingsForm.websiteBannerEnabled)}
                      onCheckedChange={(checked) =>
                        setSettingsForm((current) => ({
                          ...current,
                          websiteBannerEnabled: Boolean(checked),
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>Banner text Bangla</Label>
                    <Input
                      value={settingsForm.websiteBannerText}
                      onChange={(event) =>
                        setSettingsForm((current) => ({
                          ...current,
                          websiteBannerText: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Banner text English</Label>
                    <Input
                      value={settingsForm.websiteBannerTextEn}
                      onChange={(event) =>
                        setSettingsForm((current) => ({
                          ...current,
                          websiteBannerTextEn: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="grid gap-2">
                    <Label>Banner CTA URL</Label>
                    <Input
                      value={settingsForm.websiteBannerCtaUrl}
                      onChange={(event) =>
                        setSettingsForm((current) => ({
                          ...current,
                          websiteBannerCtaUrl: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>CTA label Bangla</Label>
                    <Input
                      value={settingsForm.websiteBannerCtaLabel}
                      onChange={(event) =>
                        setSettingsForm((current) => ({
                          ...current,
                          websiteBannerCtaLabel: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>CTA label English</Label>
                    <Input
                      value={settingsForm.websiteBannerCtaLabelEn}
                      onChange={(event) =>
                        setSettingsForm((current) => ({
                          ...current,
                          websiteBannerCtaLabelEn: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
              <div className="grid gap-2 lg:col-span-2">
                <Label>Coverage areas</Label>
                <Textarea
                  value={settingsForm.serviceAreas}
                  rows={5}
                  placeholder="Netrokona|active|Live now|Food delivery in Netrokona|Order food from local restaurants in Netrokona|Netrokona food delivery, Netrokona restaurant|Biryani, Burger, Fast food|2400|নেত্রকোনায় লাইভ ডেলিভারি কভারেজ|Live delivery coverage in Netrokona"
                  onChange={(event) =>
                    setSettingsForm((current) => ({ ...current, serviceAreas: event.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Foodbela.com coverage is controlled manually from here. Format: name|active/coming_soon/paused|fallback note|SEO title|SEO description|popular searches comma list|cuisines comma list|postal codes comma list|Bangla note|English note.
                </p>
              </div>
              <div className="grid gap-2">
                <Label>Coverage request reward</Label>
                <Input
                  type="number"
                  min={0}
                  value={settingsForm.coverageRewardAmount}
                  onChange={(event) =>
                    setSettingsForm((current) => ({
                      ...current,
                      coverageRewardAmount: event.target.value,
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Gift amount shown on Foodbela.com when a suggested area is selected for launch.
                </p>
              </div>
              <div className="lg:col-span-2">
                <Button onClick={() => updateSettingsMutation.mutate()} disabled={updateSettingsMutation.isPending}>
                  <Globe2 className="mr-2 size-4" />
                  Save Foodbela.com settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <LeadDetailsSheet
        open={Boolean(selectedLeadId)}
        lead={selectedLead}
        isUpdating={updateLeadMutation.isPending}
        onOpenChange={(open) => {
          if (!open) closeLead()
        }}
        onStatusChange={(status) => {
          if (selectedLeadId) updateLeadMutation.mutate({ leadId: selectedLeadId, status })
        }}
      />
    </div>
  )
}
