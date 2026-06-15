import * as React from "react"

import {
  Landmark,
  LoaderCircle,
  Smartphone,
  WalletCards,
  X,
} from "lucide-react"

import {
  type PayoutMethod,
  type PayoutMethodType,
} from "@/components/payouts/types"
import {
  formatBangladeshPhonePlaceholder,
  isValidBangladeshPhone,
  normalizeBangladeshPhone,
  sanitizeBangladeshPhoneInput,
} from "@/lib/phone"
import { Button } from "@/components/ui/button"
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

export function PayoutMethodDrawer({
  open,
  onOpenChange,
  method,
  onSave,
  showVerificationHint,
  isSaving = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  method: PayoutMethod
  onSave: (method: PayoutMethod) => boolean | void | Promise<boolean | void>
  showVerificationHint?: string
  isSaving?: boolean
}) {
  const [draft, setDraft] = React.useState<PayoutMethod>(method)
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    if (open) {
      setDraft(method)
      setErrors({})
    }
  }, [method, open])

  function updateField<K extends keyof PayoutMethod>(
    key: K,
    value: PayoutMethod[K]
  ) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    const nextErrors: Record<string, string> = {}
    const normalizedAccountNumber =
      draft.type === "bkash"
        ? normalizeBangladeshPhone(draft.accountNumber)
        : draft.accountNumber.trim()
    if (!draft.accountName.trim())
      nextErrors.accountName = "Account name is required."
    if (!normalizedAccountNumber) {
      nextErrors.accountNumber =
        draft.type === "bkash"
          ? "bKash number is required."
          : "Account number is required."
    } else if (
      draft.type === "bkash" &&
      !isValidBangladeshPhone(normalizedAccountNumber)
    ) {
      nextErrors.accountNumber = "Invalid phone number."
    }
    if (draft.type === "bank" && !draft.bankName?.trim())
      nextErrors.bankName = "Bank name is required."
    if (draft.type === "bank" && !draft.branchName?.trim())
      nextErrors.branchName = "Branch name is required."

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const shouldClose = await onSave({
      ...draft,
      accountName: draft.accountName.trim(),
      accountNumber: normalizedAccountNumber,
      bankName: draft.type === "bank" ? (draft.bankName?.trim() ?? "") : "",
      branchName: draft.type === "bank" ? (draft.branchName?.trim() ?? "") : "",
    })
    if (shouldClose !== false) {
      onOpenChange(false)
    }
  }

  const MethodIcon = draft.type === "bank" ? Landmark : Smartphone

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="flex h-full w-full max-w-none! flex-col overflow-hidden p-0 sm:max-w-2xl! md:max-w-3xl!"
      >
        <SheetHeader className="sticky top-0 z-10 border-b bg-popover px-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SheetTitle className="flex items-center gap-2">
                <WalletCards className="size-4 text-muted-foreground" />
                Update Payout Method
              </SheetTitle>
              <SheetDescription>
                Add or update where Foodbela will send your settlements.
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

        <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            <div className="space-y-6">
              <div className="rounded-2xl border bg-muted/20 p-4">
                <div className="flex items-center gap-3">
                  <div className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <MethodIcon className="size-5" />
                  </div>
                  <div>
                    <p className="font-medium">
                      {draft.type === "bank" ? "Bank Account" : "bKash Wallet"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Keep payout details accurate to avoid failed settlements.
                    </p>
                    {showVerificationHint ? (
                      <p className="mt-2 text-sm text-amber-700">
                        {showVerificationHint}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Method Type</label>
                  <Select
                    value={draft.type}
                    onValueChange={(value) =>
                      updateField("type", value as PayoutMethodType)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select method type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bkash">bKash</SelectItem>
                      <SelectItem value="bank">Bank Account</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Account Name</label>
                  <Input
                    value={draft.accountName}
                    onChange={(event) =>
                      updateField("accountName", event.target.value)
                    }
                    placeholder="Meet Point"
                  />
                  {errors.accountName ? (
                    <p className="text-sm text-destructive">
                      {errors.accountName}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {draft.type === "bank" ? "Account Number" : "bKash Number"}
                  </label>
                  <Input
                    value={draft.accountNumber}
                    onChange={(event) =>
                      updateField(
                        "accountNumber",
                        draft.type === "bkash"
                          ? sanitizeBangladeshPhoneInput(event.target.value)
                          : event.target.value
                      )
                    }
                    inputMode={draft.type === "bkash" ? "numeric" : undefined}
                    maxLength={draft.type === "bkash" ? 11 : undefined}
                    placeholder={
                      draft.type === "bank"
                        ? "0123456789012"
                        : formatBangladeshPhonePlaceholder()
                    }
                  />
                  {errors.accountNumber ? (
                    <p className="text-sm text-destructive">
                      {errors.accountNumber}
                    </p>
                  ) : null}
                </div>

                {draft.type === "bank" ? (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Bank Name</label>
                      <Input
                        value={draft.bankName ?? ""}
                        onChange={(event) =>
                          updateField("bankName", event.target.value)
                        }
                        placeholder="Eastern Bank PLC"
                      />
                      {errors.bankName ? (
                        <p className="text-sm text-destructive">
                          {errors.bankName}
                        </p>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Branch Name</label>
                      <Input
                        value={draft.branchName ?? ""}
                        onChange={(event) =>
                          updateField("branchName", event.target.value)
                        }
                        placeholder="Dhanmondi Branch"
                      />
                      {errors.branchName ? (
                        <p className="text-sm text-destructive">
                          {errors.branchName}
                        </p>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <div className="border-t bg-popover px-6 py-4">
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : null}
                {isSaving ? "Saving..." : "Save Method"}
              </Button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
