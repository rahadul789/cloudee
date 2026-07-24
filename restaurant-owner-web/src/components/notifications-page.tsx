import * as React from "react"
import {
  Bell,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Search,
  ShieldAlert,
} from "lucide-react"
import { useNavigate } from "react-router-dom"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useQueryClient } from "@tanstack/react-query"

import { useNotifications } from "@/components/notifications/notifications-context"
import type { AppNotification } from "@/components/notifications/types"
import {
  type NotificationFilter,
  formatNotificationRelativeTime,
  formatNotificationTimestamp,
  getNotificationGroupLabel,
  getNotificationIcon,
  getNotificationTone,
  getNotificationTypeLabel,
  matchesNotificationFilter,
} from "@/components/notifications/utils"
import {
  useOwnerNotificationReadMutation,
  useOwnerNotificationsListQuery,
  useOwnerNotificationsReadAllMutation,
} from "@/hooks/use-owner-api"
import {
  mapOwnerNotification,
  type OwnerListResponse,
  type OwnerNotificationResponse,
  type OwnerSidebarSummaryResponse,
} from "@/lib/backend-mappers"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
const pageSizeOptions = [10, 20, 30] as const

const filterOptions: {
  value: NotificationFilter
  label: string
}[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "order", label: "Order" },
  { value: "payout", label: "Payout" },
  { value: "system", label: "System" },
  { value: "promotion", label: "Promotions" },
  { value: "support", label: "Support" },
]

function groupNotifications(notifications: AppNotification[]) {
  const grouped = notifications.reduce<Record<string, AppNotification[]>>(
    (accumulator, notification) => {
      const key = getNotificationGroupLabel(notification.createdAt)
      if (!accumulator[key]) {
        accumulator[key] = []
      }
      accumulator[key].push(notification)
      return accumulator
    },
    {}
  )

  return ["Today", "Yesterday", "Older"]
    .filter((label) => grouped[label]?.length)
    .map((label) => ({
      label,
      items: grouped[label],
    }))
}

export function NotificationsPage() {
  const navigate = useNavigate()
  const { notifications, setNotifications } = useNotifications()
  const queryClient = useQueryClient()
  const [filter, setFilter] = React.useState<NotificationFilter>("all")
  const [query, setQuery] = React.useState("")
  const [pageSize, setPageSize] = React.useState<number>(pageSizeOptions[0])
  const [pageIndex, setPageIndex] = React.useState(0)
  const [pendingNotificationId, setPendingNotificationId] = React.useState<string | null>(null)
  const debouncedQuery = useDebouncedValue(query)
  const notificationsQuery = useOwnerNotificationsListQuery(true, {
    filter: filter === "all" ? undefined : filter,
    search: debouncedQuery.trim() || undefined,
    page: pageIndex + 1,
    pageSize,
  })
  const markReadMutation = useOwnerNotificationReadMutation()
  const markAllReadMutation = useOwnerNotificationsReadAllMutation()

  const serverNotifications = React.useMemo(() => {
    if (!notificationsQuery.data) return notifications

    const queryItems = (
      notificationsQuery.data as OwnerListResponse<OwnerNotificationResponse>
    ).items.map(mapOwnerNotification)

    return queryItems.map((notification) => {
      const localMatch = notifications.find((item) => item.id === notification.id)
      return localMatch ? { ...notification, read: localMatch.read } : notification
    })
  }, [notifications, notificationsQuery.data])

  const unreadCount = React.useMemo(
    () => serverNotifications.filter((item) => !item.read).length,
    [serverNotifications]
  )
  const todayCount = React.useMemo(
    () =>
      serverNotifications.filter(
        (item) => getNotificationGroupLabel(item.createdAt) === "Today"
      ).length,
    [serverNotifications]
  )
  const actionRequiredCount = React.useMemo(
    () =>
      serverNotifications.filter(
        (item) =>
          !item.read &&
          (item.type === "new-order" ||
            item.type === "payout" ||
            item.type === "support")
      ).length,
    [serverNotifications]
  )

  const filteredNotifications = serverNotifications

  React.useEffect(() => {
    setPageIndex(0)
  }, [filter, debouncedQuery, pageSize])

  const totalNotifications =
    (notificationsQuery.data as OwnerListResponse<OwnerNotificationResponse> | undefined)
      ?.total ?? filteredNotifications.length
  const pageCount = Math.max(1, Math.ceil(totalNotifications / pageSize))
  const safePageIndex = Math.min(pageIndex, pageCount - 1)
  const paginatedNotifications = filteredNotifications
  const groupedNotifications = groupNotifications(filteredNotifications)

  async function markAllRead() {
    if (unreadCount === 0) return

    const previous = notifications
    setNotifications((current) =>
      current.map((item) => ({
        ...item,
        read: true,
      }))
    )

    try {
      await markAllReadMutation.mutateAsync()
      queryClient.setQueriesData(
        { queryKey: ["owner", "notifications"] },
        (current: unknown) => {
          if (!current || typeof current !== "object" || !("items" in (current as Record<string, unknown>))) {
            return current
          }

          const result = current as OwnerListResponse<OwnerNotificationResponse>
          return {
            ...result,
            items: result.items.map((item) => ({ ...item, isRead: true })),
            unreadCount: 0,
          } satisfies OwnerListResponse<OwnerNotificationResponse>
        }
      )
      queryClient.setQueryData(
        ["owner", "sidebar-summary"],
        (current: OwnerSidebarSummaryResponse | undefined) =>
          current ? { ...current, unreadNotifications: 0 } : current
      )
    } catch {
      setNotifications(previous)
    }
  }

  async function markOneRead(id: string) {
    const target = notifications.find((item) => item.id === id)
    if (!target || target.read) return

    const previous = notifications
    setPendingNotificationId(id)
    setNotifications((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              read: true,
            }
          : item
      )
    )

    try {
      await markReadMutation.mutateAsync(id)
      queryClient.setQueriesData(
        { queryKey: ["owner", "notifications"] },
        (current: unknown) => {
          if (!current || typeof current !== "object" || !("items" in (current as Record<string, unknown>))) {
            return current
          }

          const result = current as OwnerListResponse<OwnerNotificationResponse>
          let updated = false
          const nextItems = result.items.map((item) => {
            if (item._id !== id || item.isRead) {
              return item
            }
            updated = true
            return { ...item, isRead: true }
          })

          if (!updated) {
            return current
          }

          return {
            ...result,
            items: nextItems,
            unreadCount: Math.max(0, (result.unreadCount ?? 0) - 1),
          } satisfies OwnerListResponse<OwnerNotificationResponse>
        }
      )
      queryClient.setQueryData(
        ["owner", "sidebar-summary"],
        (current: OwnerSidebarSummaryResponse | undefined) =>
          current
            ? {
                ...current,
                unreadNotifications: Math.max(
                  0,
                  current.unreadNotifications - 1
                ),
              }
            : current
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : ""
      if (!message.toLowerCase().includes("notification not found")) {
        setNotifications(previous)
      }
    } finally {
      setPendingNotificationId(null)
    }
  }

  async function handleNotificationAction(notification: AppNotification) {
    if (!notification.read) {
      await markOneRead(notification.id)
    }
    if (notification.actionPath) {
      navigate(notification.actionPath)
    }
  }

  function getFilterCount(nextFilter: NotificationFilter) {
    return serverNotifications.filter((notification) =>
      matchesNotificationFilter(notification, nextFilter)
    ).length
  }

  return (
    <div className="space-y-6 px-4 lg:px-6">
      <Card className="rounded-[28px] border-border/70 shadow-sm">
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bell className="size-4 text-muted-foreground" />
                Notifications
              </CardTitle>
              <CardDescription className="mt-1">
                Review operational updates, payouts, support replies, and system alerts from one place.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-full border bg-muted/15 px-3 py-1.5 text-sm text-muted-foreground">
                {unreadCount} unread
              </div>
              <Button
                variant="outline"
                className="rounded-2xl"
                onClick={markAllRead}
                disabled={unreadCount === 0 || markAllReadMutation.isPending}
              >
                {markAllReadMutation.isPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <CheckCheck className="size-4" />
                )}
                {markAllReadMutation.isPending ? "Marking..." : "Mark all as read"}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              {filterOptions.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={filter === option.value ? "default" : "outline"}
                  className="rounded-2xl"
                  onClick={() => setFilter(option.value)}
                >
                  {option.label}
                  <span className="ml-1.5 rounded-full bg-background/60 px-1.5 py-0.5 text-[10px] font-semibold text-current">
                    {getFilterCount(option.value)}
                  </span>
                </Button>
              ))}
            </div>

            <div className="relative w-full xl:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search notifications"
                className="h-11 rounded-2xl pl-10"
              />
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-[24px] border-border/70 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Unread Notifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{unreadCount}</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Items that still need attention.
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-border/70 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Today&apos;s Updates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{todayCount}</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Notifications received today.
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-border/70 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ShieldAlert className="size-4" />
              Action Required
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{actionRequiredCount}</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Orders, payouts, and support replies waiting on you.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[28px] border-border/70 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">All Updates</CardTitle>
              <CardDescription>
              Showing {paginatedNotifications.length} of {totalNotifications} notification(s)
            </CardDescription>
          </div>
          <div className="text-sm text-muted-foreground">
            Page {safePageIndex + 1} of {pageCount}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {groupedNotifications.length > 0 ? (
            groupedNotifications.map((group) => (
              <section key={group.label} className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {group.label === "Today" ? (
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-500">
                      <span className="absolute inset-0 animate-ping rounded-full bg-sky-500 opacity-75" />
                    </span>
                  ) : null}
                  {group.label}
                </div>

                <div className="space-y-3">
                  {group.items.map((notification) => {
                    const Icon = getNotificationIcon(notification.type)

                    return (
                      <div
                        key={notification.id}
                        className={cn(
                          "rounded-[24px] border p-4 transition hover:bg-muted/20",
                          !notification.read && "border-primary/20 bg-primary/[0.03]"
                        )}
                      >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                          <div
                            className={cn(
                              "inline-flex size-11 shrink-0 items-center justify-center rounded-2xl",
                              getNotificationTone(notification.type)
                            )}
                          >
                            <Icon className="size-5" />
                          </div>

                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-medium">{notification.title}</h3>
                              <Badge variant="outline" className="rounded-full">
                                {getNotificationTypeLabel(notification.type)}
                              </Badge>
                              {!notification.read ? (
                                <Badge className="rounded-full bg-sky-500 text-white hover:bg-sky-500">
                                  Unread
                                </Badge>
                              ) : null}
                            </div>
                            <p className="text-sm leading-6 text-muted-foreground">
                              {notification.description}
                            </p>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                              <span className="rounded-full border bg-muted/15 px-2 py-1">
                                {notification.read ? "Read" : "Unread"}
                              </span>
                              <span>{formatNotificationTimestamp(notification.createdAt)}</span>
                              <span>{formatNotificationRelativeTime(notification.createdAt)}</span>
                            </div>
                          </div>

                          <div className="flex shrink-0 flex-wrap gap-2">
                            {!notification.read ? (
                              <Button
                                variant="outline"
                                className="rounded-2xl"
                                onClick={() => markOneRead(notification.id)}
                                disabled={pendingNotificationId === notification.id}
                              >
                                {pendingNotificationId === notification.id ? (
                                  <>
                                    <LoaderCircle className="size-4 animate-spin" />
                                    Marking...
                                  </>
                                ) : (
                                  "Mark as read"
                                )}
                              </Button>
                            ) : null}
                            <Button
                              className="rounded-2xl"
                              onClick={() => handleNotificationAction(notification)}
                              disabled={!notification.actionPath}
                            >
                              View details
                            </Button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            ))
          ) : totalNotifications === 0 ? (
            <Empty className="rounded-2xl">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Bell />
                </EmptyMedia>
                <EmptyTitle>No notifications yet</EmptyTitle>
                <EmptyDescription>
                  Important order, payout, support, and system updates will appear here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Empty className="rounded-2xl">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Search />
                </EmptyMedia>
                <EmptyTitle>No notifications match these filters</EmptyTitle>
                <EmptyDescription>
                  Try another keyword or switch back to a broader filter.
                </EmptyDescription>
              </EmptyHeader>
              <Button
                variant="outline"
                className="rounded-2xl"
                onClick={() => {
                  setFilter("all")
                  setQuery("")
                }}
              >
                Reset filters
              </Button>
            </Empty>
          )}

          <div className="flex flex-col gap-4 border-t pt-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {paginatedNotifications.length} of {totalNotifications} notification(s)
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Select
                value={`${pageSize}`}
                onValueChange={(value) => setPageSize(Number(value))}
              >
                <SelectTrigger className="w-full sm:w-32">
                  <SelectValue placeholder="Rows" />
                </SelectTrigger>
                <SelectContent side="top">
                  {pageSizeOptions.map((size) => (
                    <SelectItem key={size} value={`${size}`}>
                      {size} / page
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-sm font-medium">
                Page {safePageIndex + 1} of {pageCount}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setPageIndex((current) => Math.max(0, current - 1))
                  }
                  disabled={safePageIndex === 0}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setPageIndex((current) =>
                      Math.min(pageCount - 1, current + 1)
                    )
                  }
                  disabled={safePageIndex >= pageCount - 1}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
