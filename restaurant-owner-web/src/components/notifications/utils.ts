import {
  Bell,
  ClipboardCheck,
  CreditCard,
  MessageSquareText,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  TicketPercent,
} from "lucide-react"
import {
  format,
  formatDistanceToNowStrict,
  isToday,
  isYesterday,
} from "date-fns"

import type { AppNotification, AppNotificationType } from "@/components/notifications/types"

export type NotificationFilter =
  | "all"
  | "unread"
  | "order"
  | "payout"
  | "promotion"
  | "support"
  | "review"
  | "system"

export function getNotificationIcon(type: AppNotificationType) {
  if (type === "new-order") return ShoppingBag
  if (type === "order-update") return ClipboardCheck
  if (type === "payout") return CreditCard
  if (type === "promotion") return TicketPercent
  if (type === "support") return ShieldAlert
  if (type === "review") return MessageSquareText
  if (type === "system") return Sparkles
  return Bell
}

export function getNotificationTone(type: AppNotificationType) {
  if (type === "new-order") return "bg-amber-100 text-amber-700"
  if (type === "order-update") return "bg-sky-100 text-sky-700"
  if (type === "payout") return "bg-emerald-100 text-emerald-700"
  if (type === "promotion") return "bg-fuchsia-100 text-fuchsia-700"
  if (type === "support") return "bg-rose-100 text-rose-700"
  if (type === "review") return "bg-violet-100 text-violet-700"
  return "bg-slate-100 text-slate-700"
}

export function getNotificationTypeLabel(type: AppNotificationType) {
  if (type === "new-order") return "Order"
  if (type === "order-update") return "Order Update"
  if (type === "payout") return "Payout"
  if (type === "promotion") return "Promotion"
  if (type === "support") return "Support"
  if (type === "review") return "Review"
  return "System"
}

export function matchesNotificationFilter(
  notification: AppNotification,
  filter: NotificationFilter
) {
  if (filter === "all") return true
  if (filter === "unread") return !notification.read
  if (filter === "order") {
    return (
      notification.type === "new-order" || notification.type === "order-update"
    )
  }
  return notification.type === filter
}

export function getNotificationGroupLabel(createdAt: string) {
  const value = new Date(createdAt)
  if (isToday(value)) return "Today"
  if (isYesterday(value)) return "Yesterday"
  return "Older"
}

export function formatNotificationTimestamp(createdAt: string) {
  const value = new Date(createdAt)
  if (isToday(value)) {
    return `Today ${format(value, "hh:mm a")}`
  }
  if (isYesterday(value)) {
    return `Yesterday ${format(value, "hh:mm a")}`
  }
  return format(value, "dd MMM yyyy, hh:mm a")
}

export function formatNotificationRelativeTime(createdAt: string) {
  return formatDistanceToNowStrict(new Date(createdAt), { addSuffix: true })
}
