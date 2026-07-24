import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"

import { format } from "date-fns"
import {
  AlarmClockCheck,
  CalendarDays,
  Clock3,
  Globe2,
  LoaderCircle,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react"

import { useOpeningHours } from "@/components/hours/opening-hours-context"
import { useRestaurantStatus } from "@/components/restaurant-status-context"
import {
  createException,
  createTimeSlot,
  type DaySchedule,
  type OpeningHoursSettings,
  type ScheduleException,
  type TimeSlot,
  weekdayLabels,
  weekdayOrder,
  type Weekday,
} from "@/components/hours/types"
import { mapOwnerOpeningHours } from "@/lib/backend-mappers"
import { useUpdateOwnerOpeningHoursMutation } from "@/hooks/use-owner-api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"

type ValidationResult = {
  valid: boolean
  messages: string[]
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number)
  return hour * 60 + minute
}

function formatTime(value: string) {
  if (!value) return "--"
  const [hour, minute] = value.split(":").map(Number)
  const normalizedHour = ((hour + 11) % 12) + 1
  const meridiem = hour >= 12 ? "PM" : "AM"
  return `${normalizedHour}:${String(minute).padStart(2, "0")} ${meridiem}`
}

function formatSafeDate(value: string, pattern: string, fallback = "--") {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return fallback
  return format(parsed, pattern)
}

function slotEndMinutes(slot: TimeSlot) {
  const start = timeToMinutes(slot.startTime)
  const end = timeToMinutes(slot.endTime)
  return end <= start ? end + 24 * 60 : end
}

function validateSlots(slots: TimeSlot[]) {
  const messages: string[] = []

  if (slots.length === 0) {
    messages.push("Add at least one time slot for open days.")
    return { valid: false, messages }
  }

  const seen = new Set<string>()
  const normalized = slots.map((slot) => ({
    ...slot,
    start: timeToMinutes(slot.startTime),
    end: slotEndMinutes(slot),
  }))

  for (const slot of normalized) {
    if (!slot.startTime || !slot.endTime) {
      messages.push("All time slots need both opening and closing time.")
      continue
    }

    const duplicateKey = `${slot.startTime}-${slot.endTime}`
    if (seen.has(duplicateKey)) {
      messages.push("Duplicate time slots are not allowed.")
    }
    seen.add(duplicateKey)
  }

  const sorted = [...normalized].sort((left, right) => left.start - right.start)
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].start < sorted[index - 1].end) {
      messages.push("Time slots cannot overlap.")
      break
    }
  }

  return {
    valid: messages.length === 0,
    messages: Array.from(new Set(messages)),
  }
}

function validateDay(day: DaySchedule): ValidationResult {
  if (!day.isOpen || day.is24Hours) {
    return { valid: true, messages: [] }
  }
  return validateSlots(day.timeSlots)
}

function validateException(
  exception: ScheduleException,
  allExceptions: ScheduleException[]
): ValidationResult {
  const messages: string[] = []

  if (!exception.date) {
    messages.push("Choose a date for the exception.")
  }

  if (
    exception.date &&
    allExceptions.some(
      (entry) => entry.id !== exception.id && entry.date === exception.date
    )
  ) {
    messages.push("An exception already exists for this date.")
  }

  if (exception.isOpen && !exception.is24Hours) {
    const slotValidation = validateSlots(exception.timeSlots)
    messages.push(...slotValidation.messages)
  }

  return {
    valid: messages.length === 0,
    messages: Array.from(new Set(messages)),
  }
}

function getZonedParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  )

  return {
    weekday: parts.weekday.toLowerCase() as Weekday,
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  }
}

function getStatusSummary(settings: OpeningHoursSettings) {
  const now = new Date()
  const zoned = getZonedParts(now, settings.timezone)
  const currentMinutes = zoned.hour * 60 + zoned.minute
  const todayException = settings.exceptions.find(
    (exception) => exception.date === zoned.dateKey
  )

  const source =
    todayException ??
    settings.weeklySchedule.find((day) => day.day === zoned.weekday) ??
    null

  if (!source || !source.isOpen) {
    return {
      tone: "closed" as const,
      title: "Closed now",
      subtitle: "No opening slots configured for the current day.",
    }
  }

  if (source.is24Hours) {
    return {
      tone: "open" as const,
      title: "Open now",
      subtitle: "Open 24 hours today.",
    }
  }

  const sortedSlots = [...source.timeSlots].sort(
    (left, right) => timeToMinutes(left.startTime) - timeToMinutes(right.startTime)
  )

  for (const slot of sortedSlots) {
    const start = timeToMinutes(slot.startTime)
    const end = slotEndMinutes(slot)
    const effectiveMinutes =
      timeToMinutes(slot.endTime) <= start && currentMinutes < start
        ? currentMinutes + 24 * 60
        : currentMinutes

    if (effectiveMinutes >= start && effectiveMinutes < end) {
      return {
        tone: "open" as const,
        title: "Open now",
        subtitle: `Closes at ${formatTime(slot.endTime)}${
          timeToMinutes(slot.endTime) <= timeToMinutes(slot.startTime)
            ? " next day"
            : ""
        }`,
      }
    }

    if (currentMinutes < start) {
      return {
        tone: "closed" as const,
        title: "Closed now",
        subtitle: `Opens today at ${formatTime(slot.startTime)}`,
      }
    }
  }

  return {
    tone: "closed" as const,
    title: "Closed now",
    subtitle: "No more opening slots left for today.",
  }
}

function HoursPageSkeleton() {
  return (
    <div className="space-y-4 px-4 lg:px-6">
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-32 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-24 rounded-2xl" />
      <Skeleton className="h-[520px] rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  )
}

function TimeSlotRow({
  slot,
  disabled,
  onChange,
  onRemove,
}: {
  slot: TimeSlot
  disabled: boolean
  onChange: (slot: TimeSlot) => void
  onRemove: () => void
}) {
  return (
    <div className="grid gap-3 rounded-xl border bg-muted/20 p-3 md:grid-cols-[1fr_1fr_auto]">
      <Input
        type="time"
        value={slot.startTime}
        disabled={disabled}
        onChange={(event) => onChange({ ...slot, startTime: event.target.value })}
      />
      <Input
        type="time"
        value={slot.endTime}
        disabled={disabled}
        onChange={(event) => onChange({ ...slot, endTime: event.target.value })}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        disabled={disabled}
        onClick={onRemove}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  )
}

function ExceptionDrawer({
  open,
  onOpenChange,
  initialValue,
  existing,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialValue: ScheduleException | null
  existing: ScheduleException[]
  onSave: (exception: ScheduleException) => void
}) {
  const [draft, setDraft] = React.useState<ScheduleException>(createException())

  React.useEffect(() => {
    if (open) {
      setDraft(initialValue ?? createException())
    }
  }, [initialValue, open])

  const validation = React.useMemo(
    () => validateException(draft, existing),
    [draft, existing]
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full max-w-none p-0 sm:max-w-xl"
      >
        <SheetHeader className="sticky top-0 z-10 border-b bg-popover px-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SheetTitle className="flex items-center gap-2">
                <CalendarDays className="size-4 text-muted-foreground" />
                {initialValue ? "Edit Special Day" : "Add Special Day"}
              </SheetTitle>
              <SheetDescription>
                Override your regular schedule for a holiday or one-off event.
              </SheetDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
              <X className="size-4" />
            </Button>
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Date</label>
              <Input
                type="date"
                value={draft.date}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, date: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Label</label>
              <Input
                value={draft.label ?? ""}
                placeholder="Holiday, event, maintenance"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, label: event.target.value }))
                }
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 rounded-xl border bg-muted/20 px-4 py-3">
            <div className="flex items-center gap-3">
              <Switch
                checked={draft.isOpen}
                onCheckedChange={(checked) =>
                  setDraft((current) => ({
                    ...current,
                    isOpen: checked,
                    timeSlots: checked
                      ? current.timeSlots.length > 0
                        ? current.timeSlots
                        : [createTimeSlot()]
                      : [],
                  }))
                }
              />
              <div>
                <div className="font-medium">Open on this date</div>
                <div className="text-sm text-muted-foreground">
                  Turn off to mark the restaurant closed.
                </div>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={draft.is24Hours}
                disabled={!draft.isOpen}
                onCheckedChange={(checked) =>
                  setDraft((current) => ({
                    ...current,
                    is24Hours: !!checked,
                  }))
                }
              />
              Open 24 hours
            </label>
          </div>

          {draft.isOpen && !draft.is24Hours ? (
            <div className="space-y-3">
              {draft.timeSlots.map((slot) => (
                <TimeSlotRow
                  key={slot.id}
                  slot={slot}
                  disabled={false}
                  onChange={(nextSlot) =>
                    setDraft((current) => ({
                      ...current,
                      timeSlots: current.timeSlots.map((entry) =>
                        entry.id === slot.id ? nextSlot : entry
                      ),
                    }))
                  }
                  onRemove={() =>
                    setDraft((current) => ({
                      ...current,
                      timeSlots: current.timeSlots.filter(
                        (entry) => entry.id !== slot.id
                      ),
                    }))
                  }
                />
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    timeSlots: [...current.timeSlots, createTimeSlot()],
                  }))
                }
              >
                <Plus className="size-4" />
                Add Slot
              </Button>
            </div>
          ) : null}

          <div className="space-y-2">
            <label className="text-sm font-medium">Note</label>
            <Textarea
              value={draft.note ?? ""}
              placeholder="Optional internal note"
              onChange={(event) =>
                setDraft((current) => ({ ...current, note: event.target.value }))
              }
            />
          </div>

          {validation.messages.length > 0 ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {validation.messages.join(" ")}
            </div>
          ) : null}
        </div>

        <SheetFooter className="border-t bg-popover px-6 py-4">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!validation.valid) return
                onSave(draft)
                onOpenChange(false)
              }}
              disabled={!validation.valid}
            >
              Save Exception
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

export function OpeningHoursPage() {
  const { openingHours, setOpeningHours, isLoading } = useOpeningHours()
  const { isOnline, setIsOnline, isUpdating } = useRestaurantStatus()
  const queryClient = useQueryClient()
  const [draft, setDraft] = React.useState(openingHours)
  const [saved, setSaved] = React.useState(openingHours)
  const [successMessage, setSuccessMessage] = React.useState("")
  const [editingException, setEditingException] =
    React.useState<ScheduleException | null>(null)
  const [isExceptionOpen, setIsExceptionOpen] = React.useState(false)
  const updateOpeningHoursMutation = useUpdateOwnerOpeningHoursMutation()
  const isSaving = updateOpeningHoursMutation.isPending

  React.useEffect(() => {
    setDraft(openingHours)
    setSaved(openingHours)
  }, [openingHours])

  const dayValidation = React.useMemo(
    () =>
      Object.fromEntries(
        draft.weeklySchedule.map((day) => [day.day, validateDay(day)])
      ) as Record<Weekday, ValidationResult>,
    [draft.weeklySchedule]
  )

  const exceptionValidation = React.useMemo(
    () =>
      Object.fromEntries(
        draft.exceptions.map((entry) => [
          entry.id,
          validateException(entry, draft.exceptions),
        ])
      ) as Record<string, ValidationResult>,
    [draft.exceptions]
  )

  const hasErrors =
    Object.values(dayValidation).some((result) => !result.valid) ||
    Object.values(exceptionValidation).some((result) => !result.valid)

  const isDirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const statusSummary = React.useMemo(() => getStatusSummary(draft), [draft])

  function updateDay(dayKey: Weekday, updater: (day: DaySchedule) => DaySchedule) {
    setDraft((current) => ({
      ...current,
      weeklySchedule: current.weeklySchedule.map((day) =>
        day.day === dayKey ? updater(day) : day
      ),
    }))
  }

  if (isLoading) {
    return <HoursPageSkeleton />
  }

  return (
    <div className="space-y-4 px-4 lg:px-6">
      <ExceptionDrawer
        open={isExceptionOpen}
        onOpenChange={setIsExceptionOpen}
        initialValue={editingException}
        existing={draft.exceptions}
        onSave={(exception) =>
          setDraft((current) => ({
            ...current,
            exceptions: current.exceptions.some((entry) => entry.id === exception.id)
              ? current.exceptions.map((entry) =>
                  entry.id === exception.id ? exception : entry
                )
              : [exception, ...current.exceptions],
          }))
        }
      />

      {successMessage ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {successMessage}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-2xl shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlarmClockCheck className="size-4 text-muted-foreground" />
              Current Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Badge
                className={
                  statusSummary.tone === "open"
                    ? "bg-emerald-600 text-white hover:bg-emerald-600"
                    : "bg-slate-900 text-white hover:bg-slate-900"
                }
              >
                {statusSummary.title}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {statusSummary.subtitle}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe2 className="size-4 text-muted-foreground" />
              Timezone
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="font-medium">{draft.timezone}</div>
            <p className="text-sm text-muted-foreground">
              All opening hours and special day overrides follow this timezone.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock3 className="size-4 text-muted-foreground" />
            Live Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 rounded-xl border bg-muted/20 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <Switch
                checked={isOnline}
                onCheckedChange={setIsOnline}
                disabled={isUpdating}
              />
              <div>
                <div className="font-medium">Restaurant online status</div>
                <div className="text-sm text-muted-foreground">
                  Turn this off anytime to stop incoming orders instantly.
                </div>
              </div>
            </div>
            <Badge
              variant="outline"
              className={
                isOnline
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-slate-100 text-slate-700"
              }
            >
              {isOnline ? "Online" : "Offline"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock3 className="size-4 text-muted-foreground" />
            Weekly Schedule
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {weekdayOrder.map((dayKey) => {
            const day = draft.weeklySchedule.find((entry) => entry.day === dayKey)!
            const validation = dayValidation[day.day]
            const primarySlot = day.timeSlots[0] ?? createTimeSlot("10:00", "23:00")
            const closesNextDay =
              timeToMinutes(primarySlot.endTime) <=
              timeToMinutes(primarySlot.startTime)
            const slotSummary = !day.isOpen
              ? "Closed"
              : `${formatTime(primarySlot.startTime)} - ${formatTime(
                  primarySlot.endTime
                )}${closesNextDay ? " next day" : ""}`

            return (
              <div
                key={day.day}
                className="rounded-2xl border bg-muted/10 p-4 transition-colors"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-44 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="font-medium">{weekdayLabels[day.day]}</div>
                      <Badge
                        variant="outline"
                        className={
                          day.isOpen
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-slate-100 text-slate-700"
                        }
                      >
                        {day.isOpen ? "Open" : "Closed"}
                      </Badge>
                      {day.isOpen && closesNextDay ? (
                        <Badge
                          variant="outline"
                          className="border-sky-200 bg-sky-50 text-sky-700"
                        >
                          Next day
                        </Badge>
                      ) : null}
                    </div>
                    <div className="text-sm text-muted-foreground">{slotSummary}</div>
                  </div>

                  <div className="flex flex-1 flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-6 rounded-xl border bg-background px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={day.isOpen}
                          onCheckedChange={(checked) =>
                            updateDay(day.day, (current) => ({
                              ...current,
                              isOpen: checked,
                              timeSlots:
                                checked
                                  ? [
                                      current.timeSlots[0] ??
                                        createTimeSlot("10:00", "23:00"),
                                    ]
                                  : [],
                            }))
                          }
                        />
                        <span className="text-sm font-medium">
                          {day.isOpen ? "Open" : "Closed"}
                        </span>
                      </div>
                    </div>

                    {day.isOpen ? (
                      <div className="grid gap-3 rounded-xl border bg-background p-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Opens At
                          </label>
                          <Input
                            type="time"
                            value={primarySlot.startTime}
                            onChange={(event) =>
                              updateDay(day.day, (current) => ({
                                ...current,
                                timeSlots: [
                                  {
                                    ...primarySlot,
                                    startTime: event.target.value,
                                  },
                                ],
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Closes At
                          </label>
                          <Input
                            type="time"
                            value={primarySlot.endTime}
                            onChange={(event) =>
                              updateDay(day.day, (current) => ({
                                ...current,
                                timeSlots: [
                                  {
                                    ...primarySlot,
                                    endTime: event.target.value,
                                  },
                                ],
                              }))
                            }
                          />
                        </div>
                      </div>
                    ) : null}

                    {!validation.valid ? (
                      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        {validation.messages.join(" ")}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="size-4 text-muted-foreground" />
            Special Days & Exceptions
          </CardTitle>
          <Button
            onClick={() => {
              setEditingException(null)
              setIsExceptionOpen(true)
            }}
          >
            <Plus className="size-4" />
            Add Exception
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {draft.exceptions.length > 0 ? (
            draft.exceptions
              .slice()
              .sort((left, right) => left.date.localeCompare(right.date))
              .map((exception) => {
                const validation = exceptionValidation[exception.id]
                return (
                  <div
                    key={exception.id}
                    className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">
                          {formatSafeDate(exception.date, "dd MMM yyyy")}
                        </span>
                        {exception.label ? (
                          <Badge variant="secondary">{exception.label}</Badge>
                        ) : null}
                        <Badge
                          variant="outline"
                          className={
                            exception.isOpen
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 bg-slate-100 text-slate-700"
                          }
                        >
                          {exception.isOpen
                            ? exception.is24Hours
                              ? "Open 24 hours"
                              : "Open"
                            : "Closed"}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {exception.isOpen && !exception.is24Hours
                          ? exception.timeSlots
                              .map(
                                (slot) =>
                                  `${formatTime(slot.startTime)} - ${formatTime(
                                    slot.endTime
                                )}${
                                  timeToMinutes(slot.endTime) <=
                                  timeToMinutes(slot.startTime)
                                    ? " next day"
                                    : ""
                                }`
                              )
                              .join(", ")
                          : exception.is24Hours
                            ? "Always open for this date"
                            : "No service on this date"}
                      </div>
                      {!validation.valid ? (
                        <div className="text-sm text-rose-700">
                          {validation.messages.join(" ")}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditingException(exception)
                          setIsExceptionOpen(true)
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            exceptions: current.exceptions.filter(
                              (entry) => entry.id !== exception.id
                            ),
                          }))
                        }
                      >
                        <Trash2 className="size-4" />
                        Delete
                      </Button>
                    </div>
                  </div>
                )
              })
          ) : (
            <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              No special days added yet. Use exceptions for holidays, events, or custom operating hours.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="sticky bottom-0 z-10 rounded-2xl border bg-background/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {hasErrors
              ? "Resolve schedule errors before saving."
              : isDirty
              ? "You have unsaved schedule changes."
                : `Last updated ${formatSafeDate(saved.updatedAt, "dd MMM yyyy, hh:mm a")}`}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => {
                setDraft(saved)
                setSuccessMessage("")
              }}
              disabled={!isDirty || isSaving}
            >
              <RotateCcw className="size-4" />
              Reset
            </Button>
            <Button
              disabled={!isDirty || hasErrors || isSaving}
              onClick={async () => {
                try {
                  const updated = await updateOpeningHoursMutation.mutateAsync({
                    timezone: draft.timezone,
                    weeklySchedule: draft.weeklySchedule,
                    exceptions: draft.exceptions,
                    temporaryClosure: draft.temporaryClosure,
                  })
                  const mapped = mapOwnerOpeningHours(updated, draft)
                  queryClient.setQueryData(["owner", "opening-hours"], updated)
                  setSaved(mapped)
                  setDraft(mapped)
                  setOpeningHours(mapped)
                  setSuccessMessage("Opening hours updated successfully.")
                  window.setTimeout(() => setSuccessMessage(""), 2500)
                } catch (error) {
                  const message =
                    error instanceof Error ? error.message : "Unable to save hours."
                  toast.error("Save failed", { description: message })
                }
              }}
            >
              {isSaving ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
