import * as React from "react"

import {
  endOfDay,
  endOfMonth,
  format,
  startOfDay,
  startOfMonth,
  subDays,
  subMilliseconds,
} from "date-fns"
import type { DateRange } from "react-day-picker"
import { CalendarDays, RotateCcw } from "lucide-react"

import { Calendar } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type OrderDateFilterPreset =
  | "today"
  | "yesterday"
  | "last7Days"
  | "last30Days"
  | "last90Days"
  | "thisMonth"
  | "lastMonth"
  | "lifetime"
  | "custom"

export type OrderDateFilterValue = {
  preset: OrderDateFilterPreset
  range: DateRange | undefined
}

export const defaultOrderDateFilter: OrderDateFilterValue = {
  preset: "today",
  range: undefined,
}

const presetLabels: Record<OrderDateFilterPreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last7Days: "Last 7 Days",
  last30Days: "Last 30 Days",
  last90Days: "Last 90 Days",
  thisMonth: "This Month",
  lastMonth: "Last Month",
  lifetime: "Lifetime",
  custom: "Custom Range",
}

export function buildOrderDateFilterQuery(value: OrderDateFilterValue) {
  return {
    preset: value.preset,
    from:
      value.preset === "custom" && value.range?.from
        ? format(value.range.from, "yyyy-MM-dd")
        : undefined,
    to:
      value.preset === "custom" && value.range?.to
        ? format(value.range.to, "yyyy-MM-dd")
        : undefined,
  }
}

export function getOrderDateFilterInterval(filter: OrderDateFilterValue) {
  const now = new Date()

  switch (filter.preset) {
    case "today":
      return { start: startOfDay(now), end: endOfDay(now) }
    case "yesterday": {
      const yesterday = subDays(now, 1)
      return { start: startOfDay(yesterday), end: endOfDay(yesterday) }
    }
    case "last7Days":
      return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) }
    case "last30Days":
      return { start: startOfDay(subDays(now, 29)), end: endOfDay(now) }
    case "last90Days":
      return { start: startOfDay(subDays(now, 89)), end: endOfDay(now) }
    case "lastMonth": {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      return {
        start: startOfMonth(lastMonth),
        end: endOfMonth(lastMonth),
      }
    }
    case "thisMonth":
      return {
        start: startOfMonth(now),
        end: endOfMonth(now),
      }
    case "lifetime":
      return { start: startOfDay(new Date(0)), end: endOfDay(now) }
    case "custom":
      return {
        start: startOfDay(filter.range?.from ?? now),
        end: endOfDay(filter.range?.to ?? filter.range?.from ?? now),
      }
    default:
      return { start: startOfDay(now), end: endOfDay(now) }
  }
}

export function getPreviousOrderDateFilterInterval(filter: OrderDateFilterValue) {
  const current = getOrderDateFilterInterval(filter)
  if (filter.preset === "lifetime") {
    return { start: new Date(0), end: new Date(0) }
  }
  const duration = current.end.getTime() - current.start.getTime()

  return {
    start: new Date(current.start.getTime() - duration - 1),
    end: subMilliseconds(current.start, 1),
  }
}

function getButtonLabel(value: OrderDateFilterValue) {
  if (value.preset !== "custom" || !value.range?.from) {
    return presetLabels[value.preset]
  }

  if (!value.range.to) {
    return format(value.range.from, "dd MMM yyyy")
  }

  return `${format(value.range.from, "dd MMM")} - ${format(
    value.range.to,
    "dd MMM"
  )}`
}

function getDraftLabel(range: DateRange | undefined) {
  if (!range?.from) return "Select a start date, then an end date."
  if (!range.to) return `${format(range.from, "dd MMM yyyy")} - choose end date`
  return `${format(range.from, "dd MMM yyyy")} - ${format(range.to, "dd MMM yyyy")}`
}

export function OrderDateFilter({
  value,
  onChange,
  onReset,
  resetDisabled = false,
}: {
  value: OrderDateFilterValue
  onChange: (value: OrderDateFilterValue) => void
  onReset?: () => void
  resetDisabled?: boolean
}) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [draftRange, setDraftRange] = React.useState<DateRange | undefined>(
    value.range
  )
  const canApplyRange = Boolean(draftRange?.from && draftRange.to)

  React.useEffect(() => {
    if (!isOpen) {
      setDraftRange(value.range)
    }
  }, [isOpen, value.range])

  function handleOpenChange(nextOpen: boolean) {
    setIsOpen(nextOpen)
    if (nextOpen) {
      setDraftRange(value.range)
    }
  }

  function applyDraftRange() {
    if (!draftRange?.from || !draftRange.to) return
    onChange({ preset: "custom", range: draftRange })
    setIsOpen(false)
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        value={value.preset}
        onValueChange={(nextValue) => {
          const preset = nextValue as OrderDateFilterPreset
          if (preset === "custom") {
            setDraftRange(value.range)
            setIsOpen(true)
            return
          }
          onChange({ preset, range: undefined })
        }}
      >
        <SelectTrigger className="w-full lg:w-40">
          <SelectValue placeholder="Date range" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="today">Today</SelectItem>
          <SelectItem value="yesterday">Yesterday</SelectItem>
          <SelectItem value="last7Days">Last 7 Days</SelectItem>
          <SelectItem value="last30Days">Last 30 Days</SelectItem>
          <SelectItem value="last90Days">Last 90 Days</SelectItem>
          <SelectItem value="thisMonth">This Month</SelectItem>
          <SelectItem value="lastMonth">Last Month</SelectItem>
          <SelectItem value="lifetime">Lifetime</SelectItem>
          <SelectItem value="custom">Custom Range</SelectItem>
        </SelectContent>
      </Select>

      <Popover open={isOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant={value.preset === "custom" ? "default" : "outline"}
            className="justify-start lg:w-[220px]"
          >
            <CalendarDays className="size-4" />
            {getButtonLabel(value)}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto overflow-hidden p-0" align="start">
          <Calendar
            mode="range"
            numberOfMonths={2}
            selected={draftRange}
            defaultMonth={draftRange?.from ?? value.range?.from}
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

      {onReset ? (
        <Button
          type="button"
          variant="outline"
          onClick={onReset}
          disabled={resetDisabled}
        >
          <RotateCcw className="size-4" />
          Reset
        </Button>
      ) : null}
    </div>
  )
}
