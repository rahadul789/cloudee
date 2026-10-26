import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { adminRequest } from "@/lib/api"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"

type Slot = { startTime: string; endTime: string }
type Day = { day: string; isOpen: boolean; is24Hours?: boolean; timeSlots: Slot[] }
type Hours = { automationMode?: "auto" | "manual"; adminPaused?: boolean; weeklySchedule: Day[] }
type Result = { hours: Hours | null; history: { _id: string; isOnline: boolean; reason: string; createdAt: string }[] }
const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

export function RestaurantHoursDialog({ restaurantId, onClose }: { restaurantId: string; onClose: () => void }) {
  const client = useQueryClient()
  const query = useQuery({ queryKey: ["admin-restaurant-hours", restaurantId], enabled: Boolean(restaurantId),
    queryFn: async () => (await adminRequest<Result>(`/admin/restaurants/${restaurantId}/opening-hours`)).data })
  const [draft, setDraft] = React.useState<Hours>({ automationMode: "manual", weeklySchedule: [] })
  React.useEffect(() => {
    if (!query.data) return
    const hours = query.data.hours
    setDraft({ automationMode: hours?.automationMode ?? "manual", adminPaused: hours?.adminPaused,
      weeklySchedule: weekdays.map((day) => hours?.weeklySchedule.find((d) => d.day === day) ?? { day, isOpen: false, timeSlots: [] }) })
  }, [query.data])
  const save = useMutation({ mutationFn: async () => adminRequest(`/admin/restaurants/${restaurantId}/opening-hours`, {
    method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ automationMode: draft.automationMode, weeklySchedule: draft.weeklySchedule }),
  }), onSuccess: () => {
    void client.invalidateQueries({ queryKey: ["admin-restaurants"] })
    void client.invalidateQueries({ queryKey: ["admin-restaurant-hours", restaurantId] })
    toast.success("Opening hours saved")
    onClose()
  }, onError: (error) => toast.error(error.message) })
  const updateDay = (index: number, update: Partial<Day>) => setDraft((current) => ({ ...current,
    weeklySchedule: current.weeklySchedule.map((day, i) => i === index ? { ...day, ...update } : day) }))
  return <Dialog open={Boolean(restaurantId)} onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>Restaurant opening hours</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">All times follow Asia/Dhaka. Automatic mode follows the intersection of restaurant and Foodbela service hours. Existing special-date exceptions remain in effect.</p>
      {query.isPending ? <p>Loading opening hours…</p> : query.isError ? <p role="alert">{query.error.message}</p> : <>
        {draft.adminPaused ? <p className="text-sm text-amber-700">An admin has paused this restaurant. Use Set online in the restaurant actions to release that hold. Owner pauses and service hours still apply.</p> : null}
        <label className="flex items-center justify-between gap-4 text-sm font-medium">Automatic opening and closing
          <Switch checked={draft.automationMode === "auto"} disabled={save.isPending}
            onCheckedChange={(checked) => setDraft((v) => ({ ...v, automationMode: checked ? "auto" : "manual" }))} />
        </label>
        {draft.weeklySchedule.map((day, index) => <div key={day.day} className="space-y-2 rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-24 text-sm font-medium capitalize">{day.day}</span>
            <label className="flex items-center gap-2 text-sm"><Switch checked={day.isOpen} disabled={save.isPending}
              onCheckedChange={(isOpen) => updateDay(index, { isOpen, timeSlots: day.timeSlots.length ? day.timeSlots : [{ startTime: "14:00", endTime: "21:30" }] })} />Open</label>
            {day.isOpen ? <label className="flex items-center gap-2 text-sm"><Switch checked={Boolean(day.is24Hours)} disabled={save.isPending}
              onCheckedChange={(is24Hours) => updateDay(index, { is24Hours })} />24 hours</label> : null}
          </div>
          {day.isOpen && !day.is24Hours ? <>
            {day.timeSlots.map((slot, slotIndex) => <div key={slotIndex} className="flex items-center gap-2">
              <Input aria-label={`${day.day} opening ${slotIndex + 1}`} type="time" value={slot.startTime} disabled={save.isPending}
                onChange={(e) => updateDay(index, { timeSlots: day.timeSlots.map((s, i) => i === slotIndex ? { ...s, startTime: e.target.value } : s) })} />
              <Input aria-label={`${day.day} closing ${slotIndex + 1}`} type="time" value={slot.endTime} disabled={save.isPending}
                onChange={(e) => updateDay(index, { timeSlots: day.timeSlots.map((s, i) => i === slotIndex ? { ...s, endTime: e.target.value } : s) })} />
              <Button variant="outline" disabled={save.isPending || day.timeSlots.length === 1}
                onClick={() => updateDay(index, { timeSlots: day.timeSlots.filter((_, i) => i !== slotIndex) })}>Remove</Button>
            </div>)}
            <Button variant="outline" disabled={save.isPending || day.timeSlots.length >= 12}
              onClick={() => updateDay(index, { timeSlots: [...day.timeSlots, { startTime: "17:00", endTime: "22:00" }] })}>Add shift</Button>
          </> : null}
        </div>)}
        <p className="text-xs text-muted-foreground">A closing time before the opening time ends on the following day. Matching times mean a 24-hour shift.</p>
        <Button disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save opening hours"}</Button>
        <div className="space-y-2 text-sm"><p className="font-medium">Recent automatic status changes</p>
          {query.data?.history.slice(0, 10).map((event) => <p key={event._id}>{new Date(event.createdAt).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })} — {event.isOnline ? "Online" : "Offline"} ({event.reason})</p>)}
          {!query.data?.history.length ? <p className="text-muted-foreground">No automatic changes recorded yet.</p> : null}
        </div>
      </>}
    </DialogContent>
  </Dialog>
}
