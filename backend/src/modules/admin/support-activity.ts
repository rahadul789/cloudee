export function getSupportActivity(item: Record<string, any>, now = new Date()) {
  const replies = Array.isArray(item.replies) ? item.replies : []
  const time = (value: unknown) => value ? new Date(String(value)).getTime() || 0 : 0
  let customerAt = Math.max(time(item.lastCustomerMessageAt), item.source === "customer" && !item.openedByAdmin ? time(item.createdAt) : 0)
  let adminAt = Math.max(time(item.lastAdminMessageAt), item.openedByAdmin ? time(item.createdAt) : 0)
  for (const reply of replies) {
    if (reply.senderType === "customer") customerAt = Math.max(customerAt, time(reply.createdAt))
    else adminAt = Math.max(adminAt, time(reply.createdAt))
  }
  const day = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const today = { start: new Date(`${day}T00:00:00+06:00`), end: new Date(`${day}T23:59:59.999+06:00`) }
  const needsReply = customerAt > adminAt && !["resolved", "closed"].includes(item.status)
  return { needsReply, isNewToday: needsReply && customerAt >= today.start.getTime() && customerAt <= today.end.getTime(), lastCustomerMessageAt: customerAt ? new Date(customerAt).toISOString() : null }
}
