import * as React from "react"
import { format } from "date-fns"
import { CalendarDays } from "lucide-react"
import type { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const ADMIN_TIME_PRESET_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last7Days", label: "Last 7 days" },
  { value: "last30Days", label: "Last 30 days" },
  { value: "last90Days", label: "Last 90 days" },
  { value: "thisMonth", label: "This month" },
  { value: "lastMonth", label: "Last month" },
  { value: "lifetime", label: "Lifetime" },
  { value: "custom", label: "Custom range" },
] as const

type AdminTimePreset = (typeof ADMIN_TIME_PRESET_OPTIONS)[number]["value"]

type AdminDateRangeFilterProps<TPreset extends string = AdminTimePreset> = {
  value: TPreset
  from?: string
  to?: string
  label?: string
  className?: string
  triggerClassName?: string
  allowedPresets?: readonly TPreset[]
  onPresetChange: (value: TPreset) => void
  onRangeChange: (range: { from: string; to: string }) => void
}

function parseDateValue(value?: string) {
  if (!value) return undefined
  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) return undefined
  const date = new Date(year, month - 1, day)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function formatDateValue(date?: Date) {
  return date ? format(date, "yyyy-MM-dd") : ""
}

function getPresetLabel(value: string) {
  return (
    ADMIN_TIME_PRESET_OPTIONS.find((option) => option.value === value)?.label ??
    "Date range"
  )
}

function getButtonLabel(value: string, range: DateRange | undefined) {
  if (value !== "custom" || !range?.from) {
    return getPresetLabel(value)
  }

  if (!range.to) {
    return format(range.from, "dd MMM yyyy")
  }

  return `${format(range.from, "dd MMM")} - ${format(range.to, "dd MMM")}`
}

function getDraftLabel(range: DateRange | undefined) {
  if (!range?.from) return "Select a start date, then an end date."
  if (!range.to) return `${format(range.from, "dd MMM yyyy")} - choose end date`
  return `${format(range.from, "dd MMM yyyy")} - ${format(range.to, "dd MMM yyyy")}`
}

export function AdminDateRangeFilter<TPreset extends string = AdminTimePreset>({
  value,
  from = "",
  to = "",
  label = "Date range",
  className,
  triggerClassName,
  allowedPresets,
  onPresetChange,
  onRangeChange,
}: AdminDateRangeFilterProps<TPreset>) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [draftRange, setDraftRange] = React.useState<DateRange | undefined>()
  const allowed = React.useMemo(
    () =>
      new Set(
        allowedPresets ??
          ADMIN_TIME_PRESET_OPTIONS.map((option) => option.value as TPreset)
      ),
    [allowedPresets]
  )
  const options = ADMIN_TIME_PRESET_OPTIONS.filter((option) =>
    allowed.has(option.value as TPreset)
  )
  const range = React.useMemo<DateRange | undefined>(() => {
    const fromDate = parseDateValue(from)
    const toDate = parseDateValue(to)
    return fromDate || toDate ? { from: fromDate, to: toDate } : undefined
  }, [from, to])
  const canApplyRange = Boolean(draftRange?.from && draftRange.to)

  React.useEffect(() => {
    if (!isOpen) {
      setDraftRange(range)
    }
  }, [isOpen, range])

  function handleOpenChange(nextOpen: boolean) {
    setIsOpen(nextOpen)
    if (nextOpen) {
      setDraftRange(range)
    }
  }

  function applyDraftRange() {
    if (!draftRange?.from || !draftRange.to) return
    onPresetChange("custom" as TPreset)
    onRangeChange({
      from: formatDateValue(draftRange.from),
      to: formatDateValue(draftRange.to),
    })
    setIsOpen(false)
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="sr-only">{label}</span>
      <Select
        value={value}
        onValueChange={(next) => {
          if (next === "custom") {
            setDraftRange(range)
            setIsOpen(true)
            return
          }
          onPresetChange(next as TPreset)
        }}
      >
        <SelectTrigger className={cn("w-full lg:w-40", triggerClassName)}>
          <SelectValue placeholder="Date range" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Popover open={isOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant={value === "custom" ? "default" : "outline"}
            className="justify-start lg:w-[220px]"
            disabled={!allowed.has("custom" as TPreset)}
          >
            <CalendarDays className="size-4" />
            {getButtonLabel(value, range)}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto overflow-hidden p-0" align="start">
          <Calendar
            mode="range"
            numberOfMonths={2}
            selected={draftRange}
            defaultMonth={draftRange?.from ?? range?.from}
            onSelect={setDraftRange}
          />
          <div className="flex flex-col gap-3 border-t bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {getDraftLabel(draftRange)}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!draftRange?.from && !draftRange?.to}
                onClick={() => setDraftRange(undefined)}
              >
                Clear
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!canApplyRange}
                onClick={applyDraftRange}
              >
                Apply range
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
