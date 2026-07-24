import * as React from "react"

import { FolderOpen, LoaderCircle, X } from "lucide-react"

import {
  type Category,
  type CategoryStatus,
  createSlug,
  getInitialFormState,
  slugPattern,
} from "@/components/categories/types"
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
import { Textarea } from "@/components/ui/textarea"
import {
  DEFAULT_CATALOG_DESCRIPTION_LIMITS,
  clampCatalogDescription,
  getRemainingCatalogDescriptionChars,
} from "@/lib/catalog-description-limits"

type CategorySubmitPayload = {
  name: string
  slug: string
  status: CategoryStatus
  description: string
}

export function CategoryEditDrawer({
  open,
  onOpenChange,
  category,
  existingSlugs,
  descriptionMaxLength = DEFAULT_CATALOG_DESCRIPTION_LIMITS.category,
  onSubmitCategory,
  isSubmitting = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  category: Category | null
  existingSlugs: string[]
  descriptionMaxLength?: number
  onSubmitCategory: (payload: CategorySubmitPayload) => void
  isSubmitting?: boolean
}) {
  const [name, setName] = React.useState("")
  const [slug, setSlug] = React.useState("")
  const [status, setStatus] = React.useState<CategoryStatus>("Active")
  const [description, setDescription] = React.useState("")
  const [nameError, setNameError] = React.useState("")
  const [slugError, setSlugError] = React.useState("")
  const [isSlugTouched, setIsSlugTouched] = React.useState(false)

  React.useEffect(() => {
    if (!open) {
      const initial = getInitialFormState()
      setName(initial.name)
      setSlug(initial.slug)
      setStatus(initial.status)
      setDescription(initial.description)
      setNameError("")
      setSlugError("")
      setIsSlugTouched(false)
      return
    }

    if (category) {
      setName(category.name)
      setSlug(category.slug)
      setStatus(category.status)
      setDescription(
        clampCatalogDescription(
          category.description ?? "",
          descriptionMaxLength
        )
      )
      setNameError("")
      setSlugError("")
      setIsSlugTouched(false)
      return
    }

    const initial = getInitialFormState()
    setName(initial.name)
    setSlug(initial.slug)
    setStatus(initial.status)
    setDescription(initial.description)
    setNameError("")
    setSlugError("")
    setIsSlugTouched(false)
  }, [category, descriptionMaxLength, open])

  function validate(nextName: string, nextSlug: string) {
    let valid = true

    if (!nextName.trim()) {
      setNameError("Category name is required.")
      valid = false
    } else {
      setNameError("")
    }

    if (!nextSlug.trim()) {
      setSlugError("Slug is required.")
      valid = false
    } else if (!slugPattern.test(nextSlug)) {
      setSlugError("Use lowercase letters, numbers, and hyphens only.")
      valid = false
    } else if (existingSlugs.includes(nextSlug.trim())) {
      setSlugError("This slug already exists.")
      valid = false
    } else {
      setSlugError("")
    }

    return valid
  }

  function handleNameChange(value: string) {
    setName(value)
    setNameError("")

    if (!isSlugTouched) {
      const nextSlug = createSlug(value)
      setSlug(nextSlug)

      if (
        nextSlug &&
        slugPattern.test(nextSlug) &&
        !existingSlugs.includes(nextSlug)
      ) {
        setSlugError("")
      }
    }
  }

  function handleSlugChange(value: string) {
    const nextSlug = createSlug(value)
    setIsSlugTouched(true)
    setSlug(nextSlug)
    setSlugError("")
  }

  function handleDescriptionChange(value: string) {
    setDescription(
      clampCatalogDescription(value, descriptionMaxLength)
    )
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    const nextName = name.trim()
    const nextSlug = slug.trim()

    if (!validate(nextName, nextSlug)) return

    onSubmitCategory({
      name: nextName,
      slug: nextSlug,
      status,
      description: clampCatalogDescription(
        description.trim(),
        descriptionMaxLength
      ),
    })
    onOpenChange(false)
  }

  const isDisabled = !name.trim() || !slug.trim()

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
                <FolderOpen className="size-4 text-muted-foreground" />
                {category ? "Edit Category" : "Add Category"}
              </SheetTitle>
              <SheetDescription>
                {category
                  ? "Update this menu category."
                  : "Create a new menu category."}
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

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="category-name" className="text-sm font-medium">
                    Category Name
                  </label>
                  <Input
                    id="category-name"
                    autoFocus
                    placeholder="e.g. Burgers, Pizza, Drinks"
                    value={name}
                    onChange={(event) => handleNameChange(event.target.value)}
                    aria-invalid={!!nameError}
                  />
                  {nameError ? (
                    <p className="text-sm text-destructive">{nameError}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <label htmlFor="category-slug" className="text-sm font-medium">
                    Slug
                  </label>
                  <Input
                    id="category-slug"
                    placeholder="e.g. burgers"
                    value={slug}
                    onChange={(event) => handleSlugChange(event.target.value)}
                    aria-invalid={!!slugError}
                  />
                  {slugError ? (
                    <p className="text-sm text-destructive">{slugError}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      URL preview: /menu/{slug || "category-slug"}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="category-status" className="text-sm font-medium">
                    Status
                  </label>
                  <Select
                    value={status}
                    onValueChange={(value) => setStatus(value as CategoryStatus)}
                  >
                    <SelectTrigger id="category-status" className="w-full">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Hidden">Hidden</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label
                    htmlFor="category-description"
                    className="text-sm font-medium"
                  >
                    Description
                  </label>
                  <span className="text-xs text-muted-foreground">
                    {getRemainingCatalogDescriptionChars(
                      description,
                      descriptionMaxLength
                    )}{" "}
                    left
                  </span>
                </div>
                <Textarea
                  id="category-description"
                  placeholder="Short internal note"
                  value={description}
                  onChange={(event) =>
                    handleDescriptionChange(event.target.value)
                  }
                  maxLength={descriptionMaxLength}
                />
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
              <Button type="submit" disabled={isDisabled || isSubmitting}>
                {isSubmitting ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : null}
                {isSubmitting
                  ? category
                    ? "Saving..."
                    : "Creating..."
                  : category
                    ? "Save Changes"
                    : "Create Category"}
              </Button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
