import { adminRequest } from "./api"

export type AdminAlertDeliverySettings = {
  recipientEmails: string[]
  notificationChannel: "email" | "telegram" | "both"
  fromEmail: string
  fromName: string
  cooldownMinutes: number
  checkIntervalSeconds: number
  memoryRssMb: number
  cpuPercent: number
  fivexxThreshold: number
  rateLimitThreshold: number
  sslExpiryDays: number
}

export type AdminAlertSettingsStatus = {
  enabled: boolean
  smtpConfigured: boolean
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUser: string
  telegramConfigured: boolean
  telegramOpsConfigured: boolean
  telegramSystemConfigured: boolean
}

export type AdminAlertSettingsResponse = {
  settings: AdminAlertDeliverySettings
  status: AdminAlertSettingsStatus
}

export async function getAdminAlertSettings() {
  const response = await adminRequest<AdminAlertSettingsResponse>(
    "/admin/alert-settings"
  )
  return response.data
}

export async function updateAdminAlertSettings(
  settings: AdminAlertDeliverySettings
) {
  const response = await adminRequest<AdminAlertSettingsResponse>(
    "/admin/alert-settings",
    {
      method: "PUT",
      body: JSON.stringify({ settings }),
    }
  )
  return response.data
}

export async function sendAdminTestAlert(settings: Pick<
  AdminAlertDeliverySettings,
  "recipientEmails" | "fromEmail" | "fromName"
>) {
  const response = await adminRequest<{
    recipients: string[]
    status: AdminAlertSettingsStatus
  }>("/admin/alert-settings/test", {
    method: "POST",
    body: JSON.stringify({ settings }),
  })
  return response.data
}

export async function sendAdminTelegramTestAlert(
  layer: "operations" | "system"
) {
  const response = await adminRequest<{
    layer: "operations" | "system"
    status: AdminAlertSettingsStatus
  }>("/admin/alert-settings/test/telegram", {
    method: "POST",
    body: JSON.stringify({ layer }),
  })
  return response.data
}
