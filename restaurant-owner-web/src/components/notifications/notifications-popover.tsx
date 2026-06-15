import * as React from "react"
import { Bell, LoaderCircle } from "lucide-react"
import { useNavigate } from "react-router-dom"

import { useNotifications } from "@/components/notifications/notifications-context"
import type { AppNotification } from "@/components/notifications/types"
import {
  formatNotificationRelativeTime,
  getNotificationIcon,
  getNotificationTone,
} from "@/components/notifications/utils"
import {
  useOwnerNotificationReadMutation,
  useOwnerNotificationsReadAllMutation,
} from "@/hooks/use-owner-api"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"

export function NotificationsPopover() {
  const { notifications, setNotifications } = useNotifications()
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = React.useState(false)
  const markReadMutation = useOwnerNotificationReadMutation()
  const markAllReadMutation = useOwnerNotificationsReadAllMutation()
  const [pendingNotificationId, setPendingNotificationId] = React.useState<string | null>(null)
  const unreadNotifications = notifications.filter((item) => !item.read)
  const readNotifications = notifications.filter((item) => item.read)

  async function markAllRead() {
    if (unreadNotifications.length === 0) return
    const previous = notifications
    setNotifications((current) =>
      current.map((item) => ({
        ...item,
        read: true,
      }))
    )

    try {
      await markAllReadMutation.mutateAsync()
    } catch {
      setNotifications(previous)
    }
  }

  async function markOneRead(id: string) {
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
    } catch {
      setNotifications(previous)
    } finally {
      setPendingNotificationId(null)
    }
  }

  function handleNotificationClick(notification: AppNotification) {
    markOneRead(notification.id)
    setIsOpen(false)
    if (notification.actionPath) {
      navigate(notification.actionPath)
    }
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button className="relative flex h-9 w-9 items-center justify-center rounded-full border transition hover:bg-muted">
          <Bell className="h-4 w-4" />
          {unreadNotifications.length > 0 ? (
            <span className="absolute -top-1 -right-1 inline-flex min-w-4 items-center justify-center rounded-full bg-sky-500 px-1 text-[10px] font-semibold text-white">
              {unreadNotifications.length > 9 ? "9+" : unreadNotifications.length}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="border-b px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-medium">Notifications</div>
              <div className="text-xs text-muted-foreground">
                {unreadNotifications.length} unread
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllRead}
              disabled={unreadNotifications.length === 0 || markAllReadMutation.isPending}
            >
              {markAllReadMutation.isPending ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  Marking...
                </>
              ) : (
                "Read all"
              )}
            </Button>
          </div>
        </div>

        <ScrollArea className="h-[360px]">
          <div className="space-y-5 p-4">
            {unreadNotifications.length > 0 ? (
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-500">
                    <span className="absolute inset-0 animate-ping rounded-full bg-sky-500 opacity-75" />
                  </span>
                  Unread
                </div>
                <div className="space-y-2">
                  {unreadNotifications.map((notification) => {
                    const Icon = getNotificationIcon(notification.type)
                    return (
                      <button
                        key={notification.id}
                        type="button"
                        onClick={() => handleNotificationClick(notification)}
                        disabled={pendingNotificationId === notification.id}
                        className="flex w-full items-start gap-3 rounded-2xl border bg-muted/20 p-3 text-left transition hover:bg-muted/50"
                      >
                        <div
                          className={`inline-flex size-10 shrink-0 items-center justify-center rounded-xl ${getNotificationTone(
                            notification.type
                          )}`}
                        >
                          <Icon className="size-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-medium">{notification.title}</div>
                            {pendingNotificationId === notification.id ? (
                              <LoaderCircle className="mt-0.5 size-3.5 animate-spin text-sky-500" />
                            ) : (
                              <span className="mt-1 h-2 w-2 rounded-full bg-sky-500" />
                            )}
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            {notification.description}
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            {formatNotificationRelativeTime(notification.createdAt)}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>
            ) : null}

            <section className="space-y-3">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Earlier
              </div>
              <div className="space-y-2">
                {readNotifications.length > 0 ? (
                  readNotifications.map((notification) => {
                    const Icon = getNotificationIcon(notification.type)
                    return (
                      <button
                        key={notification.id}
                        type="button"
                        onClick={() => handleNotificationClick(notification)}
                        className="flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition hover:bg-muted/30"
                      >
                        <div
                          className={`inline-flex size-10 shrink-0 items-center justify-center rounded-xl ${getNotificationTone(
                            notification.type
                          )}`}
                        >
                          <Icon className="size-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{notification.title}</div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            {notification.description}
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            {formatNotificationRelativeTime(notification.createdAt)}
                          </div>
                        </div>
                      </button>
                    )
                  })
                ) : (
                  <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                    No earlier notifications yet.
                  </div>
                )}
              </div>
            </section>
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
