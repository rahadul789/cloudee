import * as React from "react"

import { Plus } from "lucide-react"

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"

export type VoucherSubmitPayload = {
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

export function PromotionFormDialog({
  open,
  onOpenChange,
  voucher,
  existingCodes,
  categories,
  items,
  onSubmitVoucher,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  voucher?: Voucher | null
  existingCodes: string[]
  categories: { id: string; name: string }[]
  items: { id: string; name: string }[]
  onSubmitVoucher: (payload: VoucherSubmitPayload) => void
}) {
  const [form, setForm] = React.useState<VoucherFormState>(
    getInitialVoucherFormState
  )
  const [errors, setErrors] = React.useState<VoucherFormErrors>({})
  const nowMin = React.useMemo(() => getLocalDateTimeValue(), [])

  React.useEffect(() => {
    if (!open) {
      setForm(getInitialVoucherFormState())
      setErrors({})
      return
    }

    if (voucher) {
      setForm(getVoucherFormStateFromVoucher(voucher))
      setErrors({})
      return
    }

    setForm(getInitialVoucherFormState())
    setErrors({})
  }, [open, voucher])

  function updateForm<K extends keyof VoucherFormState>(
    key: K,
    value: VoucherFormState[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function toggleSelection(
    key: "categoryIds" | "itemIds",
    id: string,
    checked: boolean
  ) {
    setForm((current) => ({
      ...current,
      [key]: checked
        ? [...current[key], id]
        : current[key].filter((item) => item !== id),
    }))
  }

  function validate() {
    const nextErrors: VoucherFormErrors = {}
    const normalizedCode = form.code.trim().toUpperCase()
    const maxUsesPerUser = Number(form.maxUsesPerUser || "0")
    const nowTime = new Date(nowMin).getTime()

    if (!form.name.trim()) {
      nextErrors.name = "Voucher name is required."
    }

    if (form.mode === "coupon") {
      if (!normalizedCode) {
        nextErrors.code = "Coupon code is required for coupon offers."
      } else if (existingCodes.includes(normalizedCode)) {
        nextErrors.code = "This coupon code already exists."
      }
    }

    if (!isDiscountValueHidden(form.type)) {
      if (!form.discountValue.trim()) {
        nextErrors.discountValue = "Discount value is required."
      } else if (Number(form.discountValue) <= 0) {
        nextErrors.discountValue = "Discount value must be greater than 0."
      } else if (
        form.type === "percentage" &&
        Number(form.discountValue) > 100
      ) {
        nextErrors.discountValue = "Percentage cannot exceed 100."
      }
    }

    if (!form.minimumOrderAmount.trim() && form.mode === "auto") {
      nextErrors.minimumOrderAmount =
        "Minimum order amount is required for auto-applied offers."
    } else if (
      form.minimumOrderAmount.trim() &&
      Number(form.minimumOrderAmount) < 0
    ) {
      nextErrors.minimumOrderAmount =
        "Minimum order amount cannot be negative."
    }

    if (!form.maxUsesPerUser.trim() || maxUsesPerUser <= 0) {
      nextErrors.maxUsesPerUser = "Max uses per user must be at least 1."
    }

    if (!form.allowRepeatUsage && maxUsesPerUser > 1) {
      nextErrors.maxUsesPerUser =
        "Set max uses per user to 1 when repeat usage is turned off."
    }

    if (
      form.maxTotalUses.trim() &&
      Number(form.maxTotalUses) < maxUsesPerUser
    ) {
      nextErrors.maxTotalUses =
        "Total uses cannot be less than max uses per user."
    }

    if (!form.startsAt) {
      nextErrors.startsAt = "Start date is required."
    } else if (new Date(form.startsAt).getTime() < nowTime) {
      nextErrors.startsAt = "Start date cannot be in the past."
    }

    if (!form.endsAt) {
      nextErrors.endsAt = "End date is required."
    } else if (new Date(form.endsAt).getTime() < nowTime) {
      nextErrors.endsAt = "End date cannot be in the past."
    }

    if (
      form.startsAt &&
      form.endsAt &&
      new Date(form.startsAt).getTime() >= new Date(form.endsAt).getTime()
    ) {
      nextErrors.endsAt = "End date must be after the start date."
    }

    if (form.applicability === "categories" && form.categoryIds.length === 0) {
      nextErrors.categoryIds = "Select at least one category."
    }

    if (form.applicability === "items" && form.itemIds.length === 0) {
      nextErrors.itemIds = "Select at least one item."
    }

    if (form.type === "free-delivery" && form.discountValue.trim()) {
      nextErrors.type = "Owner free-delivery offers are disabled."
    } else if (form.type === "free-delivery") {
      nextErrors.type = "Owner free-delivery offers are disabled."
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (!validate()) {
      return
    }

    onSubmitVoucher({
      name: form.name.trim(),
      code: form.mode === "coupon" ? form.code.trim().toUpperCase() : "",
      mode: form.mode,
      type: form.type,
      discountValue: isDiscountValueHidden(form.type)
        ? null
        : Number(form.discountValue),
      minimumOrderAmount: Number(form.minimumOrderAmount || "0"),
      maxTotalUses: form.maxTotalUses.trim()
        ? Number(form.maxTotalUses)
        : null,
      maxUsesPerUser: form.allowRepeatUsage ? Number(form.maxUsesPerUser) : 1,
      allowRepeatUsage: form.allowRepeatUsage,
      status: form.status,
      applicability: form.applicability,
      categoryIds: form.applicability === "categories" ? form.categoryIds : [],
      itemIds: form.applicability === "items" ? form.itemIds : [],
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: new Date(form.endsAt).toISOString(),
    })

    onOpenChange(false)
  }

  const dialogTitle = voucher ? "Edit Voucher" : "Create Voucher"
  const dialogDescription = voucher
    ? "Update offer rules, limits, and applicability."
    : "Create an auto-applied offer or a coupon-code-based offer."

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Voucher Name</label>
              <Input
                value={form.name}
                onChange={(event) => updateForm("name", event.target.value)}
                placeholder="e.g. Lunch Rush 80tk Off"
              />
              {errors.name ? (
                <p className="text-sm text-destructive">{errors.name}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Application Type</label>
              <Select
                value={form.mode}
                onValueChange={(value) =>
                  updateForm("mode", value as VoucherMode)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto-applied offer</SelectItem>
                  <SelectItem value="coupon">Coupon code offer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.mode === "coupon" ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">Coupon Code</label>
                <Input
                  value={form.code}
                  onChange={(event) => updateForm("code", event.target.value)}
                  placeholder="e.g. BKASH50"
                />
                {errors.code ? (
                  <p className="text-sm text-destructive">{errors.code}</p>
                ) : null}
              </div>
            ) : null}
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
                  <SelectItem value="percentage">Percentage Discount</SelectItem>
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
                <label className="text-sm font-medium">Discount Value</label>
                <Input
                  value={form.discountValue}
                  onChange={(event) =>
                    updateForm("discountValue", event.target.value)
                  }
                  placeholder={form.type === "percentage" ? "20" : "80"}
                />
                {errors.discountValue ? (
                  <p className="text-sm text-destructive">
                    {errors.discountValue}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="space-y-2">
              <label className="text-sm font-medium">Minimum Order Amount</label>
              <Input
                value={form.minimumOrderAmount}
                onChange={(event) =>
                  updateForm("minimumOrderAmount", event.target.value)
                }
                placeholder="399"
              />
              {errors.minimumOrderAmount ? (
                <p className="text-sm text-destructive">
                  {errors.minimumOrderAmount}
                </p>
              ) : null}
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
                placeholder="500"
              />
              {errors.maxTotalUses ? (
                <p className="text-sm text-destructive">
                  {errors.maxTotalUses}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Max Uses Per User</label>
              <Input
                value={form.maxUsesPerUser}
                onChange={(event) =>
                  updateForm("maxUsesPerUser", event.target.value)
                }
                placeholder="1"
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
                  setForm((current) => ({
                    ...current,
                    allowRepeatUsage: checked,
                    maxUsesPerUser: checked
                      ? current.maxUsesPerUser
                      : "1",
                  }))
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
                min={nowMin}
                onChange={(event) => updateForm("startsAt", event.target.value)}
              />
              {errors.startsAt ? (
                <p className="text-sm text-destructive">{errors.startsAt}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Ends At</label>
              <Input
                type="datetime-local"
                value={form.endsAt}
                min={form.startsAt || nowMin}
                onChange={(event) => updateForm("endsAt", event.target.value)}
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
                  <SelectItem value="categories">Specific Categories</SelectItem>
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
                      <label
                        key={category.id}
                        className="flex items-center gap-2 rounded-full border px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) =>
                            toggleSelection(
                              "categoryIds",
                              category.id,
                              event.target.checked
                            )
                          }
                        />
                        {category.name}
                      </label>
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
                      <label
                        key={item.id}
                        className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) =>
                            toggleSelection(
                              "itemIds",
                              item.id,
                              event.target.checked
                            )
                          }
                        />
                        {item.name}
                      </label>
                    )
                  })}
                </div>
                {errors.itemIds ? (
                  <p className="text-sm text-destructive">{errors.itemIds}</p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border bg-muted/20 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {form.mode === "auto"
                  ? "Auto-applied offer"
                  : "Coupon code offer"}
              </Badge>
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
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">
              <Plus className="size-4" />
              {voucher ? "Save Changes" : "Create Voucher"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
