import { adminRequest } from "./api"

export type WebsiteSocialLinkKey =
  | "facebook"
  | "instagram"
  | "youtube"
  | "linkedin"
  | "tiktok"
  | "snapchat"

export type WebsiteLead = {
  id: string
  type: "restaurant" | "rider" | "contact"
  status: "new" | "contacted" | "qualified" | "converted" | "closed"
  name: string
  phone: string
  email: string
  area: string
  businessName: string
  cuisineType: string
  vehicleType: string
  message: string
  source: string
  landingPage: string
  referrer: string
  language: string
  notes: string
  createdAt: string | null
  updatedAt: string | null
}

export type WebsiteSettings = {
  siteUrl: string
  seoDefaultTitle: string
  seoDefaultDescription: string
  seoOgImageUrl: string
  googleSiteVerification: string
  businessAddress: string
  businessCity: string
  businessRegion: string
  businessPostalCode: string
  businessCountry: string
  playStoreUrl: string
  appDownloadUrl: string
  restaurantApplyUrl: string
  riderApplyUrl: string
  supportPhone: string
  supportEmail: string
  facebookUrl: string
  instagramUrl: string
  linkedinUrl: string
  tiktokUrl: string
  youtubeUrl: string
  snapchatUrl: string
  socialLinksOrder: WebsiteSocialLinkKey[]
  heroTitle: string
  heroSubtitle: string
  heroTitleEn: string
  heroSubtitleEn: string
  customerYoutubeUrl: string
  customerVideoOrientation: "portrait" | "landscape"
  customerOfferEnabled: boolean
  customerOfferTitle: string
  customerOfferDescription: string
  customerOfferCtaLabel: string
  customerOfferCtaUrl: string
  websiteModalEnabled: boolean
  websiteModalMode: "image" | "image_text" | "image_text_button"
  websiteModalImageUrl: string
  websiteModalTitle: string
  websiteModalTitleEn: string
  websiteModalDescription: string
  websiteModalDescriptionEn: string
  websiteModalCtaLabel: string
  websiteModalCtaLabelEn: string
  websiteModalCtaUrl: string
  websiteModalDelaySeconds: number
  websiteModalFrequency: "always" | "session" | "daily"
  websiteBannerEnabled: boolean
  websiteBannerText: string
  websiteBannerTextEn: string
  websiteBannerCtaLabel: string
  websiteBannerCtaLabelEn: string
  websiteBannerCtaUrl: string
  coverageRewardAmount: number
  serviceAreas: Array<{
    name: string
    status: "active" | "coming_soon" | "paused"
    note?: string
    noteBn?: string
    noteEn?: string
    seoTitle?: string
    seoDescription?: string
    popularSearches?: string[]
    cuisineKeywords?: string[]
    postalCodes?: string[]
  }>
  updatedAt: string | null
}

export type WebsiteAnalytics = {
  days: number
  range: {
    from: string
    to: string
  }
  filters: {
    preset: string
    eventName: string
    deviceType: string
    pagePath: string
    language: string
  }
  totals: {
    events: number
    pageViews: number
    uniqueVisitors: number
    sessions: number
    ctaClicks: number
    leadSubmits: number
    leads: {
      restaurant: number
      rider: number
      contact: number
    }
    totalLeads: number
    leadConversionRate: number
    ctaClickRate: number
    pageViewsPerSession: number
  }
  topPages: Array<{ path: string; views: number }>
  topReferrers: Array<{ referrer: string; visits: number }>
  daily: Array<{
    date: string
    events: number
    pageViews: number
    visitors: number
    sessions: number
    leads: number
  }>
  hourlyBreakdown: Array<{
    hour: number
    label: string
    events: number
    pageViews: number
    visitors: number
    sessions: number
    leads: number
  }>
  peakVisitorHours: Array<{
    hour: number
    label: string
    events: number
    pageViews: number
    visitors: number
    sessions: number
    leads: number
  }>
  eventBreakdown: Array<{ eventName: string; count: number }>
  deviceBreakdown: Array<{ deviceType: string; count: number }>
  browserBreakdown: Array<{ browserName: string; count: number }>
  osBreakdown: Array<{ osName: string; count: number }>
  languageBreakdown: Array<{ language: string; count: number }>
  placeBreakdown: Array<{
    place: string
    city: string
    district: string
    country: string
    count: number
    pageViews: number
    visitors: number
    sessions: number
  }>
  ctaBreakdown: Array<{ label: string; href: string; count: number }>
  recentEventsMeta: {
    page: number
    pageSize: number
    total: number
    totalPages: number
    truncated: boolean
  }
  recentEvents: Array<{
    id: string
    eventName: string
    pagePath: string
    visitorId: string
    sessionId: string
    language: string
    referrer: string
    deviceType: string
    browserName: string
    osName: string
    place: string
    city: string
    district: string
    country: string
    coordinates: { latitude: number; longitude: number } | null
    createdAt: string | null
  }>
}

export type WebsiteOverview = {
  settings: WebsiteSettings
  analytics: WebsiteAnalytics
  recentLeads: WebsiteLead[]
  newLeadCount: number
}

export async function getWebsiteOverview() {
  const response = await adminRequest<WebsiteOverview>("/admin/website/overview")
  return response.data
}

export async function listWebsiteLeads(params: {
  type?: string
  status?: string
  search?: string
  page?: number
  pageSize?: number
}) {
  const query = new URLSearchParams()
  if (params.type) query.set("type", params.type)
  if (params.status) query.set("status", params.status)
  if (params.search) query.set("search", params.search)
  if (params.page) query.set("page", String(params.page))
  if (params.pageSize) query.set("pageSize", String(params.pageSize))

  const response = await adminRequest<{
    items: WebsiteLead[]
    pagination: {
      page: number
      pageSize: number
      total: number
      totalPages: number
    }
  }>(`/admin/website/leads?${query.toString()}`)
  return response.data
}

export async function getWebsiteLead(leadId: string) {
  const response = await adminRequest<WebsiteLead>(`/admin/website/leads/${leadId}`)
  return response.data
}

export async function updateWebsiteLead(
  leadId: string,
  payload: Partial<Pick<WebsiteLead, "status" | "notes">> & { markContacted?: boolean }
) {
  const response = await adminRequest<WebsiteLead>(`/admin/website/leads/${leadId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  })
  return response.data
}

export async function getWebsiteAnalytics(params: {
  days?: number
  from?: string
  to?: string
  preset?: string
  eventName?: string
  deviceType?: string
  pagePath?: string
  language?: string
  eventPage?: number
  eventPageSize?: number
}) {
  const query = new URLSearchParams()
  if (params.days) query.set("days", String(params.days))
  if (params.from) query.set("from", params.from)
  if (params.to) query.set("to", params.to)
  if (params.preset) query.set("preset", params.preset)
  if (params.eventName && params.eventName !== "all") query.set("eventName", params.eventName)
  if (params.deviceType && params.deviceType !== "all") query.set("deviceType", params.deviceType)
  if (params.pagePath) query.set("pagePath", params.pagePath)
  if (params.language && params.language !== "all") query.set("language", params.language)
  if (params.eventPage) query.set("eventPage", String(params.eventPage))
  if (params.eventPageSize) query.set("eventPageSize", String(params.eventPageSize))

  const response = await adminRequest<WebsiteAnalytics>(`/admin/website/analytics?${query.toString()}`)
  return response.data
}

export async function updateWebsiteSettings(payload: Partial<WebsiteSettings>) {
  const response = await adminRequest<WebsiteSettings>("/admin/website/settings", {
    method: "PATCH",
    body: JSON.stringify(payload),
  })
  return response.data
}
