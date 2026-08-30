import * as React from "react"
import { Flame, ImagePlus, Plus, Trash2 } from "lucide-react"
import { Link } from "react-router-dom"
import { toast } from "sonner"

import { imageHint, validateImageFile } from "@/lib/image-upload"

import {
  createMenuItemSlug,
  getInitialMenuItemFormState,
  type AddOnSelectionType,
  type MenuItem,
  type MenuItemFormAddOnGroup,
  type MenuItemFormAddOnOption,
  type MenuItemFormState,
  type MenuItemFormVariant,
  type MenuItemStatus,
} from "@/components/menu/types"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

type SubmitPayload = {
  name: string
  slug: string
  imageUrl: string
  isPopular: boolean
  categoryId: string
  description: string
  status: MenuItemStatus
  hasVariants: boolean
  hasAddOns: boolean
  basePrice: number | null
  variants: { id: string; name: string; price: number; isDefault?: boolean }[]
  addOnGroups: {
    id: string
    name: string
    selectionType: AddOnSelectionType
    required: boolean
    options: { id: string; name: string; price: number; isDefault?: boolean }[]
  }[]
}

function getFormStateFromItem(item: MenuItem): MenuItemFormState {
  return {
    name: item.name,
    slug: item.slug,
    imageUrl: item.imageUrl,
    isPopular: item.isPopular,
    categoryId: item.categoryId,
    description: item.description,
    status: item.status,
    hasVariants: item.variants.length > 0,
    hasAddOns: item.addOnGroups.length > 0,
    basePrice: item.basePrice ? String(item.basePrice) : "",
    variants: item.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      price: String(variant.price),
      isDefault: variant.isDefault,
    })),
    addOnGroups: item.addOnGroups.map((group) => ({
      id: group.id,
      name: group.name,
      selectionType: group.selectionType,
      required: group.required,
      options: group.options.map((option) => ({
        id: option.id,
        name: option.name,
        price: String(option.price),
        isDefault: option.isDefault,
      })),
    })),
    recommendedItemIds: item.recommendedItemIds ?? [],
  }
}

export function MenuItemDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  item,
  categories,
  existingSlugs,
  onSubmitItem,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  submitLabel: string
  item?: MenuItem | null
  categories: ReadonlyArray<{ id: string; name: string }>
  existingSlugs: string[]
  onSubmitItem: (payload: SubmitPayload) => void
}) {
  const [form, setForm] = React.useState<MenuItemFormState>(getInitialMenuItemFormState)
  const [isSlugTouched, setIsSlugTouched] = React.useState(false)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const uploadedPreviewUrlRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      if (uploadedPreviewUrlRef.current) {
        URL.revokeObjectURL(uploadedPreviewUrlRef.current)
        uploadedPreviewUrlRef.current = null
      }
      setForm(getInitialMenuItemFormState())
      setIsSlugTouched(false)
      setErrors({})
      return
    }

    if (item) {
      setForm(getFormStateFromItem(item))
      setIsSlugTouched(true)
      setErrors({})
      return
    }

    setForm(getInitialMenuItemFormState())
    setIsSlugTouched(false)
    setErrors({})
  }, [item, open])

  function updateForm<K extends keyof MenuItemFormState>(key: K, value: MenuItemFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function handleNameChange(value: string) {
    setForm((current) => ({
      ...current,
      name: value,
      slug: isSlugTouched ? current.slug : createMenuItemSlug(value),
    }))
    setErrors((current) => ({ ...current, name: "", slug: "" }))
  }

  function handleSlugChange(value: string) {
    setIsSlugTouched(true)
    setForm((current) => ({ ...current, slug: createMenuItemSlug(value) }))
    setErrors((current) => ({ ...current, slug: "" }))
  }

  function addVariant() {
    setForm((current) => ({
      ...current,
      variants: [
        ...current.variants,
        {
          id: `variant-${Date.now()}-${current.variants.length}`,
          name: "",
          price: "",
          isDefault: current.variants.length === 0,
        },
      ],
    }))
  }

  function updateVariant(index: number, patch: Partial<MenuItemFormVariant>) {
    setForm((current) => ({
      ...current,
      variants: current.variants.map((variant, currentIndex) =>
        currentIndex === index ? { ...variant, ...patch } : variant
      ),
    }))
  }

  function removeVariant(index: number) {
    setForm((current) => ({
      ...current,
      variants: current.variants.filter((_, currentIndex) => currentIndex !== index),
    }))
  }

  function addGroup() {
    setForm((current) => ({
      ...current,
      addOnGroups: [
        ...current.addOnGroups,
        {
          id: `group-${Date.now()}-${current.addOnGroups.length}`,
          name: "",
          selectionType: "multiple",
          required: false,
          options: [],
        },
      ],
    }))
  }

  function updateGroup(index: number, patch: Partial<MenuItemFormAddOnGroup>) {
    setForm((current) => ({
      ...current,
      addOnGroups: current.addOnGroups.map((group, currentIndex) =>
        currentIndex === index ? { ...group, ...patch } : group
      ),
    }))
  }

  function removeGroup(index: number) {
    setForm((current) => ({
      ...current,
      addOnGroups: current.addOnGroups.filter((_, currentIndex) => currentIndex !== index),
    }))
  }

  function addOption(groupIndex: number) {
    setForm((current) => ({
      ...current,
      addOnGroups: current.addOnGroups.map((group, currentIndex) =>
        currentIndex === groupIndex
          ? {
              ...group,
              options: [
                ...group.options,
                {
                  id: `option-${Date.now()}-${group.options.length}`,
                  name: "",
                  price: "",
                  isDefault: false,
                },
              ],
            }
          : group
      ),
    }))
  }

  function updateOption(groupIndex: number, optionIndex: number, patch: Partial<MenuItemFormAddOnOption>) {
    setForm((current) => ({
      ...current,
      addOnGroups: current.addOnGroups.map((group, currentIndex) =>
        currentIndex === groupIndex
          ? {
              ...group,
              options: group.options.map((option, currentOptionIndex) =>
                currentOptionIndex === optionIndex ? { ...option, ...patch } : option
              ),
            }
          : group
      ),
    }))
  }

  function removeOption(groupIndex: number, optionIndex: number) {
    setForm((current) => ({
      ...current,
      addOnGroups: current.addOnGroups.map((group, currentIndex) =>
        currentIndex === groupIndex
          ? {
              ...group,
              options: group.options.filter((_, currentOptionIndex) => currentOptionIndex !== optionIndex),
            }
          : group
      ),
    }))
  }

  function validate() {
    const nextErrors: Record<string, string> = {}

    if (!form.name.trim()) nextErrors.name = "Item name is required."
    if (!form.slug.trim()) nextErrors.slug = "Slug is required."
    if (existingSlugs.includes(form.slug.trim())) {
      nextErrors.slug = "This slug already exists."
    }
    if (!form.categoryId) nextErrors.categoryId = "Category is required."
    if (!form.hasVariants && !form.basePrice.trim()) {
      nextErrors.basePrice = "Base price is required for simple items."
    }
    if (form.hasVariants && form.variants.length === 0) {
      nextErrors.variants = "Add at least one variant."
    }
    if (form.hasVariants) {
      form.variants.forEach((variant, index) => {
        if (!variant.name.trim()) {
          nextErrors[`variant-name-${index}`] = "Variant name is required."
        }
        if (!variant.price.trim()) {
          nextErrors[`variant-price-${index}`] = "Variant price is required."
        }
      })
    }
    if (form.hasAddOns) {
      if (form.addOnGroups.length === 0) {
        nextErrors.addOnGroups = "Add at least one add-on group."
      }
      form.addOnGroups.forEach((group, groupIndex) => {
        if (!group.name.trim()) {
          nextErrors[`group-${groupIndex}`] = "Group name is required."
        }
        if (group.options.length === 0) {
          nextErrors[`group-options-${groupIndex}`] = "Add at least one option."
        }
        group.options.forEach((option, optionIndex) => {
          if (!option.name.trim()) {
            nextErrors[`group-option-name-${groupIndex}-${optionIndex}`] =
              "Option name is required."
          }
          if (!option.price.trim()) {
            nextErrors[`group-option-price-${groupIndex}-${optionIndex}`] =
              "Option price is required."
          }
        })
      })
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (!validate()) return

    onSubmitItem({
      name: form.name.trim(),
      slug: form.slug.trim(),
      imageUrl: form.imageUrl.trim() || "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=160&q=80",
      isPopular: form.isPopular,
      categoryId: form.categoryId,
      description: form.description.trim(),
      status: form.status,
      hasVariants: form.hasVariants,
      hasAddOns: form.hasAddOns,
      basePrice: form.hasVariants ? null : Number(form.basePrice),
      variants: form.hasVariants
        ? form.variants
            .filter((variant) => variant.name.trim() && variant.price.trim())
            .map((variant, index) => ({
              id: variant.id,
              name: variant.name.trim(),
              price: Number(variant.price),
              isDefault: index === 0 ? true : variant.isDefault,
            }))
        : [],
      addOnGroups: form.hasAddOns
        ? form.addOnGroups
            .filter((group) => group.name.trim())
            .map((group) => ({
              id: group.id,
              name: group.name.trim(),
              selectionType: group.selectionType,
              required: group.required,
              options: group.options
                .filter((option) => option.name.trim())
                .map((option) => ({
                  id: option.id,
                  name: option.name.trim(),
                  price: Number(option.price || "0"),
                  isDefault: option.isDefault,
                })),
            }))
        : [],
    })

    onOpenChange(false)
  }

  function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) return

    const validation = validateImageFile(file)
    if (!validation.ok) {
      toast.error(validation.title, { description: validation.description })
      event.target.value = ""
      return
    }

    if (uploadedPreviewUrlRef.current) {
      URL.revokeObjectURL(uploadedPreviewUrlRef.current)
    }

    const previewUrl = URL.createObjectURL(file)
    uploadedPreviewUrlRef.current = previewUrl
    updateForm("imageUrl", previewUrl)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Item Name</label>
              <Input value={form.name} onChange={(event) => handleNameChange(event.target.value)} placeholder="e.g. Classic Chicken Burger" />
              {errors.name ? <p className="text-sm text-destructive">{errors.name}</p> : null}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Slug</label>
              <Input value={form.slug} onChange={(event) => handleSlugChange(event.target.value)} placeholder="classic-chicken-burger" />
              {errors.slug ? <p className="text-sm text-destructive">{errors.slug}</p> : null}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Category</label>
              {categories.length > 0 ? (
                <Select value={form.categoryId} onValueChange={(value) => updateForm("categoryId", value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
                  Make a category first.{" "}
                  <Link to="/categories" className="font-medium text-primary underline underline-offset-4">
                    Go to Categories
                  </Link>
                </div>
              )}
              {errors.categoryId ? <p className="text-sm text-destructive">{errors.categoryId}</p> : null}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={form.status} onValueChange={(value) => updateForm("status", value as MenuItemStatus)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Hidden">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Item Image</label>
              <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-3 md:flex-row md:items-center">
                <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-background">
                  {form.imageUrl ? (
                    <img src={form.imageUrl} alt="Menu preview" className="size-full object-cover" />
                  ) : (
                    <ImagePlus className="size-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 space-y-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                      <ImagePlus className="size-4" />
                      Upload Image
                    </Button>
                    {form.imageUrl ? (
                      <Button type="button" variant="ghost" onClick={() => updateForm("imageUrl", "")}>
                        Remove
                      </Button>
                    ) : null}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{imageHint("menu")}</p>
                  <Input value={form.imageUrl} onChange={(event) => updateForm("imageUrl", event.target.value)} placeholder="Or paste image URL" />
                </div>
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea value={form.description} onChange={(event) => updateForm("description", event.target.value)} placeholder="Short menu description" />
            </div>
            <div className="md:col-span-2">
              <label className="flex items-center gap-3 rounded-xl border bg-muted/20 px-4 py-3">
                <Checkbox
                  checked={form.isPopular}
                  onCheckedChange={(checked) => updateForm("isPopular", !!checked)}
                />
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <Flame className="size-4 text-orange-500" />
                    Mark as Popular
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Show this item as a highlighted popular choice
                  </p>
                </div>
              </label>
            </div>
          </div>

          <div className="grid gap-4 rounded-xl border p-4 md:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Has Variants</p>
                <p className="text-xs text-muted-foreground">Different sizes or options with separate prices</p>
              </div>
              <Switch checked={form.hasVariants} onCheckedChange={(checked) => updateForm("hasVariants", checked)} />
            </div>
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Has Add-ons</p>
                <p className="text-xs text-muted-foreground">Extras, drinks, sauces, and grouped choices</p>
              </div>
              <Switch checked={form.hasAddOns} onCheckedChange={(checked) => updateForm("hasAddOns", checked)} />
            </div>
          </div>

          {!form.hasVariants ? (
            <div className="space-y-2">
              <label className="text-sm font-medium">Base Price</label>
              <Input value={form.basePrice} onChange={(event) => updateForm("basePrice", event.target.value)} placeholder="220" inputMode="decimal" />
              {errors.basePrice ? <p className="text-sm text-destructive">{errors.basePrice}</p> : null}
            </div>
          ) : (
            <div className="space-y-4 rounded-xl border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Variants</p>
                  <p className="text-xs text-muted-foreground">Each variant can carry a different price.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addVariant}>
                  <Plus className="size-4" />
                  Add Variant
                </Button>
              </div>
              {form.variants.map((variant, index) => (
                <div key={variant.id} className="grid gap-3 rounded-lg border bg-muted/20 p-3 md:grid-cols-[1fr_160px_auto]">
                  <div className="space-y-2">
                    <Input value={variant.name} onChange={(event) => updateVariant(index, { name: event.target.value })} placeholder="Small" />
                    {errors[`variant-name-${index}`] ? (
                      <p className="text-sm text-destructive">{errors[`variant-name-${index}`]}</p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Input value={variant.price} onChange={(event) => updateVariant(index, { price: event.target.value })} placeholder="250" inputMode="decimal" />
                    {errors[`variant-price-${index}`] ? (
                      <p className="text-sm text-destructive">{errors[`variant-price-${index}`]}</p>
                    ) : null}
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeVariant(index)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              {errors.variants ? <p className="text-sm text-destructive">{errors.variants}</p> : null}
            </div>
          )}

          {form.hasAddOns ? (
            <div className="space-y-4 rounded-xl border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Add-on Groups</p>
                  <p className="text-xs text-muted-foreground">Create optional or required groups with priced options.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addGroup}>
                  <Plus className="size-4" />
                  Add Group
                </Button>
              </div>
              {errors.addOnGroups ? <p className="text-sm text-destructive">{errors.addOnGroups}</p> : null}
              {form.addOnGroups.map((group, groupIndex) => (
                <div key={group.id} className="space-y-3 rounded-lg border bg-muted/20 p-4">
                  <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
                    <Input value={group.name} onChange={(event) => updateGroup(groupIndex, { name: event.target.value })} placeholder="Extras" />
                    <Select value={group.selectionType} onValueChange={(value) => updateGroup(groupIndex, { selectionType: value as AddOnSelectionType })}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selection" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single">Single Select</SelectItem>
                        <SelectItem value="multiple">Multi Select</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeGroup(groupIndex)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">Required Group</p>
                      <p className="text-xs text-muted-foreground">Customers must choose from this group</p>
                    </div>
                    <Switch checked={group.required} onCheckedChange={(checked) => updateGroup(groupIndex, { required: checked })} />
                  </div>

                  <div className="space-y-3">
                    {group.options.map((option, optionIndex) => (
                      <div key={option.id} className="grid gap-3 md:grid-cols-[1fr_140px_auto]">
                        <div className="space-y-2">
                          <Input value={option.name} onChange={(event) => updateOption(groupIndex, optionIndex, { name: event.target.value })} placeholder="Extra Cheese" />
                          {errors[`group-option-name-${groupIndex}-${optionIndex}`] ? (
                            <p className="text-sm text-destructive">{errors[`group-option-name-${groupIndex}-${optionIndex}`]}</p>
                          ) : null}
                        </div>
                        <div className="space-y-2">
                          <Input value={option.price} onChange={(event) => updateOption(groupIndex, optionIndex, { price: event.target.value })} placeholder="40" inputMode="decimal" />
                          {errors[`group-option-price-${groupIndex}-${optionIndex}`] ? (
                            <p className="text-sm text-destructive">{errors[`group-option-price-${groupIndex}-${optionIndex}`]}</p>
                          ) : null}
                        </div>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeOption(groupIndex, optionIndex)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <Button type="button" variant="outline" size="sm" onClick={() => addOption(groupIndex)}>
                    <Plus className="size-4" />
                    Add Option
                  </Button>
                  {errors[`group-${groupIndex}`] ? <p className="text-sm text-destructive">{errors[`group-${groupIndex}`]}</p> : null}
                  {errors[`group-options-${groupIndex}`] ? <p className="text-sm text-destructive">{errors[`group-options-${groupIndex}`]}</p> : null}
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{submitLabel}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
