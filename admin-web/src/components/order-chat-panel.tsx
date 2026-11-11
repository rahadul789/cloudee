import * as React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { MessagesSquare } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getAdminOrderChat, type AdminOrderChat } from "@/lib/admin-api"
import {
  connectAdminSocket,
  joinAdminSocketScope,
  leaveAdminSocketScope,
} from "@/lib/socket-client"

function formatTime(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

// Read-only audit of the rider ↔ customer chat on an order (for complaints / disputes).
// Live: new messages arrive over the "order-chat" admin socket scope.
export function OrderChatPanel({ orderId }: { orderId: string }) {
  const queryClient = useQueryClient()
  const chatQuery = useQuery({
    queryKey: ["admin-order-chat", orderId],
    queryFn: () => getAdminOrderChat(orderId),
    enabled: Boolean(orderId),
  })

  React.useEffect(() => {
    if (!orderId) return
    const socket = connectAdminSocket()
    joinAdminSocketScope("order-chat")
    const handleMessage = (event: { orderId?: string }) => {
      if (event?.orderId === orderId) {
        void queryClient.invalidateQueries({ queryKey: ["admin-order-chat", orderId] })
      }
    }
    socket.on("admin.order-chat.message", handleMessage)
    return () => {
      socket.off("admin.order-chat.message", handleMessage)
      leaveAdminSocketScope("order-chat")
    }
  }, [orderId, queryClient])

  const chat: AdminOrderChat | undefined = chatQuery.data
  const messages = chat?.messages ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessagesSquare className="size-4" />
          Rider ↔ customer chat
          <Badge variant="secondary">{messages.length}</Badge>
        </CardTitle>
        <CardDescription>
          Read-only. Open while a rider is assigned; closes when the order finishes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {chatQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading chat…</p>
        ) : chatQuery.isError ? (
          <p className="text-sm text-destructive">Could not load the chat.</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No messages on this order.</p>
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {messages.map((message) => {
              const fromRider = message.senderRole === "rider"
              return (
                <div
                  key={message.id}
                  className={`flex ${fromRider ? "justify-start" : "justify-end"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                      fromRider
                        ? "rounded-bl-md bg-slate-100 text-slate-900"
                        : "rounded-br-md bg-amber-100 text-slate-900"
                    }`}
                  >
                    <div className="mb-0.5 text-[11px] font-semibold text-muted-foreground">
                      {fromRider ? chat?.riderName || "Rider" : chat?.customerName || "Customer"}
                    </div>
                    <div className="whitespace-pre-wrap break-words">{message.text}</div>
                    <div className="mt-1 text-right text-[10px] text-muted-foreground">
                      {formatTime(message.createdAt)}
                      {message.readAt ? " · read" : ""}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
