import * as React from "react"

import { Info, LoaderCircle, Plus, TicketPercent, X } from "lucide-react"

import {
  formatVoucherDiscount,
  getInitialVoucherFormState,
  getVoucherFormStateFromVoucher,
  type Voucher,
  type VoucherApplicability,
  type VoucherFormErrors,
  type VoucherFormState,
  type VoucherMode,
  type VoucherStatus,
  type VoucherType,
} from "@/components/promotions/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"

type VoucherSubmitPayload = {
  name: string
  code: string
  mode: VoucherMode
  type: VoucherType
  discountValue: number | null
  minimumOrderAmount: number
  maxTotalUses: number | null
  maxUsesPerUser: number
  allowRepeatUsage: boolean
  status: VoucherStatus
  applicability: VoucherApplicability
  categoryIds: string[]
  itemIds: string[]
  startsAt: string
  endsAt: string
}

function isDiscountValueHidden(type: VoucherType) {
  return type === "free-delivery"
}

function getLocalDateTimeValue(date = new Date()) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return offsetDate.toISOString().slice(0, 16)
}

function getOwnerCostMessage(form: VoucherFormState) {
  if (form.type === "free-delivery") {
    return "Free-delivery owner offers are no longer available. Use flat or percentage discounts for owner-funded promotions."
  }

  if (form.type === "percentage") {
    return "This is owner-funded. The percentage discount used by the customer will be deducted from your restaurant earning before payout."
  }

  return "This is owner-funded. The flat discount used by the customer will be deducted from your restaurant earning before payout."
}

function SelectionPill({
  checked,
  label,
  onCheckedChange,
}: {
  checked: boolean
  label: string
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <label
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
        checked
          ? "border-primary/40 bg-primary/5"
          : "border-border bg-background hover:bg-muted/40"
      }`}
    >
      <Checkbox checked={checked} onCheckedChange={(value) => onCheckedChange(!!value)} />
      <span className="font-medium">{label}</span>
    </label>
  )
}

export function PromotionEditDrawer({
  open,
  onOpenChange,
  voucher,
  existingCodes,
  categories,
  items,
  onSubmitVoucher,
  isSubmitting = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  voucher: Voucher | null
  existingCodes: string[]
  categories: { id: string; name: string }[]
  items: { id: string; name: string }[]
  onSubmitVoucher: (payload: VoucherSubmitPayload) => Promise<boolean | void> | boolean | void
  isSubmitting?: boolean
}) {
  const [form, setForm] = React.useState<VoucherFormState | null>(null)
  const [errors, setErrors] = React.useState<VoucherFormErrors>({})
  const nowMin = React.useMemo(() => getLocalDateTimeValue(), [])

  React.useEffect(() => {
    if (!open) {
      setForm(null)
      setErrors({})
      return
    }

    setForm(voucher ? getVoucherFormStateFromVoucher(voucher) : getInitialVoucherFormState())
    setErrors({})
  }, [open, voucher])

  function updateForm<K extends keyof VoucherFormState>(
    key: K,
    value: VoucherFormState[K]
  ) {
    setForm((current) => (current ? { ...current, [key]: value } : current))
  }

  function toggleSelection(
    key: "categoryIds" | "itemIds",
    id: string,
    checked: boolean
  ) {
    setForm((current) =>
      current
        ? {
            ...current,
            [key]: checked
              ? [...current[key], id]
              : current[key].filter((item) => item !== id),
          }
        : current
    )
  }

  function validate(currentForm: VoucherFormState) {
    const nextErrors: VoucherFormErrors = {}
    const normalizedCode = currentForm.code.trim().toUpperCase()
    const maxUsesPerUser = Number(currentForm.maxUsesPerUser || "0")
    const nowTime = new Date(nowMin).getTime()

    if (!currentForm.name.trim()) {
      nextErrors.name = "Voucher name is required."
    }

    if (!normalizedCode) {
      nextErrors.code = "Coupon code is required."
    } else if (existingCodes.includes(normalizedCode)) {
      nextErrors.code = "This coupon code already exists."
    }

    if (!isDiscountValueHidden(currentForm.type)) {
      if (!currentForm.discountValue.trim()) {
        nextErrors.discountValue = "Discount value is required."
      } else if (Number(currentForm.discountValue) <= 0) {
        nextErrors.discountValue = "Discount value must be greater than 0."
      } else if (
        currentForm.type === "percentage" &&
        Number(currentForm.discountValue) > 100
      ) {
        nextErrors.discountValue = "Percentage cannot exceed 100."
      }
    }

    if (
      currentForm.minimumOrderAmount.trim() &&
      Number(currentForm.minimumOrderAmount) < 0
    ) {
      nextErrors.minimumOrderAmount = "Minimum order amount cannot be negative."
    }

    if (!currentForm.maxUsesPerUser.trim() || maxUsesPerUser <= 0) {
      nextErrors.maxUsesPerUser = "Max uses per user must be at least 1."
    }

    if (!currentForm.allowRepeatUsage && maxUsesPerUser > 1) {
      nextErrors.maxUsesPerUser =
        "Set max uses per user to 1 when repeat usage is turned off."
    }

    if (
      currentForm.maxTotalUses.trim() &&
      Number(currentForm.maxTotalUses) < maxUsesPerUser
    ) {
      nextErrors.maxTotalUses =
        "Total uses cannot be less than max uses per user."
    }

    if (!currentForm.startsAt) {
      nextErrors.startsAt = "Start date is required."
    } else if (!voucher && new Date(currentForm.startsAt).getTime() < nowTime) {
      nextErrors.startsAt = "Start date cannot be in the past."
    }

    if (!currentForm.endsAt) {
      nextErrors.endsAt = "End date is required."
    } else if (!voucher && new Date(currentForm.endsAt).getTime() < nowTime) {
      nextErrors.endsAt = "End date cannot be in the past."
    }

    if (
      currentForm.startsAt &&
      currentForm.endsAt &&
      new Date(currentForm.startsAt).getTime() >=
        new Date(currentForm.endsAt).getTime()
    ) {
      nextErrors.endsAt = "End date must be after the start date."
    }

    if (
      currentForm.applicability === "categories" &&
      currentForm.categoryIds.length === 0
    ) {
      nextErrors.categoryIds = "Select at least one category."
    }

    if (
      currentForm.applicability === "items" &&
      currentForm.itemIds.length === 0
    ) {
      nextErrors.itemIds = "Select at least one item."
    }

    if (currentForm.type === "free-delivery") {
      nextErrors.type = "Owner free-delivery offers are disabled."
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!form) return
    if (!validate(form)) return

    const didSave = await onSubmitVoucher({
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      mode: "coupon",
      type: form.type,
      discountValue: isDiscountValueHidden(form.type)
        ? null
        : Number(form.discountValue),
      minimumOrderAmount: Number(form.minimumOrderAmount || "0"),
      maxTotalUses: form.maxTotalUses.trim() ? Number(form.maxTotalUses) : null,
      maxUsesPerUser: form.allowRepeatUsage ? Number(form.maxUsesPerUser) : 1,
      allowRepeatUsage: form.allowRepeatUsage,
      status: form.status,
      applicability: form.applicability,
      categoryIds: form.applicability === "categories" ? form.categoryIds : [],
      itemIds: form.applicability === "items" ? form.itemIds : [],
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: new Date(form.endsAt).toISOString(),
    })

    if (didSave !== false) {
      onOpenChange(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-3xl! md:max-w-4xl!"
      >
        <SheetHeader className="sticky top-0 z-10 border-b bg-popover px-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SheetTitle className="flex items-center gap-2">
                <TicketPercent className="size-4 text-muted-foreground" />
                {voucher ? "Edit Voucher" : "Add Voucher"}
              </SheetTitle>
              <SheetDescription>
                {voucher
                  ? "Update offer rules, limits, and applicability."
                  : "Create an auto-applied offer or a coupon-code-based offer."}
              </SheetDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
            >
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </Button>
          </div>
        </SheetHeader>

        {form ? (
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Voucher Name</label>
                  <Input
                    value={form.name}
                    onChange={(event) => updateForm("name", event.target.value)}
                  />
                  {errors.name ? (
                    <p className="text-sm text-destructive">{errors.name}</p>
                  ) : null}
                </div>
                {/* Owner offers are always coupon-code based — no auto/threshold
                    application type selector. */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Coupon Code</label>
                  <Input
                    value={form.code}
                    onChange={(event) =>
                      updateForm("code", event.target.value)
                    }
                  />
                  {errors.code ? (
                    <p className="text-sm text-destructive">{errors.code}</p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Offer Type</label>
                  <Select
                    value={form.type}
                    onValueChange={(value) =>
                      updateForm("type", value as VoucherType)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="flat">Flat Discount</SelectItem>
                      <SelectItem value="percentage">
                        Percentage Discount
                      </SelectItem>
                      {form.type === "free-delivery" ? (
                        <SelectItem value="free-delivery" disabled>
                          Free Delivery unavailable
                        </SelectItem>
                      ) : null}
                    </SelectContent>
                  </Select>
                  {errors.type ? (
                    <p className="text-sm text-destructive">{errors.type}</p>
                  ) : null}
                </div>
                {!isDiscountValueHidden(form.type) ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Discount Value
                    </label>
                    <Input
                      value={form.discountValue}
                      onChange={(event) =>
                        updateForm("discountValue", event.target.value)
                      }
                    />
                    {errors.discountValue ? (
                      <p className="text-sm text-destructive">
                        {errors.discountValue}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Minimum Order Amount
                  </label>
                  <Input
                    value={form.minimumOrderAmount}
                    onChange={(event) =>
                      updateForm("minimumOrderAmount", event.target.value)
                    }
                  />
                  {errors.minimumOrderAmount ? (
                    <p className="text-sm text-destructive">
                      {errors.minimumOrderAmount}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-950">
                <div className="flex items-start gap-3">
                  <Info className="mt-0.5 size-4 shrink-0" />
                  <div>
                    <p className="font-medium">This offer affects your payout</p>
                    <p className="mt-1 text-amber-900/80">
                      {getOwnerCostMessage(form)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 rounded-xl border p-4 md:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Max Total Uses</label>
                  <Input
                    value={form.maxTotalUses}
                    onChange={(event) =>
                      updateForm("maxTotalUses", event.target.value)
                    }
                  />
                  {errors.maxTotalUses ? (
                    <p className="text-sm text-destructive">
                      {errors.maxTotalUses}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Max Uses Per User
                  </label>
                  <Input
                    value={form.maxUsesPerUser}
                    onChange={(event) =>
                      updateForm("maxUsesPerUser", event.target.value)
                    }
                  />
                  {errors.maxUsesPerUser ? (
                    <p className="text-sm text-destructive">
                      {errors.maxUsesPerUser}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Repeat Usage</p>
                    <p className="text-xs text-muted-foreground">
                      Same user can claim multiple times
                    </p>
                  </div>
                  <Switch
                    checked={form.allowRepeatUsage}
                    onCheckedChange={(checked) =>
                      setForm((current) =>
                        current
                          ? {
                              ...current,
                              allowRepeatUsage: checked,
                              maxUsesPerUser: checked
                                ? current.maxUsesPerUser
                                : "1",
                            }
                          : current
                      )
                    }
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                  <Select
                    value={form.status}
                    onValueChange={(value) =>
                      updateForm("status", value as VoucherStatus)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Draft">Draft</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Starts At</label>
                  <Input
                    type="datetime-local"
                    value={form.startsAt}
                    min={voucher ? undefined : nowMin}
                    onChange={(event) =>
                      updateForm("startsAt", event.target.value)
                    }
                  />
                  {errors.startsAt ? (
                    <p className="text-sm text-destructive">
                      {errors.startsAt}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Ends At</label>
                  <Input
                    type="datetime-local"
                    value={form.endsAt}
                    min={voucher ? form.startsAt || undefined : form.startsAt || nowMin}
                    onChange={(event) =>
                      updateForm("endsAt", event.target.value)
                    }
                  />
                  {errors.endsAt ? (
                    <p className="text-sm text-destructive">{errors.endsAt}</p>
                  ) : null}
                </div>
              </div>

              <div className="space-y-4 rounded-xl border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Applicability</p>
                    <p className="text-xs text-muted-foreground">
                      Restrict this voucher to specific categories or items if
                      needed.
                    </p>
                  </div>
                  <Select
                    value={form.applicability}
                    onValueChange={(value) =>
                      updateForm("applicability", value as VoucherApplicability)
                    }
                  >
                    <SelectTrigger className="w-full sm:w-44">
                      <SelectValue placeholder="Select scope" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Menu</SelectItem>
                      <SelectItem value="categories">
                        Specific Categories
                      </SelectItem>
                      <SelectItem value="items">Specific Items</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {form.applicability === "categories" ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {categories.map((category) => {
                        const checked = form.categoryIds.includes(category.id)
                        return (
                          <SelectionPill
                            key={category.id}
                            checked={checked}
                            label={category.name}
                            onCheckedChange={(nextChecked) =>
                              toggleSelection("categoryIds", category.id, nextChecked)
                            }
                          />
                        )
                      })}
                    </div>
                    {errors.categoryIds ? (
                      <p className="text-sm text-destructive">
                        {errors.categoryIds}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {form.applicability === "items" ? (
                  <div className="space-y-3">
                    <div className="grid gap-2 md:grid-cols-2">
                      {items.map((item) => {
                        const checked = form.itemIds.includes(item.id)
                        return (
                          <SelectionPill
                            key={item.id}
                            checked={checked}
                            label={item.name}
                            onCheckedChange={(nextChecked) =>
                              toggleSelection("itemIds", item.id, nextChecked)
                            }
                          />
                        )
                      })}
                    </div>
                    {errors.itemIds ? (
                      <p className="text-sm text-destructive">
                        {errors.itemIds}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">Coupon code offer</Badge>
                  <Badge variant="outline">
                    {form.type === "free-delivery"
                      ? "Unavailable"
                      : formatVoucherDiscount({
                          type: form.type,
                          discountValue: form.discountValue
                            ? Number(form.discountValue)
                            : null,
                        })}
                  </Badge>
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                    Owner-funded cost
                  </Badge>
                </div>
              </div>
              </div>
            </div>
            <div className="border-t bg-popover px-6 py-4">
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  {isSubmitting
                    ? voucher
                      ? "Saving..."
                      : "Creating..."
                    : voucher
                      ? "Save Changes"
                      : "Create Voucher"}
                </Button>
              </div>
            </div>
          </form>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
